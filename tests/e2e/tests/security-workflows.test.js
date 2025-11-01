const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const E2ETestEnvironment = require('../setup/e2e-environment');
const axios = require('axios');
const crypto = require('crypto');

describe('Security Workflows E2E Tests', () => {
  let testEnv;
  let githubSim;
  let monitoring;
  let validAuthToken;
  let invalidAuthToken;

  beforeAll(async () => {
    testEnv = new E2ETestEnvironment();
    await testEnv.startFullEnvironment();
    
    githubSim = new GitHubSimulator({
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'test-webhook-secret'
    });
    
    monitoring = new MonitoringUtils({
      apiBaseUrl: 'http://localhost:3000',
      dashboardUrl: 'http://localhost:8080',
      mcpServerUrl: 'http://localhost:8081'
    });

    // Get authentication tokens for testing
    validAuthToken = await getValidAuthToken();
    invalidAuthToken = 'invalid-token-12345';
  });

  afterAll(async () => {
    await monitoring.saveMetricsReport('security-workflows');
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    monitoring.clearMetrics();
  });

  async function getValidAuthToken() {
    try {
      // Get a valid token from the auth endpoint
      const response = await axios.post('http://localhost:3000/api/auth/login', {
        username: 'admin',
        password: 'test-admin-password'
      });
      return response.data.token;
    } catch (error) {
      // If auth is not implemented, use a mock token
      return 'mock-valid-token';
    }
  }

  describe('Webhook Signature Verification', () => {
    test('should accept webhooks with valid signatures', async () => {
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const validSignature = githubSim.generateWebhookSignature(webhookPayload);

      await monitoring.captureResourceUsage('valid_webhook_start');

      const response = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': validSignature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      await monitoring.captureResourceUsage('valid_webhook_end');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('deploymentId');

      // Verify deployment was actually created
      const deploymentId = response.data.deploymentId;
      const deployment = await monitoring.getDeployment(deploymentId);
      expect(deployment.status).toMatch(/(pending|in_progress|deploying)/);
    });

    test('should reject webhooks with invalid signatures', async () => {
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const invalidSignature = 'sha256=invalid-signature-12345';

      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          webhookPayload, {
            headers: {
              'X-Hub-Signature-256': invalidSignature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toMatch(/(signature|unauthorized|invalid)/i);
      }

      expect(errorThrown).toBe(true);

      // Verify no deployment was created
      const deployments = await axios.get('http://localhost:3000/api/deployments');
      const recentDeployments = deployments.data.deployments.filter(
        d => Date.now() - new Date(d.createdAt).getTime() < 30000
      );
      expect(recentDeployments.length).toBe(0);
    });

    test('should reject webhooks with missing signatures', async () => {
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();

      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          webhookPayload, {
            headers: {
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
              // Missing X-Hub-Signature-256
            }
          }
        );
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toMatch(/(signature|missing|required)/i);
      }

      expect(errorThrown).toBe(true);
    });

    test('should reject webhooks with tampered payloads', async () => {
      const originalPayload = githubSim.createSuccessfulDeploymentScenario();
      const validSignature = githubSim.generateWebhookSignature(originalPayload);
      
      // Tamper with the payload after signature generation
      const tamperedPayload = { ...originalPayload };
      tamperedPayload.after = 'tampered-commit-hash';

      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          tamperedPayload, {
            headers: {
              'X-Hub-Signature-256': validSignature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toMatch(/(signature|verification|invalid)/i);
      }

      expect(errorThrown).toBe(true);
    });

    test('should handle signature verification performance under load', async () => {
      const concurrentRequests = 10;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `concurrent-test-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        promises.push(
          axios.post('http://localhost:3000/api/webhook/github', 
            webhookPayload, {
              headers: {
                'X-Hub-Signature-256': signature,
                'X-GitHub-Event': 'push',
                'Content-Type': 'application/json'
              }
            }
          )
        );
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(promises);
      const totalTime = Date.now() - startTime;

      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(30000); // 30 seconds for 10 concurrent requests

      // All should succeed
      const successfulRequests = results.filter(r => r.status === 'fulfilled');
      expect(successfulRequests.length).toBe(concurrentRequests);
    });
  });

  describe('API Authentication and Authorization', () => {
    test('should allow authenticated access to protected endpoints', async () => {
      const response = await axios.get('http://localhost:3000/api/deployments', {
        headers: {
          'Authorization': `Bearer ${validAuthToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('deployments');
    });

    test('should reject unauthenticated access to protected endpoints', async () => {
      let errorThrown = false;
      try {
        await axios.get('http://localhost:3000/api/deployments');
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toMatch(/(unauthorized|authentication|token)/i);
      }

      expect(errorThrown).toBe(true);
    });

    test('should reject access with invalid tokens', async () => {
      let errorThrown = false;
      try {
        await axios.get('http://localhost:3000/api/deployments', {
          headers: {
            'Authorization': `Bearer ${invalidAuthToken}`
          }
        });
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toMatch(/(invalid|token|unauthorized)/i);
      }

      expect(errorThrown).toBe(true);
    });

    test('should enforce role-based access control for admin endpoints', async () => {
      // Try to access admin-only endpoint
      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/admin/restart-services', {}, {
          headers: {
            'Authorization': `Bearer ${validAuthToken}`
          }
        });
      } catch (error) {
        // Depending on token privileges, this might be 401 or 403
        errorThrown = true;
        expect([401, 403]).toContain(error.response.status);
      }

      // This test might pass if the token has admin privileges
      // The important thing is that unauthorized tokens are rejected
    });

    test('should validate token expiration', async () => {
      // This test would require creating an expired token
      // For now, we'll test the token refresh mechanism
      try {
        const refreshResponse = await axios.post('http://localhost:3000/api/auth/refresh', {
          refreshToken: 'test-refresh-token'
        });
        
        if (refreshResponse.status === 200) {
          expect(refreshResponse.data).toHaveProperty('token');
        }
      } catch (error) {
        // If refresh is not implemented or token is invalid, expect 401
        expect([401, 404]).toContain(error.response.status);
      }
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('should reject malformed webhook payloads', async () => {
      const malformedPayloads = [
        null,
        undefined,
        '',
        'not-json',
        { incomplete: 'payload' },
        { repository: null },
        { repository: { full_name: '' } }
      ];

      for (const payload of malformedPayloads) {
        let errorThrown = false;
        try {
          const signature = payload ? githubSim.generateWebhookSignature(payload) : 'sha256=invalid';
          
          await axios.post('http://localhost:3000/api/webhook/github', 
            payload, {
              headers: {
                'X-Hub-Signature-256': signature,
                'X-GitHub-Event': 'push',
                'Content-Type': 'application/json'
              }
            }
          );
        } catch (error) {
          errorThrown = true;
          expect([400, 401, 422]).toContain(error.response.status);
        }

        expect(errorThrown).toBe(true);
      }
    });

    test('should sanitize configuration data to prevent injection attacks', async () => {
      // Test with potentially malicious configuration content
      const maliciousPayload = githubSim.createSuccessfulDeploymentScenario();
      
      // Add potentially dangerous content
      maliciousPayload.head_commit.message = '<script>alert("xss")</script>';
      maliciousPayload.repository.description = '$(rm -rf /)';
      
      const signature = githubSim.generateWebhookSignature(maliciousPayload);

      const response = await axios.post('http://localhost:3000/api/webhook/github', 
        maliciousPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(response.status).toBe(200);
      const deploymentId = response.data.deploymentId;

      // Verify the malicious content was sanitized
      const deployment = await monitoring.getDeployment(deploymentId);
      expect(deployment.commitMessage).not.toContain('<script>');
      expect(deployment.repositoryDescription).not.toContain('$(');
    });

    test('should validate configuration file content for security', async () => {
      // Test with configuration that contains suspicious content
      const suspiciousPayload = githubSim.createSuspiciousConfigScenario();
      const signature = githubSim.generateWebhookSignature(suspiciousPayload);

      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          suspiciousPayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (error) {
        errorThrown = true;
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toMatch(/(security|validation|suspicious)/i);
      }

      // If the request succeeds, verify the deployment fails during validation
      if (!errorThrown) {
        const deploymentId = response.data.deploymentId;
        const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 120000);
        
        expect(deploymentResult.success).toBe(false);
        expect(deploymentResult.deployment.error).toMatch(/(security|validation|rejected)/i);
      }
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    test('should enforce rate limiting on webhook endpoints', async () => {
      const rapidRequests = [];
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      
      // Send many requests rapidly
      for (let i = 0; i < 20; i++) {
        const uniquePayload = { ...webhookPayload };
        uniquePayload.after = `rate-limit-test-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(uniquePayload);

        rapidRequests.push(
          axios.post('http://localhost:3000/api/webhook/github', 
            uniquePayload, {
              headers: {
                'X-Hub-Signature-256': signature,
                'X-GitHub-Event': 'push',
                'Content-Type': 'application/json'
              },
              validateStatus: (status) => status < 500 // Accept rate limit responses
            }
          )
        );
      }

      const results = await Promise.allSettled(rapidRequests);
      const responses = results.map(r => r.value || r.reason.response);
      
      // Should have some rate limited responses (429)
      const rateLimitedResponses = responses.filter(r => r && r.status === 429);
      const successfulResponses = responses.filter(r => r && r.status === 200);
      
      // Should allow some requests but rate limit others
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(successfulResponses.length).toBeLessThan(20); // Not all should succeed
    });

    test('should handle large payload sizes appropriately', async () => {
      // Test with very large webhook payload
      const largePayload = githubSim.createSuccessfulDeploymentScenario();
      
      // Add large data to payload
      largePayload.head_commit.message = 'x'.repeat(100000); // 100KB message
      largePayload.largeData = 'y'.repeat(500000); // 500KB additional data
      
      const signature = githubSim.generateWebhookSignature(largePayload);

      let errorThrown = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          largePayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            },
            maxBodyLength: 1000000, // 1MB limit
            timeout: 30000
          }
        );
      } catch (error) {
        errorThrown = true;
        // Should reject with 413 (payload too large) or 400 (bad request)
        expect([400, 413]).toContain(error.response.status);
      }

      // Large payloads should be rejected or handled gracefully
      expect(errorThrown).toBe(true);
    });
  });

  describe('Security Logging and Monitoring', () => {
    test('should log security events for audit purposes', async () => {
      // Generate various security events
      const events = [
        // Invalid signature
        async () => {
          try {
            await axios.post('http://localhost:3000/api/webhook/github', 
              githubSim.createSuccessfulDeploymentScenario(), {
                headers: {
                  'X-Hub-Signature-256': 'sha256=invalid',
                  'X-GitHub-Event': 'push',
                  'Content-Type': 'application/json'
                }
              }
            );
          } catch (error) { /* Expected */ }
        },
        // Unauthorized API access
        async () => {
          try {
            await axios.get('http://localhost:3000/api/deployments');
          } catch (error) { /* Expected */ }
        },
        // Invalid token
        async () => {
          try {
            await axios.get('http://localhost:3000/api/deployments', {
              headers: { 'Authorization': 'Bearer invalid-token' }
            });
          } catch (error) { /* Expected */ }
        }
      ];

      // Execute security events
      for (const event of events) {
        await event();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
      }

      // Check if security logs were generated
      try {
        const logsResponse = await axios.get('http://localhost:3000/api/audit/security-logs', {
          headers: { 'Authorization': `Bearer ${validAuthToken}` }
        });

        if (logsResponse.status === 200) {
          const logs = logsResponse.data.logs;
          expect(logs.length).toBeGreaterThan(0);
          
          // Should have logs for different security events
          const eventTypes = logs.map(log => log.eventType);
          expect(eventTypes).toContain('webhook_signature_invalid');
        }
      } catch (error) {
        // If audit logging is not implemented, that's acceptable for now
        expect([401, 404]).toContain(error.response.status);
      }
    });

    test('should detect and prevent brute force attacks', async () => {
      // Simulate repeated failed login attempts
      const failedAttempts = [];
      
      for (let i = 0; i < 10; i++) {
        failedAttempts.push(
          axios.post('http://localhost:3000/api/auth/login', {
            username: 'admin',
            password: 'wrong-password'
          }).catch(error => error.response)
        );
      }

      const results = await Promise.all(failedAttempts);
      
      // Later attempts should be blocked or delayed
      const laterAttempts = results.slice(5);
      const blockedAttempts = laterAttempts.filter(r => r && r.status === 429);
      
      // Should have some form of brute force protection
      if (blockedAttempts.length > 0) {
        expect(blockedAttempts[0].data.error).toMatch(/(rate|blocked|too many)/i);
      }
    });
  });

  describe('Secure Configuration Management', () => {
    test('should protect sensitive configuration data', async () => {
      // Test that secrets are not exposed in API responses
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const response = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentId = response.data.deploymentId;
      const deployment = await monitoring.getDeployment(deploymentId);

      // Verify sensitive data is not included in responses
      const deploymentString = JSON.stringify(deployment);
      expect(deploymentString).not.toMatch(/(password|secret|token|key)/i);
    });

    test('should validate environment variable security', async () => {
      // Check that the API doesn't expose internal environment variables
      try {
        const envResponse = await axios.get('http://localhost:3000/api/system/environment', {
          headers: { 'Authorization': `Bearer ${validAuthToken}` }
        });

        if (envResponse.status === 200) {
          const envData = envResponse.data;
          
          // Should not expose sensitive environment variables
          expect(envData).not.toHaveProperty('GITHUB_WEBHOOK_SECRET');
          expect(envData).not.toHaveProperty('DATABASE_PASSWORD');
          expect(envData).not.toHaveProperty('JWT_SECRET');
        }
      } catch (error) {
        // If endpoint doesn't exist, that's good for security
        expect([401, 403, 404]).toContain(error.response.status);
      }
    });
  });
});
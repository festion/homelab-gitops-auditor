const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const E2ETestEnvironment = require('../setup/e2e-environment');
const axios = require('axios');
const crypto = require('crypto');

describe('Complete Deployment Workflow E2E Tests', () => {
  let testEnv;
  let githubSim;
  let monitoring;
  let deploymentId;

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

    // Capture initial resource baseline
    await monitoring.captureResourceUsage('test_start');
  });

  afterAll(async () => {
    // Capture final resource usage
    await monitoring.captureResourceUsage('test_end');
    
    // Save comprehensive metrics report
    await monitoring.saveMetricsReport('complete-deployment-workflow');
    
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    monitoring.clearMetrics();
  });

  describe('Successful Deployment Workflow', () => {
    test('should complete full deployment from GitHub webhook to service restart', async () => {
      // Step 1: Generate realistic webhook payload
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      // Step 2: Send webhook to trigger deployment
      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.data).toHaveProperty('deploymentId');
      deploymentId = webhookResponse.data.deploymentId;

      // Step 3: Monitor deployment progress with performance tracking
      await monitoring.captureResourceUsage('deployment_start');
      
      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 300000);
      
      await monitoring.captureResourceUsage('deployment_end');

      // Step 4: Validate deployment completed successfully
      expect(deploymentResult).toCompleteDeploymentSuccessfully();
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.status).toBe('completed');

      // Step 5: Verify deployment artifacts and side effects
      const artifacts = await monitoring.validateDeploymentArtifacts(deploymentId);
      expect(artifacts.configUpdated).toBe(true);
      expect(artifacts.servicesRestarted).toBe(true);
      expect(artifacts.healthChecksPass).toBe(true);
      expect(artifacts.logsGenerated).toBe(true);

      // Step 6: Validate Home Assistant configuration was updated
      const haResponse = await axios.get('http://localhost:8123/api/config');
      expect(haResponse.status).toBe(200);
      
      // Verify the configuration hash matches expected commit
      const configCheck = await axios.get(`http://localhost:3000/api/deployments/${deploymentId}/config-status`);
      expect(configCheck.data.configHash).toBe(webhookPayload.after);

      // Step 7: Performance and reliability validations
      const performanceMetrics = monitoring.getMetricsSummary();
      expect(performanceMetrics).toMeetPerformanceRequirements({
        maxDeploymentTime: 180000, // 3 minutes
        maxMemoryIncrease: 100 * 1024 * 1024, // 100MB
        minSuccessRate: 0.95
      });

      // Step 8: Verify MCP server integration worked correctly
      const mcpResponse = await axios.get('http://localhost:8081/api/health');
      expect(mcpResponse.status).toBe(200);
      
      const mcpConfigStatus = await axios.get(`http://localhost:8081/api/config-sync-status/${deploymentId}`);
      expect(mcpConfigStatus.data.synced).toBe(true);
    });

    test('should handle concurrent webhook deliveries correctly', async () => {
      // Simulate GitHub sending duplicate/concurrent webhooks
      const webhookPayload1 = githubSim.createSuccessfulDeploymentScenario();
      const webhookPayload2 = { ...webhookPayload1 };
      
      const signature1 = githubSim.generateWebhookSignature(webhookPayload1);
      const signature2 = githubSim.generateWebhookSignature(webhookPayload2);

      // Send webhooks concurrently
      const [response1, response2] = await Promise.allSettled([
        axios.post('http://localhost:3000/api/webhook/github', webhookPayload1, {
          headers: {
            'X-Hub-Signature-256': signature1,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }),
        axios.post('http://localhost:3000/api/webhook/github', webhookPayload2, {
          headers: {
            'X-Hub-Signature-256': signature2,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        })
      ]);

      // One should succeed, other should be detected as duplicate
      expect(response1.status).toBe('fulfilled');
      expect(response2.status).toBe('fulfilled');
      
      const deployment1Id = response1.value.data.deploymentId;
      const deployment2Response = response2.value.data;
      
      // Either second request creates new deployment or returns existing one
      expect(deployment2Response).toHaveProperty('deploymentId');
      
      // Wait for deployments to complete
      const [result1, result2] = await Promise.allSettled([
        monitoring.pollDeploymentStatus(deployment1Id, 300000),
        deployment2Response.deploymentId !== deployment1Id ? 
          monitoring.pollDeploymentStatus(deployment2Response.deploymentId, 300000) :
          Promise.resolve({ success: true, deployment: { status: 'duplicate' } })
      ]);

      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');
      
      // At least one deployment should complete successfully
      const successfulResults = [result1.value, result2.value].filter(r => r.success);
      expect(successfulResults.length).toBeGreaterThanOrEqual(1);
    });

    test('should maintain performance under typical load', async () => {
      const iterations = 3;
      const deploymentIds = [];
      
      // Create multiple sequential deployments to test consistency
      for (let i = 0; i < iterations; i++) {
        await monitoring.captureResourceUsage(`iteration_${i}_start`);
        
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        // Make each deployment unique
        webhookPayload.after = crypto.randomBytes(20).toString('hex');
        
        const signature = githubSim.generateWebhookSignature(webhookPayload);
        
        const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
          webhookPayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );
        
        expect(webhookResponse.status).toBe(200);
        const currentDeploymentId = webhookResponse.data.deploymentId;
        deploymentIds.push(currentDeploymentId);
        
        const deploymentResult = await monitoring.pollDeploymentStatus(currentDeploymentId, 300000);
        expect(deploymentResult.success).toBe(true);
        
        await monitoring.captureResourceUsage(`iteration_${i}_end`);
        
        // Brief pause between deployments
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Validate all deployments completed successfully
      for (const id of deploymentIds) {
        const deployment = await monitoring.getDeployment(id);
        expect(deployment.status).toBe('completed');
      }
      
      // Validate performance consistency across iterations
      const performanceMetrics = monitoring.getMetricsSummary();
      expect(performanceMetrics.performance.api_response_time).toBeDefined();
      expect(performanceMetrics.performance.api_response_time.successRate).toBeGreaterThanOrEqual(0.95);
      
      // Ensure memory usage doesn't grow excessively
      const resourceMetrics = performanceMetrics.resources;
      const startMemory = resourceMetrics.iteration_0_start?.avgMemoryUsage || 0;
      const endMemory = resourceMetrics[`iteration_${iterations-1}_end`]?.avgMemoryUsage || 0;
      const memoryGrowth = endMemory - startMemory;
      
      expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth
    });
  });

  describe('Configuration Validation Workflow', () => {
    test('should validate configuration syntax before deployment', async () => {
      // Create webhook with invalid YAML configuration
      const webhookPayload = githubSim.createInvalidConfigScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(webhookResponse.status).toBe(200);
      deploymentId = webhookResponse.data.deploymentId;

      // Monitor deployment - should fail during validation phase
      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 120000);
      
      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.deployment.status).toBe('failed');
      expect(deploymentResult.deployment.error).toContain('configuration validation failed');

      // Verify no services were restarted due to validation failure
      const artifacts = await monitoring.validateDeploymentArtifacts(deploymentId);
      expect(artifacts.configUpdated).toBe(false);
      expect(artifacts.servicesRestarted).toBe(false);
    });

    test('should handle large configuration files efficiently', async () => {
      // Create webhook with large configuration scenario
      const webhookPayload = githubSim.createLargeConfigScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      await monitoring.captureResourceUsage('large_config_start');

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(webhookResponse.status).toBe(200);
      deploymentId = webhookResponse.data.deploymentId;

      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 420000); // 7 minutes for large config
      
      await monitoring.captureResourceUsage('large_config_end');

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.status).toBe('completed');

      // Validate performance with large configuration
      const performanceMetrics = monitoring.getMetricsSummary();
      expect(performanceMetrics).toMeetPerformanceRequirements({
        maxDeploymentTime: 400000, // 6.67 minutes for large configs
        maxMemoryIncrease: 500 * 1024 * 1024, // 500MB for large configs
        minSuccessRate: 0.95
      });
    });
  });

  describe('Service Integration Validation', () => {
    test('should verify all integrated services respond correctly after deployment', async () => {
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      deploymentId = webhookResponse.data.deploymentId;
      await monitoring.pollDeploymentStatus(deploymentId, 300000);

      // Test all service integrations
      const serviceChecks = await Promise.allSettled([
        monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 60000),
        monitoring.waitForServiceHealth('api', 'http://localhost:3000', '/api/health', 30000),
        monitoring.waitForServiceHealth('dashboard', 'http://localhost:8080', '/health', 30000),
        monitoring.waitForServiceHealth('mcp-server', 'http://localhost:8081', '/api/health', 30000)
      ]);

      // All services should be healthy
      serviceChecks.forEach((check, index) => {
        expect(check.status).toBe('fulfilled');
        expect(check.value.healthy).toBe(true);
      });

      // Verify service-to-service communication
      const configSyncResponse = await axios.get(`http://localhost:3000/api/mcp/sync-status/${deploymentId}`);
      expect(configSyncResponse.data.mcpServerResponding).toBe(true);
      
      const haIntegrationResponse = await axios.get(`http://localhost:3000/api/homeassistant/connection-status`);
      expect(haIntegrationResponse.data.connected).toBe(true);
    });
  });
});
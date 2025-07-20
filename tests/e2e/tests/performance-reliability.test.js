const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const E2ETestEnvironment = require('../setup/e2e-environment');
const axios = require('axios');
const crypto = require('crypto');

describe('Performance and Reliability E2E Tests', () => {
  let testEnv;
  let githubSim;
  let monitoring;

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
  });

  afterAll(async () => {
    await monitoring.saveMetricsReport('performance-reliability');
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    monitoring.clearMetrics();
  });

  describe('Performance Benchmarks', () => {
    test('should handle webhook processing within performance thresholds', async () => {
      const iterations = 10;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        await monitoring.captureResourceUsage(`webhook_perf_${i}_start`);
        
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `perf-test-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        const startTime = Date.now();
        
        const response = await axios.post('http://localhost:3000/api/webhook/github', 
          webhookPayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );

        const webhookResponseTime = Date.now() - startTime;
        expect(response.status).toBe(200);

        const deploymentId = response.data.deploymentId;
        const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 300000);
        const totalTime = Date.now() - startTime;

        await monitoring.captureResourceUsage(`webhook_perf_${i}_end`);

        results.push({
          iteration: i,
          webhookResponseTime,
          totalDeploymentTime: totalTime,
          success: deploymentResult.success
        });

        // Brief pause between iterations
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Analyze performance metrics
      const avgWebhookTime = results.reduce((sum, r) => sum + r.webhookResponseTime, 0) / results.length;
      const avgDeploymentTime = results.reduce((sum, r) => sum + r.totalDeploymentTime, 0) / results.length;
      const successRate = results.filter(r => r.success).length / results.length;

      // Performance assertions
      expect(avgWebhookTime).toBeLessThan(5000); // 5 seconds average webhook response
      expect(avgDeploymentTime).toBeLessThan(180000); // 3 minutes average deployment
      expect(successRate).toBeGreaterThanOrEqual(0.9); // 90% success rate

      // Check for performance consistency (standard deviation)
      const webhookTimes = results.map(r => r.webhookResponseTime);
      const mean = avgWebhookTime;
      const variance = webhookTimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / webhookTimes.length;
      const stdDev = Math.sqrt(variance);
      
      expect(stdDev).toBeLessThan(mean * 0.5); // Standard deviation should be less than 50% of mean
    });

    test('should maintain performance under concurrent load', async () => {
      const concurrentRequests = 15;
      const promises = [];

      await monitoring.captureResourceUsage('concurrent_load_start');

      const startTime = Date.now();

      // Create concurrent webhook requests
      for (let i = 0; i < concurrentRequests; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `concurrent-${i}-${Date.now()}`;
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

      const webhookResults = await Promise.allSettled(promises);
      const webhookEndTime = Date.now();

      await monitoring.captureResourceUsage('concurrent_load_webhooks_complete');

      // Verify all webhooks were accepted
      const successfulWebhooks = webhookResults.filter(r => r.status === 'fulfilled');
      expect(successfulWebhooks.length).toBeGreaterThanOrEqual(concurrentRequests * 0.8); // 80% success rate

      // Wait for all deployments to complete
      const deploymentIds = successfulWebhooks.map(r => r.value.data.deploymentId);
      const deploymentPromises = deploymentIds.map(id => 
        monitoring.pollDeploymentStatus(id, 600000).catch(error => ({ success: false, error }))
      );

      const deploymentResults = await Promise.allSettled(deploymentPromises);
      const allCompleteTime = Date.now();

      await monitoring.captureResourceUsage('concurrent_load_end');

      // Performance metrics
      const totalWebhookTime = webhookEndTime - startTime;
      const totalProcessingTime = allCompleteTime - startTime;
      const successfulDeployments = deploymentResults.filter(r => 
        r.status === 'fulfilled' && r.value.success
      ).length;

      // Assertions
      expect(totalWebhookTime).toBeLessThan(60000); // All webhooks accepted within 1 minute
      expect(totalProcessingTime).toBeLessThan(900000); // All deployments within 15 minutes
      expect(successfulDeployments).toBeGreaterThanOrEqual(concurrentRequests * 0.7); // 70% success rate
    });

    test('should handle memory usage efficiently during extended operations', async () => {
      const iterations = 20;
      const memorySnapshots = [];

      await monitoring.captureResourceUsage('memory_test_start');
      const baselineMemory = await monitoring.captureResourceUsage('baseline');

      for (let i = 0; i < iterations; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `memory-test-${i}-${Date.now()}`;
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
        await monitoring.pollDeploymentStatus(deploymentId, 300000);

        const memorySnapshot = await monitoring.captureResourceUsage(`iteration_${i}`);
        memorySnapshots.push(memorySnapshot);

        // Brief pause
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      await monitoring.captureResourceUsage('memory_test_end');

      // Analyze memory usage patterns
      const memoryUsages = memorySnapshots.map(s => s.memory.heapUsed);
      const maxMemory = Math.max(...memoryUsages);
      const minMemory = Math.min(...memoryUsages);
      const memoryGrowth = memoryUsages[memoryUsages.length - 1] - memoryUsages[0];

      // Memory usage should be stable
      expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth
      expect(maxMemory - minMemory).toBeLessThan(500 * 1024 * 1024); // Memory variance < 500MB
    });

    test('should maintain API response times under various loads', async () => {
      const endpoints = [
        { path: '/api/health', method: 'GET' },
        { path: '/api/deployments', method: 'GET' },
        { path: '/api/system/status', method: 'GET' }
      ];

      const loadScenarios = [
        { name: 'light', concurrent: 5, iterations: 10 },
        { name: 'medium', concurrent: 10, iterations: 15 },
        { name: 'heavy', concurrent: 20, iterations: 25 }
      ];

      const results = {};

      for (const scenario of loadScenarios) {
        results[scenario.name] = {};

        for (const endpoint of endpoints) {
          const promises = [];

          for (let i = 0; i < scenario.concurrent; i++) {
            for (let j = 0; j < scenario.iterations; j++) {
              promises.push(
                monitoring.measureApiResponseTime(endpoint.path, endpoint.method)
              );
            }
          }

          const endpointResults = await Promise.allSettled(promises);
          const successfulResults = endpointResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

          const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length;
          const maxResponseTime = Math.max(...successfulResults.map(r => r.responseTime));
          const successRate = successfulResults.length / promises.length;

          results[scenario.name][endpoint.path] = {
            avgResponseTime,
            maxResponseTime,
            successRate,
            totalRequests: promises.length
          };

          // Response time thresholds based on load
          const maxAvgTime = scenario.name === 'heavy' ? 3000 : (scenario.name === 'medium' ? 2000 : 1000);
          const maxPeakTime = scenario.name === 'heavy' ? 10000 : (scenario.name === 'medium' ? 7000 : 5000);

          expect(avgResponseTime).toBeLessThan(maxAvgTime);
          expect(maxResponseTime).toBeLessThan(maxPeakTime);
          expect(successRate).toBeGreaterThanOrEqual(0.95);
        }

        // Brief pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      console.log('API Performance Results:', JSON.stringify(results, null, 2));
    });
  });

  describe('Reliability and Resilience', () => {
    test('should recover gracefully from service interruptions', async () => {
      // Start a deployment
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

      // Wait for deployment to start
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Simulate service interruption
      await testEnv.stopMCPServers();
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 second outage

      // Restart services
      await testEnv.startMCPServers();
      
      // Wait for services to stabilize
      await monitoring.waitForServiceHealth('mcp-server', 'http://localhost:8081', '/api/health', 120000);

      // Check if deployment can continue or fails gracefully
      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 600000);

      // Deployment should either complete successfully or fail gracefully
      expect(['completed', 'failed']).toContain(deploymentResult.deployment.status);
      
      if (deploymentResult.deployment.status === 'failed') {
        expect(deploymentResult.deployment.error).toMatch(/(service|unavailable|timeout)/i);
      }
    });

    test('should handle database connection issues gracefully', async () => {
      // Trigger a deployment
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      // Simulate database connectivity issues
      await testEnv.stopDatabaseService();
      
      let errorHandled = false;
      try {
        await axios.post('http://localhost:3000/api/webhook/github', 
          webhookPayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (error) {
        errorHandled = true;
        expect([500, 503]).toContain(error.response.status);
        expect(error.response.data.error).toMatch(/(database|unavailable|service)/i);
      }

      // Should either handle gracefully or return appropriate error
      expect(errorHandled).toBe(true);

      // Restart database
      await testEnv.startDatabaseService();
      await new Promise(resolve => setTimeout(resolve, 10000)); // Allow reconnection

      // Verify service recovers
      const healthResponse = await axios.get('http://localhost:3000/api/health');
      expect(healthResponse.status).toBe(200);
    });

    test('should maintain data consistency during failures', async () => {
      // Get initial deployment count
      const initialDeployments = await axios.get('http://localhost:3000/api/deployments');
      const initialCount = initialDeployments.data.deployments.length;

      // Start multiple deployments
      const deploymentPromises = [];
      for (let i = 0; i < 5; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `consistency-test-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        deploymentPromises.push(
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

      const webhookResults = await Promise.allSettled(deploymentPromises);
      const successfulWebhooks = webhookResults.filter(r => r.status === 'fulfilled');

      // Simulate failure during processing
      await new Promise(resolve => setTimeout(resolve, 20000)); // Let some processing happen
      await testEnv.restartServices(); // Force restart
      await new Promise(resolve => setTimeout(resolve, 15000)); // Recovery time

      // Check data consistency
      const finalDeployments = await axios.get('http://localhost:3000/api/deployments');
      const finalCount = finalDeployments.data.deployments.length;

      // Should have records for all accepted webhooks
      expect(finalCount).toBeGreaterThanOrEqual(initialCount + successfulWebhooks.length);

      // Verify each deployment has consistent state
      for (const webhook of successfulWebhooks) {
        const deploymentId = webhook.value.data.deploymentId;
        const deployment = await monitoring.getDeployment(deploymentId);
        
        // State should be valid (not corrupted)
        expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(deployment.status);
        expect(deployment.createdAt).toBeDefined();
        expect(deployment.commitHash).toBeDefined();
      }
    });

    test('should handle resource exhaustion scenarios', async () => {
      // Test behavior under resource pressure
      const resourceExhaustionTests = [];

      // Create many concurrent deployments to stress the system
      for (let i = 0; i < 25; i++) {
        const webhookPayload = githubSim.createLargeConfigScenario();
        webhookPayload.after = `resource-test-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        resourceExhaustionTests.push(
          axios.post('http://localhost:3000/api/webhook/github', 
            webhookPayload, {
              headers: {
                'X-Hub-Signature-256': signature,
                'X-GitHub-Event': 'push',
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          ).catch(error => ({ error: error.response }))
        );
      }

      const results = await Promise.allSettled(resourceExhaustionTests);
      
      // System should handle resource exhaustion gracefully
      const successfulRequests = results.filter(r => 
        r.status === 'fulfilled' && !r.value.error
      );
      const rejectedRequests = results.filter(r => 
        r.status === 'fulfilled' && r.value.error
      );

      // Should accept some requests but reject others when overloaded
      expect(successfulRequests.length).toBeGreaterThan(0);
      expect(rejectedRequests.length).toBeGreaterThan(0);

      // Rejected requests should have appropriate status codes
      for (const rejected of rejectedRequests) {
        if (rejected.value.error) {
          expect([429, 503, 507]).toContain(rejected.value.error.status);
        }
      }

      // System should remain responsive after load
      await new Promise(resolve => setTimeout(resolve, 30000));
      const healthCheck = await axios.get('http://localhost:3000/api/health');
      expect(healthCheck.status).toBe(200);
    });
  });

  describe('Scalability Tests', () => {
    test('should maintain performance with growing deployment history', async () => {
      // Create baseline with many historical deployments
      const historicalDeployments = [];
      
      for (let i = 0; i < 30; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `historical-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        try {
          const response = await axios.post('http://localhost:3000/api/webhook/github', 
            webhookPayload, {
              headers: {
                'X-Hub-Signature-256': signature,
                'X-GitHub-Event': 'push',
                'Content-Type': 'application/json'
              }
            }
          );
          historicalDeployments.push(response.data.deploymentId);
        } catch (error) {
          // Some may fail due to resource limits, that's expected
        }

        // Brief pause to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Wait for deployments to complete
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Test performance with large deployment history
      const performanceTests = [];
      
      for (let i = 0; i < 5; i++) {
        performanceTests.push(
          monitoring.measureApiResponseTime('/api/deployments', 'GET')
        );
      }

      const performanceResults = await Promise.all(performanceTests);
      const avgResponseTime = performanceResults.reduce((sum, r) => sum + r.responseTime, 0) / performanceResults.length;

      // API should remain responsive even with many deployments
      expect(avgResponseTime).toBeLessThan(5000); // 5 seconds max
      
      // Verify pagination works if implemented
      try {
        const paginatedResponse = await axios.get('http://localhost:3000/api/deployments?limit=10&offset=0');
        if (paginatedResponse.status === 200) {
          expect(paginatedResponse.data.deployments.length).toBeLessThanOrEqual(10);
        }
      } catch (error) {
        // Pagination might not be implemented
      }
    });

    test('should handle large configuration deployments efficiently', async () => {
      // Test with very large configuration
      const largeConfigPayload = githubSim.createLargeConfigScenario();
      const signature = githubSim.generateWebhookSignature(largeConfigPayload);

      await monitoring.captureResourceUsage('large_config_start');

      const response = await axios.post('http://localhost:3000/api/webhook/github', 
        largeConfigPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 1 minute timeout for large payloads
        }
      );

      expect(response.status).toBe(200);
      const deploymentId = response.data.deploymentId;

      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 900000); // 15 minutes
      
      await monitoring.captureResourceUsage('large_config_end');

      expect(deploymentResult.success).toBe(true);

      // Verify performance with large configuration
      const metrics = monitoring.getMetricsSummary();
      expect(metrics.resources.large_config_start).toBeDefined();
      expect(metrics.resources.large_config_end).toBeDefined();

      // Memory usage should be reasonable even for large configs
      const startMemory = metrics.resources.large_config_start.avgMemoryUsage;
      const endMemory = metrics.resources.large_config_end.avgMemoryUsage;
      const memoryIncrease = endMemory - startMemory;

      expect(memoryIncrease).toBeLessThan(1000 * 1024 * 1024); // Less than 1GB increase
    });
  });

  describe('Error Recovery and Fault Tolerance', () => {
    test('should recover from transient network failures', async () => {
      // Simulate network issues during deployment
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

      // Wait for deployment to start
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Simulate network interruption to Home Assistant
      await testEnv.stopMockHomeAssistant();
      await new Promise(resolve => setTimeout(resolve, 20000)); // 20 second outage

      // Restore connection
      await testEnv.startMockHomeAssistant();
      await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 60000);

      // Check deployment outcome
      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 600000);

      // Should either succeed (with retry) or fail gracefully
      expect(['completed', 'failed']).toContain(deploymentResult.deployment.status);
      
      if (deploymentResult.deployment.status === 'failed') {
        // Should have retry information
        expect(deploymentResult.deployment.retryCount).toBeGreaterThan(0);
      }
    });

    test('should maintain system stability during cascading failures', async () => {
      // Create multiple deployments
      const deploymentIds = [];
      
      for (let i = 0; i < 3; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `cascade-test-${i}-${Date.now()}`;
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

        deploymentIds.push(response.data.deploymentId);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Simulate cascading failures
      await testEnv.stopMockHomeAssistant();
      await testEnv.stopMCPServers();
      
      // Wait for failures to propagate
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Restart services in stages
      await testEnv.startMockHomeAssistant();
      await new Promise(resolve => setTimeout(resolve, 10000));
      await testEnv.startMCPServers();

      // Wait for recovery
      await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 120000);
      await monitoring.waitForServiceHealth('mcp-server', 'http://localhost:8081', '/api/health', 120000);

      // Check system state after recovery
      const healthResponse = await axios.get('http://localhost:3000/api/health');
      expect(healthResponse.status).toBe(200);

      // Verify deployment states are consistent
      for (const deploymentId of deploymentIds) {
        const deployment = await monitoring.getDeployment(deploymentId);
        expect(['completed', 'failed', 'cancelled']).toContain(deployment.status);
      }
    });
  });
});
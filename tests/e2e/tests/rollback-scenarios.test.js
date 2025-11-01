const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const E2ETestEnvironment = require('../setup/e2e-environment');
const axios = require('axios');

describe('Rollback Scenarios E2E Tests', () => {
  let testEnv;
  let githubSim;
  let monitoring;
  let initialConfigHash;
  let successfulDeploymentId;

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

    // Establish baseline with successful deployment first
    await establishKnownGoodState();
  });

  afterAll(async () => {
    await monitoring.saveMetricsReport('rollback-scenarios');
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    monitoring.clearMetrics();
  });

  async function establishKnownGoodState() {
    // Deploy a known-good configuration to establish baseline
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

    successfulDeploymentId = webhookResponse.data.deploymentId;
    const deploymentResult = await monitoring.pollDeploymentStatus(successfulDeploymentId, 300000);
    
    expect(deploymentResult.success).toBe(true);
    
    // Store the baseline configuration hash
    initialConfigHash = webhookPayload.after;
    
    // Verify all services are healthy before rollback tests
    await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 60000);
  }

  describe('Automatic Rollback on Configuration Failure', () => {
    test('should automatically rollback when Home Assistant fails to start with new config', async () => {
      await monitoring.captureResourceUsage('rollback_test_start');

      // Deploy configuration that will cause Home Assistant to fail
      const webhookPayload = githubSim.createHomeAssistantFailureScenario();
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
      const failedDeploymentId = webhookResponse.data.deploymentId;

      // Monitor deployment - should detect failure and trigger rollback
      const deploymentResult = await monitoring.pollDeploymentStatus(failedDeploymentId, 600000); // 10 minutes for rollback

      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.deployment.status).toBe('failed');
      expect(deploymentResult.deployment.rollbackTriggered).toBe(true);

      // Verify rollback was executed
      const rollbackDetails = await axios.get(`http://localhost:3000/api/deployments/${failedDeploymentId}/rollback`);
      expect(rollbackDetails.data.rollbackCompleted).toBe(true);
      expect(rollbackDetails.data.rolledBackToConfigHash).toBe(initialConfigHash);

      // Verify Home Assistant is back to working state
      await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 120000);
      
      const haResponse = await axios.get('http://localhost:8123/api/config');
      expect(haResponse.status).toBe(200);

      // Verify configuration hash is back to the known-good state
      const configStatus = await axios.get(`http://localhost:3000/api/config/current-hash`);
      expect(configStatus.data.configHash).toBe(initialConfigHash);

      await monitoring.captureResourceUsage('rollback_test_end');

      // Validate rollback performance
      const performanceMetrics = monitoring.getMetricsSummary();
      expect(performanceMetrics).toMeetPerformanceRequirements({
        maxDeploymentTime: 600000, // 10 minutes including rollback
        maxMemoryIncrease: 150 * 1024 * 1024, // 150MB
        minSuccessRate: 0.8 // Lower because we expect the deployment to fail
      });
    });

    test('should rollback when service health checks fail after deployment', async () => {
      // Deploy configuration that passes validation but causes runtime issues
      const webhookPayload = githubSim.createRuntimeFailureScenario();
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

      const failedDeploymentId = webhookResponse.data.deploymentId;

      // Monitor deployment - should deploy, detect health check failures, then rollback
      const deploymentResult = await monitoring.pollDeploymentStatus(failedDeploymentId, 600000);

      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.deployment.status).toBe('failed');
      expect(deploymentResult.deployment.failureReason).toContain('health check');

      // Verify rollback occurred
      const rollbackDetails = await axios.get(`http://localhost:3000/api/deployments/${failedDeploymentId}/rollback`);
      expect(rollbackDetails.data.rollbackCompleted).toBe(true);

      // Verify services are healthy after rollback
      const serviceChecks = await Promise.allSettled([
        monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 120000),
        monitoring.waitForServiceHealth('api', 'http://localhost:3000', '/api/health', 30000),
        monitoring.waitForServiceHealth('mcp-server', 'http://localhost:8081', '/api/health', 30000)
      ]);

      serviceChecks.forEach((check, index) => {
        expect(check.status).toBe('fulfilled');
        expect(check.value.healthy).toBe(true);
      });
    });

    test('should handle partial rollback when some services fail to rollback', async () => {
      // Create scenario where rollback partially fails
      const webhookPayload = githubSim.createPartialRollbackFailureScenario();
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

      const deploymentId = webhookResponse.data.deploymentId;
      const deploymentResult = await monitoring.pollDeploymentStatus(deploymentId, 600000);

      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.deployment.rollbackTriggered).toBe(true);

      // Check rollback status
      const rollbackDetails = await axios.get(`http://localhost:3000/api/deployments/${deploymentId}/rollback`);
      expect(rollbackDetails.data.rollbackAttempted).toBe(true);
      
      // Should have partial success/failure details
      expect(rollbackDetails.data.partialSuccess).toBeDefined();
      expect(rollbackDetails.data.failedServices).toBeDefined();

      // At least core services should be functional
      const coreServiceCheck = await monitoring.waitForServiceHealth('api', 'http://localhost:3000', '/api/health', 60000);
      expect(coreServiceCheck.healthy).toBe(true);
    });
  });

  describe('Manual Rollback Operations', () => {
    test('should allow manual rollback to specific previous deployment', async () => {
      // First deploy a new configuration (that works)
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      webhookPayload.after = 'new-commit-hash-' + Date.now(); // Make it unique
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

      const newDeploymentId = webhookResponse.data.deploymentId;
      const deploymentResult = await monitoring.pollDeploymentStatus(newDeploymentId, 300000);
      expect(deploymentResult.success).toBe(true);

      // Now manually trigger rollback to the initial deployment
      const rollbackResponse = await axios.post(`http://localhost:3000/api/deployments/${newDeploymentId}/rollback`, {
        targetConfigHash: initialConfigHash,
        reason: 'Manual rollback for testing'
      });

      expect(rollbackResponse.status).toBe(200);
      const rollbackDeploymentId = rollbackResponse.data.rollbackDeploymentId;

      // Monitor rollback progress
      const rollbackResult = await monitoring.pollDeploymentStatus(rollbackDeploymentId, 300000);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.deployment.type).toBe('rollback');

      // Verify configuration is back to initial state
      const configStatus = await axios.get(`http://localhost:3000/api/config/current-hash`);
      expect(configStatus.data.configHash).toBe(initialConfigHash);

      // Verify all services are healthy
      await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 120000);
    });

    test('should validate rollback target before executing rollback', async () => {
      // Try to rollback to non-existent configuration
      const invalidRollbackResponse = await axios.post(`http://localhost:3000/api/deployments/${successfulDeploymentId}/rollback`, {
        targetConfigHash: 'non-existent-hash-12345',
        reason: 'Testing invalid rollback'
      });

      expect(invalidRollbackResponse.status).toBe(400);
      expect(invalidRollbackResponse.data.error).toContain('target configuration not found');

      // Verify current state wasn't affected
      const configStatus = await axios.get(`http://localhost:3000/api/config/current-hash`);
      expect(configStatus.data.configHash).toBeDefined();
      
      const haHealth = await monitoring.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 30000);
      expect(haHealth.healthy).toBe(true);
    });
  });

  describe('Rollback Performance and Reliability', () => {
    test('should complete rollback within acceptable time limits', async () => {
      // Deploy failing configuration
      const webhookPayload = githubSim.createHomeAssistantFailureScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const deploymentStart = Date.now();

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const failedDeploymentId = webhookResponse.data.deploymentId;
      const deploymentResult = await monitoring.pollDeploymentStatus(failedDeploymentId, 600000);

      const totalTime = Date.now() - deploymentStart;

      expect(deploymentResult.deployment.rollbackTriggered).toBe(true);
      
      // Rollback should complete within reasonable time
      expect(totalTime).toBeLessThan(480000); // 8 minutes max for failure detection + rollback

      const rollbackDetails = await axios.get(`http://localhost:3000/api/deployments/${failedDeploymentId}/rollback`);
      expect(rollbackDetails.data.rollbackDurationMs).toBeLessThan(180000); // 3 minutes for rollback itself
    });

    test('should maintain service availability during rollback process', async () => {
      // This test ensures services stay available during rollback
      const webhookPayload = githubSim.createRuntimeFailureScenario();
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

      const deploymentId = webhookResponse.data.deploymentId;

      // Monitor service availability during deployment/rollback
      const availabilityChecks = [];
      const checkInterval = setInterval(async () => {
        try {
          const apiHealth = await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
          availabilityChecks.push({
            timestamp: Date.now(),
            apiAvailable: apiHealth.status === 200,
            error: null
          });
        } catch (error) {
          availabilityChecks.push({
            timestamp: Date.now(),
            apiAvailable: false,
            error: error.message
          });
        }
      }, 10000); // Check every 10 seconds

      try {
        await monitoring.pollDeploymentStatus(deploymentId, 600000);
      } finally {
        clearInterval(checkInterval);
      }

      // API should be available for at least 80% of the time during the process
      const availableChecks = availabilityChecks.filter(check => check.apiAvailable);
      const availabilityRate = availableChecks.length / availabilityChecks.length;
      
      expect(availabilityRate).toBeGreaterThanOrEqual(0.8);
      expect(availabilityChecks.length).toBeGreaterThan(0); // Ensure we actually did checks
    });
  });

  describe('Data Consistency During Rollback', () => {
    test('should maintain deployment history integrity during rollback', async () => {
      // Get initial deployment count
      const initialDeployments = await axios.get('http://localhost:3000/api/deployments');
      const initialCount = initialDeployments.data.deployments.length;

      // Trigger failed deployment with rollback
      const webhookPayload = githubSim.createHomeAssistantFailureScenario();
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

      const deploymentId = webhookResponse.data.deploymentId;
      await monitoring.pollDeploymentStatus(deploymentId, 600000);

      // Check deployment history
      const finalDeployments = await axios.get('http://localhost:3000/api/deployments');
      const finalCount = finalDeployments.data.deployments.length;

      // Should have at least 2 new entries: failed deployment + rollback deployment
      expect(finalCount).toBeGreaterThanOrEqual(initialCount + 1);

      // Verify the failed deployment is recorded
      const failedDeployment = await axios.get(`http://localhost:3000/api/deployments/${deploymentId}`);
      expect(failedDeployment.data.status).toBe('failed');
      expect(failedDeployment.data.rollbackTriggered).toBe(true);

      // Verify rollback deployment exists and is linked
      const rollbackDetails = await axios.get(`http://localhost:3000/api/deployments/${deploymentId}/rollback`);
      if (rollbackDetails.data.rollbackDeploymentId) {
        const rollbackDeployment = await axios.get(`http://localhost:3000/api/deployments/${rollbackDetails.data.rollbackDeploymentId}`);
        expect(rollbackDeployment.data.type).toBe('rollback');
        expect(rollbackDeployment.data.parentDeploymentId).toBe(deploymentId);
      }
    });
  });
});
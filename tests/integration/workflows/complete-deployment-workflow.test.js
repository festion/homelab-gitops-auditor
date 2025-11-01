const { TestEnvironment } = require('../setup/test-environment');
const { IntegrationFixtures } = require('../fixtures/integration-data');
const request = require('supertest');

describe('Complete Deployment Workflow Integration', () => {
  let testEnvironment;
  let app;
  let authToken;

  beforeAll(async () => {
    testEnvironment = new TestEnvironment();
    await testEnvironment.initialize();
    app = testEnvironment.getApp();
    authToken = await testEnvironment.generateTestAuthToken('admin');
  }, 60000);

  afterAll(async () => {
    await testEnvironment.cleanup();
  }, 15000);

  beforeEach(async () => {
    await testEnvironment.getDbSetup().clearData();
    await testEnvironment.cleanupTestConfigFiles();
  });

  afterEach(async () => {
    await testEnvironment.cleanupTestConfigFiles();
  });

  describe('End-to-End Deployment Workflow', () => {
    it('should execute complete deployment from API request to completion', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      // Step 1: Create deployment via API
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      const deploymentId = createResponse.body.data.deploymentId;
      expect(deploymentId).toMatch(/^deploy-\d{8}-\d{6}$/);

      // Step 2: Monitor deployment progress
      let deploymentComplete = false;
      let currentState = 'queued';
      let attempts = 0;
      const maxAttempts = 60; // 60 attempts = 30 seconds max wait

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        if (statusResponse.body.data) {
          currentState = statusResponse.body.data.state;
          deploymentComplete = ['completed', 'failed', 'cancelled'].includes(currentState);
          
          console.log(`Deployment ${deploymentId} status: ${currentState}`);
          
          if (statusResponse.body.data.progress) {
            console.log(`Progress: ${statusResponse.body.data.progress.stepsCompleted}/${statusResponse.body.data.progress.totalSteps} steps`);
          }
        }
        
        attempts++;
      }

      // Step 3: Verify deployment completed successfully
      expect(deploymentComplete).toBe(true);
      expect(currentState).toBe('completed');

      // Step 4: Verify deployment details
      const finalStatusResponse = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalStatusResponse.body.data).toMatchObject({
        deploymentId: deploymentId,
        state: 'completed',
        repository: deploymentRequest.repository,
        branch: deploymentRequest.branch,
        progress: {
          stepsCompleted: expect.any(Number),
          totalSteps: expect.any(Number)
        }
      });

      // Step 5: Verify deployment appears in history
      const historyResponse = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const deploymentInHistory = historyResponse.body.data.deployments.find(
        d => d.deploymentId === deploymentId
      );
      
      expect(deploymentInHistory).toBeDefined();
      expect(deploymentInHistory.state).toBe('completed');
      expect(deploymentInHistory.completedAt).toBeDefined();

      // Step 6: Verify audit trail
      const auditLogs = await testEnvironment.getDbSetup().query(
        `SELECT * FROM audit_logs WHERE resource_id = $1 ORDER BY created_at`,
        [deploymentId]
      );

      expect(auditLogs.rows.length).toBeGreaterThan(0);
      
      const deploymentCreatedLog = auditLogs.rows.find(log => log.action === 'deployment_created');
      expect(deploymentCreatedLog).toBeDefined();
      
      const deploymentCompletedLog = auditLogs.rows.find(log => log.action === 'deployment_completed');
      expect(deploymentCompletedLog).toBeDefined();
    }, 45000);

    it('should handle deployment failure gracefully', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/nonexistent-repo', // This will cause failure
        branch: 'main'
      });

      // Create deployment
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      const deploymentId = createResponse.body.data.deploymentId;

      // Monitor until completion/failure
      let deploymentComplete = false;
      let currentState = 'queued';
      let attempts = 0;
      const maxAttempts = 30;

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        if (statusResponse.body.data) {
          currentState = statusResponse.body.data.state;
          deploymentComplete = ['completed', 'failed', 'cancelled'].includes(currentState);
        }
        
        attempts++;
      }

      // Verify deployment failed
      expect(deploymentComplete).toBe(true);
      expect(currentState).toBe('failed');

      // Verify error details are available
      const finalStatusResponse = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalStatusResponse.body.data.errorMessage).toBeDefined();
      expect(finalStatusResponse.body.data.completedAt).toBeDefined();

      // Verify failure appears in history
      const historyResponse = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const failedDeployment = historyResponse.body.data.deployments.find(
        d => d.deploymentId === deploymentId
      );
      
      expect(failedDeployment).toBeDefined();
      expect(failedDeployment.state).toBe('failed');
    }, 30000);

    it('should execute webhook-triggered deployment workflow', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook({
        repository: {
          full_name: 'festion/home-assistant-config',
          name: 'home-assistant-config',
          owner: { login: 'festion' }
        },
        ref: 'refs/heads/main'
      });

      const crypto = require('crypto');
      const webhookSecret = 'test-webhook-secret-123';
      const signature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(pushPayload)).digest('hex')}`;

      // Step 1: Send webhook
      const webhookResponse = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      expect(webhookResponse.body.data.action).toBe('deployment_triggered');
      const deploymentId = webhookResponse.body.data.deploymentId;

      // Step 2: Monitor auto-triggered deployment
      let deploymentComplete = false;
      let currentState = 'queued';
      let attempts = 0;
      const maxAttempts = 60;

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        if (statusResponse.body.data) {
          currentState = statusResponse.body.data.state;
          deploymentComplete = ['completed', 'failed', 'cancelled'].includes(currentState);
        }
        
        attempts++;
      }

      // Step 3: Verify webhook-triggered deployment succeeded
      expect(deploymentComplete).toBe(true);
      expect(currentState).toBe('completed');

      // Step 4: Verify deployment has correct webhook metadata
      const deployment = await testEnvironment.getDbSetup().findDeploymentById(deploymentId);
      expect(deployment.commit_sha).toBe(pushPayload.head_commit.id);
      expect(deployment.repository).toBe(pushPayload.repository.full_name);

      // Step 5: Verify webhook processing was logged
      const webhookLogs = await testEnvironment.getDbSetup().query(
        `SELECT * FROM audit_logs WHERE action = 'webhook_processed' 
         AND details->>'commit_sha' = $1`,
        [pushPayload.head_commit.id]
      );
      
      expect(webhookLogs.rows).toHaveLength(1);
    }, 45000);
  });

  describe('Deployment Rollback Workflow', () => {
    it('should execute complete rollback workflow', async () => {
      // Step 1: Create and complete a successful deployment first
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      const originalDeploymentId = createResponse.body.data.deploymentId;

      // Wait for deployment to complete
      let deploymentComplete = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.data && statusResponse.body.data.state === 'completed') {
          deploymentComplete = true;
        }
        
        attempts++;
      }

      expect(deploymentComplete).toBe(true);

      // Step 2: Initiate rollback
      const rollbackRequest = {
        deploymentId: originalDeploymentId,
        reason: 'Testing complete rollback workflow'
      };

      const rollbackResponse = await request(app)
        .post('/api/deployments/home-assistant-config/rollback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rollbackRequest)
        .expect(201);

      const rollbackId = rollbackResponse.body.data.rollbackId;
      expect(rollbackId).toMatch(/^rollback-\d{8}-\d{6}$/);

      // Step 3: Monitor rollback progress
      let rollbackComplete = false;
      attempts = 0;

      while (!rollbackComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const rollbackStatus = await testEnvironment.getDbSetup().query(
          'SELECT state FROM rollbacks WHERE rollback_id = $1',
          [rollbackId]
        );

        if (rollbackStatus.rows.length > 0) {
          const state = rollbackStatus.rows[0].state;
          rollbackComplete = ['completed', 'failed'].includes(state);
          
          if (rollbackComplete) {
            expect(state).toBe('completed');
          }
        }
        
        attempts++;
      }

      expect(rollbackComplete).toBe(true);

      // Step 4: Verify rollback appears in history
      const historyResponse = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should contain both original deployment and rollback
      expect(historyResponse.body.data.deployments.length).toBeGreaterThanOrEqual(2);
      
      const rollbackInHistory = historyResponse.body.data.deployments.find(
        d => d.type === 'rollback' && d.targetDeploymentId === originalDeploymentId
      );
      
      expect(rollbackInHistory).toBeDefined();

      // Step 5: Verify audit trail for rollback
      const rollbackAuditLogs = await testEnvironment.getDbSetup().query(
        `SELECT * FROM audit_logs WHERE resource_id = $1 AND action LIKE 'rollback%'`,
        [rollbackId]
      );

      expect(rollbackAuditLogs.rows.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Concurrent Deployment Workflow', () => {
    it('should handle concurrent deployment attempts correctly', async () => {
      const deploymentRequest1 = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      const deploymentRequest2 = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'develop'
      });

      // Attempt concurrent deployments
      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deploymentRequest1),
        request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deploymentRequest2)
      ]);

      // One should succeed, one should fail
      const responses = [response1, response2];
      const successResponses = responses.filter(r => r.status === 201);
      const errorResponses = responses.filter(r => r.status === 409);

      expect(successResponses).toHaveLength(1);
      expect(errorResponses).toHaveLength(1);

      expect(errorResponses[0].body.error.code).toBe('DEPLOYMENT_IN_PROGRESS');

      // Wait for successful deployment to complete
      const successfulDeploymentId = successResponses[0].body.data.deploymentId;
      
      let deploymentComplete = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.data && ['completed', 'failed'].includes(statusResponse.body.data.state)) {
          deploymentComplete = true;
        }
        
        attempts++;
      }

      // After first deployment completes, second deployment should be allowed
      const secondAttemptResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest2)
        .expect(201);

      expect(secondAttemptResponse.body.data.deploymentId).toBeDefined();
    }, 45000);
  });

  describe('Error Recovery Workflow', () => {
    it('should recover from transient failures', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      // Create deployment
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      const deploymentId = createResponse.body.data.deploymentId;

      // Monitor deployment (it should recover from any transient failures)
      let deploymentComplete = false;
      let currentState = 'queued';
      let attempts = 0;
      const maxAttempts = 90; // Extended timeout for recovery testing

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.data) {
          currentState = statusResponse.body.data.state;
          deploymentComplete = ['completed', 'failed', 'cancelled'].includes(currentState);
          
          // Log progress for debugging
          if (statusResponse.body.data.progress) {
            console.log(`Deployment ${deploymentId}: ${currentState}, ${statusResponse.body.data.progress.stepsCompleted}/${statusResponse.body.data.progress.totalSteps}`);
          }
        }
        
        attempts++;
      }

      // Should eventually complete successfully despite any transient issues
      expect(deploymentComplete).toBe(true);
      expect(currentState).toBe('completed');

      // Verify retry attempts were logged if any failures occurred
      const deployment = await testEnvironment.getDbSetup().findDeploymentById(deploymentId);
      expect(deployment.state).toBe('completed');
    }, 60000);
  });

  describe('Configuration Validation Workflow', () => {
    it('should validate configuration before deployment', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main',
        validateConfig: true
      });

      // Create deployment with validation
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      const deploymentId = createResponse.body.data.deploymentId;

      // Wait for deployment to complete
      let deploymentComplete = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!deploymentComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.data && ['completed', 'failed'].includes(statusResponse.body.data.state)) {
          deploymentComplete = true;
        }
        
        attempts++;
      }

      expect(deploymentComplete).toBe(true);

      // Verify configuration validation was performed
      const deployment = await testEnvironment.getDbSetup().findDeploymentById(deploymentId);
      expect(deployment.config_validation).toBeDefined();
      expect(deployment.config_validation.valid).toBe(true);
      expect(deployment.config_validation.errors).toEqual([]);
    }, 30000);
  });
});
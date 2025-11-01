const request = require('supertest');
const crypto = require('crypto');
const { TestEnvironment } = require('../setup/test-environment');
const { IntegrationFixtures } = require('../fixtures/integration-data');

describe('Webhook API Endpoints Integration', () => {
  let testEnv;
  let app;
  let webhookSecret;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.initialize();
    app = testEnv.getApp();
    webhookSecret = 'test-webhook-secret-123';
  }, 30000);

  afterAll(async () => {
    await testEnv.cleanup();
  }, 10000);

  beforeEach(async () => {
    await testEnv.getDbSetup().clearData();
  });

  function generateWebhookSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  describe('POST /webhooks/github/push', () => {
    it('should process valid push webhook', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'deployment_triggered',
          deploymentId: expect.stringMatching(/^deploy-\d{8}-\d{6}$/)
        }
      });

      // Verify deployment was created in database
      const deployment = await testEnv.getDbSetup().findDeploymentById(response.body.data.deploymentId);
      expect(deployment).toBeDefined();
      expect(deployment.repository).toBe(pushPayload.repository.full_name);
      expect(deployment.branch).toBe(pushPayload.ref.replace('refs/heads/', ''));
      expect(deployment.commit_sha).toBe(pushPayload.head_commit.id);
    });

    it('should reject webhook with invalid signature', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      const invalidSignature = 'sha256=invalid_signature';
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', invalidSignature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(401);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'INVALID_WEBHOOK_SIGNATURE'
        }
      });
    });

    it('should reject webhook without signature', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(401);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'MISSING_WEBHOOK_SIGNATURE'
        }
      });
    });

    it('should ignore pushes to non-main branches', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook({
        ref: 'refs/heads/feature-branch'
      });
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'ignored',
          reason: 'Non-main branch push'
        }
      });

      // Verify no deployment was created
      const deployments = await testEnv.getDbSetup().query(
        'SELECT * FROM deployments WHERE commit_sha = $1',
        [pushPayload.head_commit.id]
      );
      expect(deployments.rows).toHaveLength(0);
    });

    it('should ignore pushes from unauthorized repositories', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook({
        repository: {
          full_name: 'unauthorized/repo',
          name: 'repo',
          owner: { login: 'unauthorized' }
        }
      });
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'ignored',
          reason: 'Repository not authorized for automatic deployment'
        }
      });
    });

    it('should handle deployment in progress', async () => {
      // Create an existing deployment
      const existingDeploymentId = `deploy-${Date.now()}`;
      await testEnv.getDbSetup().query(
        `INSERT INTO deployments (deployment_id, repository, branch, state) 
         VALUES ($1, 'festion/home-assistant-config', 'main', 'in-progress')`,
        [existingDeploymentId]
      );

      const pushPayload = IntegrationFixtures.githubPushWebhook();
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'queued',
          message: 'Deployment queued due to existing deployment in progress'
        }
      });
    });

    it('should validate webhook payload structure', async () => {
      const invalidPayload = {
        invalid: 'payload'
      };
      const signature = generateWebhookSignature(invalidPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'INVALID_WEBHOOK_PAYLOAD'
        }
      });
    });

    it('should log webhook processing', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      // Verify audit log entry was created
      const auditLogs = await testEnv.getDbSetup().query(
        `SELECT * FROM audit_logs WHERE action = 'webhook_processed' 
         AND details->>'event_type' = 'push'`
      );
      
      expect(auditLogs.rows).toHaveLength(1);
      expect(auditLogs.rows[0].details).toMatchObject({
        event_type: 'push',
        repository: pushPayload.repository.full_name,
        branch: pushPayload.ref.replace('refs/heads/', ''),
        commit_sha: pushPayload.head_commit.id
      });
    });
  });

  describe('POST /webhooks/github/pull-request', () => {
    it('should process pull request webhook for validation', async () => {
      const prPayload = IntegrationFixtures.githubPullRequestWebhook({
        action: 'opened'
      });
      const signature = generateWebhookSignature(prPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/pull-request')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(prPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'validation_triggered',
          pullRequestNumber: prPayload.pull_request.number
        }
      });
    });

    it('should ignore pull request webhook for irrelevant actions', async () => {
      const prPayload = IntegrationFixtures.githubPullRequestWebhook({
        action: 'labeled'
      });
      const signature = generateWebhookSignature(prPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/pull-request')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(prPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'ignored',
          reason: 'Irrelevant pull request action: labeled'
        }
      });
    });

    it('should validate pull request target branch', async () => {
      const prPayload = IntegrationFixtures.githubPullRequestWebhook({
        action: 'opened',
        pull_request: {
          ...IntegrationFixtures.githubPullRequestWebhook().pull_request,
          base: {
            ref: 'develop'
          }
        }
      });
      const signature = generateWebhookSignature(prPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/pull-request')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(prPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          processed: true,
          action: 'ignored',
          reason: 'Pull request not targeting main branch'
        }
      });
    });
  });

  describe('GET /webhooks/health', () => {
    it('should return webhook health status', async () => {
      const response = await request(app)
        .get('/webhooks/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          webhookProcessor: 'healthy',
          lastProcessed: expect.any(String),
          processedCount: expect.any(Number),
          errorCount: expect.any(Number)
        }
      });
    });
  });

  describe('Webhook Retry Logic', () => {
    it('should handle webhook processing failures gracefully', async () => {
      // Mock a scenario where deployment creation fails
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      
      // Temporarily break the database connection to simulate failure
      await testEnv.getDbSetup().query('DROP TABLE IF EXISTS temp_break_table');
      
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      const response = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'WEBHOOK_PROCESSING_ERROR'
        }
      });
    });

    it('should process webhooks idempotently', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      const signature = generateWebhookSignature(pushPayload, webhookSecret);
      
      // Send the same webhook twice
      const response1 = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Delivery', 'test-delivery-1')
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      const response2 = await request(app)
        .post('/webhooks/github/push')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Delivery', 'test-delivery-1')
        .set('Content-Type', 'application/json')
        .send(pushPayload)
        .expect(200);

      // First request should create deployment
      expect(response1.body.data.action).toBe('deployment_triggered');
      
      // Second request should be idempotent
      expect(response2.body.data.action).toBe('already_processed');
      
      // Verify only one deployment was created
      const deployments = await testEnv.getDbSetup().query(
        'SELECT * FROM deployments WHERE commit_sha = $1',
        [pushPayload.head_commit.id]
      );
      expect(deployments.rows).toHaveLength(1);
    });
  });

  describe('Webhook Rate Limiting', () => {
    it('should handle rapid webhook requests', async () => {
      const pushPayload = IntegrationFixtures.githubPushWebhook();
      
      // Send multiple rapid requests
      const requests = Array.from({ length: 5 }, (_, i) => {
        const payload = {
          ...pushPayload,
          head_commit: {
            ...pushPayload.head_commit,
            id: `commit-${i}`
          }
        };
        const signature = generateWebhookSignature(payload, webhookSecret);
        
        return request(app)
          .post('/webhooks/github/push')
          .set('X-GitHub-Event', 'push')
          .set('X-Hub-Signature-256', signature)
          .set('X-GitHub-Delivery', `delivery-${i}`)
          .set('Content-Type', 'application/json')
          .send(payload);
      });
      
      const responses = await Promise.all(requests);
      
      // All requests should be processed successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
      });
      
      // Verify all deployments were created
      const deployments = await testEnv.getDbSetup().query(
        'SELECT * FROM deployments WHERE commit_sha LIKE $1',
        ['commit-%']
      );
      expect(deployments.rows).toHaveLength(5);
    });
  });
});
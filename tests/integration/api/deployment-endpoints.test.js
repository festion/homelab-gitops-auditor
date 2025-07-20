const request = require('supertest');
const { TestEnvironment } = require('../setup/test-environment');
const { IntegrationFixtures } = require('../fixtures/integration-data');

describe('Deployment API Endpoints Integration', () => {
  let testEnv;
  let app;
  let authToken;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.initialize();
    app = testEnv.getApp();
    authToken = await testEnv.generateTestAuthToken('admin');
  }, 30000);

  afterAll(async () => {
    await testEnv.cleanup();
  }, 10000);

  beforeEach(async () => {
    await testEnv.getDbSetup().clearData();
    await testEnv.getDbSetup().seedTestData();
  });

  describe('POST /api/deployments/home-assistant-config/deploy', () => {
    it('should create deployment with valid request', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          deploymentId: expect.stringMatching(/^deploy-\d{8}-\d{6}$/),
          state: 'queued',
          repository: deploymentRequest.repository,
          branch: deploymentRequest.branch
        }
      });

      // Verify deployment was persisted to database
      const deployment = await testEnv.getDbSetup().findDeploymentById(response.body.data.deploymentId);
      expect(deployment).toBeDefined();
      expect(deployment.state).toBe('queued');
      expect(deployment.repository).toBe(deploymentRequest.repository);
      expect(deployment.branch).toBe(deploymentRequest.branch);
    });

    it('should reject deployment with invalid authentication', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .send(deploymentRequest)
        .expect(401);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('authentication')
        }
      });
    });

    it('should reject deployment with insufficient permissions', async () => {
      const viewerToken = await testEnv.generateTestAuthToken('viewer');
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(deploymentRequest)
        .expect(403);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: expect.stringContaining('permissions')
        }
      });
    });

    it('should validate request payload', async () => {
      const invalidRequest = {
        repository: 'invalid-repo-format',
        branch: 'main'
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('validation')
        }
      });
    });

    it('should handle concurrent deployment requests', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      
      // Send two concurrent requests
      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deploymentRequest),
        request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deploymentRequest)
      ]);

      // One should succeed, one should be rejected
      const responses = [response1, response2];
      const successResponses = responses.filter(r => r.status === 201);
      const errorResponses = responses.filter(r => r.status === 409);

      expect(successResponses).toHaveLength(1);
      expect(errorResponses).toHaveLength(1);
      
      expect(errorResponses[0].body).toMatchObject({
        status: 'error',
        error: {
          code: 'DEPLOYMENT_IN_PROGRESS'
        }
      });
    });

    it('should validate repository access', async () => {
      const deploymentRequest = {
        repository: 'private/inaccessible-repo',
        branch: 'main'
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest)
        .expect(422);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'REPOSITORY_ACCESS_ERROR'
        }
      });
    });
  });

  describe('GET /api/deployments/home-assistant-config/status', () => {
    it('should return current deployment status', async () => {
      // Create a deployment first
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest);

      const deploymentId = createResponse.body.data.deploymentId;

      // Get status
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          deploymentId: deploymentId,
          state: expect.oneOf(['queued', 'in-progress', 'completed', 'failed']),
          repository: deploymentRequest.repository,
          branch: deploymentRequest.branch,
          progress: expect.any(Object)
        }
      });
    });

    it('should return null when no deployment is active', async () => {
      await testEnv.getDbSetup().clearData();
      
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: null
      });
    });

    it('should include detailed progress information', async () => {
      // Create and update a deployment with progress
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest);

      // Simulate progress update
      const deploymentId = createResponse.body.data.deploymentId;
      await testEnv.getDbSetup().query(
        `UPDATE deployments SET state = 'in-progress', deployment_steps = $1 WHERE deployment_id = $2`,
        [
          JSON.stringify({
            steps: [
              { name: 'Clone Repository', status: 'completed', timestamp: new Date() },
              { name: 'Validate Configuration', status: 'in-progress', timestamp: new Date() }
            ]
          }),
          deploymentId
        ]
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.progress).toMatchObject({
        currentStep: 'Validate Configuration',
        stepsCompleted: 1,
        totalSteps: expect.any(Number)
      });
    });
  });

  describe('GET /api/deployments/home-assistant-config/history', () => {
    beforeEach(async () => {
      await testEnv.getDbSetup().seedDeploymentHistory();
    });

    it('should return deployment history with pagination', async () => {
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .query({ limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          deployments: expect.arrayContaining([
            expect.objectContaining({
              deploymentId: expect.any(String),
              state: expect.oneOf(['completed', 'failed']),
              repository: expect.any(String),
              branch: expect.any(String),
              createdAt: expect.any(String)
            })
          ]),
          pagination: {
            limit: 10,
            offset: 0,
            total: expect.any(Number),
            hasNext: expect.any(Boolean),
            hasPrevious: false
          }
        }
      });

      // Verify proper ordering (newest first)
      const deployments = response.body.data.deployments;
      if (deployments.length > 1) {
        const firstDate = new Date(deployments[0].createdAt);
        const secondDate = new Date(deployments[1].createdAt);
        expect(firstDate.getTime()).toBeGreaterThanOrEqual(secondDate.getTime());
      }
    });

    it('should filter deployment history by status', async () => {
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .query({ status: 'completed' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.deployments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: 'completed' })
        ])
      );

      // Verify no failed deployments are returned
      const failedDeployments = response.body.data.deployments.filter(d => d.state === 'failed');
      expect(failedDeployments).toHaveLength(0);
    });

    it('should filter deployment history by date range', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .query({ since: oneDayAgo })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.deployments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            createdAt: expect.any(String)
          })
        ])
      );

      // Verify all returned deployments are within date range
      response.body.data.deployments.forEach(deployment => {
        expect(new Date(deployment.createdAt).getTime()).toBeGreaterThan(new Date(oneDayAgo).getTime());
      });
    });

    it('should handle empty history', async () => {
      await testEnv.getDbSetup().clearData();
      
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          deployments: [],
          pagination: {
            total: 0,
            hasNext: false,
            hasPrevious: false
          }
        }
      });
    });
  });

  describe('POST /api/deployments/home-assistant-config/rollback', () => {
    it('should rollback deployment successfully', async () => {
      // Create and complete a deployment first
      const deploymentId = await testEnv.getDbSetup().createCompletedDeployment();
      
      const rollbackRequest = {
        deploymentId: deploymentId,
        reason: 'Testing rollback functionality'
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/rollback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rollbackRequest)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          rollbackId: expect.stringMatching(/^rollback-\d{8}-\d{6}$/),
          targetDeploymentId: deploymentId,
          state: 'queued',
          reason: rollbackRequest.reason
        }
      });

      // Verify rollback was persisted
      const rollback = await testEnv.getDbSetup().query(
        'SELECT * FROM rollbacks WHERE rollback_id = $1',
        [response.body.data.rollbackId]
      );
      
      expect(rollback.rows).toHaveLength(1);
      expect(rollback.rows[0].target_deployment_id).toBe(deploymentId);
    });

    it('should reject rollback for non-existent deployment', async () => {
      const rollbackRequest = {
        deploymentId: 'deploy-20250101-000000',
        reason: 'Testing rollback functionality'
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/rollback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rollbackRequest)
        .expect(404);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'DEPLOYMENT_NOT_FOUND'
        }
      });
    });

    it('should reject rollback for failed deployment', async () => {
      // Create a failed deployment
      const deploymentId = `deploy-${Date.now()}`;
      await testEnv.getDbSetup().query(
        `INSERT INTO deployments (deployment_id, repository, branch, state) 
         VALUES ($1, 'test/repo', 'main', 'failed')`,
        [deploymentId]
      );
      
      const rollbackRequest = {
        deploymentId: deploymentId,
        reason: 'Testing rollback functionality'
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/rollback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rollbackRequest)
        .expect(422);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'INVALID_ROLLBACK_TARGET'
        }
      });
    });

    it('should require rollback reason', async () => {
      const deploymentId = await testEnv.getDbSetup().createCompletedDeployment();
      
      const rollbackRequest = {
        deploymentId: deploymentId
        // Missing reason
      };
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/rollback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rollbackRequest)
        .expect(400);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR'
        }
      });
    });
  });

  describe('DELETE /api/deployments/home-assistant-config/cancel', () => {
    it('should cancel queued deployment', async () => {
      // Create a queued deployment
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest();
      const createResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentRequest);

      const deploymentId = createResponse.body.data.deploymentId;

      const response = await request(app)
        .delete('/api/deployments/home-assistant-config/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          deploymentId: deploymentId,
          state: 'cancelled'
        }
      });

      // Verify deployment was cancelled in database
      const deployment = await testEnv.getDbSetup().findDeploymentById(deploymentId);
      expect(deployment.state).toBe('cancelled');
    });

    it('should reject cancelling non-existent deployment', async () => {
      await testEnv.getDbSetup().clearData();
      
      const response = await request(app)
        .delete('/api/deployments/home-assistant-config/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'NO_ACTIVE_DEPLOYMENT'
        }
      });
    });

    it('should reject cancelling completed deployment', async () => {
      const deploymentId = await testEnv.getDbSetup().createCompletedDeployment();
      
      const response = await request(app)
        .delete('/api/deployments/home-assistant-config/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'DEPLOYMENT_NOT_CANCELLABLE'
        }
      });
    });
  });
});

// Custom Jest matchers
expect.extend({
  oneOf(received, expected) {
    const pass = expected.includes(received);
    return {
      message: () => `expected ${received} to be one of [${expected.join(', ')}]`,
      pass
    };
  }
});
const { DeploymentService } = require('../../../api/services/deployment-service');
const { TestEnvironment } = require('../setup/test-environment');
const { IntegrationFixtures } = require('../fixtures/integration-data');

describe('DeploymentService Integration', () => {
  let deploymentService;
  let testEnvironment;

  beforeAll(async () => {
    testEnvironment = new TestEnvironment();
    await testEnvironment.initialize();
    
    deploymentService = new DeploymentService({
      database: testEnvironment.getDbSetup().getConnection(),
      mcpCoordinator: testEnvironment.getMCPCoordinator(),
      eventBus: testEnvironment.getEventBus(),
      config: {
        deployment: {
          timeout: 300000, // 5 minutes
          maxConcurrentDeployments: 1,
          retryAttempts: 3
        }
      }
    });
  }, 45000);

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

  describe('Deployment Creation', () => {
    it('should create deployment with full validation', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      expect(deployment).toMatchObject({
        deploymentId: expect.stringMatching(/^deploy-\d{8}-\d{6}$/),
        repository: deploymentRequest.repository,
        branch: deploymentRequest.branch,
        state: 'queued',
        configValidation: expect.objectContaining({
          valid: expect.any(Boolean)
        })
      });
      
      // Verify deployment was persisted
      const persistedDeployment = await testEnvironment.getDbSetup().findDeploymentById(deployment.deploymentId);
      expect(persistedDeployment).toBeDefined();
      expect(persistedDeployment.state).toBe('queued');
    });

    it('should validate repository access during creation', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'private/inaccessible-repo',
        branch: 'main'
      });
      
      await expect(deploymentService.createDeployment(deploymentRequest))
        .rejects
        .toThrow(/repository access/i);
    });

    it('should prevent concurrent deployments', async () => {
      const deploymentRequest1 = IntegrationFixtures.validDeploymentRequest();
      const deploymentRequest2 = IntegrationFixtures.validDeploymentRequest();
      
      // Create first deployment
      const deployment1 = await deploymentService.createDeployment(deploymentRequest1);
      expect(deployment1.state).toBe('queued');
      
      // Attempt second deployment
      await expect(deploymentService.createDeployment(deploymentRequest2))
        .rejects
        .toThrow(/deployment already in progress/i);
    });

    it('should validate configuration before deployment creation', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main',
        validateConfig: true
      });
      
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      expect(deployment.configValidation).toMatchObject({
        valid: true,
        errors: [],
        warnings: expect.any(Array)
      });
    });
  });

  describe('Deployment Execution', () => {
    it('should execute complete deployment workflow', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      // Execute deployment
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(true);
      expect(executionResult.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Clone Repository', status: 'completed' }),
          expect.objectContaining({ name: 'Validate Configuration', status: 'completed' }),
          expect.objectContaining({ name: 'Create Backup', status: 'completed' }),
          expect.objectContaining({ name: 'Deploy Configuration', status: 'completed' })
        ])
      );
      
      // Verify deployment state updated
      const updatedDeployment = await deploymentService.getDeployment(deployment.deploymentId);
      expect(updatedDeployment.state).toBe('completed');
      expect(updatedDeployment.completedAt).toBeInstanceOf(Date);
    }, 30000);

    it('should handle deployment step failures', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/nonexistent-repo', // This will cause failure
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      // Execute deployment (should fail)
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(false);
      expect(executionResult.error).toBeDefined();
      expect(executionResult.failedStep).toBeDefined();
      
      // Verify deployment state updated to failed
      const updatedDeployment = await deploymentService.getDeployment(deployment.deploymentId);
      expect(updatedDeployment.state).toBe('failed');
      expect(updatedDeployment.errorMessage).toBeDefined();
      expect(updatedDeployment.completedAt).toBeInstanceOf(Date);
    });

    it('should update deployment progress during execution', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      // Start deployment execution (don't await)
      const executionPromise = deploymentService.executeDeployment(deployment.deploymentId);
      
      // Monitor progress
      const progressUpdates = [];
      const progressInterval = setInterval(async () => {
        const current = await deploymentService.getDeployment(deployment.deploymentId);
        progressUpdates.push({
          state: current.state,
          stepsCompleted: current.deploymentSteps?.filter(s => s.status === 'completed').length || 0
        });
      }, 500);
      
      // Wait for completion
      await executionPromise;
      clearInterval(progressInterval);
      
      // Verify progress was tracked
      expect(progressUpdates.length).toBeGreaterThan(1);
      expect(progressUpdates[0].state).toBe('queued');
      expect(progressUpdates[progressUpdates.length - 1].state).toBe('completed');
      
      // Verify steps were completed incrementally
      const stepsProgression = progressUpdates.map(p => p.stepsCompleted);
      const isIncreasing = stepsProgression.every((val, i) => i === 0 || val >= stepsProgression[i - 1]);
      expect(isIncreasing).toBe(true);
    }, 35000);

    it('should create backup before deployment', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Setup existing configuration to backup
      await testEnvironment.createTestConfigFiles();
      
      // Create and execute deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(true);
      
      // Verify backup was created
      const backupStep = executionResult.steps.find(s => s.name === 'Create Backup');
      expect(backupStep).toBeDefined();
      expect(backupStep.status).toBe('completed');
      expect(backupStep.backupPath).toBeDefined();
      
      // Verify backup file exists
      const backupExists = await testEnvironment.fileExists(backupStep.backupPath);
      expect(backupExists).toBe(true);
    }, 30000);

    it('should validate configuration before deployment', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create and execute deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(true);
      
      // Verify validation step
      const validationStep = executionResult.steps.find(s => s.name === 'Validate Configuration');
      expect(validationStep).toBeDefined();
      expect(validationStep.status).toBe('completed');
      expect(validationStep.validationResult).toMatchObject({
        valid: true,
        errors: []
      });
    }, 30000);
  });

  describe('Deployment Cancellation', () => {
    it('should cancel queued deployment', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      expect(deployment.state).toBe('queued');
      
      // Cancel deployment
      const cancelResult = await deploymentService.cancelDeployment(deployment.deploymentId);
      
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.previousState).toBe('queued');
      
      // Verify deployment state updated
      const cancelledDeployment = await deploymentService.getDeployment(deployment.deploymentId);
      expect(cancelledDeployment.state).toBe('cancelled');
    });

    it('should handle cancellation of non-existent deployment', async () => {
      await expect(deploymentService.cancelDeployment('deploy-nonexistent'))
        .rejects
        .toThrow(/deployment not found/i);
    });

    it('should reject cancellation of completed deployment', async () => {
      const deploymentId = await testEnvironment.getDbSetup().createCompletedDeployment();
      
      await expect(deploymentService.cancelDeployment(deploymentId))
        .rejects
        .toThrow(/cannot cancel/i);
    });
  });

  describe('Deployment Status and History', () => {
    it('should get current deployment status', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      // Get status
      const status = await deploymentService.getCurrentDeploymentStatus();
      
      expect(status).toMatchObject({
        deploymentId: deployment.deploymentId,
        state: 'queued',
        repository: deploymentRequest.repository,
        branch: deploymentRequest.branch,
        progress: expect.objectContaining({
          currentStep: expect.any(String),
          stepsCompleted: expect.any(Number),
          totalSteps: expect.any(Number)
        })
      });
    });

    it('should return null when no deployment is active', async () => {
      const status = await deploymentService.getCurrentDeploymentStatus();
      expect(status).toBeNull();
    });

    it('should get deployment history with pagination', async () => {
      // Create multiple deployments
      await testEnvironment.getDbSetup().seedDeploymentHistory();
      
      const history = await deploymentService.getDeploymentHistory({
        limit: 2,
        offset: 0
      });
      
      expect(history).toMatchObject({
        deployments: expect.arrayContaining([
          expect.objectContaining({
            deploymentId: expect.any(String),
            state: expect.oneOf(['completed', 'failed']),
            repository: expect.any(String),
            branch: expect.any(String)
          })
        ]),
        pagination: {
          limit: 2,
          offset: 0,
          total: expect.any(Number),
          hasNext: expect.any(Boolean),
          hasPrevious: false
        }
      });
    });

    it('should filter deployment history by status', async () => {
      await testEnvironment.getDbSetup().seedDeploymentHistory();
      
      const completedHistory = await deploymentService.getDeploymentHistory({
        status: 'completed'
      });
      
      expect(completedHistory.deployments.every(d => d.state === 'completed')).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should retry failed deployment steps', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Mock temporary failure
      const originalCloneMethod = deploymentService.mcpCoordinator.cloneRepository;
      let attemptCount = 0;
      
      deploymentService.mcpCoordinator.cloneRepository = async (...args) => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary network error');
        }
        return originalCloneMethod.apply(deploymentService.mcpCoordinator, args);
      };
      
      // Create and execute deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(true);
      expect(attemptCount).toBe(2); // Should have retried once
      
      // Restore original method
      deploymentService.mcpCoordinator.cloneRepository = originalCloneMethod;
    }, 30000);

    it('should handle database connection failures gracefully', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      
      // Temporarily break database connection
      const originalQuery = testEnvironment.getDbSetup().getConnection().query;
      testEnvironment.getDbSetup().getConnection().query = async () => {
        throw new Error('Database connection lost');
      };
      
      // Execute deployment (should handle database errors)
      const executionResult = await deploymentService.executeDeployment(deployment.deploymentId);
      
      // Restore database connection
      testEnvironment.getDbSetup().getConnection().query = originalQuery;
      
      // Deployment should have failed gracefully
      expect(executionResult.success).toBe(false);
      expect(executionResult.error.message).toContain('Database connection lost');
    });

    it('should timeout long-running deployments', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      // Create deployment service with short timeout
      const shortTimeoutService = new DeploymentService({
        database: testEnvironment.getDbSetup().getConnection(),
        mcpCoordinator: testEnvironment.getMCPCoordinator(),
        eventBus: testEnvironment.getEventBus(),
        config: {
          deployment: {
            timeout: 1000, // 1 second timeout
            maxConcurrentDeployments: 1,
            retryAttempts: 1
          }
        }
      });
      
      // Mock long-running operation
      shortTimeoutService.mcpCoordinator.cloneRepository = async () => {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
        return { success: true };
      };
      
      // Create and execute deployment
      const deployment = await shortTimeoutService.createDeployment(deploymentRequest);
      const executionResult = await shortTimeoutService.executeDeployment(deployment.deploymentId);
      
      expect(executionResult.success).toBe(false);
      expect(executionResult.error.message).toContain('timeout');
      
      // Verify deployment marked as failed
      const failedDeployment = await shortTimeoutService.getDeployment(deployment.deploymentId);
      expect(failedDeployment.state).toBe('failed');
    }, 10000);
  });

  describe('Event Integration', () => {
    it('should emit deployment lifecycle events', async () => {
      const deploymentRequest = IntegrationFixtures.validDeploymentRequest({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });
      
      const events = [];
      const eventBus = testEnvironment.getEventBus();
      
      // Listen for events
      eventBus.on('deployment.created', (event) => events.push({ type: 'created', ...event }));
      eventBus.on('deployment.started', (event) => events.push({ type: 'started', ...event }));
      eventBus.on('deployment.step.completed', (event) => events.push({ type: 'step-completed', ...event }));
      eventBus.on('deployment.completed', (event) => events.push({ type: 'completed', ...event }));
      
      // Create and execute deployment
      const deployment = await deploymentService.createDeployment(deploymentRequest);
      await deploymentService.executeDeployment(deployment.deploymentId);
      
      // Verify events were emitted
      expect(events.filter(e => e.type === 'created')).toHaveLength(1);
      expect(events.filter(e => e.type === 'started')).toHaveLength(1);
      expect(events.filter(e => e.type === 'step-completed').length).toBeGreaterThan(0);
      expect(events.filter(e => e.type === 'completed')).toHaveLength(1);
      
      // Verify event data
      const createdEvent = events.find(e => e.type === 'created');
      expect(createdEvent.deploymentId).toBe(deployment.deploymentId);
      
      const completedEvent = events.find(e => e.type === 'completed');
      expect(completedEvent.deploymentId).toBe(deployment.deploymentId);
      expect(completedEvent.success).toBe(true);
    }, 30000);
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
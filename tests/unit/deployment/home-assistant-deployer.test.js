/**
 * Unit tests for Home Assistant Deployer service
 * Tests all core functionality with proper mocking
 */

const HomeAssistantDeployer = require('../../../scripts/services/home-assistant-deployer');
const { MockMCPCoordinator } = require('../../mocks/mcp-coordinator.mock');
const { MockHealthChecker } = require('../../mocks/health-checker.mock');
const { MockBackupManager } = require('../../mocks/backup-manager.mock');
const { DeploymentFixtures } = require('../../fixtures/deployment-data');
const path = require('path');
const fs = require('fs').promises;

// Mock all external dependencies
jest.mock('../../../scripts/services/deployment-queue');
jest.mock('../../../scripts/services/webhook-handler');
jest.mock('../../../scripts/services/mcp-coordinator');
jest.mock('../../../scripts/services/database/deployment-repository');
jest.mock('../../../scripts/services/utils/logger');
jest.mock('../../../scripts/services/utils/validator');
jest.mock('../../../scripts/services/utils/security');

describe('HomeAssistantDeployer', () => {
  let deployer;
  let mockConfig;
  let mockMCPCoordinator;
  let mockDeploymentQueue;
  let mockWebhookHandler;
  let mockDeploymentRepository;
  let mockLogger;
  let mockValidator;
  let mockSecurity;

  beforeEach(async () => {
    // Setup mock configuration
    mockConfig = {
      api: {
        port: 3071,
        host: '0.0.0.0',
        corsOrigins: ['http://localhost:3000']
      },
      webhook: {
        secret: 'test-webhook-secret',
        allowedEvents: ['repository_dispatch', 'push']
      },
      mcp: {
        networkFs: {
          wrapper: '/test/network-mcp-wrapper.sh',
          timeout: 30000
        },
        github: {
          wrapper: '/test/github-wrapper.sh',
          timeout: 30000
        }
      },
      homeAssistantConfig: {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        deploymentTimeout: 300
      },
      loggingConfig: {
        level: 'info',
        logFormat: 'json'
      }
    };

    // Mock fs.readFile to return our mock config
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));

    // Setup mock dependencies
    const MockDeploymentQueue = require('../../../scripts/services/deployment-queue');
    const MockWebhookHandler = require('../../../scripts/services/webhook-handler');
    const MockMCPCoordinator = require('../../../scripts/services/mcp-coordinator');
    const MockDeploymentRepository = require('../../../scripts/services/database/deployment-repository');
    const MockLogger = require('../../../scripts/services/utils/logger');
    const MockValidator = require('../../../scripts/services/utils/validator');
    const MockSecurity = require('../../../scripts/services/utils/security');

    mockDeploymentQueue = {
      enqueue: jest.fn(),
      dequeue: jest.fn(),
      hasItems: jest.fn().mockReturnValue(false),
      getQueueLength: jest.fn().mockReturnValue(0),
      getStatus: jest.fn().mockResolvedValue({ length: 0, processing: false }),
      clear: jest.fn().mockResolvedValue(0)
    };

    mockWebhookHandler = {
      validateSignature: jest.fn().mockResolvedValue(true),
      processWebhook: jest.fn().mockResolvedValue({
        shouldDeploy: false,
        repository: 'festion/home-assistant-config',
        branch: 'main'
      })
    };

    mockMCPCoordinator = {
      initialize: jest.fn().mockResolvedValue(true),
      checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      cleanup: jest.fn().mockResolvedValue(true)
    };

    mockDeploymentRepository = {
      initialize: jest.fn().mockResolvedValue(true),
      createDeployment: jest.fn().mockResolvedValue(true),
      getDeployment: jest.fn(),
      updateDeployment: jest.fn().mockResolvedValue(true),
      getRecentDeployments: jest.fn().mockResolvedValue([]),
      getDeploymentHistory: jest.fn().mockResolvedValue({ deployments: [], total: 0 }),
      getDeploymentLogs: jest.fn().mockResolvedValue([]),
      addDeploymentLog: jest.fn().mockResolvedValue(true),
      checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      close: jest.fn().mockResolvedValue(true)
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockValidator = {
      validateDeploymentRequest: jest.fn()
    };

    mockSecurity = {};

    // Setup mock constructors
    MockDeploymentQueue.mockImplementation(() => mockDeploymentQueue);
    MockWebhookHandler.mockImplementation(() => mockWebhookHandler);
    MockMCPCoordinator.mockImplementation(() => mockMCPCoordinator);
    MockDeploymentRepository.mockImplementation(() => mockDeploymentRepository);
    MockLogger.mockImplementation(() => mockLogger);
    MockValidator.mockImplementation(() => mockValidator);
    MockSecurity.mockImplementation(() => mockSecurity);

    // Create deployer instance
    deployer = new HomeAssistantDeployer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      await expect(deployer.initialize()).resolves.toBe(true);

      expect(fs.readFile).toHaveBeenCalledWith(deployer.configPath, 'utf8');
      expect(mockDeploymentRepository.initialize).toHaveBeenCalled();
      expect(mockMCPCoordinator.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Home Assistant Deployer service initialized successfully',
        expect.objectContaining({
          component: 'HomeAssistantDeployer',
          version: '1.0.0'
        })
      );
    });

    it('should fail initialization with invalid configuration', async () => {
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('Config file not found'));

      await expect(deployer.initialize()).rejects.toThrow('Failed to load configuration: Config file not found');
    });

    it('should fail initialization when MCP coordinator fails', async () => {
      mockMCPCoordinator.initialize.mockRejectedValue(new Error('MCP connection failed'));

      await expect(deployer.initialize()).rejects.toThrow('MCP connection failed');
    });

    it('should configure environment variables correctly', async () => {
      process.env.DEPLOYER_PORT = '3072';
      process.env.DEPLOYER_HOST = '127.0.0.1';
      process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';

      await deployer.initialize();

      expect(deployer.config.api.port).toBe('3072');
      expect(deployer.config.api.host).toBe('127.0.0.1');
      expect(deployer.config.api.corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:3001']);

      // Cleanup
      delete process.env.DEPLOYER_PORT;
      delete process.env.DEPLOYER_HOST;
      delete process.env.CORS_ORIGINS;
    });
  });

  describe('deployment triggering', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should trigger deployment with valid parameters', async () => {
      const deploymentParams = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        requestedBy: 'api',
        priority: 'normal'
      };

      const deploymentId = await deployer.triggerDeployment(deploymentParams);

      expect(deploymentId).toBeValidDeploymentId();
      expect(mockDeploymentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: deploymentId,
          repository: deploymentParams.repository,
          branch: deploymentParams.branch,
          requestedBy: deploymentParams.requestedBy,
          priority: deploymentParams.priority
        })
      );
      expect(mockDeploymentRepository.createDeployment).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deployment triggered',
        expect.objectContaining({ deploymentId })
      );
    });

    it('should use default values for missing parameters', async () => {
      const deploymentParams = {
        requestedBy: 'webhook'
      };

      const deploymentId = await deployer.triggerDeployment(deploymentParams);

      expect(mockDeploymentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: mockConfig.homeAssistantConfig.repository,
          branch: mockConfig.homeAssistantConfig.branch,
          priority: 'normal',
          trigger: 'manual'
        })
      );
    });

    it('should handle webhook data correctly', async () => {
      const webhookData = {
        event: 'push',
        delivery: 'test-delivery-id',
        repository: 'festion/home-assistant-config',
        branch: 'main'
      };

      const deploymentParams = {
        requestedBy: 'webhook',
        trigger: 'github_webhook',
        webhookData
      };

      await deployer.triggerDeployment(deploymentParams);

      expect(mockDeploymentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'github_webhook',
          webhookData
        })
      );
    });

    it('should start queue processing if not already processing', async () => {
      deployer.isProcessingQueue = false;
      jest.spyOn(deployer, 'processDeploymentQueue').mockImplementation(() => {});

      await deployer.triggerDeployment({ requestedBy: 'test' });

      // Use setTimeout to check if processDeploymentQueue was called asynchronously
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(deployer.processDeploymentQueue).toHaveBeenCalled();
    });

    it('should not start queue processing if already processing', async () => {
      deployer.isProcessingQueue = true;
      jest.spyOn(deployer, 'processDeploymentQueue').mockImplementation(() => {});

      await deployer.triggerDeployment({ requestedBy: 'test' });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(deployer.processDeploymentQueue).not.toHaveBeenCalled();
    });
  });

  describe('rollback functionality', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should trigger rollback with valid deployment ID', async () => {
      const originalDeploymentId = 'deploy-20250713-101117';
      const originalDeployment = {
        id: originalDeploymentId,
        backupPath: '/backup/test-backup.tar.gz',
        status: 'completed'
      };

      mockDeploymentRepository.getDeployment.mockResolvedValue(originalDeployment);

      const rollbackId = await deployer.triggerRollback(originalDeploymentId, 'test-correlation-id');

      expect(rollbackId).toBeValidDeploymentId();
      expect(mockDeploymentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rollback',
          originalDeploymentId,
          backupPath: originalDeployment.backupPath,
          priority: 'high'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Rollback triggered',
        expect.objectContaining({ rollbackId, originalDeploymentId })
      );
    });

    it('should fail rollback when deployment not found', async () => {
      mockDeploymentRepository.getDeployment.mockResolvedValue(null);

      await expect(
        deployer.triggerRollback('non-existent-deployment')
      ).rejects.toThrow('No backup available for rollback');
    });

    it('should fail rollback when no backup path exists', async () => {
      const deploymentWithoutBackup = {
        id: 'deploy-20250713-101117',
        status: 'completed'
        // No backupPath
      };

      mockDeploymentRepository.getDeployment.mockResolvedValue(deploymentWithoutBackup);

      await expect(
        deployer.triggerRollback('deploy-20250713-101117')
      ).rejects.toThrow('No backup available for rollback');
    });
  });

  describe('deployment queue processing', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should process empty queue correctly', async () => {
      mockDeploymentQueue.hasItems.mockReturnValue(false);

      await deployer.processDeploymentQueue();

      expect(deployer.isProcessingQueue).toBe(false);
      expect(deployer.currentDeployment).toBeNull();
      expect(mockDeploymentQueue.dequeue).not.toHaveBeenCalled();
    });

    it('should process single deployment successfully', async () => {
      const deployment = {
        id: 'deploy-20250713-101117',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        type: 'normal'
      };

      mockDeploymentQueue.hasItems
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockDeploymentQueue.dequeue.mockResolvedValue(deployment);

      jest.spyOn(deployer, 'executeDeployment').mockResolvedValue(true);

      await deployer.processDeploymentQueue();

      expect(deployer.currentDeployment).toBeNull();
      expect(deployer.isProcessingQueue).toBe(false);
      expect(deployer.executeDeployment).toHaveBeenCalledWith(deployment);
    });

    it('should handle deployment execution failure', async () => {
      const deployment = {
        id: 'deploy-20250713-101117',
        repository: 'festion/home-assistant-config',
        branch: 'main'
      };

      mockDeploymentQueue.hasItems
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockDeploymentQueue.dequeue.mockResolvedValue(deployment);

      const deploymentError = new Error('Deployment script failed');
      jest.spyOn(deployer, 'executeDeployment').mockRejectedValue(deploymentError);

      await deployer.processDeploymentQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deployment execution failed',
        expect.objectContaining({
          deploymentId: deployment.id,
          error: deploymentError.message
        })
      );
      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        deployment.id,
        expect.objectContaining({
          status: deployer.deploymentStates.FAILED,
          error: deploymentError.message
        })
      );
    });

    it('should prevent concurrent queue processing', async () => {
      deployer.isProcessingQueue = true;

      await deployer.processDeploymentQueue();

      expect(mockDeploymentQueue.hasItems).not.toHaveBeenCalled();
    });

    it('should process multiple deployments in order', async () => {
      const deployment1 = { id: 'deploy-1', repository: 'repo1' };
      const deployment2 = { id: 'deploy-2', repository: 'repo2' };

      mockDeploymentQueue.hasItems
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockDeploymentQueue.dequeue
        .mockResolvedValueOnce(deployment1)
        .mockResolvedValueOnce(deployment2);

      jest.spyOn(deployer, 'executeDeployment').mockResolvedValue(true);

      await deployer.processDeploymentQueue();

      expect(deployer.executeDeployment).toHaveBeenCalledTimes(2);
      expect(deployer.executeDeployment).toHaveBeenNthCalledWith(1, deployment1);
      expect(deployer.executeDeployment).toHaveBeenNthCalledWith(2, deployment2);
    });
  });

  describe('deployment execution', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should execute normal deployment successfully', async () => {
      const deployment = {
        id: 'deploy-20250713-101117',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        dryRun: false
      };

      jest.spyOn(deployer, 'executeNormalDeployment').mockResolvedValue(true);

      await deployer.executeDeployment(deployment);

      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        deployment.id,
        expect.objectContaining({
          status: deployer.deploymentStates.IN_PROGRESS
        })
      );
      expect(deployer.executeNormalDeployment).toHaveBeenCalledWith(deployment);
      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        deployment.id,
        expect.objectContaining({
          status: deployer.deploymentStates.COMPLETED
        })
      );
    });

    it('should execute rollback deployment successfully', async () => {
      const rollback = {
        id: 'rollback-20250713-101117',
        type: 'rollback',
        originalDeploymentId: 'deploy-20250713-101000',
        backupPath: '/backup/test.tar.gz'
      };

      jest.spyOn(deployer, 'executeRollback').mockResolvedValue(true);

      await deployer.executeDeployment(rollback);

      expect(deployer.executeRollback).toHaveBeenCalledWith(rollback);
      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        rollback.id,
        expect.objectContaining({
          status: deployer.deploymentStates.COMPLETED
        })
      );
    });

    it('should handle execution failure and mark as failed', async () => {
      const deployment = {
        id: 'deploy-20250713-101117',
        repository: 'festion/home-assistant-config',
        branch: 'main'
      };

      const executionError = new Error('Script execution failed');
      jest.spyOn(deployer, 'executeNormalDeployment').mockRejectedValue(executionError);

      await expect(deployer.executeDeployment(deployment)).rejects.toThrow(executionError);

      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        deployment.id,
        expect.objectContaining({
          status: deployer.deploymentStates.FAILED,
          error: executionError.message
        })
      );
    });
  });

  describe('webhook handling', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should process valid webhook with deployment trigger', async () => {
      const webhookPayload = DeploymentFixtures.webhookPayloads.pushEvent();
      
      mockWebhookHandler.processWebhook.mockResolvedValue({
        shouldDeploy: true,
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      jest.spyOn(deployer, 'triggerDeployment').mockResolvedValue('deploy-123');

      const req = {
        get: jest.fn((header) => {
          const headers = {
            'X-Hub-Signature-256': 'sha256=valid-signature',
            'X-GitHub-Event': 'push',
            'X-GitHub-Delivery': 'test-delivery-id'
          };
          return headers[header];
        }),
        body: webhookPayload,
        correlationId: 'test-correlation-id'
      };

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleWebhook(req, res);

      expect(mockWebhookHandler.validateSignature).toHaveBeenCalled();
      expect(mockWebhookHandler.processWebhook).toHaveBeenCalled();
      expect(deployer.triggerDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: 'festion/home-assistant-config',
          branch: 'main',
          requestedBy: 'webhook',
          trigger: 'github_webhook'
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          shouldDeploy: true,
          deploymentId: 'deploy-123'
        })
      );
    });

    it('should reject webhook with invalid signature', async () => {
      mockWebhookHandler.validateSignature.mockResolvedValue(false);

      const req = {
        get: jest.fn().mockReturnValue('invalid-signature'),
        body: {},
        correlationId: 'test-correlation-id'
      };

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid signature'
        })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid webhook signature',
        expect.anything()
      );
    });

    it('should handle webhook processing without deployment trigger', async () => {
      mockWebhookHandler.processWebhook.mockResolvedValue({
        shouldDeploy: false,
        reason: 'No relevant changes detected'
      });

      const req = {
        get: jest.fn().mockReturnValue('valid-signature'),
        body: {},
        correlationId: 'test-correlation-id'
      };

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          shouldDeploy: false,
          reason: 'No relevant changes detected'
        })
      );
    });
  });

  describe('status updates and broadcasting', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should update deployment status successfully', async () => {
      const deploymentId = 'deploy-20250713-101117';
      const status = deployer.deploymentStates.COMPLETED;
      const additionalData = { completedAt: new Date().toISOString() };

      await deployer.updateDeploymentStatus(deploymentId, status, additionalData);

      expect(mockDeploymentRepository.updateDeployment).toHaveBeenCalledWith(
        deploymentId,
        expect.objectContaining({
          status,
          ...additionalData,
          updatedAt: expect.any(String)
        })
      );
    });

    it('should handle status update failure gracefully', async () => {
      const updateError = new Error('Database connection failed');
      mockDeploymentRepository.updateDeployment.mockRejectedValue(updateError);

      await deployer.updateDeploymentStatus('deploy-123', 'completed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update deployment status',
        expect.objectContaining({
          deploymentId: 'deploy-123',
          status: 'completed',
          error: updateError.message
        })
      );
    });

    it('should broadcast updates when WebSocket is available', () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };
      deployer.io = mockIo;

      const eventData = { deploymentId: 'deploy-123', status: 'completed' };
      deployer.broadcastUpdate('deployment_completed', eventData);

      expect(mockIo.to).toHaveBeenCalledWith('deployments');
      expect(mockIo.emit).toHaveBeenCalledWith(
        'deployment_completed',
        expect.objectContaining({
          ...eventData,
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle broadcasting when WebSocket is not available', () => {
      deployer.io = null;

      expect(() => {
        deployer.broadcastUpdate('test_event', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should return healthy status when all dependencies are healthy', async () => {
      const req = { correlationId: 'test-correlation-id' };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleHealthCheck(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          version: '1.0.0',
          dependencies: expect.objectContaining({
            mcp: expect.objectContaining({ status: 'healthy' }),
            database: expect.objectContaining({ status: 'healthy' }),
            queue: expect.objectContaining({ status: 'healthy' })
          })
        })
      );
    });

    it('should return degraded status when dependencies are unhealthy', async () => {
      mockMCPCoordinator.checkHealth.mockResolvedValue({ status: 'unhealthy' });

      const req = { correlationId: 'test-correlation-id' };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded'
        })
      );
    });

    it('should handle health check failure', async () => {
      const healthError = new Error('Health check failed');
      mockMCPCoordinator.checkHealth.mockRejectedValue(healthError);

      const req = { correlationId: 'test-correlation-id' };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          error: healthError.message
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await deployer.initialize();
      jest.clearAllMocks();
    });

    it('should handle validation errors in deployment request', async () => {
      const validationError = new Error('Invalid repository format');
      mockValidator.validateDeploymentRequest.mockRejectedValue(validationError);

      const req = {
        body: { repository: 'invalid-format' },
        correlationId: 'test-correlation-id'
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleDeploy(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: validationError.message
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDeploymentRepository.createDeployment.mockRejectedValue(dbError);
      mockValidator.validateDeploymentRequest.mockResolvedValue({
        repository: 'festion/home-assistant-config',
        branch: 'main'
      });

      const req = {
        body: { repository: 'festion/home-assistant-config' },
        correlationId: 'test-correlation-id'
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await deployer.handleDeploy(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to queue deployment',
        expect.objectContaining({
          error: dbError.message
        })
      );
    });
  });
});
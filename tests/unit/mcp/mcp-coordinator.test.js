/**
 * Unit tests for MCP Coordinator
 * Tests all MCP server coordination and communication functionality
 */

const MCPCoordinator = require('../../../scripts/services/mcp-coordinator');
const { DeploymentFixtures } = require('../../fixtures/deployment-data');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const EventEmitter = require('events');

// Mock child_process and fs
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn()
  }
}));

describe('MCPCoordinator', () => {
  let coordinator;
  let mockLogger;
  let mockProcess;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();

    spawn.mockReturnValue(mockProcess);
    fs.access.mockResolvedValue(true);

    coordinator = new MCPCoordinator({
      networkFsWrapper: '/test/network-mcp-wrapper.sh',
      githubWrapper: '/test/github-wrapper.sh',
      timeout: 30000,
      logger: mockLogger,
      healthCheckInterval: 60000,
      maxRetries: 3
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (coordinator.healthCheckTimer) {
      clearInterval(coordinator.healthCheckTimer);
    }
  });

  describe('initialization', () => {
    it('should initialize successfully with valid wrapper paths', async () => {
      // Mock successful connection tests
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ success: true }));
        mockProcess.emit('close', 0);
      }, 10);

      await expect(coordinator.initialize()).resolves.toBe(true);

      expect(fs.access).toHaveBeenCalledWith('/test/network-mcp-wrapper.sh');
      expect(fs.access).toHaveBeenCalledWith('/test/github-wrapper.sh');
      expect(coordinator.connections.size).toBe(2);
      expect(coordinator.connections.has('networkFs')).toBe(true);
      expect(coordinator.connections.has('github')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('MCP coordinator initialized successfully');
    });

    it('should fail initialization when wrapper scripts do not exist', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(coordinator.initialize()).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize MCP coordinator',
        expect.objectContaining({
          error: expect.stringContaining('ENOENT')
        })
      );
    });

    it('should handle missing wrapper paths gracefully', async () => {
      const coordinatorWithMissingPaths = new MCPCoordinator({
        networkFsWrapper: null,
        githubWrapper: '/test/github-wrapper.sh',
        logger: mockLogger
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ success: true }));
        mockProcess.emit('close', 0);
      }, 10);

      await coordinatorWithMissingPaths.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No wrapper path provided for networkFs, skipping initialization'
      );
      expect(coordinatorWithMissingPaths.connections.size).toBe(1);
      expect(coordinatorWithMissingPaths.connections.has('github')).toBe(true);
    });

    it('should set connection to error state when test fails', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Connection failed');
        mockProcess.emit('close', 1);
      }, 10);

      await coordinator.initialize();

      const networkFsConnection = coordinator.connections.get('networkFs');
      expect(networkFsConnection.state).toBe(coordinator.connectionStates.ERROR);
      expect(networkFsConnection.lastError).toContain('Command failed with exit code 1');
    });
  });

  describe('connection testing', () => {
    beforeEach(async () => {
      // Setup connections without testing
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: coordinator.connectionStates.DISCONNECTED,
        lastHealthCheck: null,
        lastError: null,
        retryCount: 0,
        process: null
      });
    });

    it('should test connection successfully', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ directories: ['/allowed'] }));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.testConnection('networkFs');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('directories');
      
      const connection = coordinator.connections.get('networkFs');
      expect(connection.state).toBe(coordinator.connectionStates.CONNECTED);
      expect(connection.lastHealthCheck).toBeTruthy();
      expect(connection.retryCount).toBe(0);
    });

    it('should handle connection test failure', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Authentication failed');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(coordinator.testConnection('networkFs')).rejects.toThrow('Command failed with exit code 1');
      
      const connection = coordinator.connections.get('networkFs');
      expect(connection.state).toBe(coordinator.connectionStates.ERROR);
      expect(connection.lastError).toContain('Authentication failed');
      expect(connection.retryCount).toBe(1);
    });

    it('should handle connection test timeout', async () => {
      const fastTimeout = new MCPCoordinator({
        networkFsWrapper: '/test/network-mcp-wrapper.sh',
        timeout: 100,
        logger: mockLogger
      });
      
      fastTimeout.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: fastTimeout.connectionStates.DISCONNECTED,
        lastHealthCheck: null,
        lastError: null,
        retryCount: 0,
        process: null
      });

      // Don't emit any events to simulate hanging process
      await expect(
        fastTimeout.testConnection('networkFs')
      ).rejects.toThrow('Command timeout after');
    });

    it('should fail when testing non-existent connection', async () => {
      await expect(
        coordinator.testConnection('nonexistent')
      ).rejects.toThrow('Connection nonexistent not found');
    });
  });

  describe('command execution', () => {
    beforeEach(() => {
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });
    });

    it('should execute command successfully', async () => {
      const expectedOutput = JSON.stringify({ files: ['config.yaml', 'secrets.yaml'] });
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', expectedOutput);
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.executeCommand('networkFs', ['list_network_directory', 'home-assistant', '/config']);

      expect(result.stdout).toBe(expectedOutput);
      expect(result.exitCode).toBe(0);
      expect(result.commandId).toBeTruthy();
      expect(result.duration).toBeGreaterThan(0);
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'list_network_directory', 'home-assistant', '/config'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000
        })
      );
    });

    it('should test connection if disconnected before executing command', async () => {
      coordinator.connections.get('networkFs').state = coordinator.connectionStates.DISCONNECTED;
      
      let callCount = 0;
      setTimeout(() => {
        callCount++;
        mockProcess.stdout.emit('data', callCount === 1 ? '{"success": true}' : '{"files": []}');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.executeCommand('networkFs', ['test_command']);

      expect(result.exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(2); // One for test, one for actual command
    });

    it('should handle command execution failure', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Network timeout');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(
        coordinator.executeCommand('networkFs', ['failing_command'])
      ).rejects.toThrow('Command failed with exit code 1: Network timeout');

      const connection = coordinator.connections.get('networkFs');
      expect(connection.lastError).toContain('Network timeout');
    });

    it('should detect connection loss on timeout error', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Connection timeout occurred');
        mockProcess.emit('close', 1);
      }, 10);

      const errorPromise = coordinator.executeCommand('networkFs', ['test']);
      
      // Listen for connection_lost event
      const connectionLostPromise = new Promise(resolve => {
        coordinator.once('connection_lost', resolve);
      });

      await expect(errorPromise).rejects.toThrow();
      await expect(connectionLostPromise).resolves.toBe('networkFs');

      const connection = coordinator.connections.get('networkFs');
      expect(connection.state).toBe(coordinator.connectionStates.ERROR);
    });

    it('should fail when executing command on non-existent connection', async () => {
      await expect(
        coordinator.executeCommand('nonexistent', ['test'])
      ).rejects.toThrow('Connection nonexistent not found');
    });
  });

  describe('network FS operations', () => {
    beforeEach(() => {
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });
    });

    it('should list directory successfully', async () => {
      const expectedFiles = [
        { name: 'configuration.yaml', type: 'file', size: 1024 },
        { name: 'automations.yaml', type: 'file', size: 2048 }
      ];
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(expectedFiles));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.networkFsOperation('list_directory', {
        shareName: 'home-assistant',
        path: '/config'
      });

      expect(result.stdout).toBe(JSON.stringify(expectedFiles));
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'list_network_directory', 'home-assistant', '/config'],
        expect.any(Object)
      );
    });

    it('should read file successfully', async () => {
      const fileContent = 'homeassistant:\n  name: Home\n  latitude: 40.7128';
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', fileContent);
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.networkFsOperation('read_file', {
        shareName: 'home-assistant',
        filePath: '/config/configuration.yaml',
        encoding: 'utf-8'
      });

      expect(result.stdout).toBe(fileContent);
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'read_network_file', 'home-assistant', '/config/configuration.yaml', 'utf-8'],
        expect.any(Object)
      );
    });

    it('should write file successfully', async () => {
      const fileContent = 'automation:\n  - alias: "Test Automation"';
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', '{"success": true}');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.networkFsOperation('write_file', {
        shareName: 'home-assistant',
        filePath: '/config/automations.yaml',
        content: fileContent,
        encoding: 'utf-8'
      });

      expect(result.exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'write_network_file', 'home-assistant', '/config/automations.yaml', fileContent, 'utf-8'],
        expect.any(Object)
      );
    });

    it('should create directory successfully', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', '{"created": true}');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.networkFsOperation('create_directory', {
        shareName: 'home-assistant',
        directoryPath: '/config/packages'
      });

      expect(result.exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'create_network_directory', 'home-assistant', '/config/packages'],
        expect.any(Object)
      );
    });

    it('should handle unknown operations', async () => {
      await expect(
        coordinator.networkFsOperation('unknown_operation', {})
      ).rejects.toThrow('Unknown network FS operation: unknown_operation');
    });

    it('should filter empty parameters correctly', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', '{"shares": []}');
        mockProcess.emit('close', 0);
      }, 10);

      await coordinator.networkFsOperation('get_share_info', {
        shareName: '' // Empty string should be filtered
      });

      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/network-mcp-wrapper.sh', 'get_share_info'],
        expect.any(Object)
      );
    });
  });

  describe('GitHub operations', () => {
    beforeEach(() => {
      coordinator.connections.set('github', {
        name: 'github',
        wrapperPath: '/test/github-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });
    });

    it('should get user info successfully', async () => {
      const userInfo = {
        login: 'festion',
        id: 12345,
        name: 'Test User'
      };
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(userInfo));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.githubOperation('get_me', {});

      expect(result.stdout).toBe(JSON.stringify(userInfo));
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/github-wrapper.sh', 'get_me'],
        expect.any(Object)
      );
    });

    it('should get file contents successfully', async () => {
      const fileContent = 'homeassistant:\n  name: Home';
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', fileContent);
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.githubOperation('get_file_contents', {
        owner: 'festion',
        repo: 'home-assistant-config',
        path: 'configuration.yaml',
        ref: 'main'
      });

      expect(result.stdout).toBe(fileContent);
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/github-wrapper.sh', 'get_file_contents', 'festion', 'home-assistant-config', 'configuration.yaml', 'main'],
        expect.any(Object)
      );
    });

    it('should list commits successfully', async () => {
      const commits = [
        { sha: 'abc123', message: 'Update configuration' },
        { sha: 'def456', message: 'Add new automation' }
      ];
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(commits));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.githubOperation('list_commits', {
        owner: 'festion',
        repo: 'home-assistant-config',
        sha: 'main'
      });

      expect(result.stdout).toBe(JSON.stringify(commits));
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/github-wrapper.sh', 'list_commits', 'festion', 'home-assistant-config', 'main'],
        expect.any(Object)
      );
    });

    it('should handle unknown GitHub operations', async () => {
      await expect(
        coordinator.githubOperation('unknown_operation', {})
      ).rejects.toThrow('Unknown GitHub operation: unknown_operation');
    });

    it('should create issue successfully', async () => {
      const issueData = {
        number: 42,
        title: 'Test Issue',
        state: 'open'
      };
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(issueData));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.githubOperation('create_issue', {
        owner: 'festion',
        repo: 'home-assistant-config',
        title: 'Test Issue',
        body: 'Issue description'
      });

      expect(result.stdout).toBe(JSON.stringify(issueData));
      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['/test/github-wrapper.sh', 'create_issue', 'festion', 'home-assistant-config', 'Test Issue', 'Issue description'],
        expect.any(Object)
      );
    });
  });

  describe('deployment operations', () => {
    beforeEach(() => {
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });

      coordinator.connections.set('github', {
        name: 'github',
        wrapperPath: '/test/github-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });
    });

    it('should execute deployment operations successfully', async () => {
      const deploymentParams = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        deploymentId: 'deploy-20250713-101117',
        createBackup: false // Skip backup for this test
      };

      // Mock responses in sequence
      let callCount = 0;
      setTimeout(() => {
        callCount++;
        let response;
        
        switch (callCount) {
          case 1: // list_directory for current config
            response = JSON.stringify([
              { name: 'configuration.yaml', type: 'file' },
              { name: 'automations.yaml', type: 'file' }
            ]);
            break;
          case 2: // list_commits from GitHub
            response = JSON.stringify([
              { sha: 'abc123', message: 'Latest commit' }
            ]);
            break;
          case 3: // create_directory for legacy backup
            response = '{"created": true}';
            break;
          case 4: // get_file_contents for repo root
            response = JSON.stringify([
              { name: 'configuration.yaml', type: 'file', path: 'configuration.yaml' },
              { name: 'automations.yaml', type: 'file', path: 'automations.yaml' }
            ]);
            break;
          case 5: // get_file_contents for configuration.yaml
            response = 'homeassistant:\n  name: Home';
            break;
          case 6: // write_file for configuration.yaml
            response = '{"written": true}';
            break;
          case 7: // get_file_contents for automations.yaml
            response = 'automation:\n  - alias: "Test"';
            break;
          case 8: // write_file for automations.yaml
            response = '{"written": true}';
            break;
          default:
            response = '{"success": true}';
        }
        
        mockProcess.stdout.emit('data', response);
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.deploymentOperations(deploymentParams);

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(6); // Should have multiple operations
      expect(result.deployedFiles).toBe(2);
      expect(result.backupPath).toBeTruthy();
      expect(mockLogger.info).toHaveBeenCalledWith('Fetching current configuration', {
        repository: deploymentParams.repository
      });
    });

    it('should handle deployment failure gracefully', async () => {
      const deploymentParams = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        createBackup: false
      };

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Network error');
        mockProcess.emit('close', 1);
      }, 10);

      const result = await coordinator.deploymentOperations(deploymentParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command failed with exit code 1');
      expect(result.operations).toHaveLength(2); // Initial operations plus failure
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deployment operations failed',
        expect.objectContaining({
          error: expect.stringContaining('Command failed'),
          operations: 2
        })
      );
    });

    it('should skip backup when createBackup is false', async () => {
      const deploymentParams = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        createBackup: false
      };

      setTimeout(() => {
        mockProcess.stdout.emit('data', '[]');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await coordinator.deploymentOperations(deploymentParams);

      // Should not have a backup operation in the results
      const backupOperation = result.operations.find(op => op.operation === 'create_pre_deployment_backup');
      expect(backupOperation).toBeUndefined();
    });
  });

  describe('health checks', () => {
    beforeEach(() => {
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        wrapperPath: '/test/network-mcp-wrapper.sh',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0,
        process: null
      });

      coordinator.connections.set('github', {
        name: 'github',
        wrapperPath: '/test/github-wrapper.sh',
        state: coordinator.connectionStates.ERROR,
        lastHealthCheck: null,
        lastError: 'Connection timeout',
        retryCount: 1,
        process: null
      });
    });

    it('should return health status for all connections', async () => {
      const health = await coordinator.checkHealth();

      expect(health.status).toBe('degraded'); // One connection is in error state
      expect(health.connections).toHaveProperty('networkFs');
      expect(health.connections).toHaveProperty('github');
      expect(health.connections.networkFs.status).toBe(coordinator.connectionStates.CONNECTED);
      expect(health.connections.github.status).toBe(coordinator.connectionStates.ERROR);
      expect(health.connections.github.lastError).toBe('Connection timeout');
    });

    it('should return healthy status when all connections are healthy', async () => {
      coordinator.connections.get('github').state = coordinator.connectionStates.CONNECTED;

      const health = await coordinator.checkHealth();

      expect(health.status).toBe('healthy');
    });

    it('should perform periodic health checks', async () => {
      jest.spyOn(coordinator, 'performHealthChecks').mockResolvedValue();
      
      coordinator.healthCheckInterval = 50; // Fast interval for testing
      coordinator.startHealthChecks();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(coordinator.performHealthChecks).toHaveBeenCalled();
      clearInterval(coordinator.healthCheckTimer);
    });

    it('should attempt reconnection for failed connections', async () => {
      jest.spyOn(coordinator, 'testConnection').mockResolvedValue({ success: true });

      await coordinator.performHealthChecks();

      expect(coordinator.testConnection).toHaveBeenCalledWith('github');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Attempting to reconnect MCP connection',
        expect.objectContaining({
          name: 'github',
          retryCount: 1,
          maxRetries: 3
        })
      );
    });

    it('should not attempt reconnection when max retries exceeded', async () => {
      coordinator.connections.get('github').retryCount = 5; // Exceeds maxRetries
      jest.spyOn(coordinator, 'testConnection').mockResolvedValue({ success: true });

      await coordinator.performHealthChecks();

      expect(coordinator.testConnection).not.toHaveBeenCalledWith('github');
    });
  });

  describe('connection status methods', () => {
    beforeEach(() => {
      coordinator.connections.set('networkFs', {
        name: 'networkFs',
        state: coordinator.connectionStates.CONNECTED,
        lastHealthCheck: new Date().toISOString(),
        lastError: null,
        retryCount: 0
      });
    });

    it('should get connection status by name', () => {
      const status = coordinator.getConnectionStatus('networkFs');
      expect(status).toBe(coordinator.connectionStates.CONNECTED);
    });

    it('should return not_found for non-existent connection', () => {
      const status = coordinator.getConnectionStatus('nonexistent');
      expect(status).toBe('not_found');
    });

    it('should get all connections', () => {
      const connections = coordinator.getAllConnections();
      
      expect(connections).toHaveProperty('networkFs');
      expect(connections.networkFs).toEqual(
        expect.objectContaining({
          name: 'networkFs',
          state: coordinator.connectionStates.CONNECTED,
          retryCount: 0
        })
      );
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      coordinator.healthCheckTimer = setInterval(() => {}, 1000);
      
      const mockProcess = {
        killed: false,
        kill: jest.fn()
      };
      
      coordinator.connections.set('test', {
        name: 'test',
        process: mockProcess
      });
    });

    it('should cleanup resources properly', async () => {
      const connection = coordinator.connections.get('test');
      
      await coordinator.cleanup();

      expect(coordinator.healthCheckTimer).toBeNull();
      expect(connection.process.kill).toHaveBeenCalledWith('SIGTERM');
      expect(coordinator.connections.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('MCP coordinator cleaned up');
    });

    it('should handle cleanup when no health check timer exists', async () => {
      coordinator.healthCheckTimer = null;

      await expect(coordinator.cleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup when processes are already killed', async () => {
      coordinator.connections.get('test').process.killed = true;

      await coordinator.cleanup();

      expect(coordinator.connections.get('test').process.kill).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should emit connection_established event on successful test', async () => {
      coordinator.connections.set('test', {
        name: 'test',
        wrapperPath: '/test/wrapper.sh',
        state: coordinator.connectionStates.DISCONNECTED
      });

      const eventPromise = new Promise(resolve => {
        coordinator.once('connection_established', resolve);
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', '{"success": true}');
        mockProcess.emit('close', 0);
      }, 10);

      await coordinator.testConnection('test');
      const eventData = await eventPromise;

      expect(eventData).toBe('test');
    });

    it('should emit connection_failed event on test failure', async () => {
      coordinator.connections.set('test', {
        name: 'test',
        wrapperPath: '/test/wrapper.sh',
        state: coordinator.connectionStates.DISCONNECTED
      });

      const eventPromise = new Promise(resolve => {
        coordinator.once('connection_failed', resolve);
      });

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Connection failed');
        mockProcess.emit('close', 1);
      }, 10);

      try {
        await coordinator.testConnection('test');
      } catch (error) {
        // Expected to fail
      }

      const eventData = await eventPromise;
      expect(eventData.name).toBe('test');
      expect(eventData.error).toContain('Connection failed');
    });
  });
});
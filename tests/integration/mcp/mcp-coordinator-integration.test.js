const { MCPCoordinator } = require('../../../api/services/mcp-coordinator');
const { TestEnvironment } = require('../setup/test-environment');
const { IntegrationFixtures } = require('../fixtures/integration-data');

describe('MCP Coordinator Integration', () => {
  let mcpCoordinator;
  let testEnvironment;

  beforeAll(async () => {
    testEnvironment = new TestEnvironment();
    await testEnvironment.initialize();
    
    mcpCoordinator = new MCPCoordinator({
      networkFs: {
        serverName: 'networkFs',
        enabled: true
      },
      github: {
        serverName: 'github',
        enabled: true
      }
    });
    
    await mcpCoordinator.initialize();
  }, 45000);

  afterAll(async () => {
    if (mcpCoordinator) {
      await mcpCoordinator.disconnect();
    }
    await testEnvironment.cleanup();
  }, 15000);

  beforeEach(async () => {
    // Clear any test files
    await testEnvironment.cleanupTestConfigFiles();
  });

  afterEach(async () => {
    // Cleanup test files after each test
    await testEnvironment.cleanupTestConfigFiles();
  });

  describe('MCP Server Connections', () => {
    it('should connect to Network-FS MCP server', async () => {
      const status = mcpCoordinator.getConnectionStatus('networkFs');
      
      expect(status).toMatchObject({
        status: 'connected',
        lastCheck: expect.any(Date)
      });
    });

    it('should connect to GitHub MCP server', async () => {
      const status = mcpCoordinator.getConnectionStatus('github');
      
      expect(status).toMatchObject({
        status: 'connected',
        lastCheck: expect.any(Date)
      });
    });

    it('should validate MCP server capabilities', async () => {
      const networkFsCapabilities = await mcpCoordinator.getServerCapabilities('networkFs');
      const githubCapabilities = await mcpCoordinator.getServerCapabilities('github');
      
      expect(networkFsCapabilities).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('fs') })
        ])
      });
      
      expect(githubCapabilities).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('github') })
        ])
      });
    });
  });

  describe('Network-FS MCP Integration', () => {
    it('should perform file operations', async () => {
      const testFile = '/tmp/integration-test-config.yaml';
      const targetFile = '/tmp/integration-target-config.yaml';
      const testContent = `
homeassistant:
  name: Integration Test Home
  unit_system: metric
  time_zone: UTC

automation:
  - alias: Test Integration Automation
    trigger:
      platform: state
      entity_id: sensor.test
    action:
      service: light.turn_on
      entity_id: light.test
`;
      
      // Create test file
      await testEnvironment.createTestFile(testFile, testContent);
      
      // Transfer file using MCP
      const result = await mcpCoordinator.transferFile(testFile, targetFile);
      
      expect(result.success).toBe(true);
      expect(result.sourceSize).toBeGreaterThan(0);
      expect(result.targetSize).toBe(result.sourceSize);
      
      // Verify file was transferred correctly
      const targetExists = await testEnvironment.fileExists(targetFile);
      expect(targetExists).toBe(true);
      
      const transferredContent = await testEnvironment.readFile(targetFile);
      expect(transferredContent.trim()).toBe(testContent.trim());
      
      // Cleanup
      await testEnvironment.deleteFile(testFile);
      await testEnvironment.deleteFile(targetFile);
    });

    it('should create and verify backups', async () => {
      const configPath = '/tmp/integration-test-config';
      const backupPath = '/tmp/integration-test-backup.tar.gz';
      
      // Create test configuration directory
      await testEnvironment.createTestDirectory(configPath);
      await testEnvironment.createTestFile(
        `${configPath}/configuration.yaml`,
        'homeassistant:\n  name: Test\n'
      );
      await testEnvironment.createTestFile(
        `${configPath}/scripts.yaml`,
        'test_script:\n  sequence:\n    - service: light.turn_on\n'
      );
      
      // Create backup using MCP
      const result = await mcpCoordinator.createBackup(configPath, backupPath);
      
      expect(result.success).toBe(true);
      expect(result.backupSize).toBeGreaterThan(0);
      expect(result.filesIncluded).toBeGreaterThanOrEqual(2);
      
      // Verify backup exists
      const backupExists = await testEnvironment.fileExists(backupPath);
      expect(backupExists).toBe(true);
      
      // Verify backup integrity
      const verifyResult = await mcpCoordinator.verifyBackup(backupPath);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.filesCount).toBe(result.filesIncluded);
      
      // Cleanup
      await testEnvironment.deleteDirectory(configPath);
      await testEnvironment.deleteFile(backupPath);
    });

    it('should handle file operation errors gracefully', async () => {
      const nonExistentFile = '/tmp/non-existent-file.yaml';
      const targetFile = '/tmp/target.yaml';
      
      const result = await mcpCoordinator.transferFile(nonExistentFile, targetFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('SOURCE_FILE_NOT_FOUND');
    });

    it('should validate file permissions', async () => {
      const testFile = '/tmp/readonly-test.yaml';
      
      // Create test file
      await testEnvironment.createTestFile(testFile, 'test: content');
      
      // Make file readonly (simulate permission issue)
      const fs = require('fs');
      fs.chmodSync(testFile, 0o444);
      
      const result = await mcpCoordinator.validateFileAccess(testFile, 'write');
      
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('insufficient_permissions');
      
      // Cleanup
      fs.chmodSync(testFile, 0o644);
      await testEnvironment.deleteFile(testFile);
    });
  });

  describe('GitHub MCP Integration', () => {
    it('should clone repository', async () => {
      const repository = 'festion/home-assistant-config';
      const targetPath = '/tmp/integration-test-repo';
      
      const result = await mcpCoordinator.cloneRepository(repository, 'main', targetPath);
      
      expect(result.success).toBe(true);
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.filesCloned).toBeGreaterThan(0);
      
      // Verify repository was cloned
      const repoExists = await testEnvironment.directoryExists(targetPath);
      expect(repoExists).toBe(true);
      
      // Verify git directory exists
      const gitExists = await testEnvironment.directoryExists(`${targetPath}/.git`);
      expect(gitExists).toBe(true);
      
      // Verify configuration file exists
      const configExists = await testEnvironment.fileExists(`${targetPath}/configuration.yaml`);
      expect(configExists).toBe(true);
      
      // Cleanup
      await testEnvironment.deleteDirectory(targetPath);
    });

    it('should get file content from repository', async () => {
      const repository = 'festion/home-assistant-config';
      const filePath = 'configuration.yaml';
      
      const result = await mcpCoordinator.getFileContent(repository, 'main', filePath);
      
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.sha).toMatch(/^[a-f0-9]+$/);
      
      // Verify content contains Home Assistant configuration
      expect(result.content).toContain('homeassistant:');
    });

    it('should validate repository access', async () => {
      const validRepo = 'festion/home-assistant-config';
      const invalidRepo = 'nonexistent/repository';
      
      const validResult = await mcpCoordinator.validateRepositoryAccess(validRepo);
      const invalidResult = await mcpCoordinator.validateRepositoryAccess(invalidRepo);
      
      expect(validResult.hasAccess).toBe(true);
      expect(validResult.permissions).toContain('read');
      
      expect(invalidResult.hasAccess).toBe(false);
      expect(invalidResult.error).toBeDefined();
    });

    it('should get repository metadata', async () => {
      const repository = 'festion/home-assistant-config';
      
      const result = await mcpCoordinator.getRepositoryMetadata(repository);
      
      expect(result.success).toBe(true);
      expect(result.metadata).toMatchObject({
        name: expect.any(String),
        fullName: repository,
        defaultBranch: expect.any(String),
        private: expect.any(Boolean),
        lastUpdated: expect.any(String)
      });
    });

    it('should handle GitHub API rate limiting', async () => {
      // Simulate multiple rapid requests
      const repository = 'festion/home-assistant-config';
      const requests = Array.from({ length: 5 }, () =>
        mcpCoordinator.getRepositoryMetadata(repository)
      );
      
      const results = await Promise.all(requests);
      
      // All requests should either succeed or return rate limit info
      results.forEach(result => {
        if (!result.success) {
          expect(result.error.code).toBe('RATE_LIMITED');
          expect(result.retryAfter).toBeDefined();
        }
      });
    });
  });

  describe('Health Monitoring Integration', () => {
    it('should monitor MCP server health', async () => {
      await mcpCoordinator.checkHealth();
      
      const networkFsHealth = mcpCoordinator.getHealthStatus('networkFs');
      const githubHealth = mcpCoordinator.getHealthStatus('github');
      
      expect(networkFsHealth.status).toBe('healthy');
      expect(networkFsHealth.lastCheck).toBeInstanceOf(Date);
      expect(networkFsHealth.responseTime).toBeGreaterThan(0);
      
      expect(githubHealth.status).toBe('healthy');
      expect(githubHealth.lastCheck).toBeInstanceOf(Date);
      expect(githubHealth.responseTime).toBeGreaterThan(0);
    });

    it('should detect unhealthy servers', async () => {
      // Temporarily stop Network-FS server
      await testEnvironment.stopMCPServer('networkFs');
      
      await mcpCoordinator.checkHealth();
      
      const networkFsHealth = mcpCoordinator.getHealthStatus('networkFs');
      expect(networkFsHealth.status).toBe('unhealthy');
      expect(networkFsHealth.error).toBeDefined();
      
      // Restart server
      await testEnvironment.startMCPServer('networkFs', '/home/dev/workspace/network-mcp-wrapper.sh');
      
      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await mcpCoordinator.checkHealth();
      
      const recoveredHealth = mcpCoordinator.getHealthStatus('networkFs');
      expect(recoveredHealth.status).toBe('healthy');
    }, 15000);

    it('should provide overall health summary', async () => {
      const healthSummary = mcpCoordinator.getOverallHealth();
      
      expect(healthSummary).toMatchObject({
        status: 'healthy',
        servers: {
          networkFs: expect.objectContaining({ status: 'healthy' }),
          github: expect.objectContaining({ status: 'healthy' })
        },
        totalServers: 2,
        healthyServers: 2,
        unhealthyServers: 0
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should retry failed operations', async () => {
      const repository = 'festion/home-assistant-config';
      
      // Mock a temporary failure
      const originalMethod = mcpCoordinator.getFileContent;
      let callCount = 0;
      
      mcpCoordinator.getFileContent = async (...args) => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary network error');
        }
        return originalMethod.apply(mcpCoordinator, args);
      };
      
      const result = await mcpCoordinator.getFileContent(repository, 'main', 'configuration.yaml');
      
      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // First call failed, second succeeded
      
      // Restore original method
      mcpCoordinator.getFileContent = originalMethod;
    });

    it('should handle concurrent operations safely', async () => {
      const repository = 'festion/home-assistant-config';
      
      // Start multiple concurrent operations
      const operations = [
        mcpCoordinator.getFileContent(repository, 'main', 'configuration.yaml'),
        mcpCoordinator.getFileContent(repository, 'main', 'scripts.yaml'),
        mcpCoordinator.getRepositoryMetadata(repository),
        mcpCoordinator.validateRepositoryAccess(repository)
      ];
      
      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should timeout long-running operations', async () => {
      const longRunningOperation = mcpCoordinator.performOperationWithTimeout(
        async () => {
          // Simulate a long-running operation
          await new Promise(resolve => setTimeout(resolve, 10000));
          return { success: true };
        },
        1000 // 1 second timeout
      );
      
      await expect(longRunningOperation).rejects.toThrow('Operation timed out');
    }, 5000);

    it('should maintain operation state during failures', async () => {
      const initialState = mcpCoordinator.getOperationState();
      
      // Trigger a failure
      try {
        await mcpCoordinator.getFileContent('nonexistent/repo', 'main', 'file.txt');
      } catch (error) {
        // Expected to fail
      }
      
      const finalState = mcpCoordinator.getOperationState();
      
      // State should be maintained despite failure
      expect(finalState.activeConnections).toBe(initialState.activeConnections);
      expect(finalState.serverStatus).toEqual(initialState.serverStatus);
    });
  });

  describe('Deployment Integration Workflow', () => {
    it('should execute complete deployment workflow', async () => {
      const deploymentConfig = IntegrationFixtures.deploymentConfig({
        repository: 'festion/home-assistant-config',
        branch: 'main',
        targetPath: '/tmp/integration-deployment-test'
      });
      
      // Step 1: Clone repository
      const cloneResult = await mcpCoordinator.cloneRepository(
        deploymentConfig.repository,
        deploymentConfig.branch,
        deploymentConfig.targetPath
      );
      
      expect(cloneResult.success).toBe(true);
      
      // Step 2: Create backup of current configuration
      const backupPath = '/tmp/integration-backup.tar.gz';
      const backupResult = await mcpCoordinator.createBackup(
        '/tmp/current-config',
        backupPath
      );
      
      // Backup might fail if current config doesn't exist - that's ok for testing
      if (backupResult.success) {
        expect(backupResult.backupSize).toBeGreaterThan(0);
      }
      
      // Step 3: Validate new configuration
      const validateResult = await mcpCoordinator.validateConfiguration(
        `${deploymentConfig.targetPath}/configuration.yaml`
      );
      
      expect(validateResult.success).toBe(true);
      expect(validateResult.errors).toHaveLength(0);
      
      // Step 4: Deploy configuration
      const deployResult = await mcpCoordinator.deployConfiguration(
        deploymentConfig.targetPath,
        '/tmp/target-deployment'
      );
      
      expect(deployResult.success).toBe(true);
      expect(deployResult.filesDeployed).toBeGreaterThan(0);
      
      // Cleanup
      await testEnvironment.deleteDirectory(deploymentConfig.targetPath);
      await testEnvironment.deleteDirectory('/tmp/target-deployment');
      if (await testEnvironment.fileExists(backupPath)) {
        await testEnvironment.deleteFile(backupPath);
      }
    }, 20000);

    it('should handle rollback workflow', async () => {
      const rollbackConfig = IntegrationFixtures.rollbackConfig({
        backupPath: '/tmp/integration-rollback-backup.tar.gz',
        targetPath: '/tmp/integration-rollback-target'
      });
      
      // Create a test backup first
      await testEnvironment.createTestDirectory('/tmp/rollback-source');
      await testEnvironment.createTestFile(
        '/tmp/rollback-source/configuration.yaml',
        'homeassistant:\n  name: Rollback Test\n'
      );
      
      const backupResult = await mcpCoordinator.createBackup(
        '/tmp/rollback-source',
        rollbackConfig.backupPath
      );
      
      expect(backupResult.success).toBe(true);
      
      // Perform rollback
      const rollbackResult = await mcpCoordinator.performRollback(
        rollbackConfig.backupPath,
        rollbackConfig.targetPath
      );
      
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.filesRestored).toBeGreaterThan(0);
      
      // Verify rollback completed
      const configExists = await testEnvironment.fileExists(
        `${rollbackConfig.targetPath}/configuration.yaml`
      );
      expect(configExists).toBe(true);
      
      // Cleanup
      await testEnvironment.deleteDirectory('/tmp/rollback-source');
      await testEnvironment.deleteDirectory(rollbackConfig.targetPath);
      await testEnvironment.deleteFile(rollbackConfig.backupPath);
    });
  });
});
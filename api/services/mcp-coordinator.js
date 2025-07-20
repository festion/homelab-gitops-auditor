const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { Logger } = require('../utils/logger');

class MCPCoordinator {
  constructor() {
    this.connections = new Map();
    this.healthStatus = new Map();
    this.retryAttempts = new Map();
    this.config = null;
    this.logger = new Logger('MCP-Coordinator');
  }

  async initialize() {
    // Initialize default configuration
    this.config = {
      mcp: {
        networkFs: {
          wrapper: '/home/dev/workspace/network-mcp-wrapper.sh',
          timeout: 30000,
          retries: 3
        },
        github: {
          wrapper: '/home/dev/workspace/github-wrapper.sh',
          timeout: 30000,
          retries: 3
        }
      },
      monitoring: {
        healthCheckInterval: 60
      }
    };
    
    // Initialize MCP server connections
    await this.initializeNetworkFS();
    await this.initializeGitHub();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.logger.info('MCP Coordinator initialized successfully');
  }

  async initializeNetworkFS() {
    const config = this.config.mcp.networkFs;
    
    try {
      // Test Network-FS MCP connection
      const result = await this.executeCommand(config.wrapper, 'health-check', 5000);
      
      this.connections.set('networkFs', {
        wrapper: config.wrapper,
        timeout: config.timeout,
        retries: config.retries,
        status: 'connected',
        lastCheck: new Date()
      });
      
      this.logger.info('Network-FS MCP server connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Network-FS MCP server', error);
      // Still set connection for retry logic
      this.connections.set('networkFs', {
        wrapper: config.wrapper,
        timeout: config.timeout,
        retries: config.retries,
        status: 'failed',
        lastCheck: new Date(),
        lastError: error.message
      });
    }
  }

  async initializeGitHub() {
    const config = this.config.mcp.github;
    
    try {
      // Test GitHub MCP connection
      const result = await this.executeCommand(config.wrapper, 'health-check', 5000);
      
      this.connections.set('github', {
        wrapper: config.wrapper,
        timeout: config.timeout,
        retries: config.retries,
        status: 'connected',
        lastCheck: new Date()
      });
      
      this.logger.info('GitHub MCP server connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to GitHub MCP server', error);
      // Still set connection for retry logic
      this.connections.set('github', {
        wrapper: config.wrapper,
        timeout: config.timeout,
        retries: config.retries,
        status: 'failed',
        lastCheck: new Date(),
        lastError: error.message
      });
    }
  }

  // Network-FS MCP Operations
  async transferFile(sourcePath, destinationPath, options = {}) {
    const command = {
      action: 'transfer-file',
      source: sourcePath,
      destination: destinationPath,
      ...options
    };
    
    return await this.executeNetworkFSCommand(command);
  }

  async createBackup(configPath, backupPath) {
    const command = {
      action: 'create-backup',
      source: configPath,
      destination: backupPath,
      compression: true,
      timestamp: new Date().toISOString()
    };
    
    return await this.executeNetworkFSCommand(command);
  }

  async restoreBackup(backupPath, targetPath) {
    const command = {
      action: 'restore-backup',
      source: backupPath,
      destination: targetPath,
      preservePermissions: true
    };
    
    return await this.executeNetworkFSCommand(command);
  }

  async validateConfiguration(configPath) {
    const command = {
      action: 'validate-config',
      path: configPath,
      validator: 'home-assistant'
    };
    
    return await this.executeNetworkFSCommand(command);
  }

  async listDirectory(path) {
    const command = {
      action: 'list-directory',
      path: path,
      recursive: false
    };
    
    return await this.executeNetworkFSCommand(command);
  }

  // GitHub MCP Operations
  async cloneRepository(repository, branch, targetPath) {
    const command = {
      action: 'clone-repository',
      repository: repository,
      branch: branch,
      destination: targetPath,
      depth: 1
    };
    
    return await this.executeGitHubCommand(command);
  }

  async pullRepository(repositoryPath, branch) {
    const command = {
      action: 'pull-repository',
      path: repositoryPath,
      branch: branch,
      force: false
    };
    
    return await this.executeGitHubCommand(command);
  }

  async getFileContent(repository, branch, filePath) {
    const command = {
      action: 'get-file-content',
      repository: repository,
      branch: branch,
      path: filePath
    };
    
    return await this.executeGitHubCommand(command);
  }

  async getCommitInfo(repository, commitSha) {
    const command = {
      action: 'get-commit-info',
      repository: repository,
      commit: commitSha
    };
    
    return await this.executeGitHubCommand(command);
  }

  async listReleases(repository, limit = 10) {
    const command = {
      action: 'list-releases',
      repository: repository,
      limit: limit
    };
    
    return await this.executeGitHubCommand(command);
  }

  // MCP Command Execution
  async executeNetworkFSCommand(command) {
    return await this.executeMCPCommand('networkFs', command);
  }

  async executeGitHubCommand(command) {
    return await this.executeMCPCommand('github', command);
  }

  async executeMCPCommand(serverType, command) {
    const connection = this.connections.get(serverType);
    if (!connection) {
      throw new Error(`MCP server ${serverType} not connected`);
    }

    const maxRetries = connection.retries || 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeCommand(connection.wrapper, command, connection.timeout);
        
        // Update connection status
        connection.status = 'connected';
        connection.lastCheck = new Date();
        this.retryAttempts.set(serverType, 0);
        
        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(`MCP command failed (attempt ${attempt}/${maxRetries})`, {
          serverType,
          command: command.action || command,
          error: error.message
        });
        
        if (attempt < maxRetries) {
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    // Mark connection as failed
    connection.status = 'failed';
    connection.lastError = lastError;
    this.retryAttempts.set(serverType, (this.retryAttempts.get(serverType) || 0) + 1);
    
    throw new Error(`MCP command failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  async executeCommand(wrapper, command, timeout) {
    const commandStr = typeof command === 'string' ? command : JSON.stringify(command);
    const execCommand = `${wrapper} '${commandStr}'`;
    
    this.logger.debug('Executing MCP command', { command: execCommand });
    
    const { stdout, stderr } = await execAsync(execCommand, {
      timeout: timeout || 30000,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    if (stderr) {
      this.logger.warn('MCP command stderr', { stderr });
    }
    
    try {
      return JSON.parse(stdout);
    } catch (error) {
      return { output: stdout, error: stderr };
    }
  }

  // Health Monitoring
  startHealthMonitoring() {
    const interval = this.config.monitoring?.healthCheckInterval || 60;
    
    setInterval(async () => {
      await this.checkHealth();
    }, interval * 1000);
    
    this.logger.info(`Health monitoring started (interval: ${interval}s)`);
  }

  async checkHealth() {
    for (const [serverType, connection] of this.connections) {
      try {
        const startTime = Date.now();
        await this.executeCommand(connection.wrapper, 'health-check', 10000);
        const responseTime = Date.now() - startTime;
        
        this.healthStatus.set(serverType, {
          status: 'healthy',
          responseTime: responseTime,
          lastCheck: new Date(),
          consecutiveFailures: 0
        });
        
        this.logger.debug(`Health check passed for ${serverType}`, { responseTime });
      } catch (error) {
        const currentHealth = this.healthStatus.get(serverType) || { consecutiveFailures: 0 };
        const failures = currentHealth.consecutiveFailures + 1;
        
        this.healthStatus.set(serverType, {
          status: 'unhealthy',
          lastCheck: new Date(),
          lastError: error.message,
          consecutiveFailures: failures
        });
        
        this.logger.error(`Health check failed for ${serverType}`, {
          error: error.message,
          consecutiveFailures: failures
        });
        
        // Attempt reconnection after multiple failures
        if (failures >= 3) {
          await this.attemptReconnection(serverType);
        }
      }
    }
  }

  async attemptReconnection(serverType) {
    this.logger.info(`Attempting to reconnect to ${serverType}`);
    
    try {
      if (serverType === 'networkFs') {
        await this.initializeNetworkFS();
      } else if (serverType === 'github') {
        await this.initializeGitHub();
      }
      
      this.logger.info(`Successfully reconnected to ${serverType}`);
    } catch (error) {
      this.logger.error(`Failed to reconnect to ${serverType}`, error);
    }
  }

  // Utility Methods
  getConnectionStatus(serverType) {
    return this.connections.get(serverType);
  }

  getHealthStatus(serverType) {
    return this.healthStatus.get(serverType);
  }

  getAllStatus() {
    const status = {};
    
    for (const [serverType] of this.connections) {
      status[serverType] = {
        connection: this.getConnectionStatus(serverType),
        health: this.getHealthStatus(serverType)
      };
    }
    
    return status;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { MCPCoordinator };
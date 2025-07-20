const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class MCPCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.networkFsWrapper = options.networkFsWrapper;
    this.githubWrapper = options.githubWrapper;
    this.timeout = options.timeout || 30000;
    this.logger = options.logger;
    
    this.connections = new Map();
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
    this.maxRetries = options.maxRetries || 3;
    
    this.connectionStates = {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      ERROR: 'error'
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing MCP coordinator');
      
      await this.initializeConnection('networkFs', this.networkFsWrapper);
      await this.initializeConnection('github', this.githubWrapper);
      
      this.startHealthChecks();
      
      this.logger?.info('MCP coordinator initialized successfully');
      return true;
      
    } catch (error) {
      this.logger?.error('Failed to initialize MCP coordinator', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async initializeConnection(name, wrapperPath) {
    if (!wrapperPath) {
      this.logger?.warn(`No wrapper path provided for ${name}, skipping initialization`);
      return;
    }
    
    try {
      const exists = await fs.access(wrapperPath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error(`Wrapper script not found: ${wrapperPath}`);
      }
      
      const connection = {
        name,
        wrapperPath,
        state: this.connectionStates.DISCONNECTED,
        lastHealthCheck: null,
        lastError: null,
        retryCount: 0,
        process: null
      };
      
      this.connections.set(name, connection);
      await this.testConnection(name);
      
      this.logger?.info(`MCP connection initialized`, { name, wrapperPath });
      
    } catch (error) {
      this.logger?.error(`Failed to initialize MCP connection`, {
        name,
        wrapperPath,
        error: error.message
      });
      
      this.connections.set(name, {
        name,
        wrapperPath,
        state: this.connectionStates.ERROR,
        lastError: error.message,
        retryCount: 0
      });
    }
  }

  async testConnection(name) {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Connection ${name} not found`);
    }
    
    connection.state = this.connectionStates.CONNECTING;
    
    try {
      const testCommand = this.buildTestCommand(name);
      const result = await this.executeCommand(name, testCommand, { timeout: 10000, skipConnectionTest: true });
      
      connection.state = this.connectionStates.CONNECTED;
      connection.lastHealthCheck = new Date().toISOString();
      connection.lastError = null;
      connection.retryCount = 0;
      
      this.logger?.debug(`MCP connection test successful`, { name });
      this.emit('connection_established', name);
      
      return result;
      
    } catch (error) {
      connection.state = this.connectionStates.ERROR;
      connection.lastError = error.message;
      connection.retryCount++;
      
      this.logger?.error(`MCP connection test failed`, {
        name,
        error: error.message,
        retryCount: connection.retryCount
      });
      
      this.emit('connection_failed', { name, error: error.message });
      throw error;
    }
  }

  buildTestCommand(name) {
    switch (name) {
      case 'networkFs':
        return ['list_allowed_directories'];
      case 'github':
        return ['get_me'];
      default:
        return ['help'];
    }
  }

  async executeCommand(connectionName, command, options = {}) {
    const connection = this.connections.get(connectionName);
    if (!connection) {
      throw new Error(`Connection ${connectionName} not found`);
    }
    
    // Prevent infinite recursion - don't test connection if we're already testing
    if (connection.state !== this.connectionStates.CONNECTED && !options.skipConnectionTest) {
      await this.testConnection(connectionName);
    }
    
    const timeout = options.timeout || this.timeout;
    const commandId = `${connectionName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger?.debug('Executing MCP command', {
      connectionName,
      command: Array.isArray(command) ? command.join(' ') : command,
      commandId,
      timeout
    });
    
    try {
      const result = await this.runCommand(connection, command, timeout, commandId);
      
      this.logger?.debug('MCP command completed successfully', {
        connectionName,
        commandId,
        duration: result.duration
      });
      
      return result;
      
    } catch (error) {
      this.logger?.error('MCP command failed', {
        connectionName,
        commandId,
        error: error.message,
        command: Array.isArray(command) ? command.join(' ') : command
      });
      
      connection.lastError = error.message;
      
      if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
        connection.state = this.connectionStates.ERROR;
        this.emit('connection_lost', connectionName);
      }
      
      throw error;
    }
  }

  async runCommand(connection, command, timeout, commandId) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const commandArgs = Array.isArray(command) ? command : [command];
      const process = spawn('bash', [connection.wrapperPath, ...commandArgs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      let timeoutId;
      
      // Set up timeout
      timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
            duration,
            commandId
          });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Process error: ${error.message}`));
      });
    });
  }

  async networkFsOperation(operation, params = {}) {
    const commands = {
      'list_directory': ['list_network_directory', params.shareName, params.path || ''],
      'read_file': ['read_network_file', params.shareName, params.filePath, params.encoding || 'utf-8'],
      'write_file': ['write_network_file', params.shareName, params.filePath, params.content, params.encoding || 'utf-8'],
      'delete_file': ['delete_network_file', params.shareName, params.filePath],
      'create_directory': ['create_network_directory', params.shareName, params.directoryPath],
      'get_file_info': ['get_network_file_info', params.shareName, params.path],
      'get_share_info': ['get_share_info', params.shareName || '']
    };
    
    const command = commands[operation];
    if (!command) {
      throw new Error(`Unknown network FS operation: ${operation}`);
    }
    
    return await this.executeCommand('networkFs', command.filter(Boolean));
  }

  async githubOperation(operation, params = {}) {
    const commands = {
      'get_me': ['get_me'],
      'list_repositories': ['search_repositories', params.query || ''],
      'get_repository': ['get_repository', params.owner, params.repo],
      'list_issues': ['list_issues', params.owner, params.repo],
      'create_issue': ['create_issue', params.owner, params.repo, params.title, params.body || ''],
      'get_file_contents': ['get_file_contents', params.owner, params.repo, params.path, params.ref || ''],
      'create_or_update_file': ['create_or_update_file', params.owner, params.repo, params.path, params.content, params.message, params.branch, params.sha || ''],
      'list_commits': ['list_commits', params.owner, params.repo, params.sha || '', params.author || ''],
      'create_pull_request': ['create_pull_request', params.owner, params.repo, params.title, params.head, params.base, params.body || '']
    };
    
    const command = commands[operation];
    if (!command) {
      throw new Error(`Unknown GitHub operation: ${operation}`);
    }
    
    return await this.executeCommand('github', command.filter(Boolean));
  }

  async deploymentOperations(deploymentParams) {
    const operations = [];
    
    try {
      // Import backup manager if needed
      const { BackupManager } = require('../backup/backup-manager');
      
      // 1. Create pre-deployment backup if backup manager is available
      let preDeploymentBackup = null;
      if (deploymentParams.createBackup !== false) {
        try {
          const backupManager = new BackupManager();
          await backupManager.initialize();
          
          preDeploymentBackup = await backupManager.createPreDeploymentBackup(
            deploymentParams.deploymentId || `deployment-${Date.now()}`
          );
          
          operations.push({
            operation: 'create_pre_deployment_backup',
            result: 'success',
            backupId: preDeploymentBackup.backupId,
            backupPath: preDeploymentBackup.path
          });
          
          this.logger?.info('Pre-deployment backup created', {
            backupId: preDeploymentBackup.backupId,
            size: preDeploymentBackup.size
          });
          
        } catch (backupError) {
          this.logger?.warn('Failed to create pre-deployment backup', { 
            error: backupError.message 
          });
          
          operations.push({
            operation: 'create_pre_deployment_backup',
            result: 'failed',
            error: backupError.message
          });
          
          // Continue with deployment unless backup is required
          if (deploymentParams.requireBackup) {
            throw new Error(`Pre-deployment backup failed: ${backupError.message}`);
          }
        }
      }
      
      // 2. Get current configuration from target server
      this.logger?.info('Fetching current configuration', { repository: deploymentParams.repository });
      
      const currentConfig = await this.networkFsOperation('list_directory', {
        shareName: 'home-assistant',
        path: '/config'
      });
      
      operations.push({
        operation: 'fetch_current_config',
        result: 'success',
        data: currentConfig
      });
      
      // 3. Get latest changes from GitHub
      this.logger?.info('Fetching latest changes from GitHub', {
        repository: deploymentParams.repository,
        branch: deploymentParams.branch
      });
      
      const [owner, repo] = deploymentParams.repository.split('/');
      const latestCommits = await this.githubOperation('list_commits', {
        owner,
        repo,
        sha: deploymentParams.branch
      });
      
      operations.push({
        operation: 'fetch_github_changes',
        result: 'success',
        data: latestCommits
      });
      
      // 4. Create legacy backup for compatibility (if no backup manager)
      let legacyBackupPath = null;
      if (!preDeploymentBackup) {
        legacyBackupPath = `/config/backups/backup-${Date.now()}`;
        await this.networkFsOperation('create_directory', {
          shareName: 'home-assistant',
          directoryPath: legacyBackupPath
        });
        
        operations.push({
          operation: 'create_legacy_backup',
          result: 'success',
          backupPath: legacyBackupPath
        });
      }
      
      // 5. Download and apply new configuration files
      const configFiles = await this.getConfigurationFiles(owner, repo, deploymentParams.branch);
      
      for (const file of configFiles) {
        const fileContent = await this.githubOperation('get_file_contents', {
          owner,
          repo,
          path: file.path,
          ref: deploymentParams.branch
        });
        
        await this.networkFsOperation('write_file', {
          shareName: 'home-assistant',
          filePath: `/config/${file.path}`,
          content: fileContent.stdout
        });
        
        operations.push({
          operation: 'deploy_file',
          result: 'success',
          file: file.path
        });
      }
      
      return {
        success: true,
        operations,
        backupPath: preDeploymentBackup?.path || legacyBackupPath,
        backupId: preDeploymentBackup?.backupId,
        deployedFiles: configFiles.length,
        preDeploymentBackup: preDeploymentBackup
      };
      
    } catch (error) {
      this.logger?.error('Deployment operations failed', {
        error: error.message,
        operations: operations.length
      });
      
      operations.push({
        operation: 'deployment',
        result: 'failed',
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        operations
      };
    }
  }

  async getConfigurationFiles(owner, repo, branch = 'main') {
    try {
      const repoContents = await this.githubOperation('get_file_contents', {
        owner,
        repo,
        path: '',
        ref: branch
      });
      
      const contents = JSON.parse(repoContents.stdout);
      const configFiles = [];
      
      const configExtensions = ['.yaml', '.yml', '.json'];
      const configDirectories = ['packages', 'lovelace', 'integrations'];
      
      for (const item of contents) {
        if (item.type === 'file') {
          const hasConfigExtension = configExtensions.some(ext => item.name.endsWith(ext));
          if (hasConfigExtension) {
            configFiles.push({
              path: item.path,
              name: item.name,
              size: item.size,
              sha: item.sha
            });
          }
        } else if (item.type === 'dir' && configDirectories.includes(item.name)) {
          const dirFiles = await this.getDirectoryFiles(owner, repo, item.path, branch);
          configFiles.push(...dirFiles);
        }
      }
      
      return configFiles;
      
    } catch (error) {
      this.logger?.error('Failed to get configuration files', {
        owner,
        repo,
        branch,
        error: error.message
      });
      throw error;
    }
  }

  async getDirectoryFiles(owner, repo, dirPath, branch) {
    try {
      const dirContents = await this.githubOperation('get_file_contents', {
        owner,
        repo,
        path: dirPath,
        ref: branch
      });
      
      const contents = JSON.parse(dirContents.stdout);
      const files = [];
      
      for (const item of contents) {
        if (item.type === 'file') {
          files.push({
            path: item.path,
            name: item.name,
            size: item.size,
            sha: item.sha
          });
        } else if (item.type === 'dir') {
          const subFiles = await this.getDirectoryFiles(owner, repo, item.path, branch);
          files.push(...subFiles);
        }
      }
      
      return files;
      
    } catch (error) {
      this.logger?.error('Failed to get directory files', {
        dirPath,
        error: error.message
      });
      return [];
    }
  }

  async rollbackOperations(backupPath, options = {}) {
    try {
      this.logger?.info('Starting rollback operations', { backupPath, options });
      
      // Try to use BackupManager for rollback if deploymentId is provided
      if (options.deploymentId) {
        try {
          const { RecoveryService } = require('../backup/recovery-service');
          const recoveryService = new RecoveryService();
          await recoveryService.initialize();
          
          const rollbackResult = await recoveryService.performControlledRollback(
            options.deploymentId,
            {
              validateBefore: options.validateBefore !== false,
              createBackupBefore: options.createBackupBefore !== false,
              healthCheckAfter: options.healthCheckAfter !== false
            }
          );
          
          this.logger?.info('Rollback completed using RecoveryService', {
            deploymentId: options.deploymentId,
            backupId: rollbackResult.rolledBackToBackup
          });
          
          return {
            success: true,
            method: 'recovery-service',
            deploymentId: options.deploymentId,
            backupId: rollbackResult.rolledBackToBackup,
            restoredFiles: rollbackResult.restoredFiles,
            restoredSize: rollbackResult.restoredSize,
            currentStateBackup: rollbackResult.currentStateBackup
          };
          
        } catch (recoveryError) {
          this.logger?.warn('RecoveryService rollback failed, falling back to legacy method', {
            error: recoveryError.message
          });
          // Fall through to legacy rollback method
        }
      }
      
      // Legacy rollback method for backward compatibility
      this.logger?.info('Using legacy rollback method');
      
      // List backup files
      const backupFiles = await this.networkFsOperation('list_directory', {
        shareName: 'home-assistant',
        path: backupPath
      });
      
      // Restore each file
      const restoredFiles = [];
      for (const file of JSON.parse(backupFiles.stdout)) {
        if (file.type === 'file') {
          const fileContent = await this.networkFsOperation('read_file', {
            shareName: 'home-assistant',
            filePath: `${backupPath}/${file.name}`
          });
          
          await this.networkFsOperation('write_file', {
            shareName: 'home-assistant',
            filePath: `/config/${file.name}`,
            content: fileContent.stdout
          });
          
          restoredFiles.push(file.name);
        }
      }
      
      return {
        success: true,
        method: 'legacy',
        restoredFiles: restoredFiles.length,
        files: restoredFiles,
        backupPath
      };
      
    } catch (error) {
      this.logger?.error('Rollback operations failed', {
        backupPath,
        options,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        backupPath,
        method: 'failed'
      };
    }
  }

  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);
    
    this.logger?.debug('Health checks started', { interval: this.healthCheckInterval });
  }

  async performHealthChecks() {
    for (const [name, connection] of this.connections) {
      try {
        if (connection.state === this.connectionStates.CONNECTED) {
          await this.testConnection(name);
        } else if (connection.state === this.connectionStates.ERROR && connection.retryCount < this.maxRetries) {
          this.logger?.info('Attempting to reconnect MCP connection', {
            name,
            retryCount: connection.retryCount,
            maxRetries: this.maxRetries
          });
          
          await this.testConnection(name);
        }
      } catch (error) {
        this.logger?.debug('Health check failed', {
          name,
          error: error.message
        });
      }
    }
  }

  async checkHealth() {
    const health = {
      status: 'healthy',
      connections: {}
    };
    
    for (const [name, connection] of this.connections) {
      health.connections[name] = {
        status: connection.state,
        lastHealthCheck: connection.lastHealthCheck,
        lastError: connection.lastError,
        retryCount: connection.retryCount,
        wrapperPath: connection.wrapperPath
      };
    }
    
    const hasUnhealthyConnections = Object.values(health.connections).some(
      conn => conn.status === this.connectionStates.ERROR
    );
    
    if (hasUnhealthyConnections) {
      health.status = 'degraded';
    }
    
    return health;
  }

  getConnectionStatus(name) {
    const connection = this.connections.get(name);
    return connection ? connection.state : 'not_found';
  }

  getAllConnections() {
    const connections = {};
    for (const [name, connection] of this.connections) {
      connections[name] = {
        name: connection.name,
        state: connection.state,
        lastHealthCheck: connection.lastHealthCheck,
        lastError: connection.lastError,
        retryCount: connection.retryCount
      };
    }
    return connections;
  }

  async cleanup() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Close any active processes
    for (const [name, connection] of this.connections) {
      if (connection.process && !connection.process.killed) {
        connection.process.kill('SIGTERM');
      }
    }
    
    this.connections.clear();
    this.removeAllListeners();
    
    this.logger?.info('MCP coordinator cleaned up');
  }
}

module.exports = MCPCoordinator;
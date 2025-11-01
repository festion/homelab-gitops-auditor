const { MCPCoordinator } = require('./mcp-coordinator');
const { Logger } = require('../utils/logger');
const { HealthChecker } = require('../../scripts/health-checks/health-checker');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

class DeploymentOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.logger = new Logger('Deployment-Orchestrator');
    this.mcpCoordinator = new MCPCoordinator();
    this.healthChecker = new HealthChecker();
    this.config = {
      backupRetention: 5,
      deploymentTimeout: 300000, // 5 minutes
      validationTimeout: 60000,  // 1 minute
      rollbackEnabled: true,
      healthChecksEnabled: true,
      ...config
    };
    this.activeDeployments = new Map();
  }

  async initialize() {
    await this.mcpCoordinator.initialize();
    await this.healthChecker.initialize();
    this.logger.info('Deployment Orchestrator initialized');
  }

  async deployConfiguration(deploymentConfig) {
    const deploymentId = this.generateDeploymentId();
    
    const deployment = {
      id: deploymentId,
      config: deploymentConfig,
      startedAt: new Date(),
      status: 'initializing',
      steps: [],
      backupPath: null,
      rollbackData: null
    };

    this.activeDeployments.set(deploymentId, deployment);
    this.emit('deployment:started', deployment);

    try {
      // Step 1: Pre-deployment health checks
      if (this.config.healthChecksEnabled) {
        await this.performPreDeploymentHealthChecks(deployment);
      }
      
      // Step 2: Validate deployment configuration
      await this.validateDeploymentConfig(deployment);
      
      // Step 3: Create backup
      await this.createConfigurationBackup(deployment);
      
      // Step 4: Fetch and validate source configuration
      await this.fetchSourceConfiguration(deployment);
      
      // Step 5: Validate new configuration
      await this.validateNewConfiguration(deployment);
      
      // Step 6: Deploy configuration
      await this.deployNewConfiguration(deployment);
      
      // Step 7: Post-deployment health checks
      if (this.config.healthChecksEnabled) {
        await this.performPostDeploymentHealthChecks(deployment);
      }
      
      // Step 8: Verify deployment
      await this.verifyDeployment(deployment);
      
      // Step 9: Clean up old backups
      await this.cleanupOldBackups(deployment);
      
      deployment.status = 'completed';
      deployment.completedAt = new Date();
      
      this.emit('deployment:completed', deployment);
      this.logger.info(`Deployment ${deploymentId} completed successfully`);
      
      return {
        success: true,
        deploymentId: deploymentId,
        backupPath: deployment.backupPath,
        duration: deployment.completedAt - deployment.startedAt
      };
      
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.failedAt = new Date();
      
      this.emit('deployment:failed', deployment, error);
      this.logger.error(`Deployment ${deploymentId} failed`, error);
      
      // Attempt rollback if enabled
      if (this.config.rollbackEnabled && deployment.backupPath) {
        try {
          await this.rollbackDeployment(deployment);
        } catch (rollbackError) {
          this.logger.error(`Rollback failed for deployment ${deploymentId}`, rollbackError);
          deployment.rollbackFailed = true;
          deployment.rollbackError = rollbackError.message;
        }
      }
      
      throw error;
    } finally {
      // Clean up temporary files
      await this.cleanupTemporaryFiles(deployment);
    }
  }

  async validateDeploymentConfig(deployment) {
    this.updateDeploymentStep(deployment, 'validate-config', 'running');
    
    const { config } = deployment;
    
    // Validate required fields
    const requiredFields = ['source', 'target', 'type'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate source configuration
    if (config.source.type === 'github') {
      if (!config.source.repository || !config.source.branch) {
        throw new Error('GitHub source requires repository and branch');
      }
    }
    
    // Validate target configuration
    if (config.target.type === 'network-fs') {
      if (!config.target.shareName || !config.target.path) {
        throw new Error('Network-FS target requires shareName and path');
      }
    }
    
    this.updateDeploymentStep(deployment, 'validate-config', 'completed');
    this.logger.debug(`Deployment config validated for ${deployment.id}`);
  }

  async createConfigurationBackup(deployment) {
    this.updateDeploymentStep(deployment, 'create-backup', 'running');
    
    const { config } = deployment;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `backup-${deployment.id}-${timestamp}.tar.gz`;
    
    if (config.target.type === 'network-fs') {
      const backupPath = path.join('/backups', backupFilename);
      
      const result = await this.mcpCoordinator.createBackup(
        config.target.path,
        backupPath
      );
      
      deployment.backupPath = backupPath;
      deployment.rollbackData = {
        type: 'network-fs',
        backupPath: backupPath,
        originalPath: config.target.path
      };
      
      this.logger.info(`Backup created at ${backupPath} for deployment ${deployment.id}`);
    } else {
      throw new Error(`Backup not supported for target type: ${config.target.type}`);
    }
    
    this.updateDeploymentStep(deployment, 'create-backup', 'completed');
  }

  async fetchSourceConfiguration(deployment) {
    this.updateDeploymentStep(deployment, 'fetch-source', 'running');
    
    const { config } = deployment;
    const tempDir = `/tmp/deployment-${deployment.id}`;
    
    if (config.source.type === 'github') {
      // Clone repository to temporary directory
      const result = await this.mcpCoordinator.cloneRepository(
        config.source.repository,
        config.source.branch,
        tempDir
      );
      
      deployment.tempSourcePath = tempDir;
      
      // If specific files are specified, validate they exist
      if (config.source.files && config.source.files.length > 0) {
        for (const file of config.source.files) {
          const filePath = path.join(tempDir, file);
          try {
            await fs.access(filePath);
          } catch (error) {
            throw new Error(`Source file not found: ${file}`);
          }
        }
      }
      
      this.logger.info(`Source fetched from ${config.source.repository}:${config.source.branch}`);
    } else {
      throw new Error(`Unsupported source type: ${config.source.type}`);
    }
    
    this.updateDeploymentStep(deployment, 'fetch-source', 'completed');
  }

  async validateNewConfiguration(deployment) {
    this.updateDeploymentStep(deployment, 'validate-new-config', 'running');
    
    const { config } = deployment;
    
    if (config.validation && config.validation.enabled !== false) {
      // Use health checker for comprehensive configuration validation
      const validationResult = await this.validateConfigurationHealth(deployment.tempSourcePath);
      
      if (!validationResult.valid) {
        const errors = [];
        
        if (validationResult.yamlSyntax && !validationResult.yamlSyntax.valid) {
          errors.push(...validationResult.yamlSyntax.errors.map(e => `${e.file}: ${e.error}`));
        }
        
        if (validationResult.security && !validationResult.security.valid) {
          errors.push(...validationResult.security.issues);
        }
        
        if (validationResult.homeAssistantConfig && !validationResult.homeAssistantConfig.valid) {
          errors.push(...validationResult.homeAssistantConfig.errors);
        }
        
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
      
      deployment.configValidation = validationResult;
      this.logger.info(`Configuration validation passed for deployment ${deployment.id}`);
    } else {
      this.logger.warn(`Configuration validation skipped for deployment ${deployment.id}`);
    }
    
    this.updateDeploymentStep(deployment, 'validate-new-config', 'completed');
  }

  async deployNewConfiguration(deployment) {
    this.updateDeploymentStep(deployment, 'deploy', 'running');
    
    const { config } = deployment;
    
    if (config.target.type === 'network-fs') {
      const transferOptions = {
        preservePermissions: true,
        backup: false, // Already created backup
        recursive: true
      };
      
      // If specific files are configured, transfer only those
      if (config.source.files && config.source.files.length > 0) {
        for (const file of config.source.files) {
          const sourcePath = path.join(deployment.tempSourcePath, file);
          const targetPath = path.join(config.target.path, file);
          
          await this.mcpCoordinator.transferFile(
            sourcePath,
            targetPath,
            transferOptions
          );
        }
      } else {
        // Transfer entire directory
        await this.mcpCoordinator.transferFile(
          deployment.tempSourcePath,
          config.target.path,
          transferOptions
        );
      }
      
      this.logger.info(`Configuration deployed to ${config.target.path}`);
    } else {
      throw new Error(`Unsupported target type: ${config.target.type}`);
    }
    
    this.updateDeploymentStep(deployment, 'deploy', 'completed');
  }

  async verifyDeployment(deployment) {
    this.updateDeploymentStep(deployment, 'verify', 'running');
    
    const { config } = deployment;
    
    if (config.verification && config.verification.enabled !== false) {
      // List deployed files to verify they exist
      const deployedFiles = await this.mcpCoordinator.listDirectory(config.target.path);
      
      if (config.source.files && config.source.files.length > 0) {
        // Verify specific files were deployed
        for (const file of config.source.files) {
          const found = deployedFiles.some(f => f.name === path.basename(file));
          if (!found) {
            throw new Error(`Verification failed: ${file} not found in target`);
          }
        }
      } else {
        // Verify directory is not empty
        if (!deployedFiles || deployedFiles.length === 0) {
          throw new Error('Verification failed: No files found in target directory');
        }
      }
      
      // Additional verification checks
      if (config.verification.checks) {
        for (const check of config.verification.checks) {
          await this.performVerificationCheck(deployment, check);
        }
      }
      
      this.logger.info(`Deployment verification passed for ${deployment.id}`);
    } else {
      this.logger.warn(`Deployment verification skipped for ${deployment.id}`);
    }
    
    this.updateDeploymentStep(deployment, 'verify', 'completed');
  }

  async performVerificationCheck(deployment, check) {
    switch (check.type) {
      case 'file-exists':
        const files = await this.mcpCoordinator.listDirectory(
          path.dirname(path.join(deployment.config.target.path, check.file))
        );
        const exists = files.some(f => f.name === path.basename(check.file));
        if (!exists) {
          throw new Error(`Verification check failed: ${check.file} does not exist`);
        }
        break;
        
      case 'file-content':
        // This would require reading file content and checking patterns
        this.logger.warn(`File content verification not implemented: ${check.file}`);
        break;
        
      default:
        this.logger.warn(`Unknown verification check type: ${check.type}`);
    }
  }

  async rollbackDeployment(deployment) {
    this.logger.info(`Starting rollback for deployment ${deployment.id}`);
    this.updateDeploymentStep(deployment, 'rollback', 'running');
    
    const { rollbackData } = deployment;
    
    if (rollbackData && rollbackData.type === 'network-fs') {
      await this.mcpCoordinator.restoreBackup(
        rollbackData.backupPath,
        rollbackData.originalPath
      );
      
      this.logger.info(`Rollback completed for deployment ${deployment.id}`);
    } else {
      throw new Error('No rollback data available');
    }
    
    this.updateDeploymentStep(deployment, 'rollback', 'completed');
  }

  async cleanupOldBackups(deployment) {
    this.updateDeploymentStep(deployment, 'cleanup-backups', 'running');
    
    try {
      // List backups directory
      const backupFiles = await this.mcpCoordinator.listDirectory('/backups');
      
      // Filter backup files and sort by date (newest first)
      const configBackups = backupFiles
        .filter(f => f.name.startsWith('backup-') && f.name.endsWith('.tar.gz'))
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      // Keep only the configured number of backups
      if (configBackups.length > this.config.backupRetention) {
        const toDelete = configBackups.slice(this.config.backupRetention);
        
        for (const backup of toDelete) {
          try {
            // Note: MCPCoordinator doesn't have deleteFile method yet
            // await this.mcpCoordinator.deleteFile('/backups', backup.name);
            this.logger.info(`Would delete old backup: ${backup.name}`);
          } catch (error) {
            this.logger.warn(`Failed to delete backup ${backup.name}`, error);
          }
        }
      }
      
      this.updateDeploymentStep(deployment, 'cleanup-backups', 'completed');
    } catch (error) {
      this.logger.warn('Backup cleanup failed', error);
      this.updateDeploymentStep(deployment, 'cleanup-backups', 'failed');
    }
  }

  async cleanupTemporaryFiles(deployment) {
    try {
      if (deployment.tempSourcePath) {
        // Note: Would need file system operations to clean up
        this.logger.info(`Would cleanup temporary directory: ${deployment.tempSourcePath}`);
      }
    } catch (error) {
      this.logger.warn('Temporary file cleanup failed', error);
    }
  }

  updateDeploymentStep(deployment, stepName, status) {
    const step = {
      name: stepName,
      status: status,
      timestamp: new Date()
    };
    
    deployment.steps.push(step);
    this.emit('deployment:step', deployment, step);
    
    this.logger.debug(`Deployment ${deployment.id} step ${stepName}: ${status}`);
  }

  // Health Check Methods
  async performPreDeploymentHealthChecks(deployment) {
    this.updateDeploymentStep(deployment, 'pre-health-checks', 'running');
    this.logger.info(`Running pre-deployment health checks for deployment ${deployment.id}`);

    try {
      const healthReport = await this.healthChecker.performPreDeploymentChecks();
      
      deployment.preHealthReport = healthReport;
      this.updateDeploymentStep(deployment, 'pre-health-checks', 'completed', {
        healthyChecks: healthReport.overall.healthyChecks,
        totalChecks: healthReport.overall.totalChecks
      });

      this.emit('deployment:health-check', deployment, 'pre', healthReport);
      this.logger.info(`Pre-deployment health checks passed for deployment ${deployment.id}`);

    } catch (error) {
      this.updateDeploymentStep(deployment, 'pre-health-checks', 'failed', { error: error.message });
      this.logger.error(`Pre-deployment health checks failed for deployment ${deployment.id}`, error);
      throw new Error(`Pre-deployment health checks failed: ${error.message}`);
    }
  }

  async performPostDeploymentHealthChecks(deployment) {
    this.updateDeploymentStep(deployment, 'post-health-checks', 'running');
    this.logger.info(`Running post-deployment health checks for deployment ${deployment.id}`);

    try {
      const healthReport = await this.healthChecker.performPostDeploymentChecks();
      
      deployment.postHealthReport = healthReport;
      this.updateDeploymentStep(deployment, 'post-health-checks', 'completed', {
        healthyChecks: healthReport.overall.healthyChecks,
        totalChecks: healthReport.overall.totalChecks
      });

      this.emit('deployment:health-check', deployment, 'post', healthReport);
      this.logger.info(`Post-deployment health checks passed for deployment ${deployment.id}`);

      // Compare with pre-deployment baseline if available
      if (deployment.preHealthReport) {
        await this.compareHealthReports(deployment);
      }

    } catch (error) {
      this.updateDeploymentStep(deployment, 'post-health-checks', 'failed', { error: error.message });
      this.logger.error(`Post-deployment health checks failed for deployment ${deployment.id}`, error);
      
      // Trigger rollback if health checks fail
      if (this.config.rollbackEnabled) {
        this.logger.warn(`Health check failure triggering rollback for deployment ${deployment.id}`);
        throw new Error(`Post-deployment health checks failed, rollback required: ${error.message}`);
      } else {
        throw new Error(`Post-deployment health checks failed: ${error.message}`);
      }
    }
  }

  async compareHealthReports(deployment) {
    const preReport = deployment.preHealthReport;
    const postReport = deployment.postHealthReport;
    
    const comparison = {
      timestamp: new Date().toISOString(),
      preHealthy: preReport.overall.healthyChecks,
      postHealthy: postReport.overall.healthyChecks,
      improvementCount: 0,
      degradationCount: 0,
      changes: []
    };

    // Compare individual check results
    for (const postCheck of postReport.checks) {
      const preCheck = preReport.checks.find(c => c.name === postCheck.name);
      
      if (preCheck) {
        if (preCheck.status !== postCheck.status) {
          const change = {
            checkName: postCheck.name,
            before: preCheck.status,
            after: postCheck.status,
            type: postCheck.status === 'healthy' ? 'improvement' : 'degradation'
          };
          
          comparison.changes.push(change);
          
          if (change.type === 'improvement') {
            comparison.improvementCount++;
          } else {
            comparison.degradationCount++;
          }
        }
      }
    }

    deployment.healthComparison = comparison;
    
    if (comparison.degradationCount > 0) {
      this.logger.warn(`Health degradation detected in deployment ${deployment.id}:`, comparison.changes);
      this.emit('deployment:health-degradation', deployment, comparison);
    } else if (comparison.improvementCount > 0) {
      this.logger.info(`Health improvements detected in deployment ${deployment.id}:`, comparison.changes);
      this.emit('deployment:health-improvement', deployment, comparison);
    }
  }

  async validateConfigurationHealth(configPath) {
    this.logger.info(`Validating configuration health at ${configPath}`);
    
    try {
      const validationResult = await this.healthChecker.validateConfiguration(configPath);
      
      if (!validationResult.valid) {
        const errors = [];
        
        if (validationResult.yamlSyntax && !validationResult.yamlSyntax.valid) {
          errors.push(`YAML syntax errors: ${validationResult.yamlSyntax.errors.length}`);
        }
        
        if (validationResult.security && !validationResult.security.valid) {
          errors.push(`Security compliance issues: ${validationResult.security.issues.length}`);
        }
        
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
      
      return validationResult;
      
    } catch (error) {
      this.logger.error('Configuration health validation failed', error);
      throw error;
    }
  }

  // Enhanced deployment status with health information
  getDeploymentStatusWithHealth(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      return null;
    }

    return {
      ...deployment,
      healthStatus: {
        preDeployment: deployment.preHealthReport?.overall || null,
        postDeployment: deployment.postHealthReport?.overall || null,
        comparison: deployment.healthComparison || null
      }
    };
  }

  generateDeploymentId() {
    return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getDeploymentStatus(deploymentId) {
    return this.activeDeployments.get(deploymentId);
  }

  listActiveDeployments() {
    return Array.from(this.activeDeployments.values());
  }

  async cancelDeployment(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    if (deployment.status === 'completed' || deployment.status === 'failed') {
      throw new Error(`Cannot cancel deployment ${deploymentId}: already ${deployment.status}`);
    }
    
    deployment.status = 'cancelled';
    deployment.cancelledAt = new Date();
    
    this.emit('deployment:cancelled', deployment);
    this.logger.info(`Deployment ${deploymentId} cancelled`);
    
    // Clean up if possible
    await this.cleanupTemporaryFiles(deployment);
    
    return deployment;
  }

  getMCPStatus() {
    return this.mcpCoordinator.getAllStatus();
  }
}

module.exports = { DeploymentOrchestrator };
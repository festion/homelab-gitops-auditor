// scripts/backup/recovery-service.js
const { BackupManager } = require('./backup-manager');
const { Logger } = require('../services/utils/logger');
const { MCPCoordinator } = require('../services/mcp-coordinator');

class RecoveryService {
  constructor(options = {}) {
    this.backupManager = new BackupManager(options);
    this.logger = new Logger('RecoveryService');
    this.mcpCoordinator = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await this.backupManager.initialize();
      
      this.mcpCoordinator = new MCPCoordinator();
      await this.mcpCoordinator.initialize();
      
      this.initialized = true;
      this.logger.info('Recovery Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Recovery Service', { error: error.message });
      throw error;
    }
  }

  async performEmergencyRecovery(options = {}) {
    await this.ensureInitialized();
    
    this.logger.info('Starting emergency recovery procedure', options);
    
    const { 
      type = 'pre-deployment', 
      maxAttempts = 5,
      validateBefore = true,
      deploymentId = null 
    } = options;
    
    try {
      // Get available backups for recovery
      const backups = await this.backupManager.listBackups({
        type: type,
        limit: maxAttempts
      });
      
      if (backups.length === 0) {
        throw new Error(`No backups found for emergency recovery (type: ${type})`);
      }
      
      this.logger.info(`Found ${backups.length} potential recovery backups`);
      
      // Try each backup in order until one succeeds
      for (let i = 0; i < backups.length; i++) {
        const backup = backups[i];
        
        try {
          this.logger.info(`Attempting recovery with backup ${i + 1}/${backups.length}`, {
            backupId: backup.backupId,
            timestamp: backup.timestamp,
            type: backup.type
          });
          
          // Verify backup integrity first
          await this.backupManager.verifyBackupIntegrity(backup.path);
          
          // Validate backup contents if requested
          if (validateBefore) {
            await this.validateBackupForRecovery(backup);
          }
          
          // Attempt recovery
          const result = await this.backupManager.restoreFromBackup(backup.backupId, {
            skipCurrentBackup: true, // Emergency - don't try to backup current state
            skipValidation: !validateBefore // Skip validation if already done
          });
          
          // Verify system health after recovery
          await this.performPostRecoveryValidation();
          
          this.logger.info('Emergency recovery completed successfully', {
            backupId: backup.backupId,
            attempt: i + 1,
            restoredFiles: result.restoredFiles
          });
          
          return {
            success: true,
            backupId: backup.backupId,
            attempt: i + 1,
            totalAttempts: backups.length,
            restoredFiles: result.restoredFiles,
            restoredSize: result.restoredSize
          };
          
        } catch (error) {
          this.logger.warn(`Recovery attempt ${i + 1} failed`, {
            backupId: backup.backupId,
            error: error.message
          });
          
          // If this was the last backup, throw the error
          if (i === backups.length - 1) {
            throw new Error(`All ${backups.length} recovery attempts failed. Last error: ${error.message}`);
          }
          
          // Continue to next backup
          continue;
        }
      }
      
      throw new Error('Emergency recovery failed - no valid backups found');
      
    } catch (error) {
      this.logger.error('Emergency recovery failed', { 
        error: error.message,
        options 
      });
      throw error;
    }
  }

  async performControlledRollback(deploymentId, options = {}) {
    await this.ensureInitialized();
    
    this.logger.info(`Starting controlled rollback for deployment: ${deploymentId}`, options);
    
    const {
      validateBefore = true,
      createBackupBefore = true,
      healthCheckAfter = true
    } = options;
    
    try {
      // Validate rollback options first
      const rollbackOptions = await this.validateRollbackOptions(deploymentId);
      if (!rollbackOptions.canRollback) {
        throw new Error(`Rollback not possible: ${rollbackOptions.reason}`);
      }
      
      this.logger.info('Rollback validation passed', {
        backupId: rollbackOptions.backupId,
        backupTimestamp: rollbackOptions.backupTimestamp
      });
      
      // Create backup of current state before rollback
      let currentStateBackup = null;
      if (createBackupBefore) {
        try {
          currentStateBackup = await this.backupManager.createPreDeploymentBackup(`rollback-${deploymentId}`);
          this.logger.info('Current state backup created before rollback', {
            backupId: currentStateBackup.backupId
          });
        } catch (error) {
          this.logger.warn('Failed to create current state backup', { error: error.message });
        }
      }
      
      // Perform the rollback
      const rollbackResult = await this.backupManager.rollbackDeployment(deploymentId);
      
      // Perform health checks after rollback
      if (healthCheckAfter) {
        await this.performPostRecoveryValidation();
      }
      
      this.logger.info('Controlled rollback completed successfully', {
        deploymentId,
        backupId: rollbackOptions.backupId,
        currentStateBackup: currentStateBackup?.backupId
      });
      
      return {
        success: true,
        deploymentId,
        rolledBackToBackup: rollbackOptions.backupId,
        currentStateBackup: currentStateBackup?.backupId,
        restoredFiles: rollbackResult.restoredFiles,
        restoredSize: rollbackResult.restoredSize
      };
      
    } catch (error) {
      this.logger.error('Controlled rollback failed', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async validateRollbackOptions(deploymentId) {
    await this.ensureInitialized();
    
    this.logger.debug(`Validating rollback options for deployment: ${deploymentId}`);
    
    try {
      const preDeploymentBackup = await this.backupManager.findPreDeploymentBackup(deploymentId);
      
      if (!preDeploymentBackup) {
        return {
          canRollback: false,
          reason: 'No pre-deployment backup found for this deployment'
        };
      }
      
      // Verify backup still exists and is accessible
      try {
        await this.backupManager.verifyBackupIntegrity(preDeploymentBackup.path);
      } catch (error) {
        return {
          canRollback: false,
          reason: `Pre-deployment backup is corrupted or inaccessible: ${error.message}`
        };
      }
      
      // Check backup age
      const backupAge = Date.now() - new Date(preDeploymentBackup.timestamp).getTime();
      const maxAgeHours = 72; // 3 days
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      
      if (backupAge > maxAgeMs) {
        this.logger.warn('Pre-deployment backup is older than recommended', {
          backupId: preDeploymentBackup.backupId,
          ageHours: Math.floor(backupAge / (60 * 60 * 1000)),
          maxAgeHours
        });
      }
      
      return {
        canRollback: true,
        backupId: preDeploymentBackup.backupId,
        backupTimestamp: preDeploymentBackup.timestamp,
        backupAge: Math.floor(backupAge / (60 * 60 * 1000)), // in hours
        backupSize: preDeploymentBackup.size
      };
      
    } catch (error) {
      this.logger.error('Failed to validate rollback options', {
        deploymentId,
        error: error.message
      });
      
      return {
        canRollback: false,
        reason: `Validation failed: ${error.message}`
      };
    }
  }

  async validateBackupForRecovery(backup) {
    this.logger.debug(`Validating backup for recovery: ${backup.backupId}`);
    
    try {
      // Check backup metadata
      if (!backup.verified) {
        this.logger.warn('Backup was not previously verified', { backupId: backup.backupId });
      }
      
      // Check backup size
      if (backup.size < 1024) { // Less than 1KB is suspicious
        throw new Error('Backup file is suspiciously small');
      }
      
      // Verify checksum if available
      if (backup.checksum) {
        const currentChecksum = await this.backupManager.calculateChecksum(backup.path);
        if (currentChecksum !== backup.checksum) {
          throw new Error('Backup checksum mismatch - file may be corrupted');
        }
      }
      
      // Check backup age for freshness
      const backupAge = Date.now() - new Date(backup.timestamp).getTime();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (backupAge > maxAge) {
        this.logger.warn('Backup is older than 30 days', {
          backupId: backup.backupId,
          ageDays: Math.floor(backupAge / (24 * 60 * 60 * 1000))
        });
      }
      
      this.logger.debug('Backup validation passed', { backupId: backup.backupId });
      return true;
      
    } catch (error) {
      this.logger.error('Backup validation failed', {
        backupId: backup.backupId,
        error: error.message
      });
      throw error;
    }
  }

  async performPostRecoveryValidation() {
    this.logger.info('Performing post-recovery validation');
    
    try {
      // Check if MCP coordinator can connect to services
      const healthStatus = await this.mcpCoordinator.performHealthChecks();
      
      if (!healthStatus.healthy) {
        this.logger.warn('System health check failed after recovery', {
          issues: healthStatus.issues
        });
        throw new Error(`Post-recovery validation failed: ${healthStatus.issues.join(', ')}`);
      }
      
      // Additional validation can be added here
      // - Check Home Assistant configuration validity
      // - Verify essential services are responding
      // - Test basic functionality
      
      this.logger.info('Post-recovery validation passed');
      return true;
      
    } catch (error) {
      this.logger.error('Post-recovery validation failed', { error: error.message });
      throw error;
    }
  }

  async getRecoveryOptions(criteria = {}) {
    await this.ensureInitialized();
    
    this.logger.debug('Getting recovery options', criteria);
    
    try {
      const { deploymentId, type, maxAge } = criteria;
      
      // Get available backups
      const backups = await this.backupManager.listBackups({
        type: type,
        deploymentId: deploymentId,
        limit: 20
      });
      
      // Filter by age if specified
      let eligibleBackups = backups;
      if (maxAge) {
        const cutoffTime = Date.now() - (maxAge * 60 * 60 * 1000); // maxAge in hours
        eligibleBackups = backups.filter(backup => 
          new Date(backup.timestamp).getTime() > cutoffTime
        );
      }
      
      // Add recovery assessment for each backup
      const recoveryOptions = await Promise.all(
        eligibleBackups.map(async (backup) => {
          try {
            // Check if backup is accessible
            const accessible = await this.backupManager.isBackupAccessible(backup.path);
            
            // Assess recovery viability
            let viability = 'good';
            const issues = [];
            
            if (!accessible) {
              viability = 'poor';
              issues.push('Backup file not accessible');
            }
            
            if (!backup.verified) {
              viability = viability === 'good' ? 'fair' : viability;
              issues.push('Backup not verified');
            }
            
            const ageHours = (Date.now() - new Date(backup.timestamp).getTime()) / (60 * 60 * 1000);
            if (ageHours > 168) { // More than 7 days
              viability = viability === 'good' ? 'fair' : viability;
              issues.push('Backup is more than 7 days old');
            }
            
            return {
              ...backup,
              accessible,
              viability,
              issues,
              ageHours: Math.floor(ageHours)
            };
            
          } catch (error) {
            return {
              ...backup,
              accessible: false,
              viability: 'poor',
              issues: [error.message],
              ageHours: Math.floor((Date.now() - new Date(backup.timestamp).getTime()) / (60 * 60 * 1000))
            };
          }
        })
      );
      
      // Sort by viability and age
      recoveryOptions.sort((a, b) => {
        const viabilityOrder = { good: 3, fair: 2, poor: 1 };
        if (viabilityOrder[a.viability] !== viabilityOrder[b.viability]) {
          return viabilityOrder[b.viability] - viabilityOrder[a.viability];
        }
        return a.ageHours - b.ageHours; // Prefer newer backups
      });
      
      this.logger.debug(`Found ${recoveryOptions.length} recovery options`);
      
      return {
        totalBackups: backups.length,
        eligibleBackups: recoveryOptions.length,
        options: recoveryOptions
      };
      
    } catch (error) {
      this.logger.error('Failed to get recovery options', { error: error.message });
      throw error;
    }
  }

  async createRecoveryPlan(deploymentId, targetBackupId = null) {
    await this.ensureInitialized();
    
    this.logger.info(`Creating recovery plan for deployment: ${deploymentId}`);
    
    try {
      const plan = {
        deploymentId,
        createdAt: new Date().toISOString(),
        steps: [],
        estimatedDuration: 0,
        risks: [],
        prerequisites: []
      };
      
      // Step 1: Validate recovery target
      let targetBackup;
      if (targetBackupId) {
        targetBackup = await this.backupManager.getBackupInfo(targetBackupId);
        if (!targetBackup.exists) {
          throw new Error(`Target backup not found: ${targetBackupId}`);
        }
      } else {
        // Find best recovery option
        const rollbackOptions = await this.validateRollbackOptions(deploymentId);
        if (!rollbackOptions.canRollback) {
          throw new Error(`No suitable recovery target found: ${rollbackOptions.reason}`);
        }
        targetBackup = await this.backupManager.getBackupInfo(rollbackOptions.backupId);
      }
      
      plan.targetBackup = {
        backupId: targetBackup.backupId,
        timestamp: targetBackup.timestamp,
        size: targetBackup.size,
        type: targetBackup.type
      };
      
      // Step 2: Pre-recovery steps
      plan.steps.push({
        step: 1,
        name: 'Create current state backup',
        description: 'Backup current configuration before recovery',
        estimatedMinutes: 2,
        critical: false
      });
      
      plan.steps.push({
        step: 2,
        name: 'Verify target backup integrity',
        description: 'Ensure target backup is not corrupted',
        estimatedMinutes: 1,
        critical: true
      });
      
      // Step 3: Recovery execution
      plan.steps.push({
        step: 3,
        name: 'Extract backup to temporary location',
        description: 'Extract backup contents for validation',
        estimatedMinutes: 3,
        critical: true
      });
      
      plan.steps.push({
        step: 4,
        name: 'Validate configuration',
        description: 'Ensure extracted configuration is valid',
        estimatedMinutes: 2,
        critical: true
      });
      
      plan.steps.push({
        step: 5,
        name: 'Apply recovered configuration',
        description: 'Replace current configuration with backup',
        estimatedMinutes: 5,
        critical: true
      });
      
      // Step 4: Post-recovery validation
      plan.steps.push({
        step: 6,
        name: 'System health check',
        description: 'Verify system is functioning correctly',
        estimatedMinutes: 3,
        critical: true
      });
      
      // Calculate total estimated duration
      plan.estimatedDuration = plan.steps.reduce((total, step) => total + step.estimatedMinutes, 0);
      
      // Assess risks
      const backupAge = Date.now() - new Date(targetBackup.timestamp).getTime();
      const ageHours = backupAge / (60 * 60 * 1000);
      
      if (ageHours > 24) {
        plan.risks.push(`Target backup is ${Math.floor(ageHours)} hours old - some recent changes will be lost`);
      }
      
      if (!targetBackup.verified) {
        plan.risks.push('Target backup has not been previously verified');
      }
      
      if (targetBackup.size < 10240) { // Less than 10KB
        plan.risks.push('Target backup file is unusually small');
      }
      
      // Prerequisites
      plan.prerequisites.push('Ensure sufficient disk space for backup extraction');
      plan.prerequisites.push('Verify no critical operations are in progress');
      plan.prerequisites.push('Confirm recovery authorization');
      
      this.logger.info('Recovery plan created successfully', {
        deploymentId,
        targetBackupId: targetBackup.backupId,
        estimatedDuration: plan.estimatedDuration,
        riskCount: plan.risks.length
      });
      
      return plan;
      
    } catch (error) {
      this.logger.error('Failed to create recovery plan', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  // Utility methods
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

module.exports = { RecoveryService };
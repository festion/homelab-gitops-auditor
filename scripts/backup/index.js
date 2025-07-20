// scripts/backup/index.js
// Main entry point for the backup and recovery system

const { BackupManager } = require('./backup-manager');
const { RecoveryService } = require('./recovery-service');
const { BackupMetadata } = require('./backup-metadata');
const { BackupValidator } = require('./backup-validator');
const { BackupScheduler } = require('./backup-scheduler');
const { Logger } = require('../services/utils/logger');

class BackupSystem {
  constructor(options = {}) {
    this.logger = new Logger('BackupSystem');
    this.options = {
      backupDir: '/backup',
      enableScheduler: true,
      enableValidation: true,
      ...options
    };
    
    // Initialize components
    this.backupManager = new BackupManager(this.options);
    this.recoveryService = new RecoveryService(this.options);
    this.backupMetadata = new BackupMetadata(this.options);
    this.backupValidator = new BackupValidator(this.options);
    
    if (this.options.enableScheduler) {
      this.backupScheduler = new BackupScheduler(this.options);
    }
    
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing Backup System');
      
      // Initialize core components
      await this.backupManager.initialize();
      await this.recoveryService.initialize();
      await this.backupMetadata.initialize();
      
      // Initialize scheduler if enabled
      if (this.backupScheduler) {
        await this.backupScheduler.initialize();
      }
      
      this.initialized = true;
      this.logger.info('Backup System initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Backup System', { error: error.message });
      throw error;
    }
  }

  async startScheduler() {
    if (!this.backupScheduler) {
      throw new Error('Backup scheduler is not enabled');
    }
    
    await this.backupScheduler.start();
    this.logger.info('Backup scheduler started');
  }

  async stopScheduler() {
    if (!this.backupScheduler) {
      throw new Error('Backup scheduler is not enabled');
    }
    
    await this.backupScheduler.stop();
    this.logger.info('Backup scheduler stopped');
  }

  // Convenience methods that delegate to appropriate components
  async createPreDeploymentBackup(deploymentId) {
    await this.ensureInitialized();
    return this.backupManager.createPreDeploymentBackup(deploymentId);
  }

  async createScheduledBackup() {
    await this.ensureInitialized();
    return this.backupManager.createScheduledBackup();
  }

  async restoreFromBackup(backupId, options = {}) {
    await this.ensureInitialized();
    return this.backupManager.restoreFromBackup(backupId, options);
  }

  async rollbackDeployment(deploymentId) {
    await this.ensureInitialized();
    return this.recoveryService.performControlledRollback(deploymentId);
  }

  async performEmergencyRecovery(options = {}) {
    await this.ensureInitialized();
    return this.recoveryService.performEmergencyRecovery(options);
  }

  async validateBackup(backupPath, options = {}) {
    await this.ensureInitialized();
    return this.backupValidator.validateBackupIntegrity(backupPath, options);
  }

  async listBackups(filters = {}) {
    await this.ensureInitialized();
    return this.backupMetadata.listBackups(filters);
  }

  async getBackupInfo(backupId) {
    await this.ensureInitialized();
    return this.backupManager.getBackupInfo(backupId);
  }

  async cleanupExpiredBackups() {
    await this.ensureInitialized();
    return this.backupManager.cleanupExpiredBackups();
  }

  async getSystemStatus() {
    await this.ensureInitialized();
    
    try {
      const [
        backupStats,
        scheduleStatus,
        recentBackups
      ] = await Promise.all([
        this.backupMetadata.getStatistics(),
        this.backupScheduler ? this.backupScheduler.getScheduleStatus() : null,
        this.backupMetadata.listBackups({ limit: 5, sortBy: 'timestamp', sortOrder: 'desc' })
      ]);
      
      return {
        initialized: this.initialized,
        components: {
          backupManager: !!this.backupManager,
          recoveryService: !!this.recoveryService,
          backupMetadata: !!this.backupMetadata,
          backupValidator: !!this.backupValidator,
          backupScheduler: !!this.backupScheduler
        },
        statistics: backupStats,
        scheduler: scheduleStatus,
        recentBackups: recentBackups.map(backup => ({
          backupId: backup.backupId,
          type: backup.type,
          timestamp: backup.timestamp,
          size: backup.size,
          verified: backup.verification?.verified || false
        })),
        healthStatus: await this.performHealthCheck()
      };
      
    } catch (error) {
      this.logger.error('Failed to get system status', { error: error.message });
      throw error;
    }
  }

  async performHealthCheck() {
    const health = {
      status: 'healthy',
      issues: [],
      checks: {}
    };
    
    try {
      // Check backup directory accessibility
      const fs = require('fs').promises;
      try {
        await fs.access(this.options.backupDir);
        health.checks.backupDirectory = { status: 'ok', accessible: true };
      } catch (error) {
        health.checks.backupDirectory = { status: 'error', accessible: false, error: error.message };
        health.issues.push('Backup directory not accessible');
      }
      
      // Check disk space
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync(`df -h "${this.options.backupDir}"`);
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          const usedPercent = parseInt(parts[4]?.replace('%', '') || '0', 10);
          
          health.checks.diskSpace = { 
            status: usedPercent > 90 ? 'warning' : 'ok', 
            usedPercent,
            available: parts[3]
          };
          
          if (usedPercent > 90) {
            health.issues.push(`Backup disk space is ${usedPercent}% full`);
          }
        }
      } catch (error) {
        health.checks.diskSpace = { status: 'error', error: error.message };
      }
      
      // Check recent backup success
      try {
        const recentBackups = await this.backupMetadata.listBackups({ 
          limit: 5, 
          sortBy: 'timestamp', 
          sortOrder: 'desc' 
        });
        
        const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
        const recentSuccessful = recentBackups.filter(backup => 
          new Date(backup.timestamp).getTime() > last24Hours &&
          backup.verification?.verified
        );
        
        health.checks.recentBackups = {
          status: recentSuccessful.length > 0 ? 'ok' : 'warning',
          count: recentSuccessful.length,
          total: recentBackups.length
        };
        
        if (recentSuccessful.length === 0) {
          health.issues.push('No verified backups in the last 24 hours');
        }
        
      } catch (error) {
        health.checks.recentBackups = { status: 'error', error: error.message };
      }
      
      // Overall health status
      const hasErrors = Object.values(health.checks).some(check => check.status === 'error');
      const hasWarnings = Object.values(health.checks).some(check => check.status === 'warning');
      
      if (hasErrors) {
        health.status = 'unhealthy';
      } else if (hasWarnings) {
        health.status = 'degraded';
      }
      
      return health;
      
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        issues: [`Health check failed: ${error.message}`],
        checks: {}
      };
    }
  }

  async exportConfiguration() {
    await this.ensureInitialized();
    
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      configuration: {
        backupDir: this.options.backupDir,
        enableScheduler: this.options.enableScheduler,
        enableValidation: this.options.enableValidation
      },
      statistics: await this.backupMetadata.getStatistics(),
      schedules: this.backupScheduler ? this.backupScheduler.config : null
    };
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Error classes for backup system
class BackupError extends Error {
  constructor(message, code = 'BACKUP_ERROR') {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

class RecoveryError extends Error {
  constructor(message, code = 'RECOVERY_ERROR') {
    super(message);
    this.name = 'RecoveryError';
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

// Utility functions
const utils = {
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },

  isValidBackupId(backupId) {
    return typeof backupId === 'string' && 
           backupId.length > 0 && 
           /^[a-zA-Z0-9_-]+$/.test(backupId);
  }
};

module.exports = {
  BackupSystem,
  BackupManager,
  RecoveryService,
  BackupMetadata,
  BackupValidator,
  BackupScheduler,
  BackupError,
  RecoveryError,
  ValidationError,
  utils
};
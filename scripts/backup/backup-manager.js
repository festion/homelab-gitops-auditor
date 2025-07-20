// scripts/backup/backup-manager.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const execAsync = promisify(exec);

// Import dependencies from existing services
const { Logger } = require('../services/utils/logger');
const { MCPCoordinator } = require('../services/mcp-coordinator');

class BackupManager {
  constructor(options = {}) {
    this.config = options.config || null;
    this.logger = new Logger('BackupManager');
    this.mcpCoordinator = null;
    this.backupDir = options.backupDir || '/backup';
    this.metadataFile = path.join(this.backupDir, '.backup-metadata.json');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize MCP coordinator
      this.mcpCoordinator = new MCPCoordinator();
      await this.mcpCoordinator.initialize();
      
      // Ensure backup directory exists
      await this.ensureBackupDirectory();
      
      // Load existing metadata
      await this.loadBackupMetadata();
      
      this.initialized = true;
      this.logger.info('Backup Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Backup Manager', { error: error.message });
      throw error;
    }
  }

  async createPreDeploymentBackup(deploymentId) {
    await this.ensureInitialized();
    
    this.logger.info(`Creating pre-deployment backup for deployment: ${deploymentId}`);
    
    const backupId = `pre-deploy-${deploymentId}-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    try {
      // Create backup
      const backupResult = await this.createBackup(backupId, {
        type: 'pre-deployment',
        deploymentId: deploymentId,
        timestamp: timestamp,
        reason: 'Pre-deployment safety backup'
      });
      
      // Verify backup integrity
      await this.verifyBackupIntegrity(backupResult.path);
      
      // Update metadata
      await this.updateBackupMetadata({
        backupId: backupId,
        path: backupResult.path,
        type: 'pre-deployment',
        deploymentId: deploymentId,
        timestamp: timestamp,
        size: backupResult.size,
        checksum: backupResult.checksum,
        verified: true,
        fileCount: backupResult.fileCount
      });
      
      this.logger.info(`Pre-deployment backup created successfully`, {
        backupId,
        path: backupResult.path,
        size: backupResult.size
      });
      
      return {
        backupId: backupId,
        path: backupResult.path,
        size: backupResult.size,
        checksum: backupResult.checksum
      };
      
    } catch (error) {
      this.logger.error(`Failed to create pre-deployment backup`, {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async createScheduledBackup() {
    await this.ensureInitialized();
    
    this.logger.info('Creating scheduled backup');
    
    const backupId = `scheduled-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    try {
      const backupResult = await this.createBackup(backupId, {
        type: 'scheduled',
        timestamp: timestamp,
        reason: 'Scheduled backup'
      });
      
      await this.verifyBackupIntegrity(backupResult.path);
      
      await this.updateBackupMetadata({
        backupId: backupId,
        path: backupResult.path,
        type: 'scheduled',
        timestamp: timestamp,
        size: backupResult.size,
        checksum: backupResult.checksum,
        verified: true,
        fileCount: backupResult.fileCount
      });
      
      this.logger.info(`Scheduled backup created successfully`, {
        backupId,
        size: backupResult.size
      });
      
      return backupId;
      
    } catch (error) {
      this.logger.error(`Failed to create scheduled backup`, { error: error.message });
      throw error;
    }
  }

  async createBackup(backupId, metadata) {
    const backupPath = path.join(this.backupDir, `${backupId}.tar.gz`);
    const configPath = '/config';
    
    this.logger.info(`Creating backup: ${backupId}`, { backupPath });
    
    try {
      // Use MCP coordinator to get configuration files list first
      const configFiles = await this.mcpCoordinator.getConfigurationFiles();
      
      if (!configFiles || configFiles.length === 0) {
        this.logger.warn('No configuration files found for backup');
      }
      
      // Create compressed backup using tar
      const tarCommand = `tar -czf "${backupPath}" -C "${configPath}" .`;
      
      const { stdout, stderr } = await execAsync(tarCommand, { 
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      if (stderr && !stderr.includes('tar:')) {
        this.logger.warn(`Backup creation warnings: ${stderr}`);
      }
      
      // Set appropriate permissions
      await execAsync(`chmod 600 "${backupPath}"`);
      
      // Calculate file stats
      const stats = await fs.stat(backupPath);
      const checksum = await this.calculateChecksum(backupPath);
      
      this.logger.info(`Backup file created successfully`, {
        backupId,
        path: backupPath,
        size: stats.size
      });
      
      return {
        path: backupPath,
        size: stats.size,
        checksum: checksum,
        fileCount: configFiles.length || 'unknown'
      };
      
    } catch (error) {
      this.logger.error(`Failed to create backup: ${backupId}`, { error: error.message });
      
      // Clean up failed backup
      try {
        await fs.unlink(backupPath);
        this.logger.info(`Cleaned up failed backup file: ${backupPath}`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup failed backup`, { 
          backupPath, 
          error: cleanupError.message 
        });
      }
      
      throw error;
    }
  }

  async restoreFromBackup(backupId, options = {}) {
    await this.ensureInitialized();
    
    this.logger.info(`Starting restoration from backup: ${backupId}`, options);
    
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    const backupPath = metadata.path;
    const configPath = '/config';
    const tempRestorePath = `/tmp/restore-${Date.now()}`;
    
    try {
      // Verify backup integrity before restoration
      await this.verifyBackupIntegrity(backupPath);
      
      // Extract backup to temporary location
      await execAsync(`mkdir -p "${tempRestorePath}"`);
      await execAsync(`tar -xzf "${backupPath}" -C "${tempRestorePath}"`);
      
      // Validate extracted configuration if requested
      if (!options.skipValidation) {
        await this.validateConfiguration(tempRestorePath);
      }
      
      // Create current config backup before restoration
      if (!options.skipCurrentBackup) {
        await this.createBackup(`pre-restore-${Date.now()}`, {
          type: 'pre-restore',
          timestamp: new Date().toISOString(),
          reason: `Backup before restoring ${backupId}`
        });
      }
      
      // Restore configuration using MCP coordinator
      await this.mcpCoordinator.deploymentOperations({
        repository: 'backup-restore',
        branch: 'restore',
        backupPath: tempRestorePath,
        targetPath: configPath
      });
      
      // Cleanup temporary files
      await execAsync(`rm -rf "${tempRestorePath}"`);
      
      this.logger.info(`Restoration completed successfully`, {
        backupId,
        restoredFiles: metadata.fileCount || 'unknown'
      });
      
      return {
        success: true,
        backupId: backupId,
        restoredFiles: metadata.fileCount || 'unknown',
        restoredSize: metadata.size
      };
      
    } catch (error) {
      this.logger.error(`Restoration failed`, {
        backupId,
        error: error.message
      });
      
      // Cleanup temporary files
      try {
        await execAsync(`rm -rf "${tempRestorePath}"`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup temporary files`, {
          tempRestorePath,
          error: cleanupError.message
        });
      }
      
      throw error;
    }
  }

  async rollbackDeployment(deploymentId) {
    await this.ensureInitialized();
    
    this.logger.info(`Rolling back deployment: ${deploymentId}`);
    
    try {
      // Find pre-deployment backup
      const backupMetadata = await this.findPreDeploymentBackup(deploymentId);
      if (!backupMetadata) {
        throw new Error(`No pre-deployment backup found for deployment: ${deploymentId}`);
      }
      
      // Restore from backup
      const result = await this.restoreFromBackup(backupMetadata.backupId, {
        skipCurrentBackup: true // Don't backup current state during rollback
      });
      
      // Update metadata to mark as rollback
      await this.updateBackupMetadata({
        ...backupMetadata,
        rollbackTimestamp: new Date().toISOString(),
        rollbackDeploymentId: deploymentId,
        rollbackCompleted: true
      });
      
      this.logger.info(`Rollback completed successfully`, {
        deploymentId,
        backupId: backupMetadata.backupId
      });
      
      return result;
      
    } catch (error) {
      this.logger.error(`Rollback failed`, {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async verifyBackupIntegrity(backupPath) {
    this.logger.debug(`Verifying backup integrity: ${backupPath}`);
    
    try {
      // Test tar file integrity
      await execAsync(`tar -tzf "${backupPath}" > /dev/null`);
      
      // Verify file exists and has content
      const stats = await fs.stat(backupPath);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }
      
      // Verify file is accessible
      await fs.access(backupPath, fs.constants.R_OK);
      
      this.logger.debug(`Backup integrity verified successfully`, {
        path: backupPath,
        size: stats.size
      });
      
      return true;
      
    } catch (error) {
      this.logger.error(`Backup integrity verification failed`, {
        path: backupPath,
        error: error.message
      });
      throw new Error(`Backup integrity verification failed: ${error.message}`);
    }
  }

  async validateConfiguration(configPath) {
    this.logger.debug(`Validating configuration: ${configPath}`);
    
    try {
      // Check for essential Home Assistant files
      const essentialFiles = [
        'configuration.yaml',
        'automations.yaml',
        'scripts.yaml'
      ];
      
      for (const file of essentialFiles) {
        const filePath = path.join(configPath, file);
        try {
          await fs.access(filePath, fs.constants.R_OK);
        } catch (error) {
          this.logger.warn(`Essential file missing: ${file}`);
        }
      }
      
      // Basic YAML validation for configuration.yaml
      const configFile = path.join(configPath, 'configuration.yaml');
      try {
        const configContent = await fs.readFile(configFile, 'utf8');
        if (configContent.trim().length === 0) {
          throw new Error('Configuration file is empty');
        }
        
        // Basic YAML structure check
        if (!configContent.includes('homeassistant:')) {
          this.logger.warn('Configuration may be missing homeassistant section');
        }
      } catch (error) {
        this.logger.warn(`Configuration validation warning: ${error.message}`);
      }
      
      this.logger.debug('Configuration validation completed');
      return true;
      
    } catch (error) {
      this.logger.error(`Configuration validation failed: ${error.message}`);
      throw error;
    }
  }

  async cleanupExpiredBackups() {
    await this.ensureInitialized();
    
    this.logger.info('Starting cleanup of expired backups');
    
    const retentionDays = this.config?.deployment?.homeAssistantConfig?.backupRetention || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    try {
      const metadata = await this.loadBackupMetadata();
      const expiredBackups = metadata.backups.filter(backup => {
        const backupDate = new Date(backup.timestamp);
        return backupDate < cutoffDate && backup.type !== 'manual'; // Keep manual backups
      });
      
      let deletedCount = 0;
      
      for (const backup of expiredBackups) {
        try {
          await fs.unlink(backup.path);
          deletedCount++;
          this.logger.info(`Deleted expired backup`, {
            backupId: backup.backupId,
            path: backup.path,
            age: Math.floor((Date.now() - new Date(backup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
          });
        } catch (error) {
          this.logger.warn(`Failed to delete expired backup`, {
            backupId: backup.backupId,
            error: error.message
          });
        }
      }
      
      // Update metadata to remove deleted backups
      metadata.backups = metadata.backups.filter(backup => {
        return !expiredBackups.some(expired => expired.backupId === backup.backupId);
      });
      
      await this.saveBackupMetadata(metadata);
      
      this.logger.info(`Cleanup completed successfully`, {
        deletedCount,
        retentionDays,
        totalBackups: metadata.backups.length
      });
      
      return {
        deletedCount,
        remainingBackups: metadata.backups.length
      };
      
    } catch (error) {
      this.logger.error(`Backup cleanup failed: ${error.message}`);
      throw error;
    }
  }

  async listBackups(options = {}) {
    await this.ensureInitialized();
    
    const metadata = await this.loadBackupMetadata();
    let backups = [...metadata.backups];
    
    // Apply filters
    if (options.type) {
      backups = backups.filter(backup => backup.type === options.type);
    }
    
    if (options.deploymentId) {
      backups = backups.filter(backup => backup.deploymentId === options.deploymentId);
    }
    
    if (options.limit) {
      backups = backups.slice(0, options.limit);
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Add runtime information
    for (const backup of backups) {
      try {
        const stats = await fs.stat(backup.path);
        backup.exists = true;
        backup.actualSize = stats.size;
        backup.lastModified = stats.mtime;
      } catch (error) {
        backup.exists = false;
        backup.error = error.message;
      }
    }
    
    return backups;
  }

  async getBackupInfo(backupId) {
    await this.ensureInitialized();
    
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    // Add additional runtime info
    try {
      const stats = await fs.stat(metadata.path);
      
      return {
        ...metadata,
        exists: true,
        actualSize: stats.size,
        lastModified: stats.mtime,
        accessible: await this.isBackupAccessible(metadata.path)
      };
    } catch (error) {
      return {
        ...metadata,
        exists: false,
        accessible: false,
        error: error.message
      };
    }
  }

  // Utility Methods
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      await execAsync(`chmod 700 "${this.backupDir}"`);
      this.logger.debug(`Backup directory ensured: ${this.backupDir}`);
    } catch (error) {
      this.logger.error(`Failed to create backup directory: ${error.message}`);
      throw error;
    }
  }

  async loadBackupMetadata() {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      const metadata = JSON.parse(data);
      this.logger.debug(`Loaded backup metadata: ${metadata.backups.length} backups`);
      return metadata;
    } catch (error) {
      // Initialize empty metadata if file doesn't exist
      const metadata = {
        version: '1.0',
        created: new Date().toISOString(),
        backups: []
      };
      await this.saveBackupMetadata(metadata);
      this.logger.debug('Initialized new backup metadata');
      return metadata;
    }
  }

  async saveBackupMetadata(metadata) {
    metadata.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
    await execAsync(`chmod 600 "${this.metadataFile}"`);
    this.logger.debug('Backup metadata saved');
  }

  async updateBackupMetadata(backupInfo) {
    const metadata = await this.loadBackupMetadata();
    
    // Remove existing entry if it exists
    metadata.backups = metadata.backups.filter(backup => backup.backupId !== backupInfo.backupId);
    
    // Add new entry
    metadata.backups.push(backupInfo);
    
    await this.saveBackupMetadata(metadata);
  }

  async getBackupMetadata(backupId) {
    const metadata = await this.loadBackupMetadata();
    return metadata.backups.find(backup => backup.backupId === backupId);
  }

  async findPreDeploymentBackup(deploymentId) {
    const metadata = await this.loadBackupMetadata();
    return metadata.backups.find(backup => 
      backup.type === 'pre-deployment' && backup.deploymentId === deploymentId
    );
  }

  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async isBackupAccessible(backupPath) {
    try {
      await fs.access(backupPath, fs.constants.R_OK);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { BackupManager };
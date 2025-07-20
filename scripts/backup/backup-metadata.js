// scripts/backup/backup-metadata.js
const fs = require('fs').promises;
const path = require('path');
const { Logger } = require('../services/utils/logger');

class BackupMetadata {
  constructor(options = {}) {
    this.metadataFile = options.metadataFile || '/backup/.backup-metadata.json';
    this.logger = new Logger('BackupMetadata');
    this.cache = null;
    this.lastLoaded = null;
  }

  async initialize() {
    try {
      await this.ensureMetadataFile();
      await this.loadMetadata();
      this.logger.info('Backup metadata initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize backup metadata', { error: error.message });
      throw error;
    }
  }

  async ensureMetadataFile() {
    try {
      await fs.access(this.metadataFile);
    } catch (error) {
      // File doesn't exist, create it
      const initialMetadata = this.createInitialMetadata();
      await this.saveMetadata(initialMetadata);
      this.logger.info('Created initial backup metadata file', { path: this.metadataFile });
    }
  }

  createInitialMetadata() {
    return {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      backups: [],
      statistics: {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
        typeDistribution: {}
      },
      retention: {
        defaultDays: 7,
        typeSpecific: {
          'pre-deployment': 30,
          'scheduled': 7,
          'manual': 365,
          'emergency': 90
        }
      },
      integrity: {
        lastCheck: null,
        checksum: null,
        checksumAlgorithm: 'sha256'
      }
    };
  }

  async loadMetadata() {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      this.cache = JSON.parse(data);
      this.lastLoaded = Date.now();
      
      // Validate and migrate if necessary
      this.cache = this.validateAndMigrate(this.cache);
      
      this.logger.debug('Metadata loaded successfully', {
        backupCount: this.cache.backups.length,
        version: this.cache.version
      });
      
      return this.cache;
    } catch (error) {
      this.logger.error('Failed to load metadata', { error: error.message });
      
      // If parsing fails, create backup of corrupted file and reinitialize
      if (error instanceof SyntaxError) {
        await this.handleCorruptedMetadata();
        return this.loadMetadata(); // Retry
      }
      
      throw error;
    }
  }

  async saveMetadata(metadata = null) {
    const dataToSave = metadata || this.cache;
    
    if (!dataToSave) {
      throw new Error('No metadata to save');
    }
    
    try {
      // Update timestamps and statistics
      dataToSave.lastUpdated = new Date().toISOString();
      this.updateStatistics(dataToSave);
      
      // Create backup of current metadata before saving
      await this.createMetadataBackup();
      
      // Save the new metadata
      await fs.writeFile(this.metadataFile, JSON.stringify(dataToSave, null, 2));
      await fs.chmod(this.metadataFile, 0o600); // Secure permissions
      
      this.cache = dataToSave;
      this.lastLoaded = Date.now();
      
      this.logger.debug('Metadata saved successfully', {
        backupCount: dataToSave.backups.length
      });
      
    } catch (error) {
      this.logger.error('Failed to save metadata', { error: error.message });
      throw error;
    }
  }

  async handleCorruptedMetadata() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptedFile = `${this.metadataFile}.corrupted.${timestamp}`;
    
    try {
      await fs.rename(this.metadataFile, corruptedFile);
      this.logger.warn('Metadata file was corrupted, backed up and recreating', {
        corruptedFile
      });
      
      // Create new metadata file
      const newMetadata = this.createInitialMetadata();
      await this.saveMetadata(newMetadata);
      
    } catch (error) {
      this.logger.error('Failed to handle corrupted metadata', { error: error.message });
      throw error;
    }
  }

  validateAndMigrate(metadata) {
    // Ensure required fields exist
    if (!metadata.version) {
      metadata.version = '1.0.0';
    }
    
    if (!metadata.backups) {
      metadata.backups = [];
    }
    
    if (!metadata.statistics) {
      metadata.statistics = {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
        typeDistribution: {}
      };
    }
    
    if (!metadata.retention) {
      metadata.retention = {
        defaultDays: 7,
        typeSpecific: {
          'pre-deployment': 30,
          'scheduled': 7,
          'manual': 365,
          'emergency': 90
        }
      };
    }
    
    if (!metadata.integrity) {
      metadata.integrity = {
        lastCheck: null,
        checksum: null,
        checksumAlgorithm: 'sha256'
      };
    }
    
    // Migrate old backup entries if needed
    metadata.backups = metadata.backups.map(backup => {
      if (!backup.metadata) {
        backup.metadata = {};
      }
      
      if (!backup.verification) {
        backup.verification = {
          verified: backup.verified || false,
          lastCheck: backup.verifiedAt || null,
          checksum: backup.checksum || null
        };
      }
      
      return backup;
    });
    
    return metadata;
  }

  updateStatistics(metadata) {
    const backups = metadata.backups;
    
    metadata.statistics.totalBackups = backups.length;
    metadata.statistics.totalSize = backups.reduce((total, backup) => total + (backup.size || 0), 0);
    
    if (backups.length > 0) {
      const timestamps = backups.map(b => new Date(b.timestamp)).sort((a, b) => a - b);
      metadata.statistics.oldestBackup = timestamps[0].toISOString();
      metadata.statistics.newestBackup = timestamps[timestamps.length - 1].toISOString();
      
      // Type distribution
      metadata.statistics.typeDistribution = backups.reduce((dist, backup) => {
        const type = backup.type || 'unknown';
        dist[type] = (dist[type] || 0) + 1;
        return dist;
      }, {});
    } else {
      metadata.statistics.oldestBackup = null;
      metadata.statistics.newestBackup = null;
      metadata.statistics.typeDistribution = {};
    }
  }

  async createMetadataBackup() {
    if (!this.cache) {
      return;
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = `${this.metadataFile}.backup.${timestamp}`;
      
      await fs.writeFile(backupFile, JSON.stringify(this.cache, null, 2));
      
      // Keep only the last 5 metadata backups
      await this.cleanupMetadataBackups();
      
    } catch (error) {
      this.logger.warn('Failed to create metadata backup', { error: error.message });
      // Don't throw - this is not critical
    }
  }

  async cleanupMetadataBackups() {
    try {
      const metadataDir = path.dirname(this.metadataFile);
      const metadataName = path.basename(this.metadataFile);
      
      const files = await fs.readdir(metadataDir);
      const backupFiles = files
        .filter(file => file.startsWith(`${metadataName}.backup.`))
        .map(file => ({
          name: file,
          path: path.join(metadataDir, file)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (newest first)
      
      // Keep only the last 5 backups
      if (backupFiles.length > 5) {
        const filesToDelete = backupFiles.slice(5);
        
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
          } catch (error) {
            this.logger.warn('Failed to delete old metadata backup', {
              file: file.name,
              error: error.message
            });
          }
        }
      }
      
    } catch (error) {
      this.logger.warn('Failed to cleanup metadata backups', { error: error.message });
    }
  }

  async addBackup(backupInfo) {
    await this.ensureLoaded();
    
    // Remove existing entry if it exists
    this.cache.backups = this.cache.backups.filter(backup => backup.backupId !== backupInfo.backupId);
    
    // Add verification information
    const backupEntry = {
      ...backupInfo,
      addedAt: new Date().toISOString(),
      metadata: backupInfo.metadata || {},
      verification: {
        verified: backupInfo.verified || false,
        lastCheck: backupInfo.verified ? new Date().toISOString() : null,
        checksum: backupInfo.checksum || null
      }
    };
    
    this.cache.backups.push(backupEntry);
    
    await this.saveMetadata();
    
    this.logger.debug('Backup added to metadata', {
      backupId: backupInfo.backupId,
      type: backupInfo.type
    });
  }

  async removeBackup(backupId) {
    await this.ensureLoaded();
    
    const originalCount = this.cache.backups.length;
    this.cache.backups = this.cache.backups.filter(backup => backup.backupId !== backupId);
    
    if (this.cache.backups.length < originalCount) {
      await this.saveMetadata();
      this.logger.debug('Backup removed from metadata', { backupId });
      return true;
    }
    
    return false;
  }

  async updateBackup(backupId, updates) {
    await this.ensureLoaded();
    
    const backupIndex = this.cache.backups.findIndex(backup => backup.backupId === backupId);
    
    if (backupIndex === -1) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    // Merge updates
    this.cache.backups[backupIndex] = {
      ...this.cache.backups[backupIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await this.saveMetadata();
    
    this.logger.debug('Backup updated in metadata', { backupId, updates });
  }

  async getBackup(backupId) {
    await this.ensureLoaded();
    
    return this.cache.backups.find(backup => backup.backupId === backupId);
  }

  async listBackups(filters = {}) {
    await this.ensureLoaded();
    
    let backups = [...this.cache.backups];
    
    // Apply filters
    if (filters.type) {
      backups = backups.filter(backup => backup.type === filters.type);
    }
    
    if (filters.deploymentId) {
      backups = backups.filter(backup => backup.deploymentId === filters.deploymentId);
    }
    
    if (filters.verified !== undefined) {
      backups = backups.filter(backup => backup.verification.verified === filters.verified);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      backups = backups.filter(backup => new Date(backup.timestamp) >= sinceDate);
    }
    
    if (filters.until) {
      const untilDate = new Date(filters.until);
      backups = backups.filter(backup => new Date(backup.timestamp) <= untilDate);
    }
    
    // Sort by timestamp (newest first) unless specified otherwise
    const sortBy = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder || 'desc';
    
    backups.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'timestamp' || sortBy === 'addedAt') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      
      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      } else {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
    });
    
    // Apply limit
    if (filters.limit) {
      backups = backups.slice(0, filters.limit);
    }
    
    return backups;
  }

  async getStatistics() {
    await this.ensureLoaded();
    
    return {
      ...this.cache.statistics,
      metadata: {
        version: this.cache.version,
        lastUpdated: this.cache.lastUpdated,
        totalEntries: this.cache.backups.length
      }
    };
  }

  async getRetentionPolicy(type = null) {
    await this.ensureLoaded();
    
    if (type) {
      return this.cache.retention.typeSpecific[type] || this.cache.retention.defaultDays;
    }
    
    return this.cache.retention;
  }

  async updateRetentionPolicy(policy) {
    await this.ensureLoaded();
    
    this.cache.retention = {
      ...this.cache.retention,
      ...policy
    };
    
    await this.saveMetadata();
    
    this.logger.info('Retention policy updated', { policy });
  }

  async findExpiredBackups() {
    await this.ensureLoaded();
    
    const now = Date.now();
    const expiredBackups = [];
    
    for (const backup of this.cache.backups) {
      const retentionDays = await this.getRetentionPolicy(backup.type);
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      const backupAge = now - new Date(backup.timestamp).getTime();
      
      if (backupAge > retentionMs) {
        expiredBackups.push({
          ...backup,
          retentionDays,
          ageInDays: Math.floor(backupAge / (24 * 60 * 60 * 1000))
        });
      }
    }
    
    return expiredBackups;
  }

  async markVerified(backupId, checksum = null) {
    await this.updateBackup(backupId, {
      verification: {
        verified: true,
        lastCheck: new Date().toISOString(),
        checksum: checksum
      }
    });
  }

  async markUnverified(backupId, reason = null) {
    await this.updateBackup(backupId, {
      verification: {
        verified: false,
        lastCheck: new Date().toISOString(),
        checksum: null,
        failureReason: reason
      }
    });
  }

  async ensureLoaded() {
    if (!this.cache || !this.lastLoaded) {
      await this.loadMetadata();
    }
    
    // Reload if metadata is older than 5 minutes
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - this.lastLoaded > maxAge) {
      await this.loadMetadata();
    }
  }

  async export(format = 'json') {
    await this.ensureLoaded();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportFormat: format,
      metadata: this.cache
    };
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      
      case 'csv':
        return this.exportToCsv(this.cache.backups);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  exportToCsv(backups) {
    const headers = [
      'Backup ID',
      'Type',
      'Timestamp',
      'Size (bytes)',
      'Deployment ID',
      'Verified',
      'Path'
    ];
    
    const rows = backups.map(backup => [
      backup.backupId,
      backup.type,
      backup.timestamp,
      backup.size || 0,
      backup.deploymentId || '',
      backup.verification.verified,
      backup.path
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

module.exports = { BackupMetadata };
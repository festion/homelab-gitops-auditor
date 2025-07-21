const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupManager {
  constructor(config) {
    this.config = config;
    this.backupDir = path.join(config.dataDir, 'backups');
    this.indexFile = path.join(this.backupDir, 'backup-index.json');
    this.index = new Map();
  }

  async initialize() {
    await fs.mkdir(this.backupDir, { recursive: true });
    await this.loadIndex();
  }

  async loadIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8');
      const indexData = JSON.parse(data);
      this.index = new Map(Object.entries(indexData));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load backup index: ${error.message}`);
      }
    }
  }

  async saveIndex() {
    const indexData = Object.fromEntries(this.index);
    await fs.writeFile(this.indexFile, JSON.stringify(indexData, null, 2));
  }

  async backup(item) {
    try {
      if (!this.index.size) {
        await this.loadIndex();
      }

      if (item.type === 'local') {
        return await this.backupLocalFile(item);
      } else {
        return await this.backupRemoteItem(item);
      }
    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async backupFile(filePath, metadata = {}) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      const backupId = this.generateBackupId(filePath);
      const backupPath = this.getBackupPath(backupId);
      
      const backupData = {
        id: backupId,
        type: 'local_file',
        originalPath: filePath,
        content,
        metadata: {
          size: stats.size,
          mtime: stats.mtime,
          ctime: stats.ctime,
          ...metadata
        },
        timestamp: new Date(),
        compressed: this.shouldCompress(content)
      };
      
      await this.writeBackup(backupPath, backupData);
      this.updateIndex(backupId, backupData);
      await this.saveIndex();
      
      return {
        backupId,
        backupPath,
        success: true
      };
      
    } catch (error) {
      throw new Error(`File backup failed: ${error.message}`);
    }
  }

  async backupLocalFile(item) {
    return await this.backupFile(item.filePath, {
      changeType: item.changeType || 'update',
      hash: item.hash,
      source: 'sync_engine'
    });
  }

  async backupRemoteItem(item) {
    const backupId = this.generateBackupId(`remote:${item.pageId || item.path}`);
    const backupPath = this.getBackupPath(backupId);
    
    const content = item.content || '';
    const backupData = {
      id: backupId,
      type: 'remote_page',
      pageId: item.pageId,
      path: item.path,
      content,
      metadata: {
        title: item.title,
        lastModified: item.lastModified,
        hash: item.hash,
        ...item.metadata
      },
      timestamp: new Date(),
      compressed: this.shouldCompress(content)
    };
    
    await this.writeBackup(backupPath, backupData);
    this.updateIndex(backupId, backupData);
    await this.saveIndex();
    
    return {
      backupId,
      backupPath,
      success: true
    };
  }

  async backupRemotePage(page, metadata = {}) {
    const backupId = this.generateBackupId(`remote:${page.id}`);
    const backupPath = this.getBackupPath(backupId);
    
    const content = page.content || '';
    const backupData = {
      id: backupId,
      type: 'remote_page',
      pageId: page.id,
      path: page.path,
      content,
      metadata: {
        title: page.title,
        description: page.description,
        isPublished: page.isPublished,
        isPrivate: page.isPrivate,
        locale: page.locale,
        tags: page.tags,
        author: page.author,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        ...metadata
      },
      timestamp: new Date(),
      compressed: this.shouldCompress(content)
    };
    
    await this.writeBackup(backupPath, backupData);
    this.updateIndex(backupId, backupData);
    await this.saveIndex();
    
    return {
      backupId,
      backupPath,
      success: true
    };
  }

  async writeBackup(backupPath, backupData) {
    let dataToWrite = JSON.stringify(backupData, null, 2);
    
    if (backupData.compressed) {
      const buffer = Buffer.from(dataToWrite);
      const compressed = await gzip(buffer);
      await fs.writeFile(backupPath + '.gz', compressed);
    } else {
      await fs.writeFile(backupPath, dataToWrite);
    }
  }

  async restore(backupId) {
    try {
      const backupInfo = this.index.get(backupId);
      if (!backupInfo) {
        throw new Error(`Backup ${backupId} not found in index`);
      }
      
      const backupData = await this.readBackup(backupId);
      
      if (backupData.type === 'local_file') {
        return await this.restoreLocalFile(backupData);
      } else if (backupData.type === 'remote_page') {
        return await this.restoreRemotePage(backupData);
      } else {
        throw new Error(`Unknown backup type: ${backupData.type}`);
      }
      
    } catch (error) {
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  async readBackup(backupId) {
    const backupPath = this.getBackupPath(backupId);
    const compressedPath = backupPath + '.gz';
    
    let content;
    
    try {
      const compressed = await fs.readFile(compressedPath);
      const decompressed = await gunzip(compressed);
      content = decompressed.toString();
    } catch (error) {
      if (error.code === 'ENOENT') {
        content = await fs.readFile(backupPath, 'utf-8');
      } else {
        throw error;
      }
    }
    
    return JSON.parse(content);
  }

  async restoreLocalFile(backupData) {
    const targetPath = backupData.originalPath;
    const targetDir = path.dirname(targetPath);
    
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, backupData.content);
    
    if (backupData.metadata.mtime) {
      await fs.utimes(targetPath, 
        new Date(backupData.metadata.ctime),
        new Date(backupData.metadata.mtime)
      );
    }
    
    return {
      restored: true,
      filePath: targetPath,
      backupId: backupData.id
    };
  }

  async restoreRemotePage(backupData) {
    const Uploader = require('./uploader');
    const uploader = new Uploader(this.config);
    
    const uploadData = {
      content: backupData.content,
      path: backupData.path,
      metadata: backupData.metadata
    };
    
    const result = await uploader.upload(uploadData);
    
    return {
      restored: true,
      pageId: backupData.pageId,
      path: backupData.path,
      backupId: backupData.id,
      uploadResult: result
    };
  }

  generateBackupId(identifier) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(identifier).digest('hex');
    return `${timestamp}-${hash.slice(0, 8)}`;
  }

  getBackupPath(backupId) {
    return path.join(this.backupDir, `${backupId}.json`);
  }

  shouldCompress(content) {
    const threshold = this.config.backup?.compressionThreshold || 1024;
    return content.length > threshold;
  }

  updateIndex(backupId, backupData) {
    this.index.set(backupId, {
      id: backupId,
      type: backupData.type,
      timestamp: backupData.timestamp,
      originalPath: backupData.originalPath,
      pageId: backupData.pageId,
      path: backupData.path,
      size: backupData.content.length,
      compressed: backupData.compressed
    });
  }

  async listBackups(filter = {}) {
    await this.loadIndex();
    
    let backups = Array.from(this.index.values());
    
    if (filter.type) {
      backups = backups.filter(b => b.type === filter.type);
    }
    
    if (filter.path) {
      backups = backups.filter(b => 
        b.originalPath?.includes(filter.path) || 
        b.path?.includes(filter.path)
      );
    }
    
    if (filter.since) {
      const since = new Date(filter.since);
      backups = backups.filter(b => new Date(b.timestamp) >= since);
    }
    
    if (filter.limit) {
      backups = backups.slice(0, filter.limit);
    }
    
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async getBackupInfo(backupId) {
    const backupInfo = this.index.get(backupId);
    if (!backupInfo) {
      return null;
    }
    
    const backupPath = this.getBackupPath(backupId);
    const compressedPath = backupPath + '.gz';
    
    let fileSize = 0;
    let exists = false;
    
    try {
      const stats = await fs.stat(backupInfo.compressed ? compressedPath : backupPath);
      fileSize = stats.size;
      exists = true;
    } catch (error) {
      // File doesn't exist
    }
    
    return {
      ...backupInfo,
      fileSize,
      exists,
      filePath: backupInfo.compressed ? compressedPath : backupPath
    };
  }

  async deleteBackup(backupId) {
    const backupInfo = this.index.get(backupId);
    if (!backupInfo) {
      throw new Error(`Backup ${backupId} not found`);
    }
    
    const backupPath = this.getBackupPath(backupId);
    const compressedPath = backupPath + '.gz';
    
    try {
      await fs.unlink(backupInfo.compressed ? compressedPath : backupPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    this.index.delete(backupId);
    await this.saveIndex();
    
    return { deleted: true, backupId };
  }

  async cleanupOldBackups(retentionDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const backups = await this.listBackups();
    const oldBackups = backups.filter(b => new Date(b.timestamp) < cutoffDate);
    
    const results = [];
    
    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.id);
        results.push({ id: backup.id, deleted: true });
      } catch (error) {
        results.push({ id: backup.id, deleted: false, error: error.message });
      }
    }
    
    return {
      cleaned: results.filter(r => r.deleted).length,
      failed: results.filter(r => !r.deleted).length,
      results
    };
  }

  async getStorageStats() {
    const backups = await this.listBackups();
    
    let totalSize = 0;
    let compressedCount = 0;
    let localFileCount = 0;
    let remotePageCount = 0;
    
    for (const backup of backups) {
      const info = await this.getBackupInfo(backup.id);
      if (info?.exists) {
        totalSize += info.fileSize;
      }
      
      if (backup.compressed) compressedCount++;
      if (backup.type === 'local_file') localFileCount++;
      if (backup.type === 'remote_page') remotePageCount++;
    }
    
    return {
      totalBackups: backups.length,
      totalSize: totalSize,
      compressedCount,
      localFileCount,
      remotePageCount,
      averageSize: backups.length > 0 ? Math.round(totalSize / backups.length) : 0
    };
  }

  async createSnapshot(label = '') {
    const snapshotId = `snapshot-${Date.now()}`;
    const snapshotPath = path.join(this.backupDir, `${snapshotId}.json`);
    
    const snapshot = {
      id: snapshotId,
      label,
      timestamp: new Date(),
      backups: Array.from(this.index.values())
    };
    
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    return {
      snapshotId,
      backupCount: snapshot.backups.length,
      created: true
    };
  }
}

module.exports = BackupManager;
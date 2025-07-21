const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ConflictResolver {
  constructor(config) {
    this.config = config;
    this.resolutionStrategies = {
      'local_newer': 'useLocal',
      'remote_newer': 'useRemote',
      'both_changed': 'requireManual',
      'structural_conflict': 'requireManual',
      'content_conflict': 'tryAutoMerge'
    };
  }

  async autoResolve(conflict, item) {
    const strategy = this.resolutionStrategies[conflict.type];
    
    if (!strategy) {
      throw new Error(`No resolution strategy for conflict type: ${conflict.type}`);
    }

    switch (strategy) {
      case 'useLocal':
        return await this.resolveUseLocal(conflict, item);
      
      case 'useRemote':
        return await this.resolveUseRemote(conflict, item);
      
      case 'tryAutoMerge':
        return await this.tryAutoMerge(conflict, item);
      
      case 'requireManual':
        throw new Error('Conflict requires manual resolution');
      
      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }
  }

  async resolveUseLocal(conflict, item) {
    if (item.type === 'local') {
      const Uploader = require('./uploader');
      const uploader = new Uploader(this.config);
      
      await this.createBackup(conflict, 'remote');
      await uploader.upload(item);
      
      return {
        strategy: 'use_local',
        result: 'local_version_pushed',
        timestamp: new Date()
      };
    } else {
      return {
        strategy: 'use_local',
        result: 'remote_change_ignored',
        timestamp: new Date()
      };
    }
  }

  async resolveUseRemote(conflict, item) {
    if (item.type === 'remote') {
      const Downloader = require('./downloader');
      const downloader = new Downloader(this.config);
      
      await this.createBackup(conflict, 'local');
      await downloader.download(item);
      
      return {
        strategy: 'use_remote',
        result: 'remote_version_pulled',
        timestamp: new Date()
      };
    } else {
      return {
        strategy: 'use_remote',
        result: 'local_change_ignored',
        timestamp: new Date()
      };
    }
  }

  async tryAutoMerge(conflict, item) {
    try {
      const mergeResult = await this.performThreeWayMerge(conflict, item);
      
      if (mergeResult.success) {
        await this.applyMergeResult(mergeResult, conflict, item);
        
        return {
          strategy: 'auto_merge',
          result: 'merge_successful',
          conflicts: mergeResult.conflicts || [],
          timestamp: new Date()
        };
      } else {
        throw new Error('Auto-merge failed with conflicts');
      }
      
    } catch (error) {
      return {
        strategy: 'auto_merge',
        result: 'merge_failed',
        error: error.message,
        requiresManual: true,
        timestamp: new Date()
      };
    }
  }

  async performThreeWayMerge(conflict, item) {
    const { localContent, remoteContent, baseContent } = await this.getThreeVersions(conflict, item);
    
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');
    const baseLines = baseContent.split('\n');
    
    const mergedLines = [];
    const conflicts = [];
    
    let localIndex = 0;
    let remoteIndex = 0;
    let baseIndex = 0;
    
    while (localIndex < localLines.length || 
           remoteIndex < remoteLines.length || 
           baseIndex < baseLines.length) {
      
      const localLine = localLines[localIndex] || '';
      const remoteLine = remoteLines[remoteIndex] || '';
      const baseLine = baseLines[baseIndex] || '';
      
      if (localLine === remoteLine) {
        mergedLines.push(localLine);
        localIndex++;
        remoteIndex++;
        baseIndex++;
      } else if (localLine === baseLine) {
        mergedLines.push(remoteLine);
        remoteIndex++;
        localIndex++;
        baseIndex++;
      } else if (remoteLine === baseLine) {
        mergedLines.push(localLine);
        localIndex++;
        remoteIndex++;
        baseIndex++;
      } else {
        const conflictBlock = this.createConflictBlock(
          localLines, remoteLines, localIndex, remoteIndex
        );
        
        conflicts.push({
          startLine: mergedLines.length,
          endLine: mergedLines.length + conflictBlock.length,
          type: 'content_conflict'
        });
        
        mergedLines.push(...conflictBlock);
        localIndex = conflictBlock.localEnd;
        remoteIndex = conflictBlock.remoteEnd;
        baseIndex++;
      }
    }
    
    return {
      success: conflicts.length === 0,
      content: mergedLines.join('\n'),
      conflicts
    };
  }

  createConflictBlock(localLines, remoteLines, localStart, remoteStart) {
    const conflictEnd = this.findConflictBlockEnd(localLines, remoteLines, localStart, remoteStart);
    
    const block = [
      '<<<<<<< LOCAL',
      ...localLines.slice(localStart, conflictEnd.local),
      '=======',
      ...remoteLines.slice(remoteStart, conflictEnd.remote),
      '>>>>>>> REMOTE'
    ];
    
    block.localEnd = conflictEnd.local;
    block.remoteEnd = conflictEnd.remote;
    
    return block;
  }

  findConflictBlockEnd(localLines, remoteLines, localStart, remoteStart) {
    let localEnd = localStart;
    let remoteEnd = remoteStart;
    
    const maxLook = 5;
    let lookAhead = 0;
    
    while (lookAhead < maxLook) {
      if (localEnd < localLines.length && remoteEnd < remoteLines.length &&
          localLines[localEnd] === remoteLines[remoteEnd]) {
        break;
      }
      
      if (localEnd < localLines.length) localEnd++;
      if (remoteEnd < remoteLines.length) remoteEnd++;
      lookAhead++;
    }
    
    return { local: localEnd, remote: remoteEnd };
  }

  async getThreeVersions(conflict, item) {
    let localContent = '';
    let remoteContent = '';
    let baseContent = '';
    
    if (item.type === 'local') {
      localContent = await fs.readFile(item.filePath, 'utf-8');
      remoteContent = conflict.context.remotePage?.content || '';
      baseContent = await this.getBaseVersion(conflict);
    } else {
      remoteContent = item.content || '';
      
      const localPath = this.getLocalPath(item.path);
      try {
        localContent = await fs.readFile(localPath, 'utf-8');
      } catch (error) {
        localContent = '';
      }
      
      baseContent = await this.getBaseVersion(conflict);
    }
    
    return { localContent, remoteContent, baseContent };
  }

  async getBaseVersion(conflict) {
    const syncState = conflict.context.lastSync;
    if (!syncState) {
      return '';
    }
    
    const backupPath = this.getBackupPath(conflict, syncState);
    try {
      return await fs.readFile(backupPath, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  async applyMergeResult(mergeResult, conflict, item) {
    if (item.type === 'local') {
      const localPath = item.filePath;
      await fs.writeFile(localPath, mergeResult.content);
      
      const Uploader = require('./uploader');
      const uploader = new Uploader(this.config);
      await uploader.upload({
        ...item,
        content: mergeResult.content
      });
    } else {
      const localPath = this.getLocalPath(item.path);
      await fs.writeFile(localPath, mergeResult.content);
    }
  }

  async manualResolve(conflict, item, resolution) {
    await this.validateManualResolution(resolution);
    
    switch (resolution.strategy) {
      case 'use_local':
        return await this.resolveUseLocal(conflict, item);
      
      case 'use_remote':
        return await this.resolveUseRemote(conflict, item);
      
      case 'use_custom':
        return await this.resolveUseCustom(conflict, item, resolution.content);
      
      case 'manual_merge':
        return await this.resolveManualMerge(conflict, item, resolution.mergedContent);
      
      default:
        throw new Error(`Invalid resolution strategy: ${resolution.strategy}`);
    }
  }

  async resolveUseCustom(conflict, item, customContent) {
    await this.createBackup(conflict, 'both');
    
    if (item.type === 'local') {
      await fs.writeFile(item.filePath, customContent);
      
      const Uploader = require('./uploader');
      const uploader = new Uploader(this.config);
      await uploader.upload({
        ...item,
        content: customContent
      });
    } else {
      const localPath = this.getLocalPath(item.path);
      await fs.writeFile(localPath, customContent);
    }
    
    return {
      strategy: 'use_custom',
      result: 'custom_content_applied',
      timestamp: new Date()
    };
  }

  async resolveManualMerge(conflict, item, mergedContent) {
    await this.validateMergedContent(mergedContent);
    await this.createBackup(conflict, 'both');
    
    if (item.type === 'local') {
      await fs.writeFile(item.filePath, mergedContent);
      
      const Uploader = require('./uploader');
      const uploader = new Uploader(this.config);
      await uploader.upload({
        ...item,
        content: mergedContent
      });
    } else {
      const localPath = this.getLocalPath(item.path);
      await fs.writeFile(localPath, mergedContent);
      
      const Uploader = require('./uploader');
      const uploader = new Uploader(this.config);
      await uploader.uploadFromLocal(localPath, item.path);
    }
    
    return {
      strategy: 'manual_merge',
      result: 'manual_merge_applied',
      timestamp: new Date()
    };
  }

  async createBackup(conflict, target = 'both') {
    const BackupManager = require('./backup-manager');
    const backupManager = new BackupManager(this.config);
    
    const backupInfo = {
      conflictId: conflict.id,
      type: 'conflict_backup',
      timestamp: new Date()
    };
    
    if (target === 'local' || target === 'both') {
      const localPath = this.getLocalPathFromConflict(conflict);
      if (await this.fileExists(localPath)) {
        await backupManager.backupFile(localPath, {
          ...backupInfo,
          source: 'local'
        });
      }
    }
    
    if (target === 'remote' || target === 'both') {
      await backupManager.backupRemotePage(conflict.context.remotePage, {
        ...backupInfo,
        source: 'remote'
      });
    }
  }

  async validateManualResolution(resolution) {
    const validStrategies = ['use_local', 'use_remote', 'use_custom', 'manual_merge'];
    
    if (!validStrategies.includes(resolution.strategy)) {
      throw new Error(`Invalid resolution strategy: ${resolution.strategy}`);
    }
    
    if (resolution.strategy === 'use_custom' && !resolution.content) {
      throw new Error('Custom content required for use_custom strategy');
    }
    
    if (resolution.strategy === 'manual_merge' && !resolution.mergedContent) {
      throw new Error('Merged content required for manual_merge strategy');
    }
  }

  async validateMergedContent(content) {
    if (content.includes('<<<<<<< LOCAL') || 
        content.includes('>>>>>>> REMOTE') || 
        content.includes('=======')) {
      throw new Error('Merged content still contains conflict markers');
    }
  }

  getLocalPathFromConflict(conflict) {
    if (conflict.item.type === 'local') {
      return conflict.item.filePath;
    } else {
      return this.getLocalPath(conflict.item.path);
    }
  }

  getLocalPath(wikiPath) {
    let localPath = wikiPath;
    
    if (localPath.startsWith('/')) {
      localPath = localPath.slice(1);
    }
    
    if (!localPath.endsWith('.md')) {
      localPath += '.md';
    }
    
    return path.join(this.config.localPath, localPath);
  }

  getBackupPath(conflict, syncState) {
    const backupDir = path.join(this.config.dataDir, 'backups');
    const fileName = `${conflict.id}-${syncState.lastSync.getTime()}.md`;
    return path.join(backupDir, fileName);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async generateConflictReport(conflict) {
    const report = {
      id: conflict.id,
      type: conflict.type,
      message: conflict.message,
      severity: conflict.severity,
      timestamp: conflict.timestamp,
      autoResolvable: conflict.autoResolvable,
      recommendation: this.getRecommendation(conflict),
      details: await this.analyzeConflictDetails(conflict)
    };
    
    return report;
  }

  getRecommendation(conflict) {
    const recommendations = {
      'local_newer': 'Push local changes to remote',
      'remote_newer': 'Pull remote changes to local',
      'both_changed': 'Manual review and merge required',
      'structural_conflict': 'Review file structure and resolve manually',
      'content_conflict': 'Attempt auto-merge or resolve manually'
    };
    
    return recommendations[conflict.type] || 'Manual resolution required';
  }

  async analyzeConflictDetails(conflict) {
    const details = {
      affectedFiles: [],
      changesSummary: '',
      complexity: 'simple'
    };
    
    if (conflict.type === 'content_conflict' && conflict.context.conflictAreas) {
      details.affectedFiles = [this.getLocalPathFromConflict(conflict)];
      details.changesSummary = `${conflict.context.conflictAreas.length} conflict areas detected`;
      details.complexity = conflict.context.conflictAreas.length > 3 ? 'complex' : 'moderate';
    }
    
    return details;
  }
}

module.exports = ConflictResolver;
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class ConflictDetector {
  constructor(config, syncState) {
    this.config = config;
    this.syncState = syncState;
    this.conflictTypes = {
      LOCAL_NEWER: 'local_newer',
      REMOTE_NEWER: 'remote_newer',
      BOTH_CHANGED: 'both_changed',
      STRUCTURAL: 'structural_conflict',
      CONTENT: 'content_conflict'
    };
  }

  async detect(item) {
    try {
      if (item.type === 'local') {
        return await this.detectLocalConflict(item);
      } else {
        return await this.detectRemoteConflict(item);
      }
    } catch (error) {
      throw new Error(`Conflict detection failed: ${error.message}`);
    }
  }

  async detectLocalConflict(item) {
    const syncState = this.getSyncState(item.filePath);
    
    if (!syncState) {
      return null;
    }

    const RemotePoller = require('./remote-poller');
    const poller = new RemotePoller(this.config);
    
    const remotePage = await this.findRemotePage(item.filePath, poller);
    if (!remotePage) {
      return this.createConflict(
        this.conflictTypes.STRUCTURAL,
        'Remote page not found for local file',
        item,
        null
      );
    }

    const remoteHash = poller.calculatePageHash(remotePage);
    const remoteModified = new Date(remotePage.updatedAt);
    const localModified = item.timestamp;
    const lastSync = new Date(syncState.lastSync);

    if (syncState.hash !== item.hash && syncState.hash !== remoteHash) {
      return this.createConflict(
        this.conflictTypes.BOTH_CHANGED,
        'Both local and remote versions have changed since last sync',
        item,
        {
          remotePage,
          remoteHash,
          remoteModified,
          lastSync
        }
      );
    }

    if (syncState.hash !== remoteHash && remoteModified > lastSync) {
      if (item.hash === syncState.hash) {
        return this.createConflict(
          this.conflictTypes.REMOTE_NEWER,
          'Remote version is newer than local',
          item,
          {
            remotePage,
            remoteHash,
            remoteModified,
            lastSync
          }
        );
      }
    }

    if (syncState.hash !== item.hash && localModified > remoteModified) {
      return this.createConflict(
        this.conflictTypes.LOCAL_NEWER,
        'Local version is newer than remote',
        item,
        {
          remotePage,
          remoteHash,
          remoteModified,
          lastSync
        }
      );
    }

    const contentConflict = await this.detectContentConflict(item, remotePage);
    if (contentConflict) {
      return contentConflict;
    }

    return null;
  }

  async detectRemoteConflict(item) {
    const localFilePath = this.getLocalPath(item.path);
    const syncState = this.getSyncState(localFilePath);

    if (!syncState) {
      return null;
    }

    let localExists = false;
    let localHash = null;
    let localModified = null;

    try {
      const stats = await fs.stat(localFilePath);
      localExists = true;
      localModified = stats.mtime;
      
      const FileWatcher = require('./file-watcher');
      const watcher = new FileWatcher(this.config);
      localHash = await watcher.calculateFileHash(localFilePath);
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!localExists && syncState.hash) {
      return this.createConflict(
        this.conflictTypes.STRUCTURAL,
        'Local file deleted but remote page updated',
        item,
        {
          localFilePath,
          localExists: false,
          lastSync: new Date(syncState.lastSync)
        }
      );
    }

    if (localExists && syncState.hash !== localHash && syncState.hash !== item.hash) {
      return this.createConflict(
        this.conflictTypes.BOTH_CHANGED,
        'Both local file and remote page have changed since last sync',
        item,
        {
          localFilePath,
          localHash,
          localModified,
          lastSync: new Date(syncState.lastSync)
        }
      );
    }

    const remoteModified = new Date(item.lastModified);
    const lastSync = new Date(syncState.lastSync);

    if (localExists && syncState.hash !== localHash && localModified > remoteModified) {
      return this.createConflict(
        this.conflictTypes.LOCAL_NEWER,
        'Local file is newer than remote page',
        item,
        {
          localFilePath,
          localHash,
          localModified,
          lastSync
        }
      );
    }

    if (syncState.hash !== item.hash && remoteModified > (localModified || lastSync)) {
      return this.createConflict(
        this.conflictTypes.REMOTE_NEWER,
        'Remote page is newer than local file',
        item,
        {
          localFilePath,
          localHash,
          localModified,
          lastSync
        }
      );
    }

    return null;
  }

  async detectContentConflict(localItem, remotePage) {
    try {
      const localContent = await fs.readFile(localItem.filePath, 'utf-8');
      const remoteContent = remotePage.content || '';

      if (this.hasStructuralChanges(localContent, remoteContent)) {
        return this.createConflict(
          this.conflictTypes.CONTENT,
          'Structural changes detected that may cause merge conflicts',
          localItem,
          {
            remotePage,
            conflictAreas: this.identifyConflictAreas(localContent, remoteContent)
          }
        );
      }

      return null;
    } catch (error) {
      return this.createConflict(
        this.conflictTypes.CONTENT,
        `Content comparison failed: ${error.message}`,
        localItem,
        { remotePage }
      );
    }
  }

  hasStructuralChanges(localContent, remoteContent) {
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');

    const localHeaders = this.extractHeaders(localLines);
    const remoteHeaders = this.extractHeaders(remoteLines);

    return !this.arraysEqual(localHeaders, remoteHeaders);
  }

  extractHeaders(lines) {
    return lines
      .filter(line => line.trim().startsWith('#'))
      .map(line => line.trim());
  }

  identifyConflictAreas(localContent, remoteContent) {
    const areas = [];
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');

    let localIndex = 0;
    let remoteIndex = 0;

    while (localIndex < localLines.length || remoteIndex < remoteLines.length) {
      const localLine = localLines[localIndex] || '';
      const remoteLine = remoteLines[remoteIndex] || '';

      if (localLine !== remoteLine) {
        const conflictStart = Math.min(localIndex, remoteIndex);
        const conflictEnd = this.findConflictEnd(
          localLines, remoteLines, localIndex, remoteIndex
        );

        areas.push({
          startLine: conflictStart,
          endLine: conflictEnd,
          localContent: localLines.slice(localIndex, conflictEnd).join('\n'),
          remoteContent: remoteLines.slice(remoteIndex, conflictEnd).join('\n')
        });

        localIndex = conflictEnd;
        remoteIndex = conflictEnd;
      } else {
        localIndex++;
        remoteIndex++;
      }
    }

    return areas;
  }

  findConflictEnd(localLines, remoteLines, localStart, remoteStart) {
    let localIndex = localStart;
    let remoteIndex = remoteStart;
    
    const maxLook = 10;
    let lookAhead = 0;

    while (lookAhead < maxLook && 
           (localIndex < localLines.length || remoteIndex < remoteLines.length)) {
      
      if (localLines[localIndex] === remoteLines[remoteIndex]) {
        break;
      }
      
      localIndex++;
      remoteIndex++;
      lookAhead++;
    }

    return Math.max(localIndex, remoteIndex);
  }

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }

  createConflict(type, message, item, context = {}) {
    return {
      id: crypto.randomUUID(),
      type,
      message,
      item,
      context,
      timestamp: new Date(),
      severity: this.getConflictSeverity(type),
      autoResolvable: this.isAutoResolvable(type)
    };
  }

  getConflictSeverity(type) {
    const severityMap = {
      [this.conflictTypes.LOCAL_NEWER]: 'low',
      [this.conflictTypes.REMOTE_NEWER]: 'low',
      [this.conflictTypes.BOTH_CHANGED]: 'high',
      [this.conflictTypes.STRUCTURAL]: 'high',
      [this.conflictTypes.CONTENT]: 'medium'
    };

    return severityMap[type] || 'medium';
  }

  isAutoResolvable(type) {
    return [
      this.conflictTypes.LOCAL_NEWER,
      this.conflictTypes.REMOTE_NEWER
    ].includes(type);
  }

  async findRemotePage(filePath, poller) {
    const relativePath = path.relative(this.config.localPath, filePath);
    const wikiPath = this.localPathToWikiPath(relativePath);
    
    try {
      return await poller.getPageByPath(wikiPath);
    } catch (error) {
      return null;
    }
  }

  localPathToWikiPath(localPath) {
    let wikiPath = localPath.replace(/\\/g, '/');
    
    if (wikiPath.endsWith('.md')) {
      wikiPath = wikiPath.slice(0, -3);
    }
    
    if (!wikiPath.startsWith('/')) {
      wikiPath = '/' + wikiPath;
    }
    
    return wikiPath;
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

  getSyncState(filePath) {
    return this.syncState.get(filePath);
  }

  async analyzeConflictComplexity(conflict) {
    const analysis = {
      complexity: 'simple',
      factors: [],
      recommendations: []
    };

    if (conflict.type === this.conflictTypes.BOTH_CHANGED) {
      analysis.complexity = 'complex';
      analysis.factors.push('Both versions modified');
      analysis.recommendations.push('Manual review required');
    }

    if (conflict.type === this.conflictTypes.CONTENT && conflict.context.conflictAreas) {
      const areas = conflict.context.conflictAreas.length;
      if (areas > 3) {
        analysis.complexity = 'complex';
        analysis.factors.push(`${areas} conflict areas`);
      }
    }

    if (conflict.type === this.conflictTypes.STRUCTURAL) {
      analysis.complexity = 'complex';
      analysis.factors.push('Structural changes detected');
      analysis.recommendations.push('Review file structure');
    }

    return analysis;
  }
}

module.exports = ConflictDetector;
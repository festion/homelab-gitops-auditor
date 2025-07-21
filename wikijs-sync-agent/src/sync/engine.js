const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SyncEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      monitoring: {
        watchLocal: true,
        pollRemote: true,
        pollInterval: 60000,
        debounceDelay: 1000
      },
      conflicts: {
        autoResolve: ['local_newer', 'remote_newer'],
        requireManual: ['both_changed', 'structural'],
        backupOnResolve: true,
        notifyUser: true
      },
      performance: {
        batchSize: 10,
        maxConcurrent: 3,
        compressionLevel: 6,
        deltaSyncThreshold: 1024
      },
      ...config
    };
    
    this.syncQueue = [];
    this.conflictQueue = [];
    this.syncState = new Map();
    this.isRunning = false;
    this.activeSync = null;
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Sync engine is already running');
    }
    
    this.isRunning = true;
    this.emit('engine:started', { timestamp: new Date() });
    
    await this.initialize();
    this.startMonitoring();
    this.startSyncLoop();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    await this.stopMonitoring();
    
    if (this.activeSync) {
      await this.activeSync;
    }
    
    this.emit('engine:stopped', { timestamp: new Date() });
  }

  async initialize() {
    await this.loadSyncState();
    await this.initializeBackupDirectory();
    await this.validateConfiguration();
  }

  async loadSyncState() {
    const stateFile = path.join(this.config.dataDir, 'sync-state.json');
    try {
      const data = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(data);
      this.syncState = new Map(Object.entries(state));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.emit('error', { type: 'state_load_error', error });
      }
    }
  }

  async saveSyncState() {
    const stateFile = path.join(this.config.dataDir, 'sync-state.json');
    const state = Object.fromEntries(this.syncState);
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
  }

  async initializeBackupDirectory() {
    const backupDir = path.join(this.config.dataDir, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
  }

  async validateConfiguration() {
    const required = ['localPath', 'wikiJsUrl', 'apiToken', 'dataDir'];
    for (const field of required) {
      if (!this.config[field]) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }
  }

  startMonitoring() {
    if (this.config.monitoring.watchLocal) {
      this.startFileWatcher();
    }
    
    if (this.config.monitoring.pollRemote) {
      this.startRemotePolling();
    }
  }

  async stopMonitoring() {
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
    }
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  startFileWatcher() {
    const FileWatcher = require('./file-watcher');
    this.fileWatcher = new FileWatcher(this.config);
    
    this.fileWatcher.on('change', (event) => {
      this.handleLocalChange(event);
    });
    
    this.fileWatcher.start();
  }

  startRemotePolling() {
    const RemotePoller = require('./remote-poller');
    this.remotePoller = new RemotePoller(this.config);
    
    this.pollingInterval = setInterval(async () => {
      try {
        const changes = await this.remotePoller.checkForChanges();
        for (const change of changes) {
          this.handleRemoteChange(change);
        }
      } catch (error) {
        this.emit('error', { type: 'polling_error', error });
      }
    }, this.config.monitoring.pollInterval);
  }

  handleLocalChange(event) {
    const { filePath, type, hash } = event;
    
    const syncItem = {
      id: crypto.randomUUID(),
      type: 'local',
      filePath,
      changeType: type,
      hash,
      timestamp: new Date(),
      status: 'pending'
    };
    
    this.addToSyncQueue(syncItem);
  }

  handleRemoteChange(change) {
    const { pageId, path, hash, lastModified } = change;
    
    const syncItem = {
      id: crypto.randomUUID(),
      type: 'remote',
      pageId,
      path,
      hash,
      lastModified,
      timestamp: new Date(),
      status: 'pending'
    };
    
    this.addToSyncQueue(syncItem);
  }

  addToSyncQueue(item) {
    const existing = this.syncQueue.find(i => 
      (i.type === item.type && i.filePath === item.filePath) ||
      (i.type === item.type && i.pageId === item.pageId)
    );
    
    if (existing) {
      Object.assign(existing, item);
    } else {
      this.syncQueue.push(item);
    }
    
    this.emit('queue:added', item);
  }

  startSyncLoop() {
    this.syncInterval = setInterval(() => {
      if (!this.activeSync && this.syncQueue.length > 0) {
        this.processSyncQueue();
      }
    }, 1000);
  }

  async processSyncQueue() {
    if (this.syncQueue.length === 0) {
      return;
    }
    
    const batch = this.syncQueue.splice(0, this.config.performance.batchSize);
    this.activeSync = this.processBatch(batch);
    
    try {
      await this.activeSync;
    } finally {
      this.activeSync = null;
    }
  }

  async processBatch(batch) {
    const results = await Promise.allSettled(
      batch.map(item => this.processSyncItem(item))
    );
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const item = batch[i];
      
      if (result.status === 'rejected') {
        this.emit('sync:error', {
          item,
          error: result.reason
        });
      }
    }
    
    await this.saveSyncState();
  }

  async processSyncItem(item) {
    try {
      const conflict = await this.checkForConflict(item);
      
      if (conflict) {
        return await this.handleConflict(conflict, item);
      }
      
      if (item.type === 'local') {
        await this.syncLocalToRemote(item);
      } else {
        await this.syncRemoteToLocal(item);
      }
      
      this.updateSyncState(item);
      this.emit('sync:completed', item);
      
    } catch (error) {
      this.emit('sync:error', { item, error });
      throw error;
    }
  }

  async checkForConflict(item) {
    const ConflictDetector = require('./conflict-detector');
    const detector = new ConflictDetector(this.config, this.syncState);
    return await detector.detect(item);
  }

  async handleConflict(conflict, item) {
    const ConflictResolver = require('./conflict-resolver');
    const resolver = new ConflictResolver(this.config);
    
    if (this.config.conflicts.autoResolve.includes(conflict.type)) {
      return await resolver.autoResolve(conflict, item);
    }
    
    this.conflictQueue.push({ conflict, item });
    this.emit('conflict:detected', { conflict, item });
    
    if (this.config.conflicts.notifyUser) {
      this.notifyUser('conflict', { conflict, item });
    }
  }

  async syncLocalToRemote(item) {
    const Uploader = require('./uploader');
    const uploader = new Uploader(this.config);
    
    if (this.config.conflicts.backupOnResolve) {
      await this.createBackup(item);
    }
    
    await uploader.upload(item);
  }

  async syncRemoteToLocal(item) {
    const Downloader = require('./downloader');
    const downloader = new Downloader(this.config);
    
    if (this.config.conflicts.backupOnResolve) {
      await this.createBackup(item);
    }
    
    await downloader.download(item);
  }

  updateSyncState(item) {
    const key = item.type === 'local' ? item.filePath : item.pageId;
    
    this.syncState.set(key, {
      lastSync: new Date(),
      hash: item.hash,
      type: item.type,
      changeType: item.changeType || 'update'
    });
  }

  async createBackup(item) {
    const BackupManager = require('./backup-manager');
    const backupManager = new BackupManager(this.config);
    await backupManager.backup(item);
  }

  notifyUser(type, data) {
    const Notifier = require('./notifier');
    const notifier = new Notifier(this.config);
    notifier.notify(type, data);
  }

  async getConflicts() {
    return [...this.conflictQueue];
  }

  async resolveConflict(conflictId, resolution) {
    const index = this.conflictQueue.findIndex(c => c.conflict.id === conflictId);
    if (index === -1) {
      throw new Error('Conflict not found');
    }
    
    const { conflict, item } = this.conflictQueue.splice(index, 1)[0];
    const ConflictResolver = require('./conflict-resolver');
    const resolver = new ConflictResolver(this.config);
    
    await resolver.manualResolve(conflict, item, resolution);
    this.emit('conflict:resolved', { conflict, resolution });
  }

  async getStatus() {
    return {
      isRunning: this.isRunning,
      syncQueue: this.syncQueue.length,
      conflictQueue: this.conflictQueue.length,
      syncState: this.syncState.size,
      lastSync: this.getLastSyncTime()
    };
  }

  getLastSyncTime() {
    let lastSync = null;
    
    for (const [, state] of this.syncState) {
      if (!lastSync || state.lastSync > lastSync) {
        lastSync = state.lastSync;
      }
    }
    
    return lastSync;
  }
}

module.exports = SyncEngine;
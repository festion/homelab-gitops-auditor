const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');

class FileWatcher extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.watcher = null;
    this.fileHashes = new Map();
    this.pendingChanges = new Map();
    this.debounceTimers = new Map();
  }

  async start() {
    await this.scanInitialFiles();
    this.initializeWatcher();
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  async scanInitialFiles() {
    const scanDir = async (dir) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (this.shouldIgnore(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            const hash = await this.calculateFileHash(fullPath);
            this.fileHashes.set(fullPath, hash);
          }
        }
      } catch (error) {
        this.emit('error', { type: 'scan_error', path: dir, error });
      }
    };
    
    await scanDir(this.config.localPath);
  }

  initializeWatcher() {
    const watchOptions = {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      ignored: (path) => this.shouldIgnore(path)
    };
    
    this.watcher = chokidar.watch(this.config.localPath, watchOptions);
    
    this.watcher
      .on('add', (filePath) => this.handleFileAdd(filePath))
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('unlink', (filePath) => this.handleFileDelete(filePath))
      .on('addDir', (dirPath) => this.handleDirAdd(dirPath))
      .on('unlinkDir', (dirPath) => this.handleDirDelete(dirPath))
      .on('error', (error) => this.handleWatcherError(error));
  }

  shouldIgnore(filePath) {
    const relativePath = path.relative(this.config.localPath, filePath);
    
    const defaultIgnores = [
      '.git',
      '.svn',
      '.hg',
      'node_modules',
      '.DS_Store',
      'Thumbs.db',
      '*.tmp',
      '*.swp',
      '*.bak',
      '~*'
    ];
    
    const ignorePatterns = this.config.ignorePatterns || defaultIgnores;
    
    for (const pattern of ignorePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  matchesPattern(filePath, pattern) {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(filePath);
    }
    
    return filePath.includes(pattern);
  }

  async handleFileAdd(filePath) {
    this.debounceChange(filePath, async () => {
      try {
        const hash = await this.calculateFileHash(filePath);
        this.fileHashes.set(filePath, hash);
        
        this.emit('change', {
          filePath,
          type: 'add',
          hash,
          timestamp: new Date()
        });
      } catch (error) {
        this.emit('error', { type: 'file_add_error', filePath, error });
      }
    });
  }

  async handleFileChange(filePath) {
    this.debounceChange(filePath, async () => {
      try {
        const newHash = await this.calculateFileHash(filePath);
        const oldHash = this.fileHashes.get(filePath);
        
        if (newHash !== oldHash) {
          this.fileHashes.set(filePath, newHash);
          
          this.emit('change', {
            filePath,
            type: 'update',
            hash: newHash,
            oldHash,
            timestamp: new Date()
          });
        }
      } catch (error) {
        this.emit('error', { type: 'file_change_error', filePath, error });
      }
    });
  }

  handleFileDelete(filePath) {
    this.debounceChange(filePath, () => {
      const hash = this.fileHashes.get(filePath);
      this.fileHashes.delete(filePath);
      
      this.emit('change', {
        filePath,
        type: 'delete',
        hash,
        timestamp: new Date()
      });
    });
  }

  handleDirAdd(dirPath) {
    this.emit('change', {
      filePath: dirPath,
      type: 'addDir',
      timestamp: new Date()
    });
  }

  handleDirDelete(dirPath) {
    for (const [filePath] of this.fileHashes) {
      if (filePath.startsWith(dirPath + path.sep)) {
        this.fileHashes.delete(filePath);
      }
    }
    
    this.emit('change', {
      filePath: dirPath,
      type: 'deleteDir',
      timestamp: new Date()
    });
  }

  handleWatcherError(error) {
    this.emit('error', { type: 'watcher_error', error });
  }

  debounceChange(filePath, callback) {
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }
    
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      callback();
    }, this.config.monitoring.debounceDelay || 1000);
    
    this.debounceTimers.set(filePath, timer);
  }

  async calculateFileHash(filePath) {
    const stats = await fs.promises.stat(filePath);
    
    if (stats.size > 1024 * 1024 * 100) {
      return this.calculateLargeFileHash(filePath, stats);
    }
    
    const content = await fs.promises.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async calculateLargeFileHash(filePath, stats) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      hash.update(`size:${stats.size};mtime:${stats.mtime.getTime()};`);
      
      const chunkSize = 1024 * 1024;
      const positions = [0, Math.floor(stats.size / 2), stats.size - chunkSize];
      let currentPos = 0;
      
      stream.on('data', (chunk) => {
        if (positions.includes(currentPos)) {
          hash.update(chunk.slice(0, Math.min(chunk.length, chunkSize)));
        }
        currentPos += chunk.length;
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', reject);
    });
  }

  async getFileHash(filePath) {
    return this.fileHashes.get(filePath);
  }

  getWatchedFiles() {
    return Array.from(this.fileHashes.keys());
  }

  async refreshFile(filePath) {
    if (fs.existsSync(filePath)) {
      const hash = await this.calculateFileHash(filePath);
      const oldHash = this.fileHashes.get(filePath);
      
      if (hash !== oldHash) {
        this.fileHashes.set(filePath, hash);
        this.emit('change', {
          filePath,
          type: 'update',
          hash,
          oldHash,
          timestamp: new Date()
        });
      }
    } else if (this.fileHashes.has(filePath)) {
      this.handleFileDelete(filePath);
    }
  }
}

module.exports = FileWatcher;
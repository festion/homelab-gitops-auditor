const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const { Transform } = require('stream');

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'json';
    this.destinations = options.destinations || ['console'];
    this.logFile = options.logFile || null;
    this.maxSize = options.maxSize || '100MB';
    this.retention = options.retention || 30;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.colors = {
      error: '\x1b[31m',
      warn: '\x1b[33m', 
      info: '\x1b[36m',
      debug: '\x1b[35m',
      trace: '\x1b[37m',
      reset: '\x1b[0m'
    };
    
    this.fileStream = null;
    this.currentLogSize = 0;
    
    this.initializeFileLogging();
  }

  async initializeFileLogging() {
    if (this.destinations.includes('file') && this.logFile) {
      try {
        // Ensure log directory exists
        const logDir = path.dirname(this.logFile);
        await fs.mkdir(logDir, { recursive: true });
        
        // Check current log file size
        try {
          const stats = await fs.stat(this.logFile);
          this.currentLogSize = stats.size;
        } catch (error) {
          // File doesn't exist, will be created
          this.currentLogSize = 0;
        }
        
        // Create write stream
        this.fileStream = createWriteStream(this.logFile, { flags: 'a' });
        
        this.fileStream.on('error', (error) => {
          console.error('Logger file stream error:', error);
        });
        
      } catch (error) {
        console.error('Failed to initialize file logging:', error);
      }
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };
    
    if (this.format === 'json') {
      return JSON.stringify(logEntry);
    } else {
      const metaStr = Object.keys(metadata).length > 0 
        ? ` ${JSON.stringify(metadata)}` 
        : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    }
  }

  formatConsoleMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || '';
    const reset = this.colors.reset;
    
    const metaStr = Object.keys(metadata).length > 0 
      ? ` ${JSON.stringify(metadata, null, 2)}` 
      : '';
    
    return `${color}${timestamp} [${level.toUpperCase()}]${reset} ${message}${metaStr}`;
  }

  async log(level, message, metadata = {}) {
    if (!this.shouldLog(level)) {
      return;
    }
    
    try {
      // Console output
      if (this.destinations.includes('console')) {
        const consoleMessage = this.formatConsoleMessage(level, message, metadata);
        if (level === 'error') {
          console.error(consoleMessage);
        } else if (level === 'warn') {
          console.warn(consoleMessage);
        } else {
          console.log(consoleMessage);
        }
      }
      
      // File output
      if (this.destinations.includes('file') && this.fileStream) {
        const fileMessage = this.formatMessage(level, message, metadata);
        const logLine = fileMessage + '\n';
        
        // Check if log rotation is needed
        if (this.needsRotation(logLine.length)) {
          await this.rotateLog();
        }
        
        this.fileStream.write(logLine);
        this.currentLogSize += Buffer.byteLength(logLine);
      }
      
    } catch (error) {
      console.error('Logging error:', error);
    }
  }

  needsRotation(messageSize) {
    if (!this.maxSize) return false;
    
    const maxBytes = this.parseSize(this.maxSize);
    return (this.currentLogSize + messageSize) > maxBytes;
  }

  parseSize(sizeStr) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^(\d+)(B|KB|MB|GB)?$/i);
    if (!match) return 100 * 1024 * 1024; // Default 100MB
    
    const value = parseInt(match[1]);
    const unit = match[2] ? match[2].toUpperCase() : 'B';
    
    return value * (units[unit] || 1);
  }

  async rotateLog() {
    if (!this.fileStream || !this.logFile) return;
    
    try {
      // Close current stream
      this.fileStream.end();
      
      // Rotate file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFile = `${this.logFile}.${timestamp}`;
      
      await fs.rename(this.logFile, rotatedFile);
      
      // Create new stream
      this.fileStream = createWriteStream(this.logFile, { flags: 'a' });
      this.currentLogSize = 0;
      
      // Clean up old logs
      await this.cleanupOldLogs();
      
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  async cleanupOldLogs() {
    if (!this.logFile || !this.retention) return;
    
    try {
      const logDir = path.dirname(this.logFile);
      const baseName = path.basename(this.logFile);
      
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter(file => file.startsWith(baseName) && file !== baseName)
        .map(file => path.join(logDir, file));
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retention);
      
      for (const file of logFiles) {
        try {
          const stats = await fs.stat(file);
          if (stats.mtime < cutoffDate) {
            await fs.unlink(file);
          }
        } catch (error) {
          // Ignore errors for individual files
        }
      }
      
    } catch (error) {
      console.error('Log cleanup failed:', error);
    }
  }

  error(message, metadata = {}) {
    return this.log('error', message, metadata);
  }

  warn(message, metadata = {}) {
    return this.log('warn', message, metadata);
  }

  info(message, metadata = {}) {
    return this.log('info', message, metadata);
  }

  debug(message, metadata = {}) {
    return this.log('debug', message, metadata);
  }

  trace(message, metadata = {}) {
    return this.log('trace', message, metadata);
  }

  child(metadata = {}) {
    return new ChildLogger(this, metadata);
  }

  createRequestLogger(req, res, next) {
    const startTime = Date.now();
    const requestId = req.correlationId || 'unknown';
    
    const requestLogger = this.child({
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    requestLogger.info('Request started');
    
    const originalSend = res.send;
    res.send = function(body) {
      const duration = Date.now() - startTime;
      
      requestLogger.info('Request completed', {
        statusCode: res.statusCode,
        duration,
        responseSize: Buffer.byteLength(body || '')
      });
      
      return originalSend.call(this, body);
    };
    
    req.logger = requestLogger;
    next();
  }

  async getLogStats() {
    const stats = {
      level: this.level,
      format: this.format,
      destinations: this.destinations,
      fileLogging: !!this.logFile
    };
    
    if (this.logFile) {
      try {
        const fileStats = await fs.stat(this.logFile);
        stats.logFile = {
          path: this.logFile,
          size: fileStats.size,
          modified: fileStats.mtime
        };
      } catch (error) {
        stats.logFile = {
          path: this.logFile,
          error: error.message
        };
      }
    }
    
    return stats;
  }

  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.level = level;
      this.info('Log level changed', { newLevel: level });
    } else {
      throw new Error(`Invalid log level: ${level}. Valid levels: ${Object.keys(this.levels).join(', ')}`);
    }
  }

  async close() {
    if (this.fileStream) {
      return new Promise((resolve) => {
        this.fileStream.end(() => {
          this.fileStream = null;
          resolve();
        });
      });
    }
  }
}

class ChildLogger {
  constructor(parent, metadata = {}) {
    this.parent = parent;
    this.metadata = metadata;
  }

  log(level, message, additionalMetadata = {}) {
    const combinedMetadata = { ...this.metadata, ...additionalMetadata };
    return this.parent.log(level, message, combinedMetadata);
  }

  error(message, metadata = {}) {
    return this.log('error', message, metadata);
  }

  warn(message, metadata = {}) {
    return this.log('warn', message, metadata);
  }

  info(message, metadata = {}) {
    return this.log('info', message, metadata);
  }

  debug(message, metadata = {}) {
    return this.log('debug', message, metadata);
  }

  trace(message, metadata = {}) {
    return this.log('trace', message, metadata);
  }

  child(additionalMetadata = {}) {
    const combinedMetadata = { ...this.metadata, ...additionalMetadata };
    return new ChildLogger(this.parent, combinedMetadata);
  }
}

module.exports = Logger;
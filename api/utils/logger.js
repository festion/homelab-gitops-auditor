const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.options = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      format: options.format || 'json',
      logDir: options.logDir || path.join(process.cwd(), 'logs'),
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles || 5,
      enableConsole: options.enableConsole !== false,
      component: options.component || 'webhook-system',
      ...options
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.currentLevel = this.levels[this.options.level] || this.levels.info;
    this.logQueue = [];
    this.isWriting = false;

    this.initializeLogger();
  }

  async initializeLogger() {
    try {
      await fs.mkdir(this.options.logDir, { recursive: true });
      console.log(`📁 Logger initialized: ${this.options.logDir}`);
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const baseLog = {
      timestamp,
      level,
      component: this.options.component,
      message,
      pid: process.pid,
      ...meta
    };

    if (this.options.format === 'json') {
      return JSON.stringify(baseLog);
    } else {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] [${this.options.component}] ${message}${metaStr}`;
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.currentLevel;
  }

  async writeToFile(level, formattedMessage) {
    if (!this.shouldLog(level)) return;

    const fileName = `${this.options.component}-${level}.log`;
    const filePath = path.join(this.options.logDir, fileName);

    try {
      await this.rotateLogFileIfNeeded(filePath);
      await fs.appendFile(filePath, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  async rotateLogFileIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.options.maxFileSize) {
        await this.rotateLogFile(filePath);
      }
    } catch (error) {
      // File doesn't exist yet, no rotation needed
      if (error.code !== 'ENOENT') {
        console.error('Error checking log file size:', error);
      }
    }
  }

  async rotateLogFile(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);

    try {
      // Rotate existing files
      for (let i = this.options.maxFiles - 1; i > 0; i--) {
        const oldFile = path.join(dir, `${basename}.${i}${ext}`);
        const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
        
        try {
          await fs.access(oldFile);
          if (i === this.options.maxFiles - 1) {
            await fs.unlink(oldFile);
          } else {
            await fs.rename(oldFile, newFile);
          }
        } catch (error) {
          // File doesn't exist, skip
        }
      }

      // Move current file to .1
      const rotatedFile = path.join(dir, `${basename}.1${ext}`);
      await fs.rename(filePath, rotatedFile);
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  async log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    // Console output
    if (this.options.enableConsole) {
      const consoleMethod = level === 'error' ? console.error : 
                           level === 'warn' ? console.warn : console.log;
      consoleMethod(formattedMessage);
    }

    // File output
    this.logQueue.push({ level, message: formattedMessage });
    await this.processLogQueue();
  }

  async processLogQueue() {
    if (this.isWriting || this.logQueue.length === 0) return;

    this.isWriting = true;
    try {
      while (this.logQueue.length > 0) {
        const { level, message } = this.logQueue.shift();
        await this.writeToFile(level, message);
      }
    } finally {
      this.isWriting = false;
    }
  }

  // Convenience methods
  error(message, meta = {}) {
    return this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    return this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    return this.log('trace', message, meta);
  }

  // Specialized logging methods for webhooks
  async logWebhookReceived(event, deliveryId, repository, headers) {
    await this.info('Webhook received', {
      event,
      deliveryId,
      repository,
      userAgent: headers['user-agent'],
      contentLength: headers['content-length'],
      timestamp: new Date().toISOString()
    });
  }

  async logWebhookProcessed(event, deliveryId, repository, processingTime, success, error = null) {
    const level = success ? 'info' : 'error';
    const message = success ? 'Webhook processed successfully' : 'Webhook processing failed';
    
    await this.log(level, message, {
      event,
      deliveryId,
      repository,
      processingTime,
      success,
      error: error?.message,
      errorStack: error?.stack,
      timestamp: new Date().toISOString()
    });
  }

  async logWebhookRetry(event, deliveryId, repository, attempt, maxAttempts, nextRetryDelay) {
    await this.warn('Webhook processing retry scheduled', {
      event,
      deliveryId,
      repository,
      attempt,
      maxAttempts,
      nextRetryDelay,
      timestamp: new Date().toISOString()
    });
  }

  async logWebhookPermanentFailure(event, deliveryId, repository, attempts, error) {
    await this.error('Webhook processing permanently failed', {
      event,
      deliveryId,
      repository,
      attempts,
      error: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  async logServiceError(service, operation, error, context = {}) {
    await this.error(`Service error: ${service}.${operation}`, {
      service,
      operation,
      error: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      context,
      timestamp: new Date().toISOString()
    });
  }

  async logWebhookSetup(repository, success, webhook = null, error = null) {
    const level = success ? 'info' : 'error';
    const message = success ? 'Webhook setup successful' : 'Webhook setup failed';
    
    await this.log(level, message, {
      repository,
      success,
      webhookId: webhook?.id,
      webhookUrl: webhook?.config?.url,
      webhookEvents: webhook?.events,
      error: error?.message,
      timestamp: new Date().toISOString()
    });
  }

  async logAlert(type, severity, message, details = {}) {
    const level = severity === 'critical' ? 'error' : 
                  severity === 'warning' ? 'warn' : 'info';
    
    await this.log(level, `Alert: ${message}`, {
      alertType: type,
      severity,
      details,
      timestamp: new Date().toISOString()
    });
  }

  async logPerformanceMetric(operation, duration, success, context = {}) {
    await this.info('Performance metric', {
      operation,
      duration,
      success,
      context,
      timestamp: new Date().toISOString()
    });
  }

  // Health check logging
  async logHealthCheck(component, status, details = {}) {
    const level = status === 'healthy' ? 'info' : 
                  status === 'warning' ? 'warn' : 'error';
    
    await this.log(level, `Health check: ${component}`, {
      component,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Shutdown logging
  async logShutdown(component, reason = 'Normal shutdown') {
    await this.info(`Component shutdown: ${component}`, {
      component,
      reason,
      timestamp: new Date().toISOString()
    });
    
    // Ensure all logs are written before shutdown
    await this.processLogQueue();
  }

  // Create child logger with additional context
  child(additionalContext = {}) {
    return new ChildLogger(this, additionalContext);
  }

  // Get log statistics
  async getLogStats() {
    const stats = {
      files: [],
      totalSize: 0,
      oldestLog: null,
      newestLog: null
    };

    try {
      const files = await fs.readdir(this.options.logDir);
      
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.options.logDir, file);
          const stat = await fs.stat(filePath);
          
          stats.files.push({
            name: file,
            size: stat.size,
            created: stat.birthtime,
            modified: stat.mtime
          });
          
          stats.totalSize += stat.size;
          
          if (!stats.oldestLog || stat.birthtime < stats.oldestLog) {
            stats.oldestLog = stat.birthtime;
          }
          
          if (!stats.newestLog || stat.mtime > stats.newestLog) {
            stats.newestLog = stat.mtime;
          }
        }
      }
    } catch (error) {
      await this.error('Failed to get log stats', { error: error.message });
    }

    return stats;
  }
}

class ChildLogger {
  constructor(parentLogger, context) {
    this.parent = parentLogger;
    this.context = context;
  }

  async log(level, message, meta = {}) {
    return this.parent.log(level, message, { ...this.context, ...meta });
  }

  error(message, meta = {}) {
    return this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    return this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    return this.log('trace', message, meta);
  }

  child(additionalContext = {}) {
    return new ChildLogger(this.parent, { ...this.context, ...additionalContext });
  }
}

// Create singleton logger instance
const defaultLogger = new Logger({
  component: 'webhook-system',
  level: process.env.LOG_LEVEL || 'info'
});

// Factory function for component-specific loggers
function createLogger(component, options = {}) {
  return new Logger({
    component,
    ...options
  });
}

module.exports = {
  Logger,
  ChildLogger,
  logger: defaultLogger,
  createLogger
};
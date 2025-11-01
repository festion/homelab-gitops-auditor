/**
 * Unit tests for Logger utility
 * Tests logging functionality, levels, formatting, and output destinations
 */

const fs = require('fs').promises;
const path = require('path');

// Mock logger implementation
class Logger {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.level = options.level || 'info';
    this.format = options.format || 'json';
    this.outputs = options.outputs || ['console'];
    this.logDir = options.logDir || '/tmp/logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[35m',   // Magenta
      trace: '\x1b[37m',   // White
      reset: '\x1b[0m'
    };

    this.logBuffer = [];
    this.metadata = {
      pid: process.pid,
      hostname: 'test-host',
      service: this.name
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: this.metadata.service,
      pid: this.metadata.pid,
      hostname: this.metadata.hostname,
      message,
      ...meta
    };

    if (this.format === 'json') {
      return JSON.stringify(logEntry);
    } else {
      const color = this.colors[level] || '';
      const reset = this.colors.reset;
      return `${color}[${timestamp}] ${level.toUpperCase()} [${this.name}]: ${message}${reset}`;
    }
  }

  async writeToOutputs(formattedMessage, level) {
    const promises = [];

    for (const output of this.outputs) {
      if (output === 'console') {
        // Mock console output
        this.logBuffer.push({ output: 'console', message: formattedMessage, level });
      } else if (output === 'file') {
        promises.push(this.writeToFile(formattedMessage, level));
      } else if (output.startsWith('file:')) {
        const filePath = output.replace('file:', '');
        promises.push(this.writeToSpecificFile(formattedMessage, filePath));
      }
    }

    await Promise.all(promises);
  }

  async writeToFile(message, level) {
    const fileName = `${this.name}-${level}.log`;
    const filePath = path.join(this.logDir, fileName);
    
    // Mock file writing
    this.logBuffer.push({
      output: 'file',
      path: filePath,
      message,
      level
    });
  }

  async writeToSpecificFile(message, filePath) {
    // Mock specific file writing
    this.logBuffer.push({
      output: 'specific-file',
      path: filePath,
      message
    });
  }

  async log(level, message, meta = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      const formattedMessage = this.formatMessage(level, message, meta);
      await this.writeToOutputs(formattedMessage, level);
    } catch (error) {
      // Fallback to console for logging errors
      console.error('Logger error:', error.message);
    }
  }

  async error(message, meta = {}) {
    await this.log('error', message, meta);
  }

  async warn(message, meta = {}) {
    await this.log('warn', message, meta);
  }

  async info(message, meta = {}) {
    await this.log('info', message, meta);
  }

  async debug(message, meta = {}) {
    await this.log('debug', message, meta);
  }

  async trace(message, meta = {}) {
    await this.log('trace', message, meta);
  }

  // Structured logging methods
  async logDeployment(deploymentId, status, details = {}) {
    await this.info(`Deployment ${status}`, {
      deploymentId,
      status,
      type: 'deployment',
      ...details
    });
  }

  async logHealthCheck(service, status, details = {}) {
    const level = status === 'healthy' ? 'info' : 'warn';
    await this.log(level, `Health check: ${service} is ${status}`, {
      service,
      status,
      type: 'health_check',
      ...details
    });
  }

  async logSecurity(event, details = {}) {
    await this.warn(`Security event: ${event}`, {
      event,
      type: 'security',
      ...details
    });
  }

  async logPerformance(operation, duration, details = {}) {
    const level = duration > 5000 ? 'warn' : 'info'; // Warn if over 5 seconds
    await this.log(level, `Performance: ${operation} took ${duration}ms`, {
      operation,
      duration,
      type: 'performance',
      ...details
    });
  }

  // Utility methods
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.level = level;
      return true;
    }
    return false;
  }

  addOutput(output) {
    if (!this.outputs.includes(output)) {
      this.outputs.push(output);
    }
  }

  removeOutput(output) {
    const index = this.outputs.indexOf(output);
    if (index > -1) {
      this.outputs.splice(index, 1);
    }
  }

  clearBuffer() {
    this.logBuffer = [];
  }

  getBuffer() {
    return [...this.logBuffer];
  }

  async getLogs(options = {}) {
    const { level, limit = 100, since } = options;
    let logs = this.getBuffer();

    // Filter by level
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    // Filter by time
    if (since) {
      const sinceTime = new Date(since).getTime();
      logs = logs.filter(log => {
        try {
          const logData = JSON.parse(log.message);
          return new Date(logData.timestamp).getTime() >= sinceTime;
        } catch {
          return true; // Include non-JSON logs
        }
      });
    }

    // Limit results
    return logs.slice(-limit);
  }

  createChild(options = {}) {
    return new Logger({
      ...this,
      name: options.name || `${this.name}-child`,
      ...options
    });
  }

  // Metrics and monitoring
  getMetrics() {
    const logs = this.getBuffer();
    const levelCounts = {};
    const outputCounts = {};

    logs.forEach(log => {
      // Count by level
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
      
      // Count by output
      outputCounts[log.output] = (outputCounts[log.output] || 0) + 1;
    });

    return {
      totalLogs: logs.length,
      levelCounts,
      outputCounts,
      currentLevel: this.level,
      outputs: this.outputs
    };
  }
}

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    logger = new Logger({
      name: 'test-logger',
      level: 'debug',
      outputs: ['console']
    });
  });

  afterEach(() => {
    logger.clearBuffer();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLogger = new Logger();

      expect(defaultLogger.name).toBe('default');
      expect(defaultLogger.level).toBe('info');
      expect(defaultLogger.format).toBe('json');
      expect(defaultLogger.outputs).toEqual(['console']);
    });

    it('should initialize with custom configuration', () => {
      const customLogger = new Logger({
        name: 'custom',
        level: 'warn',
        format: 'text',
        outputs: ['file', 'console']
      });

      expect(customLogger.name).toBe('custom');
      expect(customLogger.level).toBe('warn');
      expect(customLogger.format).toBe('text');
      expect(customLogger.outputs).toEqual(['file', 'console']);
    });
  });

  describe('log level filtering', () => {
    it('should respect log level hierarchy', () => {
      logger.level = 'warn';

      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
      expect(logger.shouldLog('trace')).toBe(false);
    });

    it('should allow all levels with trace level', () => {
      logger.level = 'trace';

      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(true);
      expect(logger.shouldLog('debug')).toBe(true);
      expect(logger.shouldLog('trace')).toBe(true);
    });
  });

  describe('message formatting', () => {
    it('should format JSON messages correctly', () => {
      const message = logger.formatMessage('info', 'Test message', { extra: 'data' });
      const parsed = JSON.parse(message);

      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Test message');
      expect(parsed.service).toBe('test-logger');
      expect(parsed.extra).toBe('data');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.pid).toBeDefined();
      expect(parsed.hostname).toBeDefined();
    });

    it('should format text messages with colors', () => {
      logger.format = 'text';
      const message = logger.formatMessage('error', 'Test error');

      expect(message).toContain('ERROR');
      expect(message).toContain('Test error');
      expect(message).toContain('[test-logger]');
      expect(message).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp
    });
  });

  describe('logging methods', () => {
    it('should log error messages', async () => {
      await logger.error('Test error', { code: 500 });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].output).toBe('console');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Test error');
      expect(parsed.code).toBe(500);
    });

    it('should log warn messages', async () => {
      await logger.warn('Test warning');

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Test warning');
    });

    it('should log info messages', async () => {
      await logger.info('Test info');

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
    });

    it('should log debug messages', async () => {
      await logger.debug('Test debug');

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('debug');
    });

    it('should filter out logs below current level', async () => {
      logger.level = 'warn';

      await logger.error('Error message');
      await logger.warn('Warning message');
      await logger.info('Info message');   // Should be filtered
      await logger.debug('Debug message'); // Should be filtered

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe('error');
      expect(logs[1].level).toBe('warn');
    });
  });

  describe('structured logging', () => {
    it('should log deployment events', async () => {
      await logger.logDeployment('deploy-123', 'started', {
        repository: 'user/repo',
        branch: 'main'
      });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Deployment started');
      expect(parsed.deploymentId).toBe('deploy-123');
      expect(parsed.status).toBe('started');
      expect(parsed.type).toBe('deployment');
      expect(parsed.repository).toBe('user/repo');
      expect(parsed.branch).toBe('main');
    });

    it('should log health check events', async () => {
      await logger.logHealthCheck('database', 'healthy', {
        responseTime: 45
      });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Health check: database is healthy');
      expect(parsed.service).toBeDefined(); // Note: 'service' is overloaded here
      expect(parsed.status).toBe('healthy');
      expect(parsed.type).toBe('health_check');
      expect(parsed.responseTime).toBe(45);
    });

    it('should log unhealthy services as warnings', async () => {
      await logger.logHealthCheck('api', 'unhealthy', {
        error: 'Connection timeout'
      });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Health check: api is unhealthy');
      expect(parsed.error).toBe('Connection timeout');
    });

    it('should log security events', async () => {
      await logger.logSecurity('invalid_token', {
        clientIp: '192.168.1.100',
        userAgent: 'TestAgent'
      });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Security event: invalid_token');
      expect(parsed.event).toBe('invalid_token');
      expect(parsed.type).toBe('security');
      expect(parsed.clientIp).toBe('192.168.1.100');
    });

    it('should log performance metrics', async () => {
      await logger.logPerformance('database_query', 1500, {
        query: 'SELECT * FROM deployments',
        rows: 100
      });

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');

      const parsed = JSON.parse(logs[0].message);
      expect(parsed.message).toBe('Performance: database_query took 1500ms');
      expect(parsed.operation).toBe('database_query');
      expect(parsed.duration).toBe(1500);
      expect(parsed.type).toBe('performance');
      expect(parsed.query).toBe('SELECT * FROM deployments');
    });

    it('should warn about slow performance', async () => {
      await logger.logPerformance('slow_operation', 6000);

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn'); // Should be warn because > 5000ms
    });
  });

  describe('output handling', () => {
    it('should write to multiple outputs', async () => {
      logger.outputs = ['console', 'file'];

      await logger.info('Test message');

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(2);
      expect(logs[0].output).toBe('console');
      expect(logs[1].output).toBe('file');
    });

    it('should write to specific file paths', async () => {
      logger.outputs = ['file:/custom/path/app.log'];

      await logger.info('Test message');

      const logs = logger.getBuffer();
      expect(logs).toHaveLength(1);
      expect(logs[0].output).toBe('specific-file');
      expect(logs[0].path).toBe('/custom/path/app.log');
    });
  });

  describe('utility methods', () => {
    it('should set valid log levels', () => {
      expect(logger.setLevel('error')).toBe(true);
      expect(logger.level).toBe('error');

      expect(logger.setLevel('invalid')).toBe(false);
      expect(logger.level).toBe('error'); // Should remain unchanged
    });

    it('should manage outputs', () => {
      logger.addOutput('file');
      expect(logger.outputs).toContain('file');

      logger.addOutput('file'); // Should not duplicate
      expect(logger.outputs.filter(o => o === 'file')).toHaveLength(1);

      logger.removeOutput('file');
      expect(logger.outputs).not.toContain('file');
    });

    it('should clear and retrieve buffer', async () => {
      await logger.info('Message 1');
      await logger.info('Message 2');

      expect(logger.getBuffer()).toHaveLength(2);

      logger.clearBuffer();
      expect(logger.getBuffer()).toHaveLength(0);
    });
  });

  describe('log retrieval and filtering', () => {
    beforeEach(async () => {
      await logger.error('Error message');
      await logger.warn('Warning message');
      await logger.info('Info message 1');
      await logger.info('Info message 2');
      await logger.debug('Debug message');
    });

    it('should retrieve all logs by default', async () => {
      const logs = await logger.getLogs();

      expect(logs).toHaveLength(5);
    });

    it('should filter logs by level', async () => {
      const infoLogs = await logger.getLogs({ level: 'info' });

      expect(infoLogs).toHaveLength(2);
      expect(infoLogs.every(log => log.level === 'info')).toBe(true);
    });

    it('should limit number of logs returned', async () => {
      const limitedLogs = await logger.getLogs({ limit: 2 });

      expect(limitedLogs).toHaveLength(2);
      // Should return the last 2 logs
      expect(limitedLogs[0].level).toBe('info');
      expect(limitedLogs[1].level).toBe('debug');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with inherited configuration', () => {
      const child = logger.createChild({ name: 'child-logger' });

      expect(child.name).toBe('child-logger');
      expect(child.level).toBe(logger.level);
      expect(child.format).toBe(logger.format);
      expect(child.outputs).toEqual(logger.outputs);
    });

    it('should create child logger with custom configuration', () => {
      const child = logger.createChild({
        name: 'child-logger',
        level: 'error',
        outputs: ['file']
      });

      expect(child.name).toBe('child-logger');
      expect(child.level).toBe('error');
      expect(child.outputs).toEqual(['file']);
    });

    it('should maintain separate buffers for child loggers', async () => {
      const child = logger.createChild({ name: 'child' });

      await logger.info('Parent message');
      await child.info('Child message');

      expect(logger.getBuffer()).toHaveLength(1);
      expect(child.getBuffer()).toHaveLength(1);

      const parentParsed = JSON.parse(logger.getBuffer()[0].message);
      const childParsed = JSON.parse(child.getBuffer()[0].message);

      expect(parentParsed.service).toBe('test-logger');
      expect(childParsed.service).toBe('child');
    });
  });

  describe('metrics and monitoring', () => {
    beforeEach(async () => {
      await logger.error('Error 1');
      await logger.error('Error 2');
      await logger.warn('Warning 1');
      await logger.info('Info 1');
    });

    it('should provide accurate metrics', () => {
      const metrics = logger.getMetrics();

      expect(metrics.totalLogs).toBe(4);
      expect(metrics.levelCounts).toEqual({
        error: 2,
        warn: 1,
        info: 1
      });
      expect(metrics.outputCounts).toEqual({
        console: 4
      });
      expect(metrics.currentLevel).toBe('debug');
      expect(metrics.outputs).toEqual(['console']);
    });

    it('should handle empty metrics', () => {
      const emptyLogger = new Logger();
      const metrics = emptyLogger.getMetrics();

      expect(metrics.totalLogs).toBe(0);
      expect(metrics.levelCounts).toEqual({});
      expect(metrics.outputCounts).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should handle logging errors gracefully', async () => {
      // Mock console.error to verify fallback
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // Force an error in formatting
      const originalFormatMessage = logger.formatMessage;
      logger.formatMessage = jest.fn(() => {
        throw new Error('Formatting error');
      });

      await logger.info('Test message');

      expect(console.error).toHaveBeenCalledWith('Logger error:', 'Formatting error');

      // Restore mocks
      console.error = originalConsoleError;
      logger.formatMessage = originalFormatMessage;
    });
  });
});
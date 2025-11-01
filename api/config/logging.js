const path = require('path');
const { createLogger } = require('../utils/logger');

// Logging configuration
const loggingConfig = {
  // Global log level
  level: process.env.LOG_LEVEL || 'info',
  
  // Log directory
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
  
  // Log format (json or text)
  format: process.env.LOG_FORMAT || 'json',
  
  // Console output enabled
  enableConsole: process.env.LOG_CONSOLE !== 'false',
  
  // File rotation settings
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
  
  // Component-specific configurations
  components: {
    'webhook-system': {
      level: process.env.WEBHOOK_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'enhanced-webhook-handler': {
      level: process.env.WEBHOOK_HANDLER_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'webhook-monitor': {
      level: process.env.WEBHOOK_MONITOR_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'automated-webhook-setup': {
      level: process.env.WEBHOOK_SETUP_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'webhook-event-processor': {
      level: process.env.WEBHOOK_PROCESSOR_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'github-service': {
      level: process.env.GITHUB_SERVICE_LOG_LEVEL || 'info',
      enableConsole: true
    },
    'webhook-config': {
      level: process.env.WEBHOOK_CONFIG_LOG_LEVEL || 'info',
      enableConsole: true
    }
  }
};

// Create loggers for each component
const loggers = {};

function getComponentLogger(componentName) {
  if (!loggers[componentName]) {
    const componentConfig = loggingConfig.components[componentName] || {};
    
    loggers[componentName] = createLogger(componentName, {
      level: componentConfig.level || loggingConfig.level,
      format: loggingConfig.format,
      logDir: loggingConfig.logDir,
      maxFileSize: loggingConfig.maxFileSize,
      maxFiles: loggingConfig.maxFiles,
      enableConsole: componentConfig.enableConsole !== undefined ? 
        componentConfig.enableConsole : loggingConfig.enableConsole
    });
  }
  
  return loggers[componentName];
}

// Initialize all component loggers
function initializeAllLoggers() {
  const componentNames = Object.keys(loggingConfig.components);
  
  componentNames.forEach(componentName => {
    getComponentLogger(componentName);
  });
  
  console.log(`📝 Initialized loggers for ${componentNames.length} components`);
  return loggers;
}

// Log system startup
function logSystemStartup() {
  const systemLogger = getComponentLogger('webhook-system');
  
  systemLogger.info('Webhook system starting up', {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    cwd: process.cwd(),
    env: process.env.NODE_ENV || 'development',
    logLevel: loggingConfig.level,
    logDir: loggingConfig.logDir,
    timestamp: new Date().toISOString()
  });
}

// Log system shutdown
async function logSystemShutdown(reason = 'Normal shutdown') {
  const systemLogger = getComponentLogger('webhook-system');
  
  await systemLogger.info('Webhook system shutting down', {
    reason,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
  
  // Ensure all logs are written
  const loggerPromises = Object.values(loggers).map(logger => 
    logger.processLogQueue ? logger.processLogQueue() : Promise.resolve()
  );
  
  await Promise.all(loggerPromises);
}

// Health check for logging system
async function getLoggingHealth() {
  const health = {
    status: 'healthy',
    components: {},
    totalLoggers: Object.keys(loggers).length,
    logDirectory: loggingConfig.logDir,
    timestamp: new Date().toISOString()
  };
  
  // Check each logger
  for (const [componentName, logger] of Object.entries(loggers)) {
    try {
      const stats = await logger.getLogStats();
      health.components[componentName] = {
        status: 'healthy',
        logFiles: stats.files.length,
        totalSize: stats.totalSize,
        oldestLog: stats.oldestLog,
        newestLog: stats.newestLog
      };
    } catch (error) {
      health.components[componentName] = {
        status: 'error',
        error: error.message
      };
      health.status = 'degraded';
    }
  }
  
  return health;
}

// Express middleware for request logging
function createRequestLoggingMiddleware(componentName = 'api') {
  const logger = getComponentLogger(componentName);
  
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to request object
    req.requestId = requestId;
    
    // Log request start
    logger.info('HTTP request started', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level]('HTTP request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length'),
        timestamp: new Date().toISOString()
      });
    });
    
    next();
  };
}

// Structured error logging for Express
function createErrorLoggingMiddleware(componentName = 'api') {
  const logger = getComponentLogger(componentName);
  
  return (error, req, res, next) => {
    logger.error('HTTP request error', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    next(error);
  };
}

// Performance monitoring
function logPerformanceMetric(componentName, operation, duration, success = true, metadata = {}) {
  const logger = getComponentLogger(componentName);
  
  logger.info('Performance metric', {
    operation,
    duration,
    success,
    metadata,
    timestamp: new Date().toISOString()
  });
}

// Security event logging
function logSecurityEvent(eventType, severity, details = {}) {
  const logger = getComponentLogger('webhook-system');
  
  const level = severity === 'critical' ? 'error' : 
                severity === 'high' ? 'warn' : 'info';
  
  logger[level]('Security event', {
    eventType,
    severity,
    details,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  loggingConfig,
  getComponentLogger,
  initializeAllLoggers,
  logSystemStartup,
  logSystemShutdown,
  getLoggingHealth,
  createRequestLoggingMiddleware,
  createErrorLoggingMiddleware,
  logPerformanceMetric,
  logSecurityEvent
};
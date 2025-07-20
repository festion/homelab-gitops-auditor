const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { ConfigManager } = require('../config/utils/config-manager');

/**
 * Webhook Middleware
 * 
 * Provides security middleware specifically designed for webhook endpoints:
 * - Rate limiting per IP address with configurable windows
 * - Security headers optimized for webhook processing
 * - Request logging and monitoring
 * - IP-based blocking and allowlisting
 */

/**
 * Rate limiting middleware for webhook endpoints
 * More restrictive than general API endpoints to prevent abuse
 */
const createWebhookRateLimit = (config) => {
  const rateLimitConfig = config?.api?.rateLimit || {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per window
  };

  return rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    message: {
      error: 'Too many webhook requests from this IP address',
      retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
      limit: rateLimitConfig.max
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    keyGenerator: (req) => {
      // Use the real IP address for rate limiting
      return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             req.socket?.remoteAddress ||
             req.ip ||
             'unknown';
    },
    skip: (req) => {
      // Skip rate limiting for ping events (webhook validation)
      return req.headers['x-github-event'] === 'ping';
    },
    onLimitReached: (req, res, options) => {
      const clientIP = options.keyGenerator(req);
      console.warn(`Rate limit exceeded for webhook endpoint from IP: ${clientIP}`);
      
      // Log rate limit violation for monitoring
      const { AuditLogger } = require('../utils/audit-logger');
      AuditLogger.logSecurityEvent({
        timestamp: new Date().toISOString(),
        type: 'rate-limit-exceeded',
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'],
        eventType: req.headers['x-github-event'],
        delivery: req.headers['x-github-delivery'],
        error: 'Rate limit exceeded for webhook endpoint',
        errorCode: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });
};

/**
 * Security headers middleware optimized for webhooks
 */
const createWebhookSecurity = () => {
  return helmet({
    // Content Security Policy - relaxed for webhook endpoints
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'none'"], // No scripts needed for webhook endpoints
        styleSrc: ["'none'"], // No styles needed for webhook endpoints
        imgSrc: ["'none'"], // No images needed for webhook endpoints
        connectSrc: ["'none'"], // No external connections needed
        fontSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    },
    
    // HSTS - Force HTTPS
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Prevent MIME type sniffing
    noSniff: true,
    
    // Prevent XSS attacks
    xssFilter: true,
    
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    
    // Hide server information
    hidePoweredBy: true,
    
    // Prevent DNS prefetching
    dnsPrefetchControl: { allow: false },
    
    // Prevent IE from executing downloads
    ieNoOpen: true,
    
    // Don't send referrer information
    referrerPolicy: { policy: 'no-referrer' }
  });
};

/**
 * Request logging middleware for webhooks
 */
const webhookRequestLogger = (req, res, next) => {
  const startTime = Date.now();
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.connection?.remoteAddress ||
                   req.socket?.remoteAddress ||
                   req.ip ||
                   'unknown';

  // Log incoming webhook request
  console.log(`Webhook request: ${req.method} ${req.path} from ${clientIP}`, {
    event: req.headers['x-github-event'],
    delivery: req.headers['x-github-delivery'],
    userAgent: req.headers['user-agent'],
    contentLength: req.headers['content-length']
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const processingTime = Date.now() - startTime;
    
    console.log(`Webhook response: ${res.statusCode} in ${processingTime}ms`, {
      event: req.headers['x-github-event'],
      delivery: req.headers['x-github-delivery'],
      clientIP,
      processingTime
    });
    
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Request body size validation middleware
 */
const webhookBodySizeValidator = (req, res, next) => {
  const maxSize = 1024 * 1024; // 1MB
  const contentLength = parseInt(req.headers['content-length'] || '0');
  
  if (contentLength > maxSize) {
    const error = new Error(`Request body too large: ${contentLength} bytes (max: ${maxSize} bytes)`);
    error.statusCode = 413;
    error.code = 'REQUEST_TOO_LARGE';
    
    // Log the violation
    const { AuditLogger } = require('../utils/audit-logger');
    AuditLogger.logWebhookError({
      eventType: req.headers['x-github-event'],
      delivery: req.headers['x-github-delivery'],
      error: error.message,
      errorCode: error.code,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestSize: contentLength
    });
    
    return res.status(413).json({
      error: 'Request body too large',
      maxSize: maxSize,
      actualSize: contentLength
    });
  }
  
  next();
};

/**
 * GitHub event type validation middleware
 */
const githubEventValidator = async (req, res, next) => {
  try {
    const config = await ConfigManager.loadConfig(process.env.NODE_ENV || 'production');
    const allowedEvents = config.webhook?.allowedEvents || [
      'repository_dispatch',
      'push',
      'pull_request',
      'ping'
    ];
    
    const eventType = req.headers['x-github-event'];
    
    if (!eventType) {
      return res.status(400).json({
        error: 'Missing X-GitHub-Event header',
        code: 'MISSING_EVENT_HEADER'
      });
    }
    
    if (!allowedEvents.includes(eventType)) {
      const error = {
        error: `Event type '${eventType}' is not allowed`,
        code: 'INVALID_EVENT_TYPE',
        allowedEvents
      };
      
      // Log the violation
      const { AuditLogger } = require('../utils/audit-logger');
      AuditLogger.logWebhookError({
        eventType,
        delivery: req.headers['x-github-delivery'],
        error: error.error,
        errorCode: error.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(400).json(error);
    }
    
    next();
  } catch (error) {
    console.error('Error in GitHub event validator:', error);
    res.status(500).json({
      error: 'Internal server error in event validation',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * CORS middleware specifically for webhook endpoints
 */
const webhookCORS = (req, res, next) => {
  // Webhooks don't need CORS since they're server-to-server
  // But we'll allow specific origins for testing
  const allowedOrigins = [
    'https://github.com',
    'https://api.github.com'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
};

/**
 * Error handling middleware for webhook endpoints
 */
const webhookErrorHandler = (error, req, res, next) => {
  const { AuditLogger } = require('../utils/audit-logger');
  
  // Log the error
  AuditLogger.logWebhookError({
    eventType: req.headers['x-github-event'],
    delivery: req.headers['x-github-delivery'],
    error: error.message,
    errorCode: error.code || 'WEBHOOK_ERROR',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    stackTrace: error.stack,
    headers: req.headers
  });
  
  // Determine status code
  const statusCode = error.statusCode || error.status || 500;
  
  // Send error response
  res.status(statusCode).json({
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    delivery: req.headers['x-github-delivery'],
    timestamp: new Date().toISOString()
  });
};

/**
 * Initialize all webhook middleware
 * @param {Object} config - Application configuration
 * @returns {Object} Middleware functions
 */
const initializeWebhookMiddleware = async (config) => {
  const loadedConfig = config || await ConfigManager.loadConfig(process.env.NODE_ENV || 'production');
  
  return {
    rateLimit: createWebhookRateLimit(loadedConfig),
    security: createWebhookSecurity(),
    requestLogger: webhookRequestLogger,
    bodySizeValidator: webhookBodySizeValidator,
    eventValidator: githubEventValidator,
    cors: webhookCORS,
    errorHandler: webhookErrorHandler
  };
};

module.exports = {
  createWebhookRateLimit,
  createWebhookSecurity,
  webhookRequestLogger,
  webhookBodySizeValidator,
  githubEventValidator,
  webhookCORS,
  webhookErrorHandler,
  initializeWebhookMiddleware
};
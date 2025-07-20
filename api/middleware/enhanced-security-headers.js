const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { AuditLogger } = require('../utils/audit-logger');
const { Logger } = require('../utils/logger');

/**
 * Enhanced Security Middleware
 * Provides comprehensive security headers, rate limiting, and attack prevention
 */
class SecurityMiddleware {
  constructor() {
    this.config = null;
    this.logger = new Logger('SecurityMiddleware');
    this.rateLimitStore = new Map();
    this.ipWhitelist = new Set();
    this.ipBlacklist = new Set();
  }

  /**
   * Initialize security middleware
   */
  async initialize() {
    try {
      this.config = await this.loadConfig();
      this.setupIPFilters();
      this.logger.info('Security middleware initialized');
    } catch (error) {
      this.logger.error('Failed to initialize security middleware:', error);
      // Use default configuration
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Load security configuration
   */
  async loadConfig() {
    try {
      const ConfigManager = require('../config/utils/config-manager');
      const config = await ConfigManager.getConfig();
      return config.security || this.getDefaultConfig();
    } catch (error) {
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default security configuration
   */
  getDefaultConfig() {
    return {
      cors: {
        origins: ['http://localhost:3000', 'http://localhost:5173'],
        credentials: true
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000,
        authMax: 5,
        sensitiveMax: 10
      },
      headers: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      },
      ipFiltering: {
        whitelist: [],
        blacklist: []
      }
    };
  }

  /**
   * Setup IP filtering
   */
  setupIPFilters() {
    const { whitelist = [], blacklist = [] } = this.config.ipFiltering || {};
    
    whitelist.forEach(ip => this.ipWhitelist.add(ip));
    blacklist.forEach(ip => this.ipBlacklist.add(ip));
  }

  /**
   * Enhanced security headers using Helmet
   */
  getSecurityHeaders() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https:"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'", "https:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        },
        reportOnly: false
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: this.config.headers?.hsts?.maxAge || 31536000,
        includeSubDomains: this.config.headers?.hsts?.includeSubDomains || true,
        preload: this.config.headers?.hsts?.preload || true
      },

      // Prevent MIME type sniffing
      noSniff: true,

      // X-Frame-Options
      frameguard: { action: 'deny' },

      // X-XSS-Protection
      xssFilter: true,

      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // DNS Prefetch Control
      dnsPrefetchControl: { allow: false },

      // Expect-CT header
      expectCt: {
        maxAge: 86400,
        enforce: true
      },

      // Cross-Origin-Opener-Policy
      crossOriginOpenerPolicy: { policy: 'same-origin' },

      // Cross-Origin-Resource-Policy
      crossOriginResourcePolicy: { policy: 'same-origin' },

      // Cross-Origin-Embedder-Policy
      crossOriginEmbedderPolicy: false // Disabled for API compatibility
    });
  }

  /**
   * Enhanced CORS configuration
   */
  getCorsConfig() {
    const allowedOrigins = this.config.cors?.origins || ['http://localhost:3000'];
    
    return cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check against allowed origins
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // Log CORS violation
          AuditLogger.logSecurityEvent({
            type: 'cors-violation',
            origin: origin,
            allowedOrigins: allowedOrigins,
            timestamp: new Date().toISOString()
          });
          
          callback(new Error('Not allowed by CORS policy'));
        }
      },
      credentials: this.config.cors?.credentials || true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-MFA-Token',
        'X-Forwarded-For',
        'User-Agent'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Request-ID'
      ],
      maxAge: 86400 // 24 hours
    });
  }

  /**
   * General API rate limiting
   */
  getApiRateLimit() {
    return rateLimit({
      windowMs: this.config.rateLimit?.windowMs || 15 * 60 * 1000,
      max: this.config.rateLimit?.max || 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        status: 'error',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          timestamp: new Date().toISOString()
        }
      },
      skip: (req) => {
        // Skip rate limiting for whitelisted IPs
        if (this.ipWhitelist.has(req.ip)) {
          return true;
        }
        
        // Skip for development
        return process.env.NODE_ENV === 'development' && 
               (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
      },
      handler: (req, res) => {
        AuditLogger.logSecurityEvent({
          type: 'rate-limit-exceeded',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method,
          limit: this.config.rateLimit?.max || 1000,
          windowMs: this.config.rateLimit?.windowMs || 15 * 60 * 1000
        });
        
        res.status(429).json({
          status: 'error',
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryAfter: Math.ceil((this.config.rateLimit?.windowMs || 15 * 60 * 1000) / 1000),
            timestamp: new Date().toISOString()
          }
        });
      }
    });
  }

  /**
   * Strict rate limiting for authentication endpoints
   */
  getAuthRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.rateLimit?.authMax || 5,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      skipFailedRequests: false,
      keyGenerator: (req) => {
        // Use IP + User-Agent for more specific tracking
        return `auth-${req.ip}-${require('crypto').createHash('md5').update(req.get('User-Agent') || '').digest('hex').substr(0, 8)}`;
      },
      message: {
        status: 'error',
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts, please try again later',
          timestamp: new Date().toISOString()
        }
      },
      handler: (req, res) => {
        AuditLogger.logSecurityEvent({
          type: 'auth-rate-limit-exceeded',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method
        });
        
        res.status(429).json({
          status: 'error',
          error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts, please try again later',
            retryAfter: 900, // 15 minutes
            timestamp: new Date().toISOString()
          }
        });
      }
    });
  }

  /**
   * Rate limiting for sensitive operations
   */
  getSensitiveRateLimit() {
    return rateLimit({
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: this.config.rateLimit?.sensitiveMax || 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Include user ID if authenticated
        const userId = req.auth?.userId || 'anonymous';
        return `sensitive-${req.ip}-${userId}`;
      },
      message: {
        status: 'error',
        error: {
          code: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
          message: 'Too many sensitive operations, please try again later',
          timestamp: new Date().toISOString()
        }
      },
      handler: (req, res) => {
        AuditLogger.logSecurityEvent({
          type: 'sensitive-rate-limit-exceeded',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.auth?.userId || null,
          endpoint: req.path,
          method: req.method
        });
        
        res.status(429).json({
          status: 'error',
          error: {
            code: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
            message: 'Too many sensitive operations, please try again later',
            retryAfter: 600, // 10 minutes
            timestamp: new Date().toISOString()
          }
        });
      }
    });
  }

  /**
   * IP filtering middleware
   */
  getIpFilter() {
    return (req, res, next) => {
      const clientIp = req.ip || req.connection.remoteAddress;
      
      // Check blacklist first
      if (this.ipBlacklist.has(clientIp)) {
        AuditLogger.logSecurityEvent({
          type: 'ip-blacklisted',
          ipAddress: clientIp,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(403).json({
          status: 'error',
          error: {
            code: 'IP_BLOCKED',
            message: 'Access denied from this IP address',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // If whitelist is configured and IP is not whitelisted
      if (this.ipWhitelist.size > 0 && !this.ipWhitelist.has(clientIp)) {
        // Allow localhost in development
        const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
        
        if (!(process.env.NODE_ENV === 'development' && isLocalhost)) {
          AuditLogger.logSecurityEvent({
            type: 'ip-not-whitelisted',
            ipAddress: clientIp,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method
          });
          
          return res.status(403).json({
            status: 'error',
            error: {
              code: 'IP_NOT_ALLOWED',
              message: 'Access denied from this IP address',
              timestamp: new Date().toISOString()
            }
          });
        }
      }
      
      next();
    };
  }

  /**
   * Custom security headers middleware
   */
  getCustomHeaders() {
    return (req, res, next) => {
      // Generate unique request ID
      const requestId = require('crypto').randomUUID();
      req.requestId = requestId;
      
      // API-specific headers
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-API-Version', 'v2');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Download-Options', 'noopen');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      res.setHeader('X-DNS-Prefetch-Control', 'off');
      
      // Remove potentially revealing headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      // Cache control for API responses
      if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      
      // Security timing headers
      res.setHeader('X-Response-Time-Start', Date.now().toString());
      
      // Add response time on finish
      res.on('finish', () => {
        const responseTime = Date.now() - parseInt(res.getHeader('X-Response-Time-Start'));
        res.setHeader('X-Response-Time', `${responseTime}ms`);
      });
      
      next();
    };
  }

  /**
   * Request size limiting middleware
   */
  getRequestSizeLimit(maxSize = 10 * 1024 * 1024) { // 10MB default
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxSize) {
        AuditLogger.logSecurityEvent({
          type: 'request-size-exceeded',
          contentLength: contentLength,
          maxSize: maxSize,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(413).json({
          status: 'error',
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body exceeds maximum allowed size of ${maxSize} bytes`,
            maxSize: maxSize,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      next();
    };
  }

  /**
   * Request logging middleware
   */
  getRequestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Enhanced request logging
      const logData = {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.headers['content-length'],
        userId: req.auth?.userId || null,
        timestamp: new Date().toISOString()
      };
      
      this.logger.info('Request received', logData);
      
      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - start;
        const responseLogData = {
          ...logData,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          responseSize: res.get('Content-Length')
        };
        
        if (res.statusCode >= 400) {
          this.logger.warn('Request completed with error', responseLogData);
        } else {
          this.logger.info('Request completed', responseLogData);
        }
      });
      
      next();
    };
  }

  /**
   * Security event detection middleware
   */
  getSecurityEventDetector() {
    return (req, res, next) => {
      // Detect potential security threats
      const userAgent = req.get('User-Agent') || '';
      const suspicious = this.detectSuspiciousActivity(req, userAgent);
      
      if (suspicious.length > 0) {
        AuditLogger.logSecurityEvent({
          type: 'suspicious-activity-detected',
          threats: suspicious,
          ipAddress: req.ip,
          userAgent: userAgent,
          endpoint: req.path,
          method: req.method,
          headers: this.sanitizeHeaders(req.headers)
        });
      }
      
      next();
    };
  }

  /**
   * Detect suspicious activity patterns
   */
  detectSuspiciousActivity(req, userAgent) {
    const threats = [];
    
    // Check for suspicious user agents
    const suspiciousUA = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /nessus/i,
      /openvas/i,
      /burp/i,
      /zap/i
    ];
    
    if (suspiciousUA.some(pattern => pattern.test(userAgent))) {
      threats.push('suspicious-user-agent');
    }
    
    // Check for suspicious paths
    const suspiciousPaths = [
      /\/\.env/,
      /\/\.git/,
      /\/admin/,
      /\/phpmyadmin/,
      /\/wp-admin/,
      /\/config\.php/,
      /\/\.well-known/
    ];
    
    if (suspiciousPaths.some(pattern => pattern.test(req.path))) {
      threats.push('suspicious-path-access');
    }
    
    // Check for suspicious headers
    const xForwardedFor = req.get('X-Forwarded-For');
    if (xForwardedFor && xForwardedFor.split(',').length > 5) {
      threats.push('suspicious-forwarded-headers');
    }
    
    // Check for empty or missing User-Agent
    if (!userAgent || userAgent.length < 10) {
      threats.push('missing-or-minimal-user-agent');
    }
    
    return threats;
  }

  /**
   * Sanitize headers for logging
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    delete sanitized['authorization'];
    delete sanitized['x-api-key'];
    delete sanitized['cookie'];
    delete sanitized['x-mfa-token'];
    
    return sanitized;
  }

  /**
   * Error handling middleware
   */
  getErrorHandler() {
    return (err, req, res, next) => {
      // Log error with context
      this.logger.error('Request error', {
        error: err.message,
        stack: err.stack,
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.auth?.userId || null
      });
      
      // Handle specific error types
      if (err.message === 'Not allowed by CORS policy') {
        return res.status(403).json({
          status: 'error',
          error: {
            code: 'CORS_ERROR',
            message: 'CORS policy violation',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      if (err.status === 429) {
        return res.status(429).json({
          status: 'error',
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: err.message || 'Rate limit exceeded',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          status: 'error',
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid authentication token',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Authentication token expired',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      if (err.name === 'ValidationError') {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Generic error response (don't expose internal errors in production)
      const statusCode = err.status || 500;
      const message = process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Internal server error';
      
      res.status(statusCode).json({
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: message,
          requestId: req.requestId,
          timestamp: new Date().toISOString()
        }
      });
    };
  }

  /**
   * Complete security middleware stack for production
   */
  getProductionMiddleware() {
    return [
      this.getIpFilter(),
      this.getSecurityHeaders(),
      this.getCorsConfig(),
      this.getApiRateLimit(),
      this.getCustomHeaders(),
      this.getRequestSizeLimit(),
      this.getSecurityEventDetector(),
      this.getRequestLogger()
    ];
  }

  /**
   * Development middleware stack (relaxed security)
   */
  getDevelopmentMiddleware() {
    return [
      this.getCorsConfig(),
      this.getCustomHeaders(),
      this.getRequestSizeLimit(50 * 1024 * 1024), // 50MB for development
      this.getRequestLogger()
    ];
  }
}

// Create singleton instance
const securityMiddleware = new SecurityMiddleware();

module.exports = {
  getSecurityHeaders: () => securityMiddleware.getSecurityHeaders(),
  getCorsConfig: () => securityMiddleware.getCorsConfig(),
  getApiRateLimit: () => securityMiddleware.getApiRateLimit(),
  getAuthRateLimit: () => securityMiddleware.getAuthRateLimit(),
  getSensitiveRateLimit: () => securityMiddleware.getSensitiveRateLimit(),
  getIpFilter: () => securityMiddleware.getIpFilter(),
  getCustomHeaders: () => securityMiddleware.getCustomHeaders(),
  getRequestSizeLimit: (maxSize) => securityMiddleware.getRequestSizeLimit(maxSize),
  getRequestLogger: () => securityMiddleware.getRequestLogger(),
  getSecurityEventDetector: () => securityMiddleware.getSecurityEventDetector(),
  getErrorHandler: () => securityMiddleware.getErrorHandler(),
  getProductionMiddleware: () => securityMiddleware.getProductionMiddleware(),
  getDevelopmentMiddleware: () => securityMiddleware.getDevelopmentMiddleware(),
  SecurityMiddleware,
  // Export instance for initialization
  securityMiddleware
};
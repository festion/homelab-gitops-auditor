const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { auditLogger } = require('../utils/auditLogger');

class EnhancedSecurityMiddleware {
  constructor() {
    // IP whitelist/blacklist management
    this.ipWhitelist = new Set();
    this.ipBlacklist = new Set();
    
    // Rate limiting stores
    this.rateLimitAttempts = new Map();
    this.ddosAttempts = new Map();
    
    // Security event tracking
    this.securityEvents = new Map();
    
    // DDoS detection thresholds
    this.ddosThresholds = {
      requests: 100,        // requests per minute
      connections: 50,      // concurrent connections
      windowMs: 60 * 1000   // 1 minute
    };

    // Initialize environment-based IP lists
    this.initializeIpLists();
  }

  initializeIpLists() {
    // Load IP whitelist from environment
    if (process.env.IP_WHITELIST) {
      process.env.IP_WHITELIST.split(',').forEach(ip => {
        this.ipWhitelist.add(ip.trim());
      });
    }

    // Load IP blacklist from environment
    if (process.env.IP_BLACKLIST) {
      process.env.IP_BLACKLIST.split(',').forEach(ip => {
        this.ipBlacklist.add(ip.trim());
      });
    }

    // Add default safe IPs to whitelist
    this.ipWhitelist.add('127.0.0.1');
    this.ipWhitelist.add('::1');
    this.ipWhitelist.add('localhost');
  }

  // Enhanced CORS with dynamic origin validation
  enhancedCors() {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'];

    // Add environment-specific origins
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    return cors({
      origin: async (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Check if origin is in allowed list
        if (allowedOrigins.some(allowed => {
          if (allowed === origin) return true;
          if (allowed.includes('*')) {
            const pattern = allowed.replace(/\*/g, '.*');
            return new RegExp(`^${pattern}$`).test(origin);
          }
          return false;
        })) {
          return callback(null, true);
        }

        // Log CORS violation
        await auditLogger.log('cors_violation', {
          origin: origin,
          allowedOrigins: allowedOrigins,
          timestamp: new Date().toISOString()
        });

        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Forwarded-For',
        'X-Real-IP',
        'X-CSRF-Token',
        'X-Client-Version',
        'X-Request-ID'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Total-Count',
        'X-API-Version'
      ],
      maxAge: 86400 // 24 hours
    });
  }

  // Enhanced security headers with CSP
  enhancedHelmet() {
    return helmet({
      // Comprehensive Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Allow inline styles for dynamic components
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net"
          ],
          scriptSrc: [
            "'self'",
            "'unsafe-eval'", // Required for some chart libraries
            "https://cdn.jsdelivr.net",
            "https://unpkg.com"
          ],
          imgSrc: [
            "'self'",
            "data:",
            "https:",
            "blob:"
          ],
          connectSrc: [
            "'self'",
            "https://api.github.com",
            "wss:",
            "ws:"
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "data:"
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
      },
      
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      
      // Additional security headers
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hidePoweredBy: true,
      dnsPrefetchControl: { allow: false },
      ieNoOpen: true,
      
      // Expect-CT for certificate transparency
      expectCt: {
        maxAge: 86400,
        enforce: process.env.NODE_ENV === 'production'
      },

      // Feature Policy / Permissions Policy
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        fullscreen: ['self']
      }
    });
  }

  // IP filtering middleware
  ipFilter() {
    return async (req, res, next) => {
      try {
        const clientIp = this.getClientIp(req);
        
        // Check blacklist first
        if (this.isIpBlacklisted(clientIp)) {
          await auditLogger.log('ip_blocked', {
            ip: clientIp,
            reason: 'blacklisted',
            endpoint: req.path,
            userAgent: req.get('User-Agent')
          });

          return res.status(403).json({
            error: 'Access denied',
            message: 'Your IP address is blocked'
          });
        }

        // Check whitelist if enabled
        if (process.env.ENABLE_IP_WHITELIST === 'true' && !this.isIpWhitelisted(clientIp)) {
          await auditLogger.log('ip_blocked', {
            ip: clientIp,
            reason: 'not_whitelisted',
            endpoint: req.path,
            userAgent: req.get('User-Agent')
          });

          return res.status(403).json({
            error: 'Access denied',
            message: 'Your IP address is not allowed'
          });
        }

        // Add IP to request for further processing
        req.clientIp = clientIp;
        next();
      } catch (error) {
        await auditLogger.log('ip_filter_error', {
          error: error.message,
          ip: req.ip
        });
        next();
      }
    };
  }

  // Enhanced DDoS protection
  ddosProtection() {
    return async (req, res, next) => {
      try {
        const clientIp = req.clientIp || this.getClientIp(req);
        const now = Date.now();
        const windowStart = now - this.ddosThresholds.windowMs;

        // Get or initialize tracking for this IP
        let ipTracking = this.ddosAttempts.get(clientIp) || {
          requests: [],
          connections: 0,
          lastSeen: now
        };

        // Clean old requests
        ipTracking.requests = ipTracking.requests.filter(timestamp => timestamp > windowStart);
        
        // Add current request
        ipTracking.requests.push(now);
        ipTracking.lastSeen = now;
        ipTracking.connections++;

        // Check thresholds
        if (ipTracking.requests.length > this.ddosThresholds.requests) {
          await auditLogger.log('ddos_detected', {
            ip: clientIp,
            requests: ipTracking.requests.length,
            threshold: this.ddosThresholds.requests,
            endpoint: req.path,
            userAgent: req.get('User-Agent')
          });

          // Temporarily blacklist IP
          this.ipBlacklist.add(clientIp);
          
          // Remove from blacklist after 1 hour
          setTimeout(() => {
            this.ipBlacklist.delete(clientIp);
          }, 60 * 60 * 1000);

          return res.status(429).json({
            error: 'Too many requests',
            message: 'DDoS protection activated. Your IP has been temporarily blocked.',
            retryAfter: 3600
          });
        }

        // Update tracking
        this.ddosAttempts.set(clientIp, ipTracking);

        // Clean up old tracking data
        this.cleanupDdosTracking();

        next();
      } catch (error) {
        await auditLogger.log('ddos_protection_error', {
          error: error.message,
          ip: req.ip
        });
        next();
      }
    };
  }

  // Enhanced rate limiting with multiple tiers
  createEnhancedRateLimit(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100,
      message = 'Too many requests',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      tier = 'default'
    } = options;

    return rateLimit({
      windowMs,
      max,
      message: {
        error: 'Rate limit exceeded',
        message,
        tier,
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests,
      keyGenerator: (req) => {
        // Use IP + User-Agent for more specific tracking
        const ip = req.clientIp || this.getClientIp(req);
        const userAgent = req.get('User-Agent') || 'unknown';
        return `${tier}-${ip}-${Buffer.from(userAgent).toString('base64').slice(0, 20)}`;
      },
      skip: (req) => {
        const ip = req.clientIp || this.getClientIp(req);
        // Skip for whitelisted IPs
        return this.isIpWhitelisted(ip) || 
               (process.env.NODE_ENV === 'development' && (ip === '127.0.0.1' || ip === '::1'));
      },
      onLimitReached: async (req, res, options) => {
        const ip = req.clientIp || this.getClientIp(req);
        await auditLogger.log('rate_limit_exceeded', {
          ip,
          endpoint: req.path,
          method: req.method,
          tier,
          limit: max,
          windowMs,
          userAgent: req.get('User-Agent')
        });
      }
    });
  }

  // Specific rate limiters
  generalApiRateLimit() {
    return this.createEnhancedRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000,
      message: 'Too many API requests from this IP',
      tier: 'api'
    });
  }

  authRateLimit() {
    return this.createEnhancedRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      message: 'Too many authentication attempts',
      skipSuccessfulRequests: true,
      tier: 'auth'
    });
  }

  sensitiveRateLimit() {
    return this.createEnhancedRateLimit({
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 10,
      message: 'Too many sensitive operations',
      tier: 'sensitive'
    });
  }

  deploymentRateLimit() {
    return this.createEnhancedRateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 3,
      message: 'Too many deployment operations',
      tier: 'deployment'
    });
  }

  // Enhanced custom headers
  enhancedCustomHeaders() {
    return async (req, res, next) => {
      try {
        // Security headers
        res.setHeader('X-API-Version', process.env.API_VERSION || 'v2.0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Download-Options', 'noopen');
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Remove server information
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
        
        // Rate limit headers
        const ip = req.clientIp || this.getClientIp(req);
        const rateLimitInfo = this.getRateLimitInfo(ip);
        if (rateLimitInfo) {
          res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit);
          res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining);
          res.setHeader('X-RateLimit-Reset', rateLimitInfo.reset);
        }
        
        // Request tracking
        const requestId = req.get('X-Request-ID') || this.generateRequestId();
        res.setHeader('X-Request-ID', requestId);
        req.requestId = requestId;
        
        // Cache control for different endpoints
        if (req.path.startsWith('/api/auth')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (req.path.startsWith('/api/')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        
        // Performance timing
        req.startTime = Date.now();
        
        next();
      } catch (error) {
        await auditLogger.log('header_middleware_error', {
          error: error.message,
          ip: req.ip
        });
        next();
      }
    };
  }

  // Enhanced request validation
  enhancedRequestValidation() {
    return async (req, res, next) => {
      try {
        // Request size validation
        const maxSize = process.env.MAX_REQUEST_SIZE || 10 * 1024 * 1024; // 10MB
        
        if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
          await auditLogger.log('request_too_large', {
            ip: req.clientIp || this.getClientIp(req),
            size: req.headers['content-length'],
            maxSize,
            endpoint: req.path
          });

          return res.status(413).json({
            error: 'Payload too large',
            message: `Request body exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
          });
        }

        // User-Agent validation
        const userAgent = req.get('User-Agent');
        if (!userAgent || userAgent.length > 1000) {
          await auditLogger.log('invalid_user_agent', {
            ip: req.clientIp || this.getClientIp(req),
            userAgent: userAgent ? userAgent.substring(0, 100) + '...' : 'missing',
            endpoint: req.path
          });

          return res.status(400).json({
            error: 'Bad request',
            message: 'Invalid or missing User-Agent header'
          });
        }

        // Host header validation
        const host = req.get('Host');
        const allowedHosts = process.env.ALLOWED_HOSTS ? 
          process.env.ALLOWED_HOSTS.split(',') : 
          ['localhost', '127.0.0.1', req.hostname];

        if (host && !allowedHosts.some(allowed => host.includes(allowed))) {
          await auditLogger.log('invalid_host_header', {
            ip: req.clientIp || this.getClientIp(req),
            host,
            allowedHosts,
            endpoint: req.path
          });

          return res.status(400).json({
            error: 'Bad request',
            message: 'Invalid Host header'
          });
        }

        // Method validation
        const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
        if (!allowedMethods.includes(req.method)) {
          await auditLogger.log('invalid_method', {
            ip: req.clientIp || this.getClientIp(req),
            method: req.method,
            endpoint: req.path
          });

          return res.status(405).json({
            error: 'Method not allowed',
            message: `Method ${req.method} is not allowed`
          });
        }

        next();
      } catch (error) {
        await auditLogger.log('request_validation_error', {
          error: error.message,
          ip: req.ip
        });
        next();
      }
    };
  }

  // Utility methods
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip ||
           'unknown';
  }

  isIpWhitelisted(ip) {
    return this.ipWhitelist.has(ip) || 
           Array.from(this.ipWhitelist).some(whiteIp => {
             if (whiteIp.includes('/')) {
               // CIDR notation support (basic)
               return this.ipInCidr(ip, whiteIp);
             }
             return false;
           });
  }

  isIpBlacklisted(ip) {
    return this.ipBlacklist.has(ip) ||
           Array.from(this.ipBlacklist).some(blackIp => {
             if (blackIp.includes('/')) {
               // CIDR notation support (basic)
               return this.ipInCidr(ip, blackIp);
             }
             return false;
           });
  }

  ipInCidr(ip, cidr) {
    // Basic CIDR check - in production, use a proper library like 'ip-range-check'
    try {
      const [network, mask] = cidr.split('/');
      // This is a simplified implementation
      return ip.startsWith(network.split('.').slice(0, Math.floor(parseInt(mask) / 8)).join('.'));
    } catch {
      return false;
    }
  }

  generateRequestId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  getRateLimitInfo(ip) {
    // Implementation would depend on rate limiter used
    return null;
  }

  cleanupDdosTracking() {
    const now = Date.now();
    const cutoff = now - (this.ddosThresholds.windowMs * 2);

    for (const [ip, tracking] of this.ddosAttempts.entries()) {
      if (tracking.lastSeen < cutoff) {
        this.ddosAttempts.delete(ip);
      }
    }
  }

  // IP management methods
  addToWhitelist(ip) {
    this.ipWhitelist.add(ip);
  }

  removeFromWhitelist(ip) {
    this.ipWhitelist.delete(ip);
  }

  addToBlacklist(ip) {
    this.ipBlacklist.add(ip);
  }

  removeFromBlacklist(ip) {
    this.ipBlacklist.delete(ip);
  }

  getWhitelist() {
    return Array.from(this.ipWhitelist);
  }

  getBlacklist() {
    return Array.from(this.ipBlacklist);
  }
}

module.exports = new EnhancedSecurityMiddleware();
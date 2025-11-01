const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

class Security {
  constructor(config = {}) {
    this.config = config;
    this.tokenCache = new Map();
    this.ipWhitelist = new Set(config.security?.ipWhitelist || []);
    this.blockedIPs = new Set();
    this.suspiciousActivity = new Map();
    
    // Security configuration
    this.maxFailedAttempts = config.security?.maxFailedAttempts || 5;
    this.blockDuration = config.security?.blockDuration || 300000; // 5 minutes
    this.tokenExpiry = config.security?.tokenExpiry || 3600000; // 1 hour
    
    this.setupCleanupInterval();
  }

  setupCleanupInterval() {
    // Clean up expired tokens and unblock IPs every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
      this.cleanupBlockedIPs();
    }, 300000);
  }

  createRateLimiter(options = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
      },
      skip: (req) => {
        // Skip rate limiting for whitelisted IPs
        return this.isIPWhitelisted(req.ip);
      },
      onLimitReached: (req) => {
        this.recordSuspiciousActivity(req.ip, 'rate_limit_exceeded');
      }
    };

    return rateLimit({ ...defaultOptions, ...options });
  }

  createStrictRateLimiter() {
    return this.createRateLimiter({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 10, // very strict limit
      message: {
        error: 'API rate limit exceeded. This endpoint has strict limits.',
        retryAfter: 300
      }
    });
  }

  createWebhookRateLimiter() {
    return this.createRateLimiter({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // Allow burst webhook activity
      message: {
        error: 'Webhook rate limit exceeded.',
        retryAfter: 60
      }
    });
  }

  getHelmetConfiguration() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: {
        policy: "strict-origin-when-cross-origin"
      }
    });
  }

  validateWebhookSignature(signature, payload, secret) {
    if (!signature || !secret) {
      throw new Error('Missing signature or secret');
    }

    if (!signature.startsWith('sha256=')) {
      throw new Error('Invalid signature format');
    }

    const expectedSignature = this.calculateHMAC(payload, secret);
    const providedSignature = signature.replace('sha256=', '');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  calculateHMAC(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload), 'utf8');
    return hmac.digest('hex');
  }

  generateSecureToken(payload = {}, expiresIn = null) {
    const tokenId = crypto.randomUUID();
    const now = Date.now();
    const expiry = expiresIn ? now + expiresIn : now + this.tokenExpiry;
    
    const token = {
      id: tokenId,
      payload,
      createdAt: now,
      expiresAt: expiry
    };
    
    this.tokenCache.set(tokenId, token);
    
    return tokenId;
  }

  validateToken(tokenId) {
    const token = this.tokenCache.get(tokenId);
    
    if (!token) {
      throw new Error('Invalid token');
    }
    
    if (Date.now() > token.expiresAt) {
      this.tokenCache.delete(tokenId);
      throw new Error('Token expired');
    }
    
    return token;
  }

  revokeToken(tokenId) {
    return this.tokenCache.delete(tokenId);
  }

  cleanupExpiredTokens() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [tokenId, token] of this.tokenCache) {
      if (now > token.expiresAt) {
        this.tokenCache.delete(tokenId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired tokens`);
    }
  }

  isIPWhitelisted(ip) {
    return this.ipWhitelist.has(ip);
  }

  isIPBlocked(ip) {
    const blockInfo = this.blockedIPs.get ? this.blockedIPs.get(ip) : this.blockedIPs.has(ip);
    
    if (!blockInfo) return false;
    
    // If blockedIPs is a Map (with expiry), check if block has expired
    if (this.blockedIPs.get) {
      return Date.now() < blockInfo.until;
    }
    
    // If blockedIPs is a Set (permanent blocks)
    return true;
  }

  blockIP(ip, duration = null) {
    const blockDuration = duration || this.blockDuration;
    const until = Date.now() + blockDuration;
    
    if (!this.blockedIPs.set) {
      // Convert Set to Map if needed
      const oldBlocked = [...this.blockedIPs];
      this.blockedIPs = new Map();
      oldBlocked.forEach(blockedIP => {
        this.blockedIPs.set(blockedIP, { until: Date.now() + this.blockDuration });
      });
    }
    
    this.blockedIPs.set(ip, { until, reason: 'security_violation' });
    
    console.log(`Blocked IP ${ip} until ${new Date(until).toISOString()}`);
  }

  unblockIP(ip) {
    if (this.blockedIPs.delete) {
      return this.blockedIPs.delete(ip);
    } else {
      this.blockedIPs.delete(ip);
      return true;
    }
  }

  cleanupBlockedIPs() {
    if (!this.blockedIPs.forEach) return; // Not a Map
    
    const now = Date.now();
    let unblocked = 0;
    
    for (const [ip, blockInfo] of this.blockedIPs) {
      if (now >= blockInfo.until) {
        this.blockedIPs.delete(ip);
        unblocked++;
      }
    }
    
    if (unblocked > 0) {
      console.log(`Unblocked ${unblocked} IPs`);
    }
  }

  recordSuspiciousActivity(ip, activity, metadata = {}) {
    if (!this.suspiciousActivity.has(ip)) {
      this.suspiciousActivity.set(ip, []);
    }
    
    const activities = this.suspiciousActivity.get(ip);
    activities.push({
      activity,
      timestamp: Date.now(),
      metadata
    });
    
    // Keep only recent activities (last hour)
    const oneHourAgo = Date.now() - 3600000;
    const recentActivities = activities.filter(a => a.timestamp > oneHourAgo);
    this.suspiciousActivity.set(ip, recentActivities);
    
    // Check if IP should be blocked
    if (recentActivities.length >= this.maxFailedAttempts) {
      this.blockIP(ip);
      console.log(`IP ${ip} blocked due to suspicious activity: ${activity}`);
    }
  }

  getSuspiciousActivity(ip) {
    return this.suspiciousActivity.get(ip) || [];
  }

  createSecurityMiddleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      
      // Check if IP is blocked
      if (this.isIPBlocked(ip)) {
        this.recordSuspiciousActivity(ip, 'blocked_ip_access_attempt');
        return res.status(403).json({
          error: 'Access denied',
          reason: 'IP blocked due to security violations',
          timestamp: new Date().toISOString()
        });
      }
      
      // Add security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      
      // Track request for security monitoring
      req.securityContext = {
        ip,
        timestamp: Date.now(),
        userAgent: req.get('User-Agent'),
        isWhitelisted: this.isIPWhitelisted(ip)
      };
      
      next();
    };
  }

  createWebhookSecurityMiddleware(secret) {
    return (req, res, next) => {
      const signature = req.get('X-Hub-Signature-256');
      const event = req.get('X-GitHub-Event');
      const delivery = req.get('X-GitHub-Delivery');
      
      // Basic validation
      if (!signature || !event || !delivery) {
        this.recordSuspiciousActivity(req.ip, 'incomplete_webhook_headers');
        return res.status(400).json({
          error: 'Missing required webhook headers',
          timestamp: new Date().toISOString()
        });
      }
      
      // Validate signature
      try {
        const isValid = this.validateWebhookSignature(signature, req.body, secret);
        
        if (!isValid) {
          this.recordSuspiciousActivity(req.ip, 'invalid_webhook_signature', {
            event,
            delivery
          });
          
          return res.status(401).json({
            error: 'Invalid webhook signature',
            timestamp: new Date().toISOString()
          });
        }
        
        req.webhookContext = {
          signature,
          event,
          delivery,
          validated: true
        };
        
        next();
        
      } catch (error) {
        this.recordSuspiciousActivity(req.ip, 'webhook_validation_error', {
          error: error.message
        });
        
        return res.status(400).json({
          error: 'Webhook validation failed',
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>\"']/g, '') // Basic XSS prevention
      .replace(/[;&|`$]/g, '') // Command injection prevention
      .trim();
  }

  validateOrigin(origin, allowedOrigins) {
    if (!origin) return false;
    if (!allowedOrigins || allowedOrigins.length === 0) return true;
    
    return allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        return origin.endsWith(domain);
      }
      return origin === allowed;
    });
  }

  generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateCSRFToken(token, sessionToken) {
    if (!token || !sessionToken) return false;
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(sessionToken, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  getSecurityStats() {
    return {
      whitelistedIPs: this.ipWhitelist.size,
      blockedIPs: this.blockedIPs.size,
      activeTokens: this.tokenCache.size,
      suspiciousActivityEntries: this.suspiciousActivity.size,
      maxFailedAttempts: this.maxFailedAttempts,
      blockDuration: this.blockDuration,
      tokenExpiry: this.tokenExpiry
    };
  }

  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.tokenCache.clear();
    this.blockedIPs.clear();
    this.suspiciousActivity.clear();
    
    console.log('Security service cleaned up');
  }
}

module.exports = Security;
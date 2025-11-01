const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

/**
 * Security middleware configuration
 */
class SecurityMiddleware {
  /**
   * Configure CORS middleware
   */
  static cors() {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000', 'http://localhost:5173']; // Default for dev

    return cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Forwarded-For'
      ]
    });
  }

  /**
   * Configure Helmet security headers
   */
  static helmet() {
    return helmet({
      // Content Security Policy
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
      
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      
      // Prevent MIME type sniffing
      noSniff: true,
      
      // X-Frame-Options
      frameguard: { action: 'deny' },
      
      // X-XSS-Protection
      xssFilter: true,
      
      // Referrer Policy
      referrerPolicy: { policy: 'same-origin' },
      
      // Hide X-Powered-By header
      hidePoweredBy: true,
      
      // DNS Prefetch Control
      dnsPrefetchControl: { allow: false },
      
      // Don't cache sensitive content
      noCache: false,
      
      // Expect-CT header
      expectCt: {
        maxAge: 86400,
        enforce: true
      }
    });
  }

  /**
   * General API rate limiting
   */
  static apiRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for local development
        return process.env.NODE_ENV === 'development' && 
               (req.ip === '127.0.0.1' || req.ip === '::1');
      }
    });
  }

  /**
   * Strict rate limiting for authentication endpoints
   */
  static authRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 login attempts per windowMs
      message: {
        error: 'Too many authentication attempts',
        message: 'Too many authentication attempts from this IP, please try again later.',
        retryAfter: 15 * 60 // 15 minutes in seconds
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful requests
      skipFailedRequests: false,    // Do count failed requests
      keyGenerator: (req) => {
        // Use a combination of IP and User-Agent for more specific tracking
        return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
      }
    });
  }

  /**
   * Rate limiting for sensitive operations
   */
  static sensitiveRateLimit() {
    return rateLimit({
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 10, // Limit each IP to 10 sensitive operations per windowMs
      message: {
        error: 'Too many sensitive operations',
        message: 'Too many sensitive operations from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  /**
   * Custom security headers middleware
   */
  static customHeaders() {
    return (req, res, next) => {
      // API-specific headers
      res.setHeader('X-API-Version', 'v2');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Download-Options', 'noopen');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      
      // Remove server information
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      // Cache control for API responses
      if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      
      next();
    };
  }

  /**
   * Request logging middleware
   */
  static requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Log request
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      
      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          `${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
        );
      });
      
      next();
    };
  }

  /**
   * Input validation middleware
   */
  static inputValidation() {
    return (req, res, next) => {
      // Limit request body size (already handled by express.json() but good to be explicit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
        return res.status(413).json({
          error: 'Payload too large',
          message: 'Request body exceeds maximum allowed size'
        });
      }
      
      // Basic header validation
      const userAgent = req.get('User-Agent');
      if (userAgent && userAgent.length > 1000) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid User-Agent header'
        });
      }
      
      next();
    };
  }

  /**
   * Error handling middleware
   */
  static errorHandler() {
    return (err, req, res, next) => {
      // Log error
      console.error(`Error on ${req.method} ${req.path}:`, err);
      
      // Handle CORS errors
      if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'CORS policy violation'
        });
      }
      
      // Handle rate limit errors
      if (err.status === 429) {
        return res.status(429).json({
          error: 'Too many requests',
          message: err.message || 'Rate limit exceeded'
        });
      }
      
      // Handle JWT errors
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token'
        });
      }
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token expired'
        });
      }
      
      // Handle validation errors
      if (err.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation error',
          message: err.message
        });
      }
      
      // Generic error response (don't expose internal errors)
      res.status(err.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    };
  }

  /**
   * Security configuration for production
   */
  static productionSecurity() {
    const middleware = [];
    
    // Add all security middleware for production
    middleware.push(this.helmet());
    middleware.push(this.cors());
    middleware.push(this.apiRateLimit());
    middleware.push(this.customHeaders());
    middleware.push(this.inputValidation());
    
    if (process.env.NODE_ENV === 'production') {
      middleware.push(this.requestLogger());
    }
    
    return middleware;
  }

  /**
   * Security configuration for development
   */
  static developmentSecurity() {
    const middleware = [];
    
    // Relaxed security for development
    middleware.push(this.cors());
    middleware.push(this.customHeaders());
    middleware.push(this.inputValidation());
    middleware.push(this.requestLogger());
    
    return middleware;
  }
}

module.exports = SecurityMiddleware;
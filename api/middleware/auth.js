const AuthService = require('../services/auth/authService');
const { Permission } = require('../models/user');

/**
 * Authentication middleware for Express.js
 */
class AuthMiddleware {
  constructor() {
    this.authService = new AuthService();
  }

  /**
   * JWT authentication middleware
   */
  authenticateJWT = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No authorization header provided' 
        });
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!token) {
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No token provided' 
        });
      }

      const { user, decoded } = await this.authService.verifyToken(token);
      
      // Attach user and token info to request
      req.user = user;
      req.auth = {
        type: 'jwt',
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        tokenPayload: decoded
      };

      // Log successful authentication
      await this.authService.logAuthEvent(
        user.id, 
        user.username, 
        'jwt_auth', 
        true, 
        { endpoint: req.path, method: req.method },
        req
      );

      next();
    } catch (error) {
      console.error('JWT authentication error:', error.message);
      
      // Log failed authentication
      await this.authService.logAuthEvent(
        null, 
        null, 
        'jwt_auth', 
        false, 
        { error: error.message, endpoint: req.path, method: req.method },
        req
      );

      return res.status(401).json({ 
        error: 'Access denied', 
        message: 'Invalid or expired token' 
      });
    }
  };

  /**
   * API key authentication middleware
   */
  authenticateApiKey = async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No API key provided' 
        });
      }

      const keyData = await this.authService.verifyApiKey(apiKey);
      
      // Attach API key info to request
      req.auth = {
        type: 'api_key',
        keyId: keyData.id,
        keyName: keyData.name,
        permissions: keyData.permissions,
        keyData: keyData
      };

      // Log successful authentication
      await this.authService.logAuthEvent(
        null, 
        keyData.name, 
        'api_key_auth', 
        true, 
        { endpoint: req.path, method: req.method, keyId: keyData.id },
        req
      );

      next();
    } catch (error) {
      console.error('API key authentication error:', error.message);
      
      // Log failed authentication
      await this.authService.logAuthEvent(
        null, 
        null, 
        'api_key_auth', 
        false, 
        { error: error.message, endpoint: req.path, method: req.method },
        req
      );

      return res.status(401).json({ 
        error: 'Access denied', 
        message: 'Invalid or expired API key' 
      });
    }
  };

  /**
   * Combined authentication middleware (tries JWT first, then API key)
   */
  authenticate = async (req, res, next) => {
    // Try JWT authentication first
    if (req.headers.authorization) {
      return this.authenticateJWT(req, res, next);
    }
    
    // Try API key authentication
    if (req.headers['x-api-key']) {
      return this.authenticateApiKey(req, res, next);
    }

    // No authentication provided
    return res.status(401).json({ 
      error: 'Access denied', 
      message: 'No authentication provided. Use Authorization header (Bearer token) or X-API-Key header' 
    });
  };

  /**
   * Optional authentication middleware (doesn't fail if no auth provided)
   */
  authenticateOptional = async (req, res, next) => {
    try {
      // Try JWT authentication first
      if (req.headers.authorization) {
        return this.authenticateJWT(req, res, next);
      }
      
      // Try API key authentication
      if (req.headers['x-api-key']) {
        return this.authenticateApiKey(req, res, next);
      }

      // No authentication provided - continue without auth
      req.auth = null;
      next();
    } catch (error) {
      // Authentication failed but it's optional - continue without auth
      req.auth = null;
      next();
    }
  };

  /**
   * Authorization middleware factory
   * Creates middleware to check specific permissions
   */
  authorize = (resource, action) => {
    return async (req, res, next) => {
      try {
        if (!req.auth) {
          return res.status(401).json({ 
            error: 'Access denied', 
            message: 'Authentication required' 
          });
        }

        const hasPermission = this.authService.checkPermission(req.auth, resource, action);
        
        if (!hasPermission) {
          // Log authorization failure
          await this.authService.logAuthEvent(
            req.auth.userId || null,
            req.auth.username || req.auth.keyName || null,
            'authorization_denied',
            false,
            { 
              resource, 
              action, 
              endpoint: req.path, 
              method: req.method,
              userPermissions: req.auth.permissions 
            },
            req
          );

          return res.status(403).json({ 
            error: 'Forbidden', 
            message: `Insufficient permissions. Required: ${resource}:${action}` 
          });
        }

        // Log successful authorization
        await this.authService.logAuthEvent(
          req.auth.userId || null,
          req.auth.username || req.auth.keyName || null,
          'authorization_granted',
          true,
          { resource, action, endpoint: req.path, method: req.method },
          req
        );

        next();
      } catch (error) {
        console.error('Authorization error:', error.message);
        return res.status(500).json({ 
          error: 'Internal server error', 
          message: 'Authorization check failed' 
        });
      }
    };
  };

  /**
   * Role-based authorization middleware
   */
  requireRole = (requiredRole) => {
    return async (req, res, next) => {
      try {
        if (!req.auth) {
          return res.status(401).json({ 
            error: 'Access denied', 
            message: 'Authentication required' 
          });
        }

        // API keys don't have roles, only users do
        if (req.auth.type !== 'jwt') {
          return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'User authentication required for this operation' 
          });
        }

        if (req.auth.role !== requiredRole && req.auth.role !== 'admin') {
          return res.status(403).json({ 
            error: 'Forbidden', 
            message: `Required role: ${requiredRole}` 
          });
        }

        next();
      } catch (error) {
        console.error('Role authorization error:', error.message);
        return res.status(500).json({ 
          error: 'Internal server error', 
          message: 'Role check failed' 
        });
      }
    };
  };

  /**
   * Admin-only middleware
   */
  requireAdmin = () => {
    return this.requireRole('admin');
  };

  /**
   * Rate limiting middleware for authentication endpoints
   */
  rateLimitAuth = () => {
    const attempts = new Map();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_ATTEMPTS = 5;

    return (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      
      // Clean old entries
      const cutoff = now - WINDOW_MS;
      for (const [ip, data] of attempts.entries()) {
        if (data.firstAttempt < cutoff) {
          attempts.delete(ip);
        }
      }

      // Check current attempts
      const current = attempts.get(key);
      if (current && current.count >= MAX_ATTEMPTS) {
        return res.status(429).json({
          error: 'Too many attempts',
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: Math.ceil((current.firstAttempt + WINDOW_MS - now) / 1000)
        });
      }

      // Track this attempt
      if (current) {
        current.count++;
      } else {
        attempts.set(key, { count: 1, firstAttempt: now });
      }

      next();
    };
  };
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

// Export individual middleware functions
module.exports = {
  authenticate: authMiddleware.authenticate,
  authenticateJWT: authMiddleware.authenticateJWT,
  authenticateApiKey: authMiddleware.authenticateApiKey,
  authenticateOptional: authMiddleware.authenticateOptional,
  authorize: authMiddleware.authorize,
  requireRole: authMiddleware.requireRole,
  requireAdmin: authMiddleware.requireAdmin,
  rateLimitAuth: authMiddleware.rateLimitAuth,
  AuthMiddleware
};
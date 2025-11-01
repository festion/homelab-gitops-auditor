const AuthService = require('../services/auth/authService');
const { Permission } = require('../models/user');

/**
 * Enhanced Authentication middleware for Express.js
 * Provides JWT and API key authentication with comprehensive security features
 */
class EnhancedAuthMiddleware {
  constructor() {
    this.authService = new AuthService();
    this.failedAttempts = new Map(); // Track failed authentication attempts
    this.securityConfig = {
      maxFailedAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      tokenRefreshThreshold: 10 * 60 * 1000, // 10 minutes before expiry
      ipWhitelist: process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : [],
      ipBlacklist: process.env.IP_BLACKLIST ? process.env.IP_BLACKLIST.split(',') : []
    };
  }

  /**
   * Enhanced JWT authentication middleware with security features
   */
  authenticateJWT = async (req, res, next) => {
    try {
      // IP filtering
      if (!this.isIpAllowed(req.ip)) {
        await this.logSecurityEvent('ip_blocked', { ip: req.ip, endpoint: req.path }, req);
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'Your IP address is not allowed' 
        });
      }

      // Rate limiting check
      if (this.isRateLimited(req.ip)) {
        await this.logSecurityEvent('rate_limited', { ip: req.ip, endpoint: req.path }, req);
        return res.status(429).json({ 
          error: 'Too many attempts', 
          message: 'Too many authentication attempts. Please try again later.' 
        });
      }

      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        await this.recordFailedAttempt(req.ip, 'missing_auth_header');
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No authorization header provided' 
        });
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!token) {
        await this.recordFailedAttempt(req.ip, 'missing_token');
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No token provided' 
        });
      }

      const { user, decoded } = await this.authService.verifyToken(token);
      
      // Check for token refresh needs
      const timeToExpiry = decoded.exp * 1000 - Date.now();
      const needsRefresh = timeToExpiry < this.securityConfig.tokenRefreshThreshold;
      
      // Attach enhanced user and token info to request
      req.user = user;
      req.auth = {
        type: 'jwt',
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        tokenPayload: decoded,
        needsRefresh: needsRefresh,
        expiresAt: new Date(decoded.exp * 1000),
        issuedAt: new Date(decoded.iat * 1000)
      };

      // Clear failed attempts on successful authentication
      this.clearFailedAttempts(req.ip);

      // Log successful authentication with enhanced details
      await this.authService.logAuthEvent(
        user.id, 
        user.username, 
        'jwt_auth_success', 
        true, 
        { 
          endpoint: req.path, 
          method: req.method,
          userAgent: req.get('User-Agent'),
          tokenId: decoded.jti,
          needsRefresh: needsRefresh
        },
        req
      );

      // Add refresh token header if needed
      if (needsRefresh) {
        res.setHeader('X-Token-Refresh-Needed', 'true');
        res.setHeader('X-Token-Expires-In', Math.floor(timeToExpiry / 1000));
      }

      next();
    } catch (error) {
      await this.recordFailedAttempt(req.ip, 'invalid_token', error.message);
      
      // Log failed authentication with detailed error info
      await this.authService.logAuthEvent(
        null, 
        null, 
        'jwt_auth_failure', 
        false, 
        { 
          error: error.message, 
          endpoint: req.path, 
          method: req.method,
          userAgent: req.get('User-Agent'),
          errorType: this.getTokenErrorType(error)
        },
        req
      );

      return res.status(401).json({ 
        error: 'Access denied', 
        message: 'Invalid or expired token',
        code: this.getTokenErrorCode(error)
      });
    }
  };

  /**
   * Enhanced API key authentication middleware
   */
  authenticateApiKey = async (req, res, next) => {
    try {
      // IP filtering
      if (!this.isIpAllowed(req.ip)) {
        await this.logSecurityEvent('ip_blocked', { ip: req.ip, endpoint: req.path }, req);
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'Your IP address is not allowed' 
        });
      }

      const apiKey = req.headers['x-api-key'] || req.query.apiKey;

      if (!apiKey) {
        await this.recordFailedAttempt(req.ip, 'missing_api_key');
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'No API key provided' 
        });
      }

      // Validate API key format
      if (!this.isValidApiKeyFormat(apiKey)) {
        await this.recordFailedAttempt(req.ip, 'invalid_api_key_format');
        return res.status(401).json({ 
          error: 'Access denied', 
          message: 'Invalid API key format' 
        });
      }

      const keyData = await this.authService.verifyApiKey(apiKey);
      
      // Attach enhanced API key info to request
      req.auth = {
        type: 'api_key',
        keyId: keyData.id,
        keyName: keyData.name,
        permissions: keyData.permissions,
        keyData: keyData,
        createdAt: keyData.createdAt,
        lastUsed: keyData.lastUsed,
        expiresAt: keyData.expiresAt
      };

      // Clear failed attempts on successful authentication
      this.clearFailedAttempts(req.ip);

      // Log successful authentication
      await this.authService.logAuthEvent(
        null, 
        keyData.name, 
        'api_key_auth_success', 
        true, 
        { 
          endpoint: req.path, 
          method: req.method, 
          keyId: keyData.id,
          userAgent: req.get('User-Agent')
        },
        req
      );

      next();
    } catch (error) {
      await this.recordFailedAttempt(req.ip, 'invalid_api_key', error.message);
      
      // Log failed authentication
      await this.authService.logAuthEvent(
        null, 
        null, 
        'api_key_auth_failure', 
        false, 
        { 
          error: error.message, 
          endpoint: req.path, 
          method: req.method,
          userAgent: req.get('User-Agent')
        },
        req
      );

      return res.status(401).json({ 
        error: 'Access denied', 
        message: 'Invalid or expired API key' 
      });
    }
  };

  /**
   * Multi-factor authentication middleware
   */
  requireMFA = () => {
    return async (req, res, next) => {
      try {
        if (!req.auth || req.auth.type !== 'jwt') {
          return res.status(401).json({
            error: 'Access denied',
            message: 'JWT authentication required for MFA operations'
          });
        }

        const mfaCode = req.headers['x-mfa-code'];
        const mfaMethod = req.headers['x-mfa-method'] || 'totp';

        if (!mfaCode) {
          return res.status(401).json({
            error: 'MFA required',
            message: 'Multi-factor authentication code required',
            supportedMethods: ['totp', 'sms', 'email']
          });
        }

        // Verify MFA code (this would integrate with your MFA provider)
        const mfaValid = await this.verifyMFACode(req.user.id, mfaCode, mfaMethod);

        if (!mfaValid) {
          await this.logSecurityEvent('mfa_failure', {
            userId: req.user.id,
            method: mfaMethod,
            endpoint: req.path
          }, req);

          return res.status(401).json({
            error: 'MFA failed',
            message: 'Invalid multi-factor authentication code'
          });
        }

        // Mark request as MFA verified
        req.auth.mfaVerified = true;
        req.auth.mfaMethod = mfaMethod;

        await this.logSecurityEvent('mfa_success', {
          userId: req.user.id,
          method: mfaMethod,
          endpoint: req.path
        }, req);

        next();
      } catch (error) {
        console.error('MFA verification error:', error.message);
        return res.status(500).json({
          error: 'Internal server error',
          message: 'MFA verification failed'
        });
      }
    };
  };

  /**
   * Combined authentication with fallback
   */
  authenticate = async (req, res, next) => {
    // Try JWT authentication first
    if (req.headers.authorization) {
      return this.authenticateJWT(req, res, next);
    }
    
    // Try API key authentication
    if (req.headers['x-api-key'] || req.query.apiKey) {
      return this.authenticateApiKey(req, res, next);
    }

    // No authentication provided
    await this.recordFailedAttempt(req.ip, 'no_auth_provided');
    return res.status(401).json({ 
      error: 'Access denied', 
      message: 'Authentication required. Use Authorization header (Bearer token) or X-API-Key header',
      supportedMethods: ['jwt', 'api_key']
    });
  };

  /**
   * Enhanced authorization with resource-based permissions
   */
  authorize = (resource, action, options = {}) => {
    return async (req, res, next) => {
      try {
        if (!req.auth) {
          return res.status(401).json({ 
            error: 'Access denied', 
            message: 'Authentication required' 
          });
        }

        // Check for admin bypass
        if (options.allowAdmin && req.auth.role === 'admin') {
          await this.logSecurityEvent('admin_access_granted', {
            userId: req.auth.userId,
            username: req.auth.username,
            resource: resource,
            action: action,
            endpoint: req.path
          }, req);
          return next();
        }

        // Resource-level permission check
        const hasPermission = this.checkResourcePermission(req.auth, resource, action, req);
        
        if (!hasPermission) {
          // Log authorization failure with detailed context
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
              userPermissions: req.auth.permissions,
              requiredPermission: `${resource}:${action}`,
              resourceContext: this.getResourceContext(req)
            },
            req
          );

          return res.status(403).json({ 
            error: 'Forbidden', 
            message: `Insufficient permissions for ${resource}:${action}`,
            required: `${resource}:${action}`,
            granted: req.auth.permissions
          });
        }

        // Log successful authorization
        await this.authService.logAuthEvent(
          req.auth.userId || null,
          req.auth.username || req.auth.keyName || null,
          'authorization_granted',
          true,
          { 
            resource, 
            action, 
            endpoint: req.path, 
            method: req.method,
            permission: `${resource}:${action}`
          },
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
   * Enhanced role-based authorization
   */
  requireRole = (requiredRoles, options = {}) => {
    if (typeof requiredRoles === 'string') {
      requiredRoles = [requiredRoles];
    }

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
            message: 'User authentication required for role-based operations' 
          });
        }

        const userRole = req.auth.role;
        const hasRole = requiredRoles.includes(userRole) || userRole === 'admin';

        if (!hasRole) {
          await this.logSecurityEvent('role_denied', {
            userId: req.auth.userId,
            userRole: userRole,
            requiredRoles: requiredRoles,
            endpoint: req.path
          }, req);

          return res.status(403).json({ 
            error: 'Forbidden', 
            message: `Required role: ${requiredRoles.join(' or ')}`,
            currentRole: userRole
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
   * Token refresh middleware
   */
  refreshToken = async (req, res, next) => {
    try {
      if (!req.auth || req.auth.type !== 'jwt') {
        return res.status(401).json({
          error: 'Access denied',
          message: 'JWT authentication required for token refresh'
        });
      }

      // Generate new token with same payload but fresh expiration
      const newToken = this.authService.generateToken(req.user);
      
      // Log token refresh
      await this.authService.logAuthEvent(
        req.user.id,
        req.user.username,
        'token_refresh',
        true,
        { endpoint: req.path, oldTokenExp: req.auth.expiresAt },
        req
      );

      res.json({
        status: 'success',
        token: newToken,
        expiresIn: this.authService.jwtExpiresIn,
        refreshedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Token refresh error:', error.message);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Token refresh failed'
      });
    }
  };

  /**
   * Security utility methods
   */
  isIpAllowed(ip) {
    // If whitelist is configured, IP must be in whitelist
    if (this.securityConfig.ipWhitelist.length > 0) {
      return this.securityConfig.ipWhitelist.includes(ip);
    }
    
    // If blacklist is configured, IP must not be in blacklist
    if (this.securityConfig.ipBlacklist.length > 0) {
      return !this.securityConfig.ipBlacklist.includes(ip);
    }
    
    // No IP filtering configured
    return true;
  }

  isValidApiKeyFormat(apiKey) {
    // API keys should start with 'hga_' and be 64+ characters
    return typeof apiKey === 'string' && 
           apiKey.startsWith('hga_') && 
           apiKey.length >= 35;
  }

  recordFailedAttempt(ip, reason, details = null) {
    const key = ip;
    const attempt = {
      timestamp: Date.now(),
      reason: reason,
      details: details
    };

    if (!this.failedAttempts.has(key)) {
      this.failedAttempts.set(key, []);
    }

    const attempts = this.failedAttempts.get(key);
    attempts.push(attempt);

    // Clean old attempts (older than lockout duration)
    const cutoff = Date.now() - this.securityConfig.lockoutDuration;
    const recentAttempts = attempts.filter(a => a.timestamp > cutoff);
    this.failedAttempts.set(key, recentAttempts);
  }

  clearFailedAttempts(ip) {
    this.failedAttempts.delete(ip);
  }

  isRateLimited(ip) {
    const attempts = this.failedAttempts.get(ip) || [];
    const cutoff = Date.now() - this.securityConfig.lockoutDuration;
    const recentAttempts = attempts.filter(a => a.timestamp > cutoff);
    
    return recentAttempts.length >= this.securityConfig.maxFailedAttempts;
  }

  checkResourcePermission(auth, resource, action, req) {
    const hasPermission = this.authService.checkPermission(auth, resource, action);
    
    // Additional context-based checks could go here
    // For example, checking if user owns the resource they're trying to access
    
    return hasPermission;
  }

  getResourceContext(req) {
    // Extract resource context from request (e.g., repository name, deployment ID)
    return {
      params: req.params,
      query: req.query,
      path: req.path
    };
  }

  getTokenErrorType(error) {
    if (error.name === 'TokenExpiredError') return 'expired';
    if (error.name === 'JsonWebTokenError') return 'invalid';
    if (error.name === 'NotBeforeError') return 'not_active';
    return 'unknown';
  }

  getTokenErrorCode(error) {
    if (error.name === 'TokenExpiredError') return 'TOKEN_EXPIRED';
    if (error.name === 'JsonWebTokenError') return 'TOKEN_INVALID';
    if (error.name === 'NotBeforeError') return 'TOKEN_NOT_ACTIVE';
    return 'TOKEN_ERROR';
  }

  async verifyMFACode(userId, code, method) {
    // This would integrate with your MFA provider (e.g., Google Authenticator, SMS service)
    // For now, return false as MFA is not fully implemented
    return false;
  }

  async logSecurityEvent(eventType, details, req) {
    try {
      await this.authService.logAuthEvent(
        req.auth?.userId || null,
        req.auth?.username || null,
        `security_${eventType}`,
        false,
        {
          ...details,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        },
        req
      );
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Security audit middleware
   */
  securityAudit = () => {
    return async (req, res, next) => {
      // Log all authenticated requests for security audit
      if (req.auth) {
        await this.logSecurityEvent('request_audit', {
          endpoint: req.path,
          method: req.method,
          authType: req.auth.type,
          userId: req.auth.userId,
          username: req.auth.username || req.auth.keyName
        }, req);
      }
      
      next();
    };
  };

  /**
   * Admin-only middleware
   */
  requireAdmin = () => {
    return this.requireRole('admin');
  };
}

// Create singleton instance
const enhancedAuthMiddleware = new EnhancedAuthMiddleware();

// Export individual middleware functions
module.exports = {
  authenticate: enhancedAuthMiddleware.authenticate,
  authenticateJWT: enhancedAuthMiddleware.authenticateJWT,
  authenticateApiKey: enhancedAuthMiddleware.authenticateApiKey,
  authorize: enhancedAuthMiddleware.authorize,
  requireRole: enhancedAuthMiddleware.requireRole,
  requireAdmin: enhancedAuthMiddleware.requireAdmin,
  requireMFA: enhancedAuthMiddleware.requireMFA,
  refreshToken: enhancedAuthMiddleware.refreshToken,
  securityAudit: enhancedAuthMiddleware.securityAudit,
  EnhancedAuthMiddleware
};
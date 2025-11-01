const { AuditLogger } = require('../utils/audit-logger');
const { Logger } = require('../utils/logger');

/**
 * Authorization Middleware
 * Provides comprehensive Role-Based Access Control (RBAC) and permission-based authorization
 */
class AuthorizationMiddleware {
  constructor() {
    this.roles = new Map();
    this.permissions = new Map();
    this.logger = new Logger('AuthorizationMiddleware');
    this.initialized = false;
  }

  /**
   * Initialize the authorization middleware
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      this.setupRoles();
      this.setupPermissions();
      this.initialized = true;
      this.logger.info('Authorization middleware initialized');
    } catch (error) {
      this.logger.error('Failed to initialize authorization middleware:', error);
      throw error;
    }
  }

  /**
   * Setup role definitions and their permissions
   */
  setupRoles() {
    // Define roles and their permissions
    this.roles.set('admin', [
      'deployment:read',
      'deployment:write',
      'deployment:rollback',
      'deployment:admin',
      'system:admin',
      'user:manage',
      'config:manage',
      'audit:read'
    ]);

    this.roles.set('operator', [
      'deployment:read',
      'deployment:write',
      'deployment:rollback',
      'monitoring:read'
    ]);

    this.roles.set('viewer', [
      'deployment:read',
      'monitoring:read'
    ]);

    this.roles.set('webhook', [
      'webhook:receive',
      'deployment:trigger'
    ]);
  }

  /**
   * Setup permission hierarchy
   */
  setupPermissions() {
    // Define permission hierarchy (higher permissions include lower ones)
    this.permissions.set('system:admin', [
      'deployment:admin',
      'user:manage',
      'config:manage',
      'audit:read'
    ]);

    this.permissions.set('deployment:admin', [
      'deployment:read',
      'deployment:write',
      'deployment:rollback',
      'deployment:configure'
    ]);

    this.permissions.set('deployment:write', [
      'deployment:read'
    ]);

    this.permissions.set('user:manage', [
      'user:read',
      'user:create',
      'user:update',
      'user:delete'
    ]);
  }

  /**
   * Authorization middleware factory
   * Creates middleware to check specific permissions
   */
  requirePermission = (requiredPermissions) => {
    return async (req, res, next) => {
      try {
        // Ensure middleware is initialized
        if (!this.initialized) {
          await this.initialize();
        }

        if (!req.auth) {
          return this.sendUnauthorizedResponse(res, 'Authentication required');
        }

        const userPermissions = this.getUserPermissions(req.auth);
        const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
        
        const hasPermission = required.every(permission => 
          this.hasPermission(userPermissions, permission)
        );

        if (!hasPermission) {
          AuditLogger.logAuthorizationEvent({
            type: 'authorization-failure',
            userId: req.auth.userId || null,
            username: req.auth.username || req.auth.keyName || null,
            requiredPermissions: required,
            userPermissions: userPermissions,
            ipAddress: req.ip,
            endpoint: req.path,
            method: req.method
          });

          return this.sendForbiddenResponse(res, `Insufficient permissions. Required: ${required.join(', ')}`);
        }

        // Log successful authorization
        AuditLogger.logAuthorizationEvent({
          type: 'authorization-success',
          userId: req.auth.userId || null,
          username: req.auth.username || req.auth.keyName || null,
          requiredPermissions: required,
          ipAddress: req.ip,
          endpoint: req.path,
          method: req.method
        });

        next();
      } catch (error) {
        this.logger.error('Authorization error', error);
        
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Authorization check failed',
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  };

  /**
   * Role-based authorization middleware
   */
  requireRole = (requiredRoles) => {
    return async (req, res, next) => {
      try {
        // Ensure middleware is initialized
        if (!this.initialized) {
          await this.initialize();
        }

        if (!req.auth) {
          return this.sendUnauthorizedResponse(res, 'Authentication required');
        }

        // API keys don't have roles, only users do
        if (req.auth.type !== 'jwt') {
          return this.sendForbiddenResponse(res, 'User authentication required for this operation');
        }

        const userRoles = Array.isArray(req.auth.role) ? req.auth.role : [req.auth.role];
        const required = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        
        const hasRole = required.some(role => userRoles.includes(role)) || userRoles.includes('admin');

        if (!hasRole) {
          AuditLogger.logAuthorizationEvent({
            type: 'role-authorization-failure',
            userId: req.auth.userId,
            username: req.auth.username,
            requiredRoles: required,
            userRoles: userRoles,
            ipAddress: req.ip,
            endpoint: req.path,
            method: req.method
          });

          return this.sendForbiddenResponse(res, `Required role: ${required.join(' or ')}`);
        }

        AuditLogger.logAuthorizationEvent({
          type: 'role-authorization-success',
          userId: req.auth.userId,
          username: req.auth.username,
          requiredRoles: required,
          userRoles: userRoles,
          ipAddress: req.ip,
          endpoint: req.path,
          method: req.method
        });

        next();
      } catch (error) {
        this.logger.error('Role check error', error);
        
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'ROLE_CHECK_ERROR',
            message: 'Role check failed',
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  };

  /**
   * Resource-level authorization middleware
   * Checks if user can access specific resources
   */
  requireResourceAccess = (resourceType, getResourceId) => {
    return async (req, res, next) => {
      try {
        if (!req.auth) {
          return this.sendUnauthorizedResponse(res, 'Authentication required');
        }

        const resourceId = typeof getResourceId === 'function' ? getResourceId(req) : getResourceId;
        
        // Check if user has access to this specific resource
        const hasAccess = await this.checkResourceAccess(req.auth, resourceType, resourceId);

        if (!hasAccess) {
          AuditLogger.logAuthorizationEvent({
            type: 'resource-access-denied',
            userId: req.auth.userId || null,
            username: req.auth.username || req.auth.keyName || null,
            resourceType: resourceType,
            resourceId: resourceId,
            ipAddress: req.ip,
            endpoint: req.path,
            method: req.method
          });

          return this.sendForbiddenResponse(res, `Access denied to ${resourceType}: ${resourceId}`);
        }

        next();
      } catch (error) {
        this.logger.error('Resource access check error', error);
        
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'RESOURCE_ACCESS_ERROR',
            message: 'Resource access check failed',
            timestamp: new Date().toISOString()
          }
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
   * Deployment operation authorization
   */
  requireDeploymentPermission = (operation) => {
    const permissionMap = {
      'read': 'deployment:read',
      'deploy': 'deployment:write',
      'rollback': 'deployment:rollback',
      'configure': 'deployment:admin'
    };

    const permission = permissionMap[operation];
    if (!permission) {
      throw new Error(`Invalid deployment operation: ${operation}`);
    }

    return this.requirePermission(permission);
  };

  /**
   * Get user permissions including role-based permissions
   */
  getUserPermissions(auth) {
    if (!auth) return [];
    
    const permissions = new Set(auth.permissions || []);
    
    // Add permissions from roles (if user authentication)
    if (auth.type === 'jwt' && auth.role) {
      const roles = Array.isArray(auth.role) ? auth.role : [auth.role];
      roles.forEach(role => {
        const rolePermissions = this.roles.get(role) || [];
        rolePermissions.forEach(permission => permissions.add(permission));
      });
    }
    
    return Array.from(permissions);
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(userPermissions, requiredPermission) {
    // Direct permission check
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }
    
    // Check for higher-level permissions that include this permission
    for (const [permission, impliedPermissions] of this.permissions) {
      if (userPermissions.includes(permission) && impliedPermissions.includes(requiredPermission)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check resource-level access
   */
  async checkResourceAccess(auth, resourceType, resourceId) {
    // Admin users have access to all resources
    if (auth.type === 'jwt' && (auth.role === 'admin' || (Array.isArray(auth.role) && auth.role.includes('admin')))) {
      return true;
    }

    // Implement resource-specific access control logic here
    switch (resourceType) {
      case 'repository':
        return this.checkRepositoryAccess(auth, resourceId);
      case 'deployment':
        return this.checkDeploymentAccess(auth, resourceId);
      case 'user':
        return this.checkUserAccess(auth, resourceId);
      default:
        return false;
    }
  }

  /**
   * Check repository access
   */
  async checkRepositoryAccess(auth, repositoryId) {
    // For now, allow access if user has deployment permissions
    // In production, this would check against a repository access control list
    const userPermissions = this.getUserPermissions(auth);
    return this.hasPermission(userPermissions, 'deployment:read');
  }

  /**
   * Check deployment access
   */
  async checkDeploymentAccess(auth, deploymentId) {
    // Check if user has deployment read permission
    const userPermissions = this.getUserPermissions(auth);
    return this.hasPermission(userPermissions, 'deployment:read');
  }

  /**
   * Check user access (for user management operations)
   */
  async checkUserAccess(auth, userId) {
    // Users can access their own data
    if (auth.type === 'jwt' && auth.userId === userId) {
      return true;
    }
    
    // Check if user has user management permissions
    const userPermissions = this.getUserPermissions(auth);
    return this.hasPermission(userPermissions, 'user:read');
  }

  /**
   * Create custom authorization middleware
   */
  custom = (authorizationFunction) => {
    return async (req, res, next) => {
      try {
        if (!req.auth) {
          return this.sendUnauthorizedResponse(res, 'Authentication required');
        }

        const isAuthorized = await authorizationFunction(req.auth, req);

        if (!isAuthorized) {
          AuditLogger.logAuthorizationEvent({
            type: 'custom-authorization-failure',
            userId: req.auth.userId || null,
            username: req.auth.username || req.auth.keyName || null,
            ipAddress: req.ip,
            endpoint: req.path,
            method: req.method
          });

          return this.sendForbiddenResponse(res, 'Custom authorization failed');
        }

        next();
      } catch (error) {
        this.logger.error('Custom authorization error', error);
        
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'CUSTOM_AUTHORIZATION_ERROR',
            message: 'Custom authorization check failed',
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  };

  /**
   * Send unauthorized response
   */
  sendUnauthorizedResponse(res, message) {
    res.status(401).json({
      status: 'error',
      error: {
        code: 'UNAUTHORIZED',
        message: message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send forbidden response
   */
  sendForbiddenResponse(res, message) {
    res.status(403).json({
      status: 'error',
      error: {
        code: 'FORBIDDEN',
        message: message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get role information
   */
  getRoleInfo(roleName) {
    return {
      name: roleName,
      permissions: this.roles.get(roleName) || []
    };
  }

  /**
   * Get all available roles
   */
  getAllRoles() {
    const roles = {};
    for (const [roleName, permissions] of this.roles) {
      roles[roleName] = permissions;
    }
    return roles;
  }

  /**
   * Get all available permissions
   */
  getAllPermissions() {
    const allPermissions = new Set();
    
    // Add all role permissions
    for (const permissions of this.roles.values()) {
      permissions.forEach(permission => allPermissions.add(permission));
    }
    
    // Add all implied permissions
    for (const permissions of this.permissions.values()) {
      permissions.forEach(permission => allPermissions.add(permission));
    }
    
    return Array.from(allPermissions).sort();
  }
}

// Create singleton instance
const authorizationMiddleware = new AuthorizationMiddleware();

// Export individual middleware functions
module.exports = {
  requirePermission: authorizationMiddleware.requirePermission,
  requireRole: authorizationMiddleware.requireRole,
  requireResourceAccess: authorizationMiddleware.requireResourceAccess,
  requireAdmin: authorizationMiddleware.requireAdmin,
  requireDeploymentPermission: authorizationMiddleware.requireDeploymentPermission,
  custom: authorizationMiddleware.custom,
  AuthorizationMiddleware,
  // Export instance for direct access
  authorizationMiddleware
};
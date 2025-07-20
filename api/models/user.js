const { v4: uuidv4 } = require('uuid');

/**
 * User Role Definitions
 */
class UserRole {
  static ADMIN = 'admin';
  static OPERATOR = 'operator'; 
  static VIEWER = 'viewer';

  static ALL_ROLES = [this.ADMIN, this.OPERATOR, this.VIEWER];

  static isValid(role) {
    return this.ALL_ROLES.includes(role);
  }
}

/**
 * Permission Definitions
 */
class Permission {
  static RESOURCES = {
    REPOSITORIES: 'repositories',
    PIPELINES: 'pipelines', 
    TEMPLATES: 'templates',
    METRICS: 'metrics',
    WEBHOOKS: 'webhooks',
    SYSTEM: 'system'
  };

  static ACTIONS = {
    READ: 'read',
    WRITE: 'write',
    DELETE: 'delete',
    TRIGGER: 'trigger',
    CANCEL: 'cancel',
    APPLY: 'apply',
    CREATE: 'create',
    EXPORT: 'export',
    CONFIGURE: 'configure',
    ADMIN: 'admin'
  };

  /**
   * Format permission as resource:action
   */
  static format(resource, action) {
    return `${resource}:${action}`;
  }

  /**
   * Check if permission string is valid
   */
  static isValid(permission) {
    if (permission === '*:*') return true;
    
    const [resource, action] = permission.split(':');
    if (!resource || !action) return false;
    
    return Object.values(this.RESOURCES).includes(resource) && 
           Object.values(this.ACTIONS).includes(action);
  }
}

/**
 * Role-based permission sets
 */
class RolePermissions {
  static get(role) {
    switch (role) {
      case UserRole.ADMIN:
        return ['*:*']; // All permissions
        
      case UserRole.OPERATOR:
        return [
          Permission.format(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.WRITE),
          Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER),
          Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.CANCEL),
          Permission.format(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.APPLY),
          Permission.format(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.CREATE),
          Permission.format(Permission.RESOURCES.METRICS, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.WEBHOOKS, Permission.ACTIONS.READ)
        ];
        
      case UserRole.VIEWER:
        return [
          Permission.format(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.READ),
          Permission.format(Permission.RESOURCES.METRICS, Permission.ACTIONS.READ)
        ];
        
      default:
        return [];
    }
  }
}

/**
 * API Key Model
 */
class ApiKey {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.name = data.name || '';
    this.key = data.key || '';
    this.permissions = data.permissions || [];
    this.createdAt = data.createdAt || new Date();
    this.lastUsed = data.lastUsed || null;
    this.expiresAt = data.expiresAt || null;
  }

  /**
   * Check if API key is expired
   */
  isExpired() {
    return this.expiresAt && new Date() > this.expiresAt;
  }

  /**
   * Update last used timestamp
   */
  updateLastUsed() {
    this.lastUsed = new Date();
  }

  /**
   * Check if key has specific permission
   */
  hasPermission(resource, action) {
    const requiredPermission = Permission.format(resource, action);
    
    // Check for wildcard permission
    if (this.permissions.includes('*:*')) {
      return true;
    }
    
    // Check for exact permission match
    return this.permissions.includes(requiredPermission);
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      permissions: this.permissions,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      expiresAt: this.expiresAt
      // Note: 'key' is intentionally omitted for security
    };
  }
}

/**
 * User Model
 */
class User {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.username = data.username || '';
    this.email = data.email || '';
    this.passwordHash = data.passwordHash || '';
    this.role = data.role || UserRole.VIEWER;
    this.permissions = data.permissions || RolePermissions.get(this.role);
    this.apiKeys = (data.apiKeys || []).map(keyData => new ApiKey(keyData));
    this.createdAt = data.createdAt || new Date();
    this.lastLogin = data.lastLogin || null;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(resource, action) {
    const requiredPermission = Permission.format(resource, action);
    
    // Check for wildcard permission
    if (this.permissions.includes('*:*')) {
      return true;
    }
    
    // Check for exact permission match
    return this.permissions.includes(requiredPermission);
  }

  /**
   * Add API key to user
   */
  addApiKey(apiKey) {
    this.apiKeys.push(apiKey);
  }

  /**
   * Remove API key by ID
   */
  removeApiKey(keyId) {
    this.apiKeys = this.apiKeys.filter(key => key.id !== keyId);
  }

  /**
   * Get API key by ID
   */
  getApiKey(keyId) {
    return this.apiKeys.find(key => key.id === keyId);
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin() {
    this.lastLogin = new Date();
  }

  /**
   * Convert to JSON representation (safe for API responses)
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      role: this.role,
      permissions: this.permissions,
      apiKeys: this.apiKeys.map(key => key.toJSON()),
      createdAt: this.createdAt,
      lastLogin: this.lastLogin
      // Note: 'passwordHash' is intentionally omitted for security
    };
  }
}

module.exports = {
  User,
  ApiKey,
  UserRole,
  Permission,
  RolePermissions
};
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { auditLogger } = require('../../utils/auditLogger');

class RoleService {
  constructor() {
    // Default roles and permissions
    this.defaultRoles = {
      admin: {
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full system access',
        permissions: [
          'deployment:create', 'deployment:read', 'deployment:update', 'deployment:delete',
          'user:create', 'user:read', 'user:update', 'user:delete',
          'config:create', 'config:read', 'config:update', 'config:delete',
          'audit:read', 'system:manage', 'role:manage'
        ],
        isSystemRole: true
      },
      operator: {
        name: 'operator',
        displayName: 'System Operator',
        description: 'Can manage deployments and configurations',
        permissions: [
          'deployment:create', 'deployment:read', 'deployment:update', 'deployment:delete',
          'config:read', 'config:update', 'audit:read'
        ],
        isSystemRole: true
      },
      viewer: {
        name: 'viewer',
        displayName: 'Viewer',
        description: 'Read-only access to deployments and configurations',
        permissions: [
          'deployment:read', 'config:read', 'audit:read'
        ],
        isSystemRole: true
      },
      developer: {
        name: 'developer',
        displayName: 'Developer',
        description: 'Can deploy and manage development environments',
        permissions: [
          'deployment:create', 'deployment:read', 'deployment:update',
          'config:read', 'audit:read'
        ],
        isSystemRole: true
      }
    };

    // Resource-specific permissions
    this.resourcePermissions = {
      deployment: ['create', 'read', 'update', 'delete', 'execute'],
      config: ['create', 'read', 'update', 'delete'],
      user: ['create', 'read', 'update', 'delete'],
      audit: ['read', 'export'],
      system: ['manage', 'backup', 'restore'],
      role: ['manage', 'assign']
    };

    // Initialize in-memory storage (replace with database in production)
    this.roles = new Map();
    this.userRoles = new Map();
    this.initializeDefaultRoles();
  }

  initializeDefaultRoles() {
    Object.values(this.defaultRoles).forEach(role => {
      this.roles.set(role.name, role);
    });
  }

  // Role Management
  async createRole(roleData, createdBy) {
    try {
      const { name, displayName, description, permissions } = roleData;

      if (this.roles.has(name)) {
        throw new Error(`Role '${name}' already exists`);
      }

      // Validate permissions
      const validPermissions = this.validatePermissions(permissions);
      if (validPermissions.invalid.length > 0) {
        throw new Error(`Invalid permissions: ${validPermissions.invalid.join(', ')}`);
      }

      const role = {
        name,
        displayName: displayName || name,
        description: description || '',
        permissions: validPermissions.valid,
        isSystemRole: false,
        createdAt: new Date().toISOString(),
        createdBy,
        updatedAt: new Date().toISOString()
      };

      this.roles.set(name, role);

      await auditLogger.log('role_created', {
        roleName: name,
        permissions: permissions,
        createdBy
      });

      return role;
    } catch (error) {
      await auditLogger.log('role_creation_failed', {
        roleName: roleData.name,
        error: error.message,
        createdBy
      });
      throw error;
    }
  }

  async updateRole(roleName, updates, updatedBy) {
    try {
      const role = this.roles.get(roleName);
      if (!role) {
        throw new Error(`Role '${roleName}' not found`);
      }

      if (role.isSystemRole) {
        throw new Error(`Cannot modify system role '${roleName}'`);
      }

      const updatedRole = { ...role };

      if (updates.displayName) {
        updatedRole.displayName = updates.displayName;
      }

      if (updates.description) {
        updatedRole.description = updates.description;
      }

      if (updates.permissions) {
        const validPermissions = this.validatePermissions(updates.permissions);
        if (validPermissions.invalid.length > 0) {
          throw new Error(`Invalid permissions: ${validPermissions.invalid.join(', ')}`);
        }
        updatedRole.permissions = validPermissions.valid;
      }

      updatedRole.updatedAt = new Date().toISOString();
      updatedRole.updatedBy = updatedBy;

      this.roles.set(roleName, updatedRole);

      await auditLogger.log('role_updated', {
        roleName,
        updates,
        updatedBy
      });

      return updatedRole;
    } catch (error) {
      await auditLogger.log('role_update_failed', {
        roleName,
        error: error.message,
        updatedBy
      });
      throw error;
    }
  }

  async deleteRole(roleName, deletedBy) {
    try {
      const role = this.roles.get(roleName);
      if (!role) {
        throw new Error(`Role '${roleName}' not found`);
      }

      if (role.isSystemRole) {
        throw new Error(`Cannot delete system role '${roleName}'`);
      }

      // Check if role is assigned to any users
      const usersWithRole = Array.from(this.userRoles.entries())
        .filter(([userId, roles]) => roles.includes(roleName))
        .map(([userId]) => userId);

      if (usersWithRole.length > 0) {
        throw new Error(`Cannot delete role '${roleName}': assigned to ${usersWithRole.length} users`);
      }

      this.roles.delete(roleName);

      await auditLogger.log('role_deleted', {
        roleName,
        deletedBy
      });

      return true;
    } catch (error) {
      await auditLogger.log('role_deletion_failed', {
        roleName,
        error: error.message,
        deletedBy
      });
      throw error;
    }
  }

  // User Role Assignment
  async assignRolesToUser(userId, roleNames, assignedBy) {
    try {
      // Validate roles exist
      const invalidRoles = roleNames.filter(roleName => !this.roles.has(roleName));
      if (invalidRoles.length > 0) {
        throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
      }

      this.userRoles.set(userId, roleNames);

      await auditLogger.log('roles_assigned', {
        userId,
        roles: roleNames,
        assignedBy
      });

      return true;
    } catch (error) {
      await auditLogger.log('role_assignment_failed', {
        userId,
        roles: roleNames,
        error: error.message,
        assignedBy
      });
      throw error;
    }
  }

  async removeRolesFromUser(userId, roleNames, removedBy) {
    try {
      const currentRoles = this.userRoles.get(userId) || [];
      const updatedRoles = currentRoles.filter(role => !roleNames.includes(role));

      if (updatedRoles.length === 0) {
        this.userRoles.delete(userId);
      } else {
        this.userRoles.set(userId, updatedRoles);
      }

      await auditLogger.log('roles_removed', {
        userId,
        rolesRemoved: roleNames,
        remainingRoles: updatedRoles,
        removedBy
      });

      return true;
    } catch (error) {
      await auditLogger.log('role_removal_failed', {
        userId,
        roles: roleNames,
        error: error.message,
        removedBy
      });
      throw error;
    }
  }

  // Permission Checking
  async hasPermission(userId, permission) {
    const userRoles = this.userRoles.get(userId) || [];
    
    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);
      if (role && role.permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  async hasAnyPermission(userId, permissions) {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, permission)) {
        return true;
      }
    }
    return false;
  }

  async hasAllPermissions(userId, permissions) {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, permission))) {
        return false;
      }
    }
    return true;
  }

  async hasResourcePermission(userId, resource, action) {
    const permission = `${resource}:${action}`;
    return await this.hasPermission(userId, permission);
  }

  // Utility Methods
  validatePermissions(permissions) {
    const valid = [];
    const invalid = [];

    permissions.forEach(permission => {
      if (this.isValidPermission(permission)) {
        valid.push(permission);
      } else {
        invalid.push(permission);
      }
    });

    return { valid, invalid };
  }

  isValidPermission(permission) {
    // Check if permission follows resource:action format
    const [resource, action] = permission.split(':');
    
    if (!resource || !action) {
      return false;
    }

    // Check if resource exists and action is valid for that resource
    const validActions = this.resourcePermissions[resource];
    return validActions && validActions.includes(action);
  }

  async getUserRoles(userId) {
    const roleNames = this.userRoles.get(userId) || [];
    const roles = roleNames.map(name => this.roles.get(name)).filter(Boolean);
    return roles;
  }

  async getUserPermissions(userId) {
    const userRoles = await this.getUserRoles(userId);
    const permissions = new Set();

    userRoles.forEach(role => {
      role.permissions.forEach(permission => {
        permissions.add(permission);
      });
    });

    return Array.from(permissions);
  }

  getAllRoles() {
    return Array.from(this.roles.values());
  }

  getRole(roleName) {
    return this.roles.get(roleName);
  }

  getResourcePermissions() {
    return this.resourcePermissions;
  }

  // Export/Import for backup
  exportRoles() {
    return {
      roles: Array.from(this.roles.entries()),
      userRoles: Array.from(this.userRoles.entries()),
      resourcePermissions: this.resourcePermissions
    };
  }

  importRoles(data) {
    if (data.roles) {
      this.roles = new Map(data.roles);
    }
    if (data.userRoles) {
      this.userRoles = new Map(data.userRoles);
    }
    if (data.resourcePermissions) {
      this.resourcePermissions = data.resourcePermissions;
    }
  }
}

module.exports = new RoleService();
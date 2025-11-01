const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Database = require('../../models/database');
const { User, ApiKey, UserRole, Permission } = require('../../models/user');

/**
 * Authentication Service
 * Handles JWT tokens, API keys, and user authentication
 */
class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateSecret();
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.db = Database.getInstance();
    this.apiKeys = new Map(); // In-memory cache for API keys
    this.sessions = new Map(); // In-memory cache for sessions
    
    // Warn if using default JWT secret
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  Using generated JWT secret. Set JWT_SECRET environment variable for production!');
    }
  }

  /**
   * Generate a secure random secret
   */
  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token for user
   */
  generateToken(user, expiresIn = null) {
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      type: 'jwt'
    };

    const options = {
      expiresIn: expiresIn || this.jwtExpiresIn
    };

    return jwt.sign(payload, this.jwtSecret, options);
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Check if user still exists in database
      const userRow = await this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (!userRow) {
        throw new Error('User not found');
      }

      // Create user object
      const user = new User({
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        passwordHash: userRow.password_hash,
        role: userRow.role,
        permissions: JSON.parse(userRow.permissions),
        createdAt: new Date(userRow.created_at),
        lastLogin: userRow.last_login ? new Date(userRow.last_login) : null
      });

      return { user, decoded };
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Generate API key
   */
  async generateApiKey(name, permissions, expiresIn = null, userId = null) {
    const keyData = crypto.randomBytes(32).toString('hex');
    const keyPrefix = 'hga_'; // homelab-gitops-auditor prefix
    const key = `${keyPrefix}${keyData}`;
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = new ApiKey({
      name: name,
      key: key,
      permissions: permissions,
      expiresAt: expiresIn ? new Date(Date.now() + ms(expiresIn)) : null
    });

    // Store in database
    await this.db.run(
      `INSERT INTO api_keys (id, user_id, name, key_hash, permissions, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        apiKey.id,
        userId,
        apiKey.name,
        keyHash,
        JSON.stringify(apiKey.permissions),
        apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
        apiKey.createdAt.toISOString()
      ]
    );

    // Cache in memory (without the actual key)
    this.apiKeys.set(keyHash, {
      ...apiKey,
      key: undefined // Don't store actual key in cache
    });

    return { apiKey, key }; // Return both object and actual key
  }

  /**
   * Verify API key
   */
  async verifyApiKey(key) {
    try {
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');
      
      // Try cache first
      let apiKeyData = this.apiKeys.get(keyHash);
      
      // If not in cache, query database
      if (!apiKeyData) {
        const keyRow = await this.db.get(
          'SELECT * FROM api_keys WHERE key_hash = ?',
          [keyHash]
        );

        if (!keyRow) {
          throw new Error('API key not found');
        }

        apiKeyData = new ApiKey({
          id: keyRow.id,
          name: keyRow.name,
          permissions: JSON.parse(keyRow.permissions),
          createdAt: new Date(keyRow.created_at),
          lastUsed: keyRow.last_used ? new Date(keyRow.last_used) : null,
          expiresAt: keyRow.expires_at ? new Date(keyRow.expires_at) : null
        });

        // Cache it
        this.apiKeys.set(keyHash, apiKeyData);
      }

      // Check if expired
      if (apiKeyData.isExpired()) {
        throw new Error('API key expired');
      }

      // Update last used timestamp
      apiKeyData.updateLastUsed();
      await this.db.run(
        'UPDATE api_keys SET last_used = ? WHERE key_hash = ?',
        [apiKeyData.lastUsed.toISOString(), keyHash]
      );

      return apiKeyData;
    } catch (error) {
      throw new Error(`Invalid API key: ${error.message}`);
    }
  }

  /**
   * Check if user/API key has required permission
   */
  checkPermission(auth, resource, action) {
    const requiredPermission = Permission.format(resource, action);
    
    // Check for wildcard permission
    if (auth.permissions.includes('*:*')) {
      return true;
    }
    
    // Check for exact permission match
    return auth.permissions.includes(requiredPermission);
  }

  /**
   * Authenticate user with username/password
   */
  async authenticateUser(username, password) {
    try {
      // Get user from database
      const userRow = await this.db.get(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username]
      );

      if (!userRow) {
        throw new Error('User not found');
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, userRow.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid password');
      }

      // Create user object
      const user = new User({
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        passwordHash: userRow.password_hash,
        role: userRow.role,
        permissions: JSON.parse(userRow.permissions),
        createdAt: new Date(userRow.created_at),
        lastLogin: userRow.last_login ? new Date(userRow.last_login) : null
      });

      // Update last login
      user.updateLastLogin();
      await this.db.run(
        'UPDATE users SET last_login = ? WHERE id = ?',
        [user.lastLogin.toISOString(), user.id]
      );

      return user;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    try {
      // Hash password
      const passwordHash = await this.hashPassword(userData.password);
      
      const user = new User({
        username: userData.username,
        email: userData.email,
        passwordHash: passwordHash,
        role: userData.role || UserRole.VIEWER
      });

      // Insert into database
      await this.db.run(
        `INSERT INTO users (id, username, email, password_hash, role, permissions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          user.passwordHash,
          user.role,
          JSON.stringify(user.permissions),
          user.createdAt.toISOString()
        ]
      );

      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const userRow = await this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      if (!userRow) {
        return null;
      }

      return new User({
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        passwordHash: userRow.password_hash,
        role: userRow.role,
        permissions: JSON.parse(userRow.permissions),
        createdAt: new Date(userRow.created_at),
        lastLogin: userRow.last_login ? new Date(userRow.last_login) : null
      });
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId) {
    try {
      await this.db.run('DELETE FROM api_keys WHERE id = ?', [keyId]);
      
      // Remove from cache
      for (const [hash, keyData] of this.apiKeys.entries()) {
        if (keyData.id === keyId) {
          this.apiKeys.delete(hash);
          break;
        }
      }
    } catch (error) {
      throw new Error(`Failed to revoke API key: ${error.message}`);
    }
  }

  /**
   * Log authentication events for audit
   */
  async logAuthEvent(userId, username, action, success, details = null, req = null) {
    try {
      await this.db.run(
        `INSERT INTO auth_audit_log (id, user_id, username, action, success, details, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          username,
          action,
          success,
          details ? JSON.stringify(details) : null,
          req?.ip || req?.connection?.remoteAddress || null,
          req?.get('User-Agent') || null,
          new Date().toISOString()
        ]
      );
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }
}

// Helper function to parse time strings like '24h', '7d', etc.
function ms(str) {
  const units = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000
  };
  
  const match = str.match(/^(\d+)([a-z]+)$/);
  if (!match) throw new Error('Invalid time format');
  
  const [, amount, unit] = match;
  const multiplier = units[unit];
  if (!multiplier) throw new Error('Invalid time unit');
  
  return parseInt(amount) * multiplier;
}

module.exports = AuthService;
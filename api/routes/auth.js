const express = require('express');
const AuthService = require('../services/auth/authService');
const { authenticate, rateLimitAuth, requireAdmin } = require('../middleware/auth');
const { User, UserRole, Permission } = require('../models/user');

const router = express.Router();
const authService = new AuthService();

/**
 * @route POST /api/v2/auth/login
 * @desc Authenticate user with username/password
 * @access Public
 */
router.post('/login', rateLimitAuth(), async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Username and password are required'
      });
    }

    // Authenticate user
    const user = await authService.authenticateUser(username, password);
    
    // Generate JWT token
    const token = authService.generateToken(user);
    
    // Calculate expiration time (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Log successful login
    await authService.logAuthEvent(
      user.id,
      user.username,
      'login',
      true,
      { method: 'password' },
      req
    );

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON(),
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Login error:', error.message);
    
    // Log failed login
    await authService.logAuthEvent(
      null,
      req.body.username || null,
      'login',
      false,
      { method: 'password', error: error.message },
      req
    );

    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid username or password'
    });
  }
});

/**
 * @route POST /api/v2/auth/logout
 * @desc Logout user (invalidate session)
 * @access Private
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    // For JWT tokens, we could maintain a blacklist in production
    // For now, we'll just log the logout event
    
    await authService.logAuthEvent(
      req.auth.userId || null,
      req.auth.username || req.auth.keyName || null,
      'logout',
      true,
      { authType: req.auth.type },
      req
    );

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed'
    });
  }
});

/**
 * @route GET /api/v2/auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    if (req.auth.type === 'jwt') {
      // Return user information
      const user = await authService.getUserById(req.auth.userId);
      if (!user) {
        return res.status(404).json({
          error: 'Not found',
          message: 'User not found'
        });
      }

      res.json({
        user: user.toJSON(),
        auth: {
          type: req.auth.type,
          role: req.auth.role,
          permissions: req.auth.permissions
        }
      });
    } else {
      // API key authentication
      res.json({
        auth: {
          type: req.auth.type,
          keyName: req.auth.keyName,
          permissions: req.auth.permissions
        }
      });
    }

  } catch (error) {
    console.error('Get user info error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user information'
    });
  }
});

/**
 * @route POST /api/v2/auth/api-keys
 * @desc Generate new API key
 * @access Private (Admin only)
 */
router.post('/api-keys', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { name, permissions, expiresIn } = req.body;

    // Validate input
    if (!name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'API key name is required'
      });
    }

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Permissions array is required'
      });
    }

    // Validate permissions
    for (const permission of permissions) {
      if (!Permission.isValid(permission)) {
        return res.status(400).json({
          error: 'Bad request',
          message: `Invalid permission: ${permission}`
        });
      }
    }

    // Generate API key
    const { apiKey, key } = await authService.generateApiKey(
      name,
      permissions,
      expiresIn,
      req.auth.userId
    );

    // Log API key creation
    await authService.logAuthEvent(
      req.auth.userId,
      req.auth.username,
      'api_key_created',
      true,
      { keyId: apiKey.id, keyName: name, permissions },
      req
    );

    res.status(201).json({
      message: 'API key created successfully',
      apiKey: {
        ...apiKey.toJSON(),
        key // Include the actual key only in the response
      }
    });

  } catch (error) {
    console.error('API key creation error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create API key'
    });
  }
});

/**
 * @route GET /api/v2/auth/api-keys
 * @desc List user's API keys
 * @access Private
 */
router.get('/api-keys', authenticate, async (req, res) => {
  try {
    if (req.auth.type !== 'jwt') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User authentication required'
      });
    }

    // Get user's API keys from database
    const keyRows = await authService.db.all(
      'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [req.auth.userId]
    );

    const apiKeys = keyRows.map(row => ({
      id: row.id,
      name: row.name,
      permissions: JSON.parse(row.permissions),
      createdAt: row.created_at,
      lastUsed: row.last_used,
      expiresAt: row.expires_at,
      isExpired: row.expires_at ? new Date() > new Date(row.expires_at) : false
    }));

    res.json({
      apiKeys,
      total: apiKeys.length
    });

  } catch (error) {
    console.error('List API keys error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API keys'
    });
  }
});

/**
 * @route DELETE /api/v2/auth/api-keys/:id
 * @desc Revoke API key
 * @access Private
 */
router.delete('/api-keys/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.auth.type !== 'jwt') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User authentication required'
      });
    }

    // Check if API key exists and belongs to user (or user is admin)
    const keyRow = await authService.db.get(
      'SELECT * FROM api_keys WHERE id = ?',
      [id]
    );

    if (!keyRow) {
      return res.status(404).json({
        error: 'Not found',
        message: 'API key not found'
      });
    }

    // Only allow deletion if user owns the key or is admin
    if (keyRow.user_id !== req.auth.userId && req.auth.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete API key that belongs to another user'
      });
    }

    // Revoke the API key
    await authService.revokeApiKey(id);

    // Log API key deletion
    await authService.logAuthEvent(
      req.auth.userId,
      req.auth.username,
      'api_key_revoked',
      true,
      { keyId: id, keyName: keyRow.name },
      req
    );

    res.json({
      message: 'API key revoked successfully'
    });

  } catch (error) {
    console.error('Revoke API key error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to revoke API key'
    });
  }
});

/**
 * @route POST /api/v2/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (req.auth.type !== 'jwt') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User authentication required'
      });
    }

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get user from database
    const user = await authService.getUserById(req.auth.userId);
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await authService.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await authService.hashPassword(newPassword);

    // Update password in database
    await authService.db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, user.id]
    );

    // Log password change
    await authService.logAuthEvent(
      user.id,
      user.username,
      'password_changed',
      true,
      null,
      req
    );

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to change password'
    });
  }
});

module.exports = router;
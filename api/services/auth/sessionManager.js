const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Database = require('../../models/database');

/**
 * Session Management Service
 * Handles session creation, validation, and cleanup
 */
class SessionManager {
  constructor() {
    this.db = Database.getInstance();
    this.activeSessions = new Map(); // In-memory cache for active sessions
    this.maxConcurrentSessions = process.env.MAX_CONCURRENT_SESSIONS || 5;
    this.sessionTimeout = process.env.SESSION_TIMEOUT || '24h';
    
    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Create new session for user
   */
  async createSession(userId, token, expiresIn = null) {
    try {
      const sessionId = uuidv4();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Calculate expiration
      const expiresAt = new Date();
      if (expiresIn) {
        expiresAt.setTime(expiresAt.getTime() + this.parseTimeString(expiresIn));
      } else {
        expiresAt.setTime(expiresAt.getTime() + this.parseTimeString(this.sessionTimeout));
      }

      // Check for existing sessions and enforce concurrent session limit
      await this.enforceConcurrentSessionLimit(userId);

      // Store session in database
      await this.db.run(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          userId,
          tokenHash,
          expiresAt.toISOString(),
          new Date().toISOString()
        ]
      );

      // Cache session in memory
      const sessionData = {
        id: sessionId,
        userId: userId,
        tokenHash: tokenHash,
        expiresAt: expiresAt,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.activeSessions.set(sessionId, sessionData);

      return sessionData;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Validate session by token
   */
  async validateSession(token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Try cache first
      for (const [sessionId, sessionData] of this.activeSessions.entries()) {
        if (sessionData.tokenHash === tokenHash) {
          // Check if expired
          if (new Date() > sessionData.expiresAt) {
            await this.invalidateSession(sessionId);
            throw new Error('Session expired');
          }

          // Update last activity
          sessionData.lastActivity = new Date();
          return sessionData;
        }
      }

      // Not in cache, check database
      const sessionRow = await this.db.get(
        'SELECT * FROM sessions WHERE token_hash = ?',
        [tokenHash]
      );

      if (!sessionRow) {
        throw new Error('Session not found');
      }

      // Check if expired
      const expiresAt = new Date(sessionRow.expires_at);
      if (new Date() > expiresAt) {
        await this.invalidateSession(sessionRow.id);
        throw new Error('Session expired');
      }

      // Load into cache
      const sessionData = {
        id: sessionRow.id,
        userId: sessionRow.user_id,
        tokenHash: sessionRow.token_hash,
        expiresAt: expiresAt,
        createdAt: new Date(sessionRow.created_at),
        lastActivity: new Date()
      };

      this.activeSessions.set(sessionRow.id, sessionData);
      return sessionData;

    } catch (error) {
      throw new Error(`Session validation failed: ${error.message}`);
    }
  }

  /**
   * Invalidate session by ID
   */
  async invalidateSession(sessionId) {
    try {
      // Remove from database
      await this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      
      // Remove from cache
      this.activeSessions.delete(sessionId);
    } catch (error) {
      throw new Error(`Failed to invalidate session: ${error.message}`);
    }
  }

  /**
   * Invalidate session by token
   */
  async invalidateSessionByToken(token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Find session ID
      const sessionRow = await this.db.get(
        'SELECT id FROM sessions WHERE token_hash = ?',
        [tokenHash]
      );

      if (sessionRow) {
        await this.invalidateSession(sessionRow.id);
      }
    } catch (error) {
      throw new Error(`Failed to invalidate session by token: ${error.message}`);
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId) {
    try {
      // Get all session IDs for user
      const sessionRows = await this.db.all(
        'SELECT id FROM sessions WHERE user_id = ?',
        [userId]
      );

      // Remove from database
      await this.db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
      
      // Remove from cache
      for (const row of sessionRows) {
        this.activeSessions.delete(row.id);
      }
    } catch (error) {
      throw new Error(`Failed to invalidate user sessions: ${error.message}`);
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId) {
    try {
      const sessionRows = await this.db.all(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      return sessionRows.map(row => ({
        id: row.id,
        userId: row.user_id,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        isExpired: new Date() > new Date(row.expires_at)
      }));
    } catch (error) {
      throw new Error(`Failed to get user sessions: ${error.message}`);
    }
  }

  /**
   * Enforce concurrent session limit for user
   */
  async enforceConcurrentSessionLimit(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      const activeSessions = sessions.filter(s => !s.isExpired);

      if (activeSessions.length >= this.maxConcurrentSessions) {
        // Remove oldest sessions to make room
        const sessionsToRemove = activeSessions
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, activeSessions.length - this.maxConcurrentSessions + 1);

        for (const session of sessionsToRemove) {
          await this.invalidateSession(session.id);
        }
      }
    } catch (error) {
      console.error('Failed to enforce session limit:', error.message);
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const now = new Date().toISOString();
      
      // Get expired session IDs
      const expiredRows = await this.db.all(
        'SELECT id FROM sessions WHERE expires_at < ?',
        [now]
      );

      if (expiredRows.length > 0) {
        // Remove from database
        await this.db.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
        
        // Remove from cache
        for (const row of expiredRows) {
          this.activeSessions.delete(row.id);
        }

        console.log(`Cleaned up ${expiredRows.length} expired sessions`);
      }
    } catch (error) {
      console.error('Session cleanup error:', error.message);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    try {
      const totalSessions = await this.db.get(
        'SELECT COUNT(*) as count FROM sessions'
      );

      const activeSessions = await this.db.get(
        'SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?',
        [new Date().toISOString()]
      );

      const sessionsByUser = await this.db.all(`
        SELECT u.username, COUNT(s.id) as session_count 
        FROM users u 
        LEFT JOIN sessions s ON u.id = s.user_id AND s.expires_at > ?
        GROUP BY u.id, u.username
        ORDER BY session_count DESC
      `, [new Date().toISOString()]);

      return {
        total: totalSessions.count,
        active: activeSessions.count,
        cached: this.activeSessions.size,
        byUser: sessionsByUser
      };
    } catch (error) {
      throw new Error(`Failed to get session stats: ${error.message}`);
    }
  }

  /**
   * Parse time string to milliseconds
   */
  parseTimeString(timeStr) {
    const units = {
      ms: 1,
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000
    };
    
    const match = timeStr.match(/^(\d+)([a-z]+)$/);
    if (!match) {
      throw new Error('Invalid time format');
    }
    
    const [, amount, unit] = match;
    const multiplier = units[unit];
    if (!multiplier) {
      throw new Error('Invalid time unit');
    }
    
    return parseInt(amount) * multiplier;
  }

  /**
   * Shutdown session manager
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = SessionManager;
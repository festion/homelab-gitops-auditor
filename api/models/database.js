const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * Database connection and schema management
 */
class Database {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../data/auth.db');
    this.db = null;
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Initialize database connection
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error connecting to database:', err.message);
          reject(err);
        } else {
          console.log('Connected to SQLite database at:', this.dbPath);
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    const queries = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        last_login TEXT
      )`,

      // API keys table
      `CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]',
        last_used TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Sessions table  
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Audit log table for authentication events
      `CREATE TABLE IF NOT EXISTS auth_audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        resource TEXT,
        ip_address TEXT,
        user_agent TEXT,
        success BOOLEAN NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      )`,

      // Create indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id ON auth_audit_log(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at)`
    ];

    try {
      for (const query of queries) {
        await this.run(query);
      }
      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }

  /**
   * Run SQL query with parameters
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get single row from query
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all rows from query
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Create default admin user if no users exist
   */
  async createDefaultAdmin() {
    const bcrypt = require('bcrypt');
    const { User, UserRole } = require('./user');

    // Check if any users exist
    const userCount = await this.get('SELECT COUNT(*) as count FROM users');
    
    if (userCount.count === 0) {
      console.log('No users found, creating default admin user...');
      
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      
      const adminUser = new User({
        username: 'admin',
        email: 'admin@homelab.local',
        passwordHash: passwordHash,
        role: UserRole.ADMIN
      });

      await this.run(
        `INSERT INTO users (id, username, email, password_hash, role, permissions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          adminUser.id,
          adminUser.username,
          adminUser.email,
          adminUser.passwordHash,
          adminUser.role,
          JSON.stringify(adminUser.permissions),
          adminUser.createdAt.toISOString()
        ]
      );

      console.log('Default admin user created:');
      console.log('  Username: admin');
      console.log('  Password:', defaultPassword);
      console.log('  Email: admin@homelab.local');
      console.log('');
      console.log('⚠️  IMPORTANT: Change the default password after first login!');
    }
  }

  /**
   * Get database instance (singleton pattern)
   */
  static getInstance(dbPath = null) {
    if (!Database.instance) {
      Database.instance = new Database(dbPath);
    }
    return Database.instance;
  }
}

module.exports = Database;
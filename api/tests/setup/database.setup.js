const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Test database setup and teardown
class TestDatabase {
  constructor() {
    this.db = null;
    this.dbPath = ':memory:';
  }

  async setup() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          this.initializeSchema()
            .then(() => this.seedTestData())
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  async initializeSchema() {
    const schemas = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Repositories table
      `CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        full_name TEXT UNIQUE NOT NULL,
        branch TEXT DEFAULT 'main',
        status TEXT DEFAULT 'active',
        compliance_score INTEGER DEFAULT 0,
        last_scan DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Pipelines table
      `CREATE TABLE IF NOT EXISTS pipelines (
        id TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        workflow TEXT NOT NULL,
        branch TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME,
        completed_at DATETIME,
        duration INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repository) REFERENCES repositories(id)
      )`,
      
      // Compliance table
      `CREATE TABLE IF NOT EXISTS compliance (
        id TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        template TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        issues TEXT,
        applied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repository) REFERENCES repositories(id)
      )`,
      
      // Metrics table
      `CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        repository TEXT,
        value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )`,
      
      // Orchestrations table
      `CREATE TABLE IF NOT EXISTS orchestrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        repositories TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const schema of schemas) {
      await this.run(schema);
    }
  }

  async seedTestData() {
    const testData = [
      // Test users
      {
        table: 'users',
        data: [
          {
            id: 'test-user-admin',
            username: 'testadmin',
            email: 'admin@test.com',
            password_hash: '$2b$10$test.hash.for.admin',
            role: 'admin'
          },
          {
            id: 'test-user-viewer',
            username: 'testviewer',
            email: 'viewer@test.com',
            password_hash: '$2b$10$test.hash.for.viewer',
            role: 'viewer'
          }
        ]
      },
      
      // Test repositories
      {
        table: 'repositories',
        data: [
          {
            id: 'test-repo-1',
            name: 'test-repo-1',
            owner: 'test-owner',
            full_name: 'test-owner/test-repo-1',
            branch: 'main',
            status: 'active',
            compliance_score: 85
          },
          {
            id: 'test-repo-2',
            name: 'test-repo-2',
            owner: 'test-owner',
            full_name: 'test-owner/test-repo-2',
            branch: 'main',
            status: 'active',
            compliance_score: 72
          }
        ]
      },
      
      // Test pipelines
      {
        table: 'pipelines',
        data: [
          {
            id: 'test-pipeline-1',
            repository: 'test-repo-1',
            workflow: 'ci.yml',
            branch: 'main',
            status: 'success',
            started_at: new Date(Date.now() - 3600000).toISOString(),
            completed_at: new Date(Date.now() - 3300000).toISOString(),
            duration: 300000
          },
          {
            id: 'test-pipeline-2',
            repository: 'test-repo-2',
            workflow: 'ci.yml',
            branch: 'main',
            status: 'failed',
            started_at: new Date(Date.now() - 7200000).toISOString(),
            completed_at: new Date(Date.now() - 6900000).toISOString(),
            duration: 300000
          }
        ]
      }
    ];

    for (const { table, data } of testData) {
      for (const row of data) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        await this.run(sql, Object.values(row));
      }
    }
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
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

  async all(sql, params = []) {
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

  async cleanup() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

// Global test database instance
global.testDB = new TestDatabase();

// Setup and teardown hooks
beforeAll(async () => {
  await global.testDB.setup();
});

afterAll(async () => {
  await global.testDB.cleanup();
});

// Reset database between test suites
afterEach(async () => {
  // Clear dynamic data but keep seed data
  await global.testDB.run('DELETE FROM pipelines WHERE id NOT LIKE "test-pipeline-%"');
  await global.testDB.run('DELETE FROM compliance WHERE id NOT LIKE "test-compliance-%"');
  await global.testDB.run('DELETE FROM metrics WHERE id NOT LIKE "test-metric-%"');
  await global.testDB.run('DELETE FROM orchestrations WHERE id NOT LIKE "test-orchestration-%"');
});

// Helper functions
global.setupTestDatabase = async () => {
  if (!global.testDB.db) {
    await global.testDB.setup();
  }
};

global.cleanupTestDatabase = async () => {
  await global.testDB.cleanup();
};

global.getTestDatabase = () => {
  return global.testDB;
};
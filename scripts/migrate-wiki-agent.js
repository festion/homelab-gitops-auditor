#!/usr/bin/env node
/**
 * WikiJS Agent Database Migration Script
 * 
 * Production-ready database migration system with:
 * - Version tracking and migration history
 * - Rollback capabilities for schema changes
 * - Comprehensive validation and error handling
 * - Environment-specific configuration
 * - Performance optimization with proper indexes
 * - Backup and recovery integration
 * 
 * Usage:
 *   node scripts/migrate-wiki-agent.js [command] [options]
 * 
 * Commands:
 *   migrate     - Run all pending migrations (default)
 *   rollback    - Rollback last migration
 *   status      - Show migration status
 *   validate    - Validate database integrity
 *   seed        - Seed with default configuration
 *   reset       - Reset database (WARNING: destructive)
 * 
 * Options:
 *   --env       - Environment (development|production) 
 *   --backup    - Create backup before migration
 *   --dry-run   - Show what would be done without executing
 *   --force     - Force operation (use with caution)
 *   --version   - Target specific migration version
 * 
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

class WikiAgentMigrator {
  constructor(options = {}) {
    this.options = options;
    this.environment = options.env || process.env.NODE_ENV || 'development';
    this.isProduction = this.environment === 'production';
    this.rootDir = options.rootDir || process.cwd();
    this.backupDir = path.join(this.rootDir, 'backups');
    
    // Database configuration
    this.dbConfig = {
      development: {
        path: path.join(this.rootDir, 'wiki-agent-dev.db'),
        backupRetention: 7,
        timeout: 5000
      },
      production: {
        path: path.join(this.rootDir, 'wiki-agent.db'),
        backupRetention: 30,
        timeout: 10000
      }
    };
    
    this.dbPath = this.dbConfig[this.environment].path;
    this.db = null;
    
    // Migration versions and definitions
    this.migrations = new Map([
      ['001', {
        name: 'Initial Schema Creation',
        description: 'Create core tables for document lifecycle tracking',
        up: this.migration001Up.bind(this),
        down: this.migration001Down.bind(this),
        critical: true
      }],
      ['002', {
        name: 'Performance Optimization',
        description: 'Add performance indexes and optimize queries',
        up: this.migration002Up.bind(this),
        down: this.migration002Down.bind(this),
        critical: false
      }],
      ['003', {
        name: 'Configuration Enhancement',
        description: 'Add advanced configuration options',
        up: this.migration003Up.bind(this),
        down: this.migration003Down.bind(this),
        critical: false
      }]
    ]);
    
    console.log(`📋 WikiJS Agent Migrator (${this.environment} environment)`);
    console.log(`💾 Database: ${this.dbPath}`);
  }

  /**
   * Initialize database connection and migration system
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // Ensure backup directory exists
      this.ensureDirectoryExists(this.backupDir);
      
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Failed to open database:', err);
          reject(err);
          return;
        }

        console.log('✅ Connected to WikiJS agent database');
        
        // Configure SQLite for optimal performance
        this.db.configure('busyTimeout', this.dbConfig[this.environment].timeout);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;', (err) => {
          if (err) {
            console.warn('⚠️  Failed to set SQLite optimizations:', err);
          } else {
            console.log('⚡ SQLite optimizations applied');
          }
          
          this.createMigrationTable()
            .then(() => resolve())
            .catch(reject);
        });
      });
    });
  }

  /**
   * Create migration tracking table
   */
  async createMigrationTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rollback_sql TEXT,
        checksum TEXT,
        execution_time_ms INTEGER,
        applied_by TEXT DEFAULT 'system'
      )
    `;
    
    await this.runQuery(sql);
    console.log('✅ Migration tracking table ready');
  }

  /**
   * Migration 001: Initial Schema Creation
   */
  async migration001Up() {
    const operations = [
      // Document lifecycle tracking
      {
        name: 'wiki_documents table',
        sql: `CREATE TABLE IF NOT EXISTS wiki_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_path TEXT UNIQUE NOT NULL,
          wiki_path TEXT,
          repository_name TEXT NOT NULL,
          source_location TEXT NOT NULL,
          document_type TEXT,
          content_hash TEXT,
          last_modified TIMESTAMP,
          sync_status TEXT NOT NULL DEFAULT 'DISCOVERED',
          priority_score INTEGER DEFAULT 50,
          wiki_page_id TEXT,
          last_upload_attempt TIMESTAMP,
          file_size INTEGER DEFAULT 0,
          error_message TEXT,
          metadata TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CHECK (priority_score >= 0 AND priority_score <= 100),
          CHECK (sync_status IN ('DISCOVERED', 'ANALYZING', 'READY', 'UPLOADING', 'UPLOADED', 'OUTDATED', 'CONFLICTED', 'FAILED', 'ARCHIVED'))
        )`
      },
      
      // Processing batches for efficiency tracking
      {
        name: 'processing_batches table',
        sql: `CREATE TABLE IF NOT EXISTS processing_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_type TEXT NOT NULL,
          batch_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          documents_total INTEGER DEFAULT 0,
          documents_processed INTEGER DEFAULT 0,
          documents_uploaded INTEGER DEFAULT 0,
          documents_failed INTEGER DEFAULT 0,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          error_summary TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
          CHECK (documents_total >= 0),
          CHECK (documents_processed >= 0),
          CHECK (documents_uploaded >= 0),
          CHECK (documents_failed >= 0)
        )`
      },
      
      // Configuration storage
      {
        name: 'agent_config table',
        sql: `CREATE TABLE IF NOT EXISTS agent_config (
          key TEXT PRIMARY KEY,
          value TEXT,
          description TEXT,
          config_type TEXT DEFAULT 'string',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CHECK (config_type IN ('string', 'number', 'boolean', 'json'))
        )`
      },
      
      // Daily statistics tracking
      {
        name: 'agent_stats table',
        sql: `CREATE TABLE IF NOT EXISTS agent_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stat_date DATE UNIQUE,
          documents_discovered INTEGER DEFAULT 0,
          documents_processed INTEGER DEFAULT 0,
          documents_uploaded INTEGER DEFAULT 0,
          documents_failed INTEGER DEFAULT 0,
          processing_time_ms INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CHECK (documents_discovered >= 0),
          CHECK (documents_processed >= 0),
          CHECK (documents_uploaded >= 0),
          CHECK (documents_failed >= 0),
          CHECK (processing_time_ms >= 0)
        )`
      },
      
      // Structured logging
      {
        name: 'agent_logs table',
        sql: `CREATE TABLE IF NOT EXISTS agent_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          level TEXT NOT NULL,
          component TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'))
        )`
      }
    ];

    for (const operation of operations) {
      await this.runQuery(operation.sql);
      console.log(`  ✅ Created ${operation.name}`);
    }
    
    return {
      rollbackSql: `
        DROP TABLE IF EXISTS agent_logs;
        DROP TABLE IF EXISTS agent_stats;
        DROP TABLE IF EXISTS agent_config;
        DROP TABLE IF EXISTS processing_batches;
        DROP TABLE IF EXISTS wiki_documents;
      `
    };
  }

  async migration001Down() {
    const tables = [
      'agent_logs',
      'agent_stats', 
      'agent_config',
      'processing_batches',
      'wiki_documents'
    ];
    
    for (const table of tables) {
      await this.runQuery(`DROP TABLE IF EXISTS ${table}`);
      console.log(`  ❌ Dropped table ${table}`);
    }
  }

  /**
   * Migration 002: Performance Optimization
   */
  async migration002Up() {
    const indexes = [
      {
        name: 'idx_wiki_docs_repo',
        sql: 'CREATE INDEX IF NOT EXISTS idx_wiki_docs_repo ON wiki_documents(repository_name)'
      },
      {
        name: 'idx_wiki_docs_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_wiki_docs_status ON wiki_documents(sync_status)'
      },
      {
        name: 'idx_wiki_docs_source',
        sql: 'CREATE INDEX IF NOT EXISTS idx_wiki_docs_source ON wiki_documents(source_location)'
      },
      {
        name: 'idx_wiki_docs_priority',
        sql: 'CREATE INDEX IF NOT EXISTS idx_wiki_docs_priority ON wiki_documents(priority_score DESC)'
      },
      {
        name: 'idx_wiki_docs_updated',
        sql: 'CREATE INDEX IF NOT EXISTS idx_wiki_docs_updated ON wiki_documents(updated_at DESC)'
      },
      {
        name: 'idx_processing_batches_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_processing_batches_status ON processing_batches(status)'
      },
      {
        name: 'idx_processing_batches_created',
        sql: 'CREATE INDEX IF NOT EXISTS idx_processing_batches_created ON processing_batches(created_at DESC)'
      },
      {
        name: 'idx_agent_stats_date',
        sql: 'CREATE INDEX IF NOT EXISTS idx_agent_stats_date ON agent_stats(stat_date)'
      },
      {
        name: 'idx_agent_logs_level',
        sql: 'CREATE INDEX IF NOT EXISTS idx_agent_logs_level ON agent_logs(level)'
      },
      {
        name: 'idx_agent_logs_timestamp',
        sql: 'CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON agent_logs(timestamp)'
      },
      {
        name: 'idx_agent_logs_component',
        sql: 'CREATE INDEX IF NOT EXISTS idx_agent_logs_component ON agent_logs(component)'
      }
    ];

    for (const index of indexes) {
      await this.runQuery(index.sql);
      console.log(`  ✅ Created index ${index.name}`);
    }

    return {
      rollbackSql: `
        DROP INDEX IF EXISTS idx_agent_logs_component;
        DROP INDEX IF EXISTS idx_agent_logs_timestamp;
        DROP INDEX IF EXISTS idx_agent_logs_level;
        DROP INDEX IF EXISTS idx_agent_stats_date;
        DROP INDEX IF EXISTS idx_processing_batches_created;
        DROP INDEX IF EXISTS idx_processing_batches_status;
        DROP INDEX IF EXISTS idx_wiki_docs_updated;
        DROP INDEX IF EXISTS idx_wiki_docs_priority;
        DROP INDEX IF EXISTS idx_wiki_docs_source;
        DROP INDEX IF EXISTS idx_wiki_docs_status;
        DROP INDEX IF EXISTS idx_wiki_docs_repo;
      `
    };
  }

  async migration002Down() {
    const indexes = [
      'idx_agent_logs_component',
      'idx_agent_logs_timestamp',
      'idx_agent_logs_level',
      'idx_agent_stats_date',
      'idx_processing_batches_created',
      'idx_processing_batches_status',
      'idx_wiki_docs_updated',
      'idx_wiki_docs_priority',
      'idx_wiki_docs_source',
      'idx_wiki_docs_status',
      'idx_wiki_docs_repo'
    ];
    
    for (const indexName of indexes) {
      await this.runQuery(`DROP INDEX IF EXISTS ${indexName}`);
      console.log(`  ❌ Dropped index ${indexName}`);
    }
  }

  /**
   * Migration 003: Configuration Enhancement
   */
  async migration003Up() {
    // Add default configuration values
    const defaultConfig = [
      ['auto_discovery_enabled', 'true', 'Enable automatic document discovery', 'boolean'],
      ['discovery_interval_hours', '24', 'Hours between automatic discovery runs', 'number'],
      ['batch_size', '10', 'Number of documents to process in each batch', 'number'],
      ['priority_threshold', '70', 'Minimum priority score for automatic processing', 'number'],
      ['homelab_repo_priority', '100', 'Priority boost for homelab-gitops-auditor docs', 'number'],
      ['wikijs_base_path', '/projects', 'Base path in WikiJS for uploaded documents', 'string'],
      ['enable_content_enhancement', 'true', 'Enable AI-powered content improvement', 'boolean'],
      ['enable_link_resolution', 'true', 'Enable automatic link resolution', 'boolean'],
      ['max_retries', '3', 'Maximum retry attempts for failed uploads', 'number'],
      ['backup_retention_days', this.isProduction ? '30' : '7', 'Days to keep database backups', 'number'],
      ['log_retention_days', this.isProduction ? '90' : '30', 'Days to keep log entries', 'number'],
      ['performance_monitoring', this.isProduction ? 'true' : 'false', 'Enable performance monitoring', 'boolean']
    ];

    for (const [key, value, description, configType] of defaultConfig) {
      await this.runQuery(
        'INSERT OR IGNORE INTO agent_config (key, value, description, config_type) VALUES (?, ?, ?, ?)',
        [key, value, description, configType]
      );
      console.log(`  ✅ Added config: ${key}`);
    }

    return {
      rollbackSql: `
        DELETE FROM agent_config WHERE key IN (
          'auto_discovery_enabled', 'discovery_interval_hours', 'batch_size',
          'priority_threshold', 'homelab_repo_priority', 'wikijs_base_path',
          'enable_content_enhancement', 'enable_link_resolution', 'max_retries',
          'backup_retention_days', 'log_retention_days', 'performance_monitoring'
        );
      `
    };
  }

  async migration003Down() {
    const configKeys = [
      'auto_discovery_enabled', 'discovery_interval_hours', 'batch_size',
      'priority_threshold', 'homelab_repo_priority', 'wikijs_base_path',
      'enable_content_enhancement', 'enable_link_resolution', 'max_retries',
      'backup_retention_days', 'log_retention_days', 'performance_monitoring'
    ];
    
    const placeholders = configKeys.map(() => '?').join(',');
    await this.runQuery(
      `DELETE FROM agent_config WHERE key IN (${placeholders})`,
      configKeys
    );
    
    console.log('  ❌ Removed enhanced configuration');
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    console.log('\n🚀 Starting database migration...');
    
    if (this.options.backup) {
      await this.createBackup('pre-migration');
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = Array.from(this.migrations.keys())
      .filter(version => !appliedMigrations.includes(version));

    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date (no pending migrations)');
      return;
    }

    console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
    pendingMigrations.forEach(version => {
      const migration = this.migrations.get(version);
      console.log(`  - ${version}: ${migration.name}`);
    });

    if (this.options.dryRun) {
      console.log('\n🔍 Dry run mode - no changes will be made');
      return;
    }

    for (const version of pendingMigrations) {
      await this.runMigration(version);
    }

    console.log('\n🎉 All migrations completed successfully!');
  }

  /**
   * Run a specific migration
   */
  async runMigration(version) {
    const migration = this.migrations.get(version);
    if (!migration) {
      throw new Error(`Migration ${version} not found`);
    }

    console.log(`\n⏳ Running migration ${version}: ${migration.name}`);
    
    const startTime = Date.now();
    let rollbackSql = null;

    try {
      const result = await migration.up();
      rollbackSql = result?.rollbackSql || null;
      
      const executionTime = Date.now() - startTime;
      const checksum = this.calculateMigrationChecksum(version);
      
      // Record successful migration
      await this.runQuery(
        `INSERT INTO schema_migrations 
         (version, name, description, rollback_sql, checksum, execution_time_ms) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [version, migration.name, migration.description, rollbackSql, checksum, executionTime]
      );

      console.log(`✅ Migration ${version} completed in ${executionTime}ms`);
      
    } catch (error) {
      console.error(`❌ Migration ${version} failed:`, error);
      
      // Log failed migration attempt
      await this.runQuery(
        `INSERT INTO schema_migrations 
         (version, name, description, execution_time_ms) 
         VALUES (?, ?, ?, ?)`,
        [version, migration.name + ' (FAILED)', error.message, Date.now() - startTime]
      );
      
      throw error;
    }
  }

  /**
   * Rollback the last migration
   */
  async rollback() {
    console.log('\n🔄 Rolling back last migration...');
    
    if (this.options.backup) {
      await this.createBackup('pre-rollback');
    }

    const lastMigration = await this.getQuery(
      'SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
    );

    if (!lastMigration) {
      console.log('ℹ️  No migrations to rollback');
      return;
    }

    const migration = this.migrations.get(lastMigration.version);
    if (!migration) {
      console.error(`❌ Migration definition for ${lastMigration.version} not found`);
      return;
    }

    console.log(`⏳ Rolling back migration ${lastMigration.version}: ${lastMigration.name}`);

    try {
      if (lastMigration.rollback_sql) {
        // Execute stored rollback SQL
        await this.runQuery(lastMigration.rollback_sql);
      } else {
        // Execute migration's down function
        await migration.down();
      }

      // Remove migration record
      await this.runQuery(
        'DELETE FROM schema_migrations WHERE version = ?',
        [lastMigration.version]
      );

      console.log(`✅ Rollback of migration ${lastMigration.version} completed`);

    } catch (error) {
      console.error(`❌ Rollback failed:`, error);
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async status() {
    console.log('\n📊 Migration Status\n');
    
    const appliedMigrations = await this.allQuery(
      'SELECT * FROM schema_migrations ORDER BY version'
    );

    console.log('Applied migrations:');
    if (appliedMigrations.length === 0) {
      console.log('  None');
    } else {
      appliedMigrations.forEach(migration => {
        const status = migration.name.includes('FAILED') ? '❌' : '✅';
        console.log(`  ${status} ${migration.version}: ${migration.name} (${migration.applied_at})`);
      });
    }

    console.log('\nAvailable migrations:');
    Array.from(this.migrations.entries()).forEach(([version, migration]) => {
      const isApplied = appliedMigrations.some(m => m.version === version);
      const status = isApplied ? '✅' : '⏳';
      const critical = migration.critical ? ' [CRITICAL]' : '';
      console.log(`  ${status} ${version}: ${migration.name}${critical}`);
    });

    console.log(`\nDatabase: ${this.dbPath}`);
    console.log(`Environment: ${this.environment}`);
  }

  /**
   * Validate database integrity
   */
  async validate() {
    console.log('\n🔍 Validating database integrity...');
    
    const validations = [
      {
        name: 'Schema integrity check',
        query: 'PRAGMA integrity_check',
        expectValue: 'ok'
      },
      {
        name: 'Foreign key constraints',
        query: 'PRAGMA foreign_key_check',
        expectEmpty: true
      },
      {
        name: 'Required tables exist',
        query: `SELECT name FROM sqlite_master WHERE type='table' AND name IN 
                ('wiki_documents', 'processing_batches', 'agent_config', 'agent_stats', 'agent_logs')`,
        expectCount: 5
      },
      {
        name: 'Configuration completeness',
        query: 'SELECT COUNT(*) as count FROM agent_config',
        expectMinCount: 9
      }
    ];

    let allValid = true;

    for (const validation of validations) {
      try {
        const result = await (validation.expectEmpty || validation.expectCount || validation.expectMinCount ? 
          this.allQuery(validation.query) : this.getQuery(validation.query));
        
        let isValid = false;
        let message = '';

        if (validation.expectValue) {
          isValid = result && result.integrity_check === validation.expectValue;
          message = isValid ? 'OK' : `Expected ${validation.expectValue}, got ${result?.integrity_check}`;
        } else if (validation.expectEmpty) {
          isValid = !result || result.length === 0;
          message = isValid ? 'OK' : `Found ${result.length} constraint violations`;
        } else if (validation.expectCount) {
          isValid = result && result.length === validation.expectCount;
          message = isValid ? 'OK' : `Expected ${validation.expectCount}, found ${result.length}`;
        } else if (validation.expectMinCount) {
          const count = result[0]?.count || 0;
          isValid = count >= validation.expectMinCount;
          message = isValid ? `OK (${count})` : `Expected >= ${validation.expectMinCount}, found ${count}`;
        }

        console.log(`  ${isValid ? '✅' : '❌'} ${validation.name}: ${message}`);
        if (!isValid) allValid = false;

      } catch (error) {
        console.log(`  ❌ ${validation.name}: ERROR - ${error.message}`);
        allValid = false;
      }
    }

    console.log(`\n${allValid ? '✅' : '❌'} Database integrity: ${allValid ? 'VALID' : 'ISSUES FOUND'}`);
    return allValid;
  }

  /**
   * Reset database (WARNING: destructive)
   */
  async reset() {
    if (!this.options.force) {
      throw new Error('Reset requires --force flag for safety');
    }

    console.log('\n🗑️  RESETTING DATABASE (destructive operation)...');
    
    await this.createBackup('pre-reset');
    
    // Close current connection
    if (this.db) {
      await new Promise((resolve) => this.db.close(resolve));
    }

    // Delete database file
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
      console.log('✅ Database file deleted');
    }

    // Reinitialize
    await this.initialize();
    await this.migrate();
    
    console.log('✅ Database reset and migrated');
  }

  /**
   * Create database backup
   */
  async createBackup(label = '') {
    if (!fs.existsSync(this.dbPath)) {
      console.log('ℹ️  No database file to backup');
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = label ? `-${label}` : '';
    const backupName = `wiki-agent-${this.environment}-${timestamp}${suffix}.db`;
    const backupPath = path.join(this.backupDir, backupName);

    fs.copyFileSync(this.dbPath, backupPath);
    console.log(`💾 Backup created: ${backupName}`);

    // Clean up old backups
    await this.cleanupOldBackups();
    
    return backupPath;
  }

  /**
   * Clean up old backup files
   */
  async cleanupOldBackups() {
    const retentionDays = this.dbConfig[this.environment].backupRetention;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    if (!fs.existsSync(this.backupDir)) {
      return;
    }

    const files = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('wiki-agent-') && file.endsWith('.db'))
      .map(file => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        return { file, filePath, mtime: stats.mtime.getTime() };
      })
      .filter(fileInfo => fileInfo.mtime < cutoffTime);

    files.forEach(fileInfo => {
      fs.unlinkSync(fileInfo.filePath);
      console.log(`🗑️  Deleted old backup: ${fileInfo.file}`);
    });

    if (files.length > 0) {
      console.log(`🧹 Cleaned up ${files.length} old backup(s)`);
    }
  }

  /**
   * Utility methods
   */
  async getAppliedMigrations() {
    const result = await this.allQuery(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return result.map(row => row.version);
  }

  calculateMigrationChecksum(version) {
    const migration = this.migrations.get(version);
    const content = JSON.stringify(migration);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async close() {
    if (this.db) {
      await new Promise((resolve) => this.db.close(resolve));
      console.log('📪 Database connection closed');
    }
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  
  const options = {
    env: args.includes('--env') ? args[args.indexOf('--env') + 1] : null,
    backup: args.includes('--backup'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    version: args.includes('--version') ? args[args.indexOf('--version') + 1] : null
  };

  const migrator = new WikiAgentMigrator(options);

  try {
    await migrator.initialize();

    switch (command) {
      case 'migrate':
        await migrator.migrate();
        break;
      case 'rollback':
        await migrator.rollback();
        break;
      case 'status':
        await migrator.status();
        break;
      case 'validate':
        await migrator.validate();
        break;
      case 'reset':
        await migrator.reset();
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log(`
Usage: node scripts/migrate-wiki-agent.js [command] [options]

Commands:
  migrate     Run all pending migrations (default)
  rollback    Rollback last migration
  status      Show migration status
  validate    Validate database integrity
  reset       Reset database (requires --force)

Options:
  --env [env]    Environment (development|production)
  --backup       Create backup before operation
  --dry-run      Show what would be done
  --force        Force destructive operations
  --version [v]  Target specific version
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
}

// Export for programmatic use
module.exports = WikiAgentMigrator;

// Run if called directly
if (require.main === module) {
  main();
}
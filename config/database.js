/**
 * WikiJS Agent Database Configuration
 * 
 * Environment-specific database settings for development, staging, and production
 * environments with optimal performance and security configurations.
 * 
 * Features:
 * - Environment-specific paths and settings
 * - Connection pooling and timeout configuration
 * - Security hardening options
 * - Backup and maintenance configuration
 * - Performance optimization settings
 * 
 * Version: 1.0.0
 */

const path = require('path');
const os = require('os');

/**
 * Base configuration shared across all environments
 */
const baseConfig = {
  // SQLite specific settings
  sqlite: {
    // Enable WAL mode for better concurrent access
    journalMode: 'WAL',
    
    // Optimize synchronization for performance vs durability trade-off
    synchronous: 'NORMAL', // FULL, NORMAL, OFF
    
    // Cache size in KB (negative = pages)
    cacheSize: -2000, // ~8MB cache
    
    // Connection timeout
    busyTimeout: 10000, // 10 seconds
    
    // Enable foreign key constraints
    foreignKeys: true,
    
    // Memory-mapped I/O size (0 = disabled)
    mmapSize: 268435456, // 256MB
    
    // Temporary directory for sort operations
    tempStore: 'MEMORY' // MEMORY, FILE, DEFAULT
  },
  
  // Application-level database settings
  application: {
    // Connection pool settings
    pool: {
      min: 1,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    },
    
    // Migration settings
    migrations: {
      directory: path.join(__dirname, '../scripts'),
      tableName: 'schema_migrations',
      disableMigrationsLock: false
    },
    
    // Security settings
    security: {
      // File permissions for database files (production only)
      fileMode: 0o600, // Read/write for owner only
      
      // Encryption at rest (requires SQLite with encryption support)
      encryption: {
        enabled: false, // Set to true if using SQLCipher
        keyPath: process.env.DB_ENCRYPTION_KEY_PATH || null
      }
    }
  }
};

/**
 * Environment-specific configurations
 */
const environments = {
  /**
   * Development environment configuration
   * Optimized for debugging and development workflow
   */
  development: {
    database: {
      // Database file location
      filename: process.env.DB_PATH || path.join(process.cwd(), 'wiki-agent-dev.db'),
      
      // Enable detailed logging
      debug: true,
      
      // Relaxed performance settings for development
      sqlite: {
        ...baseConfig.sqlite,
        synchronous: 'NORMAL',
        cacheSize: -1000, // ~4MB cache for dev
        busyTimeout: 5000 // 5 seconds
      }
    },
    
    application: {
      ...baseConfig.application,
      
      // Backup settings
      backup: {
        enabled: true,
        retentionDays: 7,
        directory: path.join(process.cwd(), 'backups'),
        schedule: null, // Manual backups only in dev
        compression: false
      },
      
      // Maintenance settings
      maintenance: {
        autoVacuum: 'INCREMENTAL',
        vacuumSchedule: null, // Manual only in dev
        analyzeSchedule: null,
        logRetentionDays: 30
      },
      
      // Performance monitoring
      monitoring: {
        enabled: true,
        slowQueryThreshold: 1000, // 1 second
        logQueries: true
      }
    }
  },

  /**
   * Staging environment configuration
   * Similar to production but with some relaxed settings for testing
   */
  staging: {
    database: {
      filename: process.env.DB_PATH || '/opt/wiki-agent/data/wiki-agent-staging.db',
      debug: false,
      
      sqlite: {
        ...baseConfig.sqlite,
        synchronous: 'NORMAL',
        cacheSize: -1500, // ~6MB cache
        busyTimeout: 8000 // 8 seconds
      }
    },
    
    application: {
      ...baseConfig.application,
      
      backup: {
        enabled: true,
        retentionDays: 14,
        directory: '/opt/wiki-agent/backups',
        schedule: '0 2 * * *', // Daily at 2 AM
        compression: true
      },
      
      maintenance: {
        autoVacuum: 'INCREMENTAL',
        vacuumSchedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
        analyzeSchedule: '0 4 * * 0', // Weekly on Sunday at 4 AM
        logRetentionDays: 60
      },
      
      monitoring: {
        enabled: true,
        slowQueryThreshold: 500, // 500ms
        logQueries: false
      }
    }
  },

  /**
   * Production environment configuration
   * Optimized for performance, reliability, and security
   */
  production: {
    database: {
      filename: process.env.DB_PATH || '/opt/wiki-agent/data/wiki-agent.db',
      debug: false,
      
      sqlite: {
        ...baseConfig.sqlite,
        synchronous: 'NORMAL', // Balance between performance and durability
        cacheSize: -4000, // ~16MB cache for production
        busyTimeout: 15000, // 15 seconds for high-load scenarios
        mmapSize: 536870912 // 512MB memory-mapped I/O
      }
    },
    
    application: {
      ...baseConfig.application,
      
      // Enhanced security for production
      security: {
        ...baseConfig.application.security,
        fileMode: 0o600, // Strict file permissions
        
        // Enable backup encryption in production
        encryption: {
          enabled: process.env.DB_ENCRYPTION_ENABLED === 'true',
          keyPath: process.env.DB_ENCRYPTION_KEY_PATH
        }
      },
      
      backup: {
        enabled: true,
        retentionDays: 30,
        directory: '/opt/wiki-agent/backups',
        schedule: '0 1 * * *', // Daily at 1 AM
        compression: true,
        
        // Additional production backup features
        remoteBackup: {
          enabled: process.env.REMOTE_BACKUP_ENABLED === 'true',
          destination: process.env.REMOTE_BACKUP_DESTINATION,
          schedule: '0 2 * * 0' // Weekly remote backup on Sunday at 2 AM
        }
      },
      
      maintenance: {
        autoVacuum: 'INCREMENTAL',
        vacuumSchedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
        analyzeSchedule: '0 4 * * 0', // Weekly on Sunday at 4 AM
        logRetentionDays: 90,
        
        // Production-specific maintenance
        integrityCheckSchedule: '0 5 * * 0', // Weekly integrity check
        performanceOptimization: {
          enabled: true,
          rebuildIndexesSchedule: '0 6 * * 0' // Weekly index rebuild
        }
      },
      
      monitoring: {
        enabled: true,
        slowQueryThreshold: 250, // 250ms for production alerting
        logQueries: false,
        
        // Enhanced production monitoring
        metrics: {
          enabled: true,
          exportInterval: 60000, // 1 minute
          metricsEndpoint: process.env.METRICS_ENDPOINT
        },
        
        alerts: {
          enabled: true,
          webhookUrl: process.env.ALERT_WEBHOOK_URL,
          thresholds: {
            connectionErrors: 5,
            slowQueries: 10,
            diskSpaceWarning: 0.8, // 80% disk usage
            diskSpaceCritical: 0.95 // 95% disk usage
          }
        }
      }
    }
  }
};

/**
 * Get configuration for current environment
 */
function getConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';
  
  if (!environments[env]) {
    throw new Error(`Unknown environment: ${env}`);
  }
  
  const config = environments[env];
  
  // Ensure backup directory exists for the environment
  const fs = require('fs');
  if (config.application.backup?.directory) {
    try {
      fs.mkdirSync(config.application.backup.directory, { recursive: true, mode: 0o700 });
    } catch (error) {
      console.warn(`Warning: Could not create backup directory: ${error.message}`);
    }
  }
  
  // Set appropriate file permissions in production
  if (env === 'production' && config.application.security?.fileMode) {
    const dbPath = config.database.filename;
    if (fs.existsSync(dbPath)) {
      try {
        fs.chmodSync(dbPath, config.application.security.fileMode);
      } catch (error) {
        console.warn(`Warning: Could not set database file permissions: ${error.message}`);
      }
    }
  }
  
  return {
    ...config,
    environment: env,
    isProduction: env === 'production',
    isDevelopment: env === 'development'
  };
}

/**
 * Validate configuration
 */
function validateConfig(config) {
  const required = ['database.filename'];
  const missing = [];
  
  for (const key of required) {
    const value = key.split('.').reduce((obj, k) => obj?.[k], config);
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  // Validate directory permissions
  const dbDir = path.dirname(config.database.filename);
  try {
    const fs = require('fs');
    fs.accessSync(dbDir, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`Database directory is not writable: ${dbDir}`);
  }
  
  return true;
}

/**
 * Get SQLite connection string with optimizations
 */
function getConnectionString(config) {
  const params = new URLSearchParams();
  
  if (config.database.sqlite) {
    const sqlite = config.database.sqlite;
    
    if (sqlite.journalMode) params.set('journal_mode', sqlite.journalMode);
    if (sqlite.synchronous) params.set('synchronous', sqlite.synchronous);
    if (sqlite.cacheSize) params.set('cache_size', sqlite.cacheSize.toString());
    if (sqlite.foreignKeys) params.set('foreign_keys', 'ON');
    if (sqlite.tempStore) params.set('temp_store', sqlite.tempStore);
    if (sqlite.mmapSize) params.set('mmap_size', sqlite.mmapSize.toString());
  }
  
  const queryString = params.toString();
  return queryString ? `${config.database.filename}?${queryString}` : config.database.filename;
}

module.exports = {
  getConfig,
  validateConfig,
  getConnectionString,
  environments
};
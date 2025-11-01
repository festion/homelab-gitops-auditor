const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs').promises;

class DeploymentRepository {
  constructor(options = {}) {
    this.config = options.database || {
      type: 'sqlite',
      path: path.join(__dirname, '../../../logs/deployments.db')
    };
    
    this.db = null;
    this.logger = options.logger;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.config.path);
      await fs.mkdir(dbDir, { recursive: true });
      
      // Open database connection
      this.db = await open({
        filename: this.config.path,
        driver: sqlite3.Database
      });
      
      // Enable foreign keys
      await this.db.exec('PRAGMA foreign_keys = ON');
      
      // Run migrations
      await this.runMigrations();
      
      this.isInitialized = true;
      this.logger?.info('Database initialized successfully', { 
        path: this.config.path,
        type: this.config.type
      });
      
      return true;
      
    } catch (error) {
      this.logger?.error('Failed to initialize database', {
        error: error.message,
        path: this.config.path
      });
      throw error;
    }
  }

  async runMigrations() {
    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        sql: `
          CREATE TABLE IF NOT EXISTS deployments (
            id TEXT PRIMARY KEY,
            repository TEXT NOT NULL,
            branch TEXT NOT NULL DEFAULT 'main',
            status TEXT NOT NULL DEFAULT 'queued',
            type TEXT NOT NULL DEFAULT 'deployment',
            priority TEXT NOT NULL DEFAULT 'normal',
            requested_by TEXT NOT NULL,
            requested_at DATETIME NOT NULL,
            started_at DATETIME,
            completed_at DATETIME,
            correlation_id TEXT,
            trigger_type TEXT,
            webhook_data TEXT,
            parameters TEXT,
            backup_path TEXT,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            original_deployment_id TEXT,
            rollback_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (original_deployment_id) REFERENCES deployments(id)
          );
        `
      },
      {
        version: 2,
        name: 'deployment_logs',
        sql: `
          CREATE TABLE IF NOT EXISTS deployment_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deployment_id TEXT NOT NULL,
            log_level TEXT NOT NULL DEFAULT 'info',
            log_type TEXT NOT NULL DEFAULT 'stdout',
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT,
            FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_id 
          ON deployment_logs(deployment_id);
          
          CREATE INDEX IF NOT EXISTS idx_deployment_logs_timestamp 
          ON deployment_logs(timestamp);
        `
      },
      {
        version: 3,
        name: 'deployment_metrics',
        sql: `
          CREATE TABLE IF NOT EXISTS deployment_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deployment_id TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            metric_value REAL NOT NULL,
            metric_unit TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT,
            FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_deployment_metrics_deployment_id 
          ON deployment_metrics(deployment_id);
          
          CREATE INDEX IF NOT EXISTS idx_deployment_metrics_name 
          ON deployment_metrics(metric_name);
        `
      },
      {
        version: 4,
        name: 'deployment_files',
        sql: `
          CREATE TABLE IF NOT EXISTS deployment_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deployment_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_operation TEXT NOT NULL,
            file_size INTEGER,
            file_hash TEXT,
            backup_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            processed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_deployment_files_deployment_id 
          ON deployment_files(deployment_id);
        `
      },
      {
        version: 5,
        name: 'schema_migrations',
        sql: `
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `
      }
    ];

    // Check if migrations table exists
    const hasMigrationsTable = await this.db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='schema_migrations'
    `);

    if (!hasMigrationsTable) {
      // Run all migrations for fresh database
      for (const migration of migrations) {
        await this.db.exec(migration.sql);
        this.logger?.debug('Applied migration', { 
          version: migration.version, 
          name: migration.name 
        });
      }
      
      // Record all migrations as applied
      for (const migration of migrations) {
        await this.db.run(
          'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );
      }
    } else {
      // Run only pending migrations
      const appliedMigrations = await this.db.all(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      
      const appliedVersions = new Set(appliedMigrations.map(m => m.version));
      
      for (const migration of migrations) {
        if (!appliedVersions.has(migration.version)) {
          await this.db.exec(migration.sql);
          await this.db.run(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [migration.version, migration.name]
          );
          
          this.logger?.info('Applied migration', { 
            version: migration.version, 
            name: migration.name 
          });
        }
      }
    }
  }

  async createDeployment(deployment) {
    this.ensureInitialized();
    
    const sql = `
      INSERT INTO deployments (
        id, repository, branch, status, type, priority, requested_by, 
        requested_at, correlation_id, trigger_type, webhook_data, 
        parameters, retry_count, max_retries, original_deployment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      deployment.id,
      deployment.repository,
      deployment.branch || 'main',
      deployment.status || 'queued',
      deployment.type || 'deployment',
      deployment.priority || 'normal',
      deployment.requestedBy,
      deployment.requestedAt,
      deployment.correlationId,
      deployment.trigger || null,
      deployment.webhookData ? JSON.stringify(deployment.webhookData) : null,
      deployment.parameters ? JSON.stringify(deployment.parameters) : null,
      deployment.retryCount || 0,
      deployment.maxRetries || 3,
      deployment.originalDeploymentId || null
    ];
    
    try {
      await this.db.run(sql, params);
      
      this.logger?.debug('Deployment created in database', { 
        deploymentId: deployment.id,
        repository: deployment.repository
      });
      
      return deployment.id;
      
    } catch (error) {
      this.logger?.error('Failed to create deployment', {
        deploymentId: deployment.id,
        error: error.message
      });
      throw error;
    }
  }

  async getDeployment(deploymentId) {
    this.ensureInitialized();
    
    const sql = `
      SELECT 
        id, repository, branch, status, type, priority, requested_by,
        requested_at, started_at, completed_at, correlation_id,
        trigger_type, webhook_data, parameters, backup_path,
        error_message, retry_count, max_retries, original_deployment_id,
        rollback_id, created_at, updated_at
      FROM deployments 
      WHERE id = ?
    `;
    
    try {
      const deployment = await this.db.get(sql, [deploymentId]);
      
      if (deployment) {
        return this.deserializeDeployment(deployment);
      }
      
      return null;
      
    } catch (error) {
      this.logger?.error('Failed to get deployment', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async updateDeployment(deploymentId, updates) {
    this.ensureInitialized();
    
    const allowedFields = [
      'status', 'started_at', 'completed_at', 'backup_path',
      'error_message', 'retry_count', 'rollback_id', 'updated_at'
    ];
    
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    // Always update the updated_at timestamp
    if (!updates.updated_at) {
      setClause.push('updated_at = CURRENT_TIMESTAMP');
    }
    
    params.push(deploymentId);
    
    const sql = `UPDATE deployments SET ${setClause.join(', ')} WHERE id = ?`;
    
    try {
      const result = await this.db.run(sql, params);
      
      if (result.changes === 0) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }
      
      this.logger?.debug('Deployment updated', {
        deploymentId,
        updatedFields: Object.keys(updates)
      });
      
      return result.changes;
      
    } catch (error) {
      this.logger?.error('Failed to update deployment', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async getRecentDeployments(limit = 10) {
    this.ensureInitialized();
    
    const sql = `
      SELECT 
        id, repository, branch, status, type, priority, requested_by,
        requested_at, started_at, completed_at, correlation_id,
        trigger_type, error_message, retry_count, created_at
      FROM deployments 
      ORDER BY requested_at DESC 
      LIMIT ?
    `;
    
    try {
      const deployments = await this.db.all(sql, [limit]);
      return deployments.map(d => this.deserializeDeployment(d));
      
    } catch (error) {
      this.logger?.error('Failed to get recent deployments', {
        error: error.message
      });
      throw error;
    }
  }

  async getDeploymentHistory(options = {}) {
    this.ensureInitialized();
    
    const {
      page = 1,
      limit = 20,
      status = null,
      repository = null,
      startDate = null,
      endDate = null
    } = options;
    
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (repository) {
      conditions.push('repository = ?');
      params.push(repository);
    }
    
    if (startDate) {
      conditions.push('requested_at >= ?');
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push('requested_at <= ?');
      params.push(endDate);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM deployments ${whereClause}`;
    const { total } = await this.db.get(countSql, params);
    
    // Get page data
    const dataSql = `
      SELECT 
        id, repository, branch, status, type, priority, requested_by,
        requested_at, started_at, completed_at, correlation_id,
        trigger_type, error_message, retry_count, created_at
      FROM deployments 
      ${whereClause}
      ORDER BY requested_at DESC 
      LIMIT ? OFFSET ?
    `;
    
    const deployments = await this.db.all(dataSql, [...params, limit, offset]);
    
    return {
      deployments: deployments.map(d => this.deserializeDeployment(d)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  async addDeploymentLog(deploymentId, logType, message, logLevel = 'info', metadata = null) {
    this.ensureInitialized();
    
    const sql = `
      INSERT INTO deployment_logs (deployment_id, log_level, log_type, message, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = [
      deploymentId,
      logLevel,
      logType,
      message,
      metadata ? JSON.stringify(metadata) : null
    ];
    
    try {
      await this.db.run(sql, params);
      
      this.logger?.debug('Deployment log added', {
        deploymentId,
        logType,
        logLevel
      });
      
    } catch (error) {
      this.logger?.error('Failed to add deployment log', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async getDeploymentLogs(deploymentId, limit = 100) {
    this.ensureInitialized();
    
    const sql = `
      SELECT log_level, log_type, message, timestamp, metadata
      FROM deployment_logs 
      WHERE deployment_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    
    try {
      const logs = await this.db.all(sql, [deploymentId, limit]);
      
      return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));
      
    } catch (error) {
      this.logger?.error('Failed to get deployment logs', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async addDeploymentFile(deploymentId, fileData) {
    this.ensureInitialized();
    
    const sql = `
      INSERT INTO deployment_files (
        deployment_id, file_path, file_operation, file_size, 
        file_hash, backup_path, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      deploymentId,
      fileData.path,
      fileData.operation,
      fileData.size || null,
      fileData.hash || null,
      fileData.backupPath || null,
      fileData.status || 'pending'
    ];
    
    try {
      const result = await this.db.run(sql, params);
      return result.lastID;
      
    } catch (error) {
      this.logger?.error('Failed to add deployment file', {
        deploymentId,
        filePath: fileData.path,
        error: error.message
      });
      throw error;
    }
  }

  async updateDeploymentFile(fileId, updates) {
    this.ensureInitialized();
    
    const allowedFields = ['status', 'error_message', 'processed_at'];
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    params.push(fileId);
    
    const sql = `UPDATE deployment_files SET ${setClause.join(', ')} WHERE id = ?`;
    
    try {
      const result = await this.db.run(sql, params);
      return result.changes;
      
    } catch (error) {
      this.logger?.error('Failed to update deployment file', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  async getDeploymentFiles(deploymentId) {
    this.ensureInitialized();
    
    const sql = `
      SELECT id, file_path, file_operation, file_size, file_hash,
             backup_path, status, error_message, processed_at, created_at
      FROM deployment_files 
      WHERE deployment_id = ?
      ORDER BY created_at ASC
    `;
    
    try {
      return await this.db.all(sql, [deploymentId]);
      
    } catch (error) {
      this.logger?.error('Failed to get deployment files', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async recordMetric(deploymentId, metricName, metricValue, metricUnit = null, metadata = null) {
    this.ensureInitialized();
    
    const sql = `
      INSERT INTO deployment_metrics (deployment_id, metric_name, metric_value, metric_unit, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = [
      deploymentId,
      metricName,
      metricValue,
      metricUnit,
      metadata ? JSON.stringify(metadata) : null
    ];
    
    try {
      await this.db.run(sql, params);
      
    } catch (error) {
      this.logger?.error('Failed to record metric', {
        deploymentId,
        metricName,
        error: error.message
      });
      throw error;
    }
  }

  async getDeploymentMetrics(deploymentId) {
    this.ensureInitialized();
    
    const sql = `
      SELECT metric_name, metric_value, metric_unit, timestamp, metadata
      FROM deployment_metrics 
      WHERE deployment_id = ?
      ORDER BY timestamp ASC
    `;
    
    try {
      const metrics = await this.db.all(sql, [deploymentId]);
      
      return metrics.map(metric => ({
        ...metric,
        metadata: metric.metadata ? JSON.parse(metric.metadata) : null
      }));
      
    } catch (error) {
      this.logger?.error('Failed to get deployment metrics', {
        deploymentId,
        error: error.message
      });
      throw error;
    }
  }

  async getDeploymentStats(timeRange = '24h') {
    this.ensureInitialized();
    
    const timeRanges = {
      '1h': 'datetime("now", "-1 hour")',
      '24h': 'datetime("now", "-1 day")',
      '7d': 'datetime("now", "-7 days")',
      '30d': 'datetime("now", "-30 days")'
    };
    
    const since = timeRanges[timeRange] || timeRanges['24h'];
    
    const sql = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(
          CASE 
            WHEN started_at IS NOT NULL AND completed_at IS NOT NULL 
            THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 * 60
            ELSE NULL 
          END
        ) as avg_duration_seconds
      FROM deployments 
      WHERE requested_at >= ${since}
      GROUP BY status
    `;
    
    try {
      const stats = await this.db.all(sql);
      
      const totalSql = `
        SELECT COUNT(*) as total_deployments
        FROM deployments 
        WHERE requested_at >= ${since}
      `;
      
      const { total_deployments } = await this.db.get(totalSql);
      
      return {
        timeRange,
        totalDeployments: total_deployments,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat.status] = {
            count: stat.count,
            avgDurationSeconds: stat.avg_duration_seconds
          };
          return acc;
        }, {})
      };
      
    } catch (error) {
      this.logger?.error('Failed to get deployment stats', {
        timeRange,
        error: error.message
      });
      throw error;
    }
  }

  async cleanup(olderThanDays = 30) {
    this.ensureInitialized();
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      // Delete old logs first (foreign key constraint)
      const logsResult = await this.db.run(`
        DELETE FROM deployment_logs 
        WHERE deployment_id IN (
          SELECT id FROM deployments 
          WHERE completed_at < ? 
          AND status IN ('completed', 'failed', 'rolled-back')
        )
      `, [cutoffDate.toISOString()]);
      
      // Delete old metrics
      const metricsResult = await this.db.run(`
        DELETE FROM deployment_metrics 
        WHERE deployment_id IN (
          SELECT id FROM deployments 
          WHERE completed_at < ? 
          AND status IN ('completed', 'failed', 'rolled-back')
        )
      `, [cutoffDate.toISOString()]);
      
      // Delete old files
      const filesResult = await this.db.run(`
        DELETE FROM deployment_files 
        WHERE deployment_id IN (
          SELECT id FROM deployments 
          WHERE completed_at < ? 
          AND status IN ('completed', 'failed', 'rolled-back')
        )
      `, [cutoffDate.toISOString()]);
      
      // Delete old deployments
      const deploymentsResult = await this.db.run(`
        DELETE FROM deployments 
        WHERE completed_at < ? 
        AND status IN ('completed', 'failed', 'rolled-back')
      `, [cutoffDate.toISOString()]);
      
      this.logger?.info('Database cleanup completed', {
        olderThanDays,
        deletedLogs: logsResult.changes,
        deletedMetrics: metricsResult.changes,
        deletedFiles: filesResult.changes,
        deletedDeployments: deploymentsResult.changes
      });
      
      return {
        deletedLogs: logsResult.changes,
        deletedMetrics: metricsResult.changes,
        deletedFiles: filesResult.changes,
        deletedDeployments: deploymentsResult.changes
      };
      
    } catch (error) {
      this.logger?.error('Database cleanup failed', {
        error: error.message
      });
      throw error;
    }
  }

  async checkHealth() {
    try {
      if (!this.db) {
        return { status: 'unhealthy', error: 'Database not initialized' };
      }
      
      // Test database connection
      await this.db.get('SELECT 1');
      
      // Get basic stats
      const stats = await this.db.get(`
        SELECT 
          (SELECT COUNT(*) FROM deployments) as total_deployments,
          (SELECT COUNT(*) FROM deployments WHERE status = 'queued') as queued,
          (SELECT COUNT(*) FROM deployments WHERE status = 'in-progress') as in_progress
      `);
      
      return {
        status: 'healthy',
        stats,
        path: this.config.path
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  deserializeDeployment(deployment) {
    return {
      ...deployment,
      webhookData: deployment.webhook_data ? JSON.parse(deployment.webhook_data) : null,
      parameters: deployment.parameters ? JSON.parse(deployment.parameters) : null,
      requestedBy: deployment.requested_by,
      requestedAt: deployment.requested_at,
      startedAt: deployment.started_at,
      completedAt: deployment.completed_at,
      correlationId: deployment.correlation_id,
      triggerType: deployment.trigger_type,
      backupPath: deployment.backup_path,
      errorMessage: deployment.error_message,
      retryCount: deployment.retry_count,
      maxRetries: deployment.max_retries,
      originalDeploymentId: deployment.original_deployment_id,
      rollbackId: deployment.rollback_id,
      createdAt: deployment.created_at,
      updatedAt: deployment.updated_at
    };
  }

  ensureInitialized() {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      
      this.logger?.info('Database connection closed');
    }
  }
}

module.exports = DeploymentRepository;
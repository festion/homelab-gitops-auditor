/**
 * Metrics Storage Layer
 * 
 * SQLite-based storage implementation for metrics data with optimized
 * time-series operations, aggregations, and efficient querying.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { 
    MetricDataPoint, 
    AggregatedMetrics,
    MetricsQuery 
} = require('../../models/metrics');

class MetricsStorage {
    constructor(config = {}) {
        this.config = config;
        this.dbPath = config.dbPath || path.join(__dirname, '../../data/metrics.db');
        this.db = null;
        this.isInitialized = false;
        this.batchInsertSize = config.batchInsertSize || 100;
        
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    /**
     * Initialize the database and create tables
     */
    async initialize() {
        try {
            this.db = new sqlite3.Database(this.dbPath);
            await this.createTables();
            await this.optimizeDatabase();
            this.isInitialized = true;
            
            console.log(`Metrics database initialized at: ${this.dbPath}`);
        } catch (error) {
            console.error('Failed to initialize metrics database:', error);
            throw error;
        }
    }

    /**
     * Create database tables and indexes
     */
    async createTables() {
        const schemaPath = path.join(__dirname, '../../schemas/metrics.sql');
        
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            const statements = schema.split(';').filter(stmt => stmt.trim());
            
            for (const statement of statements) {
                if (statement.trim()) {
                    await this.runQuery(statement);
                }
            }
        } else {
            // Fallback: create basic tables
            await this.createBasicTables();
        }
    }

    /**
     * Create basic tables if schema file is not available
     */
    async createBasicTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type VARCHAR(100) NOT NULL,
                entity_id VARCHAR(255) NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                value REAL NOT NULL DEFAULT 0,
                unit VARCHAR(50) DEFAULT '',
                metadata TEXT DEFAULT '{}',
                tags TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS metrics_aggregated (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type VARCHAR(100) NOT NULL,
                entity_id VARCHAR(255) NOT NULL,
                interval VARCHAR(20) NOT NULL,
                timestamp DATETIME NOT NULL,
                aggregations TEXT NOT NULL DEFAULT '{}',
                metadata TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_metrics_type_entity_time 
                ON metrics(metric_type, entity_id, timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_metrics_timestamp 
                ON metrics(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_metrics_aggregated_type_entity_interval_time 
                ON metrics_aggregated(metric_type, entity_id, interval, timestamp)`
        ];

        for (const table of tables) {
            await this.runQuery(table);
        }
    }

    /**
     * Optimize database settings for time-series data
     */
    async optimizeDatabase() {
        const optimizations = [
            'PRAGMA journal_mode = WAL',
            'PRAGMA synchronous = NORMAL',
            'PRAGMA cache_size = 10000',
            'PRAGMA temp_store = MEMORY',
            'PRAGMA mmap_size = 268435456' // 256MB
        ];

        for (const pragma of optimizations) {
            await this.runQuery(pragma);
        }
    }

    /**
     * Store a single metric
     * @param {MetricDataPoint} metric - Metric to store
     */
    async storeMetric(metric) {
        const data = metric.toStorageFormat();
        
        const sql = `
            INSERT INTO metrics (metric_type, entity_id, timestamp, value, unit, metadata, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            data.metric_type,
            data.entity_id,
            data.timestamp,
            data.value,
            data.unit,
            data.metadata,
            data.tags
        ];

        return await this.runQuery(sql, params);
    }

    /**
     * Store multiple metrics in batch
     * @param {Array<MetricDataPoint>} metrics - Array of metrics to store
     */
    async storeMetrics(metrics) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return;
        }

        const sql = `
            INSERT INTO metrics (metric_type, entity_id, timestamp, value, unit, metadata, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        // Process in batches for better performance
        for (let i = 0; i < metrics.length; i += this.batchInsertSize) {
            const batch = metrics.slice(i, i + this.batchInsertSize);
            await this.runTransaction(async () => {
                for (const metric of batch) {
                    const data = metric.toStorageFormat();
                    const params = [
                        data.metric_type,
                        data.entity_id,
                        data.timestamp,
                        data.value,
                        data.unit,
                        data.metadata,
                        data.tags
                    ];
                    await this.runQuery(sql, params);
                }
            });
        }
    }

    /**
     * Store aggregated metrics
     * @param {Array<AggregatedMetrics>} aggregations - Array of aggregated metrics
     */
    async storeAggregatedMetrics(aggregations) {
        if (!Array.isArray(aggregations) || aggregations.length === 0) {
            return;
        }

        const sql = `
            INSERT OR REPLACE INTO metrics_aggregated 
            (metric_type, entity_id, interval, timestamp, aggregations, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        await this.runTransaction(async () => {
            for (const aggregation of aggregations) {
                const data = aggregation.toStorageFormat();
                const params = [
                    data.metric_type,
                    data.entity_id,
                    data.interval,
                    data.timestamp,
                    data.aggregations,
                    data.metadata
                ];
                await this.runQuery(sql, params);
            }
        });
    }

    /**
     * Query metrics with filtering
     * @param {Object|MetricsQuery} query - Query parameters
     */
    async queryMetrics(query) {
        const q = query instanceof MetricsQuery ? query : this.buildMetricsQuery(query);
        const { sql, params } = this.buildSQL(q);
        
        const rows = await this.allQuery(sql, params);
        return rows.map(row => MetricDataPoint.fromStorageFormat(row));
    }

    /**
     * Get aggregated metrics
     * @param {Object} options - Query options
     */
    async getAggregatedMetrics(options = {}) {
        const {
            metricTypes = [],
            entityIds = [],
            interval = null,
            timeRange = {},
            limit = 1000
        } = options;

        let sql = 'SELECT * FROM metrics_aggregated WHERE 1=1';
        const params = [];

        if (metricTypes.length > 0) {
            sql += ` AND metric_type IN (${metricTypes.map(() => '?').join(',')})`;
            params.push(...metricTypes);
        }

        if (entityIds.length > 0) {
            sql += ` AND entity_id IN (${entityIds.map(() => '?').join(',')})`;
            params.push(...entityIds);
        }

        if (interval) {
            sql += ' AND interval = ?';
            params.push(interval);
        }

        if (timeRange.from) {
            sql += ' AND timestamp >= ?';
            params.push(timeRange.from.toISOString());
        }

        if (timeRange.to) {
            sql += ' AND timestamp <= ?';
            params.push(timeRange.to.toISOString());
        }

        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const rows = await this.allQuery(sql, params);
        return rows.map(row => AggregatedMetrics.fromStorageFormat(row));
    }

    /**
     * Get metrics overview/summary
     * @param {string} timeRange - Time range (e.g., '24h', '7d')
     */
    async getMetricsOverview(timeRange = '24h') {
        const { from, to } = this.parseTimeRange(timeRange);
        
        const sql = `
            SELECT 
                metric_type,
                COUNT(*) as total_points,
                MIN(value) as min_value,
                MAX(value) as max_value,
                AVG(value) as avg_value,
                MIN(timestamp) as first_recorded,
                MAX(timestamp) as last_recorded,
                COUNT(DISTINCT entity_id) as unique_entities
            FROM metrics 
            WHERE timestamp >= ? AND timestamp <= ?
            GROUP BY metric_type
            ORDER BY metric_type
        `;

        const summary = await this.allQuery(sql, [from.toISOString(), to.toISOString()]);
        
        // Get total counts
        const totalCountSql = `
            SELECT 
                COUNT(*) as total_metrics,
                COUNT(DISTINCT metric_type) as unique_metric_types,
                COUNT(DISTINCT entity_id) as unique_entities
            FROM metrics 
            WHERE timestamp >= ? AND timestamp <= ?
        `;
        
        const [totals] = await this.allQuery(totalCountSql, [from.toISOString(), to.toISOString()]);

        return {
            timeRange,
            period: { from: from.toISOString(), to: to.toISOString() },
            totals: totals || {},
            metricTypes: summary || [],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get latest metric values for entities
     * @param {Object} options - Query options
     */
    async getLatestMetrics(options = {}) {
        const { metricTypes = [], entityIds = [] } = options;
        
        let sql = `
            SELECT m1.*
            FROM metrics m1
            INNER JOIN (
                SELECT metric_type, entity_id, MAX(timestamp) as max_timestamp
                FROM metrics
                WHERE 1=1
        `;
        
        const params = [];
        
        if (metricTypes.length > 0) {
            sql += ` AND metric_type IN (${metricTypes.map(() => '?').join(',')})`;
            params.push(...metricTypes);
        }
        
        if (entityIds.length > 0) {
            sql += ` AND entity_id IN (${entityIds.map(() => '?').join(',')})`;
            params.push(...entityIds);
        }
        
        sql += `
                GROUP BY metric_type, entity_id
            ) m2 ON m1.metric_type = m2.metric_type 
                AND m1.entity_id = m2.entity_id 
                AND m1.timestamp = m2.max_timestamp
            ORDER BY m1.metric_type, m1.entity_id
        `;

        const rows = await this.allQuery(sql, params);
        return rows.map(row => MetricDataPoint.fromStorageFormat(row));
    }

    /**
     * Delete old metrics based on retention policy
     * @param {Date} retentionDate - Date before which to delete metrics
     */
    async deleteOldMetrics(retentionDate) {
        const deleteSql = 'DELETE FROM metrics WHERE timestamp < ?';
        const deleteAggregatedSql = 'DELETE FROM metrics_aggregated WHERE timestamp < ?';
        
        const result1 = await this.runQuery(deleteSql, [retentionDate.toISOString()]);
        const result2 = await this.runQuery(deleteAggregatedSql, [retentionDate.toISOString()]);
        
        // Run VACUUM to reclaim space
        await this.runQuery('VACUUM');
        
        return {
            deletedMetrics: result1.changes || 0,
            deletedAggregations: result2.changes || 0,
            deletedCount: (result1.changes || 0) + (result2.changes || 0)
        };
    }

    /**
     * Helper methods
     */

    buildMetricsQuery(options) {
        const query = new MetricsQuery();
        
        if (options.metricTypes) {
            query.whereMetricType(options.metricTypes);
        }
        
        if (options.entityIds) {
            query.whereEntity(options.entityIds);
        }
        
        if (options.timeRange) {
            query.whereTimeRange(options.timeRange.from, options.timeRange.to);
        }
        
        if (options.limit) {
            query.limitTo(options.limit);
        }
        
        if (options.orderBy) {
            query.orderBy(options.orderBy, options.orderDirection);
        }
        
        return query;
    }

    buildSQL(query) {
        let sql = 'SELECT * FROM metrics WHERE 1=1';
        const params = [];

        if (query.metricTypes.length > 0) {
            sql += ` AND metric_type IN (${query.metricTypes.map(() => '?').join(',')})`;
            params.push(...query.metricTypes);
        }

        if (query.entityIds.length > 0) {
            sql += ` AND entity_id IN (${query.entityIds.map(() => '?').join(',')})`;
            params.push(...query.entityIds);
        }

        if (query.timeRange.from) {
            sql += ' AND timestamp >= ?';
            params.push(query.timeRange.from);
        }

        if (query.timeRange.to) {
            sql += ' AND timestamp <= ?';
            params.push(query.timeRange.to);
        }

        // Add tag filters
        for (const [key, value] of Object.entries(query.filters)) {
            if (key.startsWith('tags.')) {
                const tagKey = key.replace('tags.', '');
                sql += ` AND JSON_EXTRACT(tags, '$.${tagKey}') = ?`;
                params.push(value);
            }
        }

        sql += ` ORDER BY ${query.orderBy} ${query.orderDirection}`;
        
        if (query.limit) {
            sql += ' LIMIT ?';
            params.push(query.limit);
        }

        return { sql, params };
    }

    parseTimeRange(timeRange) {
        const now = new Date();
        const match = timeRange.match(/^(\d+)([hdwm])$/);
        
        if (!match) {
            // Default to 24 hours
            return {
                from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                to: now
            };
        }

        const [, value, unit] = match;
        const multipliers = {
            h: 60 * 60 * 1000,        // hours
            d: 24 * 60 * 60 * 1000,   // days
            w: 7 * 24 * 60 * 60 * 1000, // weeks
            m: 30 * 24 * 60 * 60 * 1000 // months (approximate)
        };

        const from = new Date(now.getTime() - parseInt(value) * multipliers[unit]);
        return { from, to: now };
    }

    /**
     * Database operation helpers
     */

    runQuery(sql, params = []) {
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

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    getQuery(sql, params = []) {
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

    runTransaction(callback) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                Promise.resolve(callback())
                    .then(() => {
                        this.db.run('COMMIT', (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    })
                    .catch((error) => {
                        this.db.run('ROLLBACK', () => {
                            reject(error);
                        });
                    });
            });
        });
    }

    /**
     * Close the database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Metrics database connection closed');
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Get database statistics
     */
    async getStats() {
        const queries = [
            'SELECT COUNT(*) as total_metrics FROM metrics',
            'SELECT COUNT(*) as total_aggregations FROM metrics_aggregated',
            'SELECT COUNT(DISTINCT metric_type) as unique_metric_types FROM metrics',
            'SELECT COUNT(DISTINCT entity_id) as unique_entities FROM metrics'
        ];

        const results = await Promise.all(
            queries.map(query => this.getQuery(query))
        );

        return {
            totalMetrics: results[0]?.total_metrics || 0,
            totalAggregations: results[1]?.total_aggregations || 0,
            uniqueMetricTypes: results[2]?.unique_metric_types || 0,
            uniqueEntities: results[3]?.unique_entities || 0,
            dbPath: this.dbPath,
            isInitialized: this.isInitialized
        };
    }
}

module.exports = MetricsStorage;
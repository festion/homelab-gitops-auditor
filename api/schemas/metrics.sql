-- Metrics Database Schema
-- SQLite3 schema for comprehensive metrics collection and time-series storage

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Main metrics table for raw time-series data
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    value REAL NOT NULL DEFAULT 0,
    unit VARCHAR(50) DEFAULT '',
    metadata TEXT DEFAULT '{}',
    tags TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Aggregated metrics table for pre-computed aggregations
CREATE TABLE IF NOT EXISTS metrics_aggregated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    interval VARCHAR(20) NOT NULL, -- hour, day, week, month
    timestamp DATETIME NOT NULL,
    aggregations TEXT NOT NULL DEFAULT '{}', -- JSON with count, sum, avg, min, max, etc.
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Metric definitions table for metadata about metric types
CREATE TABLE IF NOT EXISTS metric_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    unit VARCHAR(50) DEFAULT '',
    category VARCHAR(100) DEFAULT 'general',
    aggregation_types TEXT DEFAULT '["avg","sum","min","max","count"]', -- JSON array
    retention_days INTEGER DEFAULT 90,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alert thresholds table for metric-based alerting
CREATE TABLE IF NOT EXISTS metric_thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) DEFAULT '*', -- * for all entities
    threshold_type VARCHAR(20) NOT NULL, -- 'above', 'below', 'change_rate'
    warning_value REAL,
    critical_value REAL,
    duration_minutes INTEGER DEFAULT 5, -- How long threshold must be exceeded
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alert history table to track fired alerts
CREATE TABLE IF NOT EXISTS metric_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    threshold_id INTEGER NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    alert_level VARCHAR(20) NOT NULL, -- 'warning', 'critical'
    current_value REAL NOT NULL,
    threshold_value REAL NOT NULL,
    message TEXT,
    fired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME DEFAULT NULL,
    is_resolved BOOLEAN DEFAULT 0,
    FOREIGN KEY (threshold_id) REFERENCES metric_thresholds(id)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_metrics_type_entity_time 
    ON metrics(metric_type, entity_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp 
    ON metrics(timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_entity_time 
    ON metrics(entity_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_type_time 
    ON metrics(metric_type, timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_aggregated_type_entity_interval_time 
    ON metrics_aggregated(metric_type, entity_id, interval, timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_aggregated_timestamp 
    ON metrics_aggregated(timestamp);

CREATE INDEX IF NOT EXISTS idx_metric_thresholds_type_entity 
    ON metric_thresholds(metric_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_metric_alerts_threshold_fired 
    ON metric_alerts(threshold_id, fired_at);

CREATE INDEX IF NOT EXISTS idx_metric_alerts_unresolved 
    ON metric_alerts(is_resolved, fired_at);

-- Views for common queries
CREATE VIEW IF NOT EXISTS latest_repository_metrics AS
SELECT 
    entity_id as repository,
    metric_type,
    value,
    unit,
    timestamp,
    json_extract(metadata, '$.health_score') as health_score,
    json_extract(tags, '$.repository') as repo_tag
FROM metrics 
WHERE metric_type LIKE 'repository.%'
    AND timestamp = (
        SELECT MAX(timestamp) 
        FROM metrics m2 
        WHERE m2.metric_type = metrics.metric_type 
            AND m2.entity_id = metrics.entity_id
    );

CREATE VIEW IF NOT EXISTS latest_pipeline_metrics AS
SELECT 
    entity_id as pipeline,
    json_extract(tags, '$.repository') as repository,
    metric_type,
    value,
    unit,
    timestamp
FROM metrics 
WHERE metric_type LIKE 'pipeline.%'
    AND timestamp = (
        SELECT MAX(timestamp) 
        FROM metrics m2 
        WHERE m2.metric_type = metrics.metric_type 
            AND m2.entity_id = metrics.entity_id
    );

CREATE VIEW IF NOT EXISTS latest_system_metrics AS
SELECT 
    metric_type,
    value,
    unit,
    timestamp,
    json_extract(tags, '$.component') as component
FROM metrics 
WHERE metric_type LIKE 'system.%'
    AND timestamp = (
        SELECT MAX(timestamp) 
        FROM metrics m2 
        WHERE m2.metric_type = metrics.metric_type
    );

-- Data retention trigger for automatic cleanup
CREATE TRIGGER IF NOT EXISTS cleanup_old_metrics
AFTER INSERT ON metrics
BEGIN
    DELETE FROM metrics 
    WHERE timestamp < datetime('now', '-90 days')
        AND metric_type NOT IN (
            SELECT metric_type 
            FROM metric_definitions 
            WHERE retention_days > 90
        );
END;

-- Insert default metric definitions
INSERT OR IGNORE INTO metric_definitions (metric_type, display_name, description, unit, category) VALUES
-- Repository metrics
('repository.health.score', 'Repository Health Score', 'Overall health score (0-100)', 'percentage', 'repository'),
('repository.health.uncommitted_changes', 'Uncommitted Changes', 'Number of uncommitted changes', 'count', 'repository'),
('repository.health.stale_tags', 'Stale Tags', 'Number of stale tags', 'count', 'repository'),
('repository.activity.commits_24h', 'Commits (24h)', 'Number of commits in last 24 hours', 'count', 'repository'),
('repository.activity.prs_open', 'Open Pull Requests', 'Number of open pull requests', 'count', 'repository'),
('repository.activity.issues_open', 'Open Issues', 'Number of open issues', 'count', 'repository'),
('repository.size.disk_usage', 'Disk Usage', 'Repository size on disk', 'bytes', 'repository'),
('repository.size.file_count', 'File Count', 'Total number of files', 'count', 'repository'),
('repository.security.vulnerabilities_critical', 'Critical Vulnerabilities', 'Number of critical security vulnerabilities', 'count', 'repository'),

-- Pipeline metrics
('pipeline.performance.duration', 'Pipeline Duration', 'Total pipeline execution time', 'seconds', 'pipeline'),
('pipeline.performance.queue_time', 'Queue Time', 'Time spent waiting in queue', 'seconds', 'pipeline'),
('pipeline.reliability.success_rate', 'Success Rate', 'Pipeline success rate percentage', 'percentage', 'pipeline'),
('pipeline.reliability.failure_rate', 'Failure Rate', 'Pipeline failure rate percentage', 'percentage', 'pipeline'),
('pipeline.resources.cpu_usage', 'CPU Usage', 'Pipeline CPU usage', 'percentage', 'pipeline'),
('pipeline.resources.memory_usage', 'Memory Usage', 'Pipeline memory usage', 'mb', 'pipeline'),
('pipeline.resources.artifact_size', 'Artifact Size', 'Size of generated artifacts', 'bytes', 'pipeline'),

-- System metrics
('system.api.requests_per_minute', 'API Requests/min', 'Number of API requests per minute', 'count', 'system'),
('system.api.avg_response_time', 'Avg Response Time', 'Average API response time', 'ms', 'system'),
('system.api.error_rate', 'API Error Rate', 'API error rate percentage', 'percentage', 'system'),
('system.resources.cpu_usage', 'System CPU Usage', 'System CPU usage percentage', 'percentage', 'system'),
('system.resources.memory_usage', 'System Memory Usage', 'System memory usage', 'mb', 'system'),
('system.resources.disk_usage', 'System Disk Usage', 'System disk usage percentage', 'percentage', 'system'),
('system.audit.repositories_scanned', 'Repositories Scanned', 'Number of repositories scanned', 'count', 'system'),
('system.audit.audit_duration', 'Audit Duration', 'Time taken for audit execution', 'seconds', 'system'),
('system.websocket.active_connections', 'Active WebSocket Connections', 'Number of active WebSocket connections', 'count', 'system');

-- Insert default alert thresholds
INSERT OR IGNORE INTO metric_thresholds (metric_type, threshold_type, warning_value, critical_value, duration_minutes) VALUES
-- Repository health thresholds
('repository.health.score', 'below', 70, 50, 10),
('repository.security.vulnerabilities_critical', 'above', 1, 5, 5),

-- Pipeline performance thresholds
('pipeline.performance.duration', 'above', 300, 600, 5), -- 5 min warning, 10 min critical
('pipeline.reliability.failure_rate', 'above', 20, 50, 15), -- 20% warning, 50% critical

-- System resource thresholds
('system.resources.cpu_usage', 'above', 80, 95, 5),
('system.resources.memory_usage', 'above', 8192, 12288, 5), -- 8GB warning, 12GB critical
('system.resources.disk_usage', 'above', 80, 95, 10),
('system.api.error_rate', 'above', 5, 15, 5), -- 5% warning, 15% critical
('system.api.avg_response_time', 'above', 1000, 5000, 5); -- 1s warning, 5s critical

-- Utility function to get metric summary (as a stored procedure equivalent)
-- Note: SQLite doesn't support stored procedures, but this query can be used directly
-- SELECT 
--     metric_type,
--     COUNT(*) as total_points,
--     MIN(value) as min_value,
--     MAX(value) as max_value,
--     AVG(value) as avg_value,
--     MIN(timestamp) as first_recorded,
--     MAX(timestamp) as last_recorded
-- FROM metrics 
-- WHERE timestamp >= datetime('now', '-24 hours')
-- GROUP BY metric_type
-- ORDER BY metric_type;
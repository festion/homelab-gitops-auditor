#!/bin/bash
set -e

echo "🚀 Starting Phase 2 Database Migration"

# Configuration
DB_NAME="gitops_audit"
BACKUP_DIR="/opt/gitops/backups"
MIGRATION_LOG="/opt/gitops/logs/migration-phase2.log"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$MIGRATION_LOG")"

# Log all operations
exec 1> >(tee -a "$MIGRATION_LOG")
exec 2> >(tee -a "$MIGRATION_LOG" >&2)

echo "$(date): Starting Phase 2 database migration"

# Backup current database
echo "📦 Creating database backup..."
BACKUP_FILE="$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DB_NAME" > "$BACKUP_FILE"
echo "✅ Database backup created: $BACKUP_FILE"

# Check if tables already exist (for safe re-runs)
check_table_exists() {
    local table_name="$1"
    psql -d "$DB_NAME" -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table_name');" -t | tr -d ' '
}

# Apply Phase 2 schema changes
echo "🔄 Applying schema migrations..."

# Add pipeline tracking tables
if [[ $(check_table_exists "pipeline_runs") == "f" ]]; then
    echo "Creating pipeline_runs table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE pipeline_runs (
        id SERIAL PRIMARY KEY,
        repository VARCHAR(255) NOT NULL,
        workflow_id VARCHAR(255) NOT NULL,
        run_id BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        conclusion VARCHAR(50),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        duration INTEGER,
        branch VARCHAR(255),
        commit_sha VARCHAR(255),
        actor VARCHAR(255),
        event VARCHAR(50),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX idx_pipeline_runs_repo ON pipeline_runs(repository);
    CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
    CREATE INDEX idx_pipeline_runs_workflow ON pipeline_runs(workflow_id);
    CREATE INDEX idx_pipeline_runs_started ON pipeline_runs(started_at);
    CREATE UNIQUE INDEX idx_pipeline_runs_unique ON pipeline_runs(repository, workflow_id, run_id);
    "
    echo "✅ pipeline_runs table created"
else
    echo "ℹ️  pipeline_runs table already exists, skipping..."
fi

# Add pipeline definitions table
if [[ $(check_table_exists "pipeline_definitions") == "f" ]]; then
    echo "Creating pipeline_definitions table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE pipeline_definitions (
        id SERIAL PRIMARY KEY,
        repository VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        workflow_file VARCHAR(255),
        enabled BOOLEAN DEFAULT true,
        configuration JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repository, name)
    );
    
    CREATE INDEX idx_pipeline_definitions_repo ON pipeline_definitions(repository);
    CREATE INDEX idx_pipeline_definitions_enabled ON pipeline_definitions(enabled);
    "
    echo "✅ pipeline_definitions table created"
else
    echo "ℹ️  pipeline_definitions table already exists, skipping..."
fi

# Add compliance tracking tables
if [[ $(check_table_exists "template_compliance") == "f" ]]; then
    echo "Creating template_compliance table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE template_compliance (
        id SERIAL PRIMARY KEY,
        repository VARCHAR(255) NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        template_version VARCHAR(50),
        compliant BOOLEAN NOT NULL,
        score INTEGER NOT NULL,
        max_score INTEGER DEFAULT 100,
        checked_at TIMESTAMP DEFAULT NOW(),
        issues JSONB,
        recommendations JSONB,
        metadata JSONB,
        UNIQUE(repository, template_name)
    );
    
    CREATE INDEX idx_template_compliance_repo ON template_compliance(repository);
    CREATE INDEX idx_template_compliance_template ON template_compliance(template_name);
    CREATE INDEX idx_template_compliance_score ON template_compliance(score);
    CREATE INDEX idx_template_compliance_checked ON template_compliance(checked_at);
    "
    echo "✅ template_compliance table created"
else
    echo "ℹ️  template_compliance table already exists, skipping..."
fi

# Add metrics tables
if [[ $(check_table_exists "metrics") == "f" ]]; then
    echo "Creating metrics table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE metrics (
        id SERIAL PRIMARY KEY,
        metric_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        metric_name VARCHAR(100) NOT NULL,
        metric_value NUMERIC,
        timestamp TIMESTAMP NOT NULL,
        data JSONB,
        tags JSONB,
        created_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX idx_metrics_type_time ON metrics(metric_type, timestamp);
    CREATE INDEX idx_metrics_entity ON metrics(entity_type, entity_id);
    CREATE INDEX idx_metrics_name ON metrics(metric_name);
    CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
    "
    echo "✅ metrics table created"
else
    echo "ℹ️  metrics table already exists, skipping..."
fi

# Add WebSocket session tracking
if [[ $(check_table_exists "websocket_sessions") == "f" ]]; then
    echo "Creating websocket_sessions table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE websocket_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) UNIQUE,
        user_id VARCHAR(255),
        user_agent TEXT,
        connected_at TIMESTAMP DEFAULT NOW(),
        last_activity TIMESTAMP DEFAULT NOW(),
        disconnected_at TIMESTAMP,
        ip_address INET,
        metadata JSONB
    );
    
    CREATE INDEX idx_websocket_sessions_user ON websocket_sessions(user_id);
    CREATE INDEX idx_websocket_sessions_connected ON websocket_sessions(connected_at);
    CREATE INDEX idx_websocket_sessions_active ON websocket_sessions(last_activity) WHERE disconnected_at IS NULL;
    "
    echo "✅ websocket_sessions table created"
else
    echo "ℹ️  websocket_sessions table already exists, skipping..."
fi

# Add real-time events table
if [[ $(check_table_exists "realtime_events") == "f" ]]; then
    echo "Creating realtime_events table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE realtime_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        event_data JSONB NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        processed BOOLEAN DEFAULT false,
        recipients JSONB,
        metadata JSONB
    );
    
    CREATE INDEX idx_realtime_events_type ON realtime_events(event_type);
    CREATE INDEX idx_realtime_events_entity ON realtime_events(entity_type, entity_id);
    CREATE INDEX idx_realtime_events_timestamp ON realtime_events(timestamp);
    CREATE INDEX idx_realtime_events_processed ON realtime_events(processed);
    "
    echo "✅ realtime_events table created"
else
    echo "ℹ️  realtime_events table already exists, skipping..."
fi

# Add orchestration jobs table
if [[ $(check_table_exists "orchestration_jobs") == "f" ]]; then
    echo "Creating orchestration_jobs table..."
    psql -d "$DB_NAME" -c "
    CREATE TABLE orchestration_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50) NOT NULL,
        job_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        repository VARCHAR(255),
        configuration JSONB,
        result JSONB,
        error_message TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX idx_orchestration_jobs_type ON orchestration_jobs(job_type);
    CREATE INDEX idx_orchestration_jobs_status ON orchestration_jobs(status);
    CREATE INDEX idx_orchestration_jobs_priority ON orchestration_jobs(priority);
    CREATE INDEX idx_orchestration_jobs_repo ON orchestration_jobs(repository);
    CREATE INDEX idx_orchestration_jobs_created ON orchestration_jobs(created_at);
    "
    echo "✅ orchestration_jobs table created"
else
    echo "ℹ️  orchestration_jobs table already exists, skipping..."
fi

# Create views for dashboard
echo "🔍 Creating dashboard views..."
psql -d "$DB_NAME" -c "
CREATE OR REPLACE VIEW v_pipeline_summary AS
SELECT 
    repository,
    COUNT(*) as total_runs,
    COUNT(CASE WHEN status = 'completed' AND conclusion = 'success' THEN 1 END) as successful_runs,
    COUNT(CASE WHEN status = 'completed' AND conclusion = 'failure' THEN 1 END) as failed_runs,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as running_runs,
    AVG(duration) as avg_duration,
    MAX(started_at) as last_run_at
FROM pipeline_runs
GROUP BY repository;

CREATE OR REPLACE VIEW v_compliance_summary AS
SELECT 
    repository,
    COUNT(*) as total_templates,
    COUNT(CASE WHEN compliant = true THEN 1 END) as compliant_templates,
    AVG(score) as avg_score,
    MAX(checked_at) as last_checked_at
FROM template_compliance
GROUP BY repository;

CREATE OR REPLACE VIEW v_system_metrics AS
SELECT 
    metric_type,
    metric_name,
    AVG(metric_value) as avg_value,
    MAX(metric_value) as max_value,
    MIN(metric_value) as min_value,
    COUNT(*) as data_points,
    MAX(timestamp) as last_recorded
FROM metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY metric_type, metric_name;
"
echo "✅ Dashboard views created"

# Create functions for data cleanup
echo "🧹 Creating cleanup functions..."
psql -d "$DB_NAME" -c "
CREATE OR REPLACE FUNCTION cleanup_old_metrics(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS \$\$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM metrics 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_events(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS \$\$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM realtime_events 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days
    AND processed = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_websocket_sessions(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER AS \$\$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM websocket_sessions 
    WHERE disconnected_at < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
\$\$ LANGUAGE plpgsql;
"
echo "✅ Cleanup functions created"

# Insert some initial data
echo "📊 Inserting initial configuration data..."
psql -d "$DB_NAME" -c "
INSERT INTO pipeline_definitions (repository, name, description, workflow_file, configuration)
VALUES 
    ('default', 'CI/CD Pipeline', 'Standard CI/CD pipeline template', '.github/workflows/ci-cd.yml', '{\"auto_deploy\": false}'),
    ('default', 'Security Scan', 'Security scanning pipeline', '.github/workflows/security.yml', '{\"scan_types\": [\"sast\", \"dependency\"]}'),
    ('default', 'Code Quality', 'Code quality checks', '.github/workflows/quality.yml', '{\"quality_gates\": {\"coverage\": 80, \"duplication\": 3}}')
ON CONFLICT (repository, name) DO NOTHING;
"
echo "✅ Initial data inserted"

# Create cleanup job
echo "📅 Setting up cleanup job..."
psql -d "$DB_NAME" -c "
INSERT INTO orchestration_jobs (job_type, job_name, status, priority, configuration)
VALUES (
    'cleanup',
    'daily-cleanup',
    'pending',
    1,
    '{\"schedule\": \"0 2 * * *\", \"tasks\": [\"cleanup_old_metrics\", \"cleanup_old_events\", \"cleanup_old_websocket_sessions\"]}'
)
ON CONFLICT DO NOTHING;
"
echo "✅ Cleanup job configured"

# Verify all tables were created
echo "✅ Verifying table creation..."
EXPECTED_TABLES=(
    "pipeline_runs"
    "pipeline_definitions"
    "template_compliance"
    "metrics"
    "websocket_sessions"
    "realtime_events"
    "orchestration_jobs"
)

for table in "${EXPECTED_TABLES[@]}"; do
    if [[ $(check_table_exists "$table") == "t" ]]; then
        echo "✅ $table table verified"
    else
        echo "❌ $table table not found!"
        exit 1
    fi
done

echo "📊 Database migration statistics:"
for table in "${EXPECTED_TABLES[@]}"; do
    count=$(psql -d "$DB_NAME" -c "SELECT COUNT(*) FROM $table;" -t | tr -d ' ')
    echo "  $table: $count rows"
done

echo "$(date): Phase 2 database migration completed successfully"
echo "✅ All Phase 2 database migrations completed successfully!"
echo "📋 Migration log: $MIGRATION_LOG"
echo "💾 Database backup: $BACKUP_FILE"
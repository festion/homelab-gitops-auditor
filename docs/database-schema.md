# WikiJS Agent Database Schema Documentation

## Overview

The WikiJS Agent uses a SQLite database to manage the complete document lifecycle from discovery through upload to WikiJS. The database schema is designed for optimal performance, data integrity, and comprehensive tracking of document processing operations.

**Database Location:**
- Development: `wiki-agent-dev.db`
- Production: `/opt/wiki-agent/data/wiki-agent.db`

**Schema Version:** 1.0.0 (Migration 003)

## Table Structure

### 1. wiki_documents

**Purpose:** Core document lifecycle tracking and metadata storage

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique document identifier |
| `source_path` | TEXT | UNIQUE NOT NULL | Full filesystem path to source document |
| `wiki_path` | TEXT | - | Target path in WikiJS (e.g., `/projects/homelab/readme`) |
| `repository_name` | TEXT | NOT NULL | Repository containing the document |
| `source_location` | TEXT | NOT NULL | Source classification (REPOS, GIT_ROOT, EXTERNAL) |
| `document_type` | TEXT | - | Document classification (README, DOCS, API, etc.) |
| `content_hash` | TEXT | - | SHA-256 hash for change detection |
| `last_modified` | TIMESTAMP | - | File system modification timestamp |
| `sync_status` | TEXT | NOT NULL DEFAULT 'DISCOVERED' | Processing status (see Status Values) |
| `priority_score` | INTEGER | DEFAULT 50, CHECK (0-100) | Processing priority (0-100) |
| `wiki_page_id` | TEXT | - | WikiJS page ID after successful upload |
| `last_upload_attempt` | TIMESTAMP | - | Timestamp of last upload attempt |
| `file_size` | INTEGER | DEFAULT 0 | File size in bytes |
| `error_message` | TEXT | - | Last error message if processing failed |
| `metadata` | TEXT | - | JSON string for additional document metadata |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last record update timestamp |

**Status Values:**
- `DISCOVERED` - Document found but not yet analyzed
- `ANALYZING` - Content analysis in progress
- `READY` - Ready for upload to WikiJS
- `UPLOADING` - Upload in progress
- `UPLOADED` - Successfully uploaded to WikiJS
- `OUTDATED` - Source file has been modified since upload
- `CONFLICTED` - Upload conflict detected
- `FAILED` - Processing failed (see error_message)
- `ARCHIVED` - Document no longer active/relevant

**Indexes:**
- `idx_wiki_docs_repo` - Query by repository
- `idx_wiki_docs_status` - Filter by processing status
- `idx_wiki_docs_source` - Filter by source location
- `idx_wiki_docs_priority` - Sort by priority score (DESC)
- `idx_wiki_docs_updated` - Sort by update time (DESC)

---

### 2. processing_batches

**Purpose:** Track batch processing operations for efficiency monitoring

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique batch identifier |
| `batch_type` | TEXT | NOT NULL | Type of batch operation |
| `batch_name` | TEXT | NOT NULL | Human-readable batch identifier |
| `status` | TEXT | NOT NULL DEFAULT 'PENDING' | Batch processing status |
| `documents_total` | INTEGER | DEFAULT 0, CHECK (>= 0) | Total documents in batch |
| `documents_processed` | INTEGER | DEFAULT 0, CHECK (>= 0) | Documents successfully processed |
| `documents_uploaded` | INTEGER | DEFAULT 0, CHECK (>= 0) | Documents uploaded to WikiJS |
| `documents_failed` | INTEGER | DEFAULT 0, CHECK (>= 0) | Documents that failed processing |
| `started_at` | TIMESTAMP | - | Batch processing start time |
| `completed_at` | TIMESTAMP | - | Batch processing completion time |
| `error_summary` | TEXT | - | Summary of errors encountered |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

**Status Values:**
- `PENDING` - Batch queued for processing
- `RUNNING` - Batch currently being processed
- `COMPLETED` - Batch processing completed successfully
- `FAILED` - Batch processing failed
- `CANCELLED` - Batch processing was cancelled

**Indexes:**
- `idx_processing_batches_status` - Filter by status
- `idx_processing_batches_created` - Sort by creation time (DESC)

---

### 3. agent_config

**Purpose:** Agent configuration and settings storage

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Configuration parameter name |
| `value` | TEXT | - | Configuration parameter value |
| `description` | TEXT | - | Human-readable parameter description |
| `config_type` | TEXT | DEFAULT 'string' | Value type (string, number, boolean, json) |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Configuration Types:**
- `string` - Text value
- `number` - Numeric value
- `boolean` - Boolean value (true/false)
- `json` - JSON object or array

**Default Configuration:**

| Key | Default Value | Type | Description |
|-----|---------------|------|-------------|
| `auto_discovery_enabled` | `true` | boolean | Enable automatic document discovery |
| `discovery_interval_hours` | `24` | number | Hours between discovery runs |
| `batch_size` | `10` | number | Documents per processing batch |
| `priority_threshold` | `70` | number | Minimum priority for auto-processing |
| `homelab_repo_priority` | `100` | number | Priority boost for homelab docs |
| `wikijs_base_path` | `/projects` | string | Base WikiJS path for uploads |
| `enable_content_enhancement` | `true` | boolean | Enable AI content improvement |
| `enable_link_resolution` | `true` | boolean | Enable automatic link resolution |
| `max_retries` | `3` | number | Maximum retry attempts |
| `backup_retention_days` | `30`/`7` | number | Backup retention (prod/dev) |
| `log_retention_days` | `90`/`30` | number | Log retention (prod/dev) |
| `performance_monitoring` | varies | boolean | Enable performance monitoring |

---

### 4. agent_stats

**Purpose:** Daily processing statistics for monitoring and reporting

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique statistic record ID |
| `stat_date` | DATE | UNIQUE | Date for statistics (YYYY-MM-DD) |
| `documents_discovered` | INTEGER | DEFAULT 0, CHECK (>= 0) | New documents found |
| `documents_processed` | INTEGER | DEFAULT 0, CHECK (>= 0) | Documents processed |
| `documents_uploaded` | INTEGER | DEFAULT 0, CHECK (>= 0) | Documents uploaded to WikiJS |
| `documents_failed` | INTEGER | DEFAULT 0, CHECK (>= 0) | Processing failures |
| `processing_time_ms` | INTEGER | DEFAULT 0, CHECK (>= 0) | Total processing time (ms) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

**Indexes:**
- `idx_agent_stats_date` - Query by date

---

### 5. agent_logs

**Purpose:** Structured logging for monitoring, debugging, and audit trails

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique log entry ID |
| `timestamp` | TEXT | NOT NULL | ISO 8601 timestamp |
| `level` | TEXT | NOT NULL | Log level (DEBUG, INFO, WARN, ERROR, FATAL) |
| `component` | TEXT | NOT NULL | Component/module that generated log |
| `message` | TEXT | NOT NULL | Log message |
| `metadata` | TEXT | - | Additional data as JSON string |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

**Log Levels:**
- `DEBUG` - Detailed debugging information
- `INFO` - General informational messages
- `WARN` - Warning conditions
- `ERROR` - Error conditions
- `FATAL` - Critical errors requiring immediate attention

**Indexes:**
- `idx_agent_logs_level` - Filter by log level
- `idx_agent_logs_timestamp` - Sort by timestamp
- `idx_agent_logs_component` - Filter by component

---

### 6. schema_migrations

**Purpose:** Migration version tracking and rollback support

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `version` | TEXT | PRIMARY KEY | Migration version identifier |
| `name` | TEXT | NOT NULL | Migration name/title |
| `description` | TEXT | - | Migration description |
| `applied_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When migration was applied |
| `rollback_sql` | TEXT | - | SQL for rolling back migration |
| `checksum` | TEXT | - | Migration content checksum |
| `execution_time_ms` | INTEGER | - | Migration execution time |
| `applied_by` | TEXT | DEFAULT 'system' | Who/what applied the migration |

## Relationships and Data Flow

### Document Processing Flow

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   File System   │───▶│ wiki_documents │───▶│ processing_batches │
└─────────────────┘    │  (DISCOVERED)  │    │    (PENDING)       │
                       └──────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌──────────────┐         ┌─────────────────┐
                       │ wiki_documents │         │ processing_batches │
                       │  (ANALYZING)   │         │    (RUNNING)       │
                       └──────────────┘         └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌──────────────┐         ┌─────────────────┐
                       │ wiki_documents │         │ processing_batches │
                       │    (READY)     │         │   (COMPLETED)      │
                       └──────────────┘         └─────────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ wiki_documents │
                       │  (UPLOADED)    │
                       └──────────────┘
```

### Data Relationships

- **One-to-Many**: `processing_batches` → `wiki_documents` (via batch processing)
- **One-to-Many**: `agent_stats.stat_date` → daily document operations
- **One-to-Many**: Components → `agent_logs` entries

## Performance Optimization

### Query Patterns

**Most Common Queries:**
1. Find documents by status: `SELECT * FROM wiki_documents WHERE sync_status = ?`
2. List pending documents: `SELECT * FROM wiki_documents WHERE sync_status IN ('DISCOVERED', 'ANALYZING', 'READY') ORDER BY priority_score DESC`
3. Repository summary: `SELECT repository_name, COUNT(*), sync_status FROM wiki_documents GROUP BY repository_name, sync_status`
4. Daily statistics: `SELECT * FROM agent_stats WHERE stat_date >= ? ORDER BY stat_date DESC`

### Index Strategy

**Primary Indexes (B-Tree):**
- All `PRIMARY KEY` constraints automatically create unique indexes
- `idx_wiki_docs_status` - Critical for status-based filtering
- `idx_wiki_docs_priority` - Essential for priority-based processing
- `idx_agent_stats_date` - Required for time-series queries

**Composite Index Opportunities:**
- `(sync_status, priority_score DESC)` - For processing queues
- `(repository_name, sync_status)` - For repository summaries
- `(source_location, sync_status)` - For location-based reporting

### Database Maintenance

**Automated Maintenance:**
- `VACUUM` - Weekly (Sundays at 3 AM)
- `ANALYZE` - Weekly (Sundays at 4 AM) 
- `PRAGMA integrity_check` - Weekly (Sundays at 5 AM)

**Manual Optimization Commands:**
```sql
-- Rebuild all indexes
REINDEX;

-- Update table statistics
ANALYZE;

-- Reclaim space and defragment
VACUUM;

-- Check database integrity
PRAGMA integrity_check;

-- View index usage statistics
PRAGMA index_info(index_name);
```

## Backup and Recovery

### Backup Strategy

**Automated Backups:**
- Development: Daily, 7-day retention
- Production: Daily, 30-day retention
- Compression: gzip enabled in production

**Backup Locations:**
- Local: `./backups/` (development) or `/opt/wiki-agent/backups/` (production)
- Remote: Configurable rsync destination (production only)

### Recovery Procedures

**Database Corruption:**
1. Verify backup integrity: `node scripts/backup-wiki-agent.js verify`
2. Stop agent processes
3. Restore from backup: `node scripts/backup-wiki-agent.js restore <backup-id> --force`
4. Verify restored database: `node scripts/migrate-wiki-agent.js validate`

**Migration Rollback:**
1. Check migration status: `node scripts/migrate-wiki-agent.js status`
2. Rollback last migration: `node scripts/migrate-wiki-agent.js rollback --force`
3. Validate database: `node scripts/migrate-wiki-agent.js validate`

## Security Considerations

### File Permissions
- Database files: `600` (owner read/write only) in production
- Backup files: `600` (owner read/write only)
- Backup directory: `700` (owner access only)

### Data Sensitivity
- **Low Sensitivity:** Configuration, statistics, most metadata
- **Medium Sensitivity:** File paths (may reveal system structure)
- **High Sensitivity:** Error messages (may contain system information)

### Access Control
- Application-level access control only (no database-level users)
- File system permissions provide security boundary
- Backup encryption recommended for remote storage

## Monitoring and Alerting

### Key Metrics

**Performance Metrics:**
- Average processing time per document
- Batch completion rates
- Upload success rates
- Database query performance

**Health Metrics:**
- Failed upload attempts
- Error rates by component
- Database size growth
- Backup success/failure rates

### Alert Thresholds

**Critical Alerts:**
- Database corruption detected
- Backup failures (consecutive)
- Upload failure rate > 50%
- Disk space < 5% remaining

**Warning Alerts:**
- Slow query performance (> 250ms in production)
- Upload failure rate > 20%
- Log errors increasing
- Database size growth anomalies

## Troubleshooting Guide

### Common Issues

**"Database is locked" Error:**
```bash
# Check for zombie processes
ps aux | grep wiki-agent

# Check database connections
lsof <database-path>

# Force unlock (if safe)
sqlite3 <database-path> ".timeout 30000"
```

**Migration Failures:**
```bash
# Check migration status
node scripts/migrate-wiki-agent.js status

# Validate current schema
node scripts/migrate-wiki-agent.js validate

# Force rollback if needed
node scripts/migrate-wiki-agent.js rollback --force
```

**Performance Issues:**
```sql
-- Check for missing indexes
.schema

-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM wiki_documents WHERE sync_status = 'READY';

-- Update statistics
ANALYZE;
```

### Diagnostic Queries

**Document Status Summary:**
```sql
SELECT 
  sync_status,
  COUNT(*) as count,
  AVG(priority_score) as avg_priority,
  MIN(updated_at) as oldest_update
FROM wiki_documents 
GROUP BY sync_status 
ORDER BY count DESC;
```

**Processing Performance:**
```sql
SELECT 
  DATE(started_at) as date,
  COUNT(*) as batches,
  AVG(documents_processed) as avg_processed,
  AVG((julianday(completed_at) - julianday(started_at)) * 86400) as avg_duration_seconds
FROM processing_batches 
WHERE status = 'COMPLETED'
  AND started_at > datetime('now', '-30 days')
GROUP BY DATE(started_at)
ORDER BY date DESC;
```

**Error Analysis:**
```sql
SELECT 
  component,
  level,
  COUNT(*) as count,
  MAX(timestamp) as last_occurrence
FROM agent_logs 
WHERE level IN ('ERROR', 'FATAL')
  AND timestamp > datetime('now', '-7 days')
GROUP BY component, level
ORDER BY count DESC;
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-07-21 | Initial schema with 5 core tables |
| 1.1.0 | TBD | Planned: Add document relationships, tags |
| 1.2.0 | TBD | Planned: Add user management, permissions |
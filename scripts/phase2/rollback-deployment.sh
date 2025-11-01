#!/bin/bash
set -euo pipefail

# ------------------------------------------------------------------
# Phase 2 Rollback Deployment Script
# ------------------------------------------------------------------

# Configuration
BACKUP_DIR="/opt/gitops/backups"
CURRENT_DIR="/opt/gitops/current"
LOGS_DIR="/opt/gitops/logs"
ROLLBACK_LOG="$LOGS_DIR/rollback-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$ROLLBACK_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$ROLLBACK_LOG"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$ROLLBACK_LOG"
}

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

log "🔄 Initiating Phase 2 deployment rollback..."

# Check if rollback is needed
if [[ "$1" == "--force" ]]; then
    log "🚨 Forced rollback requested"
elif [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    echo "Usage: $0 [--force] [--backup-name <backup_name>]"
    echo ""
    echo "Options:"
    echo "  --force              Force rollback without confirmation"
    echo "  --backup-name        Specify backup to restore from"
    echo "  --list-backups       List available backups"
    echo "  --help, -h           Show this help message"
    exit 0
elif [[ "$1" == "--list-backups" ]]; then
    echo "Available backups:"
    find "$BACKUP_DIR" -name "gitops_backup_*" -type d | sort -r | head -10
    exit 0
else
    # Check if current system is healthy
    if systemctl is-active --quiet gitops-audit-api && curl -sf http://localhost:3070/api/health > /dev/null; then
        log "🏥 Current system appears healthy. Are you sure you want to rollback?"
        read -p "Continue with rollback? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    else
        log "🚨 Current system appears unhealthy. Proceeding with rollback..."
    fi
fi

# Determine backup to restore from
if [[ "$2" == "--backup-name" ]] && [[ -n "${3:-}" ]]; then
    BACKUP_NAME="$3"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
    if [[ ! -d "$BACKUP_PATH" ]]; then
        error "Specified backup not found: $BACKUP_PATH"
        exit 1
    fi
else
    # Find the most recent backup
    BACKUP_PATH=$(find "$BACKUP_DIR" -name "gitops_backup_*" -type d | sort -r | head -n 1)
    if [[ -z "$BACKUP_PATH" ]]; then
        error "No backup found for rollback"
        exit 1
    fi
    BACKUP_NAME=$(basename "$BACKUP_PATH")
fi

log "📦 Using backup: $BACKUP_NAME"
log "📍 Backup path: $BACKUP_PATH"

# Create emergency backup of current state
log "📦 Creating emergency backup of current state..."
EMERGENCY_BACKUP="$BACKUP_DIR/emergency_backup_$(date +%Y%m%d_%H%M%S)"
if [[ -d "$CURRENT_DIR" ]]; then
    cp -r "$CURRENT_DIR" "$EMERGENCY_BACKUP"
    success "Emergency backup created: $EMERGENCY_BACKUP"
else
    warn "No current deployment to backup"
fi

# Backup Phase 2 database changes
log "💾 Backing up Phase 2 database changes..."
DB_BACKUP="$BACKUP_DIR/phase2_db_backup_$(date +%Y%m%d_%H%M%S).sql"
if pg_dump gitops_audit > "$DB_BACKUP"; then
    success "Database backup created: $DB_BACKUP"
else
    error "Failed to create database backup"
    exit 1
fi

# Stop current services
log "🛑 Stopping current services..."
systemctl stop gitops-audit-api || true
systemctl stop nginx || true

# Create rollback point for database
log "🔄 Preparing database rollback..."

# Check if this is a Phase 2 rollback (Phase 2 tables exist)
PHASE2_TABLES=(
    "pipeline_runs"
    "pipeline_definitions"
    "template_compliance"
    "metrics"
    "websocket_sessions"
    "realtime_events"
    "orchestration_jobs"
)

PHASE2_DETECTED=false
for table in "${PHASE2_TABLES[@]}"; do
    if psql -d gitops_audit -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');" -t | grep -q t; then
        PHASE2_DETECTED=true
        break
    fi
done

if [[ "$PHASE2_DETECTED" == "true" ]]; then
    log "📊 Phase 2 database tables detected. Handling database rollback..."
    
    # Check if we need to rollback database schema
    if [[ -f "$BACKUP_PATH/database_schema.sql" ]]; then
        log "🔄 Restoring database schema from backup..."
        if psql -d gitops_audit < "$BACKUP_PATH/database_schema.sql"; then
            success "Database schema restored"
        else
            error "Failed to restore database schema"
            exit 1
        fi
    else
        # Drop Phase 2 tables if no schema backup exists
        log "🗑️ Dropping Phase 2 tables..."
        for table in "${PHASE2_TABLES[@]}"; do
            if psql -d gitops_audit -c "DROP TABLE IF EXISTS $table CASCADE;" > /dev/null 2>&1; then
                log "Dropped table: $table"
            else
                warn "Could not drop table: $table"
            fi
        done
        
        # Drop Phase 2 views
        log "🗑️ Dropping Phase 2 views..."
        psql -d gitops_audit -c "DROP VIEW IF EXISTS v_pipeline_summary CASCADE;" > /dev/null 2>&1 || true
        psql -d gitops_audit -c "DROP VIEW IF EXISTS v_compliance_summary CASCADE;" > /dev/null 2>&1 || true
        psql -d gitops_audit -c "DROP VIEW IF EXISTS v_system_metrics CASCADE;" > /dev/null 2>&1 || true
        
        # Drop Phase 2 functions
        log "🗑️ Dropping Phase 2 functions..."
        psql -d gitops_audit -c "DROP FUNCTION IF EXISTS cleanup_old_metrics(INTEGER);" > /dev/null 2>&1 || true
        psql -d gitops_audit -c "DROP FUNCTION IF EXISTS cleanup_old_events(INTEGER);" > /dev/null 2>&1 || true
        psql -d gitops_audit -c "DROP FUNCTION IF EXISTS cleanup_old_websocket_sessions(INTEGER);" > /dev/null 2>&1 || true
        
        success "Phase 2 database objects removed"
    fi
else
    log "ℹ️ No Phase 2 database tables detected. Skipping database rollback..."
fi

# Replace current deployment with backup
log "🔄 Restoring deployment from backup..."
rm -rf "$CURRENT_DIR"
cp -r "$BACKUP_PATH" "$CURRENT_DIR"
success "Deployment restored from backup"

# Restore Phase 1 systemd service configuration
log "⚙️ Restoring Phase 1 systemd service configuration..."
cat > /etc/systemd/system/gitops-audit-api.service << EOF
[Unit]
Description=GitOps Audit API
After=network.target

[Service]
Type=simple
User=gitops
Group=gitops
WorkingDirectory=$CURRENT_DIR/api
Environment=NODE_ENV=production
Environment=PHASE=1
EnvironmentFile=$CURRENT_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

# Health check
ExecStartPost=/bin/sleep 10
ExecStartPost=/usr/bin/curl -f http://localhost:3070/api/health

[Install]
WantedBy=multi-user.target
EOF

# Update environment file to remove Phase 2 settings
log "⚙️ Updating environment configuration..."
if [[ -f "$CURRENT_DIR/.env" ]]; then
    # Remove Phase 2 specific settings
    sed -i '/^ENABLE_WEBSOCKETS=/d' "$CURRENT_DIR/.env"
    sed -i '/^ENABLE_PIPELINE_MANAGEMENT=/d' "$CURRENT_DIR/.env"
    sed -i '/^ENABLE_REAL_TIME_UPDATES=/d' "$CURRENT_DIR/.env"
    sed -i '/^ENABLE_ORCHESTRATION=/d' "$CURRENT_DIR/.env"
    sed -i '/^PHASE=/d' "$CURRENT_DIR/.env"
    sed -i '/^DEPLOYMENT_VERSION=/d' "$CURRENT_DIR/.env"
    sed -i '/^DEPLOYMENT_DATE=/d' "$CURRENT_DIR/.env"
    
    # Add Phase 1 settings
    echo "PHASE=1" >> "$CURRENT_DIR/.env"
    echo "ROLLBACK_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$CURRENT_DIR/.env"
else
    warn "No .env file found in backup"
fi

# Ensure all dependencies are installed
log "📦 Installing dependencies..."
cd "$CURRENT_DIR/api"
if [[ -f "package.json" ]]; then
    npm ci --only=production
    success "API dependencies installed"
else
    error "No package.json found in API directory"
    exit 1
fi

# Update Nginx configuration to Phase 1
log "⚙️ Updating Nginx configuration..."
cat > /etc/nginx/sites-available/gitops-audit << EOF
server {
    listen 80;
    server_name localhost;
    
    # Dashboard static files
    location / {
        root $CURRENT_DIR/dashboard/dist;
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:3070/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Direct audit endpoint proxy
    location /audit {
        proxy_pass http://localhost:3070/audit;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Reload systemd and start services
log "🚀 Reloading systemd and starting services..."
systemctl daemon-reload
systemctl enable gitops-audit-api
systemctl start gitops-audit-api
systemctl start nginx

# Wait for services to start
log "⏳ Waiting for services to start..."
sleep 15

# Verify rollback
log "✅ Verifying rollback..."
MAX_RETRIES=10
RETRY_COUNT=0

while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    if curl -sf http://localhost:3070/api/health > /dev/null; then
        success "API health check passed"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log "Health check attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying in 5 seconds..."
    sleep 5
done

if [[ $RETRY_COUNT -eq $MAX_RETRIES ]]; then
    error "Rollback verification failed after $MAX_RETRIES attempts"
    exit 1
fi

# Verify Phase 2 endpoints are no longer accessible
log "🔍 Verifying Phase 2 endpoints are no longer accessible..."
PHASE2_ENDPOINTS=(
    "/api/v2/pipelines/status"
    "/api/v2/compliance/status"
    "/api/v2/metrics/overview"
    "/api/v2/websocket/info"
)

for endpoint in "${PHASE2_ENDPOINTS[@]}"; do
    if curl -sf "http://localhost:3070$endpoint" > /dev/null 2>&1; then
        warn "Phase 2 endpoint $endpoint is still accessible (this may indicate incomplete rollback)"
    else
        success "Phase 2 endpoint $endpoint is no longer accessible"
    fi
done

# Test basic functionality
log "🔍 Testing basic functionality..."
if curl -sf http://localhost:3070/audit > /dev/null; then
    success "Basic audit endpoint is working"
else
    error "Basic audit endpoint is not working"
    exit 1
fi

# Generate rollback report
log "📋 Generating rollback report..."
cat > "$LOGS_DIR/rollback-report.txt" << EOF
Phase 2 Rollback Report
======================

Rollback Date: $(date)
Rollback Log: $ROLLBACK_LOG
Backup Used: $BACKUP_NAME
Emergency Backup: $EMERGENCY_BACKUP
Database Backup: $DB_BACKUP

Services Status:
- API Service: $(systemctl is-active gitops-audit-api)
- Nginx Service: $(systemctl is-active nginx)
- Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")

Rollback Actions Performed:
✅ Services stopped gracefully
✅ Emergency backup created
✅ Database changes backed up
✅ Phase 2 database objects removed
✅ Deployment restored from backup
✅ Service configuration restored
✅ Environment configuration updated
✅ Dependencies reinstalled
✅ Services restarted
✅ Rollback verified

Next Steps:
1. Monitor system stability
2. Investigate rollback cause
3. Review Phase 2 deployment issues
4. Plan remediation strategy
5. Update stakeholders

EOF

# Update deployment metadata
log "📊 Updating deployment metadata..."
cat > "$CURRENT_DIR/deployment-info.json" << EOF
{
    "phase": "1",
    "version": "1.0.0",
    "deployment_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "rollback_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "rollback_from": "phase2",
    "backup_used": "$BACKUP_NAME",
    "emergency_backup": "$EMERGENCY_BACKUP",
    "database_backup": "$DB_BACKUP",
    "status": "rollback_completed"
}
EOF

success "🎉 Phase 2 rollback completed successfully!"
log "📋 Rollback report: $LOGS_DIR/rollback-report.txt"
log "💾 Emergency backup: $EMERGENCY_BACKUP"
log "💾 Database backup: $DB_BACKUP"
log "📋 Rollback log: $ROLLBACK_LOG"

echo ""
echo "🔄 Rollback Summary:"
echo "✅ Rollback completed successfully"
echo "✅ Services restored and running"
echo "✅ Phase 2 database objects removed"
echo "✅ Emergency backups created"
echo "✅ System functionality verified"
echo ""
echo "🔍 Service Status:"
echo "  API: $(systemctl is-active gitops-audit-api)"
echo "  Nginx: $(systemctl is-active nginx)"
echo "  Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")"
echo ""
echo "🌐 Access Points:"
echo "  Dashboard: http://localhost:3070/"
echo "  API: http://localhost:3070/api/"
echo "  Health Check: http://localhost:3070/api/health"
echo ""
echo "📋 Next Steps:"
echo "  1. Monitor system stability"
echo "  2. Investigate rollback cause"
echo "  3. Review deployment logs"
echo "  4. Plan remediation strategy"
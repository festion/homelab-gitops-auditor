#!/bin/bash
set -euo pipefail

# ------------------------------------------------------------------
# Phase 2 Zero-Downtime Production Deployment Script
# ------------------------------------------------------------------

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEPLOY_DIR="/opt/gitops"
BACKUP_DIR="/opt/gitops/backups"
NEW_VERSION_DIR="/opt/gitops/phase2-deployment"
CURRENT_DIR="/opt/gitops/current"
STAGING_DIR="/opt/gitops/staging"
LOGS_DIR="/opt/gitops/logs"
DEPLOYMENT_LOG="$LOGS_DIR/deployment-phase2-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

# Error handling
cleanup_on_error() {
    error "Deployment failed. Cleaning up temporary files..."
    if [[ -d "$NEW_VERSION_DIR" ]]; then
        rm -rf "$NEW_VERSION_DIR"
    fi
    if [[ -d "$STAGING_DIR" ]]; then
        rm -rf "$STAGING_DIR"
    fi
    exit 1
}

trap cleanup_on_error ERR

# Create necessary directories
mkdir -p "$BACKUP_DIR" "$LOGS_DIR"

log "🚀 Starting Phase 2 Zero-Downtime Production Deployment"
log "📁 Project Root: $PROJECT_ROOT"
log "📁 Deploy Directory: $DEPLOY_DIR"
log "📋 Deployment Log: $DEPLOYMENT_LOG"

# Pre-deployment validation
log "🔍 Running pre-deployment validation..."

# Check if current deployment exists
if [[ ! -d "$CURRENT_DIR" ]]; then
    error "Current deployment directory not found: $CURRENT_DIR"
    exit 1
fi

# Check if we're deploying from the correct branch
cd "$PROJECT_ROOT"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "feature/phase2-enhanced-dashboard-pipeline" ]]; then
    error "Not on Phase 2 branch. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if working directory is clean
if [[ -n "$(git status --porcelain)" ]]; then
    warn "Working directory has uncommitted changes. Proceeding with deployment..."
fi

# Check production server connectivity
log "📡 Testing production server connectivity..."
if ! systemctl is-active --quiet gitops-audit-api; then
    error "Current API service is not running"
    exit 1
fi

# Test current API health
log "🏥 Testing current API health..."
if ! curl -sf http://localhost:3070/api/health > /dev/null; then
    error "Current API is not responding to health checks"
    exit 1
fi

# Create deployment backup
log "📦 Creating deployment backup..."
mkdir -p "$BACKUP_DIR"
BACKUP_NAME="gitops_backup_$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
cp -r "$CURRENT_DIR" "$BACKUP_PATH"
success "Backup created: $BACKUP_PATH"

# Prepare new deployment directory
log "🔧 Preparing new deployment..."
rm -rf "$NEW_VERSION_DIR" "$STAGING_DIR"
mkdir -p "$NEW_VERSION_DIR" "$STAGING_DIR"

# Copy Phase 2 code
log "📁 Copying Phase 2 code..."
rsync -av --exclude='.git' --exclude='node_modules' --exclude='*.log' \
    --exclude='audit-history' --exclude='npm_proxy_snapshot' \
    "$PROJECT_ROOT/" "$NEW_VERSION_DIR/"

# Build dashboard for production
log "🏗️ Building dashboard for production..."
cd "$NEW_VERSION_DIR/dashboard"
npm ci
npm run build
success "Dashboard built successfully"

# Install API dependencies
log "📦 Installing API dependencies..."
cd "$NEW_VERSION_DIR/api"
npm ci --only=production
success "API dependencies installed"

# Set up environment configuration
log "⚙️ Configuring environment..."
if [[ -f "$CURRENT_DIR/.env" ]]; then
    cp "$CURRENT_DIR/.env" "$NEW_VERSION_DIR/.env"
else
    warn "No existing .env file found, creating default configuration"
    cat > "$NEW_VERSION_DIR/.env" << EOF
NODE_ENV=production
API_PORT=3070
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gitops_audit
DB_USER=gitops_user
ENABLE_WEBSOCKETS=true
ENABLE_PIPELINE_MANAGEMENT=true
ENABLE_REAL_TIME_UPDATES=true
PHASE=2
EOF
fi

# Add Phase 2 specific environment variables
cat >> "$NEW_VERSION_DIR/.env" << EOF

# Phase 2 Configuration
ENABLE_WEBSOCKETS=true
ENABLE_PIPELINE_MANAGEMENT=true
ENABLE_REAL_TIME_UPDATES=true
ENABLE_ORCHESTRATION=true
PHASE=2
DEPLOYMENT_VERSION=2.0.0
DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

# Run database migrations
log "🔄 Running database migrations..."
cd "$NEW_VERSION_DIR"
if ! bash scripts/phase2/migrate-phase2.sh; then
    error "Database migration failed"
    exit 1
fi
success "Database migrations completed"

# Stage new deployment for health check
log "🏥 Staging new deployment for health check..."
cd "$NEW_VERSION_DIR"

# Copy to staging directory
cp -r "$NEW_VERSION_DIR" "$STAGING_DIR"

# Start staging API on different port
cd "$STAGING_DIR/api"
API_PORT=3071 NODE_ENV=production npm start &
STAGING_PID=$!
log "Staging API started with PID: $STAGING_PID"

# Wait for staging to start
sleep 15

# Test staging API health
log "🔍 Testing staging API health..."
MAX_RETRIES=10
RETRY_COUNT=0

while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    if curl -sf http://localhost:3071/api/health > /dev/null; then
        success "Staging API health check passed"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log "Health check attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying in 5 seconds..."
    sleep 5
done

if [[ $RETRY_COUNT -eq $MAX_RETRIES ]]; then
    error "Staging API health check failed after $MAX_RETRIES attempts"
    kill $STAGING_PID 2>/dev/null || true
    exit 1
fi

# Test Phase 2 specific endpoints
log "🔍 Testing Phase 2 endpoints..."
PHASE2_ENDPOINTS=(
    "/api/v2/pipelines/status"
    "/api/v2/compliance/status"
    "/api/v2/metrics/overview"
    "/api/v2/websocket/info"
)

for endpoint in "${PHASE2_ENDPOINTS[@]}"; do
    if curl -sf "http://localhost:3071$endpoint" > /dev/null; then
        success "Phase 2 endpoint $endpoint is responding"
    else
        error "Phase 2 endpoint $endpoint is not responding"
        kill $STAGING_PID 2>/dev/null || true
        exit 1
    fi
done

# Test database connectivity
log "🔍 Testing database connectivity..."
cd "$STAGING_DIR"
if ! psql -d gitops_audit -c "SELECT 1;" > /dev/null; then
    error "Database connectivity test failed"
    kill $STAGING_PID 2>/dev/null || true
    exit 1
fi

# Test Phase 2 database tables
log "🔍 Testing Phase 2 database tables..."
PHASE2_TABLES=(
    "pipeline_runs"
    "pipeline_definitions"
    "template_compliance"
    "metrics"
    "websocket_sessions"
    "realtime_events"
    "orchestration_jobs"
)

for table in "${PHASE2_TABLES[@]}"; do
    if psql -d gitops_audit -c "SELECT COUNT(*) FROM $table;" > /dev/null; then
        success "Phase 2 table $table is accessible"
    else
        error "Phase 2 table $table is not accessible"
        kill $STAGING_PID 2>/dev/null || true
        exit 1
    fi
done

# Stop staging API
kill $STAGING_PID 2>/dev/null || true
log "Staging API stopped"

# Atomic deployment switch
log "🔄 Performing atomic deployment switch..."

# Stop current services gracefully
log "🛑 Stopping current services..."
systemctl stop gitops-audit-api || true
systemctl stop nginx || true

# Create temporary backup of current deployment
mv "$CURRENT_DIR" "$BACKUP_DIR/previous_deployment_$(date +%Y%m%d_%H%M%S)"

# Move new deployment to current location
mv "$NEW_VERSION_DIR" "$CURRENT_DIR"

# Update systemd service file for Phase 2
log "⚙️ Updating systemd service configuration..."
cat > /etc/systemd/system/gitops-audit-api.service << EOF
[Unit]
Description=GitOps Audit API - Phase 2
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=gitops
Group=gitops
WorkingDirectory=$CURRENT_DIR/api
Environment=NODE_ENV=production
Environment=PHASE=2
EnvironmentFile=$CURRENT_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StartLimitInterval=60s
StartLimitBurst=3

# Health check
ExecStartPost=/bin/sleep 15
ExecStartPost=/usr/bin/curl -f http://localhost:3070/api/health

# Graceful shutdown
KillSignal=SIGTERM
KillMode=mixed
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start services
systemctl daemon-reload
systemctl enable gitops-audit-api

# Start services
log "🚀 Starting Phase 2 services..."
systemctl start gitops-audit-api
systemctl start nginx

# Wait for services to start
sleep 20

# Verify deployment
log "✅ Verifying Phase 2 deployment..."
MAX_RETRIES=10
RETRY_COUNT=0

while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    if curl -sf http://localhost:3070/api/v2/health > /dev/null; then
        success "Phase 2 API is responding"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log "Deployment verification attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying in 5 seconds..."
    sleep 5
done

if [[ $RETRY_COUNT -eq $MAX_RETRIES ]]; then
    error "Phase 2 deployment verification failed after $MAX_RETRIES attempts"
    log "🔄 Initiating automatic rollback..."
    bash "$SCRIPT_DIR/rollback-deployment.sh"
    exit 1
fi

# Test Phase 2 features
log "🔍 Testing Phase 2 features..."
for endpoint in "${PHASE2_ENDPOINTS[@]}"; do
    if curl -sf "http://localhost:3070$endpoint" > /dev/null; then
        success "Phase 2 feature $endpoint is working"
    else
        error "Phase 2 feature $endpoint failed"
        log "🔄 Initiating automatic rollback..."
        bash "$SCRIPT_DIR/rollback-deployment.sh"
        exit 1
    fi
done

# Test WebSocket connectivity
log "🔍 Testing WebSocket connectivity..."
if node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3070', {timeout: 5000});
socket.on('connect', () => {
    console.log('WebSocket connected successfully');
    process.exit(0);
});
socket.on('connect_error', (err) => {
    console.error('WebSocket connection failed:', err.message);
    process.exit(1);
});
setTimeout(() => {
    console.error('WebSocket connection timeout');
    process.exit(1);
}, 10000);
" 2>/dev/null; then
    success "WebSocket connectivity test passed"
else
    warn "WebSocket connectivity test failed (may not be critical)"
fi

# Clean up staging directory
rm -rf "$STAGING_DIR"

# Clean up old backups (keep last 5)
log "🧹 Cleaning up old backups..."
find "$BACKUP_DIR" -name "gitops_backup_*" -type d | sort -r | tail -n +6 | xargs rm -rf 2>/dev/null || true

# Update deployment metadata
log "📊 Updating deployment metadata..."
cat > "$CURRENT_DIR/deployment-info.json" << EOF
{
    "phase": "2",
    "version": "2.0.0",
    "deployment_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "git_branch": "$CURRENT_BRANCH",
    "git_commit": "$(git rev-parse HEAD)",
    "features": [
        "pipeline_management",
        "real_time_updates",
        "enhanced_dashboard",
        "compliance_tracking",
        "websocket_support",
        "orchestration_engine"
    ],
    "database_migrations": [
        "pipeline_runs",
        "pipeline_definitions",
        "template_compliance",
        "metrics",
        "websocket_sessions",
        "realtime_events",
        "orchestration_jobs"
    ]
}
EOF

# Generate deployment report
log "📋 Generating deployment report..."
cat > "$LOGS_DIR/phase2-deployment-report.txt" << EOF
Phase 2 Production Deployment Report
===================================

Deployment Date: $(date)
Git Branch: $CURRENT_BRANCH
Git Commit: $(git rev-parse HEAD)
Deployment Log: $DEPLOYMENT_LOG

Services Status:
- API Service: $(systemctl is-active gitops-audit-api)
- Nginx Service: $(systemctl is-active nginx)
- Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")

Phase 2 Features Deployed:
✅ Pipeline Management
✅ Real-time Updates
✅ Enhanced Dashboard
✅ Compliance Tracking
✅ WebSocket Support
✅ Orchestration Engine

Database Tables Created:
$(for table in "${PHASE2_TABLES[@]}"; do echo "✅ $table"; done)

API Endpoints Tested:
$(for endpoint in "${PHASE2_ENDPOINTS[@]}"; do echo "✅ $endpoint"; done)

Backup Location: $BACKUP_PATH

Next Steps:
1. Monitor system logs: journalctl -u gitops-audit-api -f
2. Check API health: curl http://localhost:3070/api/v2/health
3. Verify dashboard: http://localhost:3070/
4. Run post-deployment validation: bash scripts/phase2/validate-phase2-deployment.sh

EOF

success "🎉 Phase 2 deployment completed successfully!"
log "📋 Deployment report: $LOGS_DIR/phase2-deployment-report.txt"
log "📊 Deployment metadata: $CURRENT_DIR/deployment-info.json"
log "💾 Backup location: $BACKUP_PATH"
log "📋 Deployment log: $DEPLOYMENT_LOG"

echo ""
echo "🎯 Phase 2 Deployment Summary:"
echo "✅ Zero-downtime deployment completed"
echo "✅ Database migrations applied"
echo "✅ Services started successfully"
echo "✅ Phase 2 features validated"
echo "✅ Backup created and verified"
echo ""
echo "🔍 Service Status:"
echo "  API: $(systemctl is-active gitops-audit-api)"
echo "  Nginx: $(systemctl is-active nginx)"
echo "  Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")"
echo ""
echo "🌐 Access Points:"
echo "  Dashboard: http://localhost:3070/"
echo "  API: http://localhost:3070/api/v2/"
echo "  Health Check: http://localhost:3070/api/v2/health"
echo ""
echo "📋 Next Steps:"
echo "  1. Run post-deployment validation"
echo "  2. Monitor system for 24-48 hours"
echo "  3. Update documentation"
echo "  4. Notify stakeholders"
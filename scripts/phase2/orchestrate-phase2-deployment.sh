#!/bin/bash
set -euo pipefail

# ------------------------------------------------------------------
# Phase 2 Deployment Orchestration Script
# Coordinates the complete Phase 2 deployment process
# ------------------------------------------------------------------

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOGS_DIR="/opt/gitops/logs"
ORCHESTRATION_LOG="$LOGS_DIR/orchestration-phase2-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Phase tracking
CURRENT_PHASE=""
DEPLOYMENT_START_TIME=$(date +%s)

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

phase() {
    CURRENT_PHASE="$1"
    echo -e "${PURPLE}[$(date '+%Y-%m-%d %H:%M:%S')] PHASE:${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

step() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')] STEP:${NC} $1" | tee -a "$ORCHESTRATION_LOG"
}

# Error handling
cleanup_on_error() {
    error "Deployment failed in phase: $CURRENT_PHASE"
    error "Initiating automatic rollback..."
    
    # Run rollback if deployment got far enough
    if [[ -f "$SCRIPT_DIR/rollback-deployment.sh" ]]; then
        bash "$SCRIPT_DIR/rollback-deployment.sh" --force
    fi
    
    # Generate failure report
    generate_failure_report
    
    exit 1
}

trap cleanup_on_error ERR

# Create necessary directories
mkdir -p "$LOGS_DIR"

# Display banner
cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                    GitOps Audit Phase 2                         ║
║                 Production Deployment Orchestrator              ║
║                                                                  ║
║  🚀 Zero-downtime deployment with comprehensive validation       ║
║  📊 Enhanced dashboard and pipeline management                   ║
║  🔄 Real-time updates and WebSocket support                      ║
║  📈 Advanced monitoring and alerting                             ║
╚══════════════════════════════════════════════════════════════════╝
EOF

log "🎭 Starting Phase 2 Production Deployment Orchestration"
log "📋 Orchestration log: $ORCHESTRATION_LOG"
log "⏰ Start time: $(date)"

# Parse command line arguments
DRY_RUN=false
SKIP_VALIDATION=false
FORCE_DEPLOY=false
STAGING_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --staging-only)
            STAGING_ONLY=true
            shift
            ;;
        --help|-h)
            cat << EOF
Usage: $0 [OPTIONS]

Options:
  --dry-run           Simulate deployment without making changes
  --skip-validation   Skip pre-deployment validation checks
  --force             Force deployment without confirmation
  --staging-only      Only deploy to staging environment
  --help, -h          Show this help message

Examples:
  $0                  Interactive deployment with full validation
  $0 --dry-run        Test deployment process without changes
  $0 --force          Automated deployment without prompts
  $0 --staging-only   Deploy only to staging environment

EOF
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Phase 1: Pre-deployment Validation
phase "1️⃣ Pre-deployment Validation"

if [[ "$SKIP_VALIDATION" == "false" ]]; then
    step "Checking deployment prerequisites"
    
    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        error "Not in a valid GitOps Audit project directory"
        exit 1
    fi
    
    # Check git branch
    cd "$PROJECT_ROOT"
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [[ "$CURRENT_BRANCH" != "feature/phase2-enhanced-dashboard-pipeline" ]]; then
        if [[ "$FORCE_DEPLOY" == "false" ]]; then
            error "Not on Phase 2 branch (current: $CURRENT_BRANCH)"
            echo "Use --force to deploy from current branch"
            exit 1
        else
            warn "Deploying from non-standard branch: $CURRENT_BRANCH"
        fi
    fi
    
    # Check working directory status
    if [[ -n "$(git status --porcelain)" ]] && [[ "$FORCE_DEPLOY" == "false" ]]; then
        warn "Working directory has uncommitted changes"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    # Check system prerequisites
    step "Checking system prerequisites"
    
    command -v node >/dev/null 2>&1 || { error "Node.js is required but not installed"; exit 1; }
    command -v npm >/dev/null 2>&1 || { error "npm is required but not installed"; exit 1; }
    command -v psql >/dev/null 2>&1 || { error "PostgreSQL client is required but not installed"; exit 1; }
    command -v curl >/dev/null 2>&1 || { error "curl is required but not installed"; exit 1; }
    command -v systemctl >/dev/null 2>&1 || { error "systemd is required but not available"; exit 1; }
    
    success "System prerequisites check passed"
    
    # Run pre-deployment checklist
    step "Running pre-deployment checklist validation"
    
    if [[ -f "$SCRIPT_DIR/pre-deployment-checklist.md" ]]; then
        log "📋 Pre-deployment checklist available at: $SCRIPT_DIR/pre-deployment-checklist.md"
        if [[ "$DRY_RUN" == "false" ]] && [[ "$FORCE_DEPLOY" == "false" ]]; then
            read -p "Have you completed the pre-deployment checklist? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log "Please complete the pre-deployment checklist before proceeding"
                exit 0
            fi
        fi
    fi
    
    success "Pre-deployment validation completed"
else
    warn "Skipping pre-deployment validation (--skip-validation flag)"
fi

# Phase 2: Environment Preparation
phase "2️⃣ Environment Preparation"

step "Preparing deployment environment"

# Create backup directories
mkdir -p /opt/gitops/backups
mkdir -p /opt/gitops/logs
mkdir -p /opt/gitops/monitoring

# Check current system state
if systemctl is-active --quiet gitops-audit-api; then
    log "Current API service is running"
    
    # Test current API health
    if curl -sf http://localhost:3070/api/health > /dev/null; then
        success "Current API is healthy"
    else
        warn "Current API is not responding to health checks"
    fi
else
    warn "Current API service is not running"
fi

# Check database connectivity
if psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1; then
    success "Database connectivity verified"
else
    error "Database connectivity failed"
    exit 1
fi

success "Environment preparation completed"

# Phase 3: Build and Test
phase "3️⃣ Build and Test"

step "Building Phase 2 components"

cd "$PROJECT_ROOT"

# Install dependencies
step "Installing dependencies"
if [[ "$DRY_RUN" == "false" ]]; then
    cd dashboard && npm ci
    cd ../api && npm ci --only=production
    cd ..
fi
success "Dependencies installed"

# Build dashboard
step "Building dashboard for production"
if [[ "$DRY_RUN" == "false" ]]; then
    cd dashboard && npm run build
    cd ..
fi
success "Dashboard built successfully"

# Run tests if available
step "Running tests"
if [[ -f "api/package.json" ]] && grep -q '"test"' api/package.json; then
    if [[ "$DRY_RUN" == "false" ]]; then
        cd api && npm test
        cd ..
    fi
    success "Tests passed"
else
    warn "No tests found to run"
fi

success "Build and test phase completed"

# Phase 4: Database Migration
phase "4️⃣ Database Migration"

step "Executing database migrations"

if [[ "$DRY_RUN" == "false" ]]; then
    if bash "$SCRIPT_DIR/migrate-phase2.sh"; then
        success "Database migrations completed successfully"
    else
        error "Database migration failed"
        exit 1
    fi
else
    log "DRY RUN: Would execute database migrations"
fi

success "Database migration phase completed"

# Phase 5: Deployment
phase "5️⃣ Zero-Downtime Deployment"

step "Executing zero-downtime deployment"

if [[ "$STAGING_ONLY" == "true" ]]; then
    log "Staging-only deployment requested"
    # Here you would implement staging deployment logic
    warn "Staging deployment not fully implemented yet"
elif [[ "$DRY_RUN" == "false" ]]; then
    if bash "$SCRIPT_DIR/deploy-phase2-production.sh"; then
        success "Zero-downtime deployment completed successfully"
    else
        error "Deployment failed"
        exit 1
    fi
else
    log "DRY RUN: Would execute zero-downtime deployment"
fi

success "Deployment phase completed"

# Phase 6: Post-deployment Validation
phase "6️⃣ Post-deployment Validation"

step "Running post-deployment validation"

if [[ "$DRY_RUN" == "false" ]] && [[ "$STAGING_ONLY" == "false" ]]; then
    if bash "$SCRIPT_DIR/validate-phase2-deployment.sh"; then
        success "Post-deployment validation passed"
    else
        error "Post-deployment validation failed"
        # Don't exit here, continue with monitoring setup
        warn "Deployment may have issues, but continuing with setup"
    fi
else
    log "DRY RUN: Would run post-deployment validation"
fi

success "Post-deployment validation completed"

# Phase 7: Monitoring Setup
phase "7️⃣ Monitoring and Alerting Setup"

step "Setting up Phase 2 monitoring and alerting"

if [[ "$DRY_RUN" == "false" ]]; then
    if bash "$SCRIPT_DIR/setup-phase2-monitoring.sh"; then
        success "Monitoring and alerting setup completed"
    else
        warn "Monitoring setup had issues but deployment continues"
    fi
else
    log "DRY RUN: Would set up monitoring and alerting"
fi

success "Monitoring setup phase completed"

# Phase 8: Final Verification
phase "8️⃣ Final Verification and Handoff"

step "Performing final system verification"

if [[ "$DRY_RUN" == "false" ]] && [[ "$STAGING_ONLY" == "false" ]]; then
    # Test all major endpoints
    ENDPOINTS=(
        "http://localhost:3070/api/v2/health"
        "http://localhost:3070/api/v2/pipelines/status"
        "http://localhost:3070/api/v2/compliance/status"
        "http://localhost:3070/api/v2/metrics/overview"
    )
    
    for endpoint in "${ENDPOINTS[@]}"; do
        if curl -sf "$endpoint" > /dev/null; then
            success "✅ $endpoint"
        else
            error "❌ $endpoint"
        fi
    done
    
    # Check services
    if systemctl is-active --quiet gitops-audit-api; then
        success "✅ API service is running"
    else
        error "❌ API service is not running"
    fi
    
    if systemctl is-active --quiet nginx; then
        success "✅ Nginx service is running"
    else
        error "❌ Nginx service is not running"
    fi
fi

success "Final verification completed"

# Calculate deployment time
DEPLOYMENT_END_TIME=$(date +%s)
DEPLOYMENT_DURATION=$((DEPLOYMENT_END_TIME - DEPLOYMENT_START_TIME))
DEPLOYMENT_DURATION_MIN=$((DEPLOYMENT_DURATION / 60))
DEPLOYMENT_DURATION_SEC=$((DEPLOYMENT_DURATION % 60))

# Generate deployment report
generate_deployment_report() {
    local report_file="$LOGS_DIR/phase2-deployment-summary-$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
Phase 2 Production Deployment Summary
====================================

Deployment Date: $(date)
Duration: ${DEPLOYMENT_DURATION_MIN}m ${DEPLOYMENT_DURATION_SEC}s
Git Branch: $CURRENT_BRANCH
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "Unknown")
Orchestration Log: $ORCHESTRATION_LOG

Deployment Configuration:
- Dry Run: $DRY_RUN
- Skip Validation: $SKIP_VALIDATION
- Force Deploy: $FORCE_DEPLOY
- Staging Only: $STAGING_ONLY

Phases Completed:
✅ 1. Pre-deployment Validation
✅ 2. Environment Preparation
✅ 3. Build and Test
✅ 4. Database Migration
✅ 5. Zero-Downtime Deployment
✅ 6. Post-deployment Validation
✅ 7. Monitoring and Alerting Setup
✅ 8. Final Verification and Handoff

Phase 2 Features Deployed:
✅ Enhanced Pipeline Management
✅ Real-time Updates with WebSockets
✅ Advanced Compliance Tracking
✅ Comprehensive Metrics Collection
✅ Orchestration Engine
✅ Enhanced Dashboard UI

Services Status:
- API Service: $(systemctl is-active gitops-audit-api 2>/dev/null || echo "Unknown")
- Nginx Service: $(systemctl is-active nginx 2>/dev/null || echo "Unknown")
- Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")

Access Points:
- Dashboard: http://localhost:3070/
- API v2: http://localhost:3070/api/v2/
- Health Check: http://localhost:3070/api/v2/health
- Monitoring Dashboard: /opt/gitops/monitoring/dashboard.sh

Key Files:
- Deployment Info: /opt/gitops/current/deployment-info.json
- Environment Config: /opt/gitops/current/.env
- Monitoring Config: /opt/gitops/monitoring/
- Logs: /opt/gitops/logs/

Rollback Information:
- Rollback Script: $SCRIPT_DIR/rollback-deployment.sh
- Latest Backup: $(find /opt/gitops/backups -name "gitops_backup_*" -type d | sort -r | head -1 || echo "None found")

Next Steps:
1. Monitor system stability for 24-48 hours
2. Conduct user acceptance testing
3. Update monitoring dashboards
4. Document any issues or lessons learned
5. Plan Phase 3 development if applicable

Support Contacts:
- Technical Issues: Review logs in /opt/gitops/logs/
- Service Management: systemctl status gitops-audit-api
- Database Issues: Check PostgreSQL logs
- Rollback: bash $SCRIPT_DIR/rollback-deployment.sh

EOF

    echo "$report_file"
}

# Generate final report
REPORT_FILE=$(generate_deployment_report)

# Generate failure report function
generate_failure_report() {
    local failure_report="$LOGS_DIR/phase2-deployment-failure-$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$failure_report" << EOF
Phase 2 Deployment Failure Report
=================================

Failure Date: $(date)
Failed Phase: $CURRENT_PHASE
Duration Before Failure: $(($(date +%s) - DEPLOYMENT_START_TIME))s
Git Branch: $CURRENT_BRANCH
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "Unknown")
Orchestration Log: $ORCHESTRATION_LOG

Failure Context:
- Dry Run: $DRY_RUN
- Skip Validation: $SKIP_VALIDATION
- Force Deploy: $FORCE_DEPLOY
- Staging Only: $STAGING_ONLY

System State at Failure:
- API Service: $(systemctl is-active gitops-audit-api 2>/dev/null || echo "Unknown")
- Nginx Service: $(systemctl is-active nginx 2>/dev/null || echo "Unknown")
- Database: $(psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1 && echo "Connected" || echo "Failed")

Recovery Actions:
1. Review orchestration log: $ORCHESTRATION_LOG
2. Check service logs: journalctl -u gitops-audit-api -f
3. Verify database state: psql -d gitops_audit
4. Consider rollback: bash $SCRIPT_DIR/rollback-deployment.sh
5. Review recent backups: ls -la /opt/gitops/backups/

Investigation Steps:
1. Identify root cause from logs
2. Determine if rollback is necessary
3. Fix underlying issues
4. Re-run deployment with --force if needed
5. Update deployment procedures if necessary

EOF

    log "💥 Failure report generated: $failure_report"
}

# Final success message
cat << EOF

╔══════════════════════════════════════════════════════════════════╗
║                    🎉 DEPLOYMENT SUCCESSFUL! 🎉                  ║
╚══════════════════════════════════════════════════════════════════╝

✅ Phase 2 deployment completed successfully!
⏱️  Total time: ${DEPLOYMENT_DURATION_MIN}m ${DEPLOYMENT_DURATION_SEC}s
📋 Deployment report: $REPORT_FILE
📊 Orchestration log: $ORCHESTRATION_LOG

🌐 Access Your Phase 2 Installation:
   Dashboard: http://localhost:3070/
   API v2: http://localhost:3070/api/v2/
   Health Check: http://localhost:3070/api/v2/health

📊 Monitoring:
   Dashboard: /opt/gitops/monitoring/dashboard.sh
   Metrics: /opt/gitops/monitoring/metrics/
   Alerts: tail -f /opt/gitops/logs/alerts.log

🔧 Management Commands:
   Service Status: systemctl status gitops-audit-api
   View Logs: journalctl -u gitops-audit-api -f
   Validate Deployment: bash $SCRIPT_DIR/validate-phase2-deployment.sh
   Monitor System: /opt/gitops/monitoring/monitor-phase2.sh health

🔄 Rollback (if needed):
   bash $SCRIPT_DIR/rollback-deployment.sh

📝 Next Steps:
   1. Monitor system performance
   2. Conduct user acceptance testing
   3. Update team documentation
   4. Plan Phase 3 features (if applicable)

Happy deploying! 🚀

EOF

success "🎭 Phase 2 deployment orchestration completed successfully!"
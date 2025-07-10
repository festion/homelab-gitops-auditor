#!/bin/bash
set -euo pipefail

# ------------------------------------------------------------------
# Phase 2 Post-Deployment Validation Script
# ------------------------------------------------------------------

# Configuration
LOGS_DIR="/opt/gitops/logs"
VALIDATION_LOG="$LOGS_DIR/validation-phase2-$(date +%Y%m%d_%H%M%S).log"
CURRENT_DIR="/opt/gitops/current"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$VALIDATION_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$VALIDATION_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$VALIDATION_LOG"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$VALIDATION_LOG"
}

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log "🔍 Testing: $test_name"
    
    if eval "$test_command" 2>/dev/null; then
        success "✅ $test_name - PASSED"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        error "❌ $test_name - FAILED"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

log "🔍 Starting Phase 2 Post-Deployment Validation"
log "📋 Validation log: $VALIDATION_LOG"

# System Health Tests
log "🏥 System Health Tests"
echo "========================"

run_test "API Service Status" "systemctl is-active --quiet gitops-audit-api"
run_test "Nginx Service Status" "systemctl is-active --quiet nginx"
run_test "Database Connectivity" "psql -d gitops_audit -c 'SELECT 1;' > /dev/null"

# Basic API Tests
log "🔌 Basic API Tests"
echo "=================="

run_test "API Health Endpoint" "curl -sf http://localhost:3070/api/health"
run_test "API Root Endpoint" "curl -sf http://localhost:3070/api/"

# Phase 2 API Endpoint Tests
log "🚀 Phase 2 API Endpoint Tests"
echo "============================="

PHASE2_ENDPOINTS=(
    "/api/v2/health"
    "/api/v2/pipelines/status"
    "/api/v2/compliance/status"
    "/api/v2/metrics/overview"
    "/api/v2/websocket/info"
)

for endpoint in "${PHASE2_ENDPOINTS[@]}"; do
    run_test "Phase 2 Endpoint: $endpoint" "curl -sf http://localhost:3070$endpoint"
done

# Database Schema Tests
log "🗄️ Database Schema Tests"
echo "========================"

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
    run_test "Database Table: $table" "psql -d gitops_audit -c 'SELECT COUNT(*) FROM $table;'"
done

# Database Views Tests
log "👁️ Database Views Tests"
echo "======================="

PHASE2_VIEWS=(
    "v_pipeline_summary"
    "v_compliance_summary"
    "v_system_metrics"
)

for view in "${PHASE2_VIEWS[@]}"; do
    run_test "Database View: $view" "psql -d gitops_audit -c 'SELECT COUNT(*) FROM $view;'"
done

# Database Functions Tests
log "⚙️ Database Functions Tests"
echo "=========================="

PHASE2_FUNCTIONS=(
    "cleanup_old_metrics"
    "cleanup_old_events"
    "cleanup_old_websocket_sessions"
)

for func in "${PHASE2_FUNCTIONS[@]}"; do
    run_test "Database Function: $func" "psql -d gitops_audit -c 'SELECT $func(1);'"
done

# WebSocket Tests
log "🔌 WebSocket Tests"
echo "=================="

if command -v node &> /dev/null; then
    run_test "WebSocket Connection" "node -e \"
const io = require('socket.io-client');
const socket = io('http://localhost:3070', {timeout: 10000});
socket.on('connect', () => {
    console.log('Connected');
    process.exit(0);
});
socket.on('connect_error', (err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
setTimeout(() => {
    console.error('Timeout');
    process.exit(1);
}, 10000);
\""
else
    warn "Node.js not available, skipping WebSocket tests"
fi

# Dashboard Tests
log "🖥️ Dashboard Tests"
echo "=================="

run_test "Dashboard Root" "curl -sf http://localhost:3070/"
run_test "Dashboard Assets" "curl -sf http://localhost:3070/assets/ || curl -sf http://localhost:3070/static/"

# Phase 2 Dashboard Routes
PHASE2_ROUTES=(
    "/pipelines"
    "/compliance"
    "/analytics"
    "/search"
)

for route in "${PHASE2_ROUTES[@]}"; do
    run_test "Dashboard Route: $route" "curl -sf http://localhost:3070$route"
done

# Configuration Tests
log "⚙️ Configuration Tests"
echo "====================="

run_test "Environment File Exists" "test -f $CURRENT_DIR/.env"
run_test "Phase 2 Configuration" "grep -q 'PHASE=2' $CURRENT_DIR/.env"
run_test "WebSocket Configuration" "grep -q 'ENABLE_WEBSOCKETS=true' $CURRENT_DIR/.env"
run_test "Pipeline Management Configuration" "grep -q 'ENABLE_PIPELINE_MANAGEMENT=true' $CURRENT_DIR/.env"

# File System Tests
log "📁 File System Tests"
echo "==================="

run_test "Current Directory Exists" "test -d $CURRENT_DIR"
run_test "API Directory Exists" "test -d $CURRENT_DIR/api"
run_test "Dashboard Directory Exists" "test -d $CURRENT_DIR/dashboard"
run_test "Scripts Directory Exists" "test -d $CURRENT_DIR/scripts"
run_test "Logs Directory Exists" "test -d /opt/gitops/logs"
run_test "Backups Directory Exists" "test -d /opt/gitops/backups"

# Deployment Metadata Tests
log "📊 Deployment Metadata Tests"
echo "============================"

run_test "Deployment Info File" "test -f $CURRENT_DIR/deployment-info.json"
run_test "Phase 2 Deployment Info" "grep -q '\"phase\": \"2\"' $CURRENT_DIR/deployment-info.json"

# Performance Tests
log "⚡ Performance Tests"
echo "==================="

run_test "API Response Time (<2s)" "timeout 2 curl -sf http://localhost:3070/api/health"
run_test "Database Query Performance" "timeout 5 psql -d gitops_audit -c 'SELECT COUNT(*) FROM pipeline_runs;'"

# Security Tests
log "🔒 Security Tests"
echo "================="

run_test "API Headers Security" "curl -I http://localhost:3070/api/health | grep -q 'X-'"
run_test "Database User Permissions" "psql -d gitops_audit -c 'SELECT current_user;' | grep -v 'postgres'"

# Integration Tests
log "🔗 Integration Tests"
echo "==================="

# Test pipeline creation
run_test "Pipeline Creation API" "curl -sf -X POST http://localhost:3070/api/v2/pipelines -H 'Content-Type: application/json' -d '{\"name\":\"test-pipeline\",\"repository\":\"test-repo\"}'"

# Test metrics collection
run_test "Metrics Collection API" "curl -sf -X POST http://localhost:3070/api/v2/metrics -H 'Content-Type: application/json' -d '{\"type\":\"test\",\"value\":100}'"

# Test compliance check
run_test "Compliance Check API" "curl -sf -X POST http://localhost:3070/api/v2/compliance/check -H 'Content-Type: application/json' -d '{\"repository\":\"test-repo\"}'"

# Log File Tests
log "📋 Log File Tests"
echo "================="

run_test "API Log File" "test -f /opt/gitops/logs/api.log || journalctl -u gitops-audit-api --no-pager -n 1"
run_test "Nginx Access Log" "test -f /var/log/nginx/access.log"
run_test "Nginx Error Log" "test -f /var/log/nginx/error.log"

# Resource Usage Tests
log "💻 Resource Usage Tests"
echo "======================="

# Check memory usage
MEMORY_USAGE=$(ps aux | grep 'node.*server.js' | grep -v grep | awk '{print $4}' | head -1)
if [[ -n "$MEMORY_USAGE" ]]; then
    if (( $(echo "$MEMORY_USAGE < 10" | bc -l) )); then
        run_test "Memory Usage (<10%)" "true"
    else
        run_test "Memory Usage (<10%)" "false"
    fi
else
    warn "Could not determine memory usage"
fi

# Check CPU usage
CPU_USAGE=$(ps aux | grep 'node.*server.js' | grep -v grep | awk '{print $3}' | head -1)
if [[ -n "$CPU_USAGE" ]]; then
    if (( $(echo "$CPU_USAGE < 50" | bc -l) )); then
        run_test "CPU Usage (<50%)" "true"
    else
        run_test "CPU Usage (<50%)" "false"
    fi
else
    warn "Could not determine CPU usage"
fi

# Check disk usage
DISK_USAGE=$(df /opt/gitops | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ -n "$DISK_USAGE" ]]; then
    if (( DISK_USAGE < 80 )); then
        run_test "Disk Usage (<80%)" "true"
    else
        run_test "Disk Usage (<80%)" "false"
    fi
else
    warn "Could not determine disk usage"
fi

# Cleanup Test Data
log "🧹 Cleaning Up Test Data"
echo "========================"

# Clean up test data created during validation
psql -d gitops_audit -c "DELETE FROM pipeline_runs WHERE repository = 'test-repo';" > /dev/null 2>&1 || true
psql -d gitops_audit -c "DELETE FROM pipeline_definitions WHERE repository = 'test-repo';" > /dev/null 2>&1 || true
psql -d gitops_audit -c "DELETE FROM template_compliance WHERE repository = 'test-repo';" > /dev/null 2>&1 || true
psql -d gitops_audit -c "DELETE FROM metrics WHERE entity_id = 'test-repo';" > /dev/null 2>&1 || true

# Generate validation report
log "📋 Generating validation report..."
VALIDATION_REPORT="$LOGS_DIR/phase2-validation-report.txt"

cat > "$VALIDATION_REPORT" << EOF
Phase 2 Post-Deployment Validation Report
=========================================

Validation Date: $(date)
Validation Log: $VALIDATION_LOG

Test Results Summary:
- Total Tests: $TESTS_TOTAL
- Passed: $TESTS_PASSED
- Failed: $TESTS_FAILED
- Success Rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%

System Status:
- API Service: $(systemctl is-active gitops-audit-api)
- Nginx Service: $(systemctl is-active nginx)
- Database: $(psql -d gitops_audit -c "SELECT version();" 2>/dev/null | head -1 || echo "Connection failed")

Phase 2 Features Status:
- Pipeline Management: $(curl -sf http://localhost:3070/api/v2/pipelines/status > /dev/null && echo "✅ Active" || echo "❌ Failed")
- Real-time Updates: $(curl -sf http://localhost:3070/api/v2/websocket/info > /dev/null && echo "✅ Active" || echo "❌ Failed")
- Compliance Tracking: $(curl -sf http://localhost:3070/api/v2/compliance/status > /dev/null && echo "✅ Active" || echo "❌ Failed")
- Metrics Collection: $(curl -sf http://localhost:3070/api/v2/metrics/overview > /dev/null && echo "✅ Active" || echo "❌ Failed")

Resource Usage:
- Memory: ${MEMORY_USAGE:-Unknown}%
- CPU: ${CPU_USAGE:-Unknown}%
- Disk: ${DISK_USAGE:-Unknown}%

Database Tables:
$(for table in "${PHASE2_TABLES[@]}"; do
    count=$(psql -d gitops_audit -c "SELECT COUNT(*) FROM $table;" -t 2>/dev/null | tr -d ' ' || echo "Error")
    echo "- $table: $count rows"
done)

Recommendations:
$(if (( TESTS_FAILED > 0 )); then
    echo "- Investigate and resolve $TESTS_FAILED failed tests"
fi)
$(if (( TESTS_PASSED * 100 / TESTS_TOTAL < 95 )); then
    echo "- Success rate is below 95%, review failed tests"
fi)
- Monitor system performance for next 24-48 hours
- Verify user acceptance testing completion
- Update monitoring dashboards with Phase 2 metrics
- Review and update documentation

EOF

# Print summary
echo ""
echo "🎯 Phase 2 Validation Summary:"
echo "================================"
echo "Total Tests: $TESTS_TOTAL"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "Success Rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%"
echo ""

if (( TESTS_FAILED == 0 )); then
    success "🎉 All tests passed! Phase 2 deployment is validated."
    echo "✅ Phase 2 deployment is ready for production use"
elif (( TESTS_FAILED <= 2 )); then
    warn "⚠️  Minor issues detected. Review failed tests."
    echo "🔍 Phase 2 deployment has minor issues that should be addressed"
else
    error "❌ Significant issues detected. Investigation required."
    echo "🚨 Phase 2 deployment has significant issues that must be resolved"
fi

echo ""
echo "📋 Reports:"
echo "  Validation Report: $VALIDATION_REPORT"
echo "  Detailed Log: $VALIDATION_LOG"
echo ""
echo "🔍 Next Steps:"
echo "  1. Review any failed tests"
echo "  2. Monitor system performance"
echo "  3. Conduct user acceptance testing"
echo "  4. Update monitoring and alerting"
echo "  5. Document any known issues"

# Exit with appropriate code
if (( TESTS_FAILED == 0 )); then
    exit 0
elif (( TESTS_FAILED <= 2 )); then
    exit 1
else
    exit 2
fi
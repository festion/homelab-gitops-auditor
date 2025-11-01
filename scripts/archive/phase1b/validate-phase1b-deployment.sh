#!/bin/bash
#
# Phase 1B Deployment Validation Script
# Comprehensive validation of Template Application Engine deployment
#
# Validates all aspects of Phase 1B integration with production environment

set -euo pipefail

# Configuration
PRODUCTION_SERVER="192.168.1.58"
PRODUCTION_BASE_DIR="/opt/gitops"
TEST_REPO_PATH="/tmp/test-repo-phase1b"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
msg_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
msg_ok() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
msg_error() { echo -e "${RED}[ERROR]${NC} $1"; }
msg_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    msg_info "Running test: $test_name"
    
    if eval "$test_command"; then
        msg_ok "✅ Test passed: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        msg_error "❌ Test failed: $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# Validate deployment components
validate_deployment_components() {
    msg_info "Validating Phase 1B deployment components..."
    
    local components=(
        ".mcp/template-applicator.py"
        ".mcp/backup-manager.py"
        ".mcp/batch-processor.py"
        ".mcp/conflict-resolver.py"
        ".mcp/templates/standard-devops/template.json"
        "scripts/apply-template.sh"
        "scripts/batch-apply-templates.sh"
    )
    
    for component in "${components[@]}"; do
        if ssh root@${PRODUCTION_SERVER} "[ -f '${PRODUCTION_BASE_DIR}/${component}' ]"; then
            msg_ok "Component deployed: $component"
        else
            msg_error "Component missing: $component"
            return 1
        fi
    done
    
    return 0
}

# Validate API integration
validate_api_integration() {
    msg_info "Validating API integration..."
    
    # Check if template-endpoints.js exists
    if ssh root@${PRODUCTION_SERVER} "[ -f '${PRODUCTION_BASE_DIR}/api/template-endpoints.js' ]"; then
        msg_ok "Template API endpoints file exists"
    else
        msg_error "Template API endpoints file missing"
        return 1
    fi
    
    # Test API endpoints
    local api_base="http://${PRODUCTION_SERVER}:3070"
    
    if curl -f -s "${api_base}/api/templates" >/dev/null 2>&1; then
        msg_ok "Template API responding"
    else
        msg_error "Template API not responding"
        return 1
    fi
    
    return 0
}

# Validate service configuration
validate_service_configuration() {
    msg_info "Validating service configuration..."
    
    # Check systemd service
    if ssh root@${PRODUCTION_SERVER} "systemctl is-active --quiet gitops-audit-api"; then
        msg_ok "GitOps service running"
    else
        msg_error "GitOps service not running"
        return 1
    fi
    
    # Check gitops-template helper
    if ssh root@${PRODUCTION_SERVER} "[ -x '/usr/local/bin/gitops-template' ]"; then
        msg_ok "Template management helper installed"
    else
        msg_error "Template management helper missing"
        return 1
    fi
    
    return 0
}

# Run functional tests
run_functional_tests() {
    msg_info "Running functional validation tests..."
    
    # Test template listing
    if ssh root@${PRODUCTION_SERVER} "cd ${PRODUCTION_BASE_DIR} && python3 .mcp/template-applicator.py list" >/dev/null 2>&1; then
        msg_ok "Template listing functional"
    else
        msg_error "Template listing failed"
        return 1
    fi
    
    # Test gitops-template command
    if ssh root@${PRODUCTION_SERVER} "gitops-template status" >/dev/null 2>&1; then
        msg_ok "Template management helper functional"
    else
        msg_error "Template management helper failed"
        return 1
    fi
    
    return 0
}

# Print validation summary
print_validation_summary() {
    echo ""
    echo -e "${BLUE}================ VALIDATION SUMMARY ================${NC}"
    echo -e "${BLUE}Total Tests Run:${NC} $TESTS_RUN"
    echo -e "${GREEN}Tests Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ Phase 1B deployment validation successful!${NC}"
        echo -e "${GREEN}Template Application Engine is ready for production use.${NC}"
        return 0
    else
        echo -e "${RED}❌ Deployment validation failed. Review issues above.${NC}"
        return 1
    fi
}

# Main validation workflow
main() {
    echo -e "${GREEN}✅ Phase 1B Deployment Validation${NC}"
    echo -e "${BLUE}Target: ${PRODUCTION_SERVER}:${PRODUCTION_BASE_DIR}${NC}"
    echo ""
    
    # Run validation tests
    run_test "Deployment Components" "validate_deployment_components"
    run_test "API Integration" "validate_api_integration"
    run_test "Service Configuration" "validate_service_configuration"
    run_test "Functional Tests" "run_functional_tests"
    
    # Summary
    print_validation_summary
}

# Execute validation
main "$@"
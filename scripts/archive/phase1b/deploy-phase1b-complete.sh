#!/bin/bash
#
# Phase 1B Complete Production Deployment Orchestrator
# Coordinates all phases of Template Application Engine deployment
#
# Executes full deployment workflow using Serena orchestration principles

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRODUCTION_SERVER="192.168.1.58"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Helper functions
msg_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
msg_ok() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
msg_error() { echo -e "${RED}[ERROR]${NC} $1"; }
msg_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
msg_phase() { echo -e "${PURPLE}[PHASE]${NC} $1"; }

# Deployment phase tracking
PHASE_COUNT=0
PHASE_SUCCESS=0
PHASE_FAILED=0

execute_phase() {
    local phase_name="$1"
    local phase_script="$2"
    local phase_description="$3"
    
    PHASE_COUNT=$((PHASE_COUNT + 1))
    
    echo ""
    msg_phase "Phase $PHASE_COUNT: $phase_name"
    msg_info "$phase_description"
    echo ""
    
    if [ ! -f "$phase_script" ]; then
        msg_error "Phase script not found: $phase_script"
        PHASE_FAILED=$((PHASE_FAILED + 1))
        return 1
    fi
    
    if bash "$phase_script"; then
        msg_ok "✅ Phase $PHASE_COUNT completed successfully: $phase_name"
        PHASE_SUCCESS=$((PHASE_SUCCESS + 1))
        return 0
    else
        msg_error "❌ Phase $PHASE_COUNT failed: $phase_name"
        PHASE_FAILED=$((PHASE_FAILED + 1))
        return 1
    fi
}

# Pre-deployment validation
pre_deployment_validation() {
    msg_info "Running pre-deployment validation..."
    
    # Check if production server is accessible
    if ! ssh root@${PRODUCTION_SERVER} "echo 'Connection test'" >/dev/null 2>&1; then
        msg_error "Cannot connect to production server $PRODUCTION_SERVER"
        msg_error "Ensure SSH key authentication is configured"
        return 1
    fi
    
    # Validate Phase 1B components exist locally
    local required_components=(
        ".mcp/template-applicator.py"
        ".mcp/backup-manager.py"
        ".mcp/batch-processor.py"
        ".mcp/conflict-resolver.py"
        ".mcp/README.md"
        ".mcp/templates/standard-devops/template.json"
        "scripts/apply-template.sh"
        "scripts/batch-apply-templates.sh"
    )
    
    for component in "${required_components[@]}"; do
        if [ ! -f "${PROJECT_ROOT}/${component}" ] && [ ! -d "${PROJECT_ROOT}/${component}" ]; then
            msg_error "Required Phase 1B component missing: $component"
            return 1
        fi
    done
    
    # Check deployment scripts
    local deployment_scripts=(
        "scripts/deploy-phase1b-production.sh"
        "scripts/integrate-phase1b-api.sh"
        "scripts/configure-phase1b-systemd.sh"
        "scripts/validate-phase1b-deployment.sh"
    )
    
    for script in "${deployment_scripts[@]}"; do
        if [ ! -x "${PROJECT_ROOT}/${script}" ]; then
            msg_error "Deployment script missing or not executable: $script"
            return 1
        fi
    done
    
    msg_ok "Pre-deployment validation passed"
    return 0
}

# Post-deployment validation
post_deployment_validation() {
    msg_info "Running post-deployment validation..."
    
    # Test basic connectivity
    if curl -f -s "http://${PRODUCTION_SERVER}:3070/audit" >/dev/null 2>&1; then
        msg_ok "GitOps API responding"
    else
        msg_error "GitOps API not responding"
        return 1
    fi
    
    # Test template API
    if curl -f -s "http://${PRODUCTION_SERVER}:3070/api/templates" >/dev/null 2>&1; then
        msg_ok "Template API responding"
    else
        msg_error "Template API not responding"
        return 1
    fi
    
    # Test template management helper
    if ssh root@${PRODUCTION_SERVER} "gitops-template status" >/dev/null 2>&1; then
        msg_ok "Template management helper operational"
    else
        msg_error "Template management helper failed"
        return 1
    fi
    
    msg_ok "Post-deployment validation passed"
    return 0
}

# Print deployment summary
print_deployment_summary() {
    echo ""
    echo -e "${PURPLE}============== DEPLOYMENT SUMMARY ==============${NC}"
    echo -e "${BLUE}Total Phases:${NC} $PHASE_COUNT"
    echo -e "${GREEN}Successful:${NC} $PHASE_SUCCESS"
    echo -e "${RED}Failed:${NC} $PHASE_FAILED"
    echo ""
    
    if [ $PHASE_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 Phase 1B Production Deployment Complete!${NC}"
        echo ""
        echo -e "${YELLOW}📋 Next Steps:${NC}"
        echo -e "   1. Verify template functionality: ${BLUE}ssh root@${PRODUCTION_SERVER} 'gitops-template test'${NC}"
        echo -e "   2. Test template application: ${BLUE}gitops-template apply standard-devops /path/to/repo${NC}"
        echo -e "   3. Monitor service logs: ${BLUE}ssh root@${PRODUCTION_SERVER} 'journalctl -u gitops-audit-api -f'${NC}"
        echo -e "   4. Access dashboard: ${BLUE}http://${PRODUCTION_SERVER}/${NC}"
        echo ""
        echo -e "${GREEN}✅ Template Application Engine is ready for production use!${NC}"
        return 0
    else
        echo -e "${RED}❌ Deployment failed. Review the error messages above.${NC}"
        echo ""
        echo -e "${YELLOW}🔧 Troubleshooting:${NC}"
        echo -e "   1. Check logs: ${BLUE}ssh root@${PRODUCTION_SERVER} 'journalctl -u gitops-audit-api'${NC}"
        echo -e "   2. Verify connectivity: ${BLUE}curl http://${PRODUCTION_SERVER}:3070/audit${NC}"
        echo -e "   3. Rollback if needed: Use backups created during deployment"
        echo ""
        return 1
    fi
}

# Manual deployment mode
manual_deployment() {
    msg_warn "Manual deployment mode - executing phases one by one"
    echo ""
    
    read -p "Execute Phase 1B.1 (Core Infrastructure)? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        execute_phase "Core Infrastructure" "${SCRIPT_DIR}/deploy-phase1b-production.sh" "Deploy Phase 1B core components to production server"
    fi
    
    read -p "Execute Phase 1B.2 (API Integration)? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        execute_phase "API Integration" "${SCRIPT_DIR}/integrate-phase1b-api.sh" "Integrate template functionality with existing API service"
    fi
    
    read -p "Execute Phase 1B.3 (systemd Configuration)? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        execute_phase "systemd Configuration" "${SCRIPT_DIR}/configure-phase1b-systemd.sh" "Configure systemd service updates for template operations"
    fi
    
    read -p "Execute Phase 1B.4 (Validation)? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        execute_phase "Deployment Validation" "${SCRIPT_DIR}/validate-phase1b-deployment.sh" "Validate Phase 1B deployment and functionality"
    fi
}

# Main deployment orchestrator
main() {
    echo -e "${PURPLE}🚀 Phase 1B Complete Production Deployment${NC}"
    echo -e "${BLUE}===========================================${NC}"
    echo -e "${BLUE}Target Server: ${PRODUCTION_SERVER}${NC}"
    echo -e "${BLUE}GitOps Directory: /opt/gitops/${NC}"
    echo -e "${BLUE}Deployment Type: Template Application Engine${NC}"
    echo ""
    
    # Check for manual mode
    if [ "${1:-}" == "--manual" ]; then
        manual_deployment
    else
        # Automated deployment
        msg_info "Running automated deployment workflow..."
        echo ""
        
        # Pre-deployment validation
        if ! pre_deployment_validation; then
            msg_error "Pre-deployment validation failed. Aborting deployment."
            exit 1
        fi
        
        # Execute deployment phases
        execute_phase "Core Infrastructure" "${SCRIPT_DIR}/deploy-phase1b-production.sh" "Deploy Phase 1B core components to production server"
        
        execute_phase "API Integration" "${SCRIPT_DIR}/integrate-phase1b-api.sh" "Integrate template functionality with existing API service"
        
        execute_phase "systemd Configuration" "${SCRIPT_DIR}/configure-phase1b-systemd.sh" "Configure systemd service updates for template operations"
        
        execute_phase "Deployment Validation" "${SCRIPT_DIR}/validate-phase1b-deployment.sh" "Validate Phase 1B deployment and functionality"
        
        # Post-deployment validation
        if ! post_deployment_validation; then
            msg_error "Post-deployment validation failed. Review deployment status."
            PHASE_FAILED=$((PHASE_FAILED + 1))
        else
            msg_ok "Post-deployment validation successful"
        fi
    fi
    
    # Print summary
    print_deployment_summary
}

# Script usage
if [ "${1:-}" == "--help" ] || [ "${1:-}" == "-h" ]; then
    echo "Phase 1B Complete Production Deployment Orchestrator"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --manual    Run in manual mode (step-by-step confirmation)"
    echo "  --help      Show this help message"
    echo ""
    echo "Phases:"
    echo "  1. Core Infrastructure - Deploy Phase 1B components"
    echo "  2. API Integration - Integrate template APIs"
    echo "  3. systemd Configuration - Configure services"
    echo "  4. Deployment Validation - Validate functionality"
    echo ""
    echo "Target: ${PRODUCTION_SERVER}:/opt/gitops/"
    exit 0
fi

# Execute deployment
main "$@"
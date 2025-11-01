#!/bin/bash
#
# Phase 1B Production Deployment Script
# Deploys Template Application Engine to production GitOps Auditor server
#
# Target: 192.168.1.58 (LXC Container)
# Integration: Existing GitOps Auditor at /opt/gitops/

set -euo pipefail

# Configuration
PRODUCTION_SERVER="192.168.1.58"
PRODUCTION_BASE_DIR="/opt/gitops"
PRODUCTION_MCP_DIR="${PRODUCTION_BASE_DIR}/.mcp"
PRODUCTION_SCRIPTS_DIR="${PRODUCTION_BASE_DIR}/scripts"
LOCAL_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# Validation functions
validate_prerequisites() {
    msg_info "Validating deployment prerequisites..."
    
    # Check if production server is accessible
    if ! ssh root@${PRODUCTION_SERVER} "echo 'Connection test successful'" >/dev/null 2>&1; then
        msg_error "Cannot connect to production server ${PRODUCTION_SERVER}"
        msg_error "Ensure SSH key authentication is configured"
        exit 1
    fi
    
    # Check if GitOps Auditor exists on production
    if ! ssh root@${PRODUCTION_SERVER} "[ -d '${PRODUCTION_BASE_DIR}' ]"; then
        msg_error "GitOps Auditor not found at ${PRODUCTION_BASE_DIR} on production server"
        msg_error "Deploy base GitOps Auditor first before Phase 1B"
        exit 1
    fi
    
    # Check if Phase 1B components exist locally
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
        if [ ! -f "${LOCAL_PROJECT_ROOT}/${component}" ] && [ ! -d "${LOCAL_PROJECT_ROOT}/${component}" ]; then
            msg_error "Required Phase 1B component not found: ${component}"
            exit 1
        fi
    done
    
    msg_ok "Prerequisites validation passed"
}

# Backup production system
create_production_backup() {
    msg_info "Creating production system backup..."
    
    local backup_timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_name="pre_phase1b_${backup_timestamp}"
    
    ssh root@${PRODUCTION_SERVER} "
        mkdir -p ${PRODUCTION_BASE_DIR}/backups/${backup_name}
        
        # Backup current API and configuration
        if [ -f '${PRODUCTION_BASE_DIR}/api/server.js' ]; then
            cp -r ${PRODUCTION_BASE_DIR}/api ${PRODUCTION_BASE_DIR}/backups/${backup_name}/
        fi
        
        # Backup current scripts
        if [ -d '${PRODUCTION_BASE_DIR}/scripts' ]; then
            cp -r ${PRODUCTION_BASE_DIR}/scripts ${PRODUCTION_BASE_DIR}/backups/${backup_name}/
        fi
        
        # Backup systemd service
        if [ -f '/etc/systemd/system/gitops-audit-api.service' ]; then
            cp /etc/systemd/system/gitops-audit-api.service ${PRODUCTION_BASE_DIR}/backups/${backup_name}/
        fi
        
        echo '${backup_name}' > ${PRODUCTION_BASE_DIR}/backups/latest_backup.txt
    "
    
    msg_ok "Production backup created: ${backup_name}"
}

# Deploy Phase 1B core components
deploy_core_components() {
    msg_info "Deploying Phase 1B core components..."
    
    # Create .mcp directory structure on production
    ssh root@${PRODUCTION_SERVER} "
        mkdir -p ${PRODUCTION_MCP_DIR}/templates
        mkdir -p ${PRODUCTION_MCP_DIR}/backups
        mkdir -p ${PRODUCTION_MCP_DIR}/batch-operations
        mkdir -p ${PRODUCTION_BASE_DIR}/logs/template-operations
    "
    
    # Deploy Python components
    msg_info "Deploying template application engine..."
    scp "${LOCAL_PROJECT_ROOT}/.mcp/template-applicator.py" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    scp "${LOCAL_PROJECT_ROOT}/.mcp/backup-manager.py" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    scp "${LOCAL_PROJECT_ROOT}/.mcp/batch-processor.py" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    scp "${LOCAL_PROJECT_ROOT}/.mcp/conflict-resolver.py" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    
    # Deploy README and documentation
    scp "${LOCAL_PROJECT_ROOT}/.mcp/README.md" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    
    # Deploy templates
    msg_info "Deploying template library..."
    scp -r "${LOCAL_PROJECT_ROOT}/.mcp/templates/" root@${PRODUCTION_SERVER}:${PRODUCTION_MCP_DIR}/
    
    # Set executable permissions
    ssh root@${PRODUCTION_SERVER} "
        chmod +x ${PRODUCTION_MCP_DIR}/*.py
        find ${PRODUCTION_MCP_DIR} -name '*.py' -exec chmod +x {} \;
    "
    
    msg_ok "Core components deployed successfully"
}

# Deploy CLI scripts
deploy_cli_scripts() {
    msg_info "Deploying CLI wrapper scripts..."
    
    # Deploy template CLI scripts
    scp "${LOCAL_PROJECT_ROOT}/scripts/apply-template.sh" root@${PRODUCTION_SERVER}:${PRODUCTION_SCRIPTS_DIR}/
    scp "${LOCAL_PROJECT_ROOT}/scripts/batch-apply-templates.sh" root@${PRODUCTION_SERVER}:${PRODUCTION_SCRIPTS_DIR}/
    
    # Set executable permissions
    ssh root@${PRODUCTION_SERVER} "
        chmod +x ${PRODUCTION_SCRIPTS_DIR}/apply-template.sh
        chmod +x ${PRODUCTION_SCRIPTS_DIR}/batch-apply-templates.sh
    "
    
    msg_ok "CLI scripts deployed successfully"
}

# Configure production environment
configure_production_environment() {
    msg_info "Configuring production environment variables..."
    
    ssh root@${PRODUCTION_SERVER} "
        # Create Phase 1B environment configuration
        cat > ${PRODUCTION_BASE_DIR}/.env.phase1b << 'EOF'
# Phase 1B Template Application Engine Configuration
TEMPLATE_APPLICATION_MODE=production
TEMPLATE_BACKUP_DIR=${PRODUCTION_MCP_DIR}/backups
TEMPLATE_BATCH_WORKERS=4
TEMPLATE_OPERATION_LOGS=${PRODUCTION_BASE_DIR}/logs/template-operations

# GitOps Integration
GITOPS_API_ENDPOINT=http://192.168.1.58:3070
GITOPS_BASE_DIR=${PRODUCTION_BASE_DIR}

# GitHub MCP Integration
GITHUB_TEMPLATE_INTEGRATION=enabled
GITHUB_BRANCH_PREFIX=template-application

# Code Quality Enforcement
CODE_LINTER_VALIDATION=required
PRE_COMMIT_VALIDATION=enabled

# Production Safety
REQUIRE_BACKUP_BEFORE_APPLY=true
DEFAULT_DRY_RUN=true
ENABLE_ROLLBACK=true
EOF

        # Update main environment file
        if [ -f '${PRODUCTION_BASE_DIR}/.env' ]; then
            echo '' >> ${PRODUCTION_BASE_DIR}/.env
            echo '# Phase 1B Template Engine' >> ${PRODUCTION_BASE_DIR}/.env
            cat ${PRODUCTION_BASE_DIR}/.env.phase1b >> ${PRODUCTION_BASE_DIR}/.env
        else
            cp ${PRODUCTION_BASE_DIR}/.env.phase1b ${PRODUCTION_BASE_DIR}/.env
        fi
    "
    
    msg_ok "Production environment configured"
}

# Validate deployment
validate_deployment() {
    msg_info "Validating Phase 1B deployment..."
    
    # Test template applicator
    if ssh root@${PRODUCTION_SERVER} "cd ${PRODUCTION_BASE_DIR} && python3 .mcp/template-applicator.py list" >/dev/null 2>&1; then
        msg_ok "Template applicator operational"
    else
        msg_error "Template applicator validation failed"
        return 1
    fi
    
    # Test backup manager
    if ssh root@${PRODUCTION_SERVER} "cd ${PRODUCTION_BASE_DIR} && python3 .mcp/backup-manager.py --help" >/dev/null 2>&1; then
        msg_ok "Backup manager operational"
    else
        msg_error "Backup manager validation failed"
        return 1
    fi
    
    # Test CLI scripts
    if ssh root@${PRODUCTION_SERVER} "cd ${PRODUCTION_BASE_DIR} && bash scripts/apply-template.sh --help" >/dev/null 2>&1; then
        msg_ok "CLI scripts operational"
    else
        msg_error "CLI scripts validation failed"
        return 1
    fi
    
    msg_ok "Phase 1B deployment validation successful"
}

# Main deployment workflow
main() {
    echo -e "${GREEN}🚀 Phase 1B Production Deployment${NC}"
    echo -e "${BLUE}Target: ${PRODUCTION_SERVER}:${PRODUCTION_BASE_DIR}${NC}"
    echo ""
    
    # Phase 1B.1 - Core Infrastructure Deployment
    validate_prerequisites
    create_production_backup
    deploy_core_components
    deploy_cli_scripts
    configure_production_environment
    validate_deployment
    
    echo ""
    echo -e "${GREEN}✅ Phase 1B Core Infrastructure Deployment Complete${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo -e "   1. Run: ${BLUE}ssh root@${PRODUCTION_SERVER} 'cd ${PRODUCTION_BASE_DIR} && python3 .mcp/template-applicator.py list'${NC}"
    echo -e "   2. Run API integration: ${BLUE}./scripts/integrate-phase1b-api.sh${NC}"
    echo -e "   3. Configure systemd: ${BLUE}./scripts/configure-phase1b-systemd.sh${NC}"
    echo -e "   4. Test workflows: ${BLUE}./scripts/test-phase1b-workflows.sh${NC}"
    echo ""
    echo -e "${GREEN}🎉 Phase 1B Template Application Engine deployed to production!${NC}"
}

# Execute deployment
main "$@"
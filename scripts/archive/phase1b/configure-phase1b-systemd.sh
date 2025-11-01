#!/bin/bash
#
# Phase 1B systemd Service Configuration
# Configures systemd integration for Template Application Engine
#
# Updates existing gitops-audit-api service to include Phase 1B functionality

set -euo pipefail

# Configuration
PRODUCTION_SERVER="192.168.1.58"
PRODUCTION_BASE_DIR="/opt/gitops"

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

# Update existing systemd service
update_systemd_service() {
    msg_info "Updating systemd service configuration..."
    
    ssh root@${PRODUCTION_SERVER} "
        # Backup existing service file
        if [ -f '/etc/systemd/system/gitops-audit-api.service' ]; then
            cp /etc/systemd/system/gitops-audit-api.service /etc/systemd/system/gitops-audit-api.service.backup
        fi
        
        # Create updated service configuration
        cat > /etc/systemd/system/gitops-audit-api.service << 'EOF'
[Unit]
Description=GitOps Auditor API Server with Phase 1B Template Engine
After=network.target
Documentation=https://github.com/homelab-gitops-auditor

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${PRODUCTION_BASE_DIR}
EnvironmentFile=${PRODUCTION_BASE_DIR}/.env
ExecStartPre=/bin/mkdir -p ${PRODUCTION_BASE_DIR}/logs/template-operations
ExecStartPre=/bin/mkdir -p ${PRODUCTION_BASE_DIR}/.mcp/backups
ExecStartPre=/bin/mkdir -p ${PRODUCTION_BASE_DIR}/.mcp/batch-operations
ExecStart=/usr/bin/node api/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Phase 1B Environment Variables
Environment=TEMPLATE_APPLICATION_MODE=production
Environment=NODE_ENV=production
Environment=ENABLE_TEMPLATE_ENGINE=true
Environment=TEMPLATE_BACKUP_DIR=${PRODUCTION_BASE_DIR}/.mcp/backups
Environment=TEMPLATE_BATCH_WORKERS=4

# Security and Resource Limits
LimitNOFILE=65536
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${PRODUCTION_BASE_DIR}
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF
    "
    
    msg_ok "systemd service configuration updated"
}

# Create template-specific service helper
create_template_service_helper() {
    msg_info "Creating template service management helper..."
    
    ssh root@${PRODUCTION_SERVER} "
        cat > /usr/local/bin/gitops-template << 'EOF'
#!/bin/bash
#
# GitOps Template Management Tool
# Helper script for managing Phase 1B Template Application Engine

set -euo pipefail

GITOPS_DIR=\"${PRODUCTION_BASE_DIR}\"
MCP_DIR=\"\${GITOPS_DIR}/.mcp\"

case \"\$1\" in
    status)
        echo \"📊 GitOps Template Engine Status:\"
        systemctl status gitops-audit-api --no-pager
        echo \"\"
        echo \"🔧 Template System:\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/template-applicator.py list
        echo \"\"
        echo \"💾 Recent Backups:\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/backup-manager.py list | head -5
        ;;
    templates)
        echo \"📋 Available Templates:\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/template-applicator.py list
        ;;
    apply)
        if [ -z \"\${2:-}\" ] || [ -z \"\${3:-}\" ]; then
            echo \"❌ Usage: gitops-template apply <template-name> <repository-path>\"
            echo \"   Example: gitops-template apply standard-devops /path/to/repo\"
            exit 1
        fi
        echo \"🚀 Applying template \$2 to \$3...\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/template-applicator.py apply --template \"\$2\" --repository \"\$3\" --dry-run --verbose
        ;;
    batch-apply)
        if [ -z \"\${2:-}\" ]; then
            echo \"❌ Usage: gitops-template batch-apply <template-name> [repository-paths...]\"
            echo \"   Example: gitops-template batch-apply standard-devops /path/repo1 /path/repo2\"
            exit 1
        fi
        shift # Remove 'batch-apply'
        template_name=\"\$1\"
        shift # Remove template name
        echo \"🔄 Batch applying template \${template_name} to \$# repositories...\"
        cd \"\${GITOPS_DIR}\" && bash scripts/batch-apply-templates.sh --dry-run \"\${template_name}\" \"\$@\"
        ;;
    backup)
        if [ -z \"\${2:-}\" ]; then
            echo \"❌ Usage: gitops-template backup <repository-path>\"
            exit 1
        fi
        echo \"💾 Creating backup for \$2...\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/backup-manager.py create --repository \"\$2\" --type full
        ;;
    restore)
        if [ -z \"\${2:-}\" ]; then
            echo \"❌ Usage: gitops-template restore <backup-id>\"
            exit 1
        fi
        echo \"🔄 Restoring from backup \$2...\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/backup-manager.py restore --backup-id \"\$2\"
        ;;
    logs)
        echo \"📋 Template Engine Logs:\"
        journalctl -u gitops-audit-api -f --since \"1 hour ago\"
        ;;
    test)
        echo \"🧪 Testing Template Engine Components:\"
        echo \"\"
        echo \"1. Template Applicator:\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/template-applicator.py list
        echo \"\"
        echo \"2. Backup Manager:\"
        cd \"\${GITOPS_DIR}\" && python3 .mcp/backup-manager.py --help | head -5
        echo \"\"
        echo \"3. API Endpoints:\"
        curl -s http://localhost:3070/api/templates | head -10 2>/dev/null || echo \"API not responding\"
        echo \"\"
        echo \"✅ Component test complete\"
        ;;
    restart)
        echo \"🔄 Restarting GitOps Template Engine...\"
        systemctl restart gitops-audit-api
        sleep 3
        systemctl status gitops-audit-api --no-pager
        ;;
    *)
        echo \"GitOps Template Management Tool\"
        echo \"\"
        echo \"Commands:\"
        echo \"  status                      - Show template engine status\"
        echo \"  templates                   - List available templates\"
        echo \"  apply <template> <repo>     - Apply template (dry-run)\"
        echo \"  batch-apply <template> ...  - Batch apply to multiple repos\"
        echo \"  backup <repo>               - Create repository backup\"
        echo \"  restore <backup-id>         - Restore from backup\"
        echo \"  test                        - Test all components\"
        echo \"  logs                        - View service logs\"
        echo \"  restart                     - Restart template engine\"
        echo \"\"
        echo \"Examples:\"
        echo \"  gitops-template status\"
        echo \"  gitops-template apply standard-devops /path/to/repo\"
        echo \"  gitops-template backup /path/to/repo\"
        echo \"\"
        ;;
esac
EOF

        chmod +x /usr/local/bin/gitops-template
    "
    
    msg_ok "Template service helper created"
}

# Configure log rotation
configure_log_rotation() {
    msg_info "Configuring log rotation for template operations..."
    
    ssh root@${PRODUCTION_SERVER} "
        cat > /etc/logrotate.d/gitops-template << 'EOF'
${PRODUCTION_BASE_DIR}/logs/template-operations/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        systemctl reload gitops-audit-api || true
    endscript
}

${PRODUCTION_BASE_DIR}/logs/template-operations/*.json {
    weekly
    missingok
    rotate 12
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF
    "
    
    msg_ok "Log rotation configured"
}

# Reload and restart services
reload_services() {
    msg_info "Reloading systemd and restarting services..."
    
    ssh root@${PRODUCTION_SERVER} "
        # Reload systemd configuration
        systemctl daemon-reload
        
        # Enable service if not already enabled
        systemctl enable gitops-audit-api
        
        # Restart service to apply changes
        systemctl restart gitops-audit-api
        
        # Wait for service to start
        sleep 5
        
        # Check service status
        systemctl status gitops-audit-api --no-pager
    "
    
    msg_ok "Services reloaded and restarted"
}

# Validate service configuration
validate_service_configuration() {
    msg_info "Validating service configuration..."
    
    # Check if service is running
    if ssh root@${PRODUCTION_SERVER} "systemctl is-active --quiet gitops-audit-api"; then
        msg_ok "GitOps Audit API service is running"
    else
        msg_error "GitOps Audit API service failed to start"
        ssh root@${PRODUCTION_SERVER} "journalctl -u gitops-audit-api --no-pager -l"
        return 1
    fi
    
    # Check if API is responding
    if curl -f -s "http://${PRODUCTION_SERVER}:3070/audit" >/dev/null 2>&1; then
        msg_ok "API endpoint responding"
    else
        msg_warn "API endpoint not responding yet"
    fi
    
    # Test template management helper
    if ssh root@${PRODUCTION_SERVER} "gitops-template status" >/dev/null 2>&1; then
        msg_ok "Template management helper operational"
    else
        msg_error "Template management helper failed"
        return 1
    fi
    
    msg_ok "Service configuration validation complete"
}

# Main configuration workflow
main() {
    echo -e "${GREEN}⚙️  Phase 1B systemd Configuration${NC}"
    echo -e "${BLUE}Target: ${PRODUCTION_SERVER}${NC}"
    echo ""
    
    update_systemd_service
    create_template_service_helper
    configure_log_rotation
    reload_services
    validate_service_configuration
    
    echo ""
    echo -e "${GREEN}✅ Phase 1B systemd Configuration Complete${NC}"
    echo ""
    echo -e "${YELLOW}📋 Service Management Commands:${NC}"
    echo -e "   • ${BLUE}systemctl status gitops-audit-api${NC} - Check service status"
    echo -e "   • ${BLUE}systemctl restart gitops-audit-api${NC} - Restart service"
    echo -e "   • ${BLUE}journalctl -u gitops-audit-api -f${NC} - View logs"
    echo ""
    echo -e "${YELLOW}🔧 Template Management:${NC}"
    echo -e "   • ${BLUE}gitops-template status${NC} - Show template engine status"
    echo -e "   • ${BLUE}gitops-template templates${NC} - List available templates"
    echo -e "   • ${BLUE}gitops-template test${NC} - Test all components"
    echo ""
    echo -e "${GREEN}🎉 Template Engine integrated with production services!${NC}"
}

# Execute configuration
main \"\$@\"
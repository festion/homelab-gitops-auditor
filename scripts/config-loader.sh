#!/bin/bash
# ------------------------------------------------------------------
# Configuration Loader for GitOps Auditor
# Loads user-configurable settings and provides defaults
# ------------------------------------------------------------------

# Function to load configuration from file
load_config() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(dirname "$script_dir")"
    local config_file="${project_root}/config/settings.conf"
    local user_config_file="${project_root}/config/settings.local.conf"
    
    # Set defaults first
    PRODUCTION_SERVER_IP="${PRODUCTION_SERVER_IP:-192.168.1.58}"
    PRODUCTION_SERVER_USER="${PRODUCTION_SERVER_USER:-root}"
    PRODUCTION_SERVER_PORT="${PRODUCTION_SERVER_PORT:-22}"
    PRODUCTION_BASE_PATH="${PRODUCTION_BASE_PATH:-/opt/gitops}"
    
    LOCAL_GIT_ROOT="${LOCAL_GIT_ROOT:-/mnt/c/GIT}"
    DEVELOPMENT_API_PORT="${DEVELOPMENT_API_PORT:-3070}"
    DEVELOPMENT_DASHBOARD_PORT="${DEVELOPMENT_DASHBOARD_PORT:-5173}"
    
    GITHUB_USER="${GITHUB_USER:-festion}"
    GITHUB_API_URL="https://api.github.com/users/${GITHUB_USER}/repos?per_page=100"
    
    # Proxmox defaults
    PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
    PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
    PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"
    
    DASHBOARD_TITLE="${DASHBOARD_TITLE:-GitOps Audit Dashboard}"
    AUTO_REFRESH_INTERVAL="${AUTO_REFRESH_INTERVAL:-30000}"
    
    AUDIT_SCHEDULE="${AUDIT_SCHEDULE:-0 3 * * *}"
    MAX_AUDIT_HISTORY="${MAX_AUDIT_HISTORY:-30}"
    ENABLE_AUTO_MITIGATION="${ENABLE_AUTO_MITIGATION:-false}"
    
    LOG_LEVEL="${LOG_LEVEL:-INFO}"
    LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"
    ENABLE_VERBOSE_LOGGING="${ENABLE_VERBOSE_LOGGING:-false}"
    
    # Load main config file if it exists
    if [ -f "$config_file" ]; then
        # Source the config file
        source "$config_file"
    fi
    
    # Load user-specific overrides if they exist
    if [ -f "$user_config_file" ]; then
        echo "📋 Loading user configuration overrides from: $user_config_file"
        source "$user_config_file"
    fi
}

# Function to display current configuration
show_config() {
    echo "📋 Current GitOps Auditor Configuration:"
    echo ""
    echo "🖥️  Production Server:"
    echo "   IP Address: $PRODUCTION_SERVER_IP"
    echo "   User: $PRODUCTION_SERVER_USER"
    echo "   SSH Port: $PRODUCTION_SERVER_PORT"
    echo "   Base Path: $PRODUCTION_BASE_PATH"
    echo ""
    echo "💻 Development Environment:"
    echo "   Local Git Root: $LOCAL_GIT_ROOT"
    echo "   API Port: $DEVELOPMENT_API_PORT"
    echo "   Dashboard Port: $DEVELOPMENT_DASHBOARD_PORT"
    echo ""
    echo "🐙 GitHub Configuration:"
    echo "   User: $GITHUB_USER"
    echo "   API URL: $GITHUB_API_URL"
    echo ""
    echo "⏰ Audit Settings:"
    echo "   Schedule: $AUDIT_SCHEDULE"
    echo "   History Retention: $MAX_AUDIT_HISTORY days"
    echo "   Auto Mitigation: $ENABLE_AUTO_MITIGATION"
    echo ""
    echo "🌐 Dashboard URLs:"
    echo "   Production: http://$PRODUCTION_SERVER_IP/"
    echo "   Development: http://localhost:$DEVELOPMENT_DASHBOARD_PORT"
    echo "   API: http://$PRODUCTION_SERVER_IP:$DEVELOPMENT_API_PORT"
}

# Function to create user config template
create_user_config() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(dirname "$script_dir")"
    local user_config_file="${project_root}/config/settings.local.conf"
    
    if [ -f "$user_config_file" ]; then
        echo "⚠️  User configuration file already exists: $user_config_file"
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ User configuration creation cancelled."
            return 1
        fi
    fi
    
    cat > "$user_config_file" << 'EOF'
# User-specific GitOps Auditor Configuration Overrides
# This file is ignored by git and contains your personal settings
# Uncomment and modify the settings you want to customize

# Production Server (CUSTOMIZE THESE)
#PRODUCTION_SERVER_IP="YOUR_SERVER_IP"
#PRODUCTION_SERVER_USER="your_username"
#LOCAL_GIT_ROOT="/your/git/root/path"

# GitHub Configuration
#GITHUB_USER="your_github_username"

# Development Ports (if conflicts exist)
#DEVELOPMENT_API_PORT="3071"
#DEVELOPMENT_DASHBOARD_PORT="5174"

# Audit Settings
#AUDIT_SCHEDULE="0 2 * * *"  # 2:00 AM instead of 3:00 AM
#MAX_AUDIT_HISTORY="60"      # Keep 60 days instead of 30
#ENABLE_AUTO_MITIGATION="true"  # Enable automatic fixes

# Logging
#LOG_LEVEL="DEBUG"
#ENABLE_VERBOSE_LOGGING="true"
EOF
    
    echo "✅ User configuration template created: $user_config_file"
    echo "📝 Edit this file to customize your settings"
    echo "💡 This file is in .gitignore and won't be committed"
}

# Function to validate configuration
validate_config() {
    local errors=0
    
    echo "🔍 Validating configuration..."
    
    # Check if LOCAL_GIT_ROOT exists
    if [ ! -d "$LOCAL_GIT_ROOT" ]; then
        echo "❌ Local Git root directory does not exist: $LOCAL_GIT_ROOT"
        errors=$((errors + 1))
    fi
    
    # Check if production server is reachable (optional)
    if command -v ping >/dev/null 2>&1; then
        if ! ping -c 1 -W 2 "$PRODUCTION_SERVER_IP" >/dev/null 2>&1; then
            echo "⚠️  Production server may not be reachable: $PRODUCTION_SERVER_IP"
        else
            echo "✅ Production server is reachable: $PRODUCTION_SERVER_IP"
        fi
    fi
    
    # Validate GitHub user
    if [ -z "$GITHUB_USER" ]; then
        echo "❌ GitHub user not configured"
        errors=$((errors + 1))
    fi
    
    # Validate ports
    if ! [[ "$DEVELOPMENT_API_PORT" =~ ^[0-9]+$ ]] || [ "$DEVELOPMENT_API_PORT" -lt 1 ] || [ "$DEVELOPMENT_API_PORT" -gt 65535 ]; then
        echo "❌ Invalid API port: $DEVELOPMENT_API_PORT"
        errors=$((errors + 1))
    fi
    
    if ! [[ "$DEVELOPMENT_DASHBOARD_PORT" =~ ^[0-9]+$ ]] || [ "$DEVELOPMENT_DASHBOARD_PORT" -lt 1 ] || [ "$DEVELOPMENT_DASHBOARD_PORT" -gt 65535 ]; then
        echo "❌ Invalid dashboard port: $DEVELOPMENT_DASHBOARD_PORT"
        errors=$((errors + 1))
    fi
    
    if [ $errors -eq 0 ]; then
        echo "✅ Configuration validation passed"
        return 0
    else
        echo "❌ Configuration validation failed with $errors error(s)"
        return 1
    fi
}

# Main function for interactive configuration
configure_interactive() {
    echo "🛠️  Interactive GitOps Auditor Configuration"
    echo "============================================"
    echo ""
    
    # Load current config
    load_config
    
    echo "Current settings (press Enter to keep, or type new value):"
    echo ""
    
    # Production Server IP
    read -p "Production Server IP [$PRODUCTION_SERVER_IP]: " new_ip
    PRODUCTION_SERVER_IP="${new_ip:-$PRODUCTION_SERVER_IP}"
    
    # Production Server User
    read -p "Production Server User [$PRODUCTION_SERVER_USER]: " new_user
    PRODUCTION_SERVER_USER="${new_user:-$PRODUCTION_SERVER_USER}"
    
    # Local Git Root
    read -p "Local Git Root [$LOCAL_GIT_ROOT]: " new_git_root
    LOCAL_GIT_ROOT="${new_git_root:-$LOCAL_GIT_ROOT}"
    
    # GitHub User
    read -p "GitHub Username [$GITHUB_USER]: " new_github_user
    GITHUB_USER="${new_github_user:-$GITHUB_USER}"
    
    # API Port
    read -p "Development API Port [$DEVELOPMENT_API_PORT]: " new_api_port
    DEVELOPMENT_API_PORT="${new_api_port:-$DEVELOPMENT_API_PORT}"
    
    # Dashboard Port
    read -p "Development Dashboard Port [$DEVELOPMENT_DASHBOARD_PORT]: " new_dashboard_port
    DEVELOPMENT_DASHBOARD_PORT="${new_dashboard_port:-$DEVELOPMENT_DASHBOARD_PORT}"
    
    echo ""
    echo "📝 Saving configuration..."
    
    # Create user config file with new settings
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(dirname "$script_dir")"
    local user_config_file="${project_root}/config/settings.local.conf"
    
    cat > "$user_config_file" << EOF
# User-specific GitOps Auditor Configuration
# Generated on $(date)

# Production Server Configuration
PRODUCTION_SERVER_IP="$PRODUCTION_SERVER_IP"
PRODUCTION_SERVER_USER="$PRODUCTION_SERVER_USER"

# Local Development Configuration
LOCAL_GIT_ROOT="$LOCAL_GIT_ROOT"
DEVELOPMENT_API_PORT="$DEVELOPMENT_API_PORT"
DEVELOPMENT_DASHBOARD_PORT="$DEVELOPMENT_DASHBOARD_PORT"

# GitHub Configuration
GITHUB_USER="$GITHUB_USER"
EOF
    
    echo "✅ Configuration saved to: $user_config_file"
    echo ""
    validate_config
}

# Functions are available when sourced - no need to export
# load_config, show_config, and validate_config are ready to use
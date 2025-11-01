#!/bin/bash
# ------------------------------------------------------------------
# GitOps Auditor Configuration Management CLI
# Provides easy configuration management for users
# ------------------------------------------------------------------

# Load configuration system
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"

show_help() {
    cat << 'EOF'
GitOps Auditor Configuration Management

Usage: ./config-manager.sh [COMMAND] [OPTIONS]

Commands:
    show                    Display current configuration
    interactive             Start interactive configuration wizard
    validate               Validate current configuration
    create-user-config     Create user configuration template
    set <key> <value>      Set a specific configuration value
    get <key>              Get a specific configuration value
    reset                  Reset to default configuration
    test-connection        Test connection to production server

Examples:
    ./config-manager.sh show
    ./config-manager.sh interactive
    ./config-manager.sh set PRODUCTION_SERVER_IP "192.168.1.100"
    ./config-manager.sh set LOCAL_GIT_ROOT "/home/user/git"
    ./config-manager.sh get GITHUB_USER
    ./config-manager.sh validate
    ./config-manager.sh test-connection

Configuration Files:
    config/settings.conf        - Default configuration (version controlled)
    config/settings.local.conf  - User overrides (gitignored)

Key Configuration Options:
    PRODUCTION_SERVER_IP         Production server IP address
    PRODUCTION_SERVER_USER       SSH username for production
    LOCAL_GIT_ROOT              Local Git repositories directory
    GITHUB_USER                 GitHub username
    DEVELOPMENT_API_PORT        Local API port
    DEVELOPMENT_DASHBOARD_PORT  Local dashboard port
EOF
}

set_config_value() {
    local key="$1"
    local value="$2"
    
    if [ -z "$key" ] || [ -z "$value" ]; then
        echo "❌ Usage: ./config-manager.sh set <key> <value>"
        exit 1
    fi
    
    local project_root="$(dirname "$SCRIPT_DIR")"
    local user_config_file="${project_root}/config/settings.local.conf"
    
    # Create user config file if it doesn't exist
    if [ ! -f "$user_config_file" ]; then
        echo "📝 Creating user configuration file..."
        create_user_config
    fi
    
    # Check if key already exists in user config
    if grep -q "^${key}=" "$user_config_file" 2>/dev/null; then
        # Update existing value
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^${key}=.*/${key}=\"${value}\"/" "$user_config_file"
        else
            # Linux
            sed -i "s/^${key}=.*/${key}=\"${value}\"/" "$user_config_file"
        fi
        echo "✅ Updated ${key} = ${value}"
    else
        # Add new value
        echo "${key}=\"${value}\"" >> "$user_config_file"
        echo "✅ Set ${key} = ${value}"
    fi
    
    # Validate the new configuration
    load_config
    validate_config
}

get_config_value() {
    local key="$1"
    
    if [ -z "$key" ]; then
        echo "❌ Usage: ./config-manager.sh get <key>"
        exit 1
    fi
    
    load_config
    local value=$(eval echo "\$${key}")
    
    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "❌ Configuration key not found: $key"
        exit 1
    fi
}

test_production_connection() {
    load_config
    
    echo "🔗 Testing connection to production server..."
    echo "   Server: $PRODUCTION_SERVER_IP"
    echo "   User: $PRODUCTION_SERVER_USER"
    echo "   Port: $PRODUCTION_SERVER_PORT"
    echo ""
    
    # Test ping
    echo "📡 Testing network connectivity..."
    if command -v ping >/dev/null 2>&1; then
        if ping -c 1 -W 2 "$PRODUCTION_SERVER_IP" >/dev/null 2>&1; then
            echo "✅ Network connectivity: OK"
        else
            echo "❌ Network connectivity: FAILED"
            echo "   Cannot reach $PRODUCTION_SERVER_IP"
            return 1
        fi
    else
        echo "⚠️  Ping command not available, skipping network test"
    fi
    
    # Test SSH
    echo "🔐 Testing SSH connectivity..."
    if command -v ssh >/dev/null 2>&1; then
        if ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no \
           -p "$PRODUCTION_SERVER_PORT" "$PRODUCTION_SERVER_USER@$PRODUCTION_SERVER_IP" \
           "echo 'SSH connection successful'" 2>/dev/null; then
            echo "✅ SSH connectivity: OK"
        else
            echo "❌ SSH connectivity: FAILED"
            echo "   Cannot SSH to $PRODUCTION_SERVER_USER@$PRODUCTION_SERVER_IP:$PRODUCTION_SERVER_PORT"
            echo "   Make sure SSH keys are configured or password authentication is enabled"
            return 1
        fi
    else
        echo "⚠️  SSH command not available, skipping SSH test"
    fi
    
    # Test if production directory exists
    echo "📁 Testing production directory..."
    if ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no \
       -p "$PRODUCTION_SERVER_PORT" "$PRODUCTION_SERVER_USER@$PRODUCTION_SERVER_IP" \
       "[ -d '$PRODUCTION_BASE_PATH' ]" 2>/dev/null; then
        echo "✅ Production directory exists: $PRODUCTION_BASE_PATH"
    else
        echo "⚠️  Production directory does not exist: $PRODUCTION_BASE_PATH"
        echo "   This is normal for first-time deployment"
    fi
    
    echo ""
    echo "🎉 Connection test completed successfully!"
}

reset_configuration() {
    local project_root="$(dirname "$SCRIPT_DIR")"
    local user_config_file="${project_root}/config/settings.local.conf"
    
    echo "⚠️  This will reset your user configuration to defaults."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "$user_config_file" ]; then
            mv "$user_config_file" "${user_config_file}.backup.$(date +%Y%m%d_%H%M%S)"
            echo "📋 Backup created: ${user_config_file}.backup.$(date +%Y%m%d_%H%M%S)"
        fi
        
        echo "✅ Configuration reset to defaults"
        echo "💡 Run './config-manager.sh interactive' to reconfigure"
    else
        echo "❌ Reset cancelled"
    fi
}

# Main command handling
case "${1:-}" in
    "show")
        load_config
        show_config
        ;;
    "interactive")
        configure_interactive
        ;;
    "validate")
        load_config
        validate_config
        ;;
    "create-user-config")
        create_user_config
        ;;
    "set")
        set_config_value "$2" "$3"
        ;;
    "get")
        get_config_value "$2"
        ;;
    "test-connection")
        test_production_connection
        ;;
    "reset")
        reset_configuration
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Use './config-manager.sh help' for usage information"
        exit 1
        ;;
esac
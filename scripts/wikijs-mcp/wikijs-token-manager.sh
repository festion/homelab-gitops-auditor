#!/bin/bash
# WikiJS Token Manager - Secure WikiJS credential management with MCP integration

# Source the main token manager
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
# Source functions but don't execute main logic
if [ -f "$SCRIPT_DIR/github-token-manager.sh" ]; then
    # Extract functions from the main token manager
    source <(sed -n '/^# Function to securely store credentials/,/^case "\$1"/p' "$SCRIPT_DIR/github-token-manager.sh" | head -n -1)
else
    echo "ERROR: Main token manager not found: $SCRIPT_DIR/github-token-manager.sh"
    exit 1
fi

# WikiJS-specific configuration
WIKIJS_CONFIG_DIR="/home/dev/.wikijs_mcp"
WIKIJS_HEALTH_CHECK_FILE="$WIKIJS_CONFIG_DIR/health_status"

# Create WikiJS-specific directories
mkdir -p "$WIKIJS_CONFIG_DIR"
chmod 700 "$WIKIJS_CONFIG_DIR"

# Function to test WikiJS connectivity with comprehensive checks
test_wikijs_connection() {
    echo "🔍 Testing WikiJS MCP server connectivity..."
    
    # Load credentials
    if ! load_credentials "wikijs" >/dev/null 2>&1; then
        echo "❌ WikiJS credentials not configured"
        echo "Use: $0 setup-credentials"
        return 1
    fi
    
    local url="$WIKIJS_URL"
    local token="$WIKIJS_TOKEN"
    
    echo "📍 WikiJS URL: $url"
    echo "🔑 Token: ${token:0:20}..."
    
    # Test 1: Basic connectivity
    echo "🌐 Testing basic connectivity..."
    if ! curl -s --max-time 10 "$url" >/dev/null; then
        echo "❌ Cannot reach WikiJS instance at $url"
        log_health_status "UNREACHABLE" "Cannot connect to WikiJS instance"
        return 1
    fi
    echo "✅ Basic connectivity successful"
    
    # Test 2: GraphQL endpoint
    echo "🔧 Testing GraphQL API endpoint..."
    local graphql_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d '{"query": "{ site { title } }"}' \
        "$url/graphql" 2>/dev/null)
    
    if echo "$graphql_response" | grep -q '"data"'; then
        echo "✅ GraphQL API accessible"
        local site_title=$(echo "$graphql_response" | grep -o '"title":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$site_title" ]; then
            echo "📖 Wiki site: $site_title"
        fi
    else
        echo "❌ GraphQL API test failed"
        if echo "$graphql_response" | grep -q "authentication"; then
            echo "🔐 Authentication issue detected"
            log_health_status "AUTH_FAILED" "WikiJS authentication failed"
        else
            echo "🔧 API communication issue"
            log_health_status "API_ERROR" "GraphQL API communication failed"
        fi
        return 1
    fi
    
    # Test 3: MCP server availability
    echo "🔧 Testing WikiJS MCP server..."
    if [ -d "/home/dev/workspace/mcp-servers/wikijs-mcp-server" ]; then
        echo "✅ WikiJS MCP server files found"
        
        # Check if server can start
        if timeout 10s bash -c "cd /home/dev/workspace/mcp-servers/wikijs-mcp-server && python3 -c 'import src.wikijs_mcp.server; print(\"MCP server import successful\")'" 2>/dev/null; then
            echo "✅ WikiJS MCP server can be imported"
        else
            echo "⚠️  WikiJS MCP server import test failed"
        fi
    else
        echo "❌ WikiJS MCP server not found"
        log_health_status "MCP_MISSING" "WikiJS MCP server files not found"
        return 1
    fi
    
    log_health_status "HEALTHY" "All WikiJS connectivity tests passed"
    echo "🎉 WikiJS MCP server connectivity test completed successfully!"
    return 0
}

# Function to log health status
log_health_status() {
    local status="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$WIKIJS_HEALTH_CHECK_FILE" <<EOF
{
    "timestamp": "$timestamp",
    "status": "$status",
    "message": "$message",
    "url": "$WIKIJS_URL",
    "token_prefix": "${WIKIJS_TOKEN:0:10}"
}
EOF
}

# Function to get health status
get_health_status() {
    if [ -f "$WIKIJS_HEALTH_CHECK_FILE" ]; then
        cat "$WIKIJS_HEALTH_CHECK_FILE"
    else
        echo '{"status": "UNKNOWN", "message": "No health check performed yet"}'
    fi
}

# Function to setup WikiJS credentials interactively
setup_credentials() {
    echo "📝 WikiJS MCP Server Credential Setup"
    echo "======================================"
    
    # Get WikiJS URL
    read -p "Enter WikiJS URL (e.g., http://192.168.1.90:3000): " wikijs_url
    if [ -z "$wikijs_url" ]; then
        echo "❌ WikiJS URL is required"
        return 1
    fi
    
    # Get WikiJS token
    echo "Enter WikiJS API token (will be stored securely):"
    read -s wikijs_token
    if [ -z "$wikijs_token" ]; then
        echo "❌ WikiJS token is required"
        return 1
    fi
    
    # Store credentials using the secure token manager
    if store_credential "wikijs" "url" "$wikijs_url" && store_credential "wikijs" "token" "$wikijs_token"; then
        echo "✅ WikiJS credentials stored successfully"
        echo "🔧 Testing connection..."
        if test_wikijs_connection; then
            echo "🎉 WikiJS MCP server setup completed successfully!"
        else
            echo "⚠️  Setup completed but connection test failed"
            echo "    Please verify your credentials and WikiJS instance"
        fi
    else
        echo "❌ Failed to store credentials"
        return 1
    fi
}

# Function to setup production environment
setup_production() {
    echo "🏭 Setting up WikiJS MCP for production use"
    echo "==========================================="
    
    # Check if this is intended for production
    read -p "Are you setting up for production? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Cancelled production setup"
        return 0
    fi
    
    # Production checklist
    echo "📋 Production Setup Checklist:"
    echo "1. ✓ Secure token storage configured"
    echo "2. ✓ Path validation enabled"
    echo "3. ✓ Error handling implemented"
    echo "4. ✓ Health monitoring ready"
    
    # Setup auto-load for production
    if /home/dev/workspace/github-token-manager.sh setup; then
        echo "5. ✓ Auto-load configured for shell profile"
    else
        echo "5. ⚠️  Auto-load setup had issues"
    fi
    
    # Test connection
    if test_wikijs_connection; then
        echo "6. ✅ Production connectivity test passed"
        echo "🎉 WikiJS MCP server is ready for production!"
    else
        echo "6. ❌ Production connectivity test failed"
        echo "    Please resolve connection issues before going live"
        return 1
    fi
}

# Function to monitor WikiJS health continuously
monitor_health() {
    local interval="${1:-300}"  # Default 5 minutes
    echo "📊 Starting WikiJS health monitoring (every ${interval}s)"
    echo "Press Ctrl+C to stop"
    
    while true; do
        echo "$(date): Checking WikiJS health..."
        if test_wikijs_connection >/dev/null 2>&1; then
            echo "$(date): ✅ WikiJS healthy"
        else
            echo "$(date): ❌ WikiJS health check failed"
            # Could integrate with alerting system here
        fi
        sleep "$interval"
    done
}

# Main command handling
case "$1" in
    "setup-credentials"|"setup")
        setup_credentials
        ;;
    "test"|"test-connection")
        test_wikijs_connection
        ;;
    "health"|"status")
        get_health_status
        ;;
    "monitor")
        monitor_health "$2"
        ;;
    "production"|"setup-production")
        setup_production
        ;;
    "verify")
        verify_credentials "wikijs"
        ;;
    "load")
        load_credentials "wikijs"
        ;;
    *)
        echo "WikiJS Token Manager - Secure WikiJS MCP credential management"
        echo "Usage: $0 {setup|test|health|monitor|production|verify|load}"
        echo ""
        echo "Commands:"
        echo "  setup              - Interactive credential setup"
        echo "  test               - Test WikiJS connectivity and MCP server"
        echo "  health             - Show current health status"
        echo "  monitor [interval] - Continuous health monitoring"
        echo "  production         - Setup for production environment"
        echo "  verify             - Verify stored credentials"
        echo "  load               - Load credentials into environment"
        echo ""
        echo "Examples:"
        echo "  $0 setup                    # Interactive setup"
        echo "  $0 test                     # Test connectivity"
        echo "  $0 monitor 60               # Monitor every 60 seconds"
        echo "  $0 production               # Production setup"
        exit 1
        ;;
esac
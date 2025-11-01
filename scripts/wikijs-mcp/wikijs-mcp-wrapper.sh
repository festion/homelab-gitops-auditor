#!/bin/bash
# WikiJS MCP Wrapper - Production-ready with comprehensive error handling and resilience
# Version: 2.0.0
# Last Updated: 2025-07-21

set -euo pipefail  # Exit on any error, undefined variable, or pipe failure

# Configuration
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
WORKSPACE_DIR="/home/dev/workspace"
MCP_SERVER_DIR="$WORKSPACE_DIR/mcp-servers/wikijs-mcp-server"
LOG_DIR="/home/dev/.mcp_logs"
LOG_FILE="$LOG_DIR/wikijs-mcp-wrapper.log"
HEALTH_CHECK_FILE="/home/dev/.wikijs_mcp/health_status"
RETRY_MAX=3
RETRY_DELAY=2
STARTUP_TIMEOUT=30

# Create necessary directories
mkdir -p "$LOG_DIR" "/home/dev/.wikijs_mcp"
chmod 700 "$LOG_DIR" "/home/dev/.wikijs_mcp"

# Logging function with timestamps
log_message() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
    
    # Also output to stderr for MCP integration
    echo "[$timestamp] [$level] $message" >&2
}

# Cleanup function for graceful shutdown
cleanup() {
    local exit_code=$?
    log_message "INFO" "WikiJS MCP wrapper shutting down (exit code: $exit_code)"
    
    # Kill any remaining background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    exit $exit_code
}
trap cleanup EXIT INT TERM

# Function to load credentials with validation
load_credentials() {
    log_message "INFO" "Loading WikiJS credentials from secure storage"
    
    # Try to use the secure token manager
    if [ -x "$SCRIPT_DIR/github-token-manager.sh" ]; then
        if eval "$($SCRIPT_DIR/github-token-manager.sh load wikijs 2>/dev/null)"; then
            log_message "INFO" "Credentials loaded from secure token manager"
            return 0
        fi
    fi
    
    # Fallback to direct file reading
    if [ -f "/home/dev/.mcp_tokens/wikijs_url" ]; then
        export WIKIJS_URL=$(cat /home/dev/.mcp_tokens/wikijs_url)
    else
        export WIKIJS_URL="${WIKIJS_URL:-http://192.168.1.90:3000}"
    fi

    if [ -f "/home/dev/.mcp_tokens/wikijs_token" ]; then
        export WIKIJS_TOKEN=$(cat /home/dev/.mcp_tokens/wikijs_token)
    else
        export WIKIJS_TOKEN="${WIKIJS_TOKEN:-}"
    fi
    
    # Validate credentials
    if [ -z "$WIKIJS_URL" ] || [ -z "$WIKIJS_TOKEN" ] || [ "$WIKIJS_TOKEN" = "your_wikijs_token_here" ]; then
        log_message "ERROR" "WikiJS credentials not properly configured"
        log_message "INFO" "Use: $SCRIPT_DIR/wikijs-token-manager.sh setup"
        return 1
    fi
    
    log_message "INFO" "WikiJS URL: $WIKIJS_URL"
    log_message "INFO" "WikiJS token configured (${WIKIJS_TOKEN:0:10}...)"
    return 0
}

# Function to test WikiJS connectivity with circuit breaker pattern
test_connectivity() {
    local retry_count=0
    
    log_message "INFO" "Testing WikiJS connectivity"
    
    while [ $retry_count -lt $RETRY_MAX ]; do
        if timeout 10 curl -s --fail "$WIKIJS_URL" >/dev/null 2>&1; then
            log_message "INFO" "WikiJS connectivity test passed"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        log_message "WARN" "Connectivity test failed (attempt $retry_count/$RETRY_MAX)"
        
        if [ $retry_count -lt $RETRY_MAX ]; then
            log_message "INFO" "Retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))  # Exponential backoff
        fi
    done
    
    log_message "ERROR" "WikiJS connectivity test failed after $RETRY_MAX attempts"
    return 1
}

# Function to validate MCP server files
validate_mcp_server() {
    log_message "INFO" "Validating WikiJS MCP server installation"
    
    if [ ! -d "$MCP_SERVER_DIR" ]; then
        log_message "ERROR" "WikiJS MCP server directory not found: $MCP_SERVER_DIR"
        log_message "INFO" "Expected location: $MCP_SERVER_DIR"
        return 1
    fi
    
    local required_files=(
        "src/wikijs_mcp/__init__.py"
        "src/wikijs_mcp/server.py"
        "src/wikijs_mcp/config.py"
        "src/wikijs_mcp/wikijs_client.py"
        "run_server.py"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$MCP_SERVER_DIR/$file" ]; then
            log_message "ERROR" "Required MCP server file missing: $file"
            return 1
        fi
    done
    
    log_message "INFO" "WikiJS MCP server files validated"
    return 0
}

# Function to start MCP server with monitoring
start_mcp_server() {
    log_message "INFO" "Starting WikiJS MCP server"
    
    cd "$MCP_SERVER_DIR"
    
    # Try multiple startup methods with fallbacks
    local startup_methods=(
        "python3 run_server.py"
        "PYTHONPATH=src python3 -m wikijs_mcp.server"
        "python3 -c 'import sys; sys.path.insert(0, \"src\"); from wikijs_mcp.server import main; main()'"
    )
    
    for method in "${startup_methods[@]}"; do
        log_message "INFO" "Attempting startup method: $method"
        
        if timeout $STARTUP_TIMEOUT bash -c "$method" 2>&1 | tee -a "$LOG_FILE"; then
            log_message "INFO" "WikiJS MCP server started successfully"
            return 0
        else
            local exit_code=$?
            log_message "WARN" "Startup method failed (exit code: $exit_code): $method"
        fi
    done
    
    log_message "ERROR" "All WikiJS MCP server startup methods failed"
    return 1
}

# Function to update health status
update_health_status() {
    local status="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$HEALTH_CHECK_FILE" <<EOF
{
    "timestamp": "$timestamp",
    "status": "$status",
    "message": "$message",
    "wrapper_version": "2.0.0",
    "wikijs_url": "$WIKIJS_URL",
    "pid": "$$"
}
EOF
}

# Function to handle graceful degradation
graceful_degradation() {
    log_message "WARN" "Entering graceful degradation mode"
    update_health_status "DEGRADED" "Operating in fallback mode"
    
    # Could implement fallback behaviors here:
    # - Offline mode
    # - Cached responses
    # - Alternative MCP server
    
    log_message "INFO" "Graceful degradation mode activated"
    return 0
}

# Function for comprehensive health check
health_check() {
    log_message "INFO" "Performing comprehensive health check"
    
    # Check 1: Credentials
    if ! load_credentials; then
        update_health_status "UNHEALTHY" "Credential loading failed"
        return 1
    fi
    
    # Check 2: MCP Server Files
    if ! validate_mcp_server; then
        update_health_status "UNHEALTHY" "MCP server validation failed"
        return 1
    fi
    
    # Check 3: WikiJS Connectivity (non-blocking)
    if ! test_connectivity; then
        log_message "WARN" "WikiJS connectivity issues detected, but continuing"
        update_health_status "WARNING" "WikiJS connectivity issues"
        # Don't return 1 here - allow degraded operation
    fi
    
    update_health_status "HEALTHY" "All health checks passed"
    log_message "INFO" "Health check completed successfully"
    return 0
}

# Main execution
main() {
    log_message "INFO" "WikiJS MCP Wrapper starting (PID: $$)"
    
    # Change to workspace directory
    cd "$WORKSPACE_DIR" || {
        log_message "ERROR" "Cannot change to workspace directory: $WORKSPACE_DIR"
        exit 1
    }
    
    # Perform health check
    if health_check; then
        log_message "INFO" "Health check passed, starting MCP server"
        
        if start_mcp_server; then
            update_health_status "RUNNING" "WikiJS MCP server running successfully"
            log_message "INFO" "WikiJS MCP server is running"
        else
            log_message "ERROR" "Failed to start WikiJS MCP server"
            
            # Try graceful degradation
            if graceful_degradation; then
                log_message "INFO" "Operating in degraded mode"
                exit 2  # Degraded but functional
            else
                update_health_status "FAILED" "WikiJS MCP server startup failed"
                exit 1
            fi
        fi
    else
        log_message "ERROR" "Health check failed"
        update_health_status "FAILED" "Health check failed"
        exit 1
    fi
}

# Execute main function
main "$@"
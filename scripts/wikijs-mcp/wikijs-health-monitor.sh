#!/bin/bash
# WikiJS Health Monitor - Integration with existing monitoring infrastructure
# Version: 1.0.0
# Integrates with project management monitoring system

set -euo pipefail

# Configuration
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
HEALTH_STATUS_FILE="/home/dev/.wikijs_mcp/health_status"
MONITOR_LOG="/home/dev/.mcp_logs/wikijs-health-monitor.log"
ALERT_THRESHOLD=3  # Number of consecutive failures before alerting
PROJECT_MGT_DIR="/home/dev/workspace/project-management"

# Create log directory
mkdir -p "/home/dev/.mcp_logs"

# Logging function
log_message() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] WikiJS-Monitor: $message" | tee -a "$MONITOR_LOG"
}

# Function to get current health status
get_health_status() {
    if [ -f "$HEALTH_STATUS_FILE" ]; then
        cat "$HEALTH_STATUS_FILE"
    else
        echo '{"status": "UNKNOWN", "message": "No health data available", "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
    fi
}

# Function to check if status has changed
has_status_changed() {
    local current_status="$1"
    local last_status_file="/tmp/.wikijs_last_status"
    local last_status=""
    
    if [ -f "$last_status_file" ]; then
        last_status=$(cat "$last_status_file")
    fi
    
    if [ "$current_status" != "$last_status" ]; then
        echo "$current_status" > "$last_status_file"
        return 0  # Status has changed
    else
        return 1  # Status unchanged
    fi
}

# Function to integrate with project management monitoring
notify_project_management() {
    local status="$1"
    local message="$2"
    
    # Check if project management monitoring exists
    if [ -d "$PROJECT_MGT_DIR" ] && [ -f "$PROJECT_MGT_DIR/scripts/health-monitor.sh" ]; then
        log_message "INFO" "Integrating with project management health monitoring"
        
        # Create WikiJS service status for project management system
        local pm_status_file="$PROJECT_MGT_DIR/data/health/wikijs-mcp.json"
        mkdir -p "$(dirname "$pm_status_file")"
        
        cat > "$pm_status_file" <<EOF
{
    "service": "wikijs-mcp",
    "status": "$status",
    "message": "$message",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "source": "wikijs-health-monitor",
    "integration": "mcp-server"
}
EOF
        
        log_message "INFO" "Project management health status updated"
    else
        log_message "WARN" "Project management monitoring not found, skipping integration"
    fi
}

# Function to send alerts
send_alert() {
    local status="$1"
    local message="$2"
    local urgency="$3"
    
    log_message "ALERT" "$urgency: WikiJS MCP $status - $message"
    
    # Integrate with existing alerting if available
    if command -v notify-send >/dev/null 2>&1; then
        notify-send "WikiJS MCP Alert" "$urgency: $status - $message" -u critical
    fi
    
    # Could integrate with other alerting systems:
    # - Slack webhooks
    # - Email notifications  
    # - PagerDuty
    # - Home Assistant notifications
    
    notify_project_management "$status" "$message"
}

# Function to perform health check using the token manager
perform_health_check() {
    log_message "INFO" "Performing WikiJS health check"
    
    if [ -x "$SCRIPT_DIR/wikijs-token-manager.sh" ]; then
        if "$SCRIPT_DIR/wikijs-token-manager.sh" test >/dev/null 2>&1; then
            log_message "INFO" "WikiJS health check passed"
            return 0
        else
            log_message "ERROR" "WikiJS health check failed"
            return 1
        fi
    else
        log_message "ERROR" "WikiJS token manager not found or not executable"
        return 1
    fi
}

# Function to handle health check results
handle_health_result() {
    local health_passed="$1"
    local consecutive_failures_file="/tmp/.wikijs_consecutive_failures"
    local consecutive_failures=0
    
    if [ -f "$consecutive_failures_file" ]; then
        consecutive_failures=$(cat "$consecutive_failures_file")
    fi
    
    if [ "$health_passed" = "true" ]; then
        # Health check passed
        if [ $consecutive_failures -gt 0 ]; then
            log_message "INFO" "WikiJS health recovered after $consecutive_failures failures"
            send_alert "RECOVERED" "Service health restored" "RECOVERY"
        fi
        echo "0" > "$consecutive_failures_file"
        notify_project_management "HEALTHY" "WikiJS MCP service is healthy"
    else
        # Health check failed
        consecutive_failures=$((consecutive_failures + 1))
        echo "$consecutive_failures" > "$consecutive_failures_file"
        
        log_message "WARN" "WikiJS health check failed ($consecutive_failures consecutive failures)"
        
        if [ $consecutive_failures -ge $ALERT_THRESHOLD ]; then
            send_alert "FAILED" "$consecutive_failures consecutive health check failures" "CRITICAL"
        fi
        
        notify_project_management "UNHEALTHY" "WikiJS MCP service health check failed ($consecutive_failures failures)"
    fi
}

# Function to check and report on MCP server wrapper status
check_wrapper_status() {
    local health_data=$(get_health_status)
    local status=$(echo "$health_data" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "UNKNOWN")
    local message=$(echo "$health_data" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "No message")
    
    log_message "INFO" "WikiJS MCP wrapper status: $status"
    
    if has_status_changed "$status"; then
        log_message "INFO" "Status changed to: $status"
        
        case "$status" in
            "HEALTHY"|"RUNNING")
                notify_project_management "HEALTHY" "$message"
                ;;
            "WARNING"|"DEGRADED")
                send_alert "$status" "$message" "WARNING"
                ;;
            "UNHEALTHY"|"FAILED")
                send_alert "$status" "$message" "CRITICAL"
                ;;
            *)
                notify_project_management "UNKNOWN" "$message"
                ;;
        esac
    fi
}

# Function to run continuous monitoring
continuous_monitor() {
    local interval="${1:-300}"  # Default 5 minutes
    
    log_message "INFO" "Starting continuous WikiJS health monitoring (interval: ${interval}s)"
    
    while true; do
        check_wrapper_status
        
        if perform_health_check; then
            handle_health_result "true"
        else
            handle_health_result "false"
        fi
        
        sleep "$interval"
    done
}

# Function to run single check
single_check() {
    log_message "INFO" "Running single WikiJS health check"
    
    check_wrapper_status
    
    if perform_health_check; then
        handle_health_result "true"
        echo "✅ WikiJS MCP health check passed"
        exit 0
    else
        handle_health_result "false"
        echo "❌ WikiJS MCP health check failed"
        exit 1
    fi
}

# Function to show current status
show_status() {
    local health_data=$(get_health_status)
    
    echo "WikiJS MCP Health Status"
    echo "========================"
    echo "$health_data" | python3 -m json.tool 2>/dev/null || echo "$health_data"
    echo ""
    
    # Show recent log entries
    if [ -f "$MONITOR_LOG" ]; then
        echo "Recent Activity:"
        echo "==============="
        tail -10 "$MONITOR_LOG"
    fi
}

# Function to generate health report
generate_report() {
    local output_file="${1:-/tmp/wikijs-health-report.json}"
    
    log_message "INFO" "Generating health report: $output_file"
    
    local health_data=$(get_health_status)
    local consecutive_failures=0
    
    if [ -f "/tmp/.wikijs_consecutive_failures" ]; then
        consecutive_failures=$(cat "/tmp/.wikijs_consecutive_failures")
    fi
    
    cat > "$output_file" <<EOF
{
    "report_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "service": "wikijs-mcp",
    "current_status": $health_data,
    "consecutive_failures": $consecutive_failures,
    "alert_threshold": $ALERT_THRESHOLD,
    "monitoring_active": true,
    "integration_status": {
        "project_management": $([ -d "$PROJECT_MGT_DIR" ] && echo "true" || echo "false"),
        "token_manager": $([ -x "$SCRIPT_DIR/wikijs-token-manager.sh" ] && echo "true" || echo "false")
    }
}
EOF
    
    echo "Health report generated: $output_file"
}

# Main command handling
case "${1:-check}" in
    "monitor")
        continuous_monitor "$2"
        ;;
    "check")
        single_check
        ;;
    "status")
        show_status
        ;;
    "report")
        generate_report "$2"
        ;;
    "test-alert")
        send_alert "TEST" "This is a test alert" "INFO"
        ;;
    *)
        echo "WikiJS Health Monitor - Integrated health monitoring for WikiJS MCP"
        echo "Usage: $0 {monitor|check|status|report|test-alert}"
        echo ""
        echo "Commands:"
        echo "  monitor [interval]  - Continuous monitoring (default: 300s)"
        echo "  check              - Single health check"
        echo "  status             - Show current health status"
        echo "  report [file]      - Generate health report"
        echo "  test-alert         - Send test alert"
        echo ""
        echo "Examples:"
        echo "  $0 monitor 60      # Monitor every minute"
        echo "  $0 check           # Single check"
        echo "  $0 status          # Show current status"
        exit 1
        ;;
esac
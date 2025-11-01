#!/bin/bash
# scripts/health-check.sh - Comprehensive health monitoring script

set -euo pipefail

# Configuration
DEPLOYMENT_DIR="${DEPLOYMENT_DIR:-/opt/homelab-gitops-auditor}"
LOG_FILE="${LOG_FILE:-/var/log/homelab-health.log}"
DOMAIN="${DOMAIN:-homelab.local}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Health check results
HEALTH_STATUS="HEALTHY"
ISSUES=()
WARNINGS=()

# Logging
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}INFO:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR:${NC} $1" | tee -a "$LOG_FILE"
    ISSUES+=("$1")
    HEALTH_STATUS="UNHEALTHY"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN:${NC} $1" | tee -a "$LOG_FILE"
    WARNINGS+=("$1")
}

# Check Docker services
check_docker_services() {
    log "Checking Docker services..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Check if docker-compose file exists
    if [[ ! -f "docker-compose.production.yml" ]]; then
        log_error "Docker Compose file not found"
        return 1
    fi
    
    # Check container status
    local containers=$(docker-compose ps --services)
    local unhealthy_containers=()
    
    for container in $containers; do
        local status=$(docker-compose ps "$container" | tail -n +3 | awk '{print $4}')
        if [[ "$status" != "Up" ]]; then
            unhealthy_containers+=("$container")
        fi
    done
    
    if [[ ${#unhealthy_containers[@]} -gt 0 ]]; then
        log_error "Unhealthy containers: ${unhealthy_containers[*]}"
    else
        log_success "All Docker containers are running"
    fi
    
    # Check Docker daemon health
    if ! docker system info >/dev/null 2>&1; then
        log_error "Docker daemon is not responding"
    else
        log_success "Docker daemon is healthy"
    fi
}

# Check application endpoints
check_endpoints() {
    log "Checking application endpoints..."
    
    local endpoints=(
        "http://localhost:80/health|Frontend Health"
        "http://localhost:3071/api/health|API Health"
        "https://$DOMAIN/health|HTTPS Frontend"
        "https://api.$DOMAIN/api/health|HTTPS API"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        IFS='|' read -r url description <<< "$endpoint_info"
        
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
        local response_time=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null || echo "0")
        
        if [[ "$response_code" == "200" ]]; then
            if (( $(echo "$response_time > 2.0" | bc -l) )); then
                log_warn "$description - Slow response: ${response_time}s"
            else
                log_success "$description - OK (${response_time}s)"
            fi
        else
            log_error "$description - HTTP $response_code"
        fi
    done
}

# Check database connectivity
check_database() {
    log "Checking database connectivity..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Check PostgreSQL container
    if docker-compose ps database | grep -q "Up"; then
        # Test database connection
        if docker-compose exec -T database pg_isready -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}" >/dev/null 2>&1; then
            log_success "Database is accepting connections"
            
            # Check database size and performance
            local db_size=$(docker-compose exec -T database psql -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}" -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB:-homelab_gitops}'));" | xargs)
            log "Database size: $db_size"
            
            # Check for long-running queries
            local long_queries=$(docker-compose exec -T database psql -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '5 minutes';" | xargs)
            
            if [[ "$long_queries" -gt 0 ]]; then
                log_warn "Found $long_queries long-running queries"
            fi
            
        else
            log_error "Database is not accepting connections"
        fi
    else
        log_error "Database container is not running"
    fi
    
    # Check Redis connectivity
    if docker-compose ps redis | grep -q "Up"; then
        if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log_success "Redis is responding"
            
            # Check Redis memory usage
            local redis_memory=$(docker-compose exec -T redis redis-cli info memory | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
            log "Redis memory usage: $redis_memory"
        else
            log_error "Redis is not responding"
        fi
    else
        log_error "Redis container is not running"
    fi
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        log_warn "High CPU usage: ${cpu_usage}%"
    else
        log_success "CPU usage: ${cpu_usage}%"
    fi
    
    # Memory usage
    local memory_info=$(free | grep "Mem:")
    local total_mem=$(echo $memory_info | awk '{print $2}')
    local used_mem=$(echo $memory_info | awk '{print $3}')
    local memory_percent=$(echo "scale=1; $used_mem * 100 / $total_mem" | bc)
    
    if (( $(echo "$memory_percent > 90" | bc -l) )); then
        log_error "Critical memory usage: ${memory_percent}%"
    elif (( $(echo "$memory_percent > 80" | bc -l) )); then
        log_warn "High memory usage: ${memory_percent}%"
    else
        log_success "Memory usage: ${memory_percent}%"
    fi
    
    # Disk usage
    local disk_usage=$(df "$DEPLOYMENT_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ "$disk_usage" -gt 90 ]]; then
        log_error "Critical disk usage: ${disk_usage}%"
    elif [[ "$disk_usage" -gt 80 ]]; then
        log_warn "High disk usage: ${disk_usage}%"
    else
        log_success "Disk usage: ${disk_usage}%"
    fi
    
    # Load average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local load_percent=$(echo "scale=1; $load_avg * 100 / $cpu_cores" | bc)
    
    if (( $(echo "$load_percent > 100" | bc -l) )); then
        log_warn "High system load: ${load_avg} (${load_percent}% of ${cpu_cores} cores)"
    else
        log_success "System load: ${load_avg} (${load_percent}% of ${cpu_cores} cores)"
    fi
}

# Check security status
check_security() {
    log "Checking security status..."
    
    # Firewall status
    if command -v ufw >/dev/null 2>&1; then
        if ufw status | grep -q "Status: active"; then
            log_success "Firewall is active"
        else
            log_warn "Firewall is not active"
        fi
    fi
    
    # fail2ban status
    if command -v fail2ban-client >/dev/null 2>&1; then
        if systemctl is-active fail2ban >/dev/null 2>&1; then
            log_success "fail2ban is running"
            
            # Check banned IPs
            local banned_ips=$(fail2ban-client status | grep "Jail list" | cut -d: -f2 | xargs)
            if [[ -n "$banned_ips" ]]; then
                for jail in $banned_ips; do
                    local banned_count=$(fail2ban-client status "$jail" | grep "Currently banned" | awk '{print $4}')
                    if [[ "$banned_count" -gt 0 ]]; then
                        log_warn "fail2ban jail '$jail' has $banned_count banned IPs"
                    fi
                done
            fi
        else
            log_warn "fail2ban is not running"
        fi
    fi
    
    # SSL certificate check
    if [[ -f "${DEPLOYMENT_DIR}/nginx/ssl/cert.pem" ]]; then
        local cert_expiry=$(openssl x509 -in "${DEPLOYMENT_DIR}/nginx/ssl/cert.pem" -noout -enddate | cut -d= -f2)
        local expiry_timestamp=$(date -d "$cert_expiry" +%s)
        local current_timestamp=$(date +%s)
        local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
        
        if [[ "$days_until_expiry" -lt 7 ]]; then
            log_error "SSL certificate expires in $days_until_expiry days"
        elif [[ "$days_until_expiry" -lt 30 ]]; then
            log_warn "SSL certificate expires in $days_until_expiry days"
        else
            log_success "SSL certificate valid for $days_until_expiry days"
        fi
    else
        log_warn "SSL certificate not found"
    fi
}

# Check monitoring services
check_monitoring() {
    log "Checking monitoring services..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Prometheus
    if docker-compose ps prometheus | grep -q "Up"; then
        local prom_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9090/-/healthy" 2>/dev/null || echo "000")
        if [[ "$prom_response" == "200" ]]; then
            log_success "Prometheus is healthy"
        else
            log_error "Prometheus health check failed"
        fi
    else
        log_warn "Prometheus container is not running"
    fi
    
    # Grafana
    if docker-compose ps grafana | grep -q "Up"; then
        local grafana_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/health" 2>/dev/null || echo "000")
        if [[ "$grafana_response" == "200" ]]; then
            log_success "Grafana is healthy"
        else
            log_error "Grafana health check failed"
        fi
    else
        log_warn "Grafana container is not running"
    fi
    
    # Loki
    if docker-compose ps loki | grep -q "Up"; then
        local loki_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/ready" 2>/dev/null || echo "000")
        if [[ "$loki_response" == "200" ]]; then
            log_success "Loki is healthy"
        else
            log_error "Loki health check failed"
        fi
    else
        log_warn "Loki container is not running"
    fi
}

# Check backup status
check_backups() {
    log "Checking backup status..."
    
    local backup_dir="${BACKUP_DIR:-/opt/backups}"
    
    if [[ -d "$backup_dir" ]]; then
        # Check for recent backups
        local latest_backup=$(find "$backup_dir" -name "*.tar.gz" -mtime -1 | head -1)
        
        if [[ -n "$latest_backup" ]]; then
            local backup_age=$(find "$backup_dir" -name "*.tar.gz" -mtime -1 | wc -l)
            log_success "Found $backup_age recent backup(s)"
            
            # Check backup size
            local backup_size=$(du -h "$latest_backup" 2>/dev/null | cut -f1)
            log "Latest backup size: $backup_size"
        else
            log_error "No recent backups found (within 24 hours)"
        fi
        
        # Check backup space
        local backup_space=$(df "$backup_dir" | tail -1 | awk '{print $5}' | sed 's/%//')
        if [[ "$backup_space" -gt 90 ]]; then
            log_error "Backup directory is ${backup_space}% full"
        elif [[ "$backup_space" -gt 80 ]]; then
            log_warn "Backup directory is ${backup_space}% full"
        fi
    else
        log_warn "Backup directory not found: $backup_dir"
    fi
}

# Send alerts
send_alerts() {
    if [[ "$HEALTH_STATUS" == "UNHEALTHY" ]] || [[ ${#WARNINGS[@]} -gt 0 ]]; then
        local message="Health Check Alert - $HEALTH_STATUS"
        
        if [[ ${#ISSUES[@]} -gt 0 ]]; then
            message+="\n\nCritical Issues:"
            for issue in "${ISSUES[@]}"; do
                message+="\n- $issue"
            done
        fi
        
        if [[ ${#WARNINGS[@]} -gt 0 ]]; then
            message+="\n\nWarnings:"
            for warning in "${WARNINGS[@]}"; do
                message+="\n- $warning"
            done
        fi
        
        # Email notification
        if [[ -n "$ALERT_EMAIL" ]] && command -v mail >/dev/null 2>&1; then
            echo -e "$message" | mail -s "Homelab Health Alert - $HEALTH_STATUS" "$ALERT_EMAIL"
        fi
        
        # Slack notification
        if [[ -n "$SLACK_WEBHOOK" ]]; then
            local color="warning"
            [[ "$HEALTH_STATUS" == "UNHEALTHY" ]] && color="danger"
            
            local payload=$(cat <<EOF
{
    "text": "Homelab Health Check Alert",
    "attachments": [
        {
            "color": "$color",
            "title": "$HEALTH_STATUS",
            "text": "$message"
        }
    ]
}
EOF
)
            curl -s -X POST "$SLACK_WEBHOOK" \
                -H "Content-Type: application/json" \
                -d "$payload" >/dev/null 2>&1 || log_warn "Failed to send Slack notification"
        fi
    fi
}

# Generate health report
generate_report() {
    local report_file="/tmp/health-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "# Homelab Health Check Report"
        echo "Generated: $(date)"
        echo "Status: $HEALTH_STATUS"
        echo ""
        
        if [[ ${#ISSUES[@]} -gt 0 ]]; then
            echo "## Critical Issues (${#ISSUES[@]})"
            for issue in "${ISSUES[@]}"; do
                echo "- $issue"
            done
            echo ""
        fi
        
        if [[ ${#WARNINGS[@]} -gt 0 ]]; then
            echo "## Warnings (${#WARNINGS[@]})"
            for warning in "${WARNINGS[@]}"; do
                echo "- $warning"
            done
            echo ""
        fi
        
        echo "## System Information"
        echo "Hostname: $(hostname)"
        echo "Uptime: $(uptime)"
        echo "Load: $(uptime | awk -F'load average:' '{print $2}')"
        echo "Memory: $(free -h | grep Mem)"
        echo "Disk: $(df -h "$DEPLOYMENT_DIR" | tail -1)"
        echo ""
        
        echo "## Container Status"
        cd "$DEPLOYMENT_DIR"
        docker-compose ps 2>/dev/null || echo "Docker Compose not available"
        echo ""
        
        echo "## Recent Log Entries"
        tail -20 "$LOG_FILE" 2>/dev/null || echo "Log file not available"
        
    } > "$report_file"
    
    echo "$report_file"
}

# Main health check function
main() {
    local mode="${1:-check}"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}    Homelab Health Check - $(date)    ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    case "$mode" in
        "check")
            check_docker_services
            check_endpoints
            check_database
            check_system_resources
            check_security
            check_monitoring
            check_backups
            
            # Summary
            echo ""
            echo -e "${BLUE}========================================${NC}"
            if [[ "$HEALTH_STATUS" == "HEALTHY" && ${#WARNINGS[@]} -eq 0 ]]; then
                echo -e "${GREEN}    Overall Status: HEALTHY    ${NC}"
            elif [[ "$HEALTH_STATUS" == "HEALTHY" ]]; then
                echo -e "${YELLOW}    Overall Status: HEALTHY (with warnings)    ${NC}"
            else
                echo -e "${RED}    Overall Status: UNHEALTHY    ${NC}"
            fi
            echo -e "${BLUE}========================================${NC}"
            
            # Send alerts if needed
            send_alerts
            ;;
            
        "report")
            # Run check and generate report
            main check >/dev/null 2>&1
            local report_file=$(generate_report)
            echo "Health report generated: $report_file"
            cat "$report_file"
            ;;
            
        "monitor")
            # Continuous monitoring mode
            while true; do
                main check
                echo "Sleeping for 5 minutes..."
                sleep 300
            done
            ;;
            
        "help"|*)
            echo "Usage: $0 {check|report|monitor|help}"
            echo ""
            echo "Commands:"
            echo "  check    - Run health checks and display results"
            echo "  report   - Generate detailed health report"
            echo "  monitor  - Continuous monitoring (checks every 5 minutes)"
            echo "  help     - Show this help"
            ;;
    esac
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
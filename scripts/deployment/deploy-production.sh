#!/bin/bash
# scripts/deploy-production.sh

set -euo pipefail

# Configuration
DEPLOYMENT_DIR="/opt/homelab-gitops-auditor"
BACKUP_DIR="/opt/backups"
LOG_FILE="/var/log/homelab-deploy.log"
VERSION="${1:-latest}"
ENVIRONMENT="${2:-production}"
DRY_RUN="${3:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}INFO:${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log_error "$1"
    send_notification "FAILED" "$1"
    exit 1
}

# Header
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Homelab GitOps Production Deployment  ${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${YELLOW}Version:${NC} $VERSION"
echo -e "${YELLOW}Environment:${NC} $ENVIRONMENT"
echo -e "${YELLOW}Dry Run:${NC} $DRY_RUN"
echo ""

# Check if running as appropriate user
if [[ $EUID -eq 0 ]]; then
   log_warn "Running as root. Consider using a dedicated deployment user for security."
fi

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || error_exit "Docker is not installed"
    command -v docker-compose >/dev/null 2>&1 || error_exit "Docker Compose is not installed"
    
    if ! docker info >/dev/null 2>&1; then
        error_exit "Docker daemon is not running or user lacks permissions"
    fi
    
    if [[ ! -f "${DEPLOYMENT_DIR}/.env" ]]; then
        log_warn "Environment file not found: ${DEPLOYMENT_DIR}/.env"
        if [[ -f "${DEPLOYMENT_DIR}/config/environment.production.example" ]]; then
            log "Please copy and configure: cp config/environment.production.example .env"
        fi
        error_exit "Environment configuration required"
    fi
    
    # Check Docker Compose file
    if [[ ! -f "${DEPLOYMENT_DIR}/docker-compose.production.yml" ]]; then
        error_exit "Production Docker Compose file not found: ${DEPLOYMENT_DIR}/docker-compose.production.yml"
    fi
    
    log_success "Prerequisites check completed"
}

# Load environment variables
load_environment() {
    log "Loading environment configuration..."
    if [[ -f "${DEPLOYMENT_DIR}/.env" ]]; then
        set -a
        source "${DEPLOYMENT_DIR}/.env"
        set +a
        log_success "Environment configuration loaded"
    else
        error_exit "Environment file not found"
    fi
}

# Create backup
create_backup() {
    log "Creating backup before deployment..."
    
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
    
    mkdir -p "$BACKUP_PATH"
    
    # Backup database if running
    if docker-compose ps database | grep -q "Up"; then
        log "Backing up database..."
        docker-compose exec -T database pg_dump -U "${POSTGRES_USER:-homelab_user}" "${POSTGRES_DB:-homelab_gitops}" > "${BACKUP_PATH}/database.sql" || log_warn "Database backup failed"
    fi
    
    # Backup application data
    log "Backing up application data..."
    [[ -d "${DEPLOYMENT_DIR}/data" ]] && cp -r "${DEPLOYMENT_DIR}/data" "${BACKUP_PATH}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/config" ]] && cp -r "${DEPLOYMENT_DIR}/config" "${BACKUP_PATH}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/logs" ]] && cp -r "${DEPLOYMENT_DIR}/logs" "${BACKUP_PATH}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/audit-history" ]] && cp -r "${DEPLOYMENT_DIR}/audit-history" "${BACKUP_PATH}/" 2>/dev/null || true
    
    # Backup current environment
    [[ -f "${DEPLOYMENT_DIR}/.env" ]] && cp "${DEPLOYMENT_DIR}/.env" "${BACKUP_PATH}/" || true
    
    # Compress backup
    tar -czf "${BACKUP_PATH}.tar.gz" -C "$BACKUP_DIR" "$BACKUP_NAME" && rm -rf "$BACKUP_PATH"
    
    # Keep only last 10 backups
    cd "$BACKUP_DIR"
    ls -t backup-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm
    
    log_success "Backup created: ${BACKUP_NAME}.tar.gz"
    echo "$BACKUP_NAME" > /tmp/latest_backup_name
}

# Pre-deployment validation
pre_deployment_validation() {
    log "Running pre-deployment validation..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Validate Docker Compose configuration
    log "Validating Docker Compose configuration..."
    docker-compose -f docker-compose.production.yml config >/dev/null || error_exit "Invalid Docker Compose configuration"
    
    # Check required environment variables
    local required_vars=("POSTGRES_PASSWORD" "JWT_SECRET" "GITHUB_TOKEN")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error_exit "Required environment variable $var is not set"
        fi
    done
    
    # Validate SSL certificates if not using Let's Encrypt automation
    if [[ "${SSL_MODE:-automatic}" != "automatic" ]]; then
        if [[ ! -f "./nginx/ssl/cert.pem" ]] || [[ ! -f "./nginx/ssl/key.pem" ]]; then
            log_warn "SSL certificates not found. Will attempt Let's Encrypt setup."
        fi
    fi
    
    log_success "Pre-deployment validation completed"
}

# Health check
health_check() {
    local url="$1"
    local max_attempts="${2:-30}"
    local attempt=1
    
    log "Performing health check on $url..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s --max-time 10 "$url" >/dev/null 2>&1; then
            log_success "Health check passed (attempt $attempt)"
            return 0
        fi
        
        log "Health check failed, attempt $attempt/$max_attempts"
        sleep 10
        ((attempt++))
    done
    
    error_exit "Health check failed after $max_attempts attempts"
}

# Blue-green deployment
blue_green_deployment() {
    log "Starting blue-green deployment..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Set version in environment
    export VERSION="$VERSION"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would pull images and deploy version $VERSION"
        return 0
    fi
    
    # Pull new images
    log "Pulling new images..."
    docker-compose -f docker-compose.production.yml pull || error_exit "Failed to pull images"
    
    # Create green environment configuration
    log "Preparing green environment..."
    cp docker-compose.production.yml docker-compose.green.yml
    
    # Modify green configuration for different ports
    sed -i 's/homelab-/homelab-green-/g' docker-compose.green.yml
    sed -i 's/:80:/:8080:/g' docker-compose.green.yml
    sed -i 's/:443:/:8443:/g' docker-compose.green.yml
    sed -i 's/:3071/:3072:/g' docker-compose.green.yml
    
    # Start green environment
    log "Starting green environment..."
    docker-compose -f docker-compose.green.yml up -d --remove-orphans
    
    # Wait for green environment to be ready
    log "Waiting for green environment to initialize..."
    sleep 60
    
    # Health check green environment
    if health_check "http://localhost:8080/health" 30; then
        log_success "Green environment is healthy"
        
        # Update load balancer to point to green (if using external LB)
        # For now, we'll do a quick cutover
        
        log "Switching traffic to green environment..."
        
        # Stop blue environment
        docker-compose -f docker-compose.production.yml down || log_warn "Failed to stop blue environment cleanly"
        
        # Update green to use production ports
        docker-compose -f docker-compose.green.yml down
        
        # Start production environment with new version
        docker-compose -f docker-compose.production.yml up -d --remove-orphans
        
        # Clean up green config
        rm -f docker-compose.green.yml
        
        log_success "Blue-green deployment completed successfully"
    else
        log_error "Green environment failed health check, rolling back..."
        docker-compose -f docker-compose.green.yml down
        rm -f docker-compose.green.yml
        error_exit "Deployment failed, rolled back to previous version"
    fi
}

# Standard deployment (fallback)
standard_deployment() {
    log "Starting standard deployment..."
    
    cd "$DEPLOYMENT_DIR"
    
    export VERSION="$VERSION"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would deploy version $VERSION"
        return 0
    fi
    
    # Pull new images
    log "Pulling new images..."
    docker-compose -f docker-compose.production.yml pull || error_exit "Failed to pull images"
    
    # Stop services gracefully
    log "Stopping current services..."
    docker-compose -f docker-compose.production.yml down --timeout 30
    
    # Start services
    log "Starting new services..."
    docker-compose -f docker-compose.production.yml up -d --remove-orphans
    
    log_success "Standard deployment completed"
}

# Post-deployment validation
post_deployment_validation() {
    log "Performing post-deployment validation..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would validate deployment"
        return 0
    fi
    
    # Wait for services to stabilize
    sleep 30
    
    # Comprehensive health checks
    health_check "http://localhost:80/health"
    health_check "http://localhost:3071/api/health"
    
    # Test basic functionality
    log "Testing basic API functionality..."
    local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3071/api/health")
    if [[ "$response" == "200" ]]; then
        log_success "API endpoint responding correctly"
    else
        error_exit "API endpoint returned unexpected status: $response"
    fi
    
    # Check database connectivity
    log "Checking database connectivity..."
    docker-compose exec -T database pg_isready -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}" || error_exit "Database connectivity check failed"
    
    # Check monitoring stack
    log "Checking monitoring stack..."
    health_check "http://localhost:9090/-/healthy" 15 # Prometheus
    health_check "http://localhost:3001/api/health" 15 # Grafana
    
    # Verify Docker container status
    log "Checking container status..."
    if ! docker-compose ps | grep -q "Up"; then
        error_exit "Some containers are not running properly"
    fi
    
    log_success "Post-deployment validation completed successfully"
}

# Update deployment record
update_deployment_record() {
    log "Recording deployment in system..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would record deployment"
        return 0
    fi
    
    local deployment_data=$(cat <<EOF
{
    "version": "$VERSION",
    "environment": "$ENVIRONMENT",
    "deployedBy": "$(whoami)",
    "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "status": "success",
    "backupName": "$(cat /tmp/latest_backup_name 2>/dev/null || echo 'unknown')"
}
EOF
)

    # Record in API if available
    curl -s -X POST "http://localhost:3071/api/deployments/record" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${DEPLOYMENT_TOKEN:-}" \
        -d "$deployment_data" || log_warn "Could not record deployment in API"
    
    # Record in local file
    echo "$deployment_data" >> "${DEPLOYMENT_DIR}/deployment-history.json"
    
    log_success "Deployment record updated"
}

# Cleanup
cleanup() {
    log "Performing cleanup..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would perform cleanup"
        return 0
    fi
    
    # Remove unused Docker images
    docker image prune -f
    
    # Remove unused volumes (be careful!)
    # docker volume prune -f
    
    # Clean up old logs (keep last 30 days)
    find "${DEPLOYMENT_DIR}/logs" -name "*.log" -mtime +30 -delete 2>/dev/null || true
    
    # Clean up temporary files
    rm -f /tmp/latest_backup_name docker-compose.green.yml
    
    log_success "Cleanup completed"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        local payload=$(cat <<EOF
{
    "text": "Homelab Deployment ${status}",
    "attachments": [
        {
            "color": "$([[ "${status}" == "SUCCESS" ]] && echo "good" || echo "danger")",
            "fields": [
                {
                    "title": "Environment",
                    "value": "$ENVIRONMENT",
                    "short": true
                },
                {
                    "title": "Version",
                    "value": "$VERSION",
                    "short": true
                },
                {
                    "title": "Message",
                    "value": "$message",
                    "short": false
                }
            ]
        }
    ]
}
EOF
)
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "$payload" || log_warn "Could not send Slack notification"
    fi
    
    # Email notification (if configured)
    if [[ -n "${NOTIFICATION_EMAIL:-}" ]] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "Homelab Deployment $status" "$NOTIFICATION_EMAIL" || log_warn "Could not send email notification"
    fi
}

# Rollback function
rollback() {
    local backup_name="${1:-}"
    
    if [[ -z "$backup_name" ]]; then
        log_error "No backup name provided for rollback"
        return 1
    fi
    
    log "Rolling back to backup: $backup_name"
    
    # Stop current services
    docker-compose -f docker-compose.production.yml down || true
    
    # Restore from backup
    if [[ -f "${BACKUP_DIR}/${backup_name}.tar.gz" ]]; then
        cd "$BACKUP_DIR"
        tar -xzf "${backup_name}.tar.gz"
        
        # Restore database
        if [[ -f "${backup_name}/database.sql" ]]; then
            log "Restoring database..."
            # Start just the database
            cd "$DEPLOYMENT_DIR"
            docker-compose -f docker-compose.production.yml up -d database
            sleep 30
            cat "${BACKUP_DIR}/${backup_name}/database.sql" | docker-compose exec -T database psql -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}"
        fi
        
        # Restore application data
        [[ -d "${backup_name}/data" ]] && cp -r "${backup_name}/data" "${DEPLOYMENT_DIR}/" || true
        [[ -d "${backup_name}/config" ]] && cp -r "${backup_name}/config" "${DEPLOYMENT_DIR}/" || true
        [[ -d "${backup_name}/audit-history" ]] && cp -r "${backup_name}/audit-history" "${DEPLOYMENT_DIR}/" || true
        [[ -f "${backup_name}/.env" ]] && cp "${backup_name}/.env" "${DEPLOYMENT_DIR}/" || true
        
        # Clean up
        rm -rf "${backup_name}"
        
        log_success "Rollback completed"
    else
        error_exit "Backup file not found: ${BACKUP_DIR}/${backup_name}.tar.gz"
    fi
}

# Main deployment process
main() {
    log "Starting production deployment process..."
    log "Version: $VERSION"
    log "Environment: $ENVIRONMENT"
    log "Dry Run: $DRY_RUN"
    
    trap 'send_notification "FAILED" "Deployment failed during execution"' ERR
    
    check_prerequisites
    load_environment
    pre_deployment_validation
    create_backup
    
    # Choose deployment strategy based on availability
    if command -v docker-compose >/dev/null 2>&1 && [[ "${BLUE_GREEN_DEPLOYMENT:-true}" == "true" ]]; then
        blue_green_deployment
    else
        standard_deployment
    fi
    
    post_deployment_validation
    update_deployment_record
    cleanup
    
    send_notification "SUCCESS" "Deployment completed successfully"
    
    log_success "Production deployment completed successfully!"
    log_success "Version $VERSION is now live in $ENVIRONMENT environment"
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}    Deployment Summary    ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${CYAN}Dashboard:${NC} https://${DOMAIN:-homelab.local}/"
    echo -e "${CYAN}API:${NC} https://api.${DOMAIN:-homelab.local}/api/health"
    echo -e "${CYAN}Monitoring:${NC} https://${DOMAIN:-homelab.local}/grafana/"
    echo -e "${CYAN}Version:${NC} $VERSION"
    echo -e "${CYAN}Environment:${NC} $ENVIRONMENT"
    echo ""
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Handle special commands
    case "${1:-deploy}" in
        "rollback")
            rollback "${2:-}"
            ;;
        "health")
            health_check "http://localhost:3071/api/health"
            ;;
        "deploy"|*)
            main "$@"
            ;;
    esac
fi
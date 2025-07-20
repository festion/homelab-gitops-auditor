#!/bin/bash
# scripts/backup.sh - Comprehensive backup and recovery system

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
LOG_FILE="${LOG_FILE:-/var/log/homelab-backup.log}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DEPLOYMENT_DIR="${DEPLOYMENT_DIR:-/opt/homelab-gitops-auditor}"
S3_BACKUP_ENABLED="${S3_BACKUP_ENABLED:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}INFO:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN:${NC} $1" | tee -a "$LOG_FILE"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Full backup function
full_backup() {
    local backup_name="full-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    log "Starting full backup: $backup_name"
    mkdir -p "$backup_path"
    
    # Database backup
    log "Backing up PostgreSQL database..."
    if docker-compose ps database 2>/dev/null | grep -q "Up"; then
        docker-compose exec -T database pg_dump -U "${POSTGRES_USER:-homelab_user}" "${POSTGRES_DB:-homelab_gitops}" > "${backup_path}/database.sql" || {
            log_error "Database backup failed"
            return 1
        }
        log_success "Database backup completed"
    else
        log_warn "Database container not running, skipping database backup"
    fi
    
    # Application data backup
    log "Backing up application data..."
    [[ -d "${DEPLOYMENT_DIR}/data" ]] && cp -r "${DEPLOYMENT_DIR}/data" "${backup_path}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/config" ]] && cp -r "${DEPLOYMENT_DIR}/config" "${backup_path}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/logs" ]] && cp -r "${DEPLOYMENT_DIR}/logs" "${backup_path}/" 2>/dev/null || true
    [[ -d "${DEPLOYMENT_DIR}/audit-history" ]] && cp -r "${DEPLOYMENT_DIR}/audit-history" "${backup_path}/" 2>/dev/null || true
    
    # Configuration backup
    log "Backing up configuration files..."
    [[ -f "${DEPLOYMENT_DIR}/.env" ]] && cp "${DEPLOYMENT_DIR}/.env" "${backup_path}/env.backup" || true
    [[ -f "${DEPLOYMENT_DIR}/docker-compose.production.yml" ]] && cp "${DEPLOYMENT_DIR}/docker-compose.production.yml" "${backup_path}/" || true
    
    # Docker volumes backup
    log "Backing up Docker volumes..."
    local volumes_backup="${backup_path}/volumes"
    mkdir -p "$volumes_backup"
    
    # List and backup important volumes
    local important_volumes=("postgres-data" "redis-data" "api-data" "backup-storage" "audit-history")
    for volume in "${important_volumes[@]}"; do
        local volume_name="${PWD##*/}_${volume}"
        if docker volume inspect "$volume_name" >/dev/null 2>&1; then
            log "Backing up volume: $volume_name"
            docker run --rm -v "$volume_name":/source -v "$volumes_backup":/backup alpine tar czf "/backup/${volume}.tar.gz" -C /source . || log_warn "Failed to backup volume $volume_name"
        fi
    done
    
    # System information
    log "Collecting system information..."
    {
        echo "# Backup Information"
        echo "Backup Name: $backup_name"
        echo "Backup Date: $(date)"
        echo "System: $(uname -a)"
        echo "Docker Version: $(docker --version)"
        echo "Docker Compose Version: $(docker-compose --version)"
        echo ""
        echo "# Running Containers"
        docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "# Docker Images"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}"
        echo ""
        echo "# Environment Variables"
        env | grep -E '^(POSTGRES|REDIS|JWT|GITHUB|DOMAIN)' | sort
    } > "${backup_path}/system-info.txt"
    
    # Create manifest
    log "Creating backup manifest..."
    {
        echo "# Backup Manifest"
        echo "backup_name: $backup_name"
        echo "backup_date: $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
        echo "backup_type: full"
        echo "version: ${VERSION:-unknown}"
        echo "contents:"
        find "$backup_path" -type f -exec basename {} \; | sort | sed 's/^/  - /'
    } > "${backup_path}/manifest.yml"
    
    # Compress backup
    log "Compressing backup..."
    tar -czf "${backup_path}.tar.gz" -C "$BACKUP_DIR" "$backup_name"
    rm -rf "$backup_path"
    
    # Upload to S3 if enabled
    if [[ "$S3_BACKUP_ENABLED" == "true" ]]; then
        upload_to_s3 "${backup_path}.tar.gz"
    fi
    
    log_success "Full backup completed: ${backup_name}.tar.gz"
    echo "$backup_name"
}

# Incremental backup function
incremental_backup() {
    local backup_name="incremental-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    local last_backup_date="${1:-$(date -d '1 day ago' +%Y-%m-%d)}"
    
    log "Starting incremental backup: $backup_name (since $last_backup_date)"
    mkdir -p "$backup_path"
    
    # Find files modified since last backup
    log "Finding files modified since $last_backup_date..."
    find "${DEPLOYMENT_DIR}" -type f -newermt "$last_backup_date" ! -path "*/node_modules/*" ! -path "*/.git/*" > "${backup_path}/changed-files.txt"
    
    # Copy changed files
    if [[ -s "${backup_path}/changed-files.txt" ]]; then
        log "Backing up $(wc -l < "${backup_path}/changed-files.txt") changed files..."
        while IFS= read -r file; do
            local rel_path="${file#${DEPLOYMENT_DIR}/}"
            local dest_dir="${backup_path}/$(dirname "$rel_path")"
            mkdir -p "$dest_dir"
            cp "$file" "$dest_dir/" 2>/dev/null || log_warn "Failed to backup: $file"
        done < "${backup_path}/changed-files.txt"
    else
        log "No files changed since $last_backup_date"
    fi
    
    # Always include current logs
    log "Including current log files..."
    [[ -d "${DEPLOYMENT_DIR}/logs" ]] && cp -r "${DEPLOYMENT_DIR}/logs" "${backup_path}/" 2>/dev/null || true
    
    # Create manifest
    {
        echo "# Incremental Backup Manifest"
        echo "backup_name: $backup_name"
        echo "backup_date: $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
        echo "backup_type: incremental"
        echo "since_date: $last_backup_date"
        echo "files_changed: $(wc -l < "${backup_path}/changed-files.txt" 2>/dev/null || echo 0)"
    } > "${backup_path}/manifest.yml"
    
    # Compress backup
    tar -czf "${backup_path}.tar.gz" -C "$BACKUP_DIR" "$backup_name"
    rm -rf "$backup_path"
    
    log_success "Incremental backup completed: ${backup_name}.tar.gz"
    echo "$backup_name"
}

# Database only backup
database_backup() {
    local backup_name="db-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="${BACKUP_DIR}/${backup_name}.sql"
    
    log "Starting database backup: $backup_name"
    
    if docker-compose ps database 2>/dev/null | grep -q "Up"; then
        docker-compose exec -T database pg_dump -U "${POSTGRES_USER:-homelab_user}" "${POSTGRES_DB:-homelab_gitops}" > "$backup_path" || {
            log_error "Database backup failed"
            return 1
        }
        
        # Compress database backup
        gzip "$backup_path"
        
        log_success "Database backup completed: ${backup_name}.sql.gz"
        echo "$backup_name"
    else
        log_error "Database container not running"
        return 1
    fi
}

# Upload to S3
upload_to_s3() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    if [[ "$S3_BACKUP_ENABLED" != "true" ]]; then
        return 0
    fi
    
    log "Uploading to S3: $file_name"
    
    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$file_path" "s3://${S3_BUCKET}/backups/$file_name" || log_warn "S3 upload failed"
    elif command -v s3cmd >/dev/null 2>&1; then
        s3cmd put "$file_path" "s3://${S3_BUCKET}/backups/$file_name" || log_warn "S3 upload failed"
    else
        log_warn "No S3 client available (aws or s3cmd)"
    fi
}

# List backups
list_backups() {
    log "Available backups:"
    echo ""
    echo "Local backups in $BACKUP_DIR:"
    ls -lah "$BACKUP_DIR"/*.tar.gz 2>/dev/null | while read -r line; do
        echo "  $line"
    done
    
    if [[ "$S3_BACKUP_ENABLED" == "true" ]] && command -v aws >/dev/null 2>&1; then
        echo ""
        echo "S3 backups:"
        aws s3 ls "s3://${S3_BUCKET}/backups/" 2>/dev/null | while read -r line; do
            echo "  $line"
        done
    fi
}

# Restore function
restore() {
    local backup_name="$1"
    local restore_type="${2:-full}"
    
    if [[ -z "$backup_name" ]]; then
        log_error "Backup name required"
        list_backups
        return 1
    fi
    
    local backup_file="${BACKUP_DIR}/${backup_name}.tar.gz"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log "Starting restore from: $backup_name"
    
    # Create restore directory
    local restore_dir="/tmp/restore-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$restore_dir"
    
    # Extract backup
    log "Extracting backup..."
    tar -xzf "$backup_file" -C "$restore_dir"
    
    local backup_contents="$restore_dir/$backup_name"
    
    if [[ "$restore_type" == "database" ]] || [[ "$restore_type" == "full" ]]; then
        # Restore database
        if [[ -f "$backup_contents/database.sql" ]]; then
            log "Restoring database..."
            
            # Ensure database is running
            cd "$DEPLOYMENT_DIR"
            docker-compose up -d database
            sleep 30
            
            # Restore database
            cat "$backup_contents/database.sql" | docker-compose exec -T database psql -U "${POSTGRES_USER:-homelab_user}" -d "${POSTGRES_DB:-homelab_gitops}" || {
                log_error "Database restore failed"
                rm -rf "$restore_dir"
                return 1
            }
            log_success "Database restored"
        fi
    fi
    
    if [[ "$restore_type" == "data" ]] || [[ "$restore_type" == "full" ]]; then
        # Restore application data
        log "Restoring application data..."
        [[ -d "$backup_contents/data" ]] && cp -r "$backup_contents/data" "${DEPLOYMENT_DIR}/" || true
        [[ -d "$backup_contents/config" ]] && cp -r "$backup_contents/config" "${DEPLOYMENT_DIR}/" || true
        [[ -d "$backup_contents/audit-history" ]] && cp -r "$backup_contents/audit-history" "${DEPLOYMENT_DIR}/" || true
        
        # Restore environment (with confirmation)
        if [[ -f "$backup_contents/env.backup" ]]; then
            read -p "Restore environment configuration? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                cp "$backup_contents/env.backup" "${DEPLOYMENT_DIR}/.env"
                log_success "Environment configuration restored"
            fi
        fi
        log_success "Application data restored"
    fi
    
    if [[ "$restore_type" == "volumes" ]] || [[ "$restore_type" == "full" ]]; then
        # Restore Docker volumes
        if [[ -d "$backup_contents/volumes" ]]; then
            log "Restoring Docker volumes..."
            cd "$backup_contents/volumes"
            for volume_file in *.tar.gz; do
                if [[ -f "$volume_file" ]]; then
                    local volume_name="${PWD##*/}_${volume_file%.tar.gz}"
                    log "Restoring volume: $volume_name"
                    docker run --rm -v "$volume_name":/target -v "$(pwd)":/backup alpine tar xzf "/backup/$volume_file" -C /target || log_warn "Failed to restore volume $volume_name"
                fi
            done
            log_success "Docker volumes restored"
        fi
    fi
    
    # Cleanup
    rm -rf "$restore_dir"
    
    log_success "Restore completed from: $backup_name"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    # Local cleanup
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete || log_warn "Failed to clean some local backups"
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete || log_warn "Failed to clean some database backups"
    
    # S3 cleanup (if enabled)
    if [[ "$S3_BACKUP_ENABLED" == "true" ]] && command -v aws >/dev/null 2>&1; then
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r date time size file; do
            if [[ "$date" < "$cutoff_date" ]]; then
                log "Deleting old S3 backup: $file"
                aws s3 rm "s3://${S3_BUCKET}/backups/$file" || log_warn "Failed to delete S3 backup: $file"
            fi
        done
    fi
    
    log_success "Cleanup completed"
}

# Verify backup integrity
verify_backup() {
    local backup_name="$1"
    
    if [[ -z "$backup_name" ]]; then
        log_error "Backup name required for verification"
        return 1
    fi
    
    local backup_file="${BACKUP_DIR}/${backup_name}.tar.gz"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log "Verifying backup: $backup_name"
    
    # Test archive integrity
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log_success "Archive integrity verified"
    else
        log_error "Archive is corrupted"
        return 1
    fi
    
    # Extract and verify contents
    local temp_dir="/tmp/verify-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$temp_dir"
    
    if tar -xzf "$backup_file" -C "$temp_dir" >/dev/null 2>&1; then
        log_success "Archive extraction successful"
        
        # Check for key files
        local backup_contents="$temp_dir/$backup_name"
        local issues=0
        
        if [[ -f "$backup_contents/manifest.yml" ]]; then
            log_success "Manifest file found"
        else
            log_warn "Manifest file missing"
            ((issues++))
        fi
        
        if [[ -f "$backup_contents/database.sql" ]]; then
            log_success "Database backup found"
            # Basic SQL validation
            if head -5 "$backup_contents/database.sql" | grep -q "PostgreSQL"; then
                log_success "Database backup appears valid"
            else
                log_warn "Database backup may be invalid"
                ((issues++))
            fi
        else
            log_warn "Database backup not found"
        fi
        
        # Cleanup
        rm -rf "$temp_dir"
        
        if [[ $issues -eq 0 ]]; then
            log_success "Backup verification passed"
            return 0
        else
            log_warn "Backup verification completed with $issues issues"
            return 1
        fi
    else
        log_error "Archive extraction failed"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Main function
main() {
    local command="${1:-full}"
    
    case "$command" in
        "full")
            full_backup
            ;;
        "incremental")
            incremental_backup "${2:-}"
            ;;
        "database"|"db")
            database_backup
            ;;
        "list")
            list_backups
            ;;
        "restore")
            restore "${2:-}" "${3:-full}"
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "verify")
            verify_backup "${2:-}"
            ;;
        "help"|*)
            echo "Usage: $0 {full|incremental|database|list|restore|cleanup|verify|help}"
            echo ""
            echo "Commands:"
            echo "  full                    - Create full backup"
            echo "  incremental [date]      - Create incremental backup since date"
            echo "  database               - Backup database only"
            echo "  list                   - List available backups"
            echo "  restore <name> [type]  - Restore from backup (type: full|database|data|volumes)"
            echo "  cleanup                - Remove old backups"
            echo "  verify <name>          - Verify backup integrity"
            echo "  help                   - Show this help"
            ;;
    esac
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
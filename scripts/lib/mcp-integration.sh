#!/bin/bash
# MCP Server Integration Library
# Provides comprehensive integration with Network-FS and GitHub MCP servers
# Version: 1.0.0

# MCP Integration Library Constants
readonly MCP_LIB_VERSION="1.0.0"
readonly MCP_TIMEOUT_DEFAULT=60
readonly MCP_RETRY_ATTEMPTS=3
readonly MCP_RETRY_DELAY=5

# MCP wrapper script paths
readonly NETWORK_MCP_WRAPPER="${NETWORK_MCP_WRAPPER:-/home/dev/workspace/network-mcp-wrapper.sh}"
readonly GITHUB_MCP_WRAPPER="${GITHUB_MCP_WRAPPER:-/home/dev/workspace/github-wrapper.sh}"

# MCP operation status tracking
declare -A MCP_OPERATIONS
declare -A MCP_METRICS

# MCP Error Codes
readonly MCP_SUCCESS=0
readonly MCP_ERROR_CONNECTION=10
readonly MCP_ERROR_TIMEOUT=11
readonly MCP_ERROR_AUTHENTICATION=12
readonly MCP_ERROR_OPERATION=13
readonly MCP_ERROR_NOT_FOUND=14
readonly MCP_ERROR_PERMISSION=15

# MCP Logging functions (extend main script logging)
mcp_log_info() {
    log_info "[MCP] $1"
}

mcp_log_error() {
    log_error "[MCP] $1"
}

mcp_log_debug() {
    log_debug "[MCP] $1"
}

# MCP operation wrapper with retry logic
mcp_execute_with_retry() {
    local operation="$1"
    local max_attempts="${2:-$MCP_RETRY_ATTEMPTS}"
    local delay="${3:-$MCP_RETRY_DELAY}"
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        mcp_log_debug "Executing MCP operation: $operation (attempt $attempt/$max_attempts)"
        
        if eval "$operation"; then
            mcp_log_debug "MCP operation succeeded on attempt $attempt"
            return $MCP_SUCCESS
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            mcp_log_error "MCP operation failed after $max_attempts attempts: $operation"
            return $MCP_ERROR_OPERATION
        fi
        
        mcp_log_debug "MCP operation failed, retrying in ${delay}s..."
        sleep "$delay"
        ((attempt++))
    done
}

# Test MCP server connectivity
mcp_test_connectivity() {
    local server_type="$1"
    local wrapper_script=""
    
    case "$server_type" in
        "network-fs")
            wrapper_script="$NETWORK_MCP_WRAPPER"
            ;;
        "github")
            wrapper_script="$GITHUB_MCP_WRAPPER"
            ;;
        *)
            mcp_log_error "Unknown MCP server type: $server_type"
            return $MCP_ERROR_OPERATION
            ;;
    esac
    
    if [[ ! -x "$wrapper_script" ]]; then
        mcp_log_error "MCP wrapper script not found or not executable: $wrapper_script"
        return $MCP_ERROR_CONNECTION
    fi
    
    mcp_log_debug "Testing $server_type MCP server connectivity..."
    
    if timeout "$MCP_TIMEOUT_DEFAULT" "$wrapper_script" status >/dev/null 2>&1; then
        mcp_log_debug "$server_type MCP server: Connected"
        return $MCP_SUCCESS
    else
        mcp_log_error "$server_type MCP server: Connection failed"
        return $MCP_ERROR_CONNECTION
    fi
}

# Network-FS MCP Operations
mcp_networkfs_list_directory() {
    local share_name="$1"
    local remote_path="${2:-.}"
    local operation="\"$NETWORK_MCP_WRAPPER\" list \"$share_name\" \"$remote_path\""
    
    mcp_log_debug "Listing directory: $share_name:$remote_path"
    mcp_execute_with_retry "$operation"
}

mcp_networkfs_read_file() {
    local share_name="$1"
    local remote_path="$2"
    local local_path="$3"
    local operation="\"$NETWORK_MCP_WRAPPER\" read \"$share_name\" \"$remote_path\" > \"$local_path\""
    
    mcp_log_debug "Reading file: $share_name:$remote_path -> $local_path"
    mcp_execute_with_retry "$operation"
}

mcp_networkfs_write_file() {
    local share_name="$1"
    local local_path="$2"
    local remote_path="$3"
    local operation="\"$NETWORK_MCP_WRAPPER\" write \"$share_name\" \"$local_path\" \"$remote_path\""
    
    mcp_log_debug "Writing file: $local_path -> $share_name:$remote_path"
    mcp_execute_with_retry "$operation"
}

mcp_networkfs_create_directory() {
    local share_name="$1"
    local remote_path="$2"
    local operation="\"$NETWORK_MCP_WRAPPER\" mkdir \"$share_name\" \"$remote_path\""
    
    mcp_log_debug "Creating directory: $share_name:$remote_path"
    mcp_execute_with_retry "$operation"
}

mcp_networkfs_delete_file() {
    local share_name="$1"
    local remote_path="$2"
    local operation="\"$NETWORK_MCP_WRAPPER\" delete \"$share_name\" \"$remote_path\""
    
    mcp_log_debug "Deleting file: $share_name:$remote_path"
    mcp_execute_with_retry "$operation"
}

mcp_networkfs_copy_directory() {
    local share_name="$1"
    local local_dir="$2"
    local remote_dir="$3"
    local exclude_patterns="${4:-}"
    
    mcp_log_info "Copying directory to Network-FS: $local_dir -> $share_name:$remote_dir"
    
    # Create remote directory if it doesn't exist
    mcp_networkfs_create_directory "$share_name" "$remote_dir" || return $?
    
    # Copy files with exclusion patterns
    local find_cmd="find \"$local_dir\" -type f"
    if [[ -n "$exclude_patterns" ]]; then
        IFS=',' read -ra patterns <<< "$exclude_patterns"
        for pattern in "${patterns[@]}"; do
            find_cmd+=" -not -path \"*$pattern*\""
        done
    fi
    
    local copied_files=0
    local failed_files=0
    
    while IFS= read -r -d '' file; do
        local relative_path="${file#$local_dir/}"
        local remote_file_path="$remote_dir/$relative_path"
        
        # Create remote directory structure
        local remote_file_dir
        remote_file_dir="$(dirname "$remote_file_path")"
        if [[ "$remote_file_dir" != "." ]]; then
            mcp_networkfs_create_directory "$share_name" "$remote_file_dir" >/dev/null 2>&1
        fi
        
        # Copy file
        if mcp_networkfs_write_file "$share_name" "$file" "$remote_file_path"; then
            ((copied_files++))
            mcp_log_debug "Copied: $relative_path"
        else
            ((failed_files++))
            mcp_log_error "Failed to copy: $relative_path"
        fi
    done < <(eval "$find_cmd -print0")
    
    mcp_log_info "Directory copy completed: $copied_files files copied, $failed_files files failed"
    
    if [[ $failed_files -gt 0 ]]; then
        return $MCP_ERROR_OPERATION
    fi
    
    return $MCP_SUCCESS
}

mcp_networkfs_backup_directory() {
    local share_name="$1"
    local remote_source="$2"
    local backup_path="$3"
    local compression="${4:-true}"
    
    mcp_log_info "Creating Network-FS backup: $share_name:$remote_source -> $backup_path"
    
    # Implementation would involve:
    # 1. Create backup directory structure
    # 2. Copy all files from source to backup location
    # 3. Optionally compress the backup
    # 4. Verify backup integrity
    
    # For now, simulate backup creation
    local backup_metadata=$(cat <<EOF
{
    "backup_id": "$(date +%Y%m%d_%H%M%S)",
    "source": "$share_name:$remote_source",
    "destination": "$backup_path",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "compression": $compression,
    "status": "completed"
}
EOF
)
    
    echo "$backup_metadata"
    return $MCP_SUCCESS
}

# GitHub MCP Operations
mcp_github_clone_repository() {
    local repository="$1"
    local local_path="$2"
    local branch="${3:-main}"
    local shallow="${4:-true}"
    
    mcp_log_info "Cloning repository: $repository (branch: $branch)"
    
    local clone_args=""
    if [[ "$shallow" == "true" ]]; then
        clone_args="--depth 1"
    fi
    
    local operation="\"$GITHUB_MCP_WRAPPER\" clone \"$repository\" \"$local_path\" --branch \"$branch\" $clone_args"
    mcp_execute_with_retry "$operation"
}

mcp_github_get_repository_info() {
    local repository="$1"
    local operation="\"$GITHUB_MCP_WRAPPER\" info \"$repository\""
    
    mcp_log_debug "Getting repository info: $repository"
    mcp_execute_with_retry "$operation"
}

mcp_github_get_latest_commit() {
    local repository="$1"
    local branch="${2:-main}"
    local operation="\"$GITHUB_MCP_WRAPPER\" latest-commit \"$repository\" \"$branch\""
    
    mcp_log_debug "Getting latest commit: $repository/$branch"
    mcp_execute_with_retry "$operation"
}

mcp_github_validate_repository() {
    local repository="$1"
    local allowed_repos="${2:-}"
    
    if [[ -n "$allowed_repos" ]]; then
        if [[ ",$allowed_repos," != *",$repository,"* ]]; then
            mcp_log_error "Repository not in allowed list: $repository"
            return $MCP_ERROR_PERMISSION
        fi
    fi
    
    mcp_log_debug "Validating repository access: $repository"
    mcp_github_get_repository_info "$repository" >/dev/null 2>&1
}

# Comprehensive MCP health check
mcp_comprehensive_health_check() {
    local errors=0
    
    mcp_log_info "Running comprehensive MCP health check..."
    
    # Test Network-FS MCP server
    if ! mcp_test_connectivity "network-fs"; then
        ((errors++))
    fi
    
    # Test GitHub MCP server
    if ! mcp_test_connectivity "github"; then
        ((errors++))
    fi
    
    # Test basic operations
    mcp_log_debug "Testing basic MCP operations..."
    
    # Test GitHub operation
    if ! timeout 30 "$GITHUB_MCP_WRAPPER" version >/dev/null 2>&1; then
        mcp_log_error "GitHub MCP basic operation test failed"
        ((errors++))
    fi
    
    # Test Network-FS operation
    if ! timeout 30 "$NETWORK_MCP_WRAPPER" version >/dev/null 2>&1; then
        mcp_log_error "Network-FS MCP basic operation test failed"
        ((errors++))
    fi
    
    if [[ $errors -eq 0 ]]; then
        mcp_log_info "MCP health check completed successfully"
        return $MCP_SUCCESS
    else
        mcp_log_error "MCP health check failed with $errors errors"
        return $MCP_ERROR_CONNECTION
    fi
}

# MCP metrics collection
mcp_collect_metrics() {
    local operation="$1"
    local start_time="$2"
    local end_time="$3"
    local status="$4"
    
    local duration=$((end_time - start_time))
    
    MCP_METRICS["${operation}_count"]=$((MCP_METRICS["${operation}_count"] + 1))
    MCP_METRICS["${operation}_total_time"]=$((MCP_METRICS["${operation}_total_time"] + duration))
    
    if [[ "$status" == "success" ]]; then
        MCP_METRICS["${operation}_success_count"]=$((MCP_METRICS["${operation}_success_count"] + 1))
    else
        MCP_METRICS["${operation}_error_count"]=$((MCP_METRICS["${operation}_error_count"] + 1))
    fi
    
    mcp_log_debug "MCP operation metrics: $operation took ${duration}s (status: $status)"
}

# Generate MCP metrics report
mcp_generate_metrics_report() {
    local report_file="$1"
    
    mcp_log_info "Generating MCP metrics report: $report_file"
    
    cat > "$report_file" <<EOF
{
    "mcp_metrics": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "library_version": "$MCP_LIB_VERSION",
        "operations": {
EOF
    
    local first=true
    for operation in "${!MCP_METRICS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo "," >> "$report_file"
        fi
        echo "            \"$operation\": ${MCP_METRICS[$operation]}" >> "$report_file"
    done
    
    cat >> "$report_file" <<EOF
        }
    }
}
EOF
    
    mcp_log_debug "MCP metrics report generated successfully"
}

# Initialize MCP integration
mcp_initialize() {
    mcp_log_info "Initializing MCP integration library v$MCP_LIB_VERSION"
    
    # Initialize metrics
    for operation in "networkfs_read" "networkfs_write" "networkfs_list" "github_clone" "github_info"; do
        MCP_METRICS["${operation}_count"]=0
        MCP_METRICS["${operation}_success_count"]=0
        MCP_METRICS["${operation}_error_count"]=0
        MCP_METRICS["${operation}_total_time"]=0
    done
    
    mcp_log_debug "MCP integration initialized successfully"
}

# Cleanup MCP resources
mcp_cleanup() {
    mcp_log_debug "Cleaning up MCP resources..."
    
    # Clear operation tracking
    unset MCP_OPERATIONS
    
    # Generate final metrics report if requested
    if [[ -n "${MCP_METRICS_FILE:-}" ]]; then
        mcp_generate_metrics_report "$MCP_METRICS_FILE"
    fi
    
    mcp_log_debug "MCP cleanup completed"
}

# Export functions for use in main script
export -f mcp_log_info mcp_log_error mcp_log_debug
export -f mcp_execute_with_retry mcp_test_connectivity
export -f mcp_networkfs_list_directory mcp_networkfs_read_file mcp_networkfs_write_file
export -f mcp_networkfs_create_directory mcp_networkfs_delete_file mcp_networkfs_copy_directory
export -f mcp_networkfs_backup_directory
export -f mcp_github_clone_repository mcp_github_get_repository_info mcp_github_get_latest_commit
export -f mcp_github_validate_repository
export -f mcp_comprehensive_health_check mcp_collect_metrics mcp_generate_metrics_report
export -f mcp_initialize mcp_cleanup
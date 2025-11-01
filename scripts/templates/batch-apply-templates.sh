#!/bin/bash
#!/bin/bash
#
# Phase 1B: Batch Template Application Script
# Enhanced batch processing with comprehensive monitoring and error handling

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$PROJECT_ROOT/.mcp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_progress() {
    echo -e "${CYAN}[PROGRESS]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] TEMPLATE

Batch apply templates across multiple repositories with comprehensive monitoring,
conflict resolution, and rollback capabilities.

ARGUMENTS:
    TEMPLATE        Template name or path to template.json file

OPTIONS:
    -d, --dry-run           Preview changes without applying (default)
    -a, --apply             Actually apply changes (overrides dry-run)
    -r, --root-dir DIR      Root directory for repository discovery (default: /mnt/c/GIT)
    -p, --repos PATTERN     Repository patterns (can be used multiple times)
    -o, --output FILE       Output results to JSON file
    -w, --workers N         Number of parallel workers (default: 4)
    --no-backup             Skip backup creation
    --no-git                Skip Git integration and PR creation
    --resume FILE           Resume from previous batch operation result file
    -m, --monitor           Enable real-time progress monitoring
    -v, --verbose           Verbose output with detailed progress
    -h, --help              Show this help message

EXAMPLES:
    # Analyze all repositories for template readiness
    $0 --dry-run standard-devops

    # Apply template to all Git repositories
    $0 --apply --verbose standard-devops

    # Apply to specific repository patterns
    $0 --apply -p "project-*" -p "service-*" standard-devops

    # Resume interrupted batch operation
    $0 --resume previous-batch-results.json standard-devops

    # Monitor progress in real-time
    $0 --apply --monitor --workers 2 standard-devops

WORKFLOW:
    1. Repository Discovery - Find all target Git repositories
    2. Conflict Analysis - Detect potential conflicts and resolution strategies
    3. Backup Creation - Create safety backups for all target repositories
    4. Parallel Processing - Apply templates using configured worker pool
    5. Git Integration - Create branches, commits, and pull requests
    6. Results Compilation - Generate comprehensive operation report

SAFETY FEATURES:
    - Comprehensive backup system with rollback capability
    - Intelligent conflict detection and automated resolution
    - Git workflow integration with branch and PR management
    - Parallel processing with error isolation
    - Resume capability for interrupted operations
    - Real-time progress monitoring and status reporting

OUTPUT:
    Results are saved to JSON files with the following structure:
    - Operation metadata (template, timing, configuration)
    - Per-repository results with detailed status
    - Conflict analysis and resolution summary
    - Backup information for rollback capability
    - Git integration results (branches, commits, PRs)

EOF
}

# Function to validate prerequisites
validate_prerequisites() {
    local errors=0

    print_info "Validating batch processing prerequisites..."

    # Check Python 3
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is required but not found"
        ((errors++))
    fi

    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git is required but not found"
        ((errors++))
    fi

    # Check batch processor
    if [ ! -f "$MCP_DIR/batch-processor.py" ]; then
        print_error "Batch processor not found at $MCP_DIR/batch-processor.py"
        ((errors++))
    fi

    # Check template applicator
    if [ ! -f "$MCP_DIR/template-applicator.py" ]; then
        print_error "Template applicator not found at $MCP_DIR/template-applicator.py"
        ((errors++))
    fi

    # Check conflict resolver
    if [ ! -f "$MCP_DIR/conflict-resolver.py" ]; then
        print_error "Conflict resolver not found at $MCP_DIR/conflict-resolver.py"
        ((errors++))
    fi

    # Check backup manager
    if [ ! -f "$MCP_DIR/backup-manager.py" ]; then
        print_error "Backup manager not found at $MCP_DIR/backup-manager.py"
        ((errors++))
    fi

    if [ $errors -gt 0 ]; then
        print_error "Prerequisites validation failed with $errors errors"
        print_info "Ensure Phase 1B implementation is complete"
        exit 1
    fi

    print_success "Prerequisites validation passed"
}

# Function to discover repositories
discover_repositories() {
    local root_dir="$1"
    shift
    local patterns=("$@")

    print_info "Discovering repositories in $root_dir"

    local repos=()

    if [ ${#patterns[@]} -eq 0 ]; then
        # Discover all Git repositories
        while IFS= read -r -d '' repo; do
            repos+=("$repo")
        done < <(find "$root_dir" -maxdepth 1 -type d -name ".git" -exec dirname {} \; -print0 | sort -z)
    else
        # Use specific patterns
        for pattern in "${patterns[@]}"; do
            while IFS= read -r -d '' repo; do
                if [ -d "$repo/.git" ]; then
                    repos+=("$repo")
                fi
            done < <(find "$root_dir" -maxdepth 1 -type d -name "$pattern" -print0)
        done
    fi

    printf '%s\n' "${repos[@]}"
}

# Function to run repository analysis
run_analysis() {
    local template_path="$1"
    local root_dir="$2"
    shift 2
    local repo_patterns=("$@")

    print_info "Analyzing repositories for template compatibility..."

    local python_args=(
        "$MCP_DIR/batch-processor.py"
        "analyze"
        "$template_path"
        "--root-dir" "$root_dir"
    )

    if [ ${#repo_patterns[@]} -gt 0 ]; then
        python_args+=("--repos" "${repo_patterns[@]}")
    fi

    # Create temporary analysis file
    local analysis_file
    analysis_file=$(mktemp --suffix=.json)
    python_args+=("--output" "$analysis_file")

    cd "$PROJECT_ROOT"
    if python3 "${python_args[@]}"; then
        echo "$analysis_file"
        return 0
    else
        rm -f "$analysis_file"
        return 1
    fi
}

# Function to display analysis summary
show_analysis_summary() {
    local analysis_file="$1"

    if [ ! -f "$analysis_file" ]; then
        print_error "Analysis file not found: $analysis_file"
        return 1
    fi

    print_info "Repository Analysis Summary:"

    python3 << EOF
import json
try:
    with open('$analysis_file', 'r') as f:
        data = json.load(f)

    summary = data.get('summary', {})
    print(f"  Total repositories: {data.get('total_repositories', 0)}")
    print(f"  Ready for application: {summary.get('ready', 0)}")
    print(f"  Have conflicts: {summary.get('conflicts', 0)}")
    print(f"  Analysis errors: {summary.get('errors', 0)}")

    if summary.get('conflicts', 0) > 0:
        print("\n  Repositories with conflicts:")
        for repo in data.get('has_conflicts', []):
            print(f"    - {repo['name']}: {len(repo['conflicts'])} conflicts")

    if summary.get('errors', 0) > 0:
        print("\n  Repositories with errors:")
        for repo in data.get('errors', []):
            print(f"    - {repo['name']}: {repo.get('error', 'Unknown error')}")

except Exception as e:
    print(f"  Could not parse analysis: {e}")
EOF
}

# Function to run batch processing
run_batch_processing() {
    local template_path="$1"
    local dry_run="$2"
    local root_dir="$3"
    local output_file="$4"
    local workers="$5"
    local no_backup="$6"
    local monitor="$7"
    shift 7
    local repo_patterns=("$@")

    local python_args=(
        "$MCP_DIR/batch-processor.py"
        "process"
        "$template_path"
        "--root-dir" "$root_dir"
        "--workers" "$workers"
    )

    if [ "$dry_run" = "true" ]; then
        python_args+=("--dry-run")
    fi

    if [ "$no_backup" = "true" ]; then
        python_args+=("--no-backup")
    fi

    if [ -n "$output_file" ]; then
        python_args+=("--output" "$output_file")
    fi

    if [ ${#repo_patterns[@]} -gt 0 ]; then
        python_args+=("--repos" "${repo_patterns[@]}")
    fi

    print_info "Starting batch template application..."
    print_info "Mode: $([ "$dry_run" = "true" ] && echo "DRY RUN" || echo "APPLY")"
    print_info "Workers: $workers"
    print_info "Monitor: $([ "$monitor" = "true" ] && echo "ENABLED" || echo "DISABLED")"

    # Run batch processing
    cd "$PROJECT_ROOT"

    if [ "$monitor" = "true" ]; then
        # Run with monitoring
        python3 "${python_args[@]}" &
        local batch_pid=$!

        # Monitor progress
        monitor_progress "$batch_pid"
        wait $batch_pid
        return $?
    else
        # Run normally
        python3 "${python_args[@]}"
        return $?
    fi
}

# Function to monitor batch processing progress
monitor_progress() {
    local batch_pid="$1"

    print_progress "Monitoring batch processing (PID: $batch_pid)..."

    local last_update=""
    while kill -0 $batch_pid 2>/dev/null; do
        # Get progress updates
        local status_output
        status_output=$(python3 "$MCP_DIR/batch-processor.py" status 2>/dev/null || echo '{}')

        if [ "$status_output" != "$last_update" ] && [ "$status_output" != '{}' ]; then
            print_progress "$(echo "$status_output" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('running'):
        processed = data.get('processed', 0)
        total = data.get('total_repos', 0)
        if total > 0:
            percent = round((processed / total) * 100, 1)
            print(f'Progress: {processed}/{total} repositories ({percent}%)')
        else:
            print('Starting processing...')
    else:
        print('Processing completed')
except:
    pass
")"
            last_update="$status_output"
        fi

        sleep 2
    done

    print_progress "Batch processing completed"
}

# Function to resume batch operation
resume_batch_operation() {
    local batch_result_file="$1"
    local template_path="$2"

    print_info "Resuming batch operation from $batch_result_file"

    cd "$PROJECT_ROOT"
    python3 "$MCP_DIR/batch-processor.py" resume "$batch_result_file" "$template_path"
}

# Function to show batch results summary
show_batch_summary() {
    local output_file="$1"

    if [ ! -f "$output_file" ]; then
        print_warning "Results file not found: $output_file"
        return 1
    fi

    print_success "Batch Processing Complete!"
    print_info "Results Summary:"

    python3 << EOF
import json
from datetime import datetime

try:
    with open('$output_file', 'r') as f:
        data = json.load(f)

    summary = data.get('summary', {})

    print(f"  Template: {data.get('template', 'Unknown')}")
    print(f"  Mode: {'DRY RUN' if data.get('dry_run', True) else 'APPLIED'}")
    print(f"  Started: {data.get('started', 'Unknown')}")
    print(f"  Completed: {data.get('completed', 'Unknown')}")
    print()
    print(f"  Total repositories: {summary.get('total', 0)}")
    print(f"  Successful: {summary.get('successful', 0)}")
    print(f"  Failed: {summary.get('failed', 0)}")
    print(f"  Conflicts resolved: {summary.get('conflicts_resolved', 0)}")
    print(f"  Backups created: {summary.get('backups_created', 0)}")

    # Show failed repositories
    failed_repos = [r for r in data.get('repositories', []) if not r.get('success', False)]
    if failed_repos:
        print(f"\n  Failed repositories:")
        for repo in failed_repos[:5]:  # Show first 5
            repo_name = repo.get('repo_name', 'Unknown')
            errors = repo.get('errors', [])
            error_summary = errors[0] if errors else 'Unknown error'
            print(f"    - {repo_name}: {error_summary}")

        if len(failed_repos) > 5:
            print(f"    ... and {len(failed_repos) - 5} more")

    print(f"\n  Full results available at: $output_file")

except Exception as e:
    print(f"  Could not parse results: {e}")
EOF
}

# Main function
main() {
    local template=""
    local dry_run="true"
    local root_dir="/mnt/c/GIT"
    local output_file=""
    local workers="4"
    local no_backup="false"
    local no_git="false"
    local monitor="false"
    local verbose="false"
    local resume_file=""
    local repo_patterns=()

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dry-run)
                dry_run="true"
                shift
                ;;
            -a|--apply)
                dry_run="false"
                shift
                ;;
            -r|--root-dir)
                root_dir="$2"
                shift 2
                ;;
            -p|--repos)
                repo_patterns+=("$2")
                shift 2
                ;;
            -o|--output)
                output_file="$2"
                shift 2
                ;;
            -w|--workers)
                workers="$2"
                shift 2
                ;;
            --no-backup)
                no_backup="true"
                shift
                ;;
            --no-git)
                no_git="true"
                shift
                ;;
            --resume)
                resume_file="$2"
                shift 2
                ;;
            -m|--monitor)
                monitor="true"
                shift
                ;;
            -v|--verbose)
                verbose="true"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [ -z "$template" ]; then
                    template="$1"
                else
                    print_error "Multiple templates not supported: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Handle resume operation
    if [ -n "$resume_file" ]; then
        if [ -z "$template" ]; then
            print_error "Template argument required for resume operation"
            exit 1
        fi

        resume_batch_operation "$resume_file" "$template"
        exit $?
    fi

    # Validate required arguments
    if [ -z "$template" ]; then
        print_error "Template argument is required"
        show_usage
        exit 1
    fi

    # Validate prerequisites
    validate_prerequisites

    # Resolve template path (reuse logic from apply-template.sh)
    local template_path="$template"
    if [[ "$template" != *.json ]] || [ ! -f "$template" ]; then
        # Look in templates directory
        local templates_dir="$MCP_DIR/templates"
        if [ -f "$templates_dir/$template/template.json" ]; then
            template_path="$templates_dir/$template/template.json"
        elif [ -f "$templates_dir/$template.json" ]; then
            template_path="$templates_dir/$template.json"
        else
            print_error "Template '$template' not found"
            exit 1
        fi
    fi

    print_success "Using template: $template_path"

    # Create output file if not specified
    if [ -z "$output_file" ]; then
        local timestamp=$(date +%Y%m%d-%H%M%S)
        output_file="$PROJECT_ROOT/output/batch-application-$timestamp.json"
        mkdir -p "$(dirname "$output_file")"
    fi

    # Run analysis first
    print_info "Phase 1: Repository Analysis"
    local analysis_file
    if analysis_file=$(run_analysis "$template_path" "$root_dir" "${repo_patterns[@]}"); then
        if [ "$verbose" = "true" ]; then
            show_analysis_summary "$analysis_file"
        fi
    else
        print_error "Repository analysis failed"
        exit 1
    fi

    # Ask for confirmation if applying changes
    if [ "$dry_run" = "false" ]; then
        print_warning "You are about to apply template changes to repositories."
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Operation cancelled"
            exit 0
        fi
    fi

    # Run batch processing
    print_info "Phase 2: Batch Template Application"
    if run_batch_processing "$template_path" "$dry_run" "$root_dir" "$output_file" "$workers" "$no_backup" "$monitor" "${repo_patterns[@]}"; then
        show_batch_summary "$output_file"

        # Cleanup analysis file
        rm -f "$analysis_file"

        exit 0
    else
        print_error "Batch template application failed"

        # Show partial results if available
        if [ -f "$output_file" ]; then
            show_batch_summary "$output_file"
        fi

        # Cleanup
        rm -f "$analysis_file"

        exit 1
    fi
}

# Run main function with all arguments
main "$@"

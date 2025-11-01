#!/bin/bash
#!/bin/bash
#
# Phase 1B: Template Application CLI Wrapper
# Command-line interface for template application engine

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$PROJECT_ROOT/.mcp"
TEMPLATES_DIR="$MCP_DIR/templates"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] TEMPLATE [REPOSITORIES...]

Apply a template to one or more repositories with comprehensive conflict resolution
and backup management.

ARGUMENTS:
    TEMPLATE        Template name or path to template.json file
    REPOSITORIES    Repository paths or patterns (optional, defaults to auto-discovery)

OPTIONS:
    -d, --dry-run           Preview changes without applying (default)
    -a, --apply             Actually apply changes (overrides dry-run)
    -r, --root-dir DIR      Root directory for repository discovery (default: /mnt/c/GIT)
    -o, --output FILE       Output results to JSON file
    --no-backup             Skip backup creation
    --no-git                Skip Git integration
    --workers N             Number of parallel workers for batch processing (default: 4)
    -v, --verbose           Verbose output
    -h, --help              Show this help message

EXAMPLES:
    # Dry run on all repositories
    $0 standard-devops

    # Apply template to specific repositories
    $0 --apply standard-devops /path/to/repo1 /path/to/repo2

    # Apply with custom settings
    $0 --apply --workers 2 --output results.json standard-devops

    # Preview changes for specific pattern
    $0 --dry-run standard-devops "project-*"

TEMPLATES:
    standard-devops     Standard DevOps project template with CI/CD and MCP
    node-application    Node.js application template (future)
    python-service      Python service template (future)
    documentation       Documentation project template (future)

FILES CREATED:
    .mcp/                   Template infrastructure directory
    backups/               Backup storage for rollback capability

SAFETY FEATURES:
    - Automatic backup creation before any changes
    - Git stash and branch management
    - Comprehensive conflict detection and resolution
    - Rollback capability for failed applications
    - Dry-run mode as default for safety

EOF
}

# Function to validate prerequisites
validate_prerequisites() {
    local errors=0

    print_info "Validating prerequisites..."

    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is required but not found"
        ((errors++))
    fi

    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git is required but not found"
        ((errors++))
    fi

    # Check template infrastructure
    if [ ! -d "$MCP_DIR" ]; then
        print_error "Template infrastructure not found at $MCP_DIR"
        print_info "Run Phase 1A setup first to create template infrastructure"
        ((errors++))
    fi

    # Check template applicator
    if [ ! -f "$MCP_DIR/template-applicator.py" ]; then
        print_error "Template applicator not found at $MCP_DIR/template-applicator.py"
        ((errors++))
    fi

    if [ $errors -gt 0 ]; then
        print_error "Prerequisites validation failed with $errors errors"
        exit 1
    fi

    print_success "Prerequisites validation passed"
}

# Function to resolve template path
resolve_template_path() {
    local template="$1"

    # If it's already a path to a JSON file, use it
    if [[ "$template" == *.json ]] && [ -f "$template" ]; then
        echo "$template"
        return 0
    fi

    # Look for template in templates directory
    local template_path="$TEMPLATES_DIR/$template/template.json"
    if [ -f "$template_path" ]; then
        echo "$template_path"
        return 0
    fi

    # Try with .json extension
    if [ -f "$TEMPLATES_DIR/$template.json" ]; then
        echo "$TEMPLATES_DIR/$template.json"
        return 0
    fi

    print_error "Template '$template' not found"
    print_info "Available templates:"
    if [ -d "$TEMPLATES_DIR" ]; then
        find "$TEMPLATES_DIR" -name "template.json" -exec dirname {} \; | xargs -I {} basename {} | sort
    else
        print_warning "No templates directory found at $TEMPLATES_DIR"
    fi

    return 1
}

# Function to create backup directory
create_backup_dir() {
    local backup_dir="$PROJECT_ROOT/backups/template-application-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    echo "$backup_dir"
}

# Function to run template application
run_template_application() {
    local template_path="$1"
    local dry_run="$2"
    local root_dir="$3"
    local output_file="$4"
    local no_backup="$5"
    local workers="$6"
    shift 6
    local repositories=("$@")

    local python_args=()

    # Build Python command arguments
    python_args+=("$MCP_DIR/template-applicator.py")
    python_args+=("$template_path")
    python_args+=("--root-dir" "$root_dir")
    python_args+=("--workers" "$workers")

    if [ "$dry_run" = "true" ]; then
        python_args+=("--dry-run")
    else
        python_args+=("--apply")
    fi

    if [ -n "$output_file" ]; then
        python_args+=("--output" "$output_file")
    fi

    if [ ${#repositories[@]} -gt 0 ]; then
        python_args+=("--repos" "${repositories[@]}")
    fi

    print_info "Running template application..."
    print_info "Template: $(basename "$template_path")"
    print_info "Mode: $([ "$dry_run" = "true" ] && echo "DRY RUN" || echo "APPLY")"
    print_info "Root directory: $root_dir"
    print_info "Workers: $workers"

    if [ ${#repositories[@]} -gt 0 ]; then
        print_info "Target repositories: ${repositories[*]}"
    else
        print_info "Target: All Git repositories in $root_dir"
    fi

    # Run the template application
    cd "$PROJECT_ROOT"
    python3 "${python_args[@]}"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        if [ "$dry_run" = "true" ]; then
            print_success "Template application preview completed successfully"
            print_info "To apply changes, run with --apply flag"
        else
            print_success "Template application completed successfully"
        fi
    else
        print_error "Template application failed with exit code $exit_code"
    fi

    return $exit_code
}

# Main function
main() {
    local template=""
    local dry_run="true"
    local root_dir="/mnt/c/GIT"
    local output_file=""
    local no_backup="false"
    local no_git="false"
    local workers="4"
    local verbose="false"
    local repositories=()

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
            -o|--output)
                output_file="$2"
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
            --workers)
                workers="$2"
                shift 2
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
                    repositories+=("$1")
                fi
                shift
                ;;
        esac
    done

    # Validate required arguments
    if [ -z "$template" ]; then
        print_error "Template argument is required"
        show_usage
        exit 1
    fi

    # Validate prerequisites
    validate_prerequisites

    # Resolve template path
    local template_path
    if ! template_path=$(resolve_template_path "$template"); then
        exit 1
    fi

    print_success "Using template: $template_path"

    # Create output file path if not specified
    if [ -z "$output_file" ]; then
        local timestamp=$(date +%Y%m%d-%H%M%S)
        output_file="$PROJECT_ROOT/output/template-application-$timestamp.json"
        mkdir -p "$(dirname "$output_file")"
    fi

    # Create backup directory for this operation
    local backup_dir
    backup_dir=$(create_backup_dir)
    export TEMPLATE_APPLICATION_BACKUP_DIR="$backup_dir"

    print_info "Backup directory: $backup_dir"
    print_info "Results will be saved to: $output_file"

    # Run template application
    if run_template_application "$template_path" "$dry_run" "$root_dir" "$output_file" "$no_backup" "$workers" "${repositories[@]}"; then
        print_success "Template application completed"

        if [ -f "$output_file" ]; then
            print_info "Results available at: $output_file"

            # Show summary if verbose
            if [ "$verbose" = "true" ]; then
                print_info "Summary:"
                python3 -c "
import json
try:
    with open('$output_file', 'r') as f:
        data = json.load(f)
    summary = data.get('summary', {})
    print(f\"  Total repositories: {summary.get('total', 0)}\")
    print(f\"  Successful: {summary.get('successful', 0)}\")
    print(f\"  Failed: {summary.get('failed', 0)}\")
    print(f\"  Conflicts resolved: {summary.get('conflicts_resolved', 0)}\")
    print(f\"  Backups created: {summary.get('backups_created', 0)}\")
except Exception as e:
    print(f\"  Could not parse results: {e}\")
"
            fi
        fi

        exit 0
    else
        print_error "Template application failed"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"

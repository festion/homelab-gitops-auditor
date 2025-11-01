# Scripts Directory

**Last Updated**: 2025-11-01
**Reorganized**: Post Phase 2 & WikiJS Agent merge

## Overview

This directory contains all automation scripts for the Homelab GitOps Auditor project. Scripts are organized by function into subdirectories for better maintainability.

---

## Directory Structure

```
scripts/
├── README.md                    # This file
├── archive/                     # Deprecated/historical scripts
│   ├── phase1b/                # Phase 1B deployment (archived)
│   ├── truenas-monitors/       # Old TrueNAS monitor versions
│   └── caddy-to-traefik.py    # Caddy migration (one-time use)
├── backup/                      # Backup and restore utilities
├── config/                      # Configuration management
│   ├── config-loader.sh        # Environment config loader
│   └── config-manager.sh       # Config validation and management
├── deployment/                  # Deployment scripts
│   ├── deploy-production.sh    # Full production deployment
│   ├── deploy-home-assistant-config.sh
│   └── deploy-websocket-agent.sh
├── dev/                        # Development and testing
│   ├── curl_test.sh           # API endpoint testing
│   ├── debug-api.sh           # API debugging utilities
│   └── simple_container_test.sh
├── health-checks/              # Health monitoring utilities
├── lib/                        # Shared libraries and functions
├── monitoring/                 # System and service monitoring
│   ├── truenas_monitor.sh     # TrueNAS stability monitoring (PRODUCTION)
│   ├── proxmox_container_monitor.sh
│   ├── external_container_monitor.sh
│   ├── deploy_container_monitoring.sh
│   ├── stop_local_lvm_containers.sh
│   └── cleanup_cloned_containers.sh
├── phase2/                     # Phase 2 specific scripts
│   ├── deploy-phase2-production.sh
│   ├── migrate-phase2.sh
│   ├── orchestrate-phase2-deployment.sh
│   ├── rollback-deployment.sh
│   ├── setup-phase2-monitoring.sh
│   ├── validate-deployment-readiness.sh
│   └── validate-phase2-deployment.sh
├── services/                   # Service management scripts
├── templates/                  # Template application
│   ├── apply-template.sh
│   ├── apply-template-with-mcp.py
│   ├── apply-github-project-template.py
│   └── batch-apply-templates.sh
└── wikijs-mcp/                # WikiJS MCP integration
    ├── migrate-wiki-agent.js
    ├── backup-wiki-agent.js
    └── validate-config.js
```

---

## Active Scripts

### Deployment Scripts (`deployment/`)

#### `deploy-production.sh`
**Purpose**: Full production deployment orchestration
**Usage**: `./deployment/deploy-production.sh [environment]`
**Dependencies**: Docker, systemd
**Notes**: Main production deployment script

#### `deploy-home-assistant-config.sh`
**Purpose**: Deploy Home Assistant configuration from GitOps
**Usage**: `./deployment/deploy-home-assistant-config.sh`
**Dependencies**: Git, rsync, Home Assistant API access

#### `deploy-websocket-agent.sh`
**Purpose**: Deploy WebSocket agent service
**Usage**: `./deployment/deploy-websocket-agent.sh`
**Dependencies**: Node.js, systemd

### Monitoring Scripts (`monitoring/`)

#### `truenas_monitor.sh` ⭐ PRODUCTION
**Purpose**: Monitor TrueNAS stability and health
**Usage**: `./monitoring/truenas_monitor.sh [--verbose]`
**Schedule**: Runs every 15 minutes via cron
**Alerts**: Sends notifications on critical issues
**Notes**: This is the PRODUCTION version - all older versions archived

#### `proxmox_container_monitor.sh`
**Purpose**: Monitor Proxmox LXC containers
**Usage**: `./monitoring/proxmox_container_monitor.sh`
**Dependencies**: Proxmox API access

#### `external_container_monitor.sh`
**Purpose**: Monitor external containers via API
**Usage**: `./monitoring/external_container_monitor.sh`

#### `deploy_container_monitoring.sh`
**Purpose**: Deploy container monitoring infrastructure
**Usage**: `./monitoring/deploy_container_monitoring.sh`

#### `stop_local_lvm_containers.sh`
**Purpose**: Safely stop containers on local-lvm storage
**Usage**: `./monitoring/stop_local_lvm_containers.sh [--force]`

#### `cleanup_cloned_containers.sh`
**Purpose**: Clean up cloned/test containers
**Usage**: `./monitoring/cleanup_cloned_containers.sh`

### Template Scripts (`templates/`)

#### `apply-template.sh`
**Purpose**: Apply project templates to repositories
**Usage**: `./templates/apply-template.sh <template> <target>`

#### `apply-template-with-mcp.py`
**Purpose**: Apply templates using MCP server integration
**Usage**: `python3 ./templates/apply-template-with-mcp.py <template>`
**Dependencies**: MCP server, Python 3.8+

#### `apply-github-project-template.py`
**Purpose**: Apply templates directly to GitHub projects
**Usage**: `python3 ./templates/apply-github-project-template.py`
**Dependencies**: GitHub API token

#### `batch-apply-templates.sh`
**Purpose**: Batch template application across multiple repos
**Usage**: `./templates/batch-apply-templates.sh <template-list>`

### Configuration Scripts (`config/`)

#### `config-loader.sh`
**Purpose**: Load and validate environment configuration
**Usage**: `. ./config/config-loader.sh` (source it)
**Loads**: `../config/settings.conf`

#### `config-manager.sh`
**Purpose**: Interactive configuration management
**Usage**: `./config/config-manager.sh [validate|update|backup]`

### Development Scripts (`dev/`)

#### `curl_test.sh`
**Purpose**: Quick API endpoint testing
**Usage**: `./dev/curl_test.sh [endpoint]`

#### `debug-api.sh`
**Purpose**: API debugging and diagnostics
**Usage**: `./dev/debug-api.sh [--verbose]`

#### `simple_container_test.sh`
**Purpose**: Simple container connectivity test
**Usage**: `./dev/simple_container_test.sh <container-id>`

### Phase 2 Scripts (`phase2/`)

See `phase2/README.md` for detailed Phase 2 deployment documentation.

### WikiJS MCP Scripts (`wikijs-mcp/`)

#### `migrate-wiki-agent.js`
**Purpose**: Migrate WikiJS agent database
**Usage**: `node wikijs-mcp/migrate-wiki-agent.js`

#### `backup-wiki-agent.js`
**Purpose**: Backup WikiJS agent data
**Usage**: `node wikijs-mcp/backup-wiki-agent.js`

#### `validate-config.js`
**Purpose**: Validate WikiJS configuration
**Usage**: `node wikijs-mcp/validate-config.js`

---

## Archived Scripts (`archive/`)

### Why Scripts are Archived
Scripts are moved to archive when they are:
- No longer actively used
- Replaced by newer versions
- One-time migration tools
- Legacy phase implementations

### Archive Structure

#### `archive/truenas-monitors/`
Contains 5 older versions of TrueNAS monitoring:
- `truenas_stability_monitor.sh` - Original version
- `truenas_stability_monitor_fixed.sh` - First fix
- `truenas_stability_monitor_v2.sh` - Version 2
- `truenas_stability_monitor_v3.sh` - Version 3
- `truenas_stability_monitor_final.sh` - Pre-final version

**Active Version**: `monitoring/truenas_monitor.sh` (formerly `truenas_stability_monitor_final_fixed.sh`)

#### `archive/phase1b/`
Contains Phase 1B deployment scripts:
- `deploy-phase1b-complete.sh`
- `deploy-phase1b-production.sh`
- `configure-phase1b-systemd.sh`
- `integrate-phase1b-api.sh`
- `validate-phase1b-deployment.sh`

**Status**: Phase 1B complete, Phase 2 active

#### `archive/caddy-to-traefik.py`
**Purpose**: One-time Caddy to Traefik migration
**Status**: Migration complete, kept for reference

---

## Script Naming Conventions

### Prefixes
- `deploy-*` - Deployment scripts
- `setup-*` - Initial setup scripts
- `configure-*` - Configuration scripts
- `validate-*` - Validation/testing scripts
- `backup-*` - Backup utilities
- `sync-*` - Synchronization scripts

### Suffixes
- `*.sh` - Shell scripts
- `*.py` - Python scripts
- `*.js` - Node.js scripts

### Organization
- Scripts grouped by function (deployment, monitoring, etc.)
- Related scripts in same subdirectory
- Archived scripts clearly separated

---

## Common Patterns

### Loading Configuration
Most scripts load configuration from `../config/settings.conf`:
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config/config-loader.sh"
```

### Error Handling
Standard error handling pattern:
```bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures
trap 'echo "Error on line $LINENO"' ERR
```

### Logging
Consistent logging format:
```bash
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log "INFO: Script started"
log "ERROR: Something went wrong"
```

---

## Dependencies

### System Requirements
- Bash 4.0+
- Python 3.8+ (for Python scripts)
- Node.js 18+ (for JS scripts)
- Git
- Docker (for container operations)
- systemd (for service management)

### External Dependencies
- Proxmox API access (for container monitoring)
- GitHub API token (for template application)
- WikiJS API access (for MCP integration)
- Home Assistant API (for HA deployments)

---

## Adding New Scripts

### Guidelines
1. **Choose appropriate directory** based on function
2. **Follow naming conventions** (see above)
3. **Include header documentation**:
   ```bash
   #!/bin/bash
   # Purpose: Brief description
   # Usage: ./script-name.sh [options]
   # Dependencies: List dependencies
   # Author: Your name
   # Date: YYYY-MM-DD
   ```
4. **Load configuration** if needed
5. **Include error handling**
6. **Add to this README** in appropriate section
7. **Make executable**: `chmod +x script-name.sh`
8. **Test thoroughly** before committing

### Template
```bash
#!/bin/bash
set -euo pipefail

# Purpose: [Brief description]
# Usage: $0 [options]
# Dependencies: [List]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config/config-loader.sh"

main() {
    # Script logic here
    echo "Script execution"
}

main "$@"
```

---

## Migration Notes

### 2025-11-01 Reorganization
- Archived 5 duplicate TrueNAS monitoring scripts
- Created logical subdirectory structure
- Moved 25+ scripts to appropriate locations
- Consolidated template and deployment scripts
- Separated dev/test scripts from production

### Script Path Updates
If you have references to old script paths, update them:
```bash
# Old path
./truenas_stability_monitor_final_fixed.sh

# New path
./monitoring/truenas_monitor.sh
```

### Cron Jobs
Update cron jobs with new paths:
```bash
# Old
15 * * * * /opt/gitops/scripts/truenas_stability_monitor_final_fixed.sh

# New
15 * * * * /opt/gitops/scripts/monitoring/truenas_monitor.sh
```

---

## Troubleshooting

### Script Not Found
```bash
# Error
-bash: ./script.sh: No such file or directory

# Solution
# Check if script was reorganized
ls -R scripts/ | grep script.sh
```

### Permission Denied
```bash
# Error
-bash: ./script.sh: Permission denied

# Solution
chmod +x ./script.sh
```

### Config Not Loading
```bash
# Error
Config file not found

# Solution
# Ensure you're sourcing config-loader from correct location
source "${SCRIPT_DIR}/config/config-loader.sh"
```

---

## Maintenance Schedule

### Weekly
- Review script logs for errors
- Check deprecated script usage
- Update documentation as needed

### Monthly
- Review archived scripts for deletion
- Update dependency versions
- Performance optimization review

### Quarterly
- Major reorganization if needed
- Consolidate similar functionality
- Update naming conventions

---

## Related Documentation

- `/CLEANUP_STRATEGY.md` - Repository cleanup strategy
- `/docs/DEPLOYMENT.md` - Deployment procedures
- `/api/README.md` - API documentation
- `/dashboard/README.md` - Dashboard documentation

---

## Quick Reference

### Most Common Operations

```bash
# Production deployment
./deployment/deploy-production.sh production

# Monitor TrueNAS
./monitoring/truenas_monitor.sh --verbose

# Apply template
./templates/apply-template.sh my-template target-repo

# Test API
./dev/curl_test.sh /api/health

# Load configuration
source ./config/config-loader.sh
```

---

**Maintained by**: DevOps Team
**Last Reorganization**: 2025-11-01
**Questions**: See `/docs/CONTRIBUTING.md`

# Repository Cleanup and Organization Strategy

**Date**: 2025-11-01
**Status**: Post-Merge Analysis
**Branch**: main (after merging phase2 and wikijs-ai-agent features)

## Overview

This document outlines the strategy for cleaning up and organizing the homelab-gitops-auditor repository after merging two major feature branches. The goal is to consolidate duplicate scripts, organize infrastructure files, and establish clear naming conventions.

---

## Current State Analysis

### Recently Merged Branches
1. ✅ `feature/phase2-enhanced-dashboard-pipeline` (7 commits) - Merged
2. ✅ `feature/wikijs-ai-agent` (23 commits) - Merged

### Key Changes
- Phase 2 dashboard and pipeline engine added
- WikiJS AI agent integration complete
- Disaster recovery test suite added
- Traefik and Cloudflare infrastructure configured
- Proxmox integration added

---

## Scripts Directory Analysis

### Current Structure
```
scripts/
├── services/           # Service management scripts
├── health-checks/      # Health check utilities
├── wikijs-mcp/        # WikiJS MCP integration
├── backup/            # Backup utilities
├── output/            # Script output directory
├── lib/               # Shared libraries
├── phase2/            # Phase 2 deployment scripts
└── [60+ individual scripts]
```

### Identified Issues

#### 1. **Duplicate TrueNAS Monitoring Scripts** ⚠️ HIGH PRIORITY
```
✗ truenas_stability_monitor.sh
✗ truenas_stability_monitor_fixed.sh
✗ truenas_stability_monitor_v2.sh
✗ truenas_stability_monitor_v3.sh
✗ truenas_stability_monitor_final.sh
✗ truenas_stability_monitor_final_fixed.sh
```

**Action**: Keep only the latest stable version (`truenas_stability_monitor_final_fixed.sh`), archive others.

#### 2. **Container Monitoring Scripts** - Needs Consolidation
```
- external_container_monitor.sh
- proxmox_container_monitor.sh
- deploy_container_monitoring.sh
- stop_local_lvm_containers.sh
- cleanup_cloned_containers.sh
- simple_container_test.sh
```

**Action**: Evaluate which are actively used. Consider consolidating into `scripts/monitoring/` subdirectory.

#### 3. **Test/Debug Scripts** - Temporary
```
✗ curl_test.sh
✗ debug-api.sh
```

**Action**: Move to `scripts/dev/` or delete if no longer needed.

#### 4. **Deployment Scripts** - Multiple Versions
```
- deploy.sh
- deploy-production.sh
- deploy-websocket-agent.sh
- deploy-home-assistant-config.sh
- deploy-phase1b-complete.sh
- deploy-phase1b-production.sh
- deploy_container_monitoring.sh
```

**Action**: Establish clear naming convention:
- `deploy-<component>.sh` for specific deployments
- `deploy-production.sh` for full production deployment
- Move Phase 1B scripts to `scripts/archive/phase1b/`

#### 5. **Template Application Scripts**
```
- apply-template.sh
- apply-template-with-mcp.py
- apply-github-project-template.py
- batch-apply-templates.sh
```

**Action**: Consolidate into `scripts/templates/` subdirectory.

---

## Infrastructure Directory Analysis

### Current Structure
```
infrastructure/
├── traefik/
│   ├── config/
│   ├── systemd/
│   ├── tls/
│   ├── monitoring/
│   └── DEPLOYMENT-COMPLETE.md
├── cloudflare/
│   ├── README.md
│   ├── SETUP-VALIDATION.md
│   ├── QUICK-REFERENCE.md
│   └── public-service-template.yml
└── monitoring/
```

### Status
✅ Well-organized, no immediate cleanup needed

---

## Config Directory Analysis

### Notable Additions
```
config/
└── caddy-backup/
    ├── caddy-config-20251023.tar.gz
    ├── caddy-config.json
    └── Caddyfile.backup
```

**Action**: These are backups from Caddy→Traefik migration. **Keep** for rollback capability but consider moving to `backups/caddy/`.

---

## Recommended Cleanup Actions

### Phase 1: Immediate Actions (High Priority)

#### 1.1 Archive Duplicate TrueNAS Scripts
```bash
mkdir -p scripts/archive/truenas-monitors
mv scripts/truenas_stability_monitor.sh scripts/archive/truenas-monitors/
mv scripts/truenas_stability_monitor_fixed.sh scripts/archive/truenas-monitors/
mv scripts/truenas_stability_monitor_v2.sh scripts/archive/truenas-monitors/
mv scripts/truenas_stability_monitor_v3.sh scripts/archive/truenas-monitors/
mv scripts/truenas_stability_monitor_final.sh scripts/archive/truenas-monitors/
# Keep: truenas_stability_monitor_final_fixed.sh as the production version
```

#### 1.2 Organize Test/Debug Scripts
```bash
mkdir -p scripts/dev
mv scripts/curl_test.sh scripts/dev/
mv scripts/debug-api.sh scripts/dev/
mv scripts/simple_container_test.sh scripts/dev/
```

#### 1.3 Consolidate Template Scripts
```bash
mkdir -p scripts/templates
mv scripts/apply-template.sh scripts/templates/
mv scripts/apply-template-with-mcp.py scripts/templates/
mv scripts/apply-github-project-template.py scripts/templates/
mv scripts/batch-apply-templates.sh scripts/templates/
```

### Phase 2: Organizational Improvements (Medium Priority)

#### 2.1 Create Monitoring Subdirectory
```bash
mkdir -p scripts/monitoring
mv scripts/external_container_monitor.sh scripts/monitoring/
mv scripts/proxmox_container_monitor.sh scripts/monitoring/
mv scripts/deploy_container_monitoring.sh scripts/monitoring/
mv scripts/stop_local_lvm_containers.sh scripts/monitoring/
mv scripts/cleanup_cloned_containers.sh scripts/monitoring/
mv scripts/truenas_stability_monitor_final_fixed.sh scripts/monitoring/truenas_monitor.sh
```

#### 2.2 Organize Deployment Scripts
```bash
mkdir -p scripts/deployment
mv scripts/deploy-production.sh scripts/deployment/
mv scripts/deploy-websocket-agent.sh scripts/deployment/
mv scripts/deploy-home-assistant-config.sh scripts/deployment/

# Archive Phase 1B scripts
mkdir -p scripts/archive/phase1b
mv scripts/deploy-phase1b-complete.sh scripts/archive/phase1b/
mv scripts/deploy-phase1b-production.sh scripts/archive/phase1b/
mv scripts/configure-phase1b-systemd.sh scripts/archive/phase1b/
mv scripts/integrate-phase1b-api.sh scripts/archive/phase1b/
mv scripts/validate-phase1b-deployment.sh scripts/archive/phase1b/
```

#### 2.3 Organize Configuration Scripts
```bash
mkdir -p scripts/config
mv scripts/config-loader.sh scripts/config/
mv scripts/config-manager.sh scripts/config/
```

### Phase 3: Documentation (Low Priority)

#### 3.1 Create Scripts Index
Create `scripts/README.md` documenting:
- Purpose of each subdirectory
- Naming conventions
- Deprecated vs active scripts
- Usage examples

#### 3.2 Add Deprecation Notices
Add notices to archived scripts:
```bash
#!/bin/bash
# DEPRECATED: This script has been replaced by <new_script>
# Archived on: 2025-11-01
# Reason: <reason>
echo "WARNING: This script is deprecated. Use <new_script> instead."
exit 1
```

---

## Proposed Directory Structure

### Target State
```
scripts/
├── README.md                    # Scripts documentation
├── archive/                     # Deprecated/old scripts
│   ├── phase1b/                # Phase 1B deployment scripts
│   └── truenas-monitors/       # Old TrueNAS monitor versions
├── backup/                      # Backup utilities
├── config/                      # Configuration management
├── deployment/                  # Deployment scripts
├── dev/                        # Development/testing scripts
├── health-checks/              # Health check utilities
├── lib/                        # Shared libraries
├── monitoring/                 # Monitoring scripts
├── phase2/                     # Phase 2 specific scripts
├── services/                   # Service management
├── templates/                  # Template application scripts
└── wikijs-mcp/                # WikiJS MCP integration
```

---

## Git Workflow for Cleanup

### Step 1: Create Cleanup Branch
```bash
git checkout -b cleanup/organize-scripts-and-infrastructure
```

### Step 2: Execute Reorganization
Run reorganization commands from each phase.

### Step 3: Update References
```bash
# Find and update script references in other files
grep -r "truenas_stability_monitor_final_fixed" . --include="*.sh" --include="*.md"
# Update to new paths
```

### Step 4: Commit Changes
```bash
git add -A
git commit -m "refactor: organize scripts and infrastructure directories

- Archived 5 duplicate TrueNAS monitoring scripts
- Organized monitoring scripts into dedicated subdirectory
- Consolidated template application scripts
- Moved development/test scripts to scripts/dev/
- Created clear directory structure with README documentation
- Archived Phase 1B deployment scripts

No functional changes - pure reorganization for maintainability."
```

### Step 5: Test
```bash
# Verify no broken references
./scripts/validate-codebase-mcp.sh

# Run integration tests
npm run test:integration
```

### Step 6: Merge
```bash
git checkout main
git merge cleanup/organize-scripts-and-infrastructure
git push origin main
```

---

## Configuration Directory Recommendations

### Backup Organization
```bash
mkdir -p backups/caddy backups/npm backups/traefik
mv config/caddy-backup/* backups/caddy/
# Update documentation
```

### Keep Current Structure
- `config/settings.conf` - Main configuration
- `infrastructure/*` - Infrastructure as code
- `docs/*` - Documentation

---

## Risk Assessment

### Low Risk ✅
- Archiving old scripts (can be restored if needed)
- Creating new subdirectories
- Adding documentation

### Medium Risk ⚠️
- Renaming scripts (need to update references)
- Moving scripts (need to update cron jobs, systemd services)
- Consolidating similar scripts

### High Risk ⛔
- Deleting scripts without archiving
- Changing script functionality
- Breaking existing automations

---

## Success Criteria

After cleanup, the repository should have:

1. ✅ **Clear Directory Structure**
   - Logical grouping of similar scripts
   - Documented organization in README files

2. ✅ **No Duplicate Scripts**
   - Single source of truth for each function
   - Clear deprecation notices on archived scripts

3. ✅ **Updated Documentation**
   - README in scripts/ directory
   - Comments in scripts explaining purpose
   - CHANGELOG noting organizational changes

4. ✅ **No Broken References**
   - All internal script calls updated
   - Cron jobs and systemd services functional
   - CI/CD pipelines working

5. ✅ **Maintained Functionality**
   - All tests passing
   - Deployments working
   - Monitoring operational

---

## Timeline Estimate

- **Phase 1 (Immediate)**: 2-3 hours
- **Phase 2 (Organizational)**: 4-6 hours
- **Phase 3 (Documentation)**: 2-3 hours
- **Testing & Validation**: 2-4 hours

**Total**: 10-16 hours

---

## Next Steps

1. Review this strategy with team/stakeholders
2. Create cleanup branch
3. Execute Phase 1 (high priority items)
4. Test thoroughly
5. Execute Phase 2 (organizational improvements)
6. Complete Phase 3 (documentation)
7. Merge to main

---

## Notes

- All archived scripts remain in git history
- Consider adding `.archived` suffix to archived scripts
- Update CI/CD pipelines to use new paths
- Schedule time to review archived scripts (6 months) for permanent deletion

---

**Document Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Proposed

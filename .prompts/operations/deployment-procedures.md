# Deployment Procedures

Use this prompt for safe and consistent deployments of the homelab-gitops-auditor project.

## Pre-Deployment Checklist

Before executing any deployment, ensure the following steps are completed:

### 1. Code Readiness
- [ ] All code changes are committed and pushed to the main branch
- [ ] All tests are passing (unit, integration, E2E)
- [ ] Code review is completed and approved
- [ ] No known security vulnerabilities
- [ ] Performance impact has been assessed

### 2. Environment Preparation
- [ ] Target environment is accessible and healthy
- [ ] Required dependencies are available
- [ ] Configuration files are up-to-date
- [ ] Database/storage is accessible and backed up
- [ ] Monitoring systems are operational

### 3. Documentation & Communication
- [ ] Deployment notes are prepared
- [ ] Rollback procedures are documented
- [ ] Team is notified of deployment timing
- [ ] Maintenance window is scheduled (if needed)

## Deployment Process

### Step 1: Pre-Deployment Verification
```bash
# Verify current system status
./scripts/comprehensive_audit.sh
./scripts/dev/debug-api.sh

# Check current version
cat package.json | grep version

# Verify configuration
./scripts/config/config-loader.sh
```

### Step 2: Create Deployment Backup
```bash
# Create backup of current deployment
tar -czf "backup_$(date +%Y%m%d_%H%M%S).tar.gz" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=repos \
  .

# Store backup in safe location
mv backup_*.tar.gz /backup/deployments/
```

### Step 3: Deploy New Version
```bash
# For production deployment
./scripts/deployment/deploy-production.sh

# For development/staging
./scripts/deploy.sh

# Alternative manual deployment
./manual-deploy.sh
```

### Step 4: Post-Deployment Verification
```bash
# Verify services are running
systemctl status gitops-auditor
systemctl status gitops-dashboard

# Check API health
curl -f http://localhost:3000/health

# Verify dashboard accessibility
curl -f http://localhost:3001/

# Run smoke tests
./scripts/validate-codebase-mcp.sh
```

### Step 5: Monitor & Validate
- [ ] Check application logs for errors
- [ ] Verify all features are working correctly
- [ ] Monitor system performance
- [ ] Confirm external integrations are functioning
- [ ] Validate user-facing functionality

## Rollback Procedures

If issues are detected post-deployment:

### Immediate Rollback
```bash
# Stop current services
sudo systemctl stop gitops-auditor
sudo systemctl stop gitops-dashboard

# Restore from backup
cd /opt/gitops-auditor
tar -xzf /backup/deployments/backup_YYYYMMDD_HHMMSS.tar.gz

# Restart services
sudo systemctl start gitops-auditor
sudo systemctl start gitops-dashboard

# Verify rollback success
./scripts/dev/debug-api.sh
```

### Git-based Rollback
```bash
# Identify last known good commit
git log --oneline -10

# Reset to previous version
git reset --hard <commit-hash>

# Redeploy
./scripts/deployment/deploy-production.sh
```

## 3-Tier Environment Architecture

The GitOps auditor now supports a comprehensive 3-tier deployment architecture:

### LXC 128 - Enhanced Development Environment
**Primary Features:**
- Home Assistant Core integration for IoT configuration validation
- ESPHome development tools for device firmware development
- Live reload and hot-swapping for rapid development
- Comprehensive logging and debugging tools
- Development-specific testing frameworks

**Provisioning:**
```bash
# Enhanced development environment with Home Assistant tools
./scripts/deployment/provision-lxc-dev-enhanced.sh
```

**Access:**
- Dashboard: `http://LXC-128-IP:3001`
- API: `http://LXC-128-IP:3000`
- Home Assistant Core: `http://LXC-128-IP:8123`
- Development Tools: Available via SSH

**Key Capabilities:**
- Real-time GitOps configuration validation
- Home Assistant YAML syntax checking
- ESPHome device configuration testing
- Automated development environment setup
- Live configuration reloading

### LXC 129 - QA/Testing Environment
**Primary Features:**
- Comprehensive testing framework (Jest, Cypress, Artillery)
- Security scanning tools (Bandit, Safety)
- Performance testing with Lighthouse auditing
- Load testing capabilities
- Automated QA workflow management

**Provisioning:**
```bash
# QA environment with comprehensive testing suite
./scripts/deployment/provision-lxc-qa.sh
```

**Access:**
- Dashboard: `http://LXC-129-IP`
- API: `http://LXC-129-IP:3070`
- Health Check: `http://LXC-129-IP/health`
- QA Tools: `gitops-qa-workflow` command

**Testing Suites:**
```bash
# Run all QA tests
gitops-qa-workflow test all

# Individual test suites
gitops-qa-workflow test functional
gitops-qa-workflow test security
gitops-qa-workflow test performance
```

### Production Environment
**Primary Features:**
- Optimized for performance and reliability
- Comprehensive monitoring and alerting
- Automated backup and disaster recovery
- Production-grade security hardening

**Deployment Flow:**
```bash
Development (LXC 128) → QA (LXC 129) → Production
```

**Environment Validation:**
Each tier includes validation checkpoints:
1. **Development**: Code quality, Home Assistant validation
2. **QA**: Security scanning, performance testing, functional validation
3. **Production**: Health checks, monitoring, rollback readiness

## Environment-Specific Considerations

### Development Environment
- Fast iteration cycles acceptable
- Automated testing on every commit
- Can tolerate brief downtime
- Use `./dev-run.sh` for quick deployments

### Staging Environment
- Mirror production as closely as possible
- Full deployment process testing
- Performance testing under load
- Integration testing with external services

### Production Environment
- Zero-downtime deployment preferred
- Rolling deployments when possible
- Comprehensive monitoring required
- Immediate rollback capability essential

## Deployment Types

### Hot Deployment (Zero Downtime)
```bash
# Update code without stopping services
git pull origin main
npm install --production
npm run build

# Graceful service restart
sudo systemctl reload gitops-auditor
```

### Rolling Deployment
```bash
# For multi-instance deployments
# Update instances one at a time
# Verify health before proceeding to next instance
```

### Blue-Green Deployment
```bash
# Prepare new environment (green)
# Switch traffic from old (blue) to new (green)
# Keep old environment ready for rollback
```

## Monitoring & Alerting

### Key Metrics to Monitor
- Application response times
- Error rates in logs
- System resource usage (CPU, memory, disk)
- External API response times
- User session counts

### Alert Conditions
- Service failures or restarts
- Error rate exceeding baseline
- Response time degradation
- Resource exhaustion warnings
- External service failures

### Log Analysis
```bash
# Check recent application logs
journalctl -u gitops-auditor -f --since "5 minutes ago"

# Look for specific error patterns
grep -i error /var/log/gitops-auditor.log | tail -20

# Monitor dashboard logs
tail -f /var/log/nginx/gitops-dashboard.log
```

## Post-Deployment Actions

### Immediate (0-30 minutes)
- Verify core functionality
- Check error logs
- Monitor system resources
- Validate external integrations

### Short-term (30 minutes - 4 hours)
- Monitor user feedback
- Check performance metrics
- Validate scheduled jobs
- Review audit results

### Long-term (4+ hours)
- Analyze performance trends
- Review deployment metrics
- Update documentation
- Plan next deployment improvements

Always document any issues encountered and improvements for the next deployment cycle.

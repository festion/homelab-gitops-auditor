# 3-Tier Environment Deployment Guide

This guide covers the complete setup and management of the GitOps Auditor's 3-tier environment architecture.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Development   │───▶│       QA        │───▶│   Production    │
│    (LXC 128)    │    │   (LXC 129)     │    │  (Existing)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
│                      │                      │
│ • Home Assistant     │ • Testing Suite     │ • Monitoring    │
│ • ESPHome Tools      │ • Security Scans    │ • Alerts        │
│ • Live Reload        │ • Performance       │ • Backups       │
│ • Debug Tools        │ • Load Testing      │ • HA Config     │
└─────────────────────  └─────────────────────  └─────────────────
```

## Quick Setup

### Step 1: Deploy Enhanced Development Environment (LXC 128)

```bash
# Run the enhanced development provisioning script
cd /home/dev/workspace/homelab-gitops-auditor
./scripts/deployment/provision-lxc-dev-enhanced.sh
```

**What this creates:**
- GitOps dashboard with development tools
- Home Assistant Core for IoT validation
- ESPHome development environment
- Live reload capabilities
- Enhanced debugging and logging

**Access after setup:**
- Dashboard: `http://LXC-128-IP:3001`
- API: `http://LXC-128-IP:3000`
- Home Assistant: `http://LXC-128-IP:8123`

### Step 2: Deploy QA Environment (LXC 129)

```bash
# Run the QA environment provisioning script
./scripts/deployment/provision-lxc-qa.sh
```

**What this creates:**
- Production-like environment for testing
- Comprehensive testing framework
- Security scanning tools
- Performance testing capabilities
- Automated QA workflows

**Access after setup:**
- Dashboard: `http://LXC-129-IP`
- API: `http://LXC-129-IP:3070`
- Health Check: `http://LXC-129-IP/health`

### Step 3: Configure Production Environment

Production environment should already exist. Ensure it's properly configured for the 3-tier workflow.

## Development Workflow

### 1. Development Phase (LXC 128)

```bash
# SSH into development environment
ssh root@LXC-128-IP

# Use development tools
gitops-dev-workflow start           # Start development services
gitops-dev-workflow test hass       # Test Home Assistant configs
gitops-dev-workflow validate        # Validate GitOps configurations
gitops-dev-workflow restart         # Restart with live reload
```

**Development Features:**
- Automatic GitOps configuration validation
- Home Assistant YAML syntax checking
- ESPHome device configuration testing
- Live reload on code changes
- Enhanced debugging capabilities

### 2. QA Phase (LXC 129)

```bash
# SSH into QA environment
ssh root@LXC-129-IP

# Run comprehensive QA tests
gitops-qa-workflow test all         # Full test suite
gitops-qa-workflow test functional  # Functional tests only
gitops-qa-workflow test security    # Security scanning
gitops-qa-workflow test performance # Performance benchmarks
```

**QA Testing Suites:**
- **Functional Tests**: Core functionality validation
- **Security Tests**: Vulnerability scanning, secure headers
- **Performance Tests**: Load testing, Lighthouse audits
- **API Integration Tests**: Endpoint validation
- **Deployment Simulation**: Production deployment testing

### 3. Production Deployment

```bash
# Deploy to production (existing process)
./scripts/deployment/deploy-production.sh
```

## Environment Management

### Development Environment (LXC 128)

**Start/Stop Services:**
```bash
gitops-dev-workflow start
gitops-dev-workflow stop
gitops-dev-workflow restart
```

**Development Tasks:**
```bash
gitops-dev-workflow validate        # Validate configurations
gitops-dev-workflow sync           # Sync with repositories
gitops-dev-workflow test hass      # Test Home Assistant
gitops-dev-workflow logs           # View development logs
```

### QA Environment (LXC 129)

**Workflow Management:**
```bash
gitops-qa-workflow start           # Start QA services
gitops-qa-workflow deploy          # Run deployment simulation
gitops-qa-workflow status          # Check environment status
gitops-qa-workflow reports         # View test reports
```

**Continuous Testing:**
```bash
# Set up automated testing schedule
crontab -e
# Add: 0 */2 * * * /usr/local/bin/gitops-qa-workflow test all
```

## Monitoring and Troubleshooting

### Health Checks

**Development Environment:**
```bash
curl http://LXC-128-IP:3000/health
curl http://LXC-128-IP:8123/  # Home Assistant
```

**QA Environment:**
```bash
curl http://LXC-129-IP/health
curl http://LXC-129-IP:3070/audit  # API endpoint
```

### Log Analysis

**Development Logs:**
```bash
gitops-dev-workflow logs api        # API logs
gitops-dev-workflow logs hass       # Home Assistant logs
gitops-dev-workflow logs system     # System logs
```

**QA Logs:**
```bash
gitops-qa-workflow logs api         # API logs
gitops-qa-workflow logs nginx       # Nginx logs
gitops-qa-workflow logs monitor     # Monitoring logs
```

### Performance Monitoring

**QA Performance Reports:**
```bash
gitops-qa-workflow reports          # View all test reports
ls /opt/gitops/test-reports/        # Direct access to reports
```

## Backup and Recovery

### Development Environment Backup

```bash
# Create development environment backup
tar -czf dev-backup-$(date +%Y%m%d).tar.gz \
  --exclude=node_modules --exclude=.git \
  /opt/gitops /opt/homeassistant
```

### QA Environment Backup

```bash
# Create QA environment backup
tar -czf qa-backup-$(date +%Y%m%d).tar.gz \
  --exclude=node_modules \
  /opt/gitops /opt/gitops/test-reports
```

## Security Considerations

### Development Environment
- Home Assistant Core runs with development settings
- Enhanced logging may contain sensitive information
- ESPHome configurations should use test devices only

### QA Environment
- Security scanning tools identify vulnerabilities
- Test data should not contain production secrets
- Network isolation recommended for testing

### Production Environment
- Standard production security practices
- Regular security updates
- Monitoring and alerting configured

## Troubleshooting

### Common Issues

**Development Environment:**
- Home Assistant fails to start: Check configuration validity
- Live reload not working: Restart development services
- ESPHome compilation errors: Verify device configurations

**QA Environment:**
- Tests failing: Check test reports in `/opt/gitops/test-reports/`
- Performance degradation: Review resource allocation
- Security scan failures: Address identified vulnerabilities

**Inter-Environment Issues:**
- Configuration drift: Use validation tools to identify differences
- Test failures in QA: Check development environment for similar issues
- Production deployment failures: Validate QA test results

### Recovery Procedures

**Development Environment Recovery:**
```bash
gitops-dev-workflow stop
# Restore from backup or re-run provisioning script
./scripts/deployment/provision-lxc-dev-enhanced.sh
```

**QA Environment Recovery:**
```bash
gitops-qa-workflow stop
# Restore from backup or re-run provisioning script
./scripts/deployment/provision-lxc-qa.sh
```

## Best Practices

1. **Development Phase:**
   - Test all Home Assistant configurations before committing
   - Use ESPHome validation tools for device configurations
   - Run local audits frequently

2. **QA Phase:**
   - Run full test suite before production deployment
   - Address all security scan findings
   - Validate performance benchmarks

3. **Production Deployment:**
   - Only deploy after successful QA validation
   - Maintain rollback capability
   - Monitor post-deployment metrics

4. **Maintenance:**
   - Regular environment updates
   - Periodic backup validation
   - Security patch management across all tiers
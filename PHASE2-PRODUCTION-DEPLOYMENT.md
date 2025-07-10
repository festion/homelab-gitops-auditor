# Phase 2 Production Deployment Guide

## Overview

This document provides comprehensive instructions for deploying Phase 2 of the homelab-gitops-auditor to production. Phase 2 introduces enhanced dashboard features, pipeline management, real-time updates, and comprehensive monitoring.

## 🚀 Quick Start

For experienced operators who have completed the prerequisites:

```bash
# Full automated deployment
./scripts/phase2/orchestrate-phase2-deployment.sh --force

# Interactive deployment with validation
./scripts/phase2/orchestrate-phase2-deployment.sh

# Dry run to test the process
./scripts/phase2/orchestrate-phase2-deployment.sh --dry-run
```

## 📋 Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+ or CentOS 8+)
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: Minimum 20GB free space
- **Network**: Access to GitHub, npm registry, and production server

### Software Dependencies
- Node.js 16+ with npm
- PostgreSQL 12+
- Nginx
- systemd
- Git
- curl
- Standard build tools

### Pre-deployment Checklist

Complete the checklist in `scripts/phase2/pre-deployment-checklist.md` before proceeding:

- [ ] All Phase 2 tests passing
- [ ] Security scan completed
- [ ] Performance benchmarks met
- [ ] Database migration scripts tested
- [ ] Backup procedures verified
- [ ] Rollback procedures tested

## 🏗️ Architecture Overview

### Phase 2 Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │   API Server    │    │   Database      │
│   (Enhanced)    │    │   (Phase 2)     │    │   (PostgreSQL)  │
│                 │    │                 │    │                 │
│ • Pipelines UI  │◄──►│ • Pipeline Mgmt │◄──►│ • Phase 2 Tables│
│ • Real-time     │    │ • WebSockets    │    │ • Views         │
│ • Compliance    │    │ • Orchestration │    │ • Functions     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │   Monitoring    │    │   Alerting      │
│                 │    │                 │    │                 │
│ • Load Balance  │    │ • Prometheus    │    │ • Email/Log     │
│ • SSL Term      │    │ • Grafana       │    │ • System Journal│
│ • Rate Limiting │    │ • Custom Dash   │    │ • Health Checks │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### New Database Schema

Phase 2 adds the following tables:
- `pipeline_runs` - Track CI/CD pipeline executions
- `pipeline_definitions` - Pipeline configuration templates
- `template_compliance` - Compliance scoring and tracking
- `metrics` - System and application metrics
- `websocket_sessions` - WebSocket connection management
- `realtime_events` - Event queue for real-time updates
- `orchestration_jobs` - Background job management

## 📦 Deployment Methods

### Method 1: Orchestrated Deployment (Recommended)

The orchestrated deployment handles all phases automatically:

```bash
# Interactive deployment with full validation
./scripts/phase2/orchestrate-phase2-deployment.sh

# Automated deployment (CI/CD)
./scripts/phase2/orchestrate-phase2-deployment.sh --force

# Test deployment process
./scripts/phase2/orchestrate-phase2-deployment.sh --dry-run

# Deploy to staging only
./scripts/phase2/orchestrate-phase2-deployment.sh --staging-only
```

### Method 2: Manual Step-by-Step

For granular control or troubleshooting:

```bash
# 1. Pre-deployment validation
cat scripts/phase2/pre-deployment-checklist.md

# 2. Database migration
./scripts/phase2/migrate-phase2.sh

# 3. Zero-downtime deployment
./scripts/phase2/deploy-phase2-production.sh

# 4. Post-deployment validation
./scripts/phase2/validate-phase2-deployment.sh

# 5. Monitoring setup
./scripts/phase2/setup-phase2-monitoring.sh
```

### Method 3: Container Deployment

For containerized environments:

```bash
# Build Phase 2 container
docker build -t gitops-audit-phase2 .

# Deploy with docker-compose
docker-compose -f docker-compose.phase2.yml up -d

# Validate container deployment
docker-compose ps
docker-compose logs -f
```

## 🔄 Deployment Process

### Phase 1: Pre-deployment Validation
- System requirements check
- Dependency verification
- Git branch validation
- Pre-deployment checklist review
- Health check of current system

### Phase 2: Environment Preparation
- Create backup directories
- Verify database connectivity
- Check service status
- Prepare deployment workspace

### Phase 3: Build and Test
- Install npm dependencies
- Build production dashboard
- Run automated tests
- Validate build artifacts

### Phase 4: Database Migration
- Create database backup
- Apply schema migrations
- Create new tables and indexes
- Set up views and functions
- Validate migration success

### Phase 5: Zero-Downtime Deployment
- Stage new deployment
- Health check staging environment
- Atomic deployment switch
- Update service configurations
- Restart services gracefully

### Phase 6: Post-deployment Validation
- API endpoint testing
- Database connectivity verification
- Feature functionality testing
- Performance validation
- Security checks

### Phase 7: Monitoring Setup
- Configure Prometheus metrics
- Set up alerting rules
- Install Grafana dashboards
- Create monitoring scripts
- Configure automated cleanup

### Phase 8: Final Verification
- End-to-end testing
- User acceptance preparation
- Documentation updates
- Team notification

## 🎯 Feature Overview

### Enhanced Pipeline Management
- Visual pipeline designer
- Real-time execution monitoring
- Failure analysis and reporting
- Performance metrics tracking

### Real-time Updates
- WebSocket-based live updates
- Event-driven architecture
- Client-side optimistic updates
- Connection resilience

### Advanced Compliance Tracking
- Template compliance scoring
- Automated policy checks
- Compliance trend analysis
- Remediation recommendations

### Comprehensive Monitoring
- Application performance metrics
- System resource monitoring
- Custom business metrics
- Integrated alerting

## 🔧 Configuration

### Environment Variables

Phase 2 adds the following configuration options:

```bash
# Phase 2 Core Settings
PHASE=2
ENABLE_WEBSOCKETS=true
ENABLE_PIPELINE_MANAGEMENT=true
ENABLE_REAL_TIME_UPDATES=true
ENABLE_ORCHESTRATION=true

# WebSocket Configuration
WEBSOCKET_PORT=3070
WEBSOCKET_PATH=/socket.io
WEBSOCKET_CORS_ORIGIN=*

# Pipeline Management
PIPELINE_MAX_CONCURRENT=10
PIPELINE_TIMEOUT=3600
PIPELINE_RETRY_ATTEMPTS=3

# Monitoring
METRICS_COLLECTION_INTERVAL=30
METRICS_RETENTION_DAYS=90
ALERT_EMAIL_RECIPIENTS=admin@example.com
```

### Service Configuration

Updated systemd service file:

```ini
[Unit]
Description=GitOps Audit API - Phase 2
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=gitops
Group=gitops
WorkingDirectory=/opt/gitops/current/api
Environment=NODE_ENV=production
Environment=PHASE=2
EnvironmentFile=/opt/gitops/current/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StartLimitInterval=60s
StartLimitBurst=3

# Health check
ExecStartPost=/bin/sleep 15
ExecStartPost=/usr/bin/curl -f http://localhost:3070/api/health

# Graceful shutdown
KillSignal=SIGTERM
KillMode=mixed
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
```

## 📊 Monitoring and Alerting

### Metrics Collection

Phase 2 provides comprehensive metrics:

```bash
# API Performance
http_requests_total
http_request_duration_seconds
http_request_size_bytes
http_response_size_bytes

# Pipeline Metrics
pipeline_runs_total{status}
pipeline_duration_seconds
pipeline_queue_length

# Compliance Metrics
compliance_score{repository}
compliance_checks_total
template_violations_total

# WebSocket Metrics
websocket_connections_active
websocket_messages_sent_total
websocket_connection_duration_seconds

# System Metrics
process_cpu_seconds_total
process_memory_bytes
nodejs_heap_size_total_bytes
```

### Alerting Rules

Critical alerts configured:

- **API Service Down**: Service unavailable for >1 minute
- **High Error Rate**: >5% error rate for >2 minutes
- **Pipeline Failures**: >20% failure rate for >5 minutes
- **Compliance Drop**: Average score <70% for >10 minutes
- **High Memory Usage**: >80% memory usage for >5 minutes
- **Database Issues**: Connection failures or slow queries

### Monitoring Dashboard

Access monitoring dashboard:

```bash
# Terminal-based dashboard
/opt/gitops/monitoring/dashboard.sh

# Grafana dashboard (if configured)
http://localhost:3000/dashboard/gitops-audit-phase2

# Prometheus metrics
http://localhost:3070/api/v2/metrics/prometheus
```

## 🔙 Rollback Procedures

### Automatic Rollback

The deployment script includes automatic rollback on failure:

```bash
# Rollback is triggered automatically if:
# - Health checks fail
# - Database migration fails
# - Service startup fails
# - Validation tests fail
```

### Manual Rollback

Force rollback if needed:

```bash
# Immediate rollback to last known good state
./scripts/phase2/rollback-deployment.sh --force

# Interactive rollback with confirmation
./scripts/phase2/rollback-deployment.sh

# List available backups
./scripts/phase2/rollback-deployment.sh --list-backups

# Rollback to specific backup
./scripts/phase2/rollback-deployment.sh --backup-name backup_20241210_143022
```

### Rollback Process

1. **Service Shutdown**: Stop Phase 2 services gracefully
2. **Database Restoration**: Restore database to pre-Phase 2 state
3. **Code Restoration**: Replace deployment with backup
4. **Configuration Reset**: Restore Phase 1 configurations
5. **Service Restart**: Start services with Phase 1 settings
6. **Validation**: Verify rollback success

## 🧪 Testing

### Pre-deployment Testing

```bash
# Unit tests
cd api && npm test

# Integration tests
cd api && npm run test:integration

# Dashboard tests
cd dashboard && npm test

# Database migration tests
./scripts/phase2/migrate-phase2.sh --dry-run
```

### Post-deployment Testing

```bash
# Comprehensive validation
./scripts/phase2/validate-phase2-deployment.sh

# Manual API testing
curl -f http://localhost:3070/api/v2/health
curl -f http://localhost:3070/api/v2/pipelines/status
curl -f http://localhost:3070/api/v2/compliance/status

# WebSocket testing
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3070');
socket.on('connect', () => console.log('Connected'));
setTimeout(() => process.exit(0), 5000);
"

# Dashboard testing
curl -f http://localhost:3070/
curl -f http://localhost:3070/pipelines
```

## 🚨 Troubleshooting

### Common Issues

#### API Service Won't Start
```bash
# Check logs
journalctl -u gitops-audit-api -f

# Check configuration
cat /opt/gitops/current/.env

# Test configuration
cd /opt/gitops/current/api && node -c server.js
```

#### Database Migration Fails
```bash
# Check database connectivity
psql -d gitops_audit -c "SELECT version();"

# Check migration log
cat /opt/gitops/logs/migration-phase2.log

# Manual migration rollback
psql -d gitops_audit < /opt/gitops/backups/db_backup_latest.sql
```

#### WebSocket Connection Issues
```bash
# Check WebSocket configuration
grep WEBSOCKET /opt/gitops/current/.env

# Test WebSocket server
curl -I http://localhost:3070/socket.io/

# Check firewall rules
sudo ufw status
```

#### High Memory Usage
```bash
# Check Node.js memory usage
ps aux | grep node

# Check database connections
psql -d gitops_audit -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor memory in real-time
htop
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment
export DEBUG=gitops:*
export NODE_ENV=development

# Restart service with debug
systemctl stop gitops-audit-api
cd /opt/gitops/current/api && npm start

# View debug logs
tail -f /opt/gitops/logs/debug.log
```

### Log Locations

Important log files:

- **Deployment**: `/opt/gitops/logs/deployment-phase2-*.log`
- **Migration**: `/opt/gitops/logs/migration-phase2.log`
- **Validation**: `/opt/gitops/logs/validation-phase2-*.log`
- **Monitoring**: `/opt/gitops/logs/monitoring.log`
- **Alerts**: `/opt/gitops/logs/alerts.log`
- **API**: `journalctl -u gitops-audit-api`
- **Nginx**: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`

## 📈 Performance Optimization

### Database Optimization

```sql
-- Analyze table statistics
ANALYZE pipeline_runs;
ANALYZE template_compliance;
ANALYZE metrics;

-- Create additional indexes if needed
CREATE INDEX CONCURRENTLY idx_pipeline_runs_repo_date 
ON pipeline_runs(repository, started_at);

-- Vacuum and reindex
VACUUM ANALYZE;
REINDEX DATABASE gitops_audit;
```

### Application Optimization

```bash
# Enable Node.js production optimizations
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=2048"

# Configure connection pooling
export DB_POOL_MIN=2
export DB_POOL_MAX=10
export DB_POOL_IDLE_TIMEOUT=30000
```

### Nginx Optimization

```nginx
# /etc/nginx/sites-available/gitops-audit
server {
    # ... existing config ...
    
    # Performance optimizations
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript;
    
    # Caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        # ... existing proxy config ...
    }
}
```

## 🔐 Security Considerations

### API Security
- Input validation on all endpoints
- Rate limiting and throttling
- SQL injection prevention
- XSS protection headers
- CSRF token validation

### Database Security
- Encrypted connections (SSL)
- Least privilege access
- Regular security updates
- Audit logging enabled

### Infrastructure Security
- Firewall configuration
- SSL/TLS encryption
- Regular security patches
- Access logging and monitoring

### WebSocket Security
- Origin validation
- Connection rate limiting
- Message size limits
- Authentication required

## 📚 Additional Resources

### Documentation
- [Phase 2 API Documentation](docs/PHASE2-API.md)
- [Pipeline Management Guide](docs/PIPELINE-MANAGEMENT.md)
- [Compliance Framework](docs/COMPLIANCE-FRAMEWORK.md)
- [WebSocket Integration](docs/WEBSOCKET-INTEGRATION.md)

### Support
- **Technical Issues**: Create issue on GitHub
- **Documentation**: Update this guide with improvements
- **Feature Requests**: Use GitHub discussions
- **Security Issues**: Contact security team directly

### Training Materials
- Phase 2 feature overview presentation
- Administrator training videos
- User acceptance testing guide
- Troubleshooting playbook

## 🗓️ Maintenance Schedule

### Daily
- Monitor system health
- Check error logs
- Verify backup completion

### Weekly
- Review performance metrics
- Analyze compliance trends
- Update security patches

### Monthly
- Database maintenance (vacuum, analyze)
- Log rotation and cleanup
- Capacity planning review

### Quarterly
- Security audit
- Performance optimization
- Disaster recovery testing

---

## Quick Reference

### Essential Commands

```bash
# Deployment
./scripts/phase2/orchestrate-phase2-deployment.sh

# Health Check
./scripts/phase2/validate-phase2-deployment.sh

# Monitoring
/opt/gitops/monitoring/dashboard.sh

# Rollback
./scripts/phase2/rollback-deployment.sh

# Service Management
systemctl status gitops-audit-api
systemctl restart gitops-audit-api
journalctl -u gitops-audit-api -f
```

### Key URLs

- **Dashboard**: http://localhost:3070/
- **API Health**: http://localhost:3070/api/v2/health
- **Metrics**: http://localhost:3070/api/v2/metrics/overview
- **WebSocket**: http://localhost:3070/socket.io/

### Emergency Contacts

- **Technical Lead**: [Contact Information]
- **Operations Team**: [Contact Information]
- **Security Team**: [Contact Information]
- **Product Owner**: [Contact Information]

---

*This documentation is maintained as part of the GitOps Audit Phase 2 deployment. Please keep it updated with any changes or improvements to the deployment process.*
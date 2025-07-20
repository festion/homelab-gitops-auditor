# Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Homelab GitOps Auditor to a production environment using Docker containers, monitoring, security hardening, and automated operational procedures.

## Architecture

### Production Stack

- **Reverse Proxy**: Nginx with SSL/TLS termination
- **Application**: Node.js API and React Dashboard
- **Database**: PostgreSQL 17 with backup automation
- **Cache**: Redis with persistence
- **Monitoring**: Prometheus, Grafana, Loki stack
- **Security**: UFW firewall, fail2ban, SSL certificates
- **Backup**: Automated database and application backups

### Network Architecture

```
Internet → Nginx (80/443) → API (3071) → Database (5432)
                         → Dashboard (3000)
                         → Monitoring (9090/3001)
```

## Prerequisites

### System Requirements

- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **CPU**: 4+ cores recommended
- **RAM**: 8GB+ recommended
- **Storage**: 50GB+ SSD storage
- **Network**: Static IP address recommended

### Required Software

```bash
# Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Additional tools
sudo apt update && sudo apt install -y git curl jq ufw fail2ban
```

## Initial Setup

### 1. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/your-org/homelab-gitops-auditor.git
sudo chown -R $USER:$USER /opt/homelab-gitops-auditor
cd /opt/homelab-gitops-auditor
```

### 2. Configure Environment

```bash
# Copy environment template
cp config/environment.production.example .env

# Edit environment variables
nano .env
```

**Required Environment Variables:**

```bash
# Domain Configuration
DOMAIN=your-domain.com
ADMIN_EMAIL=admin@your-domain.com

# Database
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Security
JWT_SECRET=$(openssl rand -base64 64)
WEBHOOK_SECRET=$(openssl rand -base64 32)

# GitHub Integration
GITHUB_TOKEN=your_github_token_here

# Monitoring
GRAFANA_PASSWORD=$(openssl rand -base64 16)
```

### 3. Security Hardening

```bash
# Run security setup (requires root)
sudo ./scripts/security-setup.sh setup
```

This configures:
- UFW firewall with restricted access
- fail2ban for intrusion prevention
- Docker daemon security
- System hardening
- SSL certificate setup

### 4. Initial Deployment

```bash
# Deploy application stack
./scripts/deploy-production.sh latest production

# Verify deployment
./scripts/deploy-production.sh health
```

## Deployment Procedures

### Standard Deployment

```bash
# Deploy specific version
./scripts/deploy-production.sh v1.2.0 production

# Dry run deployment
./scripts/deploy-production.sh v1.2.0 production true
```

### Blue-Green Deployment

The deployment script automatically uses blue-green strategy:

1. **Preparation**: Pull new container images
2. **Green Deploy**: Start new version on alternate ports
3. **Health Check**: Verify green environment health
4. **Traffic Switch**: Update load balancer configuration
5. **Blue Cleanup**: Remove old version containers

### Rollback Procedure

```bash
# List available backups
./scripts/backup.sh list

# Rollback to specific backup
./scripts/deploy-production.sh rollback backup-20231215-143022

# Emergency rollback to last known good state
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --scale api=0
# Restore from backup manually
./scripts/backup.sh restore backup-20231215-143022 full
docker-compose -f docker-compose.production.yml up -d
```

## Backup and Recovery

### Automated Backups

Backups run automatically via cron:

```bash
# Full backup daily at 2 AM
0 2 * * * /opt/homelab-gitops-auditor/scripts/backup.sh full

# Database backup every 6 hours
0 */6 * * * /opt/homelab-gitops-auditor/scripts/backup.sh database

# Cleanup old backups weekly
0 3 * * 0 /opt/homelab-gitops-auditor/scripts/backup.sh cleanup
```

### Manual Backup Operations

```bash
# Create full backup
./scripts/backup.sh full

# Database only backup
./scripts/backup.sh database

# Incremental backup since yesterday
./scripts/backup.sh incremental 2023-12-14

# List all backups
./scripts/backup.sh list

# Verify backup integrity
./scripts/backup.sh verify backup-20231215-143022
```

### Recovery Procedures

```bash
# Full system restore
./scripts/backup.sh restore backup-20231215-143022 full

# Database only restore
./scripts/backup.sh restore backup-20231215-143022 database

# Application data only
./scripts/backup.sh restore backup-20231215-143022 data
```

## Monitoring and Alerting

### Monitoring Stack Access

- **Grafana**: `https://your-domain.com/grafana/`
- **Prometheus**: `http://server-ip:9090/`
- **Application Logs**: `docker-compose logs -f api`

### Key Metrics to Monitor

1. **Application Health**
   - API response times
   - Error rates
   - Request volume
   - Authentication failures

2. **Infrastructure Health**
   - CPU and memory usage
   - Disk space
   - Network connectivity
   - Container status

3. **Security Metrics**
   - Failed login attempts
   - Firewall blocks
   - SSL certificate expiry
   - Audit log anomalies

### Alert Thresholds

- **Critical**: API down, database connection lost, disk >90% full
- **Warning**: High response times (>1s), memory >80%, failed backups
- **Info**: New deployments, backup completions, certificate renewals

## Operational Procedures

### Daily Operations

```bash
# Check system health
./scripts/deploy-production.sh health

# Review logs
docker-compose logs --tail=100 api
docker-compose logs --tail=100 nginx

# Check backup status
./scripts/backup.sh list | tail -5

# Security check
sudo ./scripts/security-setup.sh validate
```

### Weekly Operations

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Clean up old Docker images
docker system prune -af

# Review security logs
sudo fail2ban-client status
sudo journalctl -u fail2ban --since "1 week ago"

# Test backup restoration
./scripts/backup.sh verify $(./scripts/backup.sh list | tail -1 | awk '{print $9}' | sed 's/.tar.gz//')
```

### Monthly Operations

```bash
# Update Docker images
docker-compose pull
./scripts/deploy-production.sh latest production

# Security audit
sudo ./scripts/security-setup.sh validate
sudo audit2allow -a

# Performance review
# Review Grafana dashboards for trends
# Analyze application metrics

# Documentation update
# Update this guide with any new procedures
# Review and update monitoring alerts
```

## Troubleshooting

### Common Issues

#### 1. SSL Certificate Issues

```bash
# Check certificate status
openssl x509 -in /opt/homelab-gitops-auditor/nginx/ssl/cert.pem -text -noout

# Renew Let's Encrypt certificates
docker-compose run --rm certbot renew

# Manual certificate generation
sudo ./scripts/security-setup.sh ssl
```

#### 2. Database Connection Issues

```bash
# Check database status
docker-compose ps database

# View database logs
docker-compose logs database

# Connect to database manually
docker-compose exec database psql -U homelab_user -d homelab_gitops

# Reset database connection
docker-compose restart database
sleep 30
docker-compose restart api
```

#### 3. High Memory Usage

```bash
# Check container memory usage
docker stats

# Restart memory-intensive services
docker-compose restart api dashboard

# Check for memory leaks
docker-compose exec api npm run memory-profile
```

#### 4. API Performance Issues

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s "https://your-domain.com/api/health"

# Review API logs for errors
docker-compose logs api | grep ERROR

# Check database query performance
docker-compose exec database psql -U homelab_user -d homelab_gitops -c "SELECT * FROM pg_stat_activity;"
```

### Emergency Procedures

#### Complete System Failure

1. **Assess Situation**
   ```bash
   # Check what's running
   docker ps -a
   systemctl status docker
   df -h
   ```

2. **Emergency Restore**
   ```bash
   # Stop all services
   docker-compose down
   
   # Restore from latest backup
   ./scripts/backup.sh restore $(./scripts/backup.sh list | tail -1 | awk '{print $9}' | sed 's/.tar.gz//') full
   
   # Start services
   docker-compose up -d
   ```

3. **Verify Recovery**
   ```bash
   ./scripts/deploy-production.sh health
   curl -k https://your-domain.com/health
   ```

## Security Procedures

### Security Incident Response

1. **Immediate Actions**
   ```bash
   # Block suspicious IPs
   sudo ufw deny from <suspicious-ip>
   
   # Check active connections
   netstat -tulpn | grep :443
   netstat -tulpn | grep :3071
   
   # Review fail2ban logs
   sudo fail2ban-client status
   ```

2. **Investigation**
   ```bash
   # Check audit logs
   sudo ausearch -ts today -k homelab_files
   
   # Review application logs
   docker-compose logs api | grep -i "error\|fail\|attack"
   
   # Check for unauthorized changes
   git status
   git log --oneline -10
   ```

3. **Recovery**
   ```bash
   # Reset compromised passwords
   # Update .env file with new secrets
   
   # Restart services with new configuration
   ./scripts/deploy-production.sh latest production
   
   # Update security rules
   sudo ./scripts/security-setup.sh setup
   ```

### Regular Security Tasks

```bash
# Weekly security updates
sudo apt update && sudo apt upgrade -y

# Monthly security scan
sudo ./scripts/security-setup.sh validate

# Quarterly password rotation
# Update all passwords in .env
# Rotate API keys and tokens
# Update SSL certificates if needed
```

## Performance Optimization

### Database Optimization

```bash
# Database maintenance
docker-compose exec database psql -U homelab_user -d homelab_gitops -c "VACUUM ANALYZE;"

# Index optimization
docker-compose exec database psql -U homelab_user -d homelab_gitops -c "REINDEX DATABASE homelab_gitops;"

# Check slow queries
docker-compose exec database psql -U homelab_user -d homelab_gitops -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Application Optimization

```bash
# Check for memory leaks
docker-compose exec api npm run memory-profile

# Optimize API response caching
# Review Redis cache hit rates
docker-compose exec redis redis-cli info stats

# Application profiling
docker-compose exec api npm run profile
```

## Contact Information

- **Emergency Contact**: [Your emergency contact]
- **Technical Lead**: [Technical lead contact]
- **Infrastructure Team**: [Infrastructure team contact]
- **Security Team**: [Security team contact]

## Documentation Updates

This guide should be updated:
- After any significant deployment or configuration changes
- Monthly as part of operational review
- When new procedures are established
- After any security incidents

---

*Last Updated: [Current Date]*
*Version: 1.0*
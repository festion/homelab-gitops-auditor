# Incident Response Procedures

Use this prompt for handling incidents in the homelab-gitops-auditor project.

## Incident Classification

### Severity Levels

**Critical (P1)**:
- Complete service outage
- Data loss or corruption
- Security breach
- Response Time: Immediate (0-15 minutes)

**High (P2)**:
- Partial service degradation
- Performance issues affecting users
- Failed deployments blocking releases
- Response Time: 30 minutes

**Medium (P3)**:
- Minor feature issues
- Non-critical performance degradation
- Documentation problems
- Response Time: 2 hours

**Low (P4)**:
- Cosmetic issues
- Enhancement requests
- Non-urgent improvements
- Response Time: Next business day

## Immediate Response Actions

### 1. Assessment & Triage (0-5 minutes)
- Determine incident severity using classification above
- Identify affected systems and users
- Check monitoring dashboards and logs
- Document initial findings

### 2. Communication (5-10 minutes)
- Notify relevant stakeholders
- Create incident tracking ticket
- Establish communication channels
- Set status page if applicable

### 3. Initial Stabilization (10-30 minutes)
- Implement immediate workarounds
- Isolate affected components if needed
- Check recent changes for correlation
- Begin detailed investigation

## Investigation Procedures

### System Health Checks
```bash
# Check service status
systemctl status gitops-auditor
systemctl status gitops-dashboard

# Verify API health
curl -f http://localhost:3000/health

# Check disk space and resources
df -h
free -h
top

# Review recent logs
journalctl -u gitops-auditor --since "1 hour ago"
tail -f /var/log/nginx/error.log
```

### Application-Specific Diagnostics
```bash
# Debug API issues
./scripts/dev/debug-api.sh

# Check configuration validity
./scripts/config/config-loader.sh

# Validate audit functionality
./scripts/comprehensive_audit.sh

# Check MCP server connectivity
curl http://localhost:3000/api/status
```

### Common Issue Patterns

**Service Won't Start**:
- Check configuration files for syntax errors
- Verify file permissions
- Check port availability
- Review dependency services

**Performance Issues**:
- Monitor CPU and memory usage
- Check database/storage performance
- Review recent configuration changes
- Analyze request patterns

**Integration Failures**:
- Test external API connectivity
- Verify authentication credentials
- Check rate limiting status
- Validate network connectivity

## Resolution Procedures

### Quick Fixes
```bash
# Restart services
sudo systemctl restart gitops-auditor
sudo systemctl restart gitops-dashboard

# Clear temporary data
rm -rf /tmp/gitops-*
rm -rf repos/*

# Reset to last known good configuration
git reset --hard HEAD~1
./scripts/deployment/deploy-production.sh
```

### Configuration Recovery
```bash
# Restore from backup
cd /opt/gitops-auditor
cp -r /backup/latest/* .

# Validate configuration
./scripts/config/config-loader.sh

# Restart with restored config
sudo systemctl restart gitops-auditor
```

### Database/Storage Issues
```bash
# Check storage space
df -h /var/lib/gitops-auditor

# Verify audit history integrity
node -e "console.log(JSON.parse(fs.readFileSync('audit-history/latest.json')))"

# Clean up old data if needed
find repos/ -name "*.git" -mtime +30 -exec rm -rf {} \;
```

## Escalation Procedures

### Internal Escalation
1. **Development Team**: For code-related issues
2. **Infrastructure Team**: For deployment/server issues
3. **Security Team**: For security-related incidents
4. **Management**: For business impact assessment

### External Escalation
1. **Hosting Provider**: For infrastructure issues
2. **Third-party Services**: For integration failures
3. **Security Vendors**: For security incidents

## Communication Templates

### Initial Incident Notification
```
Subject: [P{severity}] GitOps Auditor Incident - {brief description}

Incident ID: INC-{timestamp}
Severity: P{level}
Status: Investigating
Started: {timestamp}

Description:
{Brief description of the issue}

Impact:
{Who/what is affected}

Actions Taken:
{Initial response actions}

Next Update: {time}
```

### Progress Updates
```
Subject: [UPDATE] [P{severity}] GitOps Auditor Incident - {brief description}

Incident ID: INC-{timestamp}
Status: {Investigating/Identified/Resolving/Resolved}
Duration: {time elapsed}

Update:
{Progress since last update}

Root Cause:
{If identified}

Resolution:
{Steps taken or planned}

Next Update: {time}
```

### Resolution Notification
```
Subject: [RESOLVED] [P{severity}] GitOps Auditor Incident - {brief description}

Incident ID: INC-{timestamp}
Status: Resolved
Total Duration: {time}
Resolution Time: {timestamp}

Summary:
{Brief summary of incident and resolution}

Root Cause:
{Final root cause analysis}

Resolution:
{What was done to fix the issue}

Prevention:
{Steps to prevent recurrence}

Post-mortem: {scheduled if needed}
```

## Post-Incident Activities

### Immediate Post-Resolution (0-2 hours)
- Verify full service restoration
- Monitor for regression
- Update stakeholders on resolution
- Document resolution steps

### Short-term Follow-up (2-24 hours)
- Analyze root cause thoroughly
- Update monitoring and alerting
- Review incident response effectiveness
- Plan preventive measures

### Long-term Improvements (1-7 days)
- Conduct post-mortem if needed
- Implement preventive measures
- Update procedures based on lessons learned
- Update documentation and runbooks

## Prevention Strategies

### Monitoring Enhancements
- Add alerting for new failure patterns
- Improve early warning indicators
- Enhance log analysis capabilities
- Implement automated health checks

### Process Improvements
- Update deployment procedures
- Enhance testing coverage
- Improve change management
- Strengthen configuration validation

### Infrastructure Hardening
- Implement redundancy where needed
- Improve backup and recovery procedures
- Enhance security measures
- Optimize performance bottlenecks

Always prioritize rapid restoration over perfect diagnosis during active incidents.

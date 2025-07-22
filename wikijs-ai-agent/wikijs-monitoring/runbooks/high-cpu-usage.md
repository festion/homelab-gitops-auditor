# Runbook: High CPU Usage Alert

## Alert Information

- **Alert Type**: Resource Usage
- **Severity**: Critical
- **Threshold**: CPU usage > 85%
- **Impact**: Performance degradation, potential service disruption
- **SLA Impact**: High

## Immediate Response (First 5 minutes)

### 1. Acknowledge the Alert
```bash
# Via API
curl -X POST http://localhost:3002/api/v1/alerts/cpu-usage/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"acknowledgedBy":"oncall-engineer","notes":"Investigating high CPU usage"}'
```

### 2. Check Current CPU Status
```bash
# Check overall system load
top -n 1

# Check CPU usage by process
ps aux --sort=-%cpu | head -20

# Check load average
uptime

# Check WikiJS agent process specifically
ps aux | grep -E "(wikijs|node)" | grep -v grep
```

### 3. Identify the Cause
```bash
# Check if it's the WikiJS agent
pgrep -f wikijs-agent
htop -p $(pgrep -f wikijs-agent)

# Check for runaway processes
top -o %CPU

# Check system resources
free -h
df -h
iostat 1 3
```

## Investigation Steps (First 15 minutes)

### 4. Analyze WikiJS Agent Performance

#### Check Agent Logs
```bash
# Check recent logs for errors
tail -n 100 /home/dev/workspace/wikijs-monitoring/data/logs/wikijs-agent-*.log | grep -E "(ERROR|WARN|cpu|memory|slow)"

# Check for processing bottlenecks
grep -i "processing\|queue\|timeout" /home/dev/workspace/wikijs-monitoring/data/logs/wikijs-agent-*.log | tail -20
```

#### Check Document Processing Queue
```bash
# Check if document processing is backed up
curl -s http://localhost:3001/api/status | jq '.queue_depth'

# Check active operations
curl -s http://localhost:3001/api/metrics | jq '.active_operations'
```

#### Monitor MCP Server Activity
```bash
# Check MCP server status
curl -s http://localhost:3001/api/health/mcp

# Check for MCP server errors
journalctl -u wikijs-mcp-server -n 50 --no-pager
```

### 5. Check System-wide Issues

#### Check for System Processes
```bash
# Look for high-CPU system processes
ps aux --sort=-%cpu | head -10

# Check for I/O wait
iostat -x 1 3

# Check memory pressure (can cause CPU spikes)
cat /proc/meminfo | grep -E "(MemAvailable|SwapFree)"
```

#### Check for External Factors
```bash
# Check if it's a scheduled task
crontab -l
sudo crontab -l

# Check for backup or maintenance processes
ps aux | grep -E "(backup|rsync|tar|gzip)"
```

## Resolution Actions

### If WikiJS Agent is the Cause

#### Option 1: Graceful Restart
```bash
# Stop the agent gracefully
sudo systemctl stop wikijs-agent

# Wait for processes to clean up
sleep 10

# Check that all processes have stopped
pgrep -f wikijs-agent

# Restart the agent
sudo systemctl start wikijs-agent

# Verify restart
sudo systemctl status wikijs-agent
```

#### Option 2: Clear Processing Queue
```bash
# If document processing is backed up
curl -X POST http://localhost:3001/api/admin/clear-queue \
  -H "Content-Type: application/json" \
  -d '{"force":true}'

# Restart document processing
curl -X POST http://localhost:3001/api/admin/restart-processing
```

#### Option 3: Reduce Processing Load
```bash
# Temporarily reduce processing concurrency
curl -X POST http://localhost:3001/api/admin/config \
  -H "Content-Type: application/json" \
  -d '{"max_concurrent_operations":1}'

# Pause AI processing temporarily
curl -X POST http://localhost:3001/api/admin/ai-processing \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'
```

### If System-wide Issue

#### Option 1: Kill High-CPU Processes
```bash
# Identify the problematic process
PID=$(ps aux --sort=-%cpu | awk 'NR==2 {print $2}')

# Check what the process is
ps -fp $PID

# If safe to kill, terminate it
kill $PID

# If process doesn't respond, force kill
kill -9 $PID
```

#### Option 2: Emergency System Cleanup
```bash
# Clear system caches (if low memory is causing CPU spikes)
sudo sync
sudo echo 3 > /proc/sys/vm/drop_caches

# Stop non-essential services temporarily
sudo systemctl stop snapd
sudo systemctl stop packagekit
```

### If I/O Wait is High

#### Check Disk Performance
```bash
# Check disk usage and I/O
df -h
iotop -ao

# Check for full disks
df -h | grep -E "(9[0-9]%|100%)"

# Clean up logs if disk is full
sudo journalctl --vacuum-time=1d
find /var/log -name "*.log" -size +100M
```

## Monitoring and Follow-up

### 6. Verify Resolution
```bash
# Check CPU usage has returned to normal
top -n 1 | grep "Cpu(s)"

# Verify WikiJS agent is healthy
curl http://localhost:3001/health

# Check monitoring dashboard
curl http://localhost:3002/api/v1/health/summary
```

### 7. Update Alert Status
```bash
# If resolved, close the alert
curl -X POST http://localhost:3002/api/v1/alerts/cpu-usage/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution":"High CPU usage resolved by restarting WikiJS agent"}'
```

## Prevention Measures

### Immediate Actions
1. **Monitor Processing Queue**: Set up alerts for queue depth > 50
2. **Resource Limits**: Implement CPU limits for WikiJS agent process
3. **Processing Throttling**: Configure rate limiting for document processing

### Long-term Improvements
1. **Performance Optimization**: 
   - Review document processing algorithms
   - Implement caching for frequently accessed data
   - Optimize database queries

2. **Resource Management**:
   - Set systemd service limits
   - Implement graceful degradation under load
   - Add auto-scaling for processing queues

3. **Monitoring Enhancements**:
   - Add predictive alerting for CPU trends
   - Monitor process-level CPU usage
   - Set up capacity planning dashboards

## Configuration Updates

### Set Resource Limits
```bash
# Create systemd override
sudo systemctl edit wikijs-agent

# Add resource limits
[Service]
CPUQuota=80%
MemoryLimit=512M
TasksMax=100
```

### Update Monitoring Thresholds
```bash
# Lower warning threshold for earlier detection
echo "CPU_WARNING_THRESHOLD=60" >> /home/dev/workspace/wikijs-monitoring/.env
echo "CPU_CRITICAL_THRESHOLD=80" >> /home/dev/workspace/wikijs-monitoring/.env

# Restart monitoring system
sudo systemctl restart wikijs-agent-monitor
```

### Configure Agent Limits
```json
{
  "processing": {
    "max_concurrent_operations": 2,
    "processing_timeout": 30000,
    "queue_size_limit": 100,
    "cpu_throttling": {
      "enabled": true,
      "threshold": 70,
      "backoff_time": 5000
    }
  }
}
```

## Escalation Path

### Level 1: Automated Recovery (0-5 minutes)
- Monitoring system detects high CPU
- Automated recovery attempts restart
- Alert sent to monitoring dashboard

### Level 2: On-call Response (5-15 minutes)
- On-call engineer investigates
- Manual intervention if automated recovery fails
- Follow this runbook

### Level 3: Team Escalation (15+ minutes)
- Escalate to development team if issue persists
- Consider emergency maintenance window
- Implement temporary workarounds

### Level 4: Emergency Response (30+ minutes)
- Engage management if service impact is severe
- Consider service degradation or shutdown
- Activate business continuity plans

## Documentation Updates

After resolving the incident:
1. Update this runbook with any new findings
2. Document root cause in incident report
3. Update monitoring thresholds if needed
4. Share lessons learned with team

## Related Runbooks
- [High Memory Usage](high-memory-usage.md)
- [WikiJS Agent Health Check Failure](agent-health-check.md)
- [Performance Degradation](performance-degradation.md)
- [Emergency Recovery Procedures](emergency-recovery.md)

## Useful Commands Reference

```bash
# CPU monitoring
top -n 1
htop
ps aux --sort=-%cpu
cat /proc/loadavg

# Process management
pgrep -f wikijs
pkill -f wikijs
systemctl status wikijs-agent
journalctl -u wikijs-agent -f

# System resources
free -h
df -h
iostat 1 3
vmstat 1 3

# WikiJS agent specific
curl http://localhost:3001/health
curl http://localhost:3001/api/metrics
curl http://localhost:3001/api/status
```

## Contact Information

- **Primary On-call**: Check rotation schedule
- **Escalation Team**: Development team lead
- **Emergency Contact**: System administrator
- **Vendor Support**: N/A (internal system)
# WikiJS Agent Monitoring System - Installation Guide

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+, CentOS 8+, or similar)
- **Node.js**: Version 16.x or higher
- **npm**: Version 8.x or higher
- **Memory**: Minimum 512MB RAM
- **Disk Space**: 2GB for logs, metrics, and data storage
- **Network**: Access to monitored services and notification endpoints

### Service Dependencies

- **WikiJS Agent**: Must be running and accessible
- **Home Assistant** (optional): For mobile notifications and integrations
- **SMTP Server** (optional): For email notifications
- **Slack Workspace** (optional): For team notifications

## Installation Methods

### Method 1: Direct Installation (Recommended)

1. **Navigate to workspace directory**:
```bash
cd /home/dev/workspace
```

2. **The monitoring system is already created in wikijs-monitoring/**:
```bash
ls -la wikijs-monitoring/
```

3. **Install Node.js dependencies**:
```bash
cd wikijs-monitoring
npm install
```

4. **Create environment configuration**:
```bash
cp .env.example .env
nano .env  # Edit configuration values
```

5. **Create data directories**:
```bash
mkdir -p data/{logs,metrics,alerts,dashboard}
mkdir -p data/config
```

6. **Validate configuration**:
```bash
npm run config-check
```

7. **Start the monitoring system**:
```bash
npm start
```

### Method 2: Systemd Service Installation

1. **Complete direct installation steps above**

2. **Create systemd service**:
```bash
sudo npm run install-service
```

3. **Enable and start service**:
```bash
sudo systemctl enable wikijs-agent-monitor
sudo systemctl start wikijs-agent-monitor
```

4. **Verify service status**:
```bash
sudo systemctl status wikijs-agent-monitor
journalctl -u wikijs-agent-monitor -f
```

### Method 3: Docker Installation (Alternative)

1. **Create Dockerfile** (if not using direct installation):
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["npm", "start"]
```

2. **Build Docker image**:
```bash
docker build -t wikijs-monitor .
```

3. **Run container**:
```bash
docker run -d \
  --name wikijs-monitor \
  -p 3002:3002 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  --restart unless-stopped \
  wikijs-monitor
```

## Configuration

### Environment Variables

Create and edit the `.env` file with your specific configuration:

```bash
nano .env
```

**Essential Configuration**:

```bash
# Environment
NODE_ENV=production
DASHBOARD_PORT=3002

# WikiJS Agent
WIKIJS_AGENT_URL=http://localhost:3001/health

# Home Assistant (if available)
HA_ENABLED=true
HA_URL=http://192.168.1.155:8123
HA_TOKEN=your-long-lived-access-token

# Email Notifications (optional)
EMAIL_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Logging
LOG_LEVEL=INFO
LOG_FILE_ENABLED=true
LOG_CONSOLE_ENABLED=true
```

### Advanced Configuration Files

Create configuration files in `data/config/` for advanced customization:

1. **Health Monitor Configuration** (`data/config/health-monitor.json`):
```json
{
  "checkInterval": 30000,
  "healthChecks": {
    "wikijs_agent": {
      "enabled": true,
      "endpoint": "http://localhost:3001/health",
      "timeout": 5000,
      "critical": true,
      "interval": 30000
    }
  }
}
```

2. **Alert Manager Configuration** (`data/config/alert-manager.json`):
```json
{
  "notification_channels": {
    "email": {
      "enabled": false
    },
    "slack": {
      "enabled": false
    },
    "home_assistant": {
      "enabled": true
    }
  },
  "alert_rules": {
    "thresholds": {
      "cpu_usage": { "warning": 70, "critical": 85 },
      "memory_usage": { "warning": 75, "critical": 90 }
    }
  }
}
```

## Verification

### 1. Service Health Check

```bash
# Check if service is running
curl -f http://localhost:3002/health

# Expected response:
# {"status":"healthy","uptime":123,"timestamp":"2024-01-01T12:00:00.000Z"}
```

### 2. Dashboard Access

Open your web browser and navigate to:
- **Dashboard**: http://localhost:3002
- **API Status**: http://localhost:3002/api/v1/health/summary

### 3. Log Verification

```bash
# Check service logs
journalctl -u wikijs-agent-monitor -n 50

# Check application logs
tail -f data/logs/wikijs-agent-*.log
```

### 4. Alert System Test

Generate a test alert:
```bash
# This will test the alerting system
curl -X POST http://localhost:3002/api/v1/test/alert \
  -H "Content-Type: application/json" \
  -d '{"severity":"warning","message":"Test alert"}'
```

## Integration Setup

### Home Assistant Integration

1. **Create Long-lived Access Token**:
   - Go to Home Assistant → Profile → Long-lived Access Tokens
   - Create new token and copy it
   - Add to `.env` file as `HA_TOKEN=your-token`

2. **Configure Mobile Notifications**:
   - Install Home Assistant mobile app
   - Note your device notification service name
   - Set `HA_NOTIFICATION_SERVICE=notify.mobile_app_your_device`

3. **Verify Integration**:
```bash
# Test Home Assistant connection
curl -X GET \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  http://192.168.1.155:8123/api/states
```

### Email Integration

1. **Gmail Configuration** (example):
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use app password, not account password
```

2. **Test Email**:
```bash
# Send test email
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  auth: { user: 'your-email@gmail.com', pass: 'your-app-password' }
});
transporter.sendMail({
  from: 'your-email@gmail.com',
  to: 'recipient@example.com',
  subject: 'Test',
  text: 'Test email from WikiJS Monitor'
}).then(console.log).catch(console.error);
"
```

### Slack Integration

1. **Create Slack Webhook**:
   - Go to your Slack workspace
   - Add "Incoming Webhooks" app
   - Create webhook for desired channel
   - Copy webhook URL

2. **Configure Slack**:
```bash
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#alerts
```

3. **Test Slack**:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test message from WikiJS Monitor"}' \
  https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

## Firewall Configuration

If using a firewall, ensure the following ports are accessible:

```bash
# Ubuntu/Debian
sudo ufw allow 3002/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --reload
```

## Maintenance

### Log Rotation

Logs are automatically rotated. Manual cleanup:

```bash
# Clean old logs (older than 30 days)
find data/logs -name "*.log*" -mtime +30 -delete

# Clean old metrics (older than 7 days)
find data/metrics -name "*.json" -mtime +7 -delete
```

### Updates

To update the monitoring system:

```bash
# Stop service
sudo systemctl stop wikijs-agent-monitor

# Update dependencies
npm update

# Restart service
sudo systemctl start wikijs-agent-monitor
```

### Backup

Backup important data:

```bash
# Create backup
tar -czf wikijs-monitor-backup-$(date +%Y%m%d).tar.gz \
  data/config/ data/alerts/active-alerts.json .env

# Restore from backup
tar -xzf wikijs-monitor-backup-20240101.tar.gz
```

## Troubleshooting

### Common Issues

1. **Service won't start**:
```bash
# Check logs
journalctl -u wikijs-agent-monitor -n 100

# Check Node.js version
node --version  # Should be 16+

# Check permissions
ls -la data/
sudo chown -R $(whoami):$(whoami) data/
```

2. **Dashboard not accessible**:
```bash
# Check if service is listening
netstat -tlnp | grep 3002

# Check firewall
sudo ufw status
```

3. **WikiJS Agent not found**:
```bash
# Check WikiJS Agent is running
curl http://localhost:3001/health

# Check URL in configuration
grep WIKIJS_AGENT_URL .env
```

4. **Notifications not working**:
```bash
# Test notification configuration
npm run config-check

# Check notification logs
journalctl -u wikijs-agent-monitor | grep -i notification
```

### Debug Mode

Enable debug mode for troubleshooting:

```bash
# Set debug environment
export DEBUG=wikijs-monitor:*
export LOG_LEVEL=DEBUG

# Start in debug mode
npm run dev
```

### Performance Issues

If experiencing performance issues:

```bash
# Monitor resource usage
htop
iotop

# Check log file sizes
du -sh data/logs/

# Adjust configuration for lower resource usage
echo "METRICS_COLLECTION_INTERVAL=30000" >> .env
echo "LOG_LEVEL=WARN" >> .env
```

## Security Considerations

1. **File Permissions**:
```bash
# Secure configuration files
chmod 600 .env
chmod 600 data/config/*.json
```

2. **Network Security**:
   - Use HTTPS for external integrations
   - Consider using a reverse proxy (nginx) with SSL
   - Restrict dashboard access to trusted networks

3. **Credential Management**:
   - Use environment variables for sensitive data
   - Rotate tokens and passwords regularly
   - Use dedicated service accounts where possible

## Next Steps

After successful installation:

1. **Customize Dashboards**: Modify dashboard layouts and metrics
2. **Set Up Alerting Rules**: Create custom alert rules for your environment
3. **Configure Integrations**: Set up Prometheus/Grafana if needed
4. **Create Runbooks**: Document procedures for common alerts
5. **Schedule Maintenance**: Set up regular maintenance tasks

For additional help, refer to:
- [Configuration Guide](CONFIGURATION.md)
- [API Documentation](API.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
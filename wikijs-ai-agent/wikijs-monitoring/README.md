# WikiJS Agent Monitoring & Alerting System

A comprehensive monitoring and alerting infrastructure for the WikiJS agent that provides real-time visibility into system health, performance metrics, and operational issues with automated responses and notifications.

## 🚀 Features

### 🔍 Health Monitoring
- **Service Health Checks**: Monitor WikiJS agent, MCP servers, database connections, and file system access
- **Availability Monitoring**: Track uptime and response times for all critical components
- **Service Degradation Detection**: Identify partial service failures and performance issues
- **Automated Recovery**: Self-healing mechanisms for common issues

### 📊 Performance Metrics
- **System Resource Monitoring**: CPU, memory, disk I/O, and network utilization
- **Application Metrics**: Request rates, response times, error rates, and queue depths
- **Business Metrics**: Documents processed, upload success rates, and sync performance
- **Quality Metrics**: AI processing quality scores and enhancement success rates

### 🚨 Intelligent Alerting
- **Multi-channel Notifications**: Email, Slack, Home Assistant, and dashboard alerts
- **Smart Alert Correlation**: Intelligent grouping of related alerts to reduce noise
- **Escalation Policies**: Progressive alerting based on severity and duration
- **Alert Suppression**: Prevent alert storms with configurable suppression windows

### 📝 Structured Logging
- **Centralized Logging**: Aggregate logs from all components with structured format
- **Log Rotation & Retention**: Automatic log rotation with configurable retention policies
- **Real-time Log Analysis**: Pattern recognition and error trending
- **Multiple Outputs**: File, console, syslog, and Elasticsearch integration

### 📈 Real-time Dashboard
- **Live Monitoring**: Real-time system status and performance visualization
- **Interactive Charts**: Resource usage, performance metrics, and trend analysis
- **Alert Management**: View, acknowledge, and manage active alerts
- **Historical Analysis**: Long-term trend analysis and capacity planning

### 🔗 External Integrations
- **Home Assistant**: Native integration with home automation platform
- **Prometheus/Grafana**: Enterprise monitoring stack integration
- **Slack**: Team collaboration and alert notifications
- **Email**: Traditional email alerting with rich HTML templates

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Health        │    │   Metrics        │    │   Alert         │
│   Monitor       │───▶│   Collector      │───▶│   Manager       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                         ┌─────────────────┐
                         │   Structured    │
                         │   Logger        │
                         └─────────────────┘
                                  │
                         ┌─────────────────┐
                         │   Real-time     │
                         │   Dashboard     │
                         └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16.x or higher
- npm 8.x or higher
- WikiJS Agent running
- Optional: Home Assistant, Prometheus/Grafana stack

### Installation

1. **Clone or download the monitoring system**:
```bash
cd /home/dev/workspace
# Monitoring system is already created in wikijs-monitoring/
```

2. **Install dependencies**:
```bash
cd wikijs-monitoring
npm install
```

3. **Configure environment variables**:
```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

4. **Validate configuration**:
```bash
npm run config-check
```

5. **Start the monitoring system**:
```bash
npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `DASHBOARD_PORT` | `3002` | Dashboard web interface port |
| `LOG_LEVEL` | `INFO` | Logging level (ERROR/WARN/INFO/DEBUG/TRACE) |
| `EMAIL_ENABLED` | `false` | Enable email notifications |
| `SLACK_ENABLED` | `false` | Enable Slack notifications |
| `HA_ENABLED` | `true` | Enable Home Assistant integration |
| `WIKIJS_AGENT_URL` | `http://localhost:3001/health` | WikiJS agent health endpoint |
| `HA_URL` | `http://192.168.1.155:8123` | Home Assistant URL |
| `HA_TOKEN` | - | Home Assistant long-lived access token |

## 📊 Dashboard Access

Once started, access the monitoring dashboard at:

- **Main Dashboard**: http://localhost:3002
- **Health Status**: http://localhost:3002/api/v1/health/summary  
- **Metrics**: http://localhost:3002/api/v1/metrics/summary
- **Active Alerts**: http://localhost:3002/api/v1/alerts/active

## ⚙️ Configuration

### Health Checks

Configure which services to monitor:

```javascript
healthChecks: {
  wikijs_agent: {
    enabled: true,
    endpoint: 'http://localhost:3001/health',
    timeout: 5000,
    critical: true,
    interval: 30000
  },
  wikijs_mcp_server: {
    enabled: true,
    check: 'mcp_connection_test',
    timeout: 10000,
    critical: true,
    interval: 60000
  }
}
```

### Alert Thresholds

Set custom thresholds for alerting:

```javascript
thresholds: {
  cpu_usage: { warning: 70, critical: 85 },
  memory_usage: { warning: 75, critical: 90 },
  disk_space: { warning: 80, critical: 95 },
  response_time: { warning: 2000, critical: 5000 },
  error_rate: { warning: 2, critical: 5 }
}
```

### Notification Channels

Configure multiple notification channels:

```javascript
notification_channels: {
  email: {
    enabled: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    recipients: ['admin@homelab.local']
  },
  slack: {
    enabled: true,
    webhook_url: 'https://hooks.slack.com/...',
    channel: '#homelab-alerts'
  },
  home_assistant: {
    enabled: true,
    url: 'http://192.168.1.155:8123',
    notification_service: 'notify.mobile_app'
  }
}
```

## 🔧 Advanced Features

### Automated Recovery

The system includes automated recovery mechanisms:

- **High Memory Usage**: Automatic garbage collection and cache cleanup
- **Component Failures**: Automatic component restart with exponential backoff
- **Disk Space Issues**: Automatic log and metric file cleanup
- **Service Degradation**: Graceful degradation and load shedding

### Metric Collection

Comprehensive metrics collection:

```javascript
// Performance Metrics
- documents_per_minute
- processing_time_avg/p95/p99
- queue_depth
- error_rate

// Resource Metrics
- cpu_usage_percent
- memory_usage_bytes
- disk_io_rate
- network_io_rate

// Business Metrics
- documents_processed_total
- upload_success_rate
- quality_improvement_avg
- time_saved_estimation
```

### Custom Integrations

Extend the system with custom integrations:

```javascript
// Home Assistant Sensors
await createHomeAssistantSensors();

// Prometheus Metrics Export  
await setupPrometheusMetrics();

// Grafana Dashboard Creation
await createGrafanaDashboards();
```

## 📱 Mobile Integration

### Home Assistant Integration

The system integrates seamlessly with Home Assistant:

1. **Sensors**: System metrics exposed as HA sensors
2. **Notifications**: Push notifications to mobile devices
3. **Automations**: Trigger HA automations based on alerts
4. **Dashboard Cards**: Add monitoring cards to HA dashboard

### Mobile Notifications

Configure mobile push notifications:

```bash
# Set Home Assistant notification service
export HA_NOTIFICATION_SERVICE="notify.mobile_app_your_phone"

# Enable notifications
export HA_ENABLED=true
```

## 🛠️ Production Deployment

### Systemd Service

Create a systemd service for production deployment:

```bash
# Generate service file
npm run install-service

# Enable and start service
sudo systemctl enable wikijs-agent-monitor
sudo systemctl start wikijs-agent-monitor

# View logs
journalctl -u wikijs-agent-monitor -f
```

### Docker Deployment

Alternative Docker deployment:

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

### Environment-Specific Configuration

Use environment-specific configurations:

```bash
# Development
NODE_ENV=development npm run dev

# Production  
NODE_ENV=production npm start

# Testing
NODE_ENV=test npm test
```

## 📊 Monitoring Best Practices

### Alert Fatigue Prevention

- **Smart Correlation**: Group related alerts to reduce noise
- **Suppression Windows**: Prevent duplicate alerts within time windows
- **Severity-based Escalation**: Route alerts based on severity levels
- **Acknowledgment**: Allow manual acknowledgment to stop repeated notifications

### Performance Optimization

- **Metric Sampling**: Configure sampling rates for high-volume metrics
- **Buffer Management**: Batch metric collection and storage operations
- **Resource Monitoring**: Monitor the monitoring system's own resource usage
- **Data Retention**: Configure appropriate retention policies for metrics and logs

### Security Considerations

- **Token Management**: Securely store API tokens and credentials
- **Network Security**: Use HTTPS for all external communications
- **Access Control**: Implement proper access controls for dashboard
- **Audit Logging**: Log all administrative actions and configuration changes

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm test -- --coverage
```

### Test Categories

- **Unit Tests**: Test individual components and functions
- **Integration Tests**: Test component interactions and workflows
- **Load Tests**: Test system performance under load
- **Health Tests**: Verify monitoring system health

## 📚 API Reference

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| `/api/v1/health/summary` | GET | Health status summary |
| `/api/v1/metrics/summary` | GET | Metrics summary |
| `/api/v1/metrics/:type` | GET | Specific metric type data |
| `/api/v1/alerts/active` | GET | Active alerts |
| `/api/v1/alerts/history` | GET | Alert history |
| `/api/v1/alerts/:id/acknowledge` | POST | Acknowledge alert |
| `/api/v1/logs/recent` | GET | Recent log entries |
| `/api/v1/system/info` | GET | System information |

### WebSocket Events

Real-time events via Socket.IO:

- `dashboard-data`: Initial dashboard data
- `dashboard-update`: Periodic dashboard updates
- `health-update`: Health status changes
- `metrics-update`: New metric data
- `alert-update`: Alert status changes
- `log-entry`: New log entries

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Generate documentation
npm run docs
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

### Planned Features

- [ ] **Machine Learning**: Anomaly detection and predictive alerting
- [ ] **Multi-tenancy**: Support for multiple WikiJS instances
- [ ] **Custom Dashboards**: User-configurable dashboard layouts
- [ ] **Report Generation**: Automated performance and health reports
- [ ] **API Rate Limiting**: Protect against API abuse
- [ ] **User Management**: Role-based access control
- [ ] **Webhook Integration**: Generic webhook notifications
- [ ] **Mobile App**: Dedicated mobile monitoring application

### Performance Improvements

- [ ] **Metric Aggregation**: Reduce storage requirements with aggregation
- [ ] **Distributed Architecture**: Scale across multiple nodes  
- [ ] **Caching Layer**: Redis integration for improved performance
- [ ] **Database Optimization**: Optimize metric and log storage

## 📞 Support

- **Documentation**: [GitHub Wiki](https://github.com/homelab/wikijs-agent-monitoring/wiki)
- **Issues**: [GitHub Issues](https://github.com/homelab/wikijs-agent-monitoring/issues)
- **Discussions**: [GitHub Discussions](https://github.com/homelab/wikijs-agent-monitoring/discussions)

---

## 🔗 Related Projects

- [WikiJS](https://js.wiki/) - Modern wiki software
- [Home Assistant](https://www.home-assistant.io/) - Home automation platform
- [Prometheus](https://prometheus.io/) - Monitoring and alerting toolkit
- [Grafana](https://grafana.com/) - Visualization and analytics platform

---

**Made with ❤️ for the homelab community**
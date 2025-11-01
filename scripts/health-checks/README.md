# Health Checks and Validation System

This directory contains the comprehensive health check and validation system for the homelab-gitops-auditor deployment feature.

## Overview

The health check system provides pre and post-deployment validation for Home Assistant and system components, ensuring reliable and safe deployments.

## Components

### Core Files

- **`health-checker.js`** - Main HealthChecker class with all validation methods
- **`validator-test.js`** - Test script for individual health check methods
- **`complete-system-test.js`** - Comprehensive integration test
- **`README.md`** - This documentation file

### Key Features

1. **Pre-Deployment Health Checks**
   - System resource validation (CPU, memory, disk)
   - Home Assistant API connectivity
   - MCP server health validation
   - Network connectivity checks
   - Backup space verification

2. **Post-Deployment Health Checks**
   - Configuration integrity validation
   - Service availability verification
   - Performance metrics comparison
   - Log error analysis

3. **Configuration Validation**
   - YAML syntax validation
   - Home Assistant configuration checking
   - Security compliance validation
   - Cross-reference validation

## Usage

### Testing Health Checks

```bash
# Run basic health check tests
npm run test:health-checks

# Run complete system integration test
npm run test:health-complete

# Run individual components
node scripts/health-checks/validator-test.js
node scripts/health-checks/complete-system-test.js
```

### Integration with Deployment

The health checks are automatically integrated into the DeploymentOrchestrator:

```javascript
const { DeploymentOrchestrator } = require('./api/services/deployment-orchestrator');

const orchestrator = new DeploymentOrchestrator({
  healthChecksEnabled: true,  // Enable health checks
  rollbackEnabled: true       // Enable rollback on health failures
});

await orchestrator.initialize();
await orchestrator.deployConfiguration(deploymentConfig);
```

### Manual Health Check Usage

```javascript
const { HealthChecker } = require('./scripts/health-checks/health-checker');

const healthChecker = new HealthChecker();
await healthChecker.initialize();

// Run pre-deployment checks
const preReport = await healthChecker.performPreDeploymentChecks();

// Run post-deployment checks
const postReport = await healthChecker.performPostDeploymentChecks();

// Validate specific configuration
const validation = await healthChecker.validateConfiguration('/config/path');
```

## Health Check Types

### System Health Checks

- **Disk Usage**: Monitors disk space usage and warns at configurable thresholds
- **Memory Usage**: Tracks memory consumption and alerts on high usage
- **CPU Usage**: Monitors CPU utilization and performance
- **Network Connectivity**: Validates external network access

### Home Assistant Checks

- **API Health**: Tests Home Assistant API responsiveness
- **Configuration Integrity**: Validates YAML syntax and structure
- **Service Availability**: Checks core Home Assistant services
- **Performance Metrics**: Monitors API response times

### MCP Server Validation

- **Connection Health**: Validates MCP server connectivity
- **Service Status**: Checks individual MCP service health
- **Response Times**: Monitors MCP service performance

### Security Validation

- **Credential Scanning**: Detects hardcoded passwords/tokens
- **Protocol Validation**: Ensures secure communication protocols
- **Configuration Security**: Validates security best practices

## Configuration

### Environment Variables

```bash
# Home Assistant Configuration
HOME_ASSISTANT_URL=http://192.168.1.155:8123/api
HOME_ASSISTANT_TOKEN=your_ha_token_here

# Health Check Thresholds
HEALTH_DISK_THRESHOLD=85
HEALTH_MEMORY_THRESHOLD=90
HEALTH_CPU_THRESHOLD=95
HEALTH_RESPONSE_THRESHOLD=2000
```

### Configuration Options

```javascript
const config = {
  deployment: {
    homeAssistantConfig: {
      healthCheckEndpoint: 'http://192.168.1.155:8123/api',
      token: process.env.HOME_ASSISTANT_TOKEN
    }
  },
  thresholds: {
    diskUsage: 85,      // Percentage
    memoryUsage: 90,    // Percentage
    cpuUsage: 95,       // Percentage
    responseTime: 2000  // Milliseconds
  },
  monitoring: {
    retries: 3,
    timeout: 10000
  }
};
```

## Health Check Flow

### Pre-Deployment Process

1. **System Resource Check** - Validate adequate resources
2. **Home Assistant API Check** - Ensure API is responding
3. **MCP Server Health** - Verify all MCP services
4. **Network Connectivity** - Test external connections
5. **Backup Space Check** - Ensure sufficient backup storage

### Post-Deployment Process

1. **Configuration Integrity** - Validate deployed configuration
2. **Service Availability** - Confirm services are running
3. **Performance Metrics** - Compare response times
4. **Health Comparison** - Compare pre/post deployment health
5. **Log Error Analysis** - Check for deployment errors

## Event System

The health checker integrates with the deployment orchestrator's event system:

```javascript
orchestrator.on('deployment:health-check', (deployment, phase, report) => {
  console.log(`Health check ${phase}: ${report.overall.healthy ? 'PASSED' : 'FAILED'}`);
});

orchestrator.on('deployment:health-degradation', (deployment, comparison) => {
  console.log('Health degradation detected:', comparison.changes);
});

orchestrator.on('deployment:health-improvement', (deployment, comparison) => {
  console.log('Health improvements detected:', comparison.changes);
});
```

## Error Handling

### Health Check Failures

- **Pre-deployment failures**: Prevent deployment from starting
- **Post-deployment failures**: Trigger automatic rollback (if enabled)
- **Validation failures**: Provide detailed error messages

### Rollback Integration

When health checks fail post-deployment, the system can automatically trigger rollback:

```javascript
const orchestrator = new DeploymentOrchestrator({
  healthChecksEnabled: true,
  rollbackEnabled: true  // Enable automatic rollback
});
```

## Dependencies

The health check system requires these npm packages:

```json
{
  "dependencies": {
    "axios": "^1.6.2",
    "js-yaml": "^4.1.0"
  }
}
```

## Testing

### Test Coverage

- ✅ Individual health check methods
- ✅ Configuration validation
- ✅ Integration with deployment orchestrator
- ✅ Error scenario handling
- ✅ Event system integration

### Running Tests

```bash
# Install dependencies first
cd api && npm install

# Run health check tests
npm run test:health-checks

# Run complete integration test
npm run test:health-complete
```

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   ```bash
   cd api && npm install axios js-yaml
   ```

2. **Home Assistant Connection Errors**
   - Verify `HOME_ASSISTANT_URL` is correct
   - Check `HOME_ASSISTANT_TOKEN` is valid
   - Ensure network connectivity to HA instance

3. **MCP Server Health Failures**
   - Check MCP server configurations
   - Verify MCP coordinator initialization
   - Review MCP wrapper scripts

### Debug Mode

Enable detailed logging for debugging:

```javascript
const healthChecker = new HealthChecker();
healthChecker.logger.setLevel('debug');
```

## Future Enhancements

- [ ] Prometheus metrics integration
- [ ] Grafana dashboard for health metrics
- [ ] Email/Slack notifications for health failures
- [ ] Historical health trend analysis
- [ ] Custom health check plugins
- [ ] Integration with external monitoring systems

## Contributing

When adding new health checks:

1. Follow the existing pattern in `health-checker.js`
2. Add appropriate tests in the test files
3. Update this documentation
4. Ensure error handling is comprehensive
5. Add configuration options as needed

## License

This health check system is part of the homelab-gitops-auditor project and follows the same license terms.
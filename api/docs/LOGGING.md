# Webhook System Logging and Error Handling

## Overview

The webhook system implements comprehensive logging and error handling to provide observability, debugging capabilities, and operational insights. The system uses structured logging with JSON format and categorized error handling.

## Architecture

### Components

1. **Logger (`utils/logger.js`)**
   - Structured JSON logging
   - Component-specific loggers
   - Log rotation and retention
   - Performance and webhook-specific logging methods

2. **Error Handler (`utils/errorHandler.js`)**
   - Typed error classes
   - Context-aware error handling
   - Retry strategy determination
   - Error statistics and health monitoring

3. **Logging Configuration (`config/logging.js`)**
   - Centralized logging configuration
   - Component-specific settings
   - Express middleware for request logging
   - System startup/shutdown logging

## Log Levels

- **error**: System errors, failures, critical issues
- **warn**: Warnings, degraded performance, non-critical issues
- **info**: General information, successful operations
- **debug**: Detailed debugging information
- **trace**: Very detailed execution traces

## Error Types

### WebhookError
- Generic webhook processing errors
- Used for signature verification failures, payload issues

### GitHubAPIError
- GitHub API communication errors
- Includes status codes and retry strategies

### ValidationError
- Input validation failures
- Not retryable

### ConfigurationError
- Missing or invalid configuration
- Not retryable

### RateLimitError
- Rate limiting violations
- Retryable with delay

### TimeoutError
- Operation timeouts
- Retryable

## Log Structure

All logs follow a structured JSON format:

```json
{
  "timestamp": "2025-01-10T10:30:00.000Z",
  "level": "info",
  "component": "webhook-handler",
  "message": "Webhook processed successfully",
  "pid": 12345,
  "event": "push",
  "deliveryId": "abc123",
  "repository": "owner/repo",
  "processingTime": 150,
  "success": true
}
```

## Configuration

### Environment Variables

```bash
# Global logging
LOG_LEVEL=info                    # Global log level
LOG_DIR=/path/to/logs            # Log directory
LOG_FORMAT=json                  # json or text
LOG_CONSOLE=true                 # Enable console output
LOG_MAX_FILE_SIZE=10485760       # 10MB max file size
LOG_MAX_FILES=5                  # Number of rotated files

# Component-specific levels
WEBHOOK_LOG_LEVEL=info
WEBHOOK_HANDLER_LOG_LEVEL=info
WEBHOOK_MONITOR_LOG_LEVEL=info
WEBHOOK_SETUP_LOG_LEVEL=info
WEBHOOK_PROCESSOR_LOG_LEVEL=info
GITHUB_SERVICE_LOG_LEVEL=info
WEBHOOK_CONFIG_LOG_LEVEL=info
```

### Configuration File

```javascript
const { getComponentLogger } = require('./config/logging');

// Get component-specific logger
const logger = getComponentLogger('my-component');

// Use structured logging
await logger.info('Operation completed', {
  operation: 'webhook_setup',
  repository: 'owner/repo',
  duration: 150
});
```

## Log Files

### File Organization

```
logs/
├── webhook-system-info.log           # System-wide info logs
├── webhook-system-error.log          # System-wide error logs
├── enhanced-webhook-handler-info.log # Handler info logs
├── enhanced-webhook-handler-error.log# Handler error logs
├── webhook-monitor-info.log          # Monitor logs
├── automated-webhook-setup-info.log  # Setup logs
├── webhook-event-processor-info.log  # Processor logs
├── github-service-info.log           # GitHub API logs
└── webhook-config-info.log           # Configuration logs
```

### Log Rotation

- Files are rotated when they exceed the configured size limit
- Old files are numbered (.1, .2, etc.)
- Configurable retention policy (default: 5 files)

## Specialized Logging Methods

### Webhook Logging

```javascript
// Log webhook received
await logger.logWebhookReceived(event, deliveryId, repository, headers);

// Log webhook processed
await logger.logWebhookProcessed(event, deliveryId, repository, processingTime, success, error);

// Log webhook retry
await logger.logWebhookRetry(event, deliveryId, repository, attempt, maxAttempts, nextRetryDelay);

// Log permanent failure
await logger.logWebhookPermanentFailure(event, deliveryId, repository, attempts, error);
```

### Service Error Logging

```javascript
// Log service errors with context
await logger.logServiceError('github-api', 'createWebhook', error, { repository, webhookId });
```

### Performance Metrics

```javascript
// Log performance metrics
await logger.logPerformanceMetric('webhook_processing', duration, success, { event, repository });
```

### Alert Logging

```javascript
// Log alerts
await logger.logAlert('high_failure_rate', 'critical', 'Webhook failure rate exceeded threshold', { 
  failureRate: 15, 
  threshold: 10 
});
```

## Error Handling Usage

### Basic Error Handling

```javascript
const { errorHandler, createWebhookError } = require('./utils/errorHandler');

try {
  // Some operation
  await processWebhook();
} catch (error) {
  const handledError = await errorHandler.handleError(error, context);
  
  if (handledError.shouldRetry) {
    // Schedule retry
    setTimeout(() => retry(), handledError.retryAfter || 1000);
  }
}
```

### Creating Specific Errors

```javascript
const { 
  createWebhookError, 
  createGitHubAPIError, 
  createValidationError 
} = require('./utils/errorHandler');

// Webhook error
throw createWebhookError('Invalid signature', 'INVALID_SIGNATURE', { deliveryId });

// GitHub API error
throw createGitHubAPIError('Repository not found', 404, response, { repository });

// Validation error
throw createValidationError('Missing required field', 'event', null, { deliveryId });
```

### Express Error Handling

```javascript
const { errorHandler } = require('./utils/errorHandler');

// Use the error handling middleware
app.use(errorHandler.createExpressErrorHandler());
```

## Monitoring and Health Checks

### Health Endpoints

- `GET /api/health` - Overall system health including logging
- `GET /api/health/logging` - Detailed logging system health
- `GET /api/health/errors` - Error handler statistics
- `POST /api/health/errors/reset` - Reset error statistics
- `GET /api/health/metrics` - System performance metrics

### Health Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-01-10T10:30:00.000Z",
  "services": {
    "logging": "healthy",
    "errorHandler": "healthy"
  },
  "checks": {
    "logging": {
      "status": "healthy",
      "totalLoggers": 7,
      "components": {
        "webhook-handler": {
          "status": "healthy",
          "logFiles": 2,
          "totalSize": 1048576
        }
      }
    }
  }
}
```

## Best Practices

### Logging

1. **Use Appropriate Log Levels**
   - `error` for actual errors requiring attention
   - `warn` for degraded performance or recoverable issues
   - `info` for normal operations and milestones
   - `debug` for debugging information
   - `trace` for very detailed execution traces

2. **Include Context**
   - Always include relevant identifiers (deliveryId, repository, etc.)
   - Add timing information for performance tracking
   - Include error context for debugging

3. **Structure Your Logs**
   - Use consistent field names across components
   - Include metadata that aids in filtering and searching
   - Follow the established JSON schema

### Error Handling

1. **Use Specific Error Types**
   - Choose the most appropriate error type
   - Include relevant context in error creation
   - Provide meaningful error messages

2. **Handle Errors at the Right Level**
   - Let specific handlers deal with their error types
   - Use the generic handler as a fallback
   - Always log errors with appropriate context

3. **Implement Proper Retry Logic**
   - Check if errors are retryable
   - Use exponential backoff for retries
   - Implement circuit breaker patterns for repeated failures

## Development and Debugging

### Local Development

```bash
# Enable debug logging
export LOG_LEVEL=debug
export WEBHOOK_HANDLER_LOG_LEVEL=trace

# Start the application
npm start
```

### Log Analysis

```bash
# Follow logs in real-time
tail -f logs/webhook-system-info.log | jq .

# Filter specific events
grep "webhook_processed" logs/enhanced-webhook-handler-info.log | jq .

# Check error patterns
grep "error" logs/*.log | jq .errorType | sort | uniq -c
```

### Performance Monitoring

```bash
# Monitor webhook processing times
grep "processingTime" logs/enhanced-webhook-handler-info.log | jq .processingTime | awk '{sum+=$1; count++} END {print "Average:", sum/count}'

# Check error rates
grep "success.*false" logs/enhanced-webhook-handler-info.log | wc -l
```

## Integration with External Systems

### Log Aggregation

The JSON structured logs can be easily ingested by:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Prometheus + Grafana**
- **Fluentd + OpenSearch**
- **CloudWatch Logs**
- **Datadog**

### Alerting

Set up alerts based on:

- Error rate thresholds
- Performance degradation
- Webhook processing failures
- Service unavailability

Example Prometheus alert:

```yaml
- alert: HighWebhookErrorRate
  expr: rate(webhook_errors_total[5m]) > 0.1
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "High webhook error rate detected"
```

## Troubleshooting

### Common Issues

1. **Logs Not Appearing**
   - Check log directory permissions
   - Verify LOG_DIR environment variable
   - Check disk space

2. **High Error Rates**
   - Check error statistics endpoint
   - Review recent error logs
   - Verify external service connectivity

3. **Performance Issues**
   - Monitor processing times in logs
   - Check system metrics
   - Review error handler statistics

### Debug Commands

```bash
# Check logging health
curl http://localhost:3070/api/health/logging

# Get error statistics
curl http://localhost:3070/api/health/errors

# Reset error stats
curl -X POST http://localhost:3070/api/health/errors/reset

# Get system metrics
curl http://localhost:3070/api/health/metrics
```
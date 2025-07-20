# Performance Testing Implementation

This directory contains comprehensive performance tests for the homelab-gitops-auditor automated deployment system.

## Overview

The performance test suite validates response times, throughput, resource usage, and scalability under various load conditions including:

- **Load Testing**: Normal expected load scenarios
- **Stress Testing**: System behavior under extreme conditions  
- **Spike Testing**: Sudden load increases
- **Volume Testing**: Large data processing
- **Endurance Testing**: Long-running performance validation
- **Scalability Testing**: System scaling characteristics

## Directory Structure

```
tests/performance/
├── jest.config.js              # Jest configuration for performance tests
├── setup/                      # Test setup and teardown
│   ├── jest-setup.js           # Jest environment setup
│   ├── global-setup.js         # Global test setup
│   └── global-teardown.js      # Global test teardown
├── utils/                      # Performance testing utilities
│   ├── load-generator.js       # Load generation and HTTP testing
│   ├── performance-monitor.js  # System resource monitoring
│   ├── metrics-collector.js    # Metrics collection and storage
│   └── report-generator.js     # Performance report generation
├── load/                       # Load testing scenarios
│   ├── api-load.test.js        # API endpoint load tests
│   └── webhook-load.test.js    # Webhook processing load tests
├── stress/                     # Stress testing scenarios
│   └── system-stress.test.js   # System stress and breaking point tests
├── spike/                      # Spike testing scenarios
├── volume/                     # Volume testing scenarios
├── endurance/                  # Endurance testing scenarios
├── scalability/                # Scalability testing scenarios
├── benchmarks/                 # Performance benchmarks
├── results/                    # Test results storage
├── reports/                    # Generated performance reports
└── logs/                       # Performance test logs
```

## Performance Metrics

The test suite monitors and reports on:

### Response Time Metrics
- Average response time
- Median response time
- 95th percentile (P95) response time
- 99th percentile (P99) response time
- Min/Max response times

### Throughput Metrics
- Requests per second (RPS)
- Successful requests per second
- Total requests processed
- Concurrent request handling

### Reliability Metrics
- Error rate percentage
- Success rate percentage
- Timeout rate
- Connection errors
- HTTP status code distribution

### Resource Usage Metrics
- CPU utilization (average, peak)
- Memory usage (average, peak, leak detection)
- Disk usage and I/O
- Network throughput
- Database connections and query performance

### Performance Scores
- Overall performance score (0-100)
- Performance trend analysis
- Threshold violation detection
- Regression detection

## Running Performance Tests

### Prerequisites

1. Ensure test environment is running:
   ```bash
   npm run test:env:start
   ```

2. Verify system health:
   ```bash
   curl -f http://localhost:3000/health
   ```

### Running All Performance Tests

```bash
# Run complete performance test suite
npm run test:performance

# Run with coverage
npm run test:performance:coverage

# Run in watch mode
npm run test:performance:watch
```

### Running Specific Test Categories

```bash
# Load testing
npm run test:performance:load

# Stress testing  
npm run test:performance:stress

# Spike testing
npm run test:performance:spike

# Volume testing
npm run test:performance:volume

# Endurance testing
npm run test:performance:endurance

# Scalability testing
npm run test:performance:scalability
```

### Running Individual Test Files

```bash
# API load tests
npm run test:performance:api

# Webhook load tests
npm run test:performance:webhook

# System stress tests
npm run test:performance:system-stress

# Performance benchmarks
npm run test:performance:benchmark
```

### Performance Monitoring

```bash
# Generate performance report from previous results
npm run test:performance:report

# Start real-time performance monitoring
npm run test:performance:monitor
```

## Test Configuration

### Global Configuration

Performance tests use configuration from `tests/performance/setup/jest-setup.js`:

```javascript
global.PERFORMANCE_TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  testDuration: 60000,        // 1 minute default
  warmupDuration: 10000,      // 10 seconds warmup
  cooldownDuration: 5000,     // 5 seconds cooldown
  metricsInterval: 1000,      // 1 second metrics collection
  thresholds: {
    responseTime: {
      average: 500,           // 500ms average response time
      p95: 1000,             // 1 second 95th percentile
      p99: 2000              // 2 seconds 99th percentile
    },
    throughput: {
      minimum: 10             // 10 requests per second minimum
    },
    errorRate: {
      maximum: 0.05           // 5% maximum error rate
    },
    resources: {
      cpu: { maximum: 80 },   // 80% maximum CPU usage
      memory: { maximum: 90 }, // 90% maximum memory usage
      disk: { maximum: 95 }   // 95% maximum disk usage
    }
  }
};
```

### Test-Specific Configuration

Individual tests can override global configuration:

```javascript
const testConfig = {
  testName: 'api-load-test',
  endpoint: '/api/deployments/status',
  method: 'GET',
  concurrency: 20,
  duration: 120000,
  rampUpTime: 15000,
  expectedResponseTime: 300,
  expectedThroughput: 50
};
```

## Performance Thresholds

### Response Time Thresholds
- **Excellent**: < 100ms average
- **Good**: < 300ms average  
- **Acceptable**: < 500ms average
- **Poor**: > 500ms average

### Throughput Thresholds
- **API Endpoints**: > 50 RPS
- **Webhooks**: > 30 RPS
- **Authentication**: > 20 RPS
- **Database Queries**: > 100 RPS

### Error Rate Thresholds
- **Critical Services**: < 0.1% error rate
- **Standard Services**: < 1% error rate
- **Acceptable**: < 5% error rate

### Resource Usage Thresholds
- **CPU**: < 80% sustained usage
- **Memory**: < 90% peak usage
- **Disk**: < 95% usage
- **Database Connections**: < 80% of pool

## Load Testing Scenarios

### API Load Tests (`tests/performance/load/api-load.test.js`)

Tests normal and peak load conditions for:
- Deployment status endpoints
- Deployment history queries
- Deployment metrics retrieval
- Dashboard overview
- System health checks
- Authentication and authorization

### Webhook Load Tests (`tests/performance/load/webhook-load.test.js`)

Tests webhook processing under:
- Normal webhook traffic
- Signature validation load
- Event type variations
- Spam protection
- Queue processing
- Error handling scenarios

## Stress Testing Scenarios

### System Stress Tests (`tests/performance/stress/system-stress.test.js`)

Tests system behavior under:
- Extreme concurrency (100+ concurrent requests)
- Memory exhaustion scenarios
- CPU saturation conditions
- Database connection exhaustion
- Disk space exhaustion
- Network saturation
- Breaking point identification
- Recovery and resilience testing

## Performance Monitoring

### Real-time Monitoring

The `PerformanceMonitor` class provides:
- CPU usage tracking
- Memory usage monitoring
- Disk I/O monitoring
- Network statistics
- Database metrics
- Anomaly detection
- Resource leak detection

### Metrics Collection

The `MetricsCollector` class:
- Stores performance results
- Tracks test history
- Calculates performance trends
- Generates recommendations
- Provides regression detection

## Report Generation

### Performance Reports

The `ReportGenerator` creates:
- JSON detailed reports
- HTML visual reports
- Performance summaries
- Trend analysis
- Bottleneck identification
- Optimization recommendations

### Report Types

1. **Summary Reports**: High-level performance overview
2. **Detailed Reports**: Complete metrics and analysis
3. **Trend Reports**: Performance changes over time
4. **Comparison Reports**: Cross-test performance comparison
5. **Regression Reports**: Performance degradation detection

## Performance Optimization

### Identified Performance Bottlenecks

Common bottlenecks and solutions:

1. **Database Query Performance**
   - Add query optimization
   - Implement connection pooling
   - Add database indexing

2. **Memory Usage**
   - Implement proper garbage collection
   - Fix memory leaks
   - Optimize data structures

3. **CPU Utilization**
   - Profile CPU-intensive operations
   - Implement caching
   - Optimize algorithms

4. **I/O Operations**
   - Implement async processing
   - Add file system caching
   - Optimize disk operations

### Performance Recommendations

Based on test results, the system provides:
- Specific optimization suggestions
- Resource allocation recommendations
- Scaling guidance
- Configuration tuning advice

## Continuous Performance Testing

### CI/CD Integration

Performance tests integrate with CI/CD pipelines:

```bash
# Run performance tests in CI
npm run test:performance:ci

# Generate performance report
npm run test:performance:report

# Performance regression detection
npm run test:performance:regression
```

### Performance Baselines

The system maintains performance baselines for:
- Response time benchmarks
- Throughput capacity
- Resource usage patterns
- Error rate thresholds

## Troubleshooting

### Common Issues

1. **Test Environment Setup**
   - Ensure test database is running
   - Verify test server is responsive
   - Check test data initialization

2. **Performance Test Failures**
   - Review resource usage limits
   - Check test configuration
   - Verify system capacity

3. **Metric Collection Issues**
   - Check monitoring permissions
   - Verify metric storage
   - Review log files

### Debug Commands

```bash
# Check test environment status
npm run test:env:status

# Verify system health
curl -f http://localhost:3000/health

# Review performance logs
cat tests/performance/logs/performance.log

# Check test results
ls -la tests/performance/results/
```

## Best Practices

### Test Design
- Use realistic load patterns
- Include proper warm-up periods
- Test edge cases and error conditions
- Monitor resource usage continuously

### Performance Monitoring
- Set appropriate thresholds
- Monitor trends over time
- Detect regressions early
- Generate actionable reports

### System Optimization
- Profile before optimizing
- Measure improvement impact
- Document optimization changes
- Validate with performance tests

## References

- [Jest Performance Testing](https://jestjs.io/docs/performance)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Express.js Performance](https://expressjs.com/en/advanced/best-practice-performance.html)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
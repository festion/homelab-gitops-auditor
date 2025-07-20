# Integration Tests

This directory contains comprehensive integration tests for the homelab-gitops-auditor automated deployment system. These tests verify component interactions, API endpoints, database operations, and MCP server integrations.

## Overview

Integration tests validate the complete system behavior by testing:

- **API Endpoints**: REST API contract testing with real HTTP requests
- **Database Operations**: Data persistence and retrieval with actual database connections
- **MCP Server Integration**: Real MCP server communication and file operations
- **Service Interactions**: Cross-service communication and workflows
- **End-to-End Workflows**: Complete deployment and rollback processes

## Test Structure

```
tests/integration/
├── api/                    # API endpoint integration tests
│   ├── deployment-endpoints.test.js
│   ├── webhook-endpoints.test.js
│   └── health-endpoints.test.js
├── database/              # Database integration tests
│   ├── deployment-repository.test.js
│   ├── audit-repository.test.js
│   └── migrations.test.js
├── mcp/                   # MCP server integration tests
│   ├── mcp-coordinator-integration.test.js
│   ├── network-fs-integration.test.js
│   └── github-integration.test.js
├── services/              # Service interaction tests
│   ├── deployment-service-integration.test.js
│   ├── backup-service-integration.test.js
│   └── health-service-integration.test.js
├── workflows/             # End-to-end workflow tests
│   ├── complete-deployment-workflow.test.js
│   ├── rollback-workflow.test.js
│   └── webhook-deployment-workflow.test.js
├── fixtures/              # Test data and fixtures
│   ├── integration-data.js
│   ├── api-responses.js
│   └── webhook-payloads.js
├── setup/                 # Test environment setup
│   ├── test-environment.js
│   ├── database-setup.js
│   ├── jest-setup.js
│   ├── global-setup.js
│   └── global-teardown.js
├── scripts/               # Test environment management
│   ├── start-test-environment.js
│   └── stop-test-environment.js
└── jest.config.js         # Jest configuration
```

## Prerequisites

### Required Services

1. **PostgreSQL Database**
   ```bash
   # Default connection settings
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   ```

2. **MCP Servers**
   - Network-FS MCP server (`/home/dev/workspace/network-mcp-wrapper.sh`)
   - GitHub MCP server (`/home/dev/workspace/github-wrapper.sh`)

3. **Node.js Dependencies**
   ```bash
   npm install
   ```

### Environment Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   ```bash
   export NODE_ENV=test
   export POSTGRES_HOST=localhost
   export POSTGRES_PORT=5432
   export POSTGRES_USER=postgres
   export POSTGRES_PASSWORD=postgres
   ```

3. **Verify MCP Servers**
   ```bash
   ls -la /home/dev/workspace/*-mcp-wrapper.sh
   ```

## Running Tests

### Quick Start

```bash
# Run all integration tests
npm run test:integration

# Run with verbose output
npm run test:integration:verbose

# Run with coverage
npm run test:integration:coverage

# Watch mode for development
npm run test:integration:watch
```

### Test Environment Management

```bash
# Start test environment
npm run test:env:start

# Stop test environment  
npm run test:env:stop

# Reset test environment
npm run test:env:reset
```

### Specific Test Suites

```bash
# API endpoint tests only
npm run test:integration -- tests/integration/api/

# Database tests only
npm run test:integration -- tests/integration/database/

# MCP integration tests only
npm run test:integration -- tests/integration/mcp/

# Workflow tests only
npm run test:integration -- tests/integration/workflows/
```

### Individual Test Files

```bash
# Run specific test file
npm run test:integration -- tests/integration/api/deployment-endpoints.test.js

# Run specific test with pattern
npm run test:integration -- --testNamePattern="should create deployment"
```

## Test Categories

### 1. API Endpoints (`/api/`)

Tests HTTP API endpoints with real requests and responses:

- **Authentication & Authorization**: Token validation, role-based access
- **Request Validation**: Input validation, error handling
- **Response Format**: Consistent API response structure
- **Concurrent Requests**: Race condition handling
- **Error Scenarios**: Graceful error handling

**Example Test:**
```javascript
it('should create deployment with valid request', async () => {
  const response = await request(app)
    .post('/api/deployments/home-assistant-config/deploy')
    .set('Authorization', `Bearer ${authToken}`)
    .send(deploymentRequest)
    .expect(201);

  expect(response.body.data.deploymentId).toMatch(/^deploy-\d{8}-\d{6}$/);
});
```

### 2. Database Integration (`/database/`)

Tests database operations with real PostgreSQL connections:

- **CRUD Operations**: Create, read, update, delete operations
- **Transactions**: Multi-step database transactions
- **Constraints**: Foreign key and unique constraints
- **Migrations**: Database schema changes
- **Concurrent Access**: Race condition handling

**Example Test:**
```javascript
it('should create deployment record', async () => {
  const deployment = await deploymentRepository.create(deploymentData);
  
  expect(deployment.deploymentId).toBe(deploymentData.deploymentId);
  expect(deployment.state).toBe('queued');
});
```

### 3. MCP Server Integration (`/mcp/`)

Tests MCP server communication and operations:

- **Connection Management**: Server connectivity and health
- **File Operations**: Read, write, transfer, backup operations
- **GitHub Integration**: Repository cloning, file access
- **Error Handling**: Network failures, timeouts
- **Concurrent Operations**: Multiple simultaneous requests

**Example Test:**
```javascript
it('should transfer file using MCP', async () => {
  const result = await mcpCoordinator.transferFile(sourceFile, targetFile);
  
  expect(result.success).toBe(true);
  expect(result.sourceSize).toBe(result.targetSize);
});
```

### 4. Service Interactions (`/services/`)

Tests service layer integration and business logic:

- **Deployment Service**: End-to-end deployment workflows
- **Event Bus**: Inter-service communication
- **Retry Logic**: Failure recovery mechanisms
- **State Management**: Deployment state transitions
- **Configuration Validation**: Home Assistant config validation

**Example Test:**
```javascript
it('should execute complete deployment workflow', async () => {
  const deployment = await deploymentService.createDeployment(request);
  const result = await deploymentService.executeDeployment(deployment.deploymentId);
  
  expect(result.success).toBe(true);
  expect(result.steps).toHaveLength(5);
});
```

### 5. End-to-End Workflows (`/workflows/`)

Tests complete user workflows from API to completion:

- **Deployment Workflows**: Full deployment lifecycle
- **Webhook Processing**: GitHub webhook triggered deployments
- **Rollback Workflows**: Complete rollback processes
- **Error Recovery**: Failure handling and recovery
- **Concurrent Operations**: Multiple simultaneous workflows

**Example Test:**
```javascript
it('should execute complete deployment from API request to completion', async () => {
  // Create deployment via API
  const createResponse = await request(app)
    .post('/api/deployments/home-assistant-config/deploy')
    .send(deploymentRequest);

  // Monitor progress until completion
  // ... polling logic ...

  // Verify final state
  expect(finalState).toBe('completed');
});
```

## Test Environment

### Isolated Test Environment

Each test run uses:

- **Isolated Database**: Unique test database per run
- **Clean File System**: Temporary directories cleaned between tests
- **Fresh MCP Connections**: New MCP server instances
- **Independent Processes**: No shared state between tests

### Test Data Management

- **Fixtures**: Consistent test data across tests
- **Database Seeding**: Predictable initial state
- **Cleanup Procedures**: Automatic cleanup after tests
- **Isolation**: No test interference

### Mock vs Real Services

- **Real Services**: PostgreSQL, MCP servers, HTTP endpoints
- **Mocked External**: GitHub API rate limiting, network timeouts
- **Configurable**: Test vs production service endpoints

## Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  testTimeout: 60000,        // 60 second timeout
  maxWorkers: 1,             // Serial execution
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup/jest-setup.js'],
  globalSetup: '<rootDir>/tests/integration/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/integration/setup/global-teardown.js'
};
```

### Environment Variables

```bash
# Test Environment
NODE_ENV=test
VERBOSE_TESTS=false          # Set to true for detailed logging

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# MCP Servers
MCP_TEST_MODE=true          # Enables test mode for MCP servers

# Cleanup
CLEANUP_TEMPLATE_DB=false   # Set to true to remove template database
```

## Custom Jest Matchers

The test suite includes custom Jest matchers for common validations:

```javascript
// Deployment ID format validation
expect(deploymentId).toBeValidDeploymentId();

// Array sorting validation
expect(deployments).toBeSortedBy('createdAt', 'desc');

// Recent timestamp validation
expect(timestamp).toBeRecentTimestamp();

// One of multiple values
expect(state).oneOf(['queued', 'in-progress', 'completed']);
```

## Debugging

### Verbose Logging

```bash
# Enable verbose test output
VERBOSE_TESTS=true npm run test:integration

# Enable Jest verbose mode
npm run test:integration -- --verbose
```

### Individual Test Debugging

```bash
# Run single test with full output
npm run test:integration -- --testNamePattern="specific test name" --verbose

# Debug specific test file
node --inspect-brk node_modules/.bin/jest tests/integration/api/deployment-endpoints.test.js
```

### Test Environment State

```bash
# Check running processes
ps aux | grep -E "(jest|node.*test|mcp-wrapper)"

# Check test databases
psql -c "SELECT datname FROM pg_database WHERE datname LIKE 'homelab_gitops_test_%'"

# Check test directories
ls -la /tmp/integration-test-*
```

## Common Issues

### Database Connection Issues

```bash
# Check PostgreSQL status
systemctl status postgresql

# Test database connection
psql -h localhost -U postgres -c "SELECT version();"

# Check port availability
netstat -tln | grep 5432
```

### MCP Server Issues

```bash
# Check MCP wrapper scripts
ls -la /home/dev/workspace/*-mcp-wrapper.sh

# Test MCP server manually
bash /home/dev/workspace/network-mcp-wrapper.sh

# Check MCP server logs
tail -f /tmp/mcp-server.log
```

### Test Timeout Issues

```bash
# Increase Jest timeout
JEST_TIMEOUT=120000 npm run test:integration

# Check for hanging processes
ps aux | grep -E "(jest|node.*test)"
```

### File Permission Issues

```bash
# Fix test directory permissions
chmod -R 755 /tmp/integration-test-*

# Check MCP wrapper permissions
chmod +x /home/dev/workspace/*-mcp-wrapper.sh
```

## Best Practices

### Writing Integration Tests

1. **Use Real Services**: Test with actual databases and MCP servers
2. **Isolate Tests**: Each test should be independent
3. **Clean State**: Reset state between tests
4. **Realistic Data**: Use production-like test data
5. **Error Scenarios**: Test failure paths

### Performance Considerations

1. **Serial Execution**: Run tests sequentially to avoid conflicts
2. **Database Pooling**: Reuse database connections where possible
3. **Cleanup Efficiency**: Batch cleanup operations
4. **Timeout Management**: Set appropriate timeouts for operations

### Maintenance

1. **Keep Updated**: Update test data as APIs change
2. **Monitor Flakiness**: Address intermittent test failures
3. **Documentation**: Update README as tests evolve
4. **Coverage Tracking**: Monitor test coverage metrics

## Contributing

### Adding New Tests

1. **Choose Category**: Determine appropriate test category
2. **Follow Patterns**: Use existing test patterns
3. **Add Fixtures**: Create necessary test data
4. **Update Documentation**: Update this README

### Test Naming Conventions

- **File Names**: `*.integration.test.js` or `*-integration.test.js`
- **Test Descriptions**: Use descriptive "should..." statements
- **Test Groups**: Group related tests in `describe` blocks

### Code Style

- **ESLint**: Follow project ESLint configuration
- **Prettier**: Use project Prettier configuration
- **Comments**: Document complex test logic
- **Assertions**: Use descriptive assertion messages

## Reporting

### Test Reports

Integration tests generate multiple report formats:

- **Console Output**: Real-time test progress
- **HTML Reports**: `coverage/integration/html-report/integration-test-report.html`
- **JUnit XML**: `coverage/integration/integration-junit.xml`
- **Coverage Reports**: `coverage/integration/lcov-report/index.html`

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Integration Tests
  run: npm run test:integration
  env:
    NODE_ENV: test
    POSTGRES_HOST: postgres
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
```

For detailed setup instructions and troubleshooting, see the main project README and individual test files.
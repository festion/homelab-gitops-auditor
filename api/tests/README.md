# API Test Suite Documentation

This directory contains comprehensive tests for all Phase 2 API endpoints of the homelab-gitops-auditor.

## Test Structure

```
tests/
├── config/                 # Test configuration
│   └── testConfig.js       # Jest configuration for tests
├── setup/                  # Test setup and initialization
│   ├── jest.setup.js       # Global Jest setup
│   └── database.setup.js   # Database setup and teardown
├── helpers/                # Test utilities and helpers
│   └── testHelpers.js      # Common test helper functions
├── mocks/                  # Mock implementations
│   └── github.js           # GitHub API mock
├── routes/                 # API endpoint tests
│   ├── pipelines.test.js   # Pipeline API tests
│   └── compliance.test.js  # Compliance API tests
├── websocket/              # WebSocket tests
│   └── realtime.test.js    # Real-time update tests
├── integration/            # End-to-end tests
│   └── workflow.test.js    # Complete workflow tests
├── performance/            # Performance tests
│   └── load.test.js        # Load and performance tests
└── utils/                  # Test utilities
    └── testResultsProcessor.js # Custom test results processor
```

## Test Types

### 1. Unit Tests (`tests/routes/`)
- **Pipeline API Tests**: Complete testing of pipeline endpoints
  - GET `/api/v2/pipelines/status` - Pipeline status retrieval
  - POST `/api/v2/pipelines/trigger` - Pipeline triggering
  - GET `/api/v2/pipelines/metrics` - Metrics collection
  - Rate limiting and error handling

- **Compliance API Tests**: Comprehensive compliance endpoint testing
  - GET `/api/v2/compliance/status` - Compliance status
  - POST `/api/v2/compliance/apply` - Template application
  - POST `/api/v2/compliance/check` - Compliance checking
  - Template management and validation

### 2. WebSocket Tests (`tests/websocket/`)
- Real-time connection management
- Pipeline status updates
- Compliance notifications
- Orchestration progress updates
- Room-based subscriptions
- Performance and scalability testing

### 3. Integration Tests (`tests/integration/`)
- Complete end-to-end workflows
- Pipeline orchestration flows
- Compliance remediation processes
- Multi-user collaboration scenarios
- Error recovery and resilience testing

### 4. Performance Tests (`tests/performance/`)
- API response time benchmarks
- Concurrent request handling
- Large dataset performance
- Memory usage monitoring
- Rate limiting effectiveness
- Stress testing under load

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Multiple test projects for different test types
- Coverage thresholds (80% minimum, 90% for critical files)
- Custom test results processor
- Performance monitoring
- Module path mapping

### Environment Setup
Tests use in-memory SQLite databases and mock external services:
- GitHub API mocking with realistic responses
- WebSocket server simulation
- Rate limiting testing
- Authentication token generation

## Running Tests

### All Tests
```bash
npm test                    # Run all tests
npm run test:coverage      # Run with coverage report
npm run test:ci           # CI mode (no watch)
```

### Specific Test Types
```bash
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:websocket    # WebSocket tests only
npm run test:performance  # Performance tests only
```

### Development
```bash
npm run test:watch        # Watch mode for development
npm run test:debug        # Debug mode with inspector
```

## Test Data Management

### Database Setup
- Automatic test database creation and teardown
- Seed data for consistent testing
- Cleanup between test suites
- Schema initialization with all required tables

### Mock Data
- Realistic test repositories, pipelines, and compliance data
- GitHub API responses with proper rate limiting
- WebSocket message simulation
- Performance test datasets

## Coverage Requirements

### Global Thresholds
- **Statements**: 80% minimum
- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum

### Critical File Thresholds
- **Pipeline Service**: 90% minimum
- **Compliance Service**: 90% minimum
- **Phase 2 Endpoints**: 85% minimum

## Performance Benchmarks

### Response Time Targets
- **Pipeline Status**: < 200ms average, < 500ms maximum
- **Compliance Status**: < 300ms average, < 800ms maximum
- **Metrics Queries**: < 400ms for complex queries
- **WebSocket Connections**: < 500ms connection time

### Load Testing Targets
- **Concurrent Reads**: 50 requests in < 5 seconds
- **Mixed Operations**: 40 requests in < 8 seconds
- **Large Datasets**: 500 records in < 1 second
- **Stress Testing**: 95% success rate under continuous load

## Continuous Integration

### GitHub Actions Workflow
The test suite runs automatically on:
- Push to main/develop branches
- Pull requests
- Changes to API code

### Test Pipeline
1. **Unit Tests**: Run on multiple Node.js versions
2. **Integration Tests**: Full workflow validation
3. **WebSocket Tests**: Real-time functionality
4. **Performance Tests**: Benchmark validation
5. **Coverage Report**: Generate and upload coverage
6. **Quality Checks**: ESLint and security audits

### Reporting
- Test results summary in GitHub Actions
- Coverage badges and reports
- Performance metrics tracking
- Quality gate enforcement

## Writing New Tests

### Test Structure Template
```javascript
describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup that runs once before all tests
  });

  beforeEach(async () => {
    // Setup that runs before each test
    await TestHelpers.clearTestData();
  });

  afterEach(async () => {
    // Cleanup after each test
  });

  afterAll(async () => {
    // Cleanup that runs once after all tests
  });

  describe('Specific Functionality', () => {
    it('should behave correctly', async () => {
      // Test implementation
    });
  });
});
```

### Best Practices
1. **Use descriptive test names** that explain the expected behavior
2. **Test both success and failure scenarios**
3. **Include authentication and authorization testing**
4. **Mock external dependencies** (GitHub API, etc.)
5. **Clean up test data** between tests
6. **Use helper functions** for common operations
7. **Include performance assertions** where relevant
8. **Test error handling** and edge cases

### Helper Functions
The `TestHelpers` class provides utilities for:
- Authentication token generation
- Test data creation
- Database operations
- Performance measurement
- Request/response mocking
- Error simulation

### Mock Services
- **GitHub Mock**: Realistic API responses with rate limiting
- **WebSocket Mock**: Connection and message simulation
- **Database Mock**: In-memory SQLite with seed data

## Debugging Tests

### Common Issues
1. **Test timeouts**: Increase timeout for slow operations
2. **Database conflicts**: Ensure proper cleanup between tests
3. **WebSocket connections**: Check connection establishment
4. **Mock failures**: Verify mock setup and expectations

### Debug Tools
- Use `npm run test:debug` for inspector debugging
- Add `console.log` statements for debugging
- Use `fit` or `fdescribe` to run specific tests
- Check test artifacts in coverage reports

## Contributing

When adding new API endpoints:
1. Create corresponding test files
2. Include comprehensive test coverage
3. Add performance benchmarks
4. Update integration tests if needed
5. Ensure CI pipeline passes
6. Update this documentation

## Test Reports

After running tests, reports are generated in:
- `coverage/` - Coverage reports (HTML, LCOV, JSON)
- `coverage/reports/` - Custom test reports
  - `test-results.json` - Detailed JSON report
  - `test-results.md` - Markdown summary
  - `test-results.csv` - CSV export
  - `performance-metrics.json` - Performance tracking

These reports provide insights into:
- Test execution times
- Coverage metrics
- Performance trends
- Identified issues
- Historical performance data
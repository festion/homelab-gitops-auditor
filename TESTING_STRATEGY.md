# Testing Strategy: Home Assistant Config Automated Deployment

## Overview
This document outlines the comprehensive testing strategy for the Home Assistant Config automated deployment system, covering unit testing, integration testing, security testing, and operational validation.

## Testing Pyramid

### 1. Unit Tests (70% of test coverage)
- **Scope**: Individual functions and components
- **Focus**: Business logic validation
- **Execution**: Fast, isolated, deterministic
- **Tools**: Jest, Mocha, Chai

### 2. Integration Tests (20% of test coverage)
- **Scope**: Component interactions
- **Focus**: Interface contracts and data flow
- **Execution**: Moderate speed, controlled environment
- **Tools**: Supertest, Docker Compose

### 3. End-to-End Tests (10% of test coverage)
- **Scope**: Complete user workflows
- **Focus**: User journey validation
- **Execution**: Slower, production-like environment
- **Tools**: Playwright, Cypress

## Test Categories

### 1. Unit Testing

#### 1.1 Deployment Service Tests
```javascript
// tests/unit/deployment-service.test.js
describe('DeploymentService', () => {
  describe('validateDeploymentRequest', () => {
    it('should validate required fields', () => {
      const request = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commit: '689a045'
      };
      
      expect(deploymentService.validateDeploymentRequest(request))
        .to.be.true;
    });
    
    it('should reject invalid repository format', () => {
      const request = {
        repository: 'invalid-repo-format',
        branch: 'main'
      };
      
      expect(() => deploymentService.validateDeploymentRequest(request))
        .to.throw('Invalid repository format');
    });
  });
  
  describe('createDeploymentId', () => {
    it('should generate unique deployment IDs', () => {
      const id1 = deploymentService.createDeploymentId();
      const id2 = deploymentService.createDeploymentId();
      
      expect(id1).to.not.equal(id2);
      expect(id1).to.match(/^deploy-\d{8}-\d{6}$/);
    });
  });
});
```

#### 1.2 MCP Server Integration Tests
```javascript
// tests/unit/mcp-integration.test.js
describe('MCPServerManager', () => {
  describe('networkFsOperations', () => {
    it('should handle file transfer operations', async () => {
      const mockMCPServer = new MockNetworkFSMCP();
      const manager = new MCPServerManager(mockMCPServer);
      
      const result = await manager.transferFile('/source/file.txt', '/dest/file.txt');
      
      expect(result.success).to.be.true;
      expect(mockMCPServer.transferCalled).to.be.true;
    });
    
    it('should handle file transfer errors', async () => {
      const mockMCPServer = new MockNetworkFSMCP();
      mockMCPServer.simulateError = true;
      
      const manager = new MCPServerManager(mockMCPServer);
      
      await expect(manager.transferFile('/source/file.txt', '/dest/file.txt'))
        .to.be.rejectedWith('File transfer failed');
    });
  });
});
```

#### 1.3 Security Validation Tests
```javascript
// tests/unit/security.test.js
describe('SecurityValidation', () => {
  describe('validateWebhookSignature', () => {
    it('should validate correct GitHub webhook signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const signature = generateGitHubSignature(payload, secret);
      
      expect(securityValidator.validateWebhookSignature(payload, signature, secret))
        .to.be.true;
    });
    
    it('should reject invalid signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const invalidSignature = 'sha256=invalid-signature';
      
      expect(securityValidator.validateWebhookSignature(payload, invalidSignature, secret))
        .to.be.false;
    });
  });
  
  describe('sanitizeInput', () => {
    it('should sanitize dangerous characters', () => {
      const input = 'test/../../../etc/passwd';
      const sanitized = securityValidator.sanitizeInput(input);
      
      expect(sanitized).to.not.contain('../');
      expect(sanitized).to.equal('test/etc/passwd');
    });
  });
});
```

### 2. Integration Testing

#### 2.1 API Endpoint Tests
```javascript
// tests/integration/api-endpoints.test.js
describe('Deployment API Endpoints', () => {
  let app;
  let authToken;
  
  beforeEach(async () => {
    app = await createTestApp();
    authToken = await generateTestToken();
  });
  
  describe('POST /api/deployments/home-assistant-config/deploy', () => {
    it('should trigger deployment with valid request', async () => {
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branch: 'main',
          commit: '689a045',
          reason: 'Test deployment'
        });
      
      expect(response.status).to.equal(201);
      expect(response.body.data.deploymentId).to.exist;
      expect(response.body.data.state).to.equal('queued');
    });
    
    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .send({
          branch: 'main',
          commit: '689a045'
        });
      
      expect(response.status).to.equal(401);
      expect(response.body.error.code).to.equal('UNAUTHORIZED');
    });
  });
  
  describe('GET /api/deployments/home-assistant-config/status', () => {
    it('should return deployment status', async () => {
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body.data.state).to.exist;
      expect(response.body.data.progress).to.exist;
    });
  });
});
```

#### 2.2 Database Integration Tests
```javascript
// tests/integration/database.test.js
describe('Database Integration', () => {
  let db;
  
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase(db);
  });
  
  describe('DeploymentRepository', () => {
    it('should persist deployment records', async () => {
      const deployment = {
        deploymentId: 'test-deployment-001',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commit: '689a045',
        state: 'queued'
      };
      
      await deploymentRepository.create(deployment);
      
      const retrieved = await deploymentRepository.findById('test-deployment-001');
      expect(retrieved.deploymentId).to.equal('test-deployment-001');
      expect(retrieved.state).to.equal('queued');
    });
    
    it('should update deployment status', async () => {
      const deploymentId = 'test-deployment-002';
      await deploymentRepository.create({
        deploymentId,
        state: 'queued'
      });
      
      await deploymentRepository.updateStatus(deploymentId, 'in-progress');
      
      const retrieved = await deploymentRepository.findById(deploymentId);
      expect(retrieved.state).to.equal('in-progress');
    });
  });
});
```

#### 2.3 MCP Server Integration Tests
```javascript
// tests/integration/mcp-server.test.js
describe('MCP Server Integration', () => {
  let mcpManager;
  
  beforeEach(async () => {
    mcpManager = new MCPServerManager();
    await mcpManager.initialize();
  });
  
  afterEach(async () => {
    await mcpManager.cleanup();
  });
  
  describe('Network-FS MCP Server', () => {
    it('should connect to network file system', async () => {
      const connected = await mcpManager.connectNetworkFS();
      expect(connected).to.be.true;
    });
    
    it('should transfer files securely', async () => {
      const testFile = '/tmp/test-config.yaml';
      const destFile = '/config/test-config.yaml';
      
      await fs.writeFile(testFile, 'test: configuration');
      
      const result = await mcpManager.transferFile(testFile, destFile);
      expect(result.success).to.be.true;
      
      const destContent = await mcpManager.readFile(destFile);
      expect(destContent).to.equal('test: configuration');
    });
  });
  
  describe('GitHub MCP Server', () => {
    it('should fetch repository content', async () => {
      const content = await mcpManager.getRepositoryContent(
        'festion/home-assistant-config',
        'main',
        'configuration.yaml'
      );
      
      expect(content).to.exist;
      expect(content.length).to.be.greaterThan(0);
    });
  });
});
```

### 3. End-to-End Testing

#### 3.1 Complete Deployment Workflow
```javascript
// tests/e2e/deployment-workflow.test.js
describe('Complete Deployment Workflow', () => {
  let testEnvironment;
  
  beforeEach(async () => {
    testEnvironment = await setupTestEnvironment();
  });
  
  afterEach(async () => {
    await cleanupTestEnvironment(testEnvironment);
  });
  
  it('should complete full deployment from GitHub push', async () => {
    // Simulate GitHub push
    const webhookPayload = {
      repository: { full_name: 'festion/home-assistant-config' },
      ref: 'refs/heads/main',
      after: '689a045',
      pusher: { name: 'test-user' }
    };
    
    // Send webhook
    const webhookResponse = await sendWebhook(webhookPayload);
    expect(webhookResponse.status).to.equal(200);
    
    // Wait for deployment to start
    await waitForDeploymentState('in-progress', 30000);
    
    // Monitor deployment progress
    const deploymentId = await getLatestDeploymentId();
    const progress = await monitorDeploymentProgress(deploymentId);
    
    expect(progress.finalState).to.equal('completed');
    expect(progress.success).to.be.true;
    
    // Verify Home Assistant configuration
    const haStatus = await checkHomeAssistantStatus();
    expect(haStatus.configurationValid).to.be.true;
    expect(haStatus.apiResponsive).to.be.true;
  });
  
  it('should handle deployment failures gracefully', async () => {
    // Simulate deployment with invalid configuration
    const invalidConfig = 'invalid: yaml: content: [';
    await injectInvalidConfiguration(invalidConfig);
    
    const webhookPayload = {
      repository: { full_name: 'festion/home-assistant-config' },
      ref: 'refs/heads/main',
      after: 'invalid-commit'
    };
    
    await sendWebhook(webhookPayload);
    
    // Wait for deployment to fail
    await waitForDeploymentState('failed', 30000);
    
    // Verify automatic rollback
    const rollbackStatus = await checkRollbackStatus();
    expect(rollbackStatus.executed).to.be.true;
    expect(rollbackStatus.success).to.be.true;
    
    // Verify Home Assistant is still functional
    const haStatus = await checkHomeAssistantStatus();
    expect(haStatus.configurationValid).to.be.true;
    expect(haStatus.apiResponsive).to.be.true;
  });
});
```

#### 3.2 Dashboard Integration Tests
```javascript
// tests/e2e/dashboard.test.js
describe('Dashboard Integration', () => {
  let browser;
  let page;
  
  beforeEach(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto('http://192.168.1.58/deployments');
  });
  
  afterEach(async () => {
    await browser.close();
  });
  
  it('should display deployment status', async () => {
    await page.waitForSelector('[data-testid="deployment-status"]');
    
    const status = await page.textContent('[data-testid="deployment-status"]');
    expect(status).to.be.oneOf(['completed', 'in-progress', 'failed']);
  });
  
  it('should allow manual deployment trigger', async () => {
    await page.click('[data-testid="manual-deploy-button"]');
    await page.waitForSelector('[data-testid="deploy-modal"]');
    
    await page.fill('[data-testid="deploy-reason"]', 'Test deployment');
    await page.click('[data-testid="confirm-deploy"]');
    
    await page.waitForSelector('[data-testid="deployment-queued"]');
    
    const message = await page.textContent('[data-testid="deployment-queued"]');
    expect(message).to.contain('Deployment queued');
  });
});
```

### 4. Security Testing

#### 4.1 Authentication Tests
```javascript
// tests/security/authentication.test.js
describe('Authentication Security', () => {
  describe('Token validation', () => {
    it('should reject expired tokens', async () => {
      const expiredToken = generateExpiredToken();
      
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).to.equal(401);
      expect(response.body.error.code).to.equal('TOKEN_EXPIRED');
    });
    
    it('should reject malformed tokens', async () => {
      const malformedToken = 'invalid-token-format';
      
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${malformedToken}`);
      
      expect(response.status).to.equal(401);
      expect(response.body.error.code).to.equal('INVALID_TOKEN');
    });
  });
  
  describe('Rate limiting', () => {
    it('should enforce rate limits', async () => {
      const token = await generateTestToken();
      
      // Send requests up to rate limit
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${token}`);
      }
      
      // Next request should be rate limited
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).to.equal(429);
      expect(response.body.error.code).to.equal('RATE_LIMIT_EXCEEDED');
    });
  });
});
```

#### 4.2 Input Validation Tests
```javascript
// tests/security/input-validation.test.js
describe('Input Validation Security', () => {
  describe('Path traversal prevention', () => {
    it('should reject path traversal attempts', async () => {
      const maliciousPath = '../../../etc/passwd';
      
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          branch: 'main',
          configPath: maliciousPath
        });
      
      expect(response.status).to.equal(400);
      expect(response.body.error.code).to.equal('INVALID_PATH');
    });
  });
  
  describe('SQL injection prevention', () => {
    it('should sanitize database queries', async () => {
      const sqlInjection = "'; DROP TABLE deployments; --";
      
      const response = await request(app)
        .get(`/api/deployments/home-assistant-config/history?author=${sqlInjection}`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(200);
      // Verify database is still intact
      const tableExists = await checkTableExists('deployments');
      expect(tableExists).to.be.true;
    });
  });
});
```

### 5. Performance Testing

#### 5.1 Load Testing
```javascript
// tests/performance/load-tests.js
describe('Performance Load Tests', () => {
  it('should handle concurrent deployment requests', async () => {
    const concurrentRequests = 50;
    const requests = [];
    
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${validToken}`)
      );
    }
    
    const responses = await Promise.all(requests);
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).to.equal(200);
    });
    
    // Response time should be reasonable
    const avgResponseTime = responses.reduce((sum, response) => 
      sum + response.duration, 0) / responses.length;
    expect(avgResponseTime).to.be.lessThan(1000); // < 1 second
  });
  
  it('should handle deployment queue under load', async () => {
    const deploymentRequests = 20;
    const requests = [];
    
    for (let i = 0; i < deploymentRequests; i++) {
      requests.push(
        request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            branch: 'main',
            commit: `commit-${i}`,
            reason: `Load test deployment ${i}`
          })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // First request should be accepted
    expect(responses[0].status).to.equal(201);
    
    // Subsequent requests should be queued or rejected
    responses.slice(1).forEach(response => {
      expect(response.status).to.be.oneOf([201, 409]);
    });
  });
});
```

### 6. Disaster Recovery Testing

#### 6.1 Backup and Recovery Tests
```javascript
// tests/disaster-recovery/backup-recovery.test.js
describe('Disaster Recovery', () => {
  describe('Backup creation', () => {
    it('should create valid configuration backups', async () => {
      const backupId = await createBackup();
      expect(backupId).to.match(/^backup-\d{8}-\d{6}$/);
      
      const backupExists = await checkBackupExists(backupId);
      expect(backupExists).to.be.true;
      
      const backupContent = await getBackupContent(backupId);
      expect(backupContent).to.contain('homeassistant:');
    });
  });
  
  describe('Recovery procedures', () => {
    it('should restore from backup successfully', async () => {
      // Create initial backup
      const backupId = await createBackup();
      
      // Simulate configuration corruption
      await corruptConfiguration();
      
      // Restore from backup
      const restoreResult = await restoreFromBackup(backupId);
      expect(restoreResult.success).to.be.true;
      
      // Verify configuration is restored
      const configValid = await validateConfiguration();
      expect(configValid).to.be.true;
    });
  });
});
```

## Test Automation and CI/CD

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/test-deployment-system.yml
name: Test Deployment System

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
  
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:integration
  
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e
  
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:security
      - run: npm audit --audit-level high
```

### 2. Test Environment Management
```javascript
// tests/setup/test-environment.js
class TestEnvironment {
  async setup() {
    // Start test database
    await this.startTestDatabase();
    
    // Start mock Home Assistant
    await this.startMockHomeAssistant();
    
    // Configure MCP test servers
    await this.configureMCPServers();
    
    // Set up test data
    await this.seedTestData();
  }
  
  async cleanup() {
    // Clean up test data
    await this.cleanupTestData();
    
    // Stop services
    await this.stopServices();
    
    // Clean up temp files
    await this.cleanupTempFiles();
  }
}
```

### 3. Test Reporting and Metrics
```javascript
// tests/reporting/test-metrics.js
const testMetrics = {
  coverage: {
    statements: 95,
    branches: 90,
    functions: 95,
    lines: 95
  },
  performance: {
    apiResponseTime: '<100ms',
    deploymentTime: '<120s',
    rollbackTime: '<30s'
  },
  reliability: {
    successRate: '>99%',
    errorRate: '<1%',
    uptime: '>99.9%'
  }
};
```

## Test Data Management

### 1. Test Data Setup
```javascript
// tests/fixtures/test-data.js
const testData = {
  validDeployment: {
    repository: 'festion/home-assistant-config',
    branch: 'main',
    commit: '689a045',
    author: 'test-user',
    reason: 'Test deployment'
  },
  invalidDeployment: {
    repository: 'invalid/format',
    branch: 'invalid-branch-name!',
    commit: 'invalid-commit-hash'
  },
  validConfiguration: `
    homeassistant:
      name: Test Home
      unit_system: metric
      time_zone: UTC
  `,
  invalidConfiguration: `
    homeassistant:
      name: Test Home
      invalid_yaml: [
  `
};
```

### 2. Mock Services
```javascript
// tests/mocks/mock-services.js
class MockHomeAssistant {
  constructor() {
    this.isRunning = true;
    this.configurationValid = true;
  }
  
  async getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      configurationValid: this.configurationValid
    };
  }
  
  async validateConfiguration(config) {
    return { valid: this.configurationValid };
  }
}

class MockMCPServer {
  constructor() {
    this.connected = true;
  }
  
  async transferFile(source, destination) {
    if (!this.connected) {
      throw new Error('MCP server not connected');
    }
    return { success: true };
  }
}
```

## Continuous Testing Strategy

### 1. Pre-commit Testing
```bash
#!/bin/bash
# scripts/pre-commit-tests.sh
echo "Running pre-commit tests..."

# Run unit tests
npm run test:unit
if [ $? -ne 0 ]; then
  echo "Unit tests failed"
  exit 1
fi

# Run linting
npm run lint
if [ $? -ne 0 ]; then
  echo "Linting failed"
  exit 1
fi

# Run security checks
npm audit --audit-level high
if [ $? -ne 0 ]; then
  echo "Security audit failed"
  exit 1
fi

echo "Pre-commit tests passed"
```

### 2. Scheduled Testing
```yaml
# Cron job for nightly tests
0 2 * * * /opt/gitops/scripts/nightly-tests.sh
```

### 3. Production Testing
```javascript
// tests/production/smoke-tests.js
describe('Production Smoke Tests', () => {
  it('should verify deployment system health', async () => {
    const health = await checkSystemHealth();
    expect(health.status).to.equal('healthy');
    expect(health.services.api).to.equal('running');
    expect(health.services.database).to.equal('connected');
  });
  
  it('should verify Home Assistant connectivity', async () => {
    const haStatus = await checkHomeAssistantStatus();
    expect(haStatus.apiResponsive).to.be.true;
    expect(haStatus.configurationValid).to.be.true;
  });
});
```
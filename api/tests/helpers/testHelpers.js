const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class TestHelpers {
  // Authentication helpers
  static generateTestToken(payload = {}) {
    const defaultPayload = {
      id: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      permissions: ['read', 'write', 'admin']
    };
    
    return jwt.sign(
      { ...defaultPayload, ...payload },
      process.env.JWT_SECRET || 'test-jwt-secret-key',
      { expiresIn: '1h' }
    );
  }

  static generateAdminToken() {
    return this.generateTestToken({
      id: 'test-admin-id',
      username: 'testadmin',
      role: 'admin',
      permissions: ['read', 'write', 'admin']
    });
  }

  static generateViewerToken() {
    return this.generateTestToken({
      id: 'test-viewer-id',
      username: 'testviewer',
      role: 'viewer',
      permissions: ['read']
    });
  }

  // Request helpers
  static createAuthHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  static createTestRequest(overrides = {}) {
    return {
      method: 'GET',
      url: '/test',
      headers: {},
      body: {},
      params: {},
      query: {},
      user: this.createTestUser(),
      ...overrides
    };
  }

  static createTestResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    return res;
  }

  // Data generators
  static createTestUser(overrides = {}) {
    return {
      id: uuidv4(),
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      permissions: ['read'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides
    };
  }

  static createTestRepository(overrides = {}) {
    return {
      id: uuidv4(),
      name: 'test-repo',
      owner: 'test-owner',
      full_name: 'test-owner/test-repo',
      branch: 'main',
      status: 'active',
      compliance_score: 85,
      last_scan: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createTestPipeline(overrides = {}) {
    const startedAt = new Date(Date.now() - 300000);
    const completedAt = new Date();
    
    return {
      id: uuidv4(),
      repository: 'test-repo',
      workflow: 'ci.yml',
      branch: 'main',
      status: 'success',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      duration: completedAt.getTime() - startedAt.getTime(),
      metadata: {},
      createdAt: new Date().toISOString(),
      ...overrides
    };
  }

  static createTestCompliance(overrides = {}) {
    return {
      id: uuidv4(),
      repository: 'test-repo',
      template: 'standard-devops',
      status: 'compliant',
      score: 85,
      issues: [],
      appliedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...overrides
    };
  }

  static createTestMetric(overrides = {}) {
    return {
      id: uuidv4(),
      type: 'pipeline_success_rate',
      repository: 'test-repo',
      value: 0.85,
      timestamp: new Date().toISOString(),
      metadata: {},
      ...overrides
    };
  }

  static createTestOrchestration(overrides = {}) {
    return {
      id: uuidv4(),
      name: 'test-orchestration',
      status: 'pending',
      repositories: ['test-repo-1', 'test-repo-2'],
      startedAt: new Date().toISOString(),
      completedAt: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      ...overrides
    };
  }

  // GitHub API mock data
  static createGitHubWorkflowRun(overrides = {}) {
    return {
      id: Math.floor(Math.random() * 1000000),
      name: 'CI',
      head_branch: 'main',
      status: 'completed',
      conclusion: 'success',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_started_at: new Date().toISOString(),
      html_url: 'https://github.com/test/repo/actions/runs/123',
      ...overrides
    };
  }

  static createGitHubRepository(overrides = {}) {
    return {
      id: Math.floor(Math.random() * 1000000),
      name: 'test-repo',
      full_name: 'test-owner/test-repo',
      owner: {
        login: 'test-owner',
        type: 'User'
      },
      private: false,
      default_branch: 'main',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  // Performance testing helpers
  static async measureExecutionTime(fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    return {
      result,
      duration
    };
  }

  static async runConcurrentTests(testFn, count = 10) {
    const promises = Array(count).fill().map(() => testFn());
    return Promise.all(promises);
  }

  // Rate limiting helpers
  static async simulateRateLimit(requestFn, maxRequests = 10, timeWindow = 1000) {
    const promises = [];
    for (let i = 0; i < maxRequests + 5; i++) {
      promises.push(requestFn());
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const rateLimited = results.filter(r => 
      r.status === 'rejected' && 
      r.reason.response?.status === 429
    ).length;
    
    return { successful, rateLimited };
  }

  // WebSocket testing helpers
  static createWebSocketClient(url, options = {}) {
    const WebSocket = require('ws');
    return new WebSocket(url, options);
  }

  static waitForWebSocketMessage(ws, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('WebSocket message timeout'));
      }, timeout);

      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data));
      });
    });
  }

  // Database helpers
  static async clearTestData() {
    const db = global.getTestDatabase();
    await db.run('DELETE FROM pipelines WHERE id NOT LIKE "test-pipeline-%"');
    await db.run('DELETE FROM compliance WHERE id NOT LIKE "test-compliance-%"');
    await db.run('DELETE FROM metrics WHERE id NOT LIKE "test-metric-%"');
    await db.run('DELETE FROM orchestrations WHERE id NOT LIKE "test-orchestration-%"');
  }

  static async insertTestData(table, data) {
    const db = global.getTestDatabase();
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    return db.run(sql, Object.values(data));
  }

  // Environment helpers
  static setTestEnvironment(env = {}) {
    const originalEnv = { ...process.env };
    Object.assign(process.env, env);
    
    return () => {
      process.env = originalEnv;
    };
  }

  // Error simulation helpers
  static createNetworkError(message = 'Network error') {
    const error = new Error(message);
    error.code = 'ECONNREFUSED';
    return error;
  }

  static createAuthError(message = 'Authentication failed') {
    const error = new Error(message);
    error.status = 401;
    return error;
  }

  static createValidationError(message = 'Validation failed', field = 'unknown') {
    const error = new Error(message);
    error.status = 400;
    error.field = field;
    return error;
  }

  static createRateLimitError(message = 'Rate limit exceeded') {
    const error = new Error(message);
    error.status = 429;
    return error;
  }
}

module.exports = TestHelpers;
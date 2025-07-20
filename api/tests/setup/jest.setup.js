// Global test setup for Jest
const { performance } = require('perf_hooks');

// Increase timeout for CI environments
if (process.env.CI) {
  jest.setTimeout(60000);
}

// Global test utilities
global.testUtils = {
  // Performance measurement
  measurePerformance: (fn) => {
    return async (...args) => {
      const start = performance.now();
      const result = await fn(...args);
      const end = performance.now();
      return {
        result,
        duration: end - start
      };
    };
  },
  
  // Wait for condition
  waitFor: (condition, timeout = 5000, interval = 100) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - start >= timeout) {
          reject(new Error('Timeout waiting for condition'));
        } else {
          setTimeout(check, interval);
        }
      };
      check();
    });
  },
  
  // Create test user
  createTestUser: (overrides = {}) => ({
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['read', 'write', 'admin'],
    ...overrides
  }),
  
  // Create test repository
  createTestRepository: (overrides = {}) => ({
    id: 'test-repo',
    name: 'test-repo',
    owner: 'test-owner',
    fullName: 'test-owner/test-repo',
    branch: 'main',
    status: 'active',
    ...overrides
  }),
  
  // Create test pipeline
  createTestPipeline: (overrides = {}) => ({
    id: 'test-pipeline-id',
    repository: 'test-repo',
    workflow: 'ci.yml',
    branch: 'main',
    status: 'success',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    duration: 120000,
    ...overrides
  }),
  
  // Generate random string
  randomString: (length = 8) => {
    return Math.random().toString(36).substring(2, 2 + length);
  }
};

// Global test constants
global.testConstants = {
  TEST_USER_TOKEN: 'test-jwt-token',
  TEST_ADMIN_TOKEN: 'test-admin-jwt-token',
  TEST_VIEWER_TOKEN: 'test-viewer-jwt-token',
  TEST_GITHUB_TOKEN: 'test-github-token',
  TEST_WEBHOOK_SECRET: 'test-webhook-secret',
  TEST_DATABASE_URL: 'sqlite::memory:'
};

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Console log filtering for tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // Filter out known test warnings
  const message = args.join(' ');
  if (message.includes('Warning: ReactDOM.render is deprecated')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// Mock external dependencies by default (commented out for now)
// jest.mock('nodemailer', () => ({
//   createTransport: jest.fn(() => ({
//     sendMail: jest.fn((options, callback) => {
//       callback(null, { messageId: 'test-message-id' });
//     })
//   }))
// }));

// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.JWT_SECRET = 'test-jwt-secret-key';

console.log('Jest setup complete - test environment initialized');
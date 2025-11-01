// Jest setup for integration tests
const { TestEnvironment } = require('./test-environment');

// Extend Jest timeout for integration tests
jest.setTimeout(60000);

// Global test environment instance
let globalTestEnv = null;

// Setup before all tests in a file
beforeAll(async () => {
  // Each test file gets its own test environment
  // This is handled in individual test files
});

// Cleanup after all tests in a file
afterAll(async () => {
  // Individual test files handle cleanup
});

// Setup before each test
beforeEach(async () => {
  // Reset any global state if needed
});

// Cleanup after each test
afterEach(async () => {
  // Individual tests handle their cleanup
});

// Custom Jest matchers
expect.extend({
  // Check if value is one of the provided options
  oneOf(received, expected) {
    const pass = Array.isArray(expected) && expected.includes(received);
    return {
      message: () => `expected ${received} to be one of [${expected.join(', ')}]`,
      pass
    };
  },
  
  // Check if string matches a regex pattern
  toMatchPattern(received, pattern) {
    const pass = typeof received === 'string' && pattern.test(received);
    return {
      message: () => `expected ${received} to match pattern ${pattern}`,
      pass
    };
  },
  
  // Check if object has all required properties
  toHaveProperties(received, properties) {
    const pass = properties.every(prop => received.hasOwnProperty(prop));
    const missing = properties.filter(prop => !received.hasOwnProperty(prop));
    return {
      message: () => `expected object to have properties [${properties.join(', ')}], missing: [${missing.join(', ')}]`,
      pass
    };
  },
  
  // Check if timestamp is within a reasonable range of now
  toBeRecentTimestamp(received, toleranceMs = 10000) {
    const now = Date.now();
    const receivedTime = new Date(received).getTime();
    const diff = Math.abs(now - receivedTime);
    const pass = diff <= toleranceMs;
    return {
      message: () => `expected ${received} to be within ${toleranceMs}ms of current time, but was ${diff}ms away`,
      pass
    };
  },
  
  // Check if array is sorted by a specific property
  toBeSortedBy(received, property, order = 'asc') {
    if (!Array.isArray(received)) {
      return {
        message: () => `expected ${received} to be an array`,
        pass: false
      };
    }
    
    const values = received.map(item => 
      property ? item[property] : item
    );
    
    const sorted = [...values].sort((a, b) => {
      if (order === 'desc') {
        return b > a ? 1 : b < a ? -1 : 0;
      }
      return a > b ? 1 : a < b ? -1 : 0;
    });
    
    const pass = JSON.stringify(values) === JSON.stringify(sorted);
    return {
      message: () => `expected array to be sorted by ${property} in ${order} order`,
      pass
    };
  },
  
  // Check if deployment ID has correct format
  toBeValidDeploymentId(received) {
    const pattern = /^deploy-\d{8}-\d{6}$/;
    const pass = typeof received === 'string' && pattern.test(received);
    return {
      message: () => `expected ${received} to be a valid deployment ID (format: deploy-YYYYMMDD-HHMMSS)`,
      pass
    };
  },
  
  // Check if rollback ID has correct format
  toBeValidRollbackId(received) {
    const pattern = /^rollback-\d{8}-\d{6}$/;
    const pass = typeof received === 'string' && pattern.test(received);
    return {
      message: () => `expected ${received} to be a valid rollback ID (format: rollback-YYYYMMDD-HHMMSS)`,
      pass
    };
  },
  
  // Check if commit SHA has correct format
  toBeValidCommitSha(received) {
    const pattern = /^[a-f0-9]{40}$/;
    const pass = typeof received === 'string' && pattern.test(received);
    return {
      message: () => `expected ${received} to be a valid commit SHA (40 character hex string)`,
      pass
    };
  }
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log
});

// Console spy to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Override console methods to reduce noise unless in verbose mode
if (!process.env.VERBOSE_TESTS) {
  console.log = (...args) => {
    // Only log if it's a test-related message
    if (args.some(arg => typeof arg === 'string' && (
      arg.includes('test') || 
      arg.includes('Test') || 
      arg.includes('Integration') ||
      arg.includes('deployment') ||
      arg.includes('MCP')
    ))) {
      originalConsoleLog(...args);
    }
  };
  
  console.warn = (...args) => {
    // Always show warnings but prefix them
    originalConsoleWarn('[TEST WARNING]', ...args);
  };
  
  console.error = (...args) => {
    // Always show errors but prefix them
    originalConsoleError('[TEST ERROR]', ...args);
  };
}

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Test utilities
global.testUtils = {
  // Wait for a condition to be true
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },
  
  // Wait for a specific amount of time
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test data
  generateTestData: {
    deploymentId: () => {
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      return `deploy-${date}-${time}`;
    },
    
    rollbackId: () => {
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      return `rollback-${date}-${time}`;
    },
    
    commitSha: () => {
      return require('crypto').randomBytes(20).toString('hex');
    },
    
    timestamp: () => new Date().toISOString()
  }
};

// Environment validation
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Database configuration for tests
process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';

console.log('Integration test environment initialized');
console.log(`Node environment: ${process.env.NODE_ENV}`);
console.log(`Database host: ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}`);
console.log(`Test timeout: ${jest.getTimerCount ? 'Dynamic' : '60000ms'}`);
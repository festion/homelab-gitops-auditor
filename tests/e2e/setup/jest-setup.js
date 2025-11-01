// Jest setup for end-to-end tests
const { TestEnvironment } = require('./test-environment');

// Extend Jest timeout for E2E tests
jest.setTimeout(300000); // 5 minutes

// Global test environment instance
let globalE2EEnv = null;

// Setup before all tests in a file
beforeAll(async () => {
  // Each test file gets its own test environment
  // This is handled in individual test files for proper isolation
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

// Custom Jest matchers for E2E tests
expect.extend({
  // Check if deployment completed successfully within timeout
  async toCompleteDeploymentSuccessfully(deploymentId, timeout = 300000) {
    const startTime = Date.now();
    let deploymentStatus = null;
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:3071/api/deployments/${deploymentId}/status`);
        deploymentStatus = await response.json();
        
        if (deploymentStatus.data && ['completed', 'failed', 'cancelled'].includes(deploymentStatus.data.state)) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // Continue polling on network errors
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const pass = deploymentStatus?.data?.state === 'completed';
    return {
      message: () => `expected deployment ${deploymentId} to complete successfully, but got state: ${deploymentStatus?.data?.state || 'unknown'}`,
      pass
    };
  },
  
  // Check if rollback completed successfully
  async toCompleteRollbackSuccessfully(rollbackId, timeout = 180000) {
    const startTime = Date.now();
    let rollbackStatus = null;
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:3071/api/rollbacks/${rollbackId}/status`);
        rollbackStatus = await response.json();
        
        if (rollbackStatus.data && ['completed', 'failed'].includes(rollbackStatus.data.state)) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const pass = rollbackStatus?.data?.state === 'completed' && rollbackStatus?.data?.success === true;
    return {
      message: () => `expected rollback ${rollbackId} to complete successfully, but got state: ${rollbackStatus?.data?.state || 'unknown'}`,
      pass
    };
  },
  
  // Check if Home Assistant is healthy
  async toBeHealthy() {
    try {
      const response = await fetch('http://localhost:3071/api/deployments/home-assistant-config/health');
      const healthStatus = await response.json();
      
      const pass = healthStatus.data && 
                   healthStatus.data.status === 'running' && 
                   healthStatus.data.configurationValid === true &&
                   healthStatus.data.apiResponsive === true;
      
      return {
        message: () => `expected Home Assistant to be healthy, but got: ${JSON.stringify(healthStatus.data)}`,
        pass
      };
    } catch (error) {
      return {
        message: () => `expected Home Assistant to be healthy, but got error: ${error.message}`,
        pass: false
      };
    }
  },
  
  // Check if UI element is visible and contains text
  async toBeVisibleWithText(page, selector, expectedText) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 10000 });
      const element = await page.$(selector);
      const text = await element.textContent();
      
      const pass = text && text.includes(expectedText);
      return {
        message: () => `expected element ${selector} to be visible with text "${expectedText}", but got: "${text}"`,
        pass
      };
    } catch (error) {
      return {
        message: () => `expected element ${selector} to be visible with text "${expectedText}", but got error: ${error.message}`,
        pass: false
      };
    }
  },
  
  // Check if API response is successful within timeout
  async toRespondSuccessfully(url, timeout = 30000) {
    const startTime = Date.now();
    let lastError = null;
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return { pass: true, message: () => `URL ${url} responded successfully` };
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error.message;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return {
      message: () => `expected ${url} to respond successfully within ${timeout}ms, but got: ${lastError}`,
      pass: false
    };
  },
  
  // Check performance metrics
  toMeetPerformanceRequirements(metrics) {
    const requirements = {
      deploymentTime: 300000, // 5 minutes max
      healthCheckTime: 30000, // 30 seconds max
      backupTime: 120000, // 2 minutes max
      configurationDeploymentTime: 60000, // 1 minute max
      memoryUsage: 512 * 1024 * 1024, // 512MB max
      cpuUsage: 80 // 80% max
    };
    
    const failures = [];
    
    Object.keys(requirements).forEach(metric => {
      if (metrics[metric] && metrics[metric] > requirements[metric]) {
        failures.push(`${metric}: ${metrics[metric]} > ${requirements[metric]}`);
      }
    });
    
    const pass = failures.length === 0;
    return {
      message: () => pass 
        ? 'Performance requirements met'
        : `Performance requirements not met: ${failures.join(', ')}`,
      pass
    };
  }
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in E2E test at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in E2E test:', error);
  // Don't exit the process in tests, just log
});

// Console management for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Override console methods to reduce noise unless in verbose mode
if (!process.env.VERBOSE_E2E_TESTS) {
  console.log = (...args) => {
    // Only log if it's test-related or important
    if (args.some(arg => typeof arg === 'string' && (
      arg.includes('🚀') || 
      arg.includes('✅') || 
      arg.includes('❌') ||
      arg.includes('E2E') ||
      arg.includes('deployment') ||
      arg.includes('Dashboard')
    ))) {
      originalConsoleLog(...args);
    }
  };
  
  console.warn = (...args) => {
    // Always show warnings but prefix them
    originalConsoleWarn('[E2E WARNING]', ...args);
  };
  
  console.error = (...args) => {
    // Always show errors but prefix them
    originalConsoleError('[E2E ERROR]', ...args);
  };
}

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Test utilities
global.e2eUtils = {
  // Wait for a condition to be true
  waitFor: async (condition, timeout = 30000, interval = 1000) => {
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
  
  // Generate realistic test data
  generateTestData: {
    deploymentScenario: () => ({
      repository: 'festion/home-assistant-config',
      branch: 'main',
      commitSha: require('crypto').randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Test User',
        email: 'e2e-test@example.com'
      },
      timestamp: new Date().toISOString()
    }),
    
    userCredentials: (role = 'operator') => ({
      username: role,
      password: 'test-password-123',
      role: role
    }),
    
    webhookPayload: (overrides = {}) => {
      const defaults = {
        ref: 'refs/heads/main',
        repository: {
          full_name: 'festion/home-assistant-config',
          name: 'home-assistant-config',
          owner: { login: 'festion' }
        },
        head_commit: {
          id: require('crypto').randomBytes(20).toString('hex'),
          message: 'E2E test deployment',
          author: {
            name: 'E2E Test User',
            email: 'e2e-test@example.com'
          },
          timestamp: new Date().toISOString()
        }
      };
      
      return { ...defaults, ...overrides };
    }
  },
  
  // Performance monitoring utilities
  performanceMonitor: {
    start: () => ({
      startTime: Date.now(),
      startMemory: process.memoryUsage()
    }),
    
    end: (startData) => ({
      duration: Date.now() - startData.startTime,
      memoryDelta: {
        rss: process.memoryUsage().rss - startData.startMemory.rss,
        heapUsed: process.memoryUsage().heapUsed - startData.startMemory.heapUsed,
        heapTotal: process.memoryUsage().heapTotal - startData.startMemory.heapTotal
      }
    })
  }
};

// Environment validation
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// E2E specific environment variables
process.env.E2E_TEST_MODE = 'true';
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3071';
process.env.DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL || 'http://localhost:3000';
process.env.HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL || 'http://localhost:8123';

console.log('E2E test environment initialized');
console.log(`Node environment: ${process.env.NODE_ENV}`);
console.log(`API Base URL: ${process.env.API_BASE_URL}`);
console.log(`Dashboard Base URL: ${process.env.DASHBOARD_BASE_URL}`);
console.log(`Test timeout: 300000ms (5 minutes)`);
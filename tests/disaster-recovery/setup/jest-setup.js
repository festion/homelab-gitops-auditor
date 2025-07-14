/**
 * Jest setup for disaster recovery tests
 */

const { TestEnvironment } = require('../../integration/setup/test-environment');
const { FailureInjector } = require('../utils/failure-injector');
const { MetricsCollector } = require('../utils/metrics-collector');

// Global test utilities
global.TestEnvironment = TestEnvironment;
global.FailureInjector = FailureInjector;
global.MetricsCollector = MetricsCollector;

// Extended timeout for disaster recovery tests
jest.setTimeout(600000);

// Test lifecycle hooks
beforeAll(async () => {
  console.log('🚀 Starting disaster recovery test suite...');
  
  // Initialize test environment
  if (global.testEnvironment) {
    await global.testEnvironment.cleanup();
  }
  
  global.testEnvironment = new TestEnvironment();
  global.failureInjector = new FailureInjector();
  global.metricsCollector = new MetricsCollector();
  
  // Set up test isolation
  await global.testEnvironment.enableTestIsolation();
});

afterAll(async () => {
  console.log('🧹 Cleaning up disaster recovery test suite...');
  
  // Clean up failure injector
  if (global.failureInjector) {
    await global.failureInjector.cleanup();
  }
  
  // Clean up test environment
  if (global.testEnvironment) {
    await global.testEnvironment.cleanup();
  }
  
  // Save metrics
  if (global.metricsCollector) {
    await global.metricsCollector.saveMetrics('./tests/disaster-recovery/metrics.json');
  }
});

// Test isolation for each test
beforeEach(async () => {
  // Reset failure injector state
  if (global.failureInjector) {
    await global.failureInjector.recoverAllFailures();
  }
  
  // Reset metrics collector
  if (global.metricsCollector) {
    global.metricsCollector.clearMetrics();
  }
});

afterEach(async () => {
  // Clean up any remaining failures
  if (global.failureInjector) {
    await global.failureInjector.recoverAllFailures();
  }
  
  // Ensure test environment is stable
  if (global.testEnvironment) {
    await global.testEnvironment.waitForStability();
  }
});

// Custom matchers for disaster recovery tests
expect.extend({
  toMeetRTO(received, expectedMinutes) {
    const actualMinutes = received / (1000 * 60);
    const pass = actualMinutes <= expectedMinutes;
    
    return {
      message: () => 
        `Expected recovery time ${actualMinutes.toFixed(2)} minutes ${pass ? 'not ' : ''}to be within RTO of ${expectedMinutes} minutes`,
      pass,
    };
  },
  
  toMeetRPO(received, expectedMinutes) {
    const actualMinutes = received / (1000 * 60);
    const pass = actualMinutes <= expectedMinutes;
    
    return {
      message: () => 
        `Expected data loss window ${actualMinutes.toFixed(2)} minutes ${pass ? 'not ' : ''}to be within RPO of ${expectedMinutes} minutes`,
      pass,
    };
  },
  
  toMeetIntegrityThreshold(received, expectedScore) {
    const pass = received >= expectedScore;
    
    return {
      message: () => 
        `Expected integrity score ${received.toFixed(3)} ${pass ? 'not ' : ''}to meet threshold of ${expectedScore}`,
      pass,
    };
  },
  
  toBeHighlyAvailable(received, expectedAvailability = 0.99) {
    const pass = received >= expectedAvailability;
    
    return {
      message: () => 
        `Expected availability ${(received * 100).toFixed(2)}% ${pass ? 'not ' : ''}to meet high availability threshold of ${(expectedAvailability * 100).toFixed(2)}%`,
      pass,
    };
  }
});

// Global error handling for disaster recovery tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process during tests, just log
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process during tests, just log
});

// Test utilities
global.waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

global.retry = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await global.waitFor(delay);
    }
  }
};

global.timeoutAfter = (ms, promise) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    )
  ]);
};

console.log('✅ Disaster recovery test setup completed');
const path = require('path');
const fs = require('fs');

// Set up performance test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DB_NAME = 'homelab_gitops_auditor_performance_test';
process.env.DISABLE_WEBHOOKS = 'true';

// Create performance test results directory
const performanceResultsDir = path.join(__dirname, '../results');
if (!fs.existsSync(performanceResultsDir)) {
  fs.mkdirSync(performanceResultsDir, { recursive: true });
}

// Global test configuration
global.PERFORMANCE_TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  testDuration: 60000, // 1 minute default
  warmupDuration: 10000, // 10 seconds warmup
  cooldownDuration: 5000, // 5 seconds cooldown
  resultsDir: performanceResultsDir,
  metricsInterval: 1000, // 1 second metrics collection
  thresholds: {
    responseTime: {
      average: 500, // 500ms average response time
      p95: 1000, // 1 second 95th percentile
      p99: 2000 // 2 seconds 99th percentile
    },
    throughput: {
      minimum: 10 // 10 requests per second minimum
    },
    errorRate: {
      maximum: 0.05 // 5% maximum error rate
    },
    resources: {
      cpu: {
        maximum: 80 // 80% maximum CPU usage
      },
      memory: {
        maximum: 90 // 90% maximum memory usage
      },
      disk: {
        maximum: 95 // 95% maximum disk usage
      }
    }
  }
};

// Setup global performance monitoring
global.performanceMonitors = new Map();
global.performanceResults = new Map();

// Global test hooks
beforeEach(() => {
  // Clear any existing monitors
  global.performanceMonitors.clear();
  global.performanceResults.clear();
});

afterEach(() => {
  // Clean up monitors
  for (const [testName, monitor] of global.performanceMonitors) {
    if (monitor && typeof monitor.stop === 'function') {
      monitor.stop();
    }
  }
  global.performanceMonitors.clear();
});

// Helper functions for performance tests
global.performanceTestHelpers = {
  async waitForCooldown(duration = global.PERFORMANCE_TEST_CONFIG.cooldownDuration) {
    await new Promise(resolve => setTimeout(resolve, duration));
  },
  
  async waitForWarmup(duration = global.PERFORMANCE_TEST_CONFIG.warmupDuration) {
    await new Promise(resolve => setTimeout(resolve, duration));
  },
  
  generateTestId() {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  },
  
  getResultsFilePath(testName) {
    return path.join(global.PERFORMANCE_TEST_CONFIG.resultsDir, `${testName}-${Date.now()}.json`);
  }
};

console.log('🏗️  Performance test environment initialized');
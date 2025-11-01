const { LoadGenerator } = require('../utils/load-generator');
const { PerformanceMonitor } = require('../utils/performance-monitor');
const { MetricsCollector } = require('../utils/metrics-collector');
const { ReportGenerator } = require('../utils/report-generator');

describe('API Load Testing', () => {
  let loadGenerator;
  let performanceMonitor;
  let metricsCollector;
  let reportGenerator;

  beforeAll(async () => {
    loadGenerator = new LoadGenerator();
    performanceMonitor = new PerformanceMonitor();
    metricsCollector = new MetricsCollector();
    reportGenerator = new ReportGenerator();
  });

  afterAll(async () => {
    await generatePerformanceReport();
    await cleanup();
  });

  describe('Deployment API Load Tests', () => {
    it('should handle normal load for deployment status endpoint', async () => {
      const testConfig = {
        testName: 'deployment-status-load',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 10,
        duration: 60000, // 1 minute
        rampUpTime: 10000, // 10 seconds
        expectedResponseTime: 200, // 200ms
        expectedThroughput: 50 // 50 requests per second
      };

      console.log('🚀 Starting deployment status load test...');
      
      // Start performance monitoring
      await performanceMonitor.startMonitoring();
      
      // Run load test
      const results = await loadGenerator.runLoadTest(testConfig);
      
      // Stop monitoring
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      // Combine results with resource metrics
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Validate performance requirements
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.01); // Less than 1% error rate
      
      // Validate resource usage
      expect(resourceMetrics.cpu.usage.max).toBeLessThan(70); // Less than 70% CPU
      expect(resourceMetrics.memory.usage.max).toBeLessThan(80); // Less than 80% memory
      
      // Collect metrics
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Deployment status load test completed');
      console.log(`📊 Average Response Time: ${results.averageResponseTime}ms`);
      console.log(`📊 Throughput: ${results.throughput} RPS`);
      console.log(`📊 Error Rate: ${(results.errorRate * 100).toFixed(2)}%`);
      console.log(`📊 Performance Score: ${results.performanceScore}/100`);
    });

    it('should handle normal load for deployment history endpoint', async () => {
      const testConfig = {
        testName: 'deployment-history-load',
        endpoint: '/api/deployments/home-assistant-config/history',
        method: 'GET',
        concurrency: 5,
        duration: 60000,
        rampUpTime: 10000,
        expectedResponseTime: 500, // 500ms (more complex query)
        expectedThroughput: 20,
        queryParams: [
          { limit: 10, offset: 0 },
          { limit: 50, offset: 0 },
          { limit: 10, offset: 50 },
          { status: 'completed' },
          { author: 'test-user' }
        ]
      };

      console.log('🚀 Starting deployment history load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTestWithVariation(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.01);
      
      // Validate database performance
      if (resourceMetrics.database) {
        expect(resourceMetrics.database.connections.max).toBeLessThan(20);
        expect(resourceMetrics.database.responseTime.average).toBeLessThan(100);
      }
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Deployment history load test completed');
    });

    it('should handle concurrent deployment requests', async () => {
      const testConfig = {
        testName: 'concurrent-deployment-load',
        endpoint: '/api/deployments/home-assistant-config/deploy',
        method: 'POST',
        concurrency: 3, // Limited due to deployment queue
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 1000,
        expectedThroughput: 2,
        requestBody: {
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: 'Load testing deployment'
        }
      };

      console.log('🚀 Starting concurrent deployment load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Deployment requests should be queued, not all rejected
      expect(results.successRate).toBeGreaterThan(0.1); // At least 10% success rate
      
      // Some requests should be rejected with 409 (conflict)
      expect(results.conflictResponses).toBeGreaterThan(0);
      
      // Successful deployments should complete within reasonable time
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Concurrent deployment load test completed');
    });

    it('should handle load for deployment logs endpoint', async () => {
      const testConfig = {
        testName: 'deployment-logs-load',
        endpoint: '/api/deployments/home-assistant-config/logs',
        method: 'GET',
        concurrency: 8,
        duration: 45000,
        rampUpTime: 8000,
        expectedResponseTime: 300,
        expectedThroughput: 25,
        queryParams: [
          { limit: 100 },
          { limit: 500 },
          { level: 'error' },
          { since: '2023-01-01' }
        ]
      };

      console.log('🚀 Starting deployment logs load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTestWithVariation(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.02); // 2% error rate acceptable for logs
      
      // Validate response sizes are reasonable
      expect(results.averageResponseSize).toBeLessThan(5 * 1024 * 1024); // 5MB max
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Deployment logs load test completed');
    });

    it('should handle load for deployment metrics endpoint', async () => {
      const testConfig = {
        testName: 'deployment-metrics-load',
        endpoint: '/api/deployments/home-assistant-config/metrics',
        method: 'GET',
        concurrency: 15,
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 150,
        expectedThroughput: 40,
        queryParams: [
          { timeRange: '1h' },
          { timeRange: '24h' },
          { timeRange: '7d' },
          { metric: 'response_time' },
          { metric: 'throughput' }
        ]
      };

      console.log('🚀 Starting deployment metrics load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTestWithVariation(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.01);
      
      // Metrics endpoint should be very reliable
      expect(results.timeoutRate).toBeLessThan(0.005); // Less than 0.5% timeout rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Deployment metrics load test completed');
    });
  });

  describe('Dashboard API Load Tests', () => {
    it('should handle load for dashboard overview endpoint', async () => {
      const testConfig = {
        testName: 'dashboard-overview-load',
        endpoint: '/api/dashboard/overview',
        method: 'GET',
        concurrency: 20,
        duration: 60000,
        rampUpTime: 10000,
        expectedResponseTime: 400,
        expectedThroughput: 30
      };

      console.log('🚀 Starting dashboard overview load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.01);
      
      // Dashboard should be responsive
      expect(results.p95ResponseTime).toBeLessThan(800); // 800ms for 95th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Dashboard overview load test completed');
    });

    it('should handle load for system health endpoint', async () => {
      const testConfig = {
        testName: 'system-health-load',
        endpoint: '/api/system/health',
        method: 'GET',
        concurrency: 25,
        duration: 45000,
        rampUpTime: 8000,
        expectedResponseTime: 100,
        expectedThroughput: 60
      };

      console.log('🚀 Starting system health load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(results.errorRate).toBeLessThan(0.005); // Health endpoint should be very reliable
      
      // Health endpoint should be consistently fast
      expect(results.p99ResponseTime).toBeLessThan(300); // 300ms for 99th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ System health load test completed');
    });
  });

  describe('Authentication API Load Tests', () => {
    it('should handle load for authentication endpoint', async () => {
      const testConfig = {
        testName: 'authentication-load',
        endpoint: '/api/auth/login',
        method: 'POST',
        concurrency: 12,
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 250,
        expectedThroughput: 20,
        requestBody: {
          username: 'test-user',
          password: 'test-password'
        }
      };

      console.log('🚀 Starting authentication load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      
      // Authentication might have higher error rate due to invalid credentials
      expect(results.errorRate).toBeLessThan(0.1); // 10% error rate acceptable
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Authentication load test completed');
    });

    it('should handle load for token validation endpoint', async () => {
      const testConfig = {
        testName: 'token-validation-load',
        endpoint: '/api/auth/validate',
        method: 'POST',
        concurrency: 30,
        duration: 45000,
        rampUpTime: 10000,
        expectedResponseTime: 50,
        expectedThroughput: 80,
        requestBody: {
          token: 'test-jwt-token'
        }
      };

      console.log('🚀 Starting token validation load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      
      // Token validation should be very fast and reliable
      expect(results.errorRate).toBeLessThan(0.02); // 2% error rate
      expect(results.p95ResponseTime).toBeLessThan(100); // 100ms for 95th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Token validation load test completed');
    });
  });

  async function generatePerformanceReport() {
    const allResults = await metricsCollector.getAllResults();
    const report = await reportGenerator.generateReport(allResults, {
      includeCharts: true,
      includeRecommendations: true
    });
    
    console.log('\n📊 Performance Test Summary:');
    console.log('===============================');
    
    for (const [testName, results] of Object.entries(allResults)) {
      console.log(`\n${testName}:`);
      console.log(`  ⏱️  Average Response Time: ${results.averageResponseTime}ms`);
      console.log(`  🚀 Throughput: ${results.throughput} RPS`);
      console.log(`  ❌ Error Rate: ${(results.errorRate * 100).toFixed(2)}%`);
      console.log(`  📊 Performance Score: ${results.performanceScore}/100`);
      
      if (results.resourceMetrics) {
        console.log(`  💾 Max Memory Usage: ${results.resourceMetrics.memory.usage.max}%`);
        console.log(`  🔥 Max CPU Usage: ${results.resourceMetrics.cpu.usage.max}%`);
      }
    }
    
    // Write detailed report
    await reportGenerator.writeReportToFile('api-load-test-report.json', report);
    
    // Generate HTML report
    await reportGenerator.generateHtmlReport(report, 'api-load-test-report.html');
    
    console.log('\n📋 Performance reports generated successfully');
  }

  async function cleanup() {
    console.log('🧹 Cleaning up performance test resources...');
    
    if (loadGenerator) {
      await loadGenerator.cleanup();
    }
    
    if (performanceMonitor) {
      await performanceMonitor.cleanup();
    }
    
    if (metricsCollector) {
      await metricsCollector.cleanup();
    }
    
    // Wait for cleanup to complete
    await global.performanceTestHelpers.waitForCooldown(2000);
    
    console.log('✅ Performance test cleanup completed');
  }
});
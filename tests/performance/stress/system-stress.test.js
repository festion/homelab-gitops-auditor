const { LoadGenerator } = require('../utils/load-generator');
const { PerformanceMonitor } = require('../utils/performance-monitor');
const { MetricsCollector } = require('../utils/metrics-collector');
const { ReportGenerator } = require('../utils/report-generator');

describe('System Stress Testing', () => {
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

  describe('High Concurrency Stress Tests', () => {
    it('should handle extreme concurrent load', async () => {
      const testConfig = {
        testName: 'extreme-concurrency-stress',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 100, // Very high concurrency
        duration: 120000, // 2 minutes
        rampUpTime: 30000, // 30 seconds ramp up
        expectedGracefulDegradation: true
      };

      console.log('🔥 Starting extreme concurrency stress test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // System should degrade gracefully, not crash
      expect(results.systemCrash).toBe(false);
      
      // Error rate may be higher but should not be 100%
      expect(results.errorRate).toBeLessThan(0.5); // Less than 50%
      
      // Response times will be higher but should not timeout
      expect(results.timeoutRate).toBeLessThan(0.1); // Less than 10%
      
      // Resource usage should be high but not cause system instability
      expect(resourceMetrics.cpu.usage.max).toBeLessThan(98);
      expect(resourceMetrics.memory.usage.max).toBeLessThan(95);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Extreme concurrency stress test completed');
      console.log(`📊 Peak Concurrency: ${testConfig.concurrency} requests`);
      console.log(`📊 System Stability: ${results.systemCrash ? 'FAILED' : 'PASSED'}`);
    });

    it('should handle memory exhaustion gracefully', async () => {
      const testConfig = {
        testName: 'memory-exhaustion-stress',
        endpoint: '/api/deployments/home-assistant-config/history',
        method: 'GET',
        concurrency: 50,
        duration: 180000, // 3 minutes
        rampUpTime: 30000,
        queryParams: [
          { limit: 1000 }, // Large result sets
          { limit: 5000 },
          { limit: 10000 }
        ]
      };

      console.log('🔥 Starting memory exhaustion stress test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // System should not crash due to memory exhaustion
      expect(results.systemCrash).toBe(false);
      
      // Should implement proper pagination/limits
      expect(results.averageResponseSize).toBeLessThan(10 * 1024 * 1024); // 10MB
      
      // Memory usage should be controlled
      expect(resourceMetrics.memory.memoryLeakDetected).toBe(false);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Memory exhaustion stress test completed');
    });

    it('should handle CPU saturation stress', async () => {
      const testConfig = {
        testName: 'cpu-saturation-stress',
        endpoint: '/api/deployments/home-assistant-config/deploy',
        method: 'POST',
        concurrency: 20,
        duration: 90000,
        rampUpTime: 20000,
        requestBody: {
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: 'CPU stress test deployment'
        }
      };

      console.log('🔥 Starting CPU saturation stress test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // System should handle CPU saturation gracefully
      expect(results.systemCrash).toBe(false);
      
      // High CPU usage is expected but should not cause complete failure
      expect(resourceMetrics.cpu.usage.max).toBeGreaterThan(70);
      expect(results.timeoutRate).toBeLessThan(0.2); // Less than 20% timeout rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ CPU saturation stress test completed');
    });
  });

  describe('Resource Exhaustion Tests', () => {
    it('should handle database connection exhaustion', async () => {
      const testConfig = {
        testName: 'db-connection-exhaustion',
        endpoint: '/api/deployments/home-assistant-config/history',
        method: 'GET',
        concurrency: 200, // More than available DB connections
        duration: 60000,
        rampUpTime: 10000,
        queryParams: [
          { limit: 100, offset: 0 },
          { limit: 100, offset: 100 },
          { limit: 100, offset: 200 }
        ]
      };

      console.log('🔥 Starting database connection exhaustion test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Should handle connection pool exhaustion gracefully
      expect(results.systemCrash).toBe(false);
      
      // Should queue requests rather than fail immediately
      expect(results.connectionErrors).toBeLessThan(results.totalRequests * 0.3);
      
      // Database metrics should show proper connection management
      if (resourceMetrics.database) {
        expect(resourceMetrics.database.connections.max).toBeLessThan(50); // Max pool size
        expect(resourceMetrics.database.connectionLeaks).toBe(0);
      }
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Database connection exhaustion test completed');
    });

    it('should handle disk space exhaustion', async () => {
      const testConfig = {
        testName: 'disk-space-exhaustion',
        endpoint: '/api/deployments/home-assistant-config/deploy',
        method: 'POST',
        concurrency: 1,
        duration: 60000,
        rampUpTime: 5000,
        requestBody: {
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: 'Disk space exhaustion test',
          createBackup: true
        }
      };

      console.log('🔥 Starting disk space exhaustion test...');
      
      // Fill up disk space to near capacity
      await performanceMonitor.simulateDiskSpaceExhaustion(95); // 95% full
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Should handle disk space issues gracefully
      expect(results.systemCrash).toBe(false);
      
      // Should provide appropriate error messages
      expect(results.diskSpaceErrors || 0).toBeGreaterThan(0);
      
      // Should not continue creating backups when disk is full
      expect(results.backupCreationFailures || 0).toBeGreaterThan(0);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      // Cleanup disk space
      await performanceMonitor.cleanupDiskSpace();
      
      console.log('✅ Disk space exhaustion test completed');
    });

    it('should handle network saturation stress', async () => {
      const testConfig = {
        testName: 'network-saturation-stress',
        endpoint: '/api/deployments/home-assistant-config/logs',
        method: 'GET',
        concurrency: 80,
        duration: 120000,
        rampUpTime: 20000,
        queryParams: [
          { limit: 10000 }, // Large response sizes
          { format: 'json' },
          { include_debug: true }
        ]
      };

      console.log('🔥 Starting network saturation stress test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // System should handle network saturation gracefully
      expect(results.systemCrash).toBe(false);
      
      // Network throughput should be high but not cause instability
      expect(results.averageResponseTime).toBeLessThan(5000); // 5 second max
      expect(results.timeoutRate).toBeLessThan(0.15); // Less than 15% timeout rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Network saturation stress test completed');
    });
  });

  describe('Breaking Point Tests', () => {
    it('should find API throughput breaking point', async () => {
      const testConfig = {
        testName: 'api-throughput-breaking-point',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 200,
        duration: 60000,
        rampUpTime: 5000 // Fast ramp up to find breaking point
      };

      console.log('🔥 Starting API throughput breaking point test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig,
        breakingPointAnalysis: {
          maxThroughput: results.throughput,
          breakingConcurrency: testConfig.concurrency,
          degradationPoint: results.errorRate > 0.1 ? testConfig.concurrency : null,
          recoveryTime: this.calculateRecoveryTime(results)
        }
      };
      
      // System should eventually reach breaking point
      expect(results.errorRate).toBeGreaterThan(0.05); // Some degradation expected
      
      // But should not completely fail
      expect(results.successRate).toBeGreaterThan(0.1); // At least 10% success
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ API throughput breaking point test completed');
      console.log(`📊 Breaking Point: ${testConfig.concurrency} concurrent requests`);
      console.log(`📊 Max Throughput: ${results.throughput} RPS`);
    });

    it('should test webhook processing breaking point', async () => {
      const testConfig = {
        testName: 'webhook-processing-breaking-point',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 150,
        duration: 90000,
        rampUpTime: 10000,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          }
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'breaking-point-test',
          'X-Hub-Signature-256': 'sha256=test-signature'
        }
      };

      console.log('🔥 Starting webhook processing breaking point test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig,
        breakingPointAnalysis: {
          maxWebhookThroughput: results.throughput,
          queueBacklog: results.queueBacklog || 0,
          processingDelays: results.averageResponseTime,
          rateLimitingTriggered: results.statusCodes[429] > 0
        }
      };
      
      // Webhook system should implement backpressure
      expect(results.systemCrash).toBe(false);
      
      // Rate limiting should kick in
      expect(results.statusCodes[429]).toBeGreaterThan(0);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook processing breaking point test completed');
    });

    it('should test database query breaking point', async () => {
      const testConfig = {
        testName: 'database-query-breaking-point',
        endpoint: '/api/deployments/home-assistant-config/history',
        method: 'GET',
        concurrency: 100,
        duration: 120000,
        rampUpTime: 15000,
        queryParams: [
          { limit: 1000, offset: 0 },
          { limit: 2000, offset: 1000 },
          { limit: 5000, offset: 2000 },
          { orderBy: 'timestamp', order: 'desc' }
        ]
      };

      console.log('🔥 Starting database query breaking point test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig,
        breakingPointAnalysis: {
          maxQueryThroughput: results.throughput,
          averageQueryTime: results.averageResponseTime,
          slowQueryDetected: results.averageResponseTime > 2000,
          connectionPoolExhausted: results.connectionErrors > 0
        }
      };
      
      // Database should handle heavy query load
      expect(results.systemCrash).toBe(false);
      
      // Some degradation is expected with complex queries
      expect(results.averageResponseTime).toBeLessThan(10000); // 10 second max
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Database query breaking point test completed');
    });
  });

  describe('Recovery and Resilience Tests', () => {
    it('should test system recovery after stress', async () => {
      console.log('🔥 Starting system recovery test...');
      
      // Phase 1: Apply stress
      const stressConfig = {
        testName: 'system-recovery-stress-phase',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 150,
        duration: 60000,
        rampUpTime: 10000
      };
      
      await performanceMonitor.startMonitoring();
      
      const stressResults = await loadGenerator.runStressTest(stressConfig);
      
      console.log('⏳ Waiting for system recovery...');
      await global.performanceTestHelpers.waitForCooldown(30000); // 30 second recovery
      
      // Phase 2: Test normal load after stress
      const recoveryConfig = {
        testName: 'system-recovery-normal-phase',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 10,
        duration: 30000,
        rampUpTime: 5000
      };
      
      const recoveryResults = await loadGenerator.runLoadTest(recoveryConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        stressPhase: stressResults,
        recoveryPhase: recoveryResults,
        resourceMetrics,
        recoveryAnalysis: {
          stressErrorRate: stressResults.errorRate,
          recoveryErrorRate: recoveryResults.errorRate,
          performanceRecovered: recoveryResults.errorRate < 0.01,
          recoveryTime: 30000, // Time waited for recovery
          resourcesRecovered: this.analyzeResourceRecovery(resourceMetrics)
        }
      };
      
      // System should recover to normal operation
      expect(recoveryResults.errorRate).toBeLessThan(0.05); // Less than 5% error rate
      expect(recoveryResults.averageResponseTime).toBeLessThan(500); // Normal response time
      
      await metricsCollector.recordTestResults('system-recovery-test', combinedResults);
      
      console.log('✅ System recovery test completed');
      console.log(`📊 Recovery Success: ${recoveryResults.errorRate < 0.01 ? 'YES' : 'NO'}`);
    });

    it('should test graceful degradation under sustained stress', async () => {
      const testConfig = {
        testName: 'graceful-degradation-sustained-stress',
        endpoint: '/api/deployments/home-assistant-config/status',
        method: 'GET',
        concurrency: 80,
        duration: 300000, // 5 minutes sustained stress
        rampUpTime: 60000, // 1 minute ramp up
        sustainedStress: true
      };

      console.log('🔥 Starting graceful degradation sustained stress test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runStressTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig,
        degradationAnalysis: {
          sustainedThroughput: results.throughput,
          errorRateProgression: this.analyzeErrorRateProgression(results),
          resourceStability: this.analyzeResourceStability(resourceMetrics),
          gracefulDegradation: results.errorRate < 0.3 && !results.systemCrash
        }
      };
      
      // System should degrade gracefully, not crash
      expect(results.systemCrash).toBe(false);
      
      // Should maintain some level of service
      expect(results.successRate).toBeGreaterThan(0.5); // At least 50% success rate
      
      // Should not exhaust all resources
      expect(resourceMetrics.memory.usage.max).toBeLessThan(95);
      expect(resourceMetrics.cpu.usage.max).toBeLessThan(95);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Graceful degradation sustained stress test completed');
    });
  });

  // Helper methods
  calculateRecoveryTime(results) {
    // This would analyze the response time curve to find recovery point
    // For now, return a placeholder
    return results.averageResponseTime > 1000 ? 60000 : 30000;
  }

  analyzeResourceRecovery(resourceMetrics) {
    return {
      cpuRecovered: resourceMetrics.cpu.usage.max < 50,
      memoryRecovered: resourceMetrics.memory.usage.max < 70,
      diskRecovered: resourceMetrics.disk.usage.max < 80
    };
  }

  analyzeErrorRateProgression(results) {
    // This would analyze how error rate changed over time
    // For now, return a placeholder
    return {
      initialErrorRate: 0.01,
      finalErrorRate: results.errorRate,
      peakErrorRate: results.errorRate * 1.2,
      progressionStable: results.errorRate < 0.5
    };
  }

  analyzeResourceStability(resourceMetrics) {
    return {
      cpuStable: resourceMetrics.cpu.usage.max < 90,
      memoryStable: !resourceMetrics.memory.memoryLeakDetected,
      diskStable: resourceMetrics.disk.usage.max < 90
    };
  }

  async generatePerformanceReport() {
    const allResults = await metricsCollector.getAllResults();
    const report = await reportGenerator.generateReport(allResults, {
      includeCharts: true,
      includeRecommendations: true
    });
    
    console.log('\n📊 Stress Test Performance Summary:');
    console.log('===================================');
    
    for (const [testName, results] of Object.entries(allResults)) {
      console.log(`\n${testName}:`);
      console.log(`  ⏱️  Average Response Time: ${results.averageResponseTime}ms`);
      console.log(`  🚀 Throughput: ${results.throughput} RPS`);
      console.log(`  ❌ Error Rate: ${(results.errorRate * 100).toFixed(2)}%`);
      console.log(`  📊 Performance Score: ${results.performanceScore}/100`);
      console.log(`  🔥 System Crash: ${results.systemCrash ? 'YES' : 'NO'}`);
      
      if (results.resourceMetrics) {
        console.log(`  💾 Max Memory Usage: ${results.resourceMetrics.memory.usage.max}%`);
        console.log(`  🔥 Max CPU Usage: ${results.resourceMetrics.cpu.usage.max}%`);
      }
    }
    
    // Write detailed report
    await reportGenerator.writeReportToFile('stress-test-report.json', report);
    
    // Generate HTML report
    await reportGenerator.generateHtmlReport(report, 'stress-test-report.html');
    
    console.log('\n📋 Stress test reports generated successfully');
  }

  async function cleanup() {
    console.log('🧹 Cleaning up stress test resources...');
    
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
    await global.performanceTestHelpers.waitForCooldown(5000);
    
    console.log('✅ Stress test cleanup completed');
  }
});
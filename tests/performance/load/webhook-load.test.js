const { LoadGenerator } = require('../utils/load-generator');
const { PerformanceMonitor } = require('../utils/performance-monitor');
const { MetricsCollector } = require('../utils/metrics-collector');
const { ReportGenerator } = require('../utils/report-generator');
const crypto = require('crypto');

describe('Webhook Load Testing', () => {
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

  describe('GitHub Webhook Load Tests', () => {
    it('should handle webhook load under normal conditions', async () => {
      const testConfig = {
        testName: 'github-webhook-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 20,
        duration: 60000,
        rampUpTime: 10000,
        expectedResponseTime: 300,
        expectedThroughput: 30,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config',
            clone_url: 'https://github.com/festion/home-assistant-config.git'
          },
          ref: 'refs/heads/main',
          after: 'abc123def456',
          before: 'def456abc123',
          commits: [
            {
              id: 'abc123def456',
              message: 'Update configuration',
              author: {
                name: 'Test User',
                email: 'test@example.com'
              },
              timestamp: new Date().toISOString()
            }
          ],
          pusher: {
            name: 'test-user',
            email: 'test@example.com'
          }
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'load-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting GitHub webhook load test...');
      
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
      expect(results.errorRate).toBeLessThan(0.05); // 5% error rate acceptable for webhooks
      
      // Webhook processing should be reasonably fast
      expect(results.p95ResponseTime).toBeLessThan(600); // 600ms for 95th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ GitHub webhook load test completed');
    });

    it('should handle webhook signature validation load', async () => {
      const testConfig = {
        testName: 'webhook-signature-validation-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 50,
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 100,
        expectedThroughput: 100,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          }
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'signature-test-delivery',
          'X-Hub-Signature-256': 'sha256=invalid-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook signature validation load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // All requests should be rejected due to invalid signature
      expect(results.unauthorizedResponses).toBeGreaterThan(0);
      
      // But should be processed quickly
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      
      // Signature validation should be very fast
      expect(results.p99ResponseTime).toBeLessThan(200); // 200ms for 99th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook signature validation load test completed');
    });

    it('should handle webhook spam protection load', async () => {
      const testConfig = {
        testName: 'webhook-spam-protection-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 100, // High concurrency to test rate limiting
        duration: 30000,
        rampUpTime: 2000, // Fast ramp up
        expectedResponseTime: 50,
        expectedThroughput: 50,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          }
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'spam-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook spam protection load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Rate limiting should kick in
      expect(results.statusCodes[429]).toBeGreaterThan(0); // 429 Too Many Requests
      
      // System should remain responsive even under spam
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.systemCrash).toBe(false);
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook spam protection load test completed');
    });

    it('should handle webhook event type variations load', async () => {
      const eventTypes = [
        'push',
        'pull_request',
        'repository_dispatch',
        'workflow_run',
        'release'
      ];

      const testConfig = {
        testName: 'webhook-event-types-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 15,
        duration: 45000,
        rampUpTime: 8000,
        expectedResponseTime: 250,
        expectedThroughput: 25,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          }
        },
        headers: {
          'X-GitHub-Delivery': 'event-type-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook event types load test...');
      
      await performanceMonitor.startMonitoring();
      
      // Test each event type
      let aggregatedResults = null;
      
      for (const eventType of eventTypes) {
        const eventConfig = {
          ...testConfig,
          headers: {
            ...testConfig.headers,
            'X-GitHub-Event': eventType
          }
        };
        
        const results = await loadGenerator.runLoadTest(eventConfig);
        
        if (!aggregatedResults) {
          aggregatedResults = results;
        } else {
          // Aggregate results
          aggregatedResults.totalRequests += results.totalRequests;
          aggregatedResults.successfulRequests += results.successfulRequests;
          aggregatedResults.failedRequests += results.failedRequests;
          aggregatedResults.responseTimes.push(...results.responseTimes);
        }
        
        // Wait between event types
        await global.performanceTestHelpers.waitForCooldown(2000);
      }
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      // Recalculate aggregated metrics
      const combinedResults = {
        ...aggregatedResults,
        averageResponseTime: aggregatedResults.responseTimes.reduce((sum, time) => sum + time, 0) / aggregatedResults.responseTimes.length,
        throughput: aggregatedResults.totalRequests / (testConfig.duration / 1000),
        errorRate: aggregatedResults.failedRequests / aggregatedResults.totalRequests,
        resourceMetrics,
        testConfig
      };
      
      expect(combinedResults.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(combinedResults.throughput).toBeGreaterThan(testConfig.expectedThroughput);
      expect(combinedResults.errorRate).toBeLessThan(0.1); // 10% error rate acceptable for mixed events
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook event types load test completed');
    });
  });

  describe('Webhook Processing Load Tests', () => {
    it('should handle webhook queue processing load', async () => {
      const testConfig = {
        testName: 'webhook-queue-processing-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 30,
        duration: 60000,
        rampUpTime: 15000,
        expectedResponseTime: 200,
        expectedThroughput: 40,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          },
          ref: 'refs/heads/main',
          after: 'abc123def456'
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'queue-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook queue processing load test...');
      
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
      expect(results.errorRate).toBeLessThan(0.05);
      
      // Queue processing should handle backpressure well
      expect(results.timeoutRate).toBeLessThan(0.02); // Less than 2% timeout rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook queue processing load test completed');
    });

    it('should handle webhook payload validation load', async () => {
      const testConfig = {
        testName: 'webhook-payload-validation-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 40,
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 100,
        expectedThroughput: 60,
        requestBody: {
          // Invalid payload to test validation
          invalid_field: 'invalid_value',
          missing_repository: true
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'validation-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook payload validation load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Invalid payloads should be rejected quickly
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.statusCodes[400]).toBeGreaterThan(0); // 400 Bad Request
      
      // Validation should be very fast
      expect(results.p95ResponseTime).toBeLessThan(150); // 150ms for 95th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook payload validation load test completed');
    });

    it('should handle webhook deployment triggering load', async () => {
      const testConfig = {
        testName: 'webhook-deployment-triggering-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 5, // Limited to avoid overwhelming deployment system
        duration: 45000,
        rampUpTime: 10000,
        expectedResponseTime: 500,
        expectedThroughput: 8,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          },
          ref: 'refs/heads/main',
          after: () => crypto.randomBytes(20).toString('hex'), // Generate unique commit hash
          commits: [
            {
              id: () => crypto.randomBytes(20).toString('hex'),
              message: 'Load test commit',
              author: {
                name: 'Load Test',
                email: 'loadtest@example.com'
              },
              timestamp: new Date().toISOString()
            }
          ]
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'deployment-trigger-test',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook deployment triggering load test...');
      
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
      
      // Some deployments might be queued or rejected due to concurrent limits
      expect(results.successRate).toBeGreaterThan(0.2); // At least 20% success rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook deployment triggering load test completed');
    });
  });

  describe('Webhook Error Handling Load Tests', () => {
    it('should handle webhook malformed payload load', async () => {
      const testConfig = {
        testName: 'webhook-malformed-payload-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 25,
        duration: 30000,
        rampUpTime: 5000,
        expectedResponseTime: 50,
        expectedThroughput: 80,
        requestBody: 'invalid-json-payload',
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'malformed-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook malformed payload load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Malformed payloads should be rejected quickly
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.statusCodes[400]).toBeGreaterThan(0); // 400 Bad Request
      
      // Error handling should be very fast
      expect(results.p99ResponseTime).toBeLessThan(100); // 100ms for 99th percentile
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook malformed payload load test completed');
    });

    it('should handle webhook timeout scenarios load', async () => {
      const testConfig = {
        testName: 'webhook-timeout-scenarios-load',
        endpoint: '/api/webhooks/github',
        method: 'POST',
        concurrency: 10,
        duration: 60000,
        rampUpTime: 10000,
        expectedResponseTime: 1000,
        expectedThroughput: 5,
        requestBody: {
          action: 'deploy-home-assistant-config',
          repository: {
            full_name: 'festion/home-assistant-config'
          },
          // Simulate large payload that might cause processing delays
          large_data: 'x'.repeat(1024 * 1024) // 1MB of data
        },
        headers: {
          'X-GitHub-Event': 'repository_dispatch',
          'X-GitHub-Delivery': 'timeout-test-delivery',
          'X-Hub-Signature-256': 'sha256=test-signature',
          'Content-Type': 'application/json'
        }
      };

      console.log('🚀 Starting webhook timeout scenarios load test...');
      
      await performanceMonitor.startMonitoring();
      
      const results = await loadGenerator.runLoadTest(testConfig);
      
      const resourceMetrics = await performanceMonitor.stopMonitoring();
      
      const combinedResults = {
        ...results,
        resourceMetrics,
        testConfig
      };
      
      // Large payloads should still be processed within reasonable time
      expect(results.averageResponseTime).toBeLessThan(testConfig.expectedResponseTime);
      expect(results.timeoutRate).toBeLessThan(0.1); // Less than 10% timeout rate
      
      await metricsCollector.recordTestResults(testConfig.testName, combinedResults);
      
      console.log('✅ Webhook timeout scenarios load test completed');
    });
  });

  async function generatePerformanceReport() {
    const allResults = await metricsCollector.getAllResults();
    const report = await reportGenerator.generateReport(allResults, {
      includeCharts: true,
      includeRecommendations: true
    });
    
    console.log('\n📊 Webhook Performance Test Summary:');
    console.log('=====================================');
    
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
    await reportGenerator.writeReportToFile('webhook-load-test-report.json', report);
    
    // Generate HTML report
    await reportGenerator.generateHtmlReport(report, 'webhook-load-test-report.html');
    
    console.log('\n📋 Webhook performance reports generated successfully');
  }

  async function cleanup() {
    console.log('🧹 Cleaning up webhook performance test resources...');
    
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
    
    console.log('✅ Webhook performance test cleanup completed');
  }
});
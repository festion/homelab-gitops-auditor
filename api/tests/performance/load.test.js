const request = require('supertest');
const express = require('express');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const TestHelpers = require('../helpers/testHelpers');
const { setupGitHubMock, resetGitHubMock } = require('../mocks/github');

// Import the phase2 router
const phase2Router = require('../../phase2-endpoints');

describe('Performance and Load Testing', () => {
  let app;
  let adminToken;
  let githubMock;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.GITHUB_TOKEN = 'test-github-token';
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    
    // Generate auth token
    adminToken = TestHelpers.generateAdminToken();
    
    // Setup GitHub mock
    githubMock = setupGitHubMock();
    
    // Create Express app
    app = express();
    app.use(express.json());
    app.use('/api/v2', phase2Router);
  });

  beforeEach(async () => {
    // Reset GitHub mock
    githubMock.reset();
    githubMock.seedTestData();
    
    // Clear test data
    await TestHelpers.clearTestData();
    
    // Setup test data for performance testing
    await setupPerformanceTestData();
  });

  afterAll(async () => {
    resetGitHubMock();
  });

  describe('API Response Time Benchmarks', () => {
    it('should respond to pipeline status within performance threshold', async () => {
      const trials = 10;
      const durations = [];

      for (let i = 0; i < trials; i++) {
        const { duration } = await TestHelpers.measureExecutionTime(async () => {
          await request(app)
            .get('/api/v2/pipelines/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`Pipeline Status Performance:
        Average: ${avgDuration.toFixed(2)}ms
        Min: ${minDuration.toFixed(2)}ms
        Max: ${maxDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(200); // Average under 200ms
      expect(maxDuration).toBeLessThan(500); // Max under 500ms
    });

    it('should respond to compliance status within performance threshold', async () => {
      const trials = 10;
      const durations = [];

      for (let i = 0; i < trials; i++) {
        const { duration } = await TestHelpers.measureExecutionTime(async () => {
          await request(app)
            .get('/api/v2/compliance/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`Compliance Status Performance:
        Average: ${avgDuration.toFixed(2)}ms
        Max: ${maxDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(300); // Average under 300ms
      expect(maxDuration).toBeLessThan(800); // Max under 800ms
    });

    it('should handle metrics queries efficiently', async () => {
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/pipelines/metrics?timeRange=30d')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      console.log(`Metrics Query Performance: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(400); // Under 400ms for complex queries
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent read requests efficiently', async () => {
      const concurrentRequests = 50;
      const { duration, result } = await TestHelpers.measureExecutionTime(async () => {
        const promises = Array(concurrentRequests).fill().map(() =>
          request(app)
            .get('/api/v2/pipelines/status')
            .set('Authorization', `Bearer ${adminToken}`)
        );

        return Promise.all(promises);
      });

      const responses = result;
      const avgResponseTime = duration / concurrentRequests;

      console.log(`Concurrent Read Performance:
        Total Duration: ${duration.toFixed(2)}ms
        Concurrent Requests: ${concurrentRequests}
        Average per Request: ${avgResponseTime.toFixed(2)}ms`);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // Under 5 seconds total
      expect(avgResponseTime).toBeLessThan(200); // Under 200ms average
    });

    it('should handle mixed read/write operations under load', async () => {
      const readRequests = 30;
      const writeRequests = 10;
      
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        const readPromises = Array(readRequests).fill().map(() =>
          request(app)
            .get('/api/v2/pipelines/status')
            .set('Authorization', `Bearer ${adminToken}`)
        );

        const writePromises = Array(writeRequests).fill().map((_, i) =>
          request(app)
            .post('/api/v2/compliance/check')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              repository: `test-repo-${i % 3}`, // Cycle through test repos
              templates: ['standard-devops']
            })
        );

        const allPromises = [...readPromises, ...writePromises];
        return Promise.all(allPromises);
      });

      console.log(`Mixed Operations Performance: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(8000); // Under 8 seconds for mixed load
    });
  });

  describe('Large Dataset Performance', () => {
    beforeEach(async () => {
      // Insert large dataset for testing
      await setupLargeDataset();
    });

    it('should handle large pipeline result sets efficiently', async () => {
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        const response = await request(app)
          .get('/api/v2/pipelines/status?limit=500')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.pipelines.length).toBeLessThanOrEqual(500);
      });

      console.log(`Large Dataset Query Performance: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000); // Under 1 second for 500 records
    });

    it('should handle pagination efficiently', async () => {
      const pageSize = 50;
      const totalPages = 5;
      const durations = [];

      for (let page = 0; page < totalPages; page++) {
        const { duration } = await TestHelpers.measureExecutionTime(async () => {
          await request(app)
            .get(`/api/v2/pipelines/status?limit=${pageSize}&offset=${page * pageSize}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`Pagination Performance:
        Average Page Load: ${avgDuration.toFixed(2)}ms
        Max Page Load: ${maxDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(300); // Consistent performance across pages
      expect(maxDuration).toBeLessThan(500);
    });

    it('should handle complex compliance queries efficiently', async () => {
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/compliance/status?minScore=50&includeHistory=true')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      console.log(`Complex Compliance Query Performance: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(800); // Under 800ms for complex queries
    });
  });

  describe('Memory Usage and Resource Efficiency', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/v2/pipelines/status?limit=10')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      console.log(`Memory Usage:
        Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);

      // Memory increase should be minimal
      expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase
    });

    it('should handle database connections efficiently', async () => {
      const promises = Array(100).fill().map(() =>
        request(app)
          .get('/api/v2/pipelines/metrics')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        const responses = await Promise.all(promises);
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });
      });

      console.log(`Database Connection Pool Performance: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(3000); // Under 3 seconds for 100 DB queries
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limits without affecting performance', async () => {
      const requestsWithinLimit = 20;
      const requestsOverLimit = 10;

      // Make requests within rate limit
      const { duration: withinLimitDuration } = await TestHelpers.measureExecutionTime(async () => {
        const promises = Array(requestsWithinLimit).fill().map((_, i) =>
          new Promise(resolve => {
            setTimeout(() => {
              request(app)
                .get('/api/v2/pipelines/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .end(resolve);
            }, i * 50); // Spread requests over time
          })
        );
        await Promise.all(promises);
      });

      // Make requests that should hit rate limit
      const rateLimitedResponses = [];
      for (let i = 0; i < requestsOverLimit; i++) {
        const response = await request(app)
          .post('/api/v2/pipelines/trigger')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            repository: 'test-repo-1',
            workflow: 'ci.yml'
          });
        rateLimitedResponses.push(response);
      }

      const rateLimitedCount = rateLimitedResponses.filter(r => r.status === 429).length;

      console.log(`Rate Limiting Performance:
        Within Limit Duration: ${withinLimitDuration.toFixed(2)}ms
        Rate Limited Requests: ${rateLimitedCount}/${requestsOverLimit}`);

      expect(rateLimitedCount).toBeGreaterThan(0); // Some requests should be rate limited
      expect(withinLimitDuration / requestsWithinLimit).toBeLessThan(100); // Good performance within limits
    });
  });

  describe('Stress Testing', () => {
    it('should maintain stability under stress', async () => {
      const stressTestDuration = 10000; // 10 seconds
      const requestInterval = 100; // Request every 100ms
      const expectedRequests = Math.floor(stressTestDuration / requestInterval);
      
      let successCount = 0;
      let errorCount = 0;
      const startTime = Date.now();

      const stressTest = new Promise((resolve) => {
        const interval = setInterval(async () => {
          if (Date.now() - startTime >= stressTestDuration) {
            clearInterval(interval);
            resolve();
            return;
          }

          try {
            const response = await request(app)
              .get('/api/v2/pipelines/status?limit=5')
              .set('Authorization', `Bearer ${adminToken}`);
            
            if (response.status === 200) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }, requestInterval);
      });

      await stressTest;

      const totalRequests = successCount + errorCount;
      const successRate = (successCount / totalRequests) * 100;

      console.log(`Stress Test Results:
        Duration: ${stressTestDuration}ms
        Total Requests: ${totalRequests}
        Successful: ${successCount}
        Errors: ${errorCount}
        Success Rate: ${successRate.toFixed(2)}%`);

      expect(successRate).toBeGreaterThan(95); // 95% success rate under stress
      expect(totalRequests).toBeGreaterThan(expectedRequests * 0.8); // At least 80% of expected requests
    });
  });

  describe('WebSocket Performance', () => {
    it('should handle multiple WebSocket connections efficiently', async () => {
      const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
      
      if (isMainThread) {
        const numWorkers = 5;
        const connectionsPerWorker = 10;
        const totalConnections = numWorkers * connectionsPerWorker;

        const workers = [];
        const results = [];

        const { duration } = await TestHelpers.measureExecutionTime(async () => {
          // Create workers
          for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(__filename, {
              workerData: {
                isWorker: true,
                connectionsPerWorker,
                serverPort: 3000, // Would need actual server port
                adminToken
              }
            });

            workers.push(worker);
            
            worker.on('message', (result) => {
              results.push(result);
            });
          }

          // Wait for all workers to complete
          await Promise.all(workers.map(worker => 
            new Promise(resolve => worker.on('exit', resolve))
          ));
        });

        const totalSuccessfulConnections = results.reduce((sum, r) => sum + r.successful, 0);
        const avgConnectionTime = results.reduce((sum, r) => sum + r.avgConnectionTime, 0) / results.length;

        console.log(`WebSocket Performance:
          Total Connections: ${totalConnections}
          Successful: ${totalSuccessfulConnections}
          Success Rate: ${(totalSuccessfulConnections / totalConnections * 100).toFixed(2)}%
          Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms
          Total Duration: ${duration.toFixed(2)}ms`);

        expect(totalSuccessfulConnections / totalConnections).toBeGreaterThan(0.9); // 90% success rate
        expect(avgConnectionTime).toBeLessThan(500); // Under 500ms average connection time
      }
    });
  });

  // Helper functions
  async function setupPerformanceTestData() {
    // Insert test repositories
    const repositories = Array(10).fill().map((_, i) =>
      TestHelpers.createTestRepository({
        id: `perf-repo-${i}`,
        name: `perf-test-repo-${i}`,
        full_name: `test-owner/perf-test-repo-${i}`,
        compliance_score: 50 + (i * 5)
      })
    );

    for (const repo of repositories) {
      await TestHelpers.insertTestData('repositories', repo);
    }

    // Insert test pipelines
    const pipelines = Array(50).fill().map((_, i) =>
      TestHelpers.createTestPipeline({
        id: `perf-pipeline-${i}`,
        repository: `perf-repo-${i % 10}`,
        status: i % 4 === 0 ? 'failed' : 'success'
      })
    );

    for (const pipeline of pipelines) {
      await TestHelpers.insertTestData('pipelines', pipeline);
    }

    // Insert test compliance data
    const compliance = Array(20).fill().map((_, i) =>
      TestHelpers.createTestCompliance({
        id: `perf-compliance-${i}`,
        repository: `perf-repo-${i % 10}`,
        score: 60 + (i * 2)
      })
    );

    for (const comp of compliance) {
      await TestHelpers.insertTestData('compliance', comp);
    }
  }

  async function setupLargeDataset() {
    // Insert large number of repositories
    const repositories = Array(100).fill().map((_, i) =>
      TestHelpers.createTestRepository({
        id: `large-repo-${i}`,
        name: `large-test-repo-${i}`,
        full_name: `test-owner/large-test-repo-${i}`,
        compliance_score: Math.floor(Math.random() * 100)
      })
    );

    for (const repo of repositories) {
      await TestHelpers.insertTestData('repositories', repo);
    }

    // Insert large number of pipelines
    const pipelines = Array(1000).fill().map((_, i) =>
      TestHelpers.createTestPipeline({
        id: `large-pipeline-${i}`,
        repository: `large-repo-${i % 100}`,
        status: ['success', 'failed', 'running'][i % 3],
        startedAt: new Date(Date.now() - (i * 60000)).toISOString()
      })
    );

    for (const pipeline of pipelines) {
      await TestHelpers.insertTestData('pipelines', pipeline);
    }
  }
});

// Worker thread code for WebSocket testing
if (!isMainThread && workerData?.isWorker) {
  const Client = require('socket.io-client');
  
  async function testWebSocketConnections() {
    const { connectionsPerWorker, serverPort, adminToken } = workerData;
    const clients = [];
    const connectionTimes = [];
    let successful = 0;

    for (let i = 0; i < connectionsPerWorker; i++) {
      try {
        const startTime = Date.now();
        const client = new Client(`http://localhost:${serverPort}`, {
          auth: { token: adminToken }
        });

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
          
          client.on('connect', () => {
            clearTimeout(timeout);
            const connectionTime = Date.now() - startTime;
            connectionTimes.push(connectionTime);
            successful++;
            resolve();
          });

          client.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        clients.push(client);
      } catch (error) {
        // Connection failed
      }
    }

    // Cleanup
    clients.forEach(client => client.disconnect());

    const avgConnectionTime = connectionTimes.length > 0 
      ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length 
      : 0;

    parentPort.postMessage({
      successful,
      avgConnectionTime
    });
  }

  testWebSocketConnections().then(() => process.exit(0));
}
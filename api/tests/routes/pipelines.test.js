const request = require('supertest');
const express = require('express');
const TestHelpers = require('../helpers/testHelpers');
const { setupGitHubMock, resetGitHubMock } = require('../mocks/github');

// Import the phase2 router
const phase2Router = require('../../phase2-endpoints');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/v2', phase2Router);

describe('Pipeline API Endpoints', () => {
  let adminToken;
  let viewerToken;
  let githubMock;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.GITHUB_TOKEN = 'test-github-token';
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    
    // Generate auth tokens
    adminToken = TestHelpers.generateAdminToken();
    viewerToken = TestHelpers.generateViewerToken();
    
    // Setup GitHub mock
    githubMock = setupGitHubMock();
  });

  beforeEach(async () => {
    // Reset GitHub mock between tests
    githubMock.reset();
    githubMock.seedTestData();
    
    // Clear test data
    await TestHelpers.clearTestData();
  });

  afterAll(async () => {
    resetGitHubMock();
  });

  describe('GET /api/v2/pipelines/status', () => {
    beforeEach(async () => {
      // Insert test pipeline data
      await TestHelpers.insertTestData('pipelines', 
        TestHelpers.createTestPipeline({
          id: 'pipeline-1',
          repository: 'test-repo-1',
          status: 'success'
        })
      );
      
      await TestHelpers.insertTestData('pipelines',
        TestHelpers.createTestPipeline({
          id: 'pipeline-2',
          repository: 'test-repo-2',
          status: 'failed'
        })
      );
    });

    it('should return pipeline status for all repositories', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('pipelines');
      expect(response.body).toHaveProperty('metadata');
      expect(Array.isArray(response.body.pipelines)).toBe(true);
      expect(response.body.pipelines.length).toBeGreaterThan(0);
      
      // Check pipeline structure
      const pipeline = response.body.pipelines[0];
      expect(pipeline).toHaveProperty('id');
      expect(pipeline).toHaveProperty('repository');
      expect(pipeline).toHaveProperty('status');
      expect(pipeline).toHaveProperty('workflow');
    });

    it('should filter pipelines by repository', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/status?repository=test-repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pipelines).toHaveLength(1);
      expect(response.body.pipelines[0].repository).toBe('test-repo-1');
    });

    it('should filter pipelines by status', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/status?status=success')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.pipelines.forEach(pipeline => {
        expect(pipeline.status).toBe('success');
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/status?limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pipelines).toHaveLength(1);
      expect(response.body.metadata).toHaveProperty('total');
      expect(response.body.metadata).toHaveProperty('limit');
      expect(response.body.metadata).toHaveProperty('offset');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v2/pipelines/status')
        .expect(401);
    });

    it('should handle invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/status?limit=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('limit');
    });

    it('should return empty array when no pipelines found', async () => {
      await TestHelpers.clearTestData();
      
      const response = await request(app)
        .get('/api/v2/pipelines/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pipelines).toHaveLength(0);
    });
  });

  describe('POST /api/v2/pipelines/trigger', () => {
    it('should trigger a pipeline successfully', async () => {
      const triggerData = {
        repository: 'test-repo-1',
        workflow: 'ci.yml',
        branch: 'main',
        inputs: {
          environment: 'staging'
        }
      };

      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(triggerData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('runId');
      expect(response.body).toHaveProperty('repository', 'test-repo-1');
      expect(response.body).toHaveProperty('workflow', 'ci.yml');
    });

    it('should trigger pipeline with minimal required data', async () => {
      const triggerData = {
        repository: 'test-repo-1',
        workflow: 'ci.yml'
      };

      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(triggerData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.runId).toBeDefined();
    });

    it('should require pipeline trigger permission', async () => {
      const triggerData = {
        repository: 'test-repo-1',
        workflow: 'ci.yml'
      };

      await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(triggerData)
        .expect(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toContain('repository');
      expect(response.body.error).toContain('workflow');
    });

    it('should validate repository name format', async () => {
      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'invalid-repo-name',
          workflow: 'ci.yml'
        })
        .expect(400);

      expect(response.body.error).toContain('repository');
    });

    it('should handle GitHub API errors', async () => {
      // Mock GitHub API error
      githubMock.rateLimitRemaining = 0;

      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          workflow: 'ci.yml'
        })
        .expect(429);

      expect(response.body.error).toContain('rate limit');
    });

    it('should handle workflow not found error', async () => {
      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          workflow: 'nonexistent.yml'
        })
        .expect(404);

      expect(response.body.error).toContain('workflow');
    });
  });

  describe('GET /api/v2/pipelines/metrics', () => {
    beforeEach(async () => {
      // Insert test metrics data
      const metrics = [
        TestHelpers.createTestMetric({
          type: 'pipeline_success_rate',
          value: 0.85,
          repository: 'test-repo-1'
        }),
        TestHelpers.createTestMetric({
          type: 'pipeline_avg_duration',
          value: 180000,
          repository: 'test-repo-1'
        }),
        TestHelpers.createTestMetric({
          type: 'pipeline_runs_count',
          value: 50,
          repository: 'test-repo-1'
        })
      ];

      for (const metric of metrics) {
        await TestHelpers.insertTestData('metrics', metric);
      }
    });

    it('should return pipeline metrics', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('successRate');
      expect(response.body).toHaveProperty('avgDuration');
      expect(response.body).toHaveProperty('totalRuns');
      expect(response.body).toHaveProperty('metadata');
      
      expect(typeof response.body.successRate).toBe('number');
      expect(typeof response.body.avgDuration).toBe('number');
      expect(typeof response.body.totalRuns).toBe('number');
    });

    it('should support time range filtering', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/metrics?timeRange=7d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('timeRange', '7d');
      expect(response.body.metadata).toHaveProperty('timeRange');
    });

    it('should support repository filtering', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/metrics?repository=test-repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.metadata).toHaveProperty('repository', 'test-repo-1');
    });

    it('should handle empty metrics gracefully', async () => {
      await TestHelpers.clearTestData();
      
      const response = await request(app)
        .get('/api/v2/pipelines/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.successRate).toBe(0);
      expect(response.body.avgDuration).toBe(0);
      expect(response.body.totalRuns).toBe(0);
    });

    it('should validate time range parameter', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/metrics?timeRange=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toContain('timeRange');
    });

    it('should cache metrics for performance', async () => {
      const { duration: duration1 } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/pipelines/metrics')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      const { duration: duration2 } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/pipelines/metrics')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      // Second request should be faster (cached)
      expect(duration2).toBeLessThan(duration1 * 0.8);
    });
  });

  describe('GET /api/v2/pipelines/history/:repo', () => {
    beforeEach(async () => {
      // Insert historical pipeline data
      const pipelines = [
        TestHelpers.createTestPipeline({
          id: 'pipeline-history-1',
          repository: 'test-repo-1',
          status: 'success',
          startedAt: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }),
        TestHelpers.createTestPipeline({
          id: 'pipeline-history-2',
          repository: 'test-repo-1',
          status: 'failed',
          startedAt: new Date(Date.now() - 172800000).toISOString() // 2 days ago
        })
      ];

      for (const pipeline of pipelines) {
        await TestHelpers.insertTestData('pipelines', pipeline);
      }
    });

    it('should return pipeline history for specific repository', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/history/test-repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('repository', 'test-repo-1');
      expect(response.body).toHaveProperty('pipelines');
      expect(Array.isArray(response.body.pipelines)).toBe(true);
      expect(response.body.pipelines).toHaveLength(2);
    });

    it('should return empty history for non-existent repository', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/history/nonexistent-repo')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pipelines).toHaveLength(0);
    });

    it('should support pagination for history', async () => {
      const response = await request(app)
        .get('/api/v2/pipelines/history/test-repo-1?limit=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pipelines).toHaveLength(1);
      expect(response.body.metadata).toHaveProperty('total');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on pipeline triggers', async () => {
      const triggerData = {
        repository: 'test-repo-1',
        workflow: 'ci.yml'
      };

      // Make multiple requests quickly
      const promises = Array(10).fill().map(() =>
        request(app)
          .post('/api/v2/pipelines/trigger')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(triggerData)
      );

      const responses = await Promise.all(promises);
      const rateLimited = responses.some(res => res.status === 429);
      
      expect(rateLimited).toBe(true);
    });

    it('should not rate limit read operations', async () => {
      // Make multiple read requests
      const promises = Array(20).fill().map(() =>
        request(app)
          .get('/api/v2/pipelines/status')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should respond to status requests within 500ms', async () => {
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/pipelines/status')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });
        
      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(20).fill().map(() =>
        request(app)
          .get('/api/v2/pipelines/status')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle large result sets efficiently', async () => {
      // Insert many pipelines
      const pipelines = Array(100).fill().map((_, i) => 
        TestHelpers.createTestPipeline({
          id: `bulk-pipeline-${i}`,
          repository: `test-repo-${i % 10}`
        })
      );

      for (const pipeline of pipelines) {
        await TestHelpers.insertTestData('pipelines', pipeline);
      }

      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/pipelines/status?limit=100')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      const originalDB = global.testDB;
      global.testDB = {
        all: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      const response = await request(app)
        .get('/api/v2/pipelines/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body.error).toContain('database');
      
      // Restore database
      global.testDB = originalDB;
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should handle invalid authorization token', async () => {
      await request(app)
        .get('/api/v2/pipelines/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should handle missing authorization header', async () => {
      await request(app)
        .get('/api/v2/pipelines/status')
        .expect(401);
    });
  });

  describe('Input Validation', () => {
    it('should validate pipeline trigger inputs', async () => {
      const invalidInputs = [
        { repository: '', workflow: 'ci.yml' },
        { repository: 'test-repo', workflow: '' },
        { repository: 'test-repo', workflow: 'ci.yml', branch: '' },
        { repository: 'test-repo', workflow: 'ci.yml', inputs: 'invalid' }
      ];

      for (const input of invalidInputs) {
        const response = await request(app)
          .post('/api/v2/pipelines/trigger')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(input)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });

    it('should validate query parameters', async () => {
      const invalidQueries = [
        '?limit=-1',
        '?offset=-1',
        '?status=invalid',
        '?repository=',
        '?timeRange=invalid'
      ];

      for (const query of invalidQueries) {
        const response = await request(app)
          .get(`/api/v2/pipelines/status${query}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });
});
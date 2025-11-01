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

describe('Compliance API Endpoints', () => {
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

  describe('GET /api/v2/compliance/status', () => {
    beforeEach(async () => {
      // Insert test repositories
      await TestHelpers.insertTestData('repositories', 
        TestHelpers.createTestRepository({
          id: 'repo-1',
          name: 'test-repo-1',
          full_name: 'test-owner/test-repo-1',
          compliance_score: 85
        })
      );
      
      await TestHelpers.insertTestData('repositories',
        TestHelpers.createTestRepository({
          id: 'repo-2',
          name: 'test-repo-2',
          full_name: 'test-owner/test-repo-2',
          compliance_score: 65
        })
      );

      // Insert compliance data
      await TestHelpers.insertTestData('compliance',
        TestHelpers.createTestCompliance({
          id: 'compliance-1',
          repository: 'repo-1',
          template: 'standard-devops',
          status: 'compliant',
          score: 85
        })
      );

      await TestHelpers.insertTestData('compliance',
        TestHelpers.createTestCompliance({
          id: 'compliance-2',
          repository: 'repo-2',
          template: 'standard-devops',
          status: 'non-compliant',
          score: 65
        })
      );
    });

    it('should return compliance status for all repositories', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('repositories');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('complianceRate');
      expect(response.body.summary).toHaveProperty('averageScore');
      expect(response.body.summary).toHaveProperty('totalRepositories');
      
      expect(Array.isArray(response.body.repositories)).toBe(true);
      expect(response.body.repositories.length).toBeGreaterThan(0);
    });

    it('should calculate compliance scores correctly', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.repositories.forEach(repo => {
        expect(repo.score).toBeGreaterThanOrEqual(0);
        expect(repo.score).toBeLessThanOrEqual(100);
        expect(typeof repo.compliant).toBe('boolean');
        expect(repo).toHaveProperty('issues');
        expect(Array.isArray(repo.issues)).toBe(true);
      });
    });

    it('should filter repositories by compliance status', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/status?compliant=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.repositories.forEach(repo => {
        expect(repo.compliant).toBe(true);
      });
    });

    it('should filter repositories by minimum score', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/status?minScore=80')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.repositories.forEach(repo => {
        expect(repo.score).toBeGreaterThanOrEqual(80);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/status?limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.repositories).toHaveLength(1);
      expect(response.body.summary).toHaveProperty('pagination');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v2/compliance/status')
        .expect(401);
    });

    it('should handle empty repository list', async () => {
      await TestHelpers.clearTestData();
      
      const response = await request(app)
        .get('/api/v2/compliance/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.repositories).toHaveLength(0);
      expect(response.body.summary.complianceRate).toBe(0);
      expect(response.body.summary.averageScore).toBe(0);
    });
  });

  describe('POST /api/v2/compliance/apply', () => {
    beforeEach(async () => {
      // Insert test repository
      await TestHelpers.insertTestData('repositories',
        TestHelpers.createTestRepository({
          id: 'repo-apply',
          name: 'test-repo-apply',
          full_name: 'test-owner/test-repo-apply',
          compliance_score: 60
        })
      );
    });

    it('should apply templates to non-compliant repositories', async () => {
      const applyData = {
        repository: 'test-repo-apply',
        templates: ['standard-devops'],
        createPR: true,
        dryRun: false
      };

      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(applyData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('repository', 'test-repo-apply');
      expect(response.body).toHaveProperty('templatesApplied');
      expect(response.body).toHaveProperty('prUrl');
      expect(Array.isArray(response.body.templatesApplied)).toBe(true);
    });

    it('should support dry run mode', async () => {
      const applyData = {
        repository: 'test-repo-apply',
        templates: ['standard-devops'],
        dryRun: true
      };

      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(applyData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('dryRun', true);
      expect(response.body).toHaveProperty('changes');
      expect(response.body).not.toHaveProperty('prUrl');
    });

    it('should apply multiple templates', async () => {
      const applyData = {
        repository: 'test-repo-apply',
        templates: ['standard-devops', 'security-hardening', 'ci-cd'],
        createPR: false
      };

      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(applyData)
        .expect(200);

      expect(response.body.templatesApplied).toHaveLength(3);
      expect(response.body.templatesApplied).toEqual(['standard-devops', 'security-hardening', 'ci-cd']);
    });

    it('should require admin permission', async () => {
      const applyData = {
        repository: 'test-repo-apply',
        templates: ['standard-devops']
      };

      await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(applyData)
        .expect(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toContain('repository');
      expect(response.body.error).toContain('templates');
    });

    it('should validate template names', async () => {
      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-apply',
          templates: ['nonexistent-template']
        })
        .expect(400);

      expect(response.body.error).toContain('template');
    });

    it('should handle repository not found', async () => {
      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'nonexistent-repo',
          templates: ['standard-devops']
        })
        .expect(404);

      expect(response.body.error).toContain('repository');
    });

    it('should handle GitHub API errors gracefully', async () => {
      // Mock GitHub API error
      githubMock.rateLimitRemaining = 0;

      const response = await request(app)
        .post('/api/v2/compliance/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-apply',
          templates: ['standard-devops'],
          createPR: true
        })
        .expect(429);

      expect(response.body.error).toContain('rate limit');
    });
  });

  describe('POST /api/v2/compliance/check', () => {
    beforeEach(async () => {
      await TestHelpers.insertTestData('repositories',
        TestHelpers.createTestRepository({
          id: 'repo-check',
          name: 'test-repo-check',
          full_name: 'test-owner/test-repo-check'
        })
      );
    });

    it('should check compliance for specific repository', async () => {
      const checkData = {
        repository: 'test-repo-check',
        templates: ['standard-devops']
      };

      const response = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(checkData)
        .expect(200);

      expect(response.body).toHaveProperty('repository', 'test-repo-check');
      expect(response.body).toHaveProperty('compliance');
      expect(response.body.compliance).toHaveProperty('score');
      expect(response.body.compliance).toHaveProperty('status');
      expect(response.body.compliance).toHaveProperty('issues');
      expect(response.body.compliance).toHaveProperty('recommendations');
    });

    it('should check multiple templates', async () => {
      const checkData = {
        repository: 'test-repo-check',
        templates: ['standard-devops', 'security-hardening']
      };

      const response = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(checkData)
        .expect(200);

      expect(response.body.compliance).toHaveProperty('templateResults');
      expect(Object.keys(response.body.compliance.templateResults)).toHaveLength(2);
    });

    it('should return detailed compliance issues', async () => {
      const checkData = {
        repository: 'test-repo-check',
        templates: ['standard-devops'],
        detailed: true
      };

      const response = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(checkData)
        .expect(200);

      expect(response.body.compliance.issues).toBeDefined();
      expect(Array.isArray(response.body.compliance.issues)).toBe(true);
      
      if (response.body.compliance.issues.length > 0) {
        const issue = response.body.compliance.issues[0];
        expect(issue).toHaveProperty('type');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('description');
        expect(issue).toHaveProperty('file');
      }
    });

    it('should cache compliance results', async () => {
      const checkData = {
        repository: 'test-repo-check',
        templates: ['standard-devops']
      };

      const { duration: duration1 } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .post('/api/v2/compliance/check')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(checkData)
          .expect(200);
      });

      const { duration: duration2 } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .post('/api/v2/compliance/check')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(checkData)
          .expect(200);
      });

      // Second request should be faster (cached)
      expect(duration2).toBeLessThan(duration1 * 0.8);
    });
  });

  describe('GET /api/v2/compliance/templates', () => {
    it('should return available compliance templates', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
      expect(response.body.templates.length).toBeGreaterThan(0);

      const template = response.body.templates[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('rules');
    });

    it('should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/templates?category=security')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.templates.forEach(template => {
        expect(template.category).toBe('security');
      });
    });

    it('should include template metadata', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/templates?includeMetadata=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const template = response.body.templates[0];
      expect(template).toHaveProperty('metadata');
      expect(template.metadata).toHaveProperty('version');
      expect(template.metadata).toHaveProperty('createdAt');
      expect(template.metadata).toHaveProperty('updatedAt');
    });

    it('should work for viewers', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/templates')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
    });
  });

  describe('GET /api/v2/compliance/repository/:repo', () => {
    beforeEach(async () => {
      await TestHelpers.insertTestData('repositories',
        TestHelpers.createTestRepository({
          id: 'repo-detail',
          name: 'test-repo-detail',
          full_name: 'test-owner/test-repo-detail',
          compliance_score: 75
        })
      );

      await TestHelpers.insertTestData('compliance',
        TestHelpers.createTestCompliance({
          id: 'compliance-detail',
          repository: 'repo-detail',
          template: 'standard-devops',
          status: 'compliant',
          score: 75,
          issues: JSON.stringify([
            {
              type: 'missing_file',
              severity: 'medium',
              description: 'Missing SECURITY.md file',
              file: 'SECURITY.md'
            }
          ])
        })
      );
    });

    it('should return detailed compliance information for repository', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/repository/test-repo-detail')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('repository', 'test-repo-detail');
      expect(response.body).toHaveProperty('compliance');
      expect(response.body.compliance).toHaveProperty('score', 75);
      expect(response.body.compliance).toHaveProperty('status', 'compliant');
      expect(response.body.compliance).toHaveProperty('issues');
      expect(response.body.compliance).toHaveProperty('history');
    });

    it('should return 404 for non-existent repository', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/repository/nonexistent-repo')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error).toContain('repository');
    });

    it('should include compliance history', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/repository/test-repo-detail?includeHistory=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.compliance).toHaveProperty('history');
      expect(Array.isArray(response.body.compliance.history)).toBe(true);
    });
  });

  describe('GET /api/v2/compliance/history', () => {
    beforeEach(async () => {
      // Insert historical compliance data
      const historyEntries = [
        TestHelpers.createTestCompliance({
          id: 'history-1',
          repository: 'repo-1',
          template: 'standard-devops',
          score: 70,
          appliedAt: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }),
        TestHelpers.createTestCompliance({
          id: 'history-2',
          repository: 'repo-1',
          template: 'standard-devops',
          score: 85,
          appliedAt: new Date().toISOString()
        })
      ];

      for (const entry of historyEntries) {
        await TestHelpers.insertTestData('compliance', entry);
      }
    });

    it('should return compliance history', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(Array.isArray(response.body.history)).toBe(true);
      expect(response.body.history.length).toBeGreaterThan(0);

      const entry = response.body.history[0];
      expect(entry).toHaveProperty('repository');
      expect(entry).toHaveProperty('template');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('appliedAt');
    });

    it('should filter history by repository', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/history?repository=repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.history.forEach(entry => {
        expect(entry.repository).toBe('repo-1');
      });
    });

    it('should filter history by time range', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/history?timeRange=24h')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Should only return entries from last 24 hours
      const oneDayAgo = new Date(Date.now() - 86400000);
      response.body.history.forEach(entry => {
        expect(new Date(entry.appliedAt)).toBeGreaterThan(oneDayAgo);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v2/compliance/history?limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.history).toHaveLength(1);
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty('total');
    });
  });

  describe('Performance Tests', () => {
    it('should respond to status requests within 300ms', async () => {
      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        await request(app)
          .get('/api/v2/compliance/status')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });
        
      expect(duration).toBeLessThan(300);
    });

    it('should handle concurrent compliance checks', async () => {
      await TestHelpers.insertTestData('repositories',
        TestHelpers.createTestRepository({
          id: 'concurrent-repo',
          name: 'concurrent-test-repo',
          full_name: 'test-owner/concurrent-test-repo'
        })
      );

      const checkData = {
        repository: 'concurrent-test-repo',
        templates: ['standard-devops']
      };

      const promises = Array(5).fill().map(() =>
        request(app)
          .post('/api/v2/compliance/check')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(checkData)
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid template names gracefully', async () => {
      const response = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo',
          templates: ['invalid-template']
        })
        .expect(400);

      expect(response.body.error).toContain('template');
    });

    it('should handle compliance service errors', async () => {
      // This would require mocking the compliance service to throw errors
      // For now, we'll test the error handling structure
      const response = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'nonexistent-repo',
          templates: ['standard-devops']
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Input Validation', () => {
    it('should validate compliance apply inputs', async () => {
      const invalidInputs = [
        { repository: '', templates: ['standard-devops'] },
        { repository: 'test-repo', templates: [] },
        { repository: 'test-repo', templates: [''] },
        { repository: 'test-repo', templates: 'not-array' }
      ];

      for (const input of invalidInputs) {
        const response = await request(app)
          .post('/api/v2/compliance/apply')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(input)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });

    it('should validate query parameters', async () => {
      const invalidQueries = [
        '?minScore=invalid',
        '?minScore=-1',
        '?minScore=101',
        '?compliant=invalid',
        '?limit=-1',
        '?offset=-1'
      ];

      for (const query of invalidQueries) {
        const response = await request(app)
          .get(`/api/v2/compliance/status${query}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });
});
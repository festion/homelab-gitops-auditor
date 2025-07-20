const request = require('supertest');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { createServer } = require('http');
const TestHelpers = require('../helpers/testHelpers');
const { setupGitHubMock, resetGitHubMock } = require('../mocks/github');

// Import the phase2 router
const phase2Router = require('../../phase2-endpoints');

describe('End-to-End Workflow Integration', () => {
  let app;
  let httpServer;
  let socketServer;
  let socketClient;
  let serverPort;
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

    // Create HTTP server
    httpServer = createServer(app);
    
    // Create Socket.IO server
    socketServer = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });

    // Setup WebSocket authentication
    socketServer.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));
      
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });

    // Setup WebSocket handlers
    setupWebSocketHandlers(socketServer);

    // Start server
    await new Promise((resolve) => {
      httpServer.listen(() => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    // Reset GitHub mock
    githubMock.reset();
    githubMock.seedTestData();
    
    // Clear test data
    await TestHelpers.clearTestData();
    
    // Setup test repositories
    await setupTestRepositories();
    
    // Create WebSocket client
    socketClient = new Client(`http://localhost:${serverPort}`, {
      auth: { token: adminToken }
    });
    
    await new Promise(resolve => socketClient.on('connect', resolve));
  });

  afterEach(async () => {
    if (socketClient) {
      socketClient.disconnect();
    }
  });

  afterAll(async () => {
    resetGitHubMock();
    if (socketServer) socketServer.close();
    if (httpServer) httpServer.close();
  });

  describe('Complete Pipeline Orchestration Flow', () => {
    it('should complete full pipeline orchestration workflow', async () => {
      // 1. Start orchestration
      const orchestrationResponse = await request(app)
        .post('/api/v2/orchestration/execute/full-gitops-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repositories: ['test-repo-1', 'test-repo-2'],
          profile: 'comprehensive',
          options: {
            parallelExecution: true,
            timeoutMinutes: 30
          }
        })
        .expect(200);

      const orchestrationId = orchestrationResponse.body.orchestrationId;
      expect(orchestrationId).toBeDefined();
      expect(orchestrationResponse.body.status).toBe('started');

      // 2. Monitor orchestration progress via WebSocket
      const progressUpdates = [];
      socketClient.on('orchestration:progress', (data) => {
        if (data.orchestrationId === orchestrationId) {
          progressUpdates.push(data);
        }
      });

      // 3. Wait for orchestration completion
      let completed = false;
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!completed && attempts < maxAttempts) {
        const statusResponse = await request(app)
          .get(`/api/v2/orchestration/status/${orchestrationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        if (statusResponse.body.status === 'completed') {
          completed = true;
          expect(statusResponse.body.results).toBeDefined();
          expect(statusResponse.body.results.repositories).toHaveLength(2);
        } else if (statusResponse.body.status === 'failed') {
          throw new Error(`Orchestration failed: ${statusResponse.body.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      expect(completed).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);

      // 4. Verify compliance was updated
      const complianceResponse = await request(app)
        .get('/api/v2/compliance/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(complianceResponse.body.summary.lastUpdated).toBeTruthy();
      expect(complianceResponse.body.repositories.length).toBeGreaterThanOrEqual(2);

      // 5. Verify pipeline metrics were collected
      const metricsResponse = await request(app)
        .get('/api/v2/pipelines/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(metricsResponse.body.totalRuns).toBeGreaterThan(0);
    });

    it('should handle orchestration failure gracefully', async () => {
      // Mock GitHub API to fail
      githubMock.rateLimitRemaining = 0;

      const orchestrationResponse = await request(app)
        .post('/api/v2/orchestration/execute/full-gitops-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repositories: ['test-repo-1'],
          profile: 'quick'
        })
        .expect(200);

      const orchestrationId = orchestrationResponse.body.orchestrationId;

      // Monitor for failure
      let failed = false;
      let attempts = 0;
      
      while (!failed && attempts < 10) {
        const statusResponse = await request(app)
          .get(`/api/v2/orchestration/status/${orchestrationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        if (statusResponse.body.status === 'failed') {
          failed = true;
          expect(statusResponse.body.error).toContain('rate limit');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      expect(failed).toBe(true);
    });
  });

  describe('Pipeline Triggering and Monitoring Flow', () => {
    it('should trigger pipeline and monitor completion', async () => {
      // 1. Subscribe to pipeline updates
      socketClient.emit('subscribe', { 
        type: 'pipeline', 
        repository: 'test-repo-1' 
      });

      const pipelineUpdates = [];
      socketClient.on('pipeline:status', (data) => {
        if (data.repository === 'test-repo-1') {
          pipelineUpdates.push(data);
        }
      });

      // 2. Trigger pipeline
      const triggerResponse = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          workflow: 'ci.yml',
          branch: 'main'
        })
        .expect(200);

      const runId = triggerResponse.body.runId;
      expect(runId).toBeDefined();

      // 3. Wait for pipeline completion
      let completed = false;
      let attempts = 0;
      
      while (!completed && attempts < 15) {
        const statusResponse = await request(app)
          .get(`/api/v2/pipelines/status?repository=test-repo-1`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const pipeline = statusResponse.body.pipelines.find(p => p.id.toString() === runId.toString());
        if (pipeline && ['success', 'failed'].includes(pipeline.status)) {
          completed = true;
          expect(pipeline.status).toBe('success');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      expect(completed).toBe(true);
      expect(pipelineUpdates.length).toBeGreaterThan(0);

      // 4. Verify metrics were updated
      const metricsResponse = await request(app)
        .get('/api/v2/pipelines/metrics?repository=test-repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(metricsResponse.body.totalRuns).toBeGreaterThan(0);
    });
  });

  describe('Compliance Check and Remediation Flow', () => {
    it('should check compliance and apply remediation', async () => {
      // 1. Initial compliance check
      const checkResponse = await request(app)
        .post('/api/v2/compliance/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          templates: ['standard-devops', 'security-hardening']
        })
        .expect(200);

      const initialScore = checkResponse.body.compliance.score;
      expect(typeof initialScore).toBe('number');

      // 2. Apply templates if not compliant
      if (checkResponse.body.compliance.status !== 'compliant') {
        const applyResponse = await request(app)
          .post('/api/v2/compliance/apply')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            repository: 'test-repo-1',
            templates: ['standard-devops'],
            createPR: true
          })
          .expect(200);

        expect(applyResponse.body.success).toBe(true);
        expect(applyResponse.body.prUrl).toBeDefined();

        // 3. Re-check compliance after applying templates
        await new Promise(resolve => setTimeout(resolve, 1000));

        const recheckResponse = await request(app)
          .post('/api/v2/compliance/check')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            repository: 'test-repo-1',
            templates: ['standard-devops']
          })
          .expect(200);

        const newScore = recheckResponse.body.compliance.score;
        expect(newScore).toBeGreaterThanOrEqual(initialScore);
      }

      // 4. Verify compliance history was recorded
      const historyResponse = await request(app)
        .get('/api/v2/compliance/history?repository=test-repo-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(historyResponse.body.history.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Dashboard Updates Flow', () => {
    it('should provide real-time dashboard updates', async () => {
      const dashboardUpdates = {
        pipelines: [],
        compliance: [],
        metrics: []
      };

      // Subscribe to all update types
      socketClient.on('pipeline:status', (data) => {
        dashboardUpdates.pipelines.push(data);
      });

      socketClient.on('compliance:updated', (data) => {
        dashboardUpdates.compliance.push(data);
      });

      socketClient.on('metrics:updated', (data) => {
        dashboardUpdates.metrics.push(data);
      });

      // 1. Trigger multiple pipelines
      const triggerPromises = ['test-repo-1', 'test-repo-2'].map(repo =>
        request(app)
          .post('/api/v2/pipelines/trigger')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            repository: repo,
            workflow: 'ci.yml'
          })
      );

      await Promise.all(triggerPromises);

      // 2. Trigger compliance checks
      const compliancePromises = ['test-repo-1', 'test-repo-2'].map(repo =>
        request(app)
          .post('/api/v2/compliance/check')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            repository: repo,
            templates: ['standard-devops']
          })
      );

      await Promise.all(compliancePromises);

      // 3. Wait for updates
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Verify dashboard received updates
      expect(dashboardUpdates.pipelines.length).toBeGreaterThan(0);
      expect(dashboardUpdates.compliance.length).toBeGreaterThan(0);

      // 5. Verify dashboard data consistency
      const dashboardResponse = await request(app)
        .get('/api/v2/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(dashboardResponse.body).toHaveProperty('pipelines');
      expect(dashboardResponse.body).toHaveProperty('compliance');
      expect(dashboardResponse.body).toHaveProperty('metrics');
    });
  });

  describe('Error Recovery and Resilience Flow', () => {
    it('should handle partial failures in orchestration', async () => {
      // Setup one repository to fail
      const repositories = ['test-repo-1', 'failing-repo'];
      
      const orchestrationResponse = await request(app)
        .post('/api/v2/orchestration/execute/full-gitops-audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repositories,
          profile: 'comprehensive',
          options: {
            continueOnFailure: true
          }
        })
        .expect(200);

      const orchestrationId = orchestrationResponse.body.orchestrationId;

      // Wait for completion
      let completed = false;
      let attempts = 0;
      
      while (!completed && attempts < 20) {
        const statusResponse = await request(app)
          .get(`/api/v2/orchestration/status/${orchestrationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        if (['completed', 'partial_failure'].includes(statusResponse.body.status)) {
          completed = true;
          
          // Should have some successful results despite failures
          expect(statusResponse.body.results).toBeDefined();
          expect(statusResponse.body.results.successful.length).toBeGreaterThan(0);
          expect(statusResponse.body.results.failed.length).toBeGreaterThan(0);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      expect(completed).toBe(true);
    });

    it('should retry failed operations', async () => {
      // Mock intermittent GitHub API failure
      let callCount = 0;
      const originalRateLimitRemaining = githubMock.rateLimitRemaining;
      
      githubMock.checkRateLimit = function() {
        callCount++;
        if (callCount <= 2) {
          // Fail first two calls
          this.rateLimitRemaining = 0;
          const error = new Error('API rate limit exceeded');
          error.status = 403;
          throw error;
        } else {
          // Succeed on third call
          this.rateLimitRemaining = originalRateLimitRemaining;
        }
      };

      const triggerResponse = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          workflow: 'ci.yml',
          retryAttempts: 3
        });

      // Should eventually succeed after retries
      expect([200, 202]).toContain(triggerResponse.status);
      expect(callCount).toBeGreaterThan(2);
    });
  });

  describe('Multi-user Collaboration Flow', () => {
    it('should handle concurrent operations from multiple users', async () => {
      const viewerToken = TestHelpers.generateViewerToken();
      
      // Create viewer client
      const viewerClient = new Client(`http://localhost:${serverPort}`, {
        auth: { token: viewerToken }
      });
      
      await new Promise(resolve => viewerClient.on('connect', resolve));

      const adminUpdates = [];
      const viewerUpdates = [];

      socketClient.on('pipeline:status', (data) => {
        adminUpdates.push(data);
      });

      viewerClient.on('pipeline:status', (data) => {
        viewerUpdates.push(data);
      });

      // Admin triggers pipeline
      const triggerResponse = await request(app)
        .post('/api/v2/pipelines/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository: 'test-repo-1',
          workflow: 'ci.yml'
        })
        .expect(200);

      // Viewer monitors status
      const viewerStatusResponse = await request(app)
        .get('/api/v2/pipelines/status')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      // Wait for updates
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Both users should receive updates
      expect(adminUpdates.length).toBeGreaterThan(0);
      expect(viewerUpdates.length).toBeGreaterThan(0);
      expect(viewerStatusResponse.body.pipelines).toBeDefined();

      viewerClient.disconnect();
    });
  });

  // Helper functions
  async function setupTestRepositories() {
    const repositories = [
      TestHelpers.createTestRepository({
        id: 'test-repo-1',
        name: 'test-repo-1',
        full_name: 'test-owner/test-repo-1',
        compliance_score: 70
      }),
      TestHelpers.createTestRepository({
        id: 'test-repo-2',
        name: 'test-repo-2',
        full_name: 'test-owner/test-repo-2',
        compliance_score: 85
      })
    ];

    for (const repo of repositories) {
      await TestHelpers.insertTestData('repositories', repo);
    }
  }

  function setupWebSocketHandlers(socketServer) {
    socketServer.on('connection', (socket) => {
      socket.on('subscribe', (data) => {
        socket.join(`${data.type}:${data.repository || 'all'}`);
        socket.emit('subscribed', data);
      });

      socket.on('unsubscribe', (data) => {
        socket.leave(`${data.type}:${data.repository || 'all'}`);
        socket.emit('unsubscribed', data);
      });

      // Simulate periodic updates
      const updateInterval = setInterval(() => {
        socket.emit('metrics:updated', {
          type: 'system_health',
          timestamp: new Date().toISOString(),
          metrics: {
            active_pipelines: Math.floor(Math.random() * 10),
            queue_size: Math.floor(Math.random() * 20)
          }
        });
      }, 5000);

      socket.on('disconnect', () => {
        clearInterval(updateInterval);
      });
    });
  }
});
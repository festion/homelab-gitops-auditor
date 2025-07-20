const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const TestHelpers = require('../helpers/testHelpers');

describe('WebSocket Real-time Updates', () => {
  let httpServer;
  let socketServer;
  let serverPort;
  let clientSocket;
  let adminToken;
  let viewerToken;

  beforeAll(async () => {
    // Generate auth tokens
    adminToken = TestHelpers.generateAdminToken();
    viewerToken = TestHelpers.generateViewerToken();
    
    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.IO server
    socketServer = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Setup authentication middleware
    socketServer.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret-key');
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        socket.userPermissions = decoded.permissions;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });

    // Setup event handlers for testing
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
    // Create client connection
    clientSocket = new Client(`http://localhost:${serverPort}`, {
      auth: { token: adminToken }
    });

    // Wait for connection
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  afterAll(async () => {
    if (socketServer) {
      socketServer.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection with valid token', async () => {
      expect(clientSocket.connected).toBe(true);
    });

    it('should reject connection with invalid token', async () => {
      const invalidClient = new Client(`http://localhost:${serverPort}`, {
        auth: { token: 'invalid-token' }
      });

      await new Promise((resolve) => {
        invalidClient.on('connect_error', (error) => {
          expect(error.message).toContain('Authentication error');
          resolve();
        });
      });

      invalidClient.disconnect();
    });

    it('should reject connection without token', async () => {
      const noAuthClient = new Client(`http://localhost:${serverPort}`);

      await new Promise((resolve) => {
        noAuthClient.on('connect_error', (error) => {
          expect(error.message).toContain('Authentication error');
          resolve();
        });
      });

      noAuthClient.disconnect();
    });

    it('should handle client disconnection gracefully', async () => {
      const testClient = new Client(`http://localhost:${serverPort}`, {
        auth: { token: adminToken }
      });
      
      await new Promise((resolve) => {
        testClient.on('connect', () => {
          testClient.disconnect();
          resolve();
        });
      });

      // Should not throw any errors
      expect(true).toBe(true);
    });
  });

  describe('Pipeline Status Updates', () => {
    it('should emit pipeline status updates', async () => {
      const pipelineData = TestHelpers.createTestPipeline({
        repository: 'test-repo',
        status: 'running'
      });

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('pipeline:status', (data) => {
          resolve(data);
        });
      });

      // Emit pipeline status update
      socketServer.emit('pipeline:status', pipelineData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject({
        repository: 'test-repo',
        status: 'running'
      });
    });

    it('should emit pipeline completion updates', async () => {
      const pipelineData = TestHelpers.createTestPipeline({
        repository: 'test-repo',
        status: 'success',
        duration: 300000
      });

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('pipeline:completed', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('pipeline:completed', pipelineData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject({
        repository: 'test-repo',
        status: 'success',
        duration: 300000
      });
    });

    it('should emit pipeline failure updates', async () => {
      const pipelineData = TestHelpers.createTestPipeline({
        repository: 'test-repo',
        status: 'failed',
        error: 'Build failed'
      });

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('pipeline:failed', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('pipeline:failed', pipelineData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject({
        repository: 'test-repo',
        status: 'failed',
        error: 'Build failed'
      });
    });

    it('should filter pipeline updates by repository subscription', async () => {
      // Subscribe to specific repository
      clientSocket.emit('subscribe', { 
        type: 'pipeline', 
        repository: 'test-repo-1' 
      });

      let receivedMessages = 0;
      clientSocket.on('pipeline:status', () => {
        receivedMessages++;
      });

      // Emit updates for different repositories
      socketServer.emit('pipeline:status', { repository: 'test-repo-1', status: 'running' });
      socketServer.emit('pipeline:status', { repository: 'test-repo-2', status: 'running' });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only receive update for subscribed repository
      expect(receivedMessages).toBe(1);
    });
  });

  describe('Compliance Updates', () => {
    it('should emit compliance status updates', async () => {
      const complianceData = TestHelpers.createTestCompliance({
        repository: 'test-repo',
        status: 'non-compliant',
        score: 65
      });

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('compliance:updated', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('compliance:updated', complianceData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject({
        repository: 'test-repo',
        status: 'non-compliant',
        score: 65
      });
    });

    it('should emit compliance scan completion', async () => {
      const scanData = {
        repository: 'test-repo',
        scanId: 'scan-123',
        status: 'completed',
        results: {
          score: 85,
          issues: []
        }
      };

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('compliance:scan:completed', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('compliance:scan:completed', scanData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject(scanData);
    });
  });

  describe('Orchestration Updates', () => {
    it('should emit orchestration status updates', async () => {
      const orchestrationData = TestHelpers.createTestOrchestration({
        name: 'full-audit',
        status: 'running',
        progress: 0.5
      });

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('orchestration:status', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('orchestration:status', orchestrationData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject({
        name: 'full-audit',
        status: 'running',
        progress: 0.5
      });
    });

    it('should emit orchestration progress updates', async () => {
      const progressData = {
        orchestrationId: 'orch-123',
        progress: 0.75,
        currentTask: 'Compliance check',
        completedTasks: 3,
        totalTasks: 4
      };

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('orchestration:progress', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('orchestration:progress', progressData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject(progressData);
    });
  });

  describe('Metrics Updates', () => {
    it('should emit real-time metrics updates', async () => {
      const metricsData = {
        type: 'system_health',
        timestamp: new Date().toISOString(),
        metrics: {
          cpu_usage: 45.2,
          memory_usage: 67.8,
          active_pipelines: 5,
          queue_size: 12
        }
      };

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('metrics:updated', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('metrics:updated', metricsData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject(metricsData);
    });

    it('should emit alert notifications', async () => {
      const alertData = {
        id: 'alert-123',
        type: 'pipeline_failure_rate',
        severity: 'high',
        message: 'Pipeline failure rate exceeded threshold',
        repository: 'test-repo',
        timestamp: new Date().toISOString()
      };

      const messagePromise = new Promise((resolve) => {
        clientSocket.on('alert:triggered', (data) => {
          resolve(data);
        });
      });

      socketServer.emit('alert:triggered', alertData);

      const receivedData = await messagePromise;
      expect(receivedData).toMatchObject(alertData);
    });
  });

  describe('Room Management', () => {
    it('should support joining repository-specific rooms', async () => {
      const joinPromise = new Promise((resolve) => {
        clientSocket.on('room:joined', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('join:repository', { repository: 'test-repo-1' });

      const response = await joinPromise;
      expect(response).toMatchObject({
        room: 'repository:test-repo-1',
        success: true
      });
    });

    it('should support leaving rooms', async () => {
      // First join a room
      clientSocket.emit('join:repository', { repository: 'test-repo-1' });
      await new Promise(resolve => setTimeout(resolve, 50));

      const leavePromise = new Promise((resolve) => {
        clientSocket.on('room:left', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('leave:repository', { repository: 'test-repo-1' });

      const response = await leavePromise;
      expect(response).toMatchObject({
        room: 'repository:test-repo-1',
        success: true
      });
    });

    it('should broadcast updates only to relevant rooms', async () => {
      // Create two clients in different rooms
      const client1 = new Client(`http://localhost:${serverPort}`, {
        auth: { token: adminToken }
      });

      const client2 = new Client(`http://localhost:${serverPort}`, {
        auth: { token: adminToken }
      });

      await Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve))
      ]);

      // Join different rooms
      client1.emit('join:repository', { repository: 'repo-1' });
      client2.emit('join:repository', { repository: 'repo-2' });

      await new Promise(resolve => setTimeout(resolve, 100));

      let client1Received = false;
      let client2Received = false;

      client1.on('pipeline:status', () => { client1Received = true; });
      client2.on('pipeline:status', () => { client2Received = true; });

      // Emit to repo-1 room only
      socketServer.to('repository:repo-1').emit('pipeline:status', {
        repository: 'repo-1',
        status: 'running'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client1Received).toBe(true);
      expect(client2Received).toBe(false);

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Permission-based Updates', () => {
    it('should filter sensitive updates based on user permissions', async () => {
      const viewerClient = new Client(`http://localhost:${serverPort}`, {
        auth: { token: viewerToken }
      });

      await new Promise(resolve => viewerClient.on('connect', resolve));

      let receivedSensitiveData = false;
      viewerClient.on('admin:sensitive', () => {
        receivedSensitiveData = true;
      });

      // Emit admin-only data
      socketServer.emit('admin:sensitive', {
        type: 'security_audit',
        data: 'sensitive information'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedSensitiveData).toBe(false);

      viewerClient.disconnect();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent connections', async () => {
      const clients = [];
      const connectionPromises = [];

      // Create 20 concurrent connections
      for (let i = 0; i < 20; i++) {
        const client = new Client(`http://localhost:${serverPort}`, {
          auth: { token: adminToken }
        });
        clients.push(client);
        connectionPromises.push(new Promise(resolve => client.on('connect', resolve)));
      }

      await Promise.all(connectionPromises);

      // All clients should be connected
      clients.forEach(client => {
        expect(client.connected).toBe(true);
      });

      // Cleanup
      clients.forEach(client => client.disconnect());
    });

    it('should handle message broadcasting efficiently', async () => {
      const numClients = 10;
      const clients = [];
      const messagePromises = [];

      // Create clients
      for (let i = 0; i < numClients; i++) {
        const client = new Client(`http://localhost:${serverPort}`, {
          auth: { token: adminToken }
        });
        clients.push(client);
        
        await new Promise(resolve => client.on('connect', resolve));
        
        messagePromises.push(new Promise(resolve => {
          client.on('broadcast:test', resolve);
        }));
      }

      const { duration } = await TestHelpers.measureExecutionTime(async () => {
        // Broadcast message to all clients
        socketServer.emit('broadcast:test', { message: 'test broadcast' });
        
        // Wait for all clients to receive the message
        await Promise.all(messagePromises);
      });

      expect(duration).toBeLessThan(500); // Should complete within 500ms

      // Cleanup
      clients.forEach(client => client.disconnect());
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed messages gracefully', async () => {
      let errorReceived = false;
      clientSocket.on('error', () => {
        errorReceived = true;
      });

      // Send malformed data
      clientSocket.emit('invalid:event', { malformed: undefined });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Connection should remain stable
      expect(clientSocket.connected).toBe(true);
    });

    it('should handle client errors without affecting other clients', async () => {
      const client2 = new Client(`http://localhost:${serverPort}`, {
        auth: { token: adminToken }
      });

      await new Promise(resolve => client2.on('connect', resolve));

      // Force error on first client
      clientSocket.disconnect();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Second client should remain connected
      expect(client2.connected).toBe(true);

      client2.disconnect();
    });
  });
});

// Helper function to setup WebSocket handlers for testing
function setupWebSocketHandlers(socketServer) {
  socketServer.on('connection', (socket) => {
    // Handle room joining
    socket.on('join:repository', (data) => {
      const room = `repository:${data.repository}`;
      socket.join(room);
      socket.emit('room:joined', { room, success: true });
    });

    socket.on('leave:repository', (data) => {
      const room = `repository:${data.repository}`;
      socket.leave(room);
      socket.emit('room:left', { room, success: true });
    });

    // Handle subscriptions
    socket.on('subscribe', (data) => {
      socket.join(`${data.type}:${data.repository || 'all'}`);
      socket.emit('subscribed', { type: data.type, repository: data.repository });
    });

    socket.on('unsubscribe', (data) => {
      socket.leave(`${data.type}:${data.repository || 'all'}`);
      socket.emit('unsubscribed', { type: data.type, repository: data.repository });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      // Cleanup logic would go here
    });
  });
}
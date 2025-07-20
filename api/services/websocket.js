/**
 * Enhanced WebSocket Service for Real-time Updates
 * Phase 2 - Enhanced Dashboard & Pipeline Integration with Socket.io support
 */

const WebSocket = require('ws');
const socketIO = require('socket.io');
const EventEmitter = require('events');

class WebSocketService extends EventEmitter {
  constructor(server, options = {}) {
    super();
    this.server = server;
    this.port = options.port || process.env.WEBSOCKET_PORT || 3073;
    this.wss = null;
    this.io = null;
    this.clients = new Set();
    this.rooms = new Map();
    this.isStarted = false;
    
    // Socket.io support
    this.useSocketIO = options.useSocketIO !== false;
    
    // Event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the WebSocket server with Socket.io support
   */
  start() {
    if (this.isStarted) {
      console.log('WebSocket server already running');
      return;
    }

    if (this.useSocketIO && this.server) {
      // Use Socket.io with existing HTTP server
      this.io = socketIO(this.server, {
        cors: {
          origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
          credentials: true
        },
        transports: ['websocket', 'polling']
      });

      this.setupSocketIOHandlers();
    } else {
      // Fallback to native WebSocket
      this.wss = new WebSocket.Server({ 
        port: this.port,
        clientTracking: true 
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
        this.emit('error', error);
      });
    }

    this.isStarted = true;
    console.log(`WebSocket server started ${this.useSocketIO ? 'with Socket.io' : 'on port ' + this.port}`);
    this.emit('started', { port: this.port, socketIO: this.useSocketIO });
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    if (!this.isStarted || !this.wss) {
      return;
    }

    this.wss.close(() => {
      console.log('WebSocket server stopped');
      this.emit('stopped');
    });
    
    this.clients.clear();
    this.isStarted = false;
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: new Date(),
      lastPing: new Date()
    };

    // Add client to tracking
    ws.clientInfo = clientInfo;
    this.clients.add(ws);

    console.log(`Client connected: ${clientId} from ${clientInfo.ip}`);

    // Setup client event handlers
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(ws, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`Client ${clientId} error:`, error);
    });

    ws.on('pong', () => {
      ws.clientInfo.lastPing = new Date();
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connection',
      message: 'Connected to GitOps Auditor WebSocket',
      clientId: clientId,
      timestamp: new Date().toISOString()
    });

    this.emit('client_connected', clientInfo);
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(ws, code, reason) {
    const clientId = ws.clientInfo?.id || 'unknown';
    this.clients.delete(ws);
    
    console.log(`Client disconnected: ${clientId} (code: ${code})`);
    this.emit('client_disconnected', { 
      clientId, 
      code, 
      reason: reason?.toString() 
    });
  }

  /**
   * Handle incoming message from client
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      const clientId = ws.clientInfo?.id || 'unknown';

      console.log(`Message from ${clientId}:`, message);

      switch (message.type) {
        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        
        case 'subscribe':
          this.handleSubscription(ws, message);
          break;
        
        case 'unsubscribe':
          this.handleUnsubscription(ws, message);
          break;
        
        default:
          console.log(`Unknown message type: ${message.type}`);
      }

      this.emit('message', { clientId, message });
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      this.sendToClient(ws, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle subscription requests (Socket.io and WebSocket compatible)
   */
  handleSubscription(client, message) {
    const { channels } = message;
    
    if (this.useSocketIO) {
      // Socket.io room subscription
      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          client.join(channel);
          console.log(`Socket.io client ${client.id} joined room ${channel}`);
        });
      }
      
      client.emit('subscription_confirmed', {
        channels: channels,
        timestamp: new Date().toISOString()
      });
    } else {
      // Native WebSocket subscription
      if (!client.subscriptions) {
        client.subscriptions = new Set();
      }

      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          client.subscriptions.add(channel);
          console.log(`WebSocket client ${client.clientInfo.id} subscribed to ${channel}`);
        });
      }

      this.sendToClient(client, {
        type: 'subscription_confirmed',
        channels: Array.from(client.subscriptions),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle unsubscription requests (Socket.io and WebSocket compatible)
   */
  handleUnsubscription(client, message) {
    const { channels } = message;
    
    if (this.useSocketIO) {
      // Socket.io room unsubscription
      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          client.leave(channel);
          console.log(`Socket.io client ${client.id} left room ${channel}`);
        });
      }
      
      client.emit('unsubscription_confirmed', {
        channels: channels,
        timestamp: new Date().toISOString()
      });
    } else {
      // Native WebSocket unsubscription
      if (!client.subscriptions) {
        return;
      }

      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          client.subscriptions.delete(channel);
          console.log(`WebSocket client ${client.clientInfo.id} unsubscribed from ${channel}`);
        });
      }

      this.sendToClient(client, {
        type: 'unsubscription_confirmed',
        channels: Array.from(client.subscriptions),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send message to specific client (Socket.io and WebSocket compatible)
   */
  sendToClient(client, data) {
    if (this.useSocketIO) {
      // Socket.io emit
      client.emit(data.type || 'message', data);
    } else {
      // Native WebSocket send
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    }
  }

  /**
   * Broadcast message to all connected clients (Socket.io and WebSocket compatible)
   */
  broadcast(data, channel = null) {
    if (this.useSocketIO && this.io) {
      // Socket.io broadcast
      if (channel) {
        this.io.to(channel).emit(data.type || 'message', data);
      } else {
        this.io.emit(data.type || 'message', data);
      }
    } else {
      // Native WebSocket broadcast
      const message = JSON.stringify(data);
      
      this.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          // If channel specified, only send to subscribed clients
          if (channel && ws.subscriptions && !ws.subscriptions.has(channel)) {
            return;
          }
          
          ws.send(message);
        }
      });
    }

    console.log(`Broadcasted message to ${this.clients.size} clients${channel ? ` on channel ${channel}` : ''}`);
  }

  /**
   * Send audit report update
   */
  broadcastAuditUpdate(report) {
    this.broadcast({
      type: 'audit_update',
      data: report,
      timestamp: new Date().toISOString()
    }, 'audit');
  }

  /**
   * Send pipeline status update
   */
  broadcastPipelineUpdate(pipelineId, status, data = {}) {
    this.broadcast({
      type: 'pipeline_update',
      pipelineId,
      status,
      data,
      timestamp: new Date().toISOString()
    }, 'pipeline');
  }

  /**
   * Send system health update
   */
  broadcastHealthUpdate(metrics) {
    this.broadcast({
      type: 'health_update',
      metrics,
      timestamp: new Date().toISOString()
    }, 'health');
  }

  /**
   * Setup Socket.io handlers
   */
  setupSocketIOHandlers() {
    if (!this.io) return;

    this.io.use(async (socket, next) => {
      try {
        // Authentication middleware can be added here
        // const token = socket.handshake.auth.token;
        // const user = await verifyToken(token);
        // socket.userId = user.id;
        next();
      } catch (err) {
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Socket.io client connected:', socket.id);
      this.clients.add(socket);

      // Handle client events
      socket.on('subscribe', (data) => this.handleSubscription(socket, data));
      socket.on('unsubscribe', (data) => this.handleUnsubscription(socket, data));
      socket.on('ping', (timestamp) => {
        socket.emit('pong', timestamp);
      });

      // Handle optimistic update responses
      socket.on('repository:update', (data) => this.handleOptimisticUpdate(socket, 'repository:update', data));
      socket.on('compliance:update', (data) => this.handleOptimisticUpdate(socket, 'compliance:update', data));
      socket.on('template:apply', (data) => this.handleOptimisticUpdate(socket, 'template:apply', data));
      socket.on('pipeline:trigger', (data) => this.handleOptimisticUpdate(socket, 'pipeline:trigger', data));
      socket.on('bulk:operation', (data) => this.handleOptimisticUpdate(socket, 'bulk:operation', data));

      socket.on('disconnect', (reason) => {
        console.log('Socket.io client disconnected:', socket.id, reason);
        this.clients.delete(socket);
      });

      socket.on('error', (error) => {
        console.error('Socket.io client error:', socket.id, error);
      });

      // Send welcome message
      socket.emit('connection', {
        message: 'Connected to GitOps Auditor Socket.io',
        clientId: socket.id,
        timestamp: new Date().toISOString()
      });

      this.emit('client_connected', { id: socket.id, transport: 'socket.io' });
    });
  }

  /**
   * Handle optimistic update requests
   */
  async handleOptimisticUpdate(socket, action, data) {
    try {
      // Process the update based on action type
      let result;
      
      switch (action) {
        case 'repository:update':
          result = await this.processRepositoryUpdate(data);
          break;
        case 'compliance:update':
          result = await this.processComplianceUpdate(data);
          break;
        case 'template:apply':
          result = await this.processTemplateApplication(data);
          break;
        case 'pipeline:trigger':
          result = await this.processPipelineTrigger(data);
          break;
        case 'bulk:operation':
          result = await this.processBulkOperation(data);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Send success response
      socket.emit(`${action}:success`, {
        actionId: data.actionId,
        success: true,
        result,
        message: 'Update completed successfully'
      });

    } catch (error) {
      console.error(`Optimistic update failed for ${action}:`, error);
      
      // Send error response
      socket.emit(`${action}:error`, {
        actionId: data.actionId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Process repository update
   */
  async processRepositoryUpdate(data) {
    // Implement actual repository update logic here
    // This would typically involve calling your repository service
    console.log('Processing repository update:', data);
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Broadcast the update to other clients
    this.broadcastRepositoryUpdate(data.repository, data.updates);
    
    return { repository: data.repository, updated: true };
  }

  /**
   * Process compliance update
   */
  async processComplianceUpdate(data) {
    console.log('Processing compliance update:', data);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Broadcast compliance change
    this.broadcast({
      type: 'compliance:changed',
      repository: data.repository,
      compliant: data.compliant,
      timestamp: new Date().toISOString()
    });
    
    return { repository: data.repository, compliant: data.compliant };
  }

  /**
   * Process template application
   */
  async processTemplateApplication(data) {
    console.log('Processing template application:', data);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Broadcast template applied event
    this.broadcast({
      type: 'template:applied',
      repository: data.repository,
      templateId: data.templateId,
      success: true,
      timestamp: new Date().toISOString()
    });
    
    return { repository: data.repository, templateId: data.templateId, applied: true };
  }

  /**
   * Process pipeline trigger
   */
  async processPipelineTrigger(data) {
    console.log('Processing pipeline trigger:', data);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Broadcast pipeline started event
    this.broadcastPipelineStarted({
      repository: data.repository,
      workflow: data.workflow,
      runId: Date.now(),
      actor: 'user',
      branch: 'main'
    });
    
    return { repository: data.repository, workflow: data.workflow, triggered: true };
  }

  /**
   * Process bulk operation
   */
  async processBulkOperation(data) {
    console.log('Processing bulk operation:', data);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Broadcast bulk update completion
    this.broadcast({
      type: 'bulk:completed',
      operation: data.operation,
      targets: data.targets,
      success: true,
      timestamp: new Date().toISOString()
    });
    
    return { operation: data.operation, targets: data.targets, completed: true };
  }

  /**
   * Broadcast repository update
   */
  broadcastRepositoryUpdate(repository, updates) {
    this.broadcast({
      type: 'repo:updated',
      repository,
      changes: updates,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Setup event handlers for integration
   */
  setupEventHandlers() {
    // Start ping/pong to keep connections alive
    setInterval(() => {
      this.clients.forEach(client => {
        if (this.useSocketIO) {
          // Socket.io handles pinging automatically
          if (!client.connected) {
            this.clients.delete(client);
          }
        } else {
          // Native WebSocket ping
          if (client.readyState === WebSocket.OPEN) {
            client.ping();
          } else {
            this.clients.delete(client);
          }
        }
      });
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Enhanced Pipeline WebSocket Events
   */

  /**
   * Broadcast pipeline started event
   */
  broadcastPipelineStarted(data) {
    this.broadcast({
      type: 'pipeline:started',
      data: {
        repository: data.repository,
        workflow: data.workflow,
        branch: data.branch,
        runId: data.runId,
        actor: data.actor,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Broadcast pipeline completed event
   */
  broadcastPipelineCompleted(data) {
    this.broadcast({
      type: 'pipeline:completed',
      data: {
        repository: data.repository,
        workflow: data.workflow,
        branch: data.branch,
        runId: data.runId,
        status: data.status,
        conclusion: data.conclusion,
        duration: data.duration,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Broadcast pipeline failed event
   */
  broadcastPipelineFailed(data) {
    this.broadcast({
      type: 'pipeline:failed',
      data: {
        repository: data.repository,
        workflow: data.workflow,
        branch: data.branch,
        runId: data.runId,
        error: data.error,
        failedStep: data.failedStep,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Broadcast pipeline step update event
   */
  broadcastPipelineStepUpdate(data) {
    this.broadcast({
      type: 'pipeline:step-update',
      data: {
        repository: data.repository,
        workflow: data.workflow,
        runId: data.runId,
        jobId: data.jobId,
        stepName: data.stepName,
        stepStatus: data.stepStatus,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Broadcast pipeline metrics update
   */
  broadcastPipelineMetrics(data) {
    this.broadcast({
      type: 'pipeline:metrics',
      data: {
        repository: data.repository,
        successRate: data.successRate,
        averageDuration: data.averageDuration,
        totalRuns: data.totalRuns,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Broadcast pipeline status summary
   */
  broadcastPipelineStatusSummary(data) {
    this.broadcast({
      type: 'pipeline:status-summary',
      data: {
        totalPipelines: data.totalPipelines,
        running: data.running,
        pending: data.pending,
        failed: data.failed,
        successful: data.successful,
        repositories: data.repositories,
        timestamp: new Date().toISOString()
      }
    }, 'pipelines');
  }

  /**
   * Generic pipeline event emitter for Phase 2 integration
   */
  emitPipelineEvent(eventType, data) {
    const eventTypeMap = {
      'pipeline.started': this.broadcastPipelineStarted.bind(this),
      'pipeline.completed': this.broadcastPipelineCompleted.bind(this),
      'pipeline.failed': this.broadcastPipelineFailed.bind(this),
      'pipeline.step-update': this.broadcastPipelineStepUpdate.bind(this),
      'pipeline.metrics': this.broadcastPipelineMetrics.bind(this),
      'pipeline.status-summary': this.broadcastPipelineStatusSummary.bind(this)
    };

    const emitter = eventTypeMap[eventType];
    if (emitter) {
      emitter(data);
    } else {
      console.warn(`Unknown pipeline event type: ${eventType}`);
      // Fallback to generic broadcast
      this.broadcast({
        type: eventType,
        data,
        timestamp: new Date().toISOString()
      }, 'pipelines');
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const baseStats = {
      isRunning: this.isStarted,
      port: this.port,
      clientCount: this.clients.size,
      protocol: this.useSocketIO ? 'socket.io' : 'websocket'
    };

    if (this.useSocketIO && this.io) {
      // Socket.io statistics
      const clients = Array.from(this.clients).map(socket => ({
        id: socket.id,
        connected: socket.connected,
        rooms: Array.from(socket.rooms),
        transport: socket.conn?.transport?.name || 'unknown'
      }));

      return {
        ...baseStats,
        clients,
        rooms: this.io.sockets.adapter.rooms.size
      };
    } else {
      // Native WebSocket statistics
      const clients = Array.from(this.clients).map(ws => ({
        id: ws.clientInfo?.id,
        ip: ws.clientInfo?.ip,
        connectedAt: ws.clientInfo?.connectedAt,
        subscriptions: ws.subscriptions ? Array.from(ws.subscriptions) : []
      }));

      return {
        ...baseStats,
        clients
      };
    }
  }
}

module.exports = WebSocketService;
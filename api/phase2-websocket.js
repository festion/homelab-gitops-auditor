// Phase 2 WebSocket Extensions
// Adds real-time update channels for Phase 2 DevOps platform features

const WebSocket = require('ws');

class Phase2WebSocketExtension {
  constructor(websocketManager) {
    this.wsManager = websocketManager;
    this.channels = new Map();
    this.subscriptions = new Map(); // Track client subscriptions
    
    // Initialize Phase 2 channels
    this.initializeChannels();
    
    // Extend the original WebSocket manager
    this.extendWebSocketManager();
    
    console.log('🚀 Phase 2 WebSocket extensions initialized');
  }

  initializeChannels() {
    // Define Phase 2 real-time channels
    const channels = [
      {
        name: 'templates',
        description: 'Template management updates',
        events: ['template.created', 'template.updated', 'template.applied', 'template.deleted']
      },
      {
        name: 'pipelines',
        description: 'Pipeline execution and status updates',
        events: [
          'pipeline.started', 
          'pipeline.progress', 
          'pipeline.completed', 
          'pipeline.failed', 
          'pipeline.stage.update',
          'pipeline.triggered',
          'pipeline.step-update',
          'pipeline.metrics',
          'pipeline.status-summary'
        ]
      },
      {
        name: 'dependencies',
        description: 'Dependency graph and impact analysis updates',
        events: ['dependency.added', 'dependency.removed', 'dependency.updated', 'impact.analyzed', 'vulnerability.detected']
      },
      {
        name: 'quality',
        description: 'Quality gate validation updates',
        events: ['quality.check.started', 'quality.check.progress', 'quality.check.completed', 'quality.threshold.changed']
      },
      {
        name: 'compliance',
        description: 'Template compliance tracking and application updates',
        events: [
          'compliance.checked',
          'compliance.job-started',
          'compliance.job-progress', 
          'compliance.job-completed',
          'compliance.job-failed',
          'compliance.application-started',
          'compliance.application-completed',
          'compliance.application-failed',
          'status.requested',
          'repository.checked',
          'check.triggered',
          'templates.requested',
          'history.requested',
          'template.applied'
        ]
      },
      {
        name: 'operations',
        description: 'General operation status updates',
        events: ['operation.started', 'operation.progress', 'operation.completed', 'operation.failed']
      }
    ];

    channels.forEach(channel => {
      this.channels.set(channel.name, {
        ...channel,
        subscribers: new Set()
      });
    });
  }

  extendWebSocketManager() {
    const originalSetupWebSocket = this.wsManager.setupWebSocket.bind(this.wsManager);
    
    // Override setupWebSocket to add Phase 2 message handling
    this.wsManager.setupWebSocket = () => {
      originalSetupWebSocket();
      
      // Extend the WebSocket route handler
      const wsRoute = this.wsManager.app._router.stack.find(
        layer => layer.route && layer.route.path === '/ws'
      );
      
      if (wsRoute) {
        const originalHandler = wsRoute.route.stack[0].handle;
        
        wsRoute.route.stack[0].handle = (ws, req) => {
          // Call original handler
          originalHandler(ws, req);
          
          // Add Phase 2 extensions
          this.setupClientExtensions(ws);
        };
      }
    };

    // Add Phase 2-specific message handler
    const originalHandleMessage = this.wsManager.handleClientMessage.bind(this.wsManager);
    
    this.wsManager.handleClientMessage = (ws, message) => {
      // Handle Phase 2 messages
      if (this.handlePhase2Message(ws, message)) {
        return;
      }
      
      // Fall back to original handler
      originalHandleMessage(ws, message);
    };
  }

  setupClientExtensions(ws) {
    // Initialize client subscription tracking
    const clientId = this.generateClientId();
    ws.clientId = clientId;
    this.subscriptions.set(clientId, new Set());

    // Send available channels on connection
    ws.send(JSON.stringify({
      type: 'phase2.channels',
      channels: Array.from(this.channels.entries()).map(([name, channel]) => ({
        name,
        description: channel.description,
        events: channel.events
      })),
      timestamp: new Date().toISOString()
    }));

    // Clean up on disconnect
    const originalClose = ws.onclose;
    ws.onclose = (event) => {
      this.cleanupClient(clientId);
      if (originalClose) originalClose(event);
    };
  }

  handlePhase2Message(ws, message) {
    switch (message.type) {
      case 'phase2.subscribe':
        return this.handleSubscribe(ws, message);
        
      case 'phase2.unsubscribe':
        return this.handleUnsubscribe(ws, message);
        
      case 'phase2.list-subscriptions':
        return this.handleListSubscriptions(ws);
        
      default:
        return false; // Not a Phase 2 message
    }
  }

  handleSubscribe(ws, message) {
    const { channels } = message;
    if (!Array.isArray(channels)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid subscription request: channels must be an array'
      }));
      return true;
    }

    const clientId = ws.clientId;
    const clientSubs = this.subscriptions.get(clientId);
    const subscribed = [];
    const failed = [];

    channels.forEach(channelName => {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.subscribers.add(clientId);
        clientSubs.add(channelName);
        subscribed.push(channelName);
      } else {
        failed.push(channelName);
      }
    });

    ws.send(JSON.stringify({
      type: 'phase2.subscribed',
      subscribed,
      failed,
      timestamp: new Date().toISOString()
    }));

    return true;
  }

  handleUnsubscribe(ws, message) {
    const { channels } = message;
    if (!Array.isArray(channels)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid unsubscribe request: channels must be an array'
      }));
      return true;
    }

    const clientId = ws.clientId;
    const clientSubs = this.subscriptions.get(clientId);
    const unsubscribed = [];

    channels.forEach(channelName => {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.subscribers.delete(clientId);
        clientSubs.delete(channelName);
        unsubscribed.push(channelName);
      }
    });

    ws.send(JSON.stringify({
      type: 'phase2.unsubscribed',
      unsubscribed,
      timestamp: new Date().toISOString()
    }));

    return true;
  }

  handleListSubscriptions(ws) {
    const clientId = ws.clientId;
    const clientSubs = this.subscriptions.get(clientId);
    
    ws.send(JSON.stringify({
      type: 'phase2.subscriptions',
      subscriptions: Array.from(clientSubs),
      timestamp: new Date().toISOString()
    }));

    return true;
  }

  cleanupClient(clientId) {
    // Remove client from all channel subscriptions
    const clientSubs = this.subscriptions.get(clientId);
    if (clientSubs) {
      clientSubs.forEach(channelName => {
        const channel = this.channels.get(channelName);
        if (channel) {
          channel.subscribers.delete(clientId);
        }
      });
      this.subscriptions.delete(clientId);
    }
  }

  // Public API for emitting events
  emit(channelName, eventType, data) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Unknown channel: ${channelName}`);
      return;
    }

    if (!channel.events.includes(eventType)) {
      console.warn(`Unknown event type ${eventType} for channel ${channelName}`);
      return;
    }

    const message = JSON.stringify({
      type: 'phase2.event',
      channel: channelName,
      event: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    // Send to all subscribers of this channel
    let sent = 0;
    channel.subscribers.forEach(clientId => {
      const ws = this.findClientWebSocket(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          sent++;
        } catch (error) {
          console.error(`Error sending to client ${clientId}:`, error);
        }
      }
    });

    console.log(`📡 Phase 2 event ${channelName}.${eventType} sent to ${sent} clients`);
  }

  findClientWebSocket(clientId) {
    for (const ws of this.wsManager.clients) {
      if (ws.clientId === clientId) {
        return ws;
      }
    }
    return null;
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Convenience methods for common events
  emitTemplateUpdate(eventType, templateData) {
    this.emit('templates', eventType, templateData);
  }

  emitPipelineUpdate(eventType, pipelineData) {
    this.emit('pipelines', eventType, pipelineData);
  }

  emitDependencyUpdate(eventType, dependencyData) {
    this.emit('dependencies', eventType, dependencyData);
  }

  emitQualityUpdate(eventType, qualityData) {
    this.emit('quality', eventType, qualityData);
  }

  emitOperationUpdate(eventType, operationData) {
    this.emit('operations', eventType, operationData);
  }

  // Metrics and monitoring
  getMetrics() {
    const metrics = {
      channels: {},
      totalSubscriptions: 0
    };

    this.channels.forEach((channel, name) => {
      metrics.channels[name] = {
        subscribers: channel.subscribers.size,
        events: channel.events.length
      };
      metrics.totalSubscriptions += channel.subscribers.size;
    });

    metrics.activeClients = this.subscriptions.size;

    return metrics;
  }
}

module.exports = Phase2WebSocketExtension;
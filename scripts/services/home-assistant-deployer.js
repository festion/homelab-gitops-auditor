#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const DeploymentQueue = require('./deployment-queue');
const WebhookHandler = require('./webhook-handler');
const MCPCoordinator = require('./mcp-coordinator');
const DeploymentRepository = require('./database/deployment-repository');
const Logger = require('./utils/logger');
const Validator = require('./utils/validator');
const Security = require('./utils/security');

const execAsync = promisify(exec);

class HomeAssistantDeployer {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../config/deployment-config.json');
    this.config = null;
    this.app = null;
    this.server = null;
    this.io = null;
    this.logger = null;
    
    this.deploymentQueue = null;
    this.webhookHandler = null;
    this.mcpCoordinator = null;
    this.deploymentRepository = null;
    this.validator = null;
    this.security = null;
    
    this.currentDeployment = null;
    this.isProcessingQueue = false;
    this.serviceStartTime = new Date();
    
    this.deploymentStates = {
      QUEUED: 'queued',
      IN_PROGRESS: 'in-progress',
      COMPLETED: 'completed',
      FAILED: 'failed',
      ROLLED_BACK: 'rolled-back'
    };
  }

  async initialize() {
    try {
      await this.loadConfiguration();
      this.initializeLogger();
      await this.initializeDatabase();
      await this.initializeDependencies();
      this.setupExpress();
      this.setupRoutes();
      this.setupWebSocket();
      this.setupSignalHandlers();
      
      this.logger.info('Home Assistant Deployer service initialized successfully', {
        component: 'HomeAssistantDeployer',
        version: '1.0.0',
        configPath: this.configPath
      });
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to initialize service', { error: error.message, stack: error.stack });
      } else {
        console.error('Failed to initialize service:', error);
      }
      throw error;
    }
  }

  async loadConfiguration() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      this.config.api = {
        port: process.env.DEPLOYER_PORT || 3071,
        host: process.env.DEPLOYER_HOST || '0.0.0.0',
        corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://192.168.1.58']
      };
      
      this.config.webhook = {
        secret: process.env.GITHUB_WEBHOOK_SECRET || 'github-webhook-secret',
        allowedEvents: ['repository_dispatch', 'push']
      };
      
      this.config.mcp = {
        networkFs: {
          wrapper: process.env.NETWORK_MCP_WRAPPER || '/home/dev/workspace/network-mcp-wrapper.sh',
          timeout: 30000
        },
        github: {
          wrapper: process.env.GITHUB_MCP_WRAPPER || '/home/dev/workspace/github-wrapper.sh',
          timeout: 30000
        }
      };
      
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  initializeLogger() {
    this.logger = new Logger({
      level: this.config.loggingConfig?.level || 'info',
      format: this.config.loggingConfig?.logFormat || 'json',
      destinations: this.config.loggingConfig?.logDestinations || ['file', 'console'],
      logFile: path.join(__dirname, '../../', this.config.loggingConfig?.logFile || 'logs/deployment.log'),
      maxSize: this.config.loggingConfig?.maxLogSize || '100MB',
      retention: this.config.loggingConfig?.logRetentionDays || 30
    });
  }

  async initializeDatabase() {
    this.deploymentRepository = new DeploymentRepository({
      database: {
        type: 'sqlite',
        path: path.join(__dirname, '../../logs/deployments.db')
      }
    });
    
    await this.deploymentRepository.initialize();
  }

  async initializeDependencies() {
    this.validator = new Validator(this.config);
    this.security = new Security(this.config);
    
    this.deploymentQueue = new DeploymentQueue({
      logger: this.logger,
      deploymentRepository: this.deploymentRepository
    });
    
    this.webhookHandler = new WebhookHandler({
      secret: this.config.webhook.secret,
      allowedEvents: this.config.webhook.allowedEvents,
      logger: this.logger,
      security: this.security
    });
    
    this.mcpCoordinator = new MCPCoordinator({
      networkFsWrapper: this.config.mcp.networkFs.wrapper,
      githubWrapper: this.config.mcp.github.wrapper,
      timeout: this.config.mcp.networkFs.timeout,
      logger: this.logger
    });
    
    await this.mcpCoordinator.initialize();
  }

  setupExpress() {
    this.app = express();
    this.server = createServer(this.app);
    
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));
    
    this.app.use(cors({
      origin: this.config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-GitHub-Event', 'X-GitHub-Delivery', 'X-Hub-Signature-256']
    }));
    
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    
    this.app.use(limiter);
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    this.app.use((req, res, next) => {
      req.correlationId = uuidv4();
      this.logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        correlationId: req.correlationId,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  setupRoutes() {
    this.app.get('/health', this.handleHealthCheck.bind(this));
    this.app.get('/api/status', this.handleServiceStatus.bind(this));
    
    this.app.post('/api/deployments/home-assistant-config/deploy', this.handleDeploy.bind(this));
    this.app.get('/api/deployments/home-assistant-config/status', this.handleGetStatus.bind(this));
    this.app.post('/api/deployments/home-assistant-config/rollback', this.handleRollback.bind(this));
    this.app.get('/api/deployments/home-assistant-config/history', this.handleGetHistory.bind(this));
    this.app.get('/api/deployments/home-assistant-config/logs', this.handleGetLogs.bind(this));
    
    this.app.post('/api/webhooks/github', this.handleWebhook.bind(this));
    
    this.app.get('/api/queue/status', this.handleQueueStatus.bind(this));
    this.app.delete('/api/queue/clear', this.handleClearQueue.bind(this));
    
    this.app.use((err, req, res, next) => {
      this.logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        correlationId: req.correlationId,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({
        error: 'Internal server error',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    });
    
    this.app.use((req, res) => {
      this.logger.warn('Route not found', {
        url: req.url,
        method: req.method,
        correlationId: req.correlationId
      });
      
      res.status(404).json({
        error: 'Route not found',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    });
  }

  setupWebSocket() {
    this.io = new Server(this.server, {
      cors: {
        origin: this.config.api.corsOrigins,
        methods: ['GET', 'POST']
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });
    
    this.io.on('connection', (socket) => {
      const clientId = uuidv4();
      this.logger.info('WebSocket client connected', { clientId, socketId: socket.id });
      
      socket.on('subscribe', (data) => {
        const { channel } = data;
        if (channel === 'deployments') {
          socket.join('deployments');
          this.logger.debug('Client subscribed to deployments channel', { clientId, socketId: socket.id });
          
          socket.emit('status', {
            currentDeployment: this.currentDeployment,
            queueLength: this.deploymentQueue ? this.deploymentQueue.getQueueLength() : 0,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      socket.on('disconnect', (reason) => {
        this.logger.info('WebSocket client disconnected', { clientId, socketId: socket.id, reason });
      });
    });
  }

  setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      try {
        if (this.currentDeployment) {
          this.logger.warn('Deployment in progress during shutdown, marking as failed');
          await this.updateDeploymentStatus(this.currentDeployment.id, this.deploymentStates.FAILED, {
            error: 'Service shutdown during deployment'
          });
        }
        
        if (this.server) {
          this.server.close(() => {
            this.logger.info('HTTP server closed');
          });
        }
        
        if (this.mcpCoordinator) {
          await this.mcpCoordinator.cleanup();
        }
        
        if (this.deploymentRepository) {
          await this.deploymentRepository.close();
        }
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown', { error: error.message });
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', { reason, promise });
    });
  }

  async handleHealthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.serviceStartTime.getTime()) / 1000),
        version: '1.0.0',
        correlationId: req.correlationId
      };
      
      const mcpHealth = await this.mcpCoordinator.checkHealth();
      health.dependencies = {
        mcp: mcpHealth,
        database: await this.deploymentRepository.checkHealth(),
        queue: {
          status: this.deploymentQueue ? 'healthy' : 'unhealthy',
          length: this.deploymentQueue ? this.deploymentQueue.getQueueLength() : 0
        }
      };
      
      const isHealthy = Object.values(health.dependencies).every(dep => 
        dep.status === 'healthy' || dep.status === 'connected'
      );
      
      if (!isHealthy) {
        health.status = 'degraded';
        res.status(503);
      }
      
      res.json(health);
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message, correlationId: req.correlationId });
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      });
    }
  }

  async handleServiceStatus(req, res) {
    try {
      const status = {
        service: 'home-assistant-deployer',
        version: '1.0.0',
        uptime: Math.floor((Date.now() - this.serviceStartTime.getTime()) / 1000),
        currentDeployment: this.currentDeployment,
        queueLength: this.deploymentQueue.getQueueLength(),
        isProcessingQueue: this.isProcessingQueue,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      };
      
      res.json(status);
    } catch (error) {
      this.logger.error('Failed to get service status', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to get service status',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleDeploy(req, res) {
    try {
      const deploymentRequest = await this.validator.validateDeploymentRequest(req.body);
      
      const deploymentId = uuidv4();
      const deployment = {
        id: deploymentId,
        repository: deploymentRequest.repository || this.config.homeAssistantConfig.repository,
        branch: deploymentRequest.branch || this.config.homeAssistantConfig.branch || 'main',
        requestedBy: deploymentRequest.requestedBy || 'api',
        requestedAt: new Date().toISOString(),
        correlationId: req.correlationId,
        priority: deploymentRequest.priority || 'normal',
        dryRun: deploymentRequest.dryRun || false,
        parameters: deploymentRequest.parameters || {}
      };
      
      await this.deploymentQueue.enqueue(deployment);
      await this.deploymentRepository.createDeployment(deployment);
      
      this.logger.info('Deployment queued', { deploymentId, correlationId: req.correlationId });
      
      this.broadcastUpdate('deployment_queued', deployment);
      
      if (!this.isProcessingQueue) {
        setImmediate(() => this.processDeploymentQueue());
      }
      
      res.status(202).json({
        deploymentId,
        status: this.deploymentStates.QUEUED,
        message: 'Deployment request accepted and queued',
        queuePosition: this.deploymentQueue.getQueueLength(),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to queue deployment', { error: error.message, correlationId: req.correlationId });
      res.status(400).json({
        error: error.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleGetStatus(req, res) {
    try {
      const deploymentId = req.query.deploymentId;
      
      if (deploymentId) {
        const deployment = await this.deploymentRepository.getDeployment(deploymentId);
        if (!deployment) {
          return res.status(404).json({
            error: 'Deployment not found',
            deploymentId,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          deployment,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      } else {
        const status = {
          currentDeployment: this.currentDeployment,
          queueLength: this.deploymentQueue.getQueueLength(),
          isProcessingQueue: this.isProcessingQueue,
          recentDeployments: await this.deploymentRepository.getRecentDeployments(5),
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        };
        
        res.json(status);
      }
    } catch (error) {
      this.logger.error('Failed to get deployment status', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to get deployment status',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleRollback(req, res) {
    try {
      const { deploymentId } = req.body;
      
      if (!deploymentId) {
        return res.status(400).json({
          error: 'Deployment ID is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      const deployment = await this.deploymentRepository.getDeployment(deploymentId);
      if (!deployment) {
        return res.status(404).json({
          error: 'Deployment not found',
          deploymentId,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      if (deployment.status !== this.deploymentStates.COMPLETED && deployment.status !== this.deploymentStates.FAILED) {
        return res.status(400).json({
          error: 'Can only rollback completed or failed deployments',
          deploymentId,
          currentStatus: deployment.status,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      const rollbackId = await this.triggerRollback(deploymentId, req.correlationId);
      
      res.json({
        rollbackId,
        originalDeploymentId: deploymentId,
        message: 'Rollback initiated successfully',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to initiate rollback', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to initiate rollback',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleGetHistory(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const status = req.query.status;
      
      const history = await this.deploymentRepository.getDeploymentHistory({
        page,
        limit,
        status
      });
      
      res.json({
        ...history,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get deployment history', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to get deployment history',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleGetLogs(req, res) {
    try {
      const deploymentId = req.query.deploymentId;
      const lines = Math.min(parseInt(req.query.lines) || 100, 1000);
      
      if (!deploymentId) {
        return res.status(400).json({
          error: 'Deployment ID is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      const logs = await this.deploymentRepository.getDeploymentLogs(deploymentId, lines);
      
      res.json({
        deploymentId,
        logs,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get deployment logs', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to get deployment logs',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleWebhook(req, res) {
    try {
      const signature = req.get('X-Hub-Signature-256');
      const event = req.get('X-GitHub-Event');
      const delivery = req.get('X-GitHub-Delivery');
      
      if (!await this.webhookHandler.validateSignature(signature, req.body)) {
        this.logger.warn('Invalid webhook signature', { delivery, correlationId: req.correlationId });
        return res.status(401).json({
          error: 'Invalid signature',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await this.webhookHandler.processWebhook({
        event,
        delivery,
        payload: req.body,
        correlationId: req.correlationId
      });
      
      if (result.shouldDeploy) {
        const deploymentId = await this.triggerDeployment({
          repository: result.repository,
          branch: result.branch,
          requestedBy: 'webhook',
          trigger: 'github_webhook',
          correlationId: req.correlationId,
          webhookData: {
            event,
            delivery,
            repository: result.repository,
            branch: result.branch
          }
        });
        
        result.deploymentId = deploymentId;
      }
      
      res.json({
        ...result,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Webhook processing failed', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Webhook processing failed',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleQueueStatus(req, res) {
    try {
      const queueStatus = await this.deploymentQueue.getStatus();
      
      res.json({
        ...queueStatus,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get queue status', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to get queue status',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleClearQueue(req, res) {
    try {
      const clearedCount = await this.deploymentQueue.clear();
      
      this.logger.info('Deployment queue cleared', { clearedCount, correlationId: req.correlationId });
      
      this.broadcastUpdate('queue_cleared', { clearedCount });
      
      res.json({
        message: 'Queue cleared successfully',
        clearedCount,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to clear queue', { error: error.message, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Failed to clear queue',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  async triggerDeployment(params) {
    const deploymentId = uuidv4();
    const deployment = {
      id: deploymentId,
      repository: params.repository || this.config.homeAssistantConfig.repository,
      branch: params.branch || this.config.homeAssistantConfig.branch || 'main',
      requestedBy: params.requestedBy || 'api',
      requestedAt: new Date().toISOString(),
      correlationId: params.correlationId || uuidv4(),
      priority: params.priority || 'normal',
      trigger: params.trigger || 'manual',
      webhookData: params.webhookData || null,
      parameters: params.parameters || {}
    };
    
    await this.deploymentQueue.enqueue(deployment);
    await this.deploymentRepository.createDeployment(deployment);
    
    this.logger.info('Deployment triggered', { deploymentId, trigger: deployment.trigger });
    
    this.broadcastUpdate('deployment_queued', deployment);
    
    if (!this.isProcessingQueue) {
      setImmediate(() => this.processDeploymentQueue());
    }
    
    return deploymentId;
  }

  async triggerRollback(originalDeploymentId, correlationId) {
    const originalDeployment = await this.deploymentRepository.getDeployment(originalDeploymentId);
    if (!originalDeployment || !originalDeployment.backupPath) {
      throw new Error('No backup available for rollback');
    }
    
    const rollbackId = uuidv4();
    const rollback = {
      id: rollbackId,
      type: 'rollback',
      originalDeploymentId,
      backupPath: originalDeployment.backupPath,
      requestedBy: 'api',
      requestedAt: new Date().toISOString(),
      correlationId: correlationId || uuidv4(),
      priority: 'high'
    };
    
    await this.deploymentQueue.enqueue(rollback);
    await this.deploymentRepository.createDeployment(rollback);
    
    this.logger.info('Rollback triggered', { rollbackId, originalDeploymentId });
    
    this.broadcastUpdate('rollback_queued', rollback);
    
    if (!this.isProcessingQueue) {
      setImmediate(() => this.processDeploymentQueue());
    }
    
    return rollbackId;
  }

  async processDeploymentQueue() {
    if (this.isProcessingQueue) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      while (this.deploymentQueue.hasItems()) {
        const deployment = await this.deploymentQueue.dequeue();
        if (!deployment) break;
        
        this.currentDeployment = deployment;
        this.broadcastUpdate('deployment_started', deployment);
        
        try {
          await this.executeDeployment(deployment);
        } catch (error) {
          this.logger.error('Deployment execution failed', {
            deploymentId: deployment.id,
            error: error.message,
            stack: error.stack
          });
          
          await this.updateDeploymentStatus(deployment.id, this.deploymentStates.FAILED, {
            error: error.message,
            completedAt: new Date().toISOString()
          });
          
          this.broadcastUpdate('deployment_failed', { ...deployment, error: error.message });
        }
        
        this.currentDeployment = null;
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async executeDeployment(deployment) {
    this.logger.info('Starting deployment execution', { deploymentId: deployment.id });
    
    await this.updateDeploymentStatus(deployment.id, this.deploymentStates.IN_PROGRESS, {
      startedAt: new Date().toISOString()
    });
    
    try {
      if (deployment.type === 'rollback') {
        await this.executeRollback(deployment);
      } else {
        await this.executeNormalDeployment(deployment);
      }
      
      await this.updateDeploymentStatus(deployment.id, this.deploymentStates.COMPLETED, {
        completedAt: new Date().toISOString()
      });
      
      this.logger.info('Deployment completed successfully', { deploymentId: deployment.id });
      this.broadcastUpdate('deployment_completed', deployment);
      
    } catch (error) {
      await this.updateDeploymentStatus(deployment.id, this.deploymentStates.FAILED, {
        error: error.message,
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async executeNormalDeployment(deployment) {
    const scriptPath = path.join(__dirname, '../deploy-home-assistant-config.sh');
    const logFile = path.join(__dirname, '../../logs', `deployment-${deployment.id}.log`);
    
    const command = [
      scriptPath,
      deployment.dryRun ? '--dry-run' : '',
      '--verbose'
    ].filter(Boolean).join(' ');
    
    this.logger.info('Executing deployment script', { 
      deploymentId: deployment.id,
      command,
      logFile
    });
    
    const env = {
      ...process.env,
      DEPLOYMENT_ID: deployment.id,
      REPOSITORY: deployment.repository,
      BRANCH: deployment.branch,
      LOG_FILE: logFile
    };
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        env,
        timeout: this.config.homeAssistantConfig.deploymentTimeout * 1000 || 300000,
        maxBuffer: 1024 * 1024 * 10
      });
      
      await this.deploymentRepository.addDeploymentLog(deployment.id, 'stdout', stdout);
      if (stderr) {
        await this.deploymentRepository.addDeploymentLog(deployment.id, 'stderr', stderr);
      }
      
      this.logger.info('Deployment script completed', { deploymentId: deployment.id });
      
    } catch (error) {
      await this.deploymentRepository.addDeploymentLog(deployment.id, 'error', error.message);
      throw new Error(`Deployment script failed: ${error.message}`);
    }
  }

  async executeRollback(rollback) {
    this.logger.info('Executing rollback', { 
      rollbackId: rollback.id,
      originalDeploymentId: rollback.originalDeploymentId,
      backupPath: rollback.backupPath
    });
    
    const scriptPath = path.join(__dirname, '../deploy-home-assistant-config.sh');
    const command = `${scriptPath} --rollback --backup-path "${rollback.backupPath}" --verbose`;
    
    const env = {
      ...process.env,
      DEPLOYMENT_ID: rollback.id,
      ROLLBACK_MODE: 'true',
      BACKUP_PATH: rollback.backupPath
    };
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        env,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10
      });
      
      await this.deploymentRepository.addDeploymentLog(rollback.id, 'stdout', stdout);
      if (stderr) {
        await this.deploymentRepository.addDeploymentLog(rollback.id, 'stderr', stderr);
      }
      
      await this.updateDeploymentStatus(rollback.originalDeploymentId, this.deploymentStates.ROLLED_BACK, {
        rolledBackAt: new Date().toISOString(),
        rollbackId: rollback.id
      });
      
      this.logger.info('Rollback completed', { rollbackId: rollback.id });
      
    } catch (error) {
      await this.deploymentRepository.addDeploymentLog(rollback.id, 'error', error.message);
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  async updateDeploymentStatus(deploymentId, status, additionalData = {}) {
    try {
      await this.deploymentRepository.updateDeployment(deploymentId, {
        status,
        ...additionalData,
        updatedAt: new Date().toISOString()
      });
      
      this.broadcastUpdate('status_updated', {
        deploymentId,
        status,
        ...additionalData
      });
      
    } catch (error) {
      this.logger.error('Failed to update deployment status', {
        deploymentId,
        status,
        error: error.message
      });
    }
  }

  broadcastUpdate(event, data) {
    if (this.io) {
      this.io.to('deployments').emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  async start() {
    try {
      await this.initialize();
      
      this.server.listen(this.config.api.port, this.config.api.host, () => {
        this.logger.info('Home Assistant Deployer service started', {
          port: this.config.api.port,
          host: this.config.api.host,
          pid: process.pid
        });
        
        console.log(`🚀 Home Assistant Deployer service running on http://${this.config.api.host}:${this.config.api.port}`);
        console.log(`📊 Health check: http://${this.config.api.host}:${this.config.api.port}/health`);
        console.log(`📋 API documentation: http://${this.config.api.host}:${this.config.api.port}/api/status`);
      });
      
    } catch (error) {
      this.logger.error('Failed to start service', { error: error.message, stack: error.stack });
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const service = new HomeAssistantDeployer();
  service.start().catch(console.error);
}

module.exports = HomeAssistantDeployer;
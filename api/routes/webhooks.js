const express = require('express');
const router = express.Router();
const WebhookConfigService = require('../services/github/webhookConfig');
const EnhancedWebhookHandler = require('../services/webhook/enhancedWebhookHandler');
const { getComponentLogger } = require('../config/logging');
const { errorHandler } = require('../utils/errorHandler');

// Initialize services
let webhookConfigService;
let enhancedWebhookHandler;
let webhookDeliveryLog = [];
let webhookStats = {
  totalDeliveries: 0,
  successfulDeliveries: 0,
  failedDeliveries: 0,
  eventCounts: {},
  lastDelivery: null,
  averageProcessingTime: 0
};

// Initialize logger
const logger = getComponentLogger('webhook-routes');

function initializeServices(services) {
  webhookConfigService = new WebhookConfigService();
  enhancedWebhookHandler = new EnhancedWebhookHandler(services);
  
  // Setup webhook delivery logging
  enhancedWebhookHandler.on('webhook_processed', (delivery) => {
    logWebhookDelivery(delivery);
  });
}

function logWebhookDelivery(delivery) {
  const logEntry = {
    id: delivery.deliveryId,
    event: delivery.event,
    repository: delivery.repository,
    success: delivery.success,
    processingTime: delivery.processingTime,
    timestamp: new Date().toISOString(),
    error: delivery.error || null
  };

  // Add to delivery log (keep last 1000 entries)
  webhookDeliveryLog.unshift(logEntry);
  if (webhookDeliveryLog.length > 1000) {
    webhookDeliveryLog = webhookDeliveryLog.slice(0, 1000);
  }

  // Update stats
  webhookStats.totalDeliveries++;
  if (delivery.success) {
    webhookStats.successfulDeliveries++;
  } else {
    webhookStats.failedDeliveries++;
  }

  webhookStats.eventCounts[delivery.event] = (webhookStats.eventCounts[delivery.event] || 0) + 1;
  webhookStats.lastDelivery = logEntry.timestamp;
  
  // Update average processing time
  webhookStats.averageProcessingTime = 
    (webhookStats.averageProcessingTime * (webhookStats.totalDeliveries - 1) + delivery.processingTime) / 
    webhookStats.totalDeliveries;
}

/**
 * GET /api/webhooks/status
 * Get comprehensive webhook system status
 */
router.get('/status', async (req, res) => {
  try {
    const systemStats = {
      configured: !!process.env.GITHUB_WEBHOOK_SECRET,
      webhookUrl: process.env.WEBHOOK_URL,
      processingStats: enhancedWebhookHandler ? enhancedWebhookHandler.getProcessingStats() : null,
      deliveryStats: {
        ...webhookStats,
        successRate: webhookStats.totalDeliveries > 0 ? 
          ((webhookStats.successfulDeliveries / webhookStats.totalDeliveries) * 100).toFixed(2) + '%' : '0%',
        recentDeliveries: webhookDeliveryLog.slice(0, 5)
      },
      systemHealth: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString()
      }
    };

    res.json(systemStats);
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks/setup/:owner/:repo
 * Setup webhook for a specific repository
 */
router.post('/setup/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    
    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    console.log(`Setting up webhook for ${owner}/${repo}`);
    
    const webhook = await webhookConfigService.setupRepositoryWebhooks(owner, repo);
    
    res.json({ 
      success: true, 
      webhook: {
        id: webhook.id,
        active: webhook.active,
        events: webhook.events,
        url: webhook.config.url,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at
      },
      message: `Webhook configured successfully for ${owner}/${repo}`
    });
  } catch (error) {
    console.error(`Error setting up webhook for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({ 
      error: error.message,
      repository: `${req.params.owner}/${req.params.repo}`
    });
  }
});

/**
 * DELETE /api/webhooks/remove/:owner/:repo
 * Remove webhook from a specific repository
 */
router.delete('/remove/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    
    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    console.log(`Removing webhook for ${owner}/${repo}`);
    
    const removed = await webhookConfigService.removeRepositoryWebhook(owner, repo);
    
    if (removed) {
      res.json({ 
        success: true, 
        message: `Webhook removed successfully from ${owner}/${repo}`
      });
    } else {
      res.json({ 
        success: false, 
        message: `No webhook found for ${owner}/${repo}`
      });
    }
  } catch (error) {
    console.error(`Error removing webhook from ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({ 
      error: error.message,
      repository: `${req.params.owner}/${req.params.repo}`
    });
  }
});

/**
 * POST /api/webhooks/bulk-setup
 * Setup webhooks for multiple repositories
 */
router.post('/bulk-setup', async (req, res) => {
  try {
    const { repositories } = req.body;
    
    if (!repositories || !Array.isArray(repositories)) {
      return res.status(400).json({ error: 'repositories array is required' });
    }

    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    console.log(`Setting up webhooks for ${repositories.length} repositories`);
    
    const results = await webhookConfigService.bulkSetupWebhooks(repositories);
    
    res.json({
      success: true,
      summary: {
        total: results.total,
        successful: results.successful,
        failed: results.failed
      },
      results: results.results
    });
  } catch (error) {
    console.error('Error in bulk webhook setup:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/deliveries
 * Get webhook delivery history
 */
router.get('/deliveries', async (req, res) => {
  try {
    const { 
      limit = 50, 
      status,
      event,
      repository,
      since 
    } = req.query;

    let filteredDeliveries = [...webhookDeliveryLog];

    // Apply filters
    if (status) {
      const isSuccess = status === 'success';
      filteredDeliveries = filteredDeliveries.filter(d => d.success === isSuccess);
    }

    if (event) {
      filteredDeliveries = filteredDeliveries.filter(d => d.event === event);
    }

    if (repository) {
      filteredDeliveries = filteredDeliveries.filter(d => 
        d.repository && d.repository.includes(repository)
      );
    }

    if (since) {
      const sinceDate = new Date(since);
      filteredDeliveries = filteredDeliveries.filter(d => 
        new Date(d.timestamp) >= sinceDate
      );
    }

    // Apply limit
    const limitedDeliveries = filteredDeliveries.slice(0, parseInt(limit));

    // Calculate filtered stats
    const filteredStats = {
      total: filteredDeliveries.length,
      successful: filteredDeliveries.filter(d => d.success).length,
      failed: filteredDeliveries.filter(d => !d.success).length,
      averageProcessingTime: filteredDeliveries.length > 0 ? 
        filteredDeliveries.reduce((sum, d) => sum + d.processingTime, 0) / filteredDeliveries.length : 0
    };

    res.json({
      deliveries: limitedDeliveries,
      stats: filteredStats,
      pagination: {
        limit: parseInt(limit),
        total: filteredDeliveries.length,
        hasMore: filteredDeliveries.length > parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting webhook deliveries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/repository/:owner/:repo/status
 * Get webhook status for a specific repository
 */
router.get('/repository/:owner/:repo/status', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    
    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    const status = await webhookConfigService.getRepositoryWebhookStatus(owner, repo);
    
    // Add recent deliveries for this repository
    const recentDeliveries = webhookDeliveryLog
      .filter(d => d.repository === `${owner}/${repo}`)
      .slice(0, 10);

    res.json({
      repository: `${owner}/${repo}`,
      webhook: status,
      recentActivity: {
        deliveries: recentDeliveries,
        totalDeliveries: recentDeliveries.length,
        successfulDeliveries: recentDeliveries.filter(d => d.success).length,
        lastDelivery: recentDeliveries[0]?.timestamp || null
      }
    });
  } catch (error) {
    console.error(`Error getting webhook status for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({ 
      error: error.message,
      repository: `${req.params.owner}/${req.params.repo}`
    });
  }
});

/**
 * POST /api/webhooks/test/:owner/:repo
 * Test webhook delivery for a repository
 */
router.post('/test/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { event = 'ping' } = req.body;
    
    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    console.log(`Testing webhook for ${owner}/${repo} with event: ${event}`);
    
    const testResult = await webhookConfigService.testWebhookDelivery(owner, repo, event);
    
    if (testResult.success) {
      res.json({
        success: true,
        message: `Webhook test successful for ${owner}/${repo}`,
        testResult
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Webhook test failed for ${owner}/${repo}`,
        error: testResult.error
      });
    }
  } catch (error) {
    console.error(`Error testing webhook for ${req.params.owner}/${req.params.repo}:`, error);
    res.status(500).json({ 
      error: error.message,
      repository: `${req.params.owner}/${req.params.repo}`
    });
  }
});

/**
 * GET /api/webhooks/events
 * Get supported webhook events
 */
router.get('/events', (req, res) => {
  try {
    if (!webhookConfigService) {
      return res.status(500).json({ error: 'Webhook service not initialized' });
    }

    const repositoryEvents = webhookConfigService.getWebhookEvents();
    const organizationEvents = webhookConfigService.getOrganizationWebhookEvents();

    res.json({
      repository: {
        events: repositoryEvents,
        count: repositoryEvents.length,
        description: 'Events supported for repository-level webhooks'
      },
      organization: {
        events: organizationEvents,
        count: organizationEvents.length,
        description: 'Events supported for organization-level webhooks'
      },
      allEvents: [...repositoryEvents, ...organizationEvents].filter((v, i, a) => a.indexOf(v) === i)
    });
  } catch (error) {
    console.error('Error getting webhook events:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/analytics
 * Get webhook analytics and insights
 */
router.get('/analytics', (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calculate time range
    let sinceTime;
    switch (period) {
      case '1h':
        sinceTime = Date.now() - (60 * 60 * 1000);
        break;
      case '24h':
        sinceTime = Date.now() - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        sinceTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        sinceTime = Date.now() - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        sinceTime = Date.now() - (24 * 60 * 60 * 1000);
    }

    const periodDeliveries = webhookDeliveryLog.filter(d => 
      new Date(d.timestamp).getTime() >= sinceTime
    );

    // Calculate analytics
    const analytics = {
      period,
      timeRange: {
        since: new Date(sinceTime).toISOString(),
        until: new Date().toISOString()
      },
      overview: {
        totalDeliveries: periodDeliveries.length,
        successfulDeliveries: periodDeliveries.filter(d => d.success).length,
        failedDeliveries: periodDeliveries.filter(d => !d.success).length,
        uniqueRepositories: [...new Set(periodDeliveries.map(d => d.repository).filter(Boolean))].length,
        averageProcessingTime: periodDeliveries.length > 0 ? 
          periodDeliveries.reduce((sum, d) => sum + d.processingTime, 0) / periodDeliveries.length : 0
      },
      eventBreakdown: {},
      repositoryActivity: {},
      hourlyActivity: {},
      errorAnalysis: {
        commonErrors: {},
        errorRate: 0
      }
    };

    // Event breakdown
    periodDeliveries.forEach(d => {
      analytics.eventBreakdown[d.event] = (analytics.eventBreakdown[d.event] || 0) + 1;
    });

    // Repository activity
    periodDeliveries.forEach(d => {
      if (d.repository) {
        if (!analytics.repositoryActivity[d.repository]) {
          analytics.repositoryActivity[d.repository] = { total: 0, successful: 0, failed: 0 };
        }
        analytics.repositoryActivity[d.repository].total++;
        if (d.success) {
          analytics.repositoryActivity[d.repository].successful++;
        } else {
          analytics.repositoryActivity[d.repository].failed++;
        }
      }
    });

    // Hourly activity (for the last 24 hours)
    const hourlyBuckets = {};
    periodDeliveries.forEach(d => {
      const hour = new Date(d.timestamp).getHours();
      hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
    });
    analytics.hourlyActivity = hourlyBuckets;

    // Error analysis
    const failedDeliveries = periodDeliveries.filter(d => !d.success);
    failedDeliveries.forEach(d => {
      if (d.error) {
        analytics.errorAnalysis.commonErrors[d.error] = (analytics.errorAnalysis.commonErrors[d.error] || 0) + 1;
      }
    });
    analytics.errorAnalysis.errorRate = periodDeliveries.length > 0 ? 
      (failedDeliveries.length / periodDeliveries.length * 100).toFixed(2) + '%' : '0%';

    res.json(analytics);
  } catch (error) {
    console.error('Error getting webhook analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks/github
 * Main webhook receiver endpoint for GitHub events
 */
router.post('/github', async (req, res) => {
  const startTime = Date.now();
  let deliveryId = req.headers['x-github-delivery'];
  let eventType = req.headers['x-github-event'];
  
  try {
    // Import security validator and audit logger
    const { SecurityValidator } = require('../utils/security-validator');
    const { AuditLogger } = require('../utils/audit-logger');
    
    // Validate webhook security
    await SecurityValidator.validateGitHubWebhook(req);
    
    if (!enhancedWebhookHandler) {
      const error = new Error('Webhook handler not initialized');
      error.statusCode = 500;
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }

    // Process webhook with enhanced handler
    const result = await enhancedWebhookHandler.processWebhook(req.headers, JSON.stringify(req.body));
    
    const processingTime = Date.now() - startTime;
    
    // Log successful webhook processing with AuditLogger
    AuditLogger.logWebhookEvent({
      eventType: result.event,
      delivery: result.deliveryId,
      repository: req.body.repository?.full_name,
      result: 'success',
      deploymentId: result.deploymentId,
      processingTime,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      trigger: 'github-webhook',
      branch: req.body.ref ? req.body.ref.replace('refs/heads/', '') : undefined,
      commit: req.body.after || req.body.pull_request?.merge_commit_sha,
      author: req.body.pusher?.name || req.body.pull_request?.user?.login || req.body.sender?.login,
      reason: `Webhook processing for ${result.event} event`
    });
    
    // Also log the delivery for backward compatibility
    logWebhookDelivery({
      deliveryId: result.deliveryId,
      event: result.event,
      repository: req.body.repository?.full_name,
      success: result.success,
      processingTime
    });

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      event: result.event,
      deliveryId: result.deliveryId,
      repository: req.body.repository?.full_name,
      deploymentId: result.deploymentId,
      processingTime
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error processing GitHub webhook:', error);
    
    // Log webhook processing error with AuditLogger
    AuditLogger.logWebhookError({
      eventType,
      delivery: deliveryId,
      error: error.message,
      errorCode: error.code || 'WEBHOOK_PROCESSING_ERROR',
      ipAddress: SecurityValidator.getClientIP(req),
      userAgent: req.headers['user-agent'],
      repository: req.body?.repository?.full_name,
      requestSize: req.headers['content-length'],
      headers: req.headers,
      stackTrace: error.stack
    });
    
    // Also log the failed delivery for backward compatibility
    logWebhookDelivery({
      deliveryId,
      event: eventType,
      repository: req.body?.repository?.full_name,
      success: false,
      processingTime,
      error: error.message
    });

    // Determine appropriate status code
    const statusCode = error.statusCode || error.status || 500;
    
    res.status(statusCode).json({
      status: 'error',
      message: error.message,
      code: error.code || 'WEBHOOK_ERROR',
      delivery: deliveryId,
      timestamp: new Date().toISOString()
    });
  }
});


/**
 * GET /api/webhooks/health
 * Health check endpoint for webhook system
 */
router.get('/health', (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        webhookConfig: !!webhookConfigService,
        webhookHandler: !!enhancedWebhookHandler,
        githubToken: !!process.env.GITHUB_TOKEN,
        webhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET
      },
      recentActivity: {
        totalDeliveries: webhookStats.totalDeliveries,
        lastDelivery: webhookStats.lastDelivery,
        successRate: webhookStats.totalDeliveries > 0 ? 
          ((webhookStats.successfulDeliveries / webhookStats.totalDeliveries) * 100).toFixed(2) + '%' : '0%'
      }
    };

    // Check if all critical services are available
    const criticalServices = ['webhookConfig', 'webhookHandler', 'githubToken'];
    const unhealthyServices = criticalServices.filter(service => !health.services[service]);
    
    if (unhealthyServices.length > 0) {
      health.status = 'degraded';
      health.issues = unhealthyServices.map(service => `${service} not available`);
      return res.status(503).json(health);
    }

    res.json(health);
  } catch (error) {
    console.error('Error checking webhook health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = { router, initializeServices };
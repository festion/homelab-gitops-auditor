const express = require('express');
const router = express.Router();
const PipelineOrchestrator = require('../services/orchestrator/pipelineOrchestrator');
const { 
  orchestrationProfiles, 
  resolveRepositories, 
  validateOrchestrationConfig,
  getProfileNames,
  getProfile
} = require('../config/orchestrationProfiles');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { createLogger } = require('../utils/logger');
const { Permission } = require('../models/user');

const logger = createLogger('orchestration-api');

// Middleware to ensure orchestrator is available
const ensureOrchestrator = (req, res, next) => {
  if (!req.orchestrator) {
    req.orchestrator = new PipelineOrchestrator(req.services || {});
  }
  next();
};

// Get all available orchestration profiles
router.get('/profiles', authenticate, (req, res) => {
  try {
    const profiles = getProfileNames().map(name => {
      const profile = getProfile(name);
      return {
        name,
        displayName: profile.name,
        description: profile.description,
        timeout: profile.timeout,
        repositoryCount: Array.isArray(profile.repositories) 
          ? profile.repositories.length 
          : 'all',
        stages: profile.stages.length,
        category: profile.category || 'general'
      };
    });

    res.json({
      success: true,
      profiles,
      total: profiles.length
    });
  } catch (error) {
    logger.error('Failed to get orchestration profiles', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get specific profile details
router.get('/profiles/:profile', authenticate, (req, res) => {
  try {
    const { profile } = req.params;
    const profileConfig = getProfile(profile);
    
    if (!profileConfig) {
      return res.status(404).json({ 
        success: false, 
        error: 'Profile not found' 
      });
    }

    res.json({
      success: true,
      profile: {
        name: profile,
        ...profileConfig
      }
    });
  } catch (error) {
    logger.error(`Failed to get profile ${req.params.profile}`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Execute orchestration with specific profile
router.post('/execute/:profile', 
  authenticate,
  authorize(Permission.PIPELINE_EXECUTE),
  ensureOrchestrator,
  async (req, res) => {
    try {
      const { profile } = req.params;
      const customConfig = req.body;
      
      if (!orchestrationProfiles[profile]) {
        return res.status(404).json({ 
          success: false, 
          error: 'Profile not found' 
        });
      }

      // Validate and merge configuration
      const config = validateOrchestrationConfig(profile, customConfig);
      
      // Resolve repositories if needed
      if (config.repositories === 'all' && req.availableRepositories) {
        config.repositories = resolveRepositories(config, req.availableRepositories);
      }

      logger.info(`Starting orchestration: ${profile}`, {
        profile,
        repositoryCount: Array.isArray(config.repositories) ? config.repositories.length : 'all',
        user: req.user?.id
      });

      // Start orchestration (async)
      const orchestration = await req.orchestrator.orchestratePipeline(config);
      
      res.json({
        success: true,
        orchestrationId: orchestration.id,
        status: orchestration.status,
        profile,
        repositories: Array.isArray(config.repositories) ? config.repositories.length : 'all',
        stages: orchestration.stages.length,
        estimatedDuration: config.timeout || 'unlimited'
      });
    } catch (error) {
      logger.error(`Failed to execute orchestration ${req.params.profile}`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Execute custom orchestration
router.post('/execute-custom',
  authenticate,
  authorize(Permission.PIPELINE_EXECUTE),
  ensureOrchestrator,
  validateRequest(['name', 'repositories', 'stages']),
  async (req, res) => {
    try {
      const customConfig = req.body;
      
      // Validate custom configuration
      const config = validateOrchestrationConfig('custom', customConfig);
      
      logger.info(`Starting custom orchestration: ${config.name}`, {
        repositoryCount: Array.isArray(config.repositories) ? config.repositories.length : 'all',
        stages: config.stages.length,
        user: req.user?.id
      });

      const orchestration = await req.orchestrator.orchestratePipeline(config);
      
      res.json({
        success: true,
        orchestrationId: orchestration.id,
        status: orchestration.status,
        name: config.name,
        repositories: Array.isArray(config.repositories) ? config.repositories.length : 'all',
        stages: orchestration.stages.length
      });
    } catch (error) {
      logger.error('Failed to execute custom orchestration', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Get orchestration status
router.get('/status/:orchestrationId', 
  authenticate,
  ensureOrchestrator,
  async (req, res) => {
    try {
      const { orchestrationId } = req.params;
      
      const status = req.orchestrator.getOrchestrationStatus(orchestrationId);
      
      res.json({
        success: true,
        orchestration: status
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        logger.error(`Failed to get orchestration status ${req.params.orchestrationId}`, error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    }
  }
);

// List active orchestrations
router.get('/active',
  authenticate,
  ensureOrchestrator,
  (req, res) => {
    try {
      const activeOrchestrations = req.orchestrator.listActiveOrchestrations();
      
      res.json({
        success: true,
        orchestrations: activeOrchestrations,
        count: activeOrchestrations.length
      });
    } catch (error) {
      logger.error('Failed to list active orchestrations', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Cancel orchestration
router.post('/cancel/:orchestrationId',
  authenticate,
  authorize(Permission.PIPELINE_CANCEL),
  ensureOrchestrator,
  async (req, res) => {
    try {
      const { orchestrationId } = req.params;
      
      logger.info(`Cancelling orchestration: ${orchestrationId}`, {
        orchestrationId,
        user: req.user?.id
      });

      const orchestration = await req.orchestrator.cancelOrchestration(orchestrationId);
      
      res.json({
        success: true,
        orchestration: {
          id: orchestration.id,
          status: orchestration.status,
          cancelledAt: orchestration.cancelledAt
        }
      });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('not running')) {
        res.status(404).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        logger.error(`Failed to cancel orchestration ${req.params.orchestrationId}`, error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    }
  }
);

// Get orchestration history
router.get('/history',
  authenticate,
  (req, res) => {
    try {
      const { page = 1, limit = 50, status, profile } = req.query;
      
      // This would typically query a database
      // For now, return a mock response
      const history = [];
      
      res.json({
        success: true,
        orchestrations: history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.length,
          pages: Math.ceil(history.length / limit)
        },
        filters: {
          status,
          profile
        }
      });
    } catch (error) {
      logger.error('Failed to get orchestration history', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Get orchestration metrics
router.get('/metrics',
  authenticate,
  (req, res) => {
    try {
      const { timeRange = '24h' } = req.query;
      
      // This would typically query metrics from the database
      const metrics = {
        totalOrchestrations: 0,
        successRate: 0,
        averageDuration: 0,
        activeOrchestrations: req.orchestrator ? req.orchestrator.listActiveOrchestrations().length : 0,
        profileUsage: {},
        timeRange
      };
      
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Failed to get orchestration metrics', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Validate orchestration configuration
router.post('/validate',
  authenticate,
  (req, res) => {
    try {
      const { profile, customConfig } = req.body;
      
      if (profile) {
        // Validate profile-based configuration
        const config = validateOrchestrationConfig(profile, customConfig);
        res.json({
          success: true,
          valid: true,
          config: {
            name: config.name,
            repositories: Array.isArray(config.repositories) ? config.repositories.length : 'all',
            stages: config.stages.length,
            estimatedDuration: config.timeout || 'unlimited'
          }
        });
      } else if (customConfig) {
        // Validate custom configuration
        const config = validateOrchestrationConfig('custom', customConfig);
        res.json({
          success: true,
          valid: true,
          config: {
            name: config.name,
            repositories: Array.isArray(config.repositories) ? config.repositories.length : 'all',
            stages: config.stages.length
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Either profile or customConfig must be provided'
        });
      }
    } catch (error) {
      res.json({
        success: true,
        valid: false,
        errors: [error.message]
      });
    }
  }
);

// Get repository suggestions for orchestration
router.get('/repositories/suggest',
  authenticate,
  (req, res) => {
    try {
      const { filter, profile } = req.query;
      
      // This would typically query available repositories
      // For now, return mock suggestions
      const suggestions = [
        'home-assistant-config',
        'docker-compose-stack',
        'nginx-config',
        'monitoring-stack',
        'infrastructure-base'
      ];
      
      res.json({
        success: true,
        repositories: suggestions,
        total: suggestions.length
      });
    } catch (error) {
      logger.error('Failed to get repository suggestions', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// WebSocket endpoints for real-time updates
router.ws('/stream/:orchestrationId', (ws, req) => {
  const { orchestrationId } = req.params;
  
  logger.info(`WebSocket connection established for orchestration: ${orchestrationId}`);
  
  // Set up event listeners for real-time updates
  const orchestrator = req.orchestrator || new PipelineOrchestrator(req.services || {});
  
  const handlers = {
    'stage:started': (orchestration, stage) => {
      if (orchestration.id === orchestrationId) {
        ws.send(JSON.stringify({
          type: 'stage:started',
          orchestrationId,
          stage: stage.name,
          timestamp: new Date()
        }));
      }
    },
    'stage:completed': (orchestration, stage) => {
      if (orchestration.id === orchestrationId) {
        ws.send(JSON.stringify({
          type: 'stage:completed',
          orchestrationId,
          stage: stage.name,
          timestamp: new Date()
        }));
      }
    },
    'task:started': (orchestration, task) => {
      if (orchestration.id === orchestrationId) {
        ws.send(JSON.stringify({
          type: 'task:started',
          orchestrationId,
          task: task.type,
          repository: task.repository,
          timestamp: new Date()
        }));
      }
    },
    'task:completed': (orchestration, task, result) => {
      if (orchestration.id === orchestrationId) {
        ws.send(JSON.stringify({
          type: 'task:completed',
          orchestrationId,
          task: task.type,
          repository: task.repository,
          result,
          timestamp: new Date()
        }));
      }
    },
    'orchestration:completed': (orchestration) => {
      if (orchestration.id === orchestrationId) {
        ws.send(JSON.stringify({
          type: 'orchestration:completed',
          orchestrationId,
          duration: orchestration.completedAt - orchestration.startedAt,
          timestamp: new Date()
        }));
      }
    }
  };
  
  // Register event handlers
  for (const [event, handler] of Object.entries(handlers)) {
    orchestrator.on(event, handler);
  }
  
  // Clean up on close
  ws.on('close', () => {
    logger.info(`WebSocket connection closed for orchestration: ${orchestrationId}`);
    for (const [event, handler] of Object.entries(handlers)) {
      orchestrator.removeListener(event, handler);
    }
  });
});

module.exports = router;
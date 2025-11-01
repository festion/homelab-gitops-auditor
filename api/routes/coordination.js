const express = require('express');
const router = express.Router();
const RepositoryDependencyManager = require('../services/coordination/dependencyManager');
const SharedResourceManager = require('../services/coordination/sharedResourceManager');
const CoordinationMonitor = require('../services/coordination/monitoring');
const { authenticateUser, validateRequest, handleAsync } = require('../middleware/auth');
const { body, query, param, validationResult } = require('express-validator');

// Initialize coordination services
let dependencyManager;
let resourceManager;
let monitor;

const initializeServices = (services) => {
  dependencyManager = new RepositoryDependencyManager(services);
  resourceManager = new SharedResourceManager(services.storage);
  monitor = new CoordinationMonitor({
    logLevel: 'info',
    logFile: 'logs/coordination.log'
  });
  
  // Set up monitoring integration
  resourceManager.on('resourceClaimed', (event) => {
    monitor.trackResourceClaim(event.claimId, event.resourceId, event.repository, event.operation);
  });
  
  resourceManager.on('resourceReleased', (event) => {
    monitor.trackResourceRelease(event.claimId, event.resourceId, event.repository);
  });
  
  resourceManager.on('resolutionApplied', (event) => {
    monitor.completeConflictResolution(event.resolutionId, event.results);
  });
};

// Validation middleware
const validateRepositories = [
  body('repositories')
    .isArray({ min: 1 })
    .withMessage('repositories must be a non-empty array'),
  body('repositories.*')
    .isString()
    .isLength({ min: 1 })
    .withMessage('each repository must be a non-empty string')
];

const validateCoordination = [
  body('repositories').isArray({ min: 1 }),
  body('options').optional().isObject(),
  body('options.allowParallel').optional().isBoolean(),
  body('options.ignoreConflicts').optional().isBoolean(),
  body('options.timeout').optional().isInt({ min: 1, max: 3600 })
];

// Dependency Analysis Endpoints

/**
 * GET /api/coordination/dependencies
 * Analyze dependencies across repositories
 */
router.get('/dependencies', 
  authenticateUser,
  [
    query('repositories')
      .isString()
      .withMessage('repositories query parameter is required'),
    query('includeTransitive')
      .optional()
      .isBoolean()
      .withMessage('includeTransitive must be a boolean')
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { repositories, includeTransitive = true } = req.query;
    const repoList = repositories.split(',').map(r => r.trim()).filter(r => r);
    
    if (repoList.length === 0) {
      return res.status(400).json({ 
        error: 'At least one repository must be specified' 
      });
    }

    // Track operation
    const operationId = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (monitor) {
      monitor.trackDependencyAnalysis(operationId, repoList);
    }

    try {
      const analysis = await dependencyManager.analyzeDependencies(repoList);
      
      // Complete tracking
      if (monitor) {
        monitor.completeDependencyAnalysis(operationId, {
          success: true,
          dependencyCount: analysis.analysisMetadata.dependencyCount,
          circularDependencies: analysis.circularDependencies.length
        });
      }
    
    // Filter response based on request
    const response = {
      repositories: repoList,
      directDependencies: Object.fromEntries(analysis.directDependencies),
      circularDependencies: analysis.circularDependencies,
      deploymentOrder: analysis.deploymentOrder,
      metadata: analysis.analysisMetadata
    };

    if (includeTransitive) {
      response.transitiveDependencies = Object.fromEntries(analysis.transitiveDependencies);
    }

      res.json(response);
    } catch (error) {
      // Complete tracking with error
      if (monitor) {
        monitor.completeDependencyAnalysis(operationId, {
          success: false,
          error: error.message
        });
      }
      throw error;
    }
  })
);

/**
 * POST /api/coordination/dependencies/refresh
 * Force refresh of dependency analysis
 */
router.post('/dependencies/refresh',
  authenticateUser,
  validateRepositories,
  validateRequest,
  handleAsync(async (req, res) => {
    const { repositories } = req.body;
    
    // Clear cached dependencies
    for (const repo of repositories) {
      dependencyManager.dependencies.delete(repo);
    }
    
    const analysis = await dependencyManager.analyzeDependencies(repositories);
    
    res.json({
      message: 'Dependencies refreshed successfully',
      repositories,
      analysis: {
        repositoryCount: repositories.length,
        dependencyCount: analysis.analysisMetadata.dependencyCount,
        circularDependencies: analysis.circularDependencies.length,
        analyzedAt: analysis.analysisMetadata.analyzedAt
      }
    });
  })
);

// Deployment Coordination Endpoints

/**
 * POST /api/coordination/coordinate-deployment
 * Plan and coordinate deployment across repositories
 */
router.post('/coordinate-deployment',
  authenticateUser,
  validateCoordination,
  validateRequest,
  handleAsync(async (req, res) => {
    const { repositories, options = {} } = req.body;
    
    const coordination = await dependencyManager.coordinateDeployment(repositories, options);
    
    res.json({
      coordination: {
        id: coordination.id,
        status: coordination.status,
        repositories: coordination.repositories,
        phases: coordination.phases,
        conflicts: coordination.conflicts,
        createdAt: coordination.createdAt
      },
      deployment: {
        totalPhases: coordination.phases.length,
        parallelizable: coordination.phases.filter(p => p.parallel).length,
        estimatedDuration: coordination.phases.reduce((sum, p) => sum + p.estimatedDuration, 0)
      }
    });
  })
);

/**
 * GET /api/coordination/deployments/:coordinationId
 * Get deployment coordination details
 */
router.get('/deployments/:coordinationId',
  authenticateUser,
  [param('coordinationId').isString().notEmpty()],
  validateRequest,
  handleAsync(async (req, res) => {
    const { coordinationId } = req.params;
    
    // This would typically retrieve from storage
    // For now, return a placeholder response
    res.json({
      id: coordinationId,
      status: 'ready',
      retrievedAt: new Date(),
      message: 'Deployment coordination details would be retrieved from storage'
    });
  })
);

// Resource Conflict Management

/**
 * GET /api/coordination/resource-conflicts
 * Check for resource conflicts across repositories
 */
router.get('/resource-conflicts',
  authenticateUser,
  [
    query('repositories')
      .isString()
      .withMessage('repositories query parameter is required')
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { repositories } = req.query;
    const repoList = repositories.split(',').map(r => r.trim()).filter(r => r);
    
    const conflicts = await dependencyManager.checkResourceConflicts(repoList);
    
    const conflictSummary = conflicts.reduce((acc, conflict) => {
      const severity = conflict.severity;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});

    res.json({
      conflicts,
      summary: {
        total: conflicts.length,
        bySeverity: conflictSummary,
        repositories: repoList,
        analyzedAt: new Date()
      }
    });
  })
);

/**
 * POST /api/coordination/resolve-conflicts
 * Apply resolution strategies to conflicts
 */
router.post('/resolve-conflicts',
  authenticateUser,
  [
    body('conflicts').isArray({ min: 1 }),
    body('conflicts.*.id').isString(),
    body('conflicts.*.type').isString(),
    body('resolutionStrategy').isString(),
    body('dryRun').optional().isBoolean()
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { conflicts, resolutionStrategy, dryRun = false } = req.body;
    
    const results = [];
    
    for (const conflict of conflicts) {
      try {
        const resolution = await resourceManager.generateResolution(conflict);
        const strategy = resolution.strategies.find(s => s.name === resolutionStrategy);
        
        if (!strategy) {
          results.push({
            conflictId: conflict.id,
            error: `Strategy '${resolutionStrategy}' not available for conflict type '${conflict.type}'`,
            availableStrategies: resolution.strategies.map(s => s.name)
          });
          continue;
        }

        if (dryRun) {
          results.push({
            conflictId: conflict.id,
            strategy: resolutionStrategy,
            changes: strategy.changes,
            dryRun: true
          });
        } else {
          const result = await resourceManager.applyResolution(resolution, resolutionStrategy);
          results.push({
            conflictId: conflict.id,
            strategy: resolutionStrategy,
            result,
            applied: true
          });
        }
      } catch (error) {
        results.push({
          conflictId: conflict.id,
          error: error.message
        });
      }
    }
    
    res.json({
      results,
      summary: {
        total: conflicts.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length,
        dryRun
      }
    });
  })
);

// Shared Configuration Management

/**
 * POST /api/coordination/coordinate-configuration
 * Coordinate shared configurations across repositories
 */
router.post('/coordinate-configuration',
  authenticateUser,
  validateRepositories,
  validateRequest,
  handleAsync(async (req, res) => {
    const { repositories } = req.body;
    
    const coordination = await resourceManager.coordinateSharedConfiguration(repositories);
    
    const configSummary = Array.from(coordination.sharedConfigs.entries()).map(([key, configs]) => ({
      configurationKey: key,
      repositoryCount: configs.length,
      repositories: configs.map(c => c.repository),
      hasConflicts: coordination.conflicts.some(conflict => conflict.key === key)
    }));

    res.json({
      coordination: {
        id: coordination.id,
        status: coordination.status,
        repositories: coordination.repositories,
        createdAt: coordination.createdAt
      },
      configurations: configSummary,
      conflicts: coordination.conflicts,
      resolutions: coordination.resolutions,
      summary: {
        totalConfigurations: coordination.sharedConfigs.size,
        conflictingConfigurations: coordination.conflicts.length,
        resolutionsAvailable: coordination.resolutions.length
      }
    });
  })
);

// Resource Management

/**
 * POST /api/coordination/resources/register
 * Register a shared resource
 */
router.post('/resources/register',
  authenticateUser,
  [
    body('type').isString().notEmpty(),
    body('identifier').isString().notEmpty(),
    body('capacity').optional().isInt({ min: 1 }),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const resource = req.body;
    
    const resourceId = await resourceManager.registerSharedResource(resource);
    
    res.status(201).json({
      resourceId,
      resource: {
        ...resource,
        id: resourceId,
        registeredAt: new Date()
      },
      message: 'Resource registered successfully'
    });
  })
);

/**
 * POST /api/coordination/resources/:resourceId/claim
 * Claim a shared resource
 */
router.post('/resources/:resourceId/claim',
  authenticateUser,
  [
    param('resourceId').isString().notEmpty(),
    body('repository').isString().notEmpty(),
    body('operation').isObject(),
    body('operation.type').isString().notEmpty(),
    body('operation.exclusive').optional().isBoolean(),
    body('operation.ttl').optional().isInt({ min: 1 })
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { resourceId } = req.params;
    const { repository, operation } = req.body;
    
    const claimId = await resourceManager.claimResource(resourceId, repository, operation);
    
    res.json({
      claimId,
      resourceId,
      repository,
      operation,
      claimedAt: new Date(),
      message: 'Resource claimed successfully'
    });
  })
);

/**
 * DELETE /api/coordination/resources/:resourceId/claims/:claimId
 * Release a resource claim
 */
router.delete('/resources/:resourceId/claims/:claimId',
  authenticateUser,
  [
    param('resourceId').isString().notEmpty(),
    param('claimId').isString().notEmpty()
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { resourceId, claimId } = req.params;
    
    const released = await resourceManager.releaseResource(resourceId, claimId);
    
    if (released) {
      res.json({
        message: 'Resource released successfully',
        resourceId,
        claimId,
        releasedAt: new Date()
      });
    } else {
      res.status(404).json({
        error: 'Resource claim not found',
        resourceId,
        claimId
      });
    }
  })
);

/**
 * GET /api/coordination/resources/:resourceId/status
 * Get resource status and usage
 */
router.get('/resources/:resourceId/status',
  authenticateUser,
  [param('resourceId').isString().notEmpty()],
  validateRequest,
  handleAsync(async (req, res) => {
    const { resourceId } = req.params;
    
    const status = await resourceManager.getResourceStatus(resourceId);
    
    if (!status) {
      return res.status(404).json({
        error: 'Resource not found',
        resourceId
      });
    }
    
    res.json(status);
  })
);

// System Health and Monitoring

/**
 * GET /api/coordination/health
 * Get coordination system health
 */
router.get('/health',
  authenticateUser,
  handleAsync(async (req, res) => {
    const health = resourceManager.getSystemHealth();
    
    res.json({
      status: 'healthy',
      coordination: health,
      services: {
        dependencyManager: dependencyManager ? 'active' : 'inactive',
        resourceManager: resourceManager ? 'active' : 'inactive'
      },
      timestamp: new Date()
    });
  })
);

/**
 * GET /api/coordination/conflicts/history
 * Get conflict resolution history
 */
router.get('/conflicts/history',
  authenticateUser,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;
    
    const history = await resourceManager.getConflictHistory();
    const paginatedHistory = history.slice(offset, offset + parseInt(limit));
    
    res.json({
      conflicts: paginatedHistory,
      pagination: {
        total: history.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < history.length
      }
    });
  })
);

/**
 * POST /api/coordination/cleanup
 * Cleanup expired locks and resources
 */
router.post('/cleanup',
  authenticateUser,
  handleAsync(async (req, res) => {
    const cleanedLocks = await resourceManager.cleanupExpiredLocks();
    
    res.json({
      message: 'Cleanup completed',
      cleanedLocks,
      timestamp: new Date()
    });
  })
);

// Monitoring and Metrics Endpoints

/**
 * GET /api/coordination/metrics
 * Get comprehensive coordination metrics
 */
router.get('/metrics',
  authenticateUser,
  [
    query('format').optional().isIn(['json', 'prometheus']),
    query('timeRange').optional().isInt({ min: 1, max: 168 }) // hours
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { format = 'json', timeRange = 24 } = req.query;
    
    if (!monitor) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    if (format === 'prometheus') {
      const metrics = monitor.exportMetrics('prometheus');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(metrics);
    } else {
      const metrics = monitor.collectMetrics();
      res.json({
        metrics,
        timeRange,
        collectedAt: new Date()
      });
    }
  })
);

/**
 * GET /api/coordination/alerts
 * Get recent alerts and their status
 */
router.get('/alerts',
  authenticateUser,
  [
    query('hours').optional().isInt({ min: 1, max: 168 }),
    query('severity').optional().isIn(['low', 'medium', 'high']),
    query('acknowledged').optional().isBoolean()
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { hours = 24, severity, acknowledged } = req.query;
    
    if (!monitor) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    let alerts = monitor.getRecentAlerts(parseInt(hours));
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    if (acknowledged !== undefined) {
      alerts = alerts.filter(alert => alert.acknowledged === (acknowledged === 'true'));
    }
    
    res.json({
      alerts,
      summary: {
        total: alerts.length,
        acknowledged: alerts.filter(a => a.acknowledged).length,
        unacknowledged: alerts.filter(a => !a.acknowledged).length,
        bySeverity: alerts.reduce((acc, alert) => {
          acc[alert.severity] = (acc[alert.severity] || 0) + 1;
          return acc;
        }, {})
      }
    });
  })
);

/**
 * POST /api/coordination/alerts/:alertId/acknowledge
 * Acknowledge a specific alert
 */
router.post('/alerts/:alertId/acknowledge',
  authenticateUser,
  [param('alertId').isString().notEmpty()],
  validateRequest,
  handleAsync(async (req, res) => {
    const { alertId } = req.params;
    
    if (!monitor) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    monitor.acknowledgeAlert(alertId);
    
    res.json({
      message: 'Alert acknowledged successfully',
      alertId,
      acknowledgedAt: new Date()
    });
  })
);

/**
 * GET /api/coordination/operations
 * Get active and recent coordination operations
 */
router.get('/operations',
  authenticateUser,
  [
    query('status').optional().isIn(['active', 'completed', 'failed']),
    query('type').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  handleAsync(async (req, res) => {
    const { status, type, limit = 50 } = req.query;
    
    if (!monitor) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    let operations = Array.from(monitor.activeOperations.values());
    
    if (status === 'active') {
      operations = operations.filter(op => op.status === 'started');
    }
    
    if (type) {
      operations = operations.filter(op => op.type === type);
    }
    
    operations = operations
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, parseInt(limit));
    
    res.json({
      operations,
      summary: {
        total: operations.length,
        active: operations.filter(op => op.status === 'started').length,
        byType: operations.reduce((acc, op) => {
          acc[op.type] = (acc[op.type] || 0) + 1;
          return acc;
        }, {})
      }
    });
  })
);

/**
 * GET /api/coordination/health/detailed
 * Get detailed health status with diagnostics
 */
router.get('/health/detailed',
  authenticateUser,
  handleAsync(async (req, res) => {
    const coordination = resourceManager ? resourceManager.getSystemHealth() : null;
    const monitoring = monitor ? monitor.getHealthStatus() : null;
    
    const health = {
      status: 'healthy',
      components: {
        dependencyManager: {
          status: dependencyManager ? 'active' : 'inactive',
          cacheSize: dependencyManager ? dependencyManager.dependencies.size : 0
        },
        resourceManager: {
          status: resourceManager ? 'active' : 'inactive',
          ...coordination
        },
        monitoring: {
          status: monitor ? 'active' : 'inactive',
          ...monitoring
        }
      },
      timestamp: new Date()
    };
    
    // Determine overall health status
    if (!dependencyManager || !resourceManager || !monitor) {
      health.status = 'degraded';
    } else if (monitoring && monitoring.status !== 'healthy') {
      health.status = monitoring.status;
    }
    
    res.json(health);
  })
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Coordination API error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.message
    });
  }
  
  if (error.message.includes('Circular dependency')) {
    return res.status(400).json({
      error: 'Circular dependency detected',
      details: error.message
    });
  }
  
  if (error.message.includes('Resource conflicts')) {
    return res.status(409).json({
      error: 'Resource conflicts detected',
      details: error.message
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Export router and initialization function
module.exports = {
  router,
  initializeServices
};
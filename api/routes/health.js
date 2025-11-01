const express = require('express');
const { createLogger } = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');
const { Permission } = require('../models/user');
const PipelineHealthMonitor = require('../services/monitoring/pipelineHealthMonitor');
const { MetricsService } = require('../services/metrics');
const { validateRequest } = require('../middleware/validation');
const { param, query, body } = require('express-validator');

const router = express.Router();
const logger = createLogger('HealthAPI');

// Initialize services
let healthMonitor = null;
let metricsService = null;

const initializeServices = (services) => {
  metricsService = services.metrics || new MetricsService();
  healthMonitor = new PipelineHealthMonitor({
    metrics: metricsService,
    websocket: services.websocket,
    alerting: services.alerting
  });
  
  // Start monitoring
  healthMonitor.startMonitoring().catch(err => {
    logger.error('Failed to start health monitoring:', err);
  });
};

// Health overview endpoint
router.get('/overview', 
  authenticate,
  authorize(Permission.METRICS_READ),
  async (req, res) => {
    try {
      if (!healthMonitor) {
        return res.status(503).json({ 
          error: 'Health monitoring not initialized',
          status: 'unavailable'
        });
      }

      const healthReport = await healthMonitor.performHealthChecks();
      
      const overview = {
        timestamp: healthReport.timestamp,
        executionTime: healthReport.executionTime,
        overall: healthReport.overall,
        summary: {
          totalRepositories: healthReport.repositories.size,
          healthyPercentage: healthReport.overall.healthy / healthReport.repositories.size * 100,
          averageScore: this.calculateAverageScore(healthReport.repositories),
          criticalIssues: this.extractCriticalIssues(healthReport.repositories)
        },
        repositories: Array.from(healthReport.repositories.entries()).map(([repo, health]) => ({
          repository: repo,
          status: health.status,
          score: Math.round(health.score * 100) / 100,
          lastUpdated: health.lastUpdated,
          issueCount: health.issues?.length || 0
        }))
      };
      
      res.json(overview);
    } catch (error) {
      logger.error('Health overview failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Repository-specific health endpoint
router.get('/repository/:repo', 
  authenticate,
  authorize(Permission.METRICS_READ),
  [param('repo').isString().notEmpty().withMessage('Repository name is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { repo } = req.params;
      const { includeHistory = false, includePredictions = false } = req.query;
      
      if (!healthMonitor) {
        return res.status(503).json({ 
          error: 'Health monitoring not initialized',
          repository: repo
        });
      }

      const health = await healthMonitor.checkRepositoryHealth(repo);
      
      const response = {
        repository: repo,
        ...health,
        timestamp: new Date()
      };

      // Include historical trends if requested
      if (includeHistory === 'true') {
        response.trends = await healthMonitor.getHealthTrends(repo);
      }

      // Include failure predictions if requested
      if (includePredictions === 'true') {
        response.predictions = await healthMonitor.getFailurePredictions(repo);
      }

      res.json(response);
    } catch (error) {
      logger.error(`Repository health check failed for ${req.params.repo}:`, error);
      res.status(500).json({ 
        error: error.message,
        repository: req.params.repo
      });
    }
  }
);

// Performance trends endpoint
router.get('/trends', 
  authenticate,
  authorize(Permission.METRICS_READ),
  [
    query('timeRange').optional().isIn(['1d', '7d', '30d', '90d']).withMessage('Invalid time range'),
    query('repositories').optional().isString().withMessage('Repositories must be a comma-separated string')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { timeRange = '7d', repositories } = req.query;
      
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      let targetRepos = [];
      if (repositories) {
        targetRepos = repositories.split(',').map(r => r.trim()).filter(r => r);
      } else {
        targetRepos = await healthMonitor.getMonitoredRepositories();
      }

      const trends = new Map();
      const trendPromises = targetRepos.map(async (repo) => {
        try {
          const trend = await healthMonitor.getHealthTrends(repo, timeRange);
          trends.set(repo, trend);
          return { repo, trend, success: true };
        } catch (error) {
          logger.error(`Trend analysis failed for ${repo}:`, error);
          trends.set(repo, { error: error.message });
          return { repo, error: error.message, success: false };
        }
      });

      await Promise.allSettled(trendPromises);

      const response = {
        timeRange,
        timestamp: new Date(),
        repositories: Object.fromEntries(trends),
        summary: {
          totalRepositories: targetRepos.length,
          successfulAnalyses: Array.from(trends.values()).filter(t => !t.error).length,
          overallTrend: this.calculateOverallTrend(trends)
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Trends analysis failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Failure predictions endpoint
router.get('/predictions', 
  authenticate,
  authorize(Permission.METRICS_READ),
  [
    query('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Threshold must be between 0 and 1'),
    query('repositories').optional().isString().withMessage('Repositories must be a comma-separated string')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { threshold = 0.5, repositories } = req.query;
      
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      let targetRepos = [];
      if (repositories) {
        targetRepos = repositories.split(',').map(r => r.trim()).filter(r => r);
      } else {
        targetRepos = await healthMonitor.getMonitoredRepositories();
      }

      const predictions = new Map();
      const predictionPromises = targetRepos.map(async (repo) => {
        try {
          const prediction = await healthMonitor.getFailurePredictions(repo);
          predictions.set(repo, prediction);
          return { repo, prediction, success: true };
        } catch (error) {
          logger.error(`Prediction failed for ${repo}:`, error);
          predictions.set(repo, { error: error.message });
          return { repo, error: error.message, success: false };
        }
      });

      await Promise.allSettled(predictionPromises);

      // Filter by threshold
      const filteredPredictions = new Map();
      for (const [repo, prediction] of predictions) {
        if (prediction.error || prediction.probability >= threshold) {
          filteredPredictions.set(repo, prediction);
        }
      }

      const response = {
        threshold,
        timestamp: new Date(),
        predictions: Object.fromEntries(filteredPredictions),
        summary: {
          totalRepositories: targetRepos.length,
          predictionsGenerated: Array.from(predictions.values()).filter(p => !p.error).length,
          highRiskRepositories: Array.from(predictions.values()).filter(p => !p.error && p.probability >= threshold).length,
          averageProbability: this.calculateAverageProbability(predictions)
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Predictions analysis failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Health thresholds management
router.get('/thresholds', 
  authenticate,
  authorize(Permission.METRICS_READ),
  async (req, res) => {
    try {
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      const thresholds = healthMonitor.getThresholds();
      res.json({
        thresholds,
        timestamp: new Date(),
        description: 'Current health monitoring thresholds'
      });
    } catch (error) {
      logger.error('Failed to get thresholds:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.put('/thresholds', 
  authenticate,
  authorize(Permission.ADMIN),
  [
    body('pipeline.minSuccessRate').optional().isInt({ min: 0, max: 100 }),
    body('pipeline.maxDailyFailures').optional().isInt({ min: 0 }),
    body('pipeline.maxQueueTime').optional().isInt({ min: 0 }),
    body('performance.maxAvgDuration').optional().isInt({ min: 0 }),
    body('performance.maxDegradationRate').optional().isFloat({ min: 0 }),
    body('performance.maxCpuUsage').optional().isInt({ min: 0, max: 100 }),
    body('quality.minTestCoverage').optional().isInt({ min: 0, max: 100 }),
    body('quality.minCodeQuality').optional().isFloat({ min: 0, max: 10 }),
    body('quality.maxSecurityVulnerabilities').optional().isInt({ min: 0 }),
    body('reliability.maxFlakyTests').optional().isInt({ min: 0 }),
    body('reliability.maxMTTR').optional().isInt({ min: 0 }),
    body('reliability.minDeploymentFreq').optional().isInt({ min: 0 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      const newThresholds = req.body;
      healthMonitor.updateThresholds(newThresholds);
      
      logger.info('Health thresholds updated by user:', req.user?.username);
      
      res.json({
        message: 'Thresholds updated successfully',
        thresholds: healthMonitor.getThresholds(),
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to update thresholds:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Anomalies endpoint
router.get('/anomalies', 
  authenticate,
  authorize(Permission.METRICS_READ),
  [
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity level'),
    query('timeRange').optional().isIn(['1h', '6h', '24h', '7d']).withMessage('Invalid time range'),
    query('repositories').optional().isString().withMessage('Repositories must be a comma-separated string')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { severity, timeRange = '24h', repositories } = req.query;
      
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      // This would typically query stored anomaly data
      // For now, we'll get current anomalies from recent health checks
      let targetRepos = [];
      if (repositories) {
        targetRepos = repositories.split(',').map(r => r.trim()).filter(r => r);
      } else {
        targetRepos = await healthMonitor.getMonitoredRepositories();
      }

      const anomalies = [];
      for (const repo of targetRepos) {
        try {
          const prediction = await healthMonitor.getFailurePredictions(repo);
          if (prediction.anomalies && prediction.anomalies.length > 0) {
            const filteredAnomalies = severity ? 
              prediction.anomalies.filter(a => a.severity === severity) : 
              prediction.anomalies;
            
            anomalies.push({
              repository: repo,
              anomalies: filteredAnomalies,
              timestamp: prediction.timestamp
            });
          }
        } catch (error) {
          logger.error(`Failed to get anomalies for ${repo}:`, error);
        }
      }

      res.json({
        timeRange,
        severity: severity || 'all',
        timestamp: new Date(),
        anomalies,
        summary: {
          totalRepositories: targetRepos.length,
          repositoriesWithAnomalies: anomalies.length,
          totalAnomalies: anomalies.reduce((sum, repo) => sum + repo.anomalies.length, 0)
        }
      });
    } catch (error) {
      logger.error('Anomalies analysis failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Health monitoring control endpoints
router.post('/monitoring/start', 
  authenticate,
  authorize(Permission.ADMIN),
  async (req, res) => {
    try {
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      await healthMonitor.startMonitoring();
      logger.info('Health monitoring started by user:', req.user?.username);
      
      res.json({
        message: 'Health monitoring started successfully',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to start monitoring:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.post('/monitoring/stop', 
  authenticate,
  authorize(Permission.ADMIN),
  async (req, res) => {
    try {
      if (!healthMonitor) {
        return res.status(503).json({ error: 'Health monitoring not initialized' });
      }

      await healthMonitor.stopMonitoring();
      logger.info('Health monitoring stopped by user:', req.user?.username);
      
      res.json({
        message: 'Health monitoring stopped successfully',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to stop monitoring:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/monitoring/status', 
  authenticate,
  authorize(Permission.METRICS_READ),
  async (req, res) => {
    try {
      const status = {
        initialized: !!healthMonitor,
        monitoring: healthMonitor ? healthMonitor.isMonitoring : false,
        timestamp: new Date()
      };

      if (healthMonitor) {
        status.thresholds = healthMonitor.getThresholds();
        status.monitoredRepositories = await healthMonitor.getMonitoredRepositories();
      }

      res.json(status);
    } catch (error) {
      logger.error('Failed to get monitoring status:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Utility methods
router.calculateAverageScore = function(repositories) {
  if (repositories.size === 0) return 0;
  
  const scores = Array.from(repositories.values()).map(health => health.score || 0);
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
};

router.extractCriticalIssues = function(repositories) {
  const criticalIssues = [];
  
  for (const [repo, health] of repositories) {
    if (health.status === 'critical' && health.issues) {
      criticalIssues.push({
        repository: repo,
        issues: health.issues.slice(0, 3), // Top 3 issues
        score: health.score
      });
    }
  }
  
  return criticalIssues.slice(0, 10); // Top 10 critical repositories
};

router.calculateOverallTrend = function(trends) {
  const validTrends = Array.from(trends.values()).filter(t => !t.error && t.trend != null);
  if (validTrends.length === 0) return null;
  
  const avgTrend = validTrends.reduce((sum, t) => sum + (t.trend || 0), 0) / validTrends.length;
  
  if (avgTrend > 0.1) return 'degrading';
  if (avgTrend < -0.1) return 'improving';
  return 'stable';
};

router.calculateAverageProbability = function(predictions) {
  const validPredictions = Array.from(predictions.values()).filter(p => !p.error && p.probability != null);
  if (validPredictions.length === 0) return 0;
  
  return Math.round((validPredictions.reduce((sum, p) => sum + p.probability, 0) / validPredictions.length) * 1000) / 1000;
};

// Error handling middleware specific to health routes
router.use((error, req, res, next) => {
  logger.error('Health API error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details
    });
  }
  
  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Export both router and initialization function
module.exports = {
  router,
  initializeServices
};
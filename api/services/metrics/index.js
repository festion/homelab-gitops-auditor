/**
 * Metrics Module Integration
 * 
 * Main entry point for the comprehensive metrics collection system.
 * Initializes and configures all components including collectors, storage,
 * aggregation, scheduling, alerting, and API endpoints.
 */

const MetricsService = require('./metricsService');
const MetricsStorage = require('./metricsStorage');
const RepositoryCollector = require('./collectors/repositoryCollector');
const PipelineCollector = require('./collectors/pipelineCollector');
const SystemCollector = require('./collectors/systemCollector');
const MetricsAlertingSystem = require('./alerting');
const MetricsCollectorScheduler = require('../../jobs/metricsCollector');
const MetricsRoutes = require('../../routes/metrics');

/**
 * Initialize the complete metrics system
 * @param {Object} config - Configuration object
 * @param {Object} options - Optional dependencies and settings
 * @returns {Object} Initialized metrics system components
 */
async function initializeMetricsSystem(config, options = {}) {
    const {
        githubMCP = null,
        pipelineService = null,
        webSocketManager = null,
        dbPath = null
    } = options;

    console.log('Initializing comprehensive metrics system...');

    try {
        // Initialize storage
        const storage = new MetricsStorage({
            dbPath: dbPath || config.get('METRICS_DB_PATH', './data/metrics.db'),
            batchInsertSize: config.get('METRICS_BATCH_SIZE', 100)
        });
        await storage.initialize();

        // Initialize metrics service
        const metricsService = new MetricsService(config, storage);
        await metricsService.initializeService();

        // Initialize collectors
        const repositoryCollector = new RepositoryCollector(config, githubMCP);
        const pipelineCollector = new PipelineCollector(config, githubMCP, pipelineService);
        const systemCollector = new SystemCollector(config, webSocketManager);

        // Register collectors
        metricsService.registerCollector('repository', repositoryCollector);
        metricsService.registerCollector('pipeline', pipelineCollector);
        metricsService.registerCollector('system', systemCollector);

        console.log('Registered metric collectors: repository, pipeline, system');

        // Initialize alerting system
        const alertingSystem = new MetricsAlertingSystem(metricsService, config);

        // Initialize scheduler
        const scheduler = new MetricsCollectorScheduler(metricsService, config);

        // Initialize API routes
        const apiRoutes = new MetricsRoutes(metricsService);

        // Setup event forwarding between components
        setupEventForwarding(metricsService, alertingSystem, scheduler);

        // Start services if auto-start is enabled
        const autoStart = config.get('METRICS_AUTO_START', true);
        if (autoStart) {
            await startMetricsSystem({
                metricsService,
                alertingSystem,
                scheduler
            });
        }

        console.log('Metrics system initialized successfully');

        return {
            metricsService,
            storage,
            collectors: {
                repository: repositoryCollector,
                pipeline: pipelineCollector,
                system: systemCollector
            },
            alertingSystem,
            scheduler,
            apiRoutes,
            
            // Utility methods
            start: () => startMetricsSystem({ metricsService, alertingSystem, scheduler }),
            stop: () => stopMetricsSystem({ metricsService, alertingSystem, scheduler }),
            getHealthStatus: () => getSystemHealth({ metricsService, alertingSystem, scheduler, storage })
        };

    } catch (error) {
        console.error('Error initializing metrics system:', error);
        throw error;
    }
}

/**
 * Start all metrics system components
 */
async function startMetricsSystem({ metricsService, alertingSystem, scheduler }) {
    console.log('Starting metrics system components...');

    try {
        // Start metric collection
        await metricsService.startCollection({
            frequency: 300000 // 5 minutes
        });

        // Start aggregation
        await metricsService.startAggregation({
            frequency: 900000 // 15 minutes
        });

        // Start alerting
        await alertingSystem.start();

        // Start scheduler
        await scheduler.start();

        console.log('All metrics system components started successfully');
    } catch (error) {
        console.error('Error starting metrics system:', error);
        throw error;
    }
}

/**
 * Stop all metrics system components
 */
async function stopMetricsSystem({ metricsService, alertingSystem, scheduler }) {
    console.log('Stopping metrics system components...');

    try {
        // Stop scheduler first
        scheduler.stop();

        // Stop alerting
        alertingSystem.stop();

        // Stop aggregation
        metricsService.stopAggregation();

        // Stop collection
        metricsService.stopCollection();

        // Shutdown service
        await metricsService.shutdown();

        console.log('All metrics system components stopped successfully');
    } catch (error) {
        console.error('Error stopping metrics system:', error);
    }
}

/**
 * Setup event forwarding between components
 */
function setupEventForwarding(metricsService, alertingSystem, scheduler) {
    // Forward metrics service events
    metricsService.on('metric:stored', (data) => {
        // Could trigger real-time dashboard updates
    });

    metricsService.on('collection:completed', (data) => {
        console.log(`Collection completed: ${data.collected} metrics collected, ${data.failed} failed`);
    });

    metricsService.on('aggregation:completed', (data) => {
        console.log(`Aggregation completed: ${data.aggregated} aggregations created`);
    });

    // Forward alerting events
    alertingSystem.on('alert:fired', (alert) => {
        console.log(`🚨 Alert fired: ${alert.message}`);
        // Could send to external monitoring systems
    });

    alertingSystem.on('alert:resolved', (alert) => {
        console.log(`✅ Alert resolved: ${alert.message}`);
    });

    // Forward scheduler events
    scheduler.on('job:failed', ({ name, error }) => {
        console.error(`❌ Scheduled job ${name} failed:`, error.message);
    });

    scheduler.on('job:completed', ({ name, duration, result }) => {
        console.log(`✓ Scheduled job ${name} completed in ${duration}ms`);
    });
}

/**
 * Get comprehensive system health status
 */
function getSystemHealth({ metricsService, alertingSystem, scheduler, storage }) {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
            service: metricsService.getHealthStatus(),
            alerting: alertingSystem.getStats(),
            scheduler: scheduler.getSchedulerStats(),
            storage: null // Will be populated async
        },
        issues: []
    };

    // Check for issues
    if (!health.components.service.initialized) {
        health.status = 'unhealthy';
        health.issues.push('Metrics service not initialized');
    }

    if (!health.components.service.collecting) {
        health.status = 'degraded';
        health.issues.push('Metric collection not active');
    }

    if (!health.components.alerting.isRunning) {
        health.status = 'degraded';
        health.issues.push('Alerting system not running');
    }

    if (!health.components.scheduler.isRunning) {
        health.status = 'degraded';
        health.issues.push('Scheduler not running');
    }

    // Async storage stats
    storage.getStats().then(stats => {
        health.components.storage = stats;
        
        if (!stats.isInitialized) {
            health.status = 'unhealthy';
            health.issues.push('Storage not initialized');
        }
    }).catch(error => {
        health.status = 'unhealthy';
        health.issues.push(`Storage error: ${error.message}`);
    });

    return health;
}

/**
 * Create middleware for tracking API metrics
 */
function createAPIMetricsMiddleware(systemCollector) {
    return (req, res, next) => {
        const startTime = Date.now();
        
        // Track request
        res.on('finish', () => {
            const responseTime = Date.now() - startTime;
            const isError = res.statusCode >= 400;
            
            if (systemCollector && typeof systemCollector.trackAPIRequest === 'function') {
                systemCollector.trackAPIRequest(responseTime, isError);
            }
        });
        
        next();
    };
}

/**
 * Export utility functions for integration
 */
function createMetricsIntegration(app, metricsSystem) {
    // Add API routes
    app.use('/api/v2/metrics', metricsSystem.apiRoutes.getRouter());
    
    // Add metrics middleware
    if (metricsSystem.collectors.system) {
        app.use(createAPIMetricsMiddleware(metricsSystem.collectors.system));
    }
    
    // Add health check endpoint
    app.get('/health/metrics', (req, res) => {
        const health = metricsSystem.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 206 : 500;
        
        res.status(statusCode).json(health);
    });
    
    // Graceful shutdown handler
    const shutdown = async () => {
        console.log('Shutting down metrics system...');
        await metricsSystem.stop();
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    return metricsSystem;
}

module.exports = {
    initializeMetricsSystem,
    startMetricsSystem,
    stopMetricsSystem,
    createAPIMetricsMiddleware,
    createMetricsIntegration,
    
    // Export individual components for advanced usage
    MetricsService,
    MetricsStorage,
    RepositoryCollector,
    PipelineCollector,
    SystemCollector,
    MetricsAlertingSystem,
    MetricsCollectorScheduler,
    MetricsRoutes
};
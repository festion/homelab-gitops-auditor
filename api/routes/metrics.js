/**
 * Metrics API Routes
 * 
 * RESTful API endpoints for metrics collection, querying, aggregation,
 * and export functionality with comprehensive filtering and time-series support.
 */

const express = require('express');
const { MetricsQuery } = require('../models/metrics');

class MetricsRoutes {
    constructor(metricsService) {
        this.metricsService = metricsService;
        this.router = express.Router();
        this.setupRoutes();
        this.setupMiddleware();
    }

    setupMiddleware() {
        // Request timing middleware for API metrics
        this.router.use((req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                const isError = res.statusCode >= 400;
                
                // Track API metrics if system collector is available
                const systemCollector = this.metricsService.collectors.get('system');
                if (systemCollector && typeof systemCollector.trackAPIRequest === 'function') {
                    systemCollector.trackAPIRequest(responseTime, isError);
                }
            });
            
            next();
        });

        // Rate limiting (simple implementation)
        this.router.use(this.rateLimitMiddleware());
    }

    setupRoutes() {
        // Overview and health endpoints
        this.router.get('/overview', this.getMetricsOverview.bind(this));
        this.router.get('/health', this.getServiceHealth.bind(this));
        
        // Repository metrics
        this.router.get('/repository/:repo', this.getRepositoryMetrics.bind(this));
        this.router.get('/repositories', this.getAllRepositoryMetrics.bind(this));
        
        // Pipeline metrics
        this.router.get('/pipelines', this.getPipelineMetrics.bind(this));
        this.router.get('/pipelines/:repo', this.getRepositoryPipelineMetrics.bind(this));
        
        // System metrics
        this.router.get('/system', this.getSystemMetrics.bind(this));
        
        // Time-series and trends
        this.router.get('/trends', this.getMetricsTrends.bind(this));
        this.router.get('/time-series', this.getTimeSeries.bind(this));
        
        // Custom queries
        this.router.post('/query', this.queryMetrics.bind(this));
        this.router.post('/custom', this.executeCustomQuery.bind(this));
        
        // Export functionality
        this.router.get('/export', this.exportMetrics.bind(this));
        this.router.post('/export', this.exportMetricsPost.bind(this));
        
        // Aggregations
        this.router.get('/aggregations/:type', this.getAggregations.bind(this));
        
        // Latest metrics
        this.router.get('/latest', this.getLatestMetrics.bind(this));
        this.router.get('/latest/:type', this.getLatestMetricsByType.bind(this));
        
        // Collection controls (admin endpoints)
        this.router.post('/collect', this.triggerCollection.bind(this));
        this.router.post('/aggregate', this.triggerAggregation.bind(this));
        
        // Statistics and debugging
        this.router.get('/stats', this.getStatistics.bind(this));
        this.router.get('/cache/clear', this.clearCache.bind(this));
    }

    /**
     * GET /api/v2/metrics/overview
     * Get comprehensive metrics overview with key performance indicators
     */
    async getMetricsOverview(req, res) {
        try {
            const { timeRange = '24h' } = req.query;
            
            const overview = await this.metricsService.getMetricsOverview({ timeRange });
            
            res.json({
                success: true,
                data: overview,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting metrics overview:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get metrics overview',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/repository/:repo
     * Get metrics for a specific repository with time range filtering
     */
    async getRepositoryMetrics(req, res) {
        try {
            const { repo } = req.params;
            const { 
                from, 
                to, 
                interval = 'hour',
                metrics = 'health,activity,size' 
            } = req.query;

            const query = new MetricsQuery()
                .whereEntity(repo)
                .whereMetricType(metrics.split(',').map(m => `repository.${m}`));

            if (from || to) {
                query.whereTimeRange(from, to);
            }

            const result = await this.metricsService.queryMetrics(query);
            
            res.json({
                success: true,
                data: {
                    repository: repo,
                    metrics: result,
                    interval,
                    timeRange: { from, to }
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error(`Error getting repository metrics for ${req.params.repo}:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to get repository metrics',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/pipelines
     * Get aggregate pipeline metrics with performance and reliability data
     */
    async getPipelineMetrics(req, res) {
        try {
            const { 
                repo, 
                timeRange = '24h',
                aggregation = 'avg',
                limit = 50 
            } = req.query;

            const query = new MetricsQuery()
                .whereMetricType(['pipeline.performance.*', 'pipeline.reliability.*'])
                .limitTo(limit);

            if (repo) {
                query.whereTag('repository', repo);
            }

            const metrics = await this.metricsService.queryMetrics(query);
            
            // Group by pipeline and calculate aggregations
            const pipelineGroups = this.groupMetricsByEntity(metrics);
            const aggregatedData = this.calculatePipelineAggregations(pipelineGroups, aggregation);

            res.json({
                success: true,
                data: {
                    pipelines: aggregatedData,
                    summary: {
                        totalPipelines: Object.keys(pipelineGroups).length,
                        timeRange,
                        aggregation
                    }
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting pipeline metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get pipeline metrics',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/trends
     * Get trend analysis with anomaly detection and predictive insights
     */
    async getMetricsTrends(req, res) {
        try {
            const { 
                metric, 
                entity, 
                days = 7,
                anomalyDetection = 'true' 
            } = req.query;

            if (!metric) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: metric'
                });
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);

            const query = new MetricsQuery()
                .whereMetricType(metric)
                .whereTimeRange(startDate.toISOString(), endDate.toISOString())
                .orderBy('timestamp', 'ASC');

            if (entity) {
                query.whereEntity(entity);
            }

            const metrics = await this.metricsService.queryMetrics(query);
            
            // Calculate trends and anomalies
            const trendData = this.calculateTrends(metrics);
            const anomalies = anomalyDetection === 'true' ? 
                this.detectAnomalies(metrics) : [];

            res.json({
                success: true,
                data: {
                    metric,
                    entity,
                    period: { start: startDate, end: endDate, days: parseInt(days) },
                    trends: trendData,
                    anomalies,
                    dataPoints: metrics.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting metrics trends:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get metrics trends',
                message: error.message
            });
        }
    }

    /**
     * POST /api/v2/metrics/query
     * Execute custom metric queries with advanced filtering
     */
    async queryMetrics(req, res) {
        try {
            const { 
                metricTypes = [],
                entityIds = [],
                timeRange = {},
                aggregation = null,
                filters = {},
                limit = 1000,
                orderBy = 'timestamp',
                orderDirection = 'DESC'
            } = req.body;

            const query = new MetricsQuery();

            if (metricTypes.length > 0) {
                query.whereMetricType(metricTypes);
            }

            if (entityIds.length > 0) {
                query.whereEntity(entityIds);
            }

            if (timeRange.from || timeRange.to) {
                query.whereTimeRange(timeRange.from, timeRange.to);
            }

            if (aggregation) {
                query.aggregate(aggregation.type, aggregation.interval);
            }

            for (const [key, value] of Object.entries(filters)) {
                if (key.startsWith('tag.')) {
                    query.whereTag(key.replace('tag.', ''), value);
                }
            }

            query.limitTo(limit).orderBy(orderBy, orderDirection);

            const result = await this.metricsService.queryMetrics(query);

            res.json({
                success: true,
                data: {
                    metrics: result,
                    query: {
                        metricTypes,
                        entityIds,
                        timeRange,
                        aggregation,
                        filters,
                        limit
                    },
                    count: result.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error executing metrics query:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to execute metrics query',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/export
     * Export metrics in various formats (CSV, JSON, Prometheus)
     */
    async exportMetrics(req, res) {
        try {
            const { 
                format = 'json',
                metricTypes = '',
                entityIds = '',
                timeRange = '24h',
                filename 
            } = req.query;

            const query = new MetricsQuery();

            if (metricTypes) {
                query.whereMetricType(metricTypes.split(','));
            }

            if (entityIds) {
                query.whereEntity(entityIds.split(','));
            }

            // Parse time range
            const { from, to } = this.parseTimeRange(timeRange);
            query.whereTimeRange(from.toISOString(), to.toISOString());

            const exportResult = await this.metricsService.exportMetrics({
                format,
                query,
                filename
            });

            // Set appropriate headers
            this.setExportHeaders(res, exportResult.format, exportResult.filename);

            if (format === 'json') {
                res.json({
                    success: true,
                    data: exportResult.data,
                    filename: exportResult.filename,
                    format: exportResult.format
                });
            } else {
                res.send(exportResult.data);
            }
        } catch (error) {
            console.error('Error exporting metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export metrics',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/latest
     * Get latest metric values for all entities
     */
    async getLatestMetrics(req, res) {
        try {
            const { 
                metricTypes = [],
                entityIds = [],
                limit = 100 
            } = req.query;

            const options = { limit };
            
            if (metricTypes.length > 0) {
                options.metricTypes = Array.isArray(metricTypes) ? metricTypes : metricTypes.split(',');
            }
            
            if (entityIds.length > 0) {
                options.entityIds = Array.isArray(entityIds) ? entityIds : entityIds.split(',');
            }

            const latest = await this.metricsService.storage.getLatestMetrics(options);

            res.json({
                success: true,
                data: {
                    metrics: latest,
                    count: latest.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting latest metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get latest metrics',
                message: error.message
            });
        }
    }

    /**
     * POST /api/v2/metrics/collect
     * Trigger manual metric collection
     */
    async triggerCollection(req, res) {
        try {
            const { collectors = null } = req.body;
            
            const result = await this.metricsService.collectMetrics({ collectors });

            res.json({
                success: true,
                data: result,
                message: 'Metric collection triggered successfully'
            });
        } catch (error) {
            console.error('Error triggering metric collection:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to trigger metric collection',
                message: error.message
            });
        }
    }

    /**
     * GET /api/v2/metrics/health
     * Get service health status and statistics
     */
    async getServiceHealth(req, res) {
        try {
            const health = this.metricsService.getHealthStatus();
            const storageStats = await this.metricsService.storage.getStats();

            res.json({
                success: true,
                data: {
                    service: health,
                    storage: storageStats,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error getting service health:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get service health',
                message: error.message
            });
        }
    }

    /**
     * Helper methods
     */

    groupMetricsByEntity(metrics) {
        const groups = {};
        
        for (const metric of metrics) {
            const entity = metric.entityId;
            if (!groups[entity]) {
                groups[entity] = [];
            }
            groups[entity].push(metric);
        }
        
        return groups;
    }

    calculatePipelineAggregations(groups, aggregationType) {
        const result = {};
        
        for (const [entity, metrics] of Object.entries(groups)) {
            const values = metrics.map(m => m.value);
            
            let aggregatedValue;
            switch (aggregationType) {
                case 'avg':
                    aggregatedValue = values.reduce((sum, v) => sum + v, 0) / values.length;
                    break;
                case 'sum':
                    aggregatedValue = values.reduce((sum, v) => sum + v, 0);
                    break;
                case 'min':
                    aggregatedValue = Math.min(...values);
                    break;
                case 'max':
                    aggregatedValue = Math.max(...values);
                    break;
                default:
                    aggregatedValue = values.reduce((sum, v) => sum + v, 0) / values.length;
            }
            
            result[entity] = {
                value: Math.round(aggregatedValue * 100) / 100,
                count: values.length,
                aggregationType
            };
        }
        
        return result;
    }

    calculateTrends(metrics) {
        if (metrics.length < 2) {
            return { direction: 'stable', change: 0, confidence: 0 };
        }

        const values = metrics.map(m => m.value);
        const timePoints = metrics.map(m => new Date(m.timestamp).getTime());
        
        // Simple linear regression
        const n = values.length;
        const sumX = timePoints.reduce((sum, x) => sum + x, 0);
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = timePoints.reduce((sum, x, i) => sum + x * values[i], 0);
        const sumXX = timePoints.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate R²
        const yMean = sumY / n;
        const ssTotal = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const ssRes = timePoints.reduce((sum, x, i) => {
            const predicted = slope * x + intercept;
            return sum + Math.pow(values[i] - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssRes / ssTotal);
        
        return {
            direction: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
            change: slope,
            confidence: Math.round(rSquared * 100),
            correlation: rSquared
        };
    }

    detectAnomalies(metrics, threshold = 2) {
        if (metrics.length < 5) return [];

        const values = metrics.map(m => m.value);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const stdDev = Math.sqrt(
            values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        );

        const anomalies = [];
        
        for (let i = 0; i < metrics.length; i++) {
            const value = values[i];
            const deviation = Math.abs(value - mean) / stdDev;
            
            if (deviation > threshold) {
                anomalies.push({
                    timestamp: metrics[i].timestamp,
                    value,
                    expectedValue: mean,
                    deviation,
                    severity: deviation > 3 ? 'high' : 'medium'
                });
            }
        }
        
        return anomalies;
    }

    parseTimeRange(timeRange) {
        const now = new Date();
        const match = timeRange.match(/^(\d+)([hdwm])$/);
        
        if (!match) {
            return {
                from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                to: now
            };
        }

        const [, value, unit] = match;
        const multipliers = {
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000,
            m: 30 * 24 * 60 * 60 * 1000
        };

        const from = new Date(now.getTime() - parseInt(value) * multipliers[unit]);
        return { from, to: now };
    }

    setExportHeaders(res, format, filename) {
        switch (format) {
            case 'csv':
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                break;
            case 'prometheus':
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                break;
            case 'json':
            default:
                res.setHeader('Content-Type', 'application/json');
                break;
        }
    }

    rateLimitMiddleware() {
        const requests = new Map();
        const windowSize = 60000; // 1 minute
        const maxRequests = 100; // requests per minute

        return (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            
            if (!requests.has(clientIP)) {
                requests.set(clientIP, []);
            }
            
            const clientRequests = requests.get(clientIP);
            
            // Remove old requests
            while (clientRequests.length > 0 && clientRequests[0] < now - windowSize) {
                clientRequests.shift();
            }
            
            if (clientRequests.length >= maxRequests) {
                return res.status(429).json({
                    success: false,
                    error: 'Too many requests',
                    message: 'Rate limit exceeded. Please try again later.'
                });
            }
            
            clientRequests.push(now);
            next();
        };
    }

    getRouter() {
        return this.router;
    }
}

module.exports = MetricsRoutes;
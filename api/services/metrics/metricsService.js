/**
 * Metrics Service
 * 
 * Core service for comprehensive metrics collection, aggregation, and querying.
 * Provides time-series data support, real-time metrics, and alerting capabilities.
 */

const EventEmitter = require('events');
const path = require('path');
const { 
    MetricDataPoint, 
    RepositoryMetrics, 
    PipelineMetrics, 
    SystemMetrics,
    AggregatedMetrics,
    MetricsQuery 
} = require('../../models/metrics');

class MetricsService extends EventEmitter {
    constructor(config, storage) {
        super();
        this.config = config;
        this.storage = storage;
        this.collectors = new Map();
        this.aggregators = new Map();
        this.cache = new Map();
        this.isInitialized = false;
        this.collectionInterval = null;
        this.aggregationInterval = null;
        
        // Configuration
        this.cacheTimeout = 60000; // 1 minute cache
        this.collectionFrequency = 300000; // 5 minutes
        this.aggregationFrequency = 3600000; // 1 hour
        this.retentionDays = 90;
        this.maxBatchSize = 1000;
        
        this.initializeService();
    }

    /**
     * Initialize the metrics service
     */
    async initializeService() {
        try {
            await this.storage.initialize();
            this.isInitialized = true;
            
            console.log('MetricsService initialized successfully');
            this.emit('service:initialized');
        } catch (error) {
            console.error('Failed to initialize MetricsService:', error);
            this.emit('service:error', error);
        }
    }

    /**
     * Register a metric collector
     * @param {string} name - Collector name
     * @param {Object} collector - Collector instance with collect() method
     */
    registerCollector(name, collector) {
        if (!collector || typeof collector.collect !== 'function') {
            throw new Error('Collector must have a collect() method');
        }
        
        this.collectors.set(name, collector);
        console.log(`Registered metrics collector: ${name}`);
        
        // Set up event forwarding
        if (collector instanceof EventEmitter) {
            collector.on('metric:collected', (data) => {
                this.emit('metric:collected', { collector: name, ...data });
            });
        }
    }

    /**
     * Register a metric aggregator
     * @param {string} name - Aggregator name
     * @param {Object} aggregator - Aggregator instance with aggregate() method
     */
    registerAggregator(name, aggregator) {
        if (!aggregator || typeof aggregator.aggregate !== 'function') {
            throw new Error('Aggregator must have an aggregate() method');
        }
        
        this.aggregators.set(name, aggregator);
        console.log(`Registered metrics aggregator: ${name}`);
    }

    /**
     * Start metric collection
     * @param {Object} options - Collection options
     */
    async startCollection(options = {}) {
        if (!this.isInitialized) {
            throw new Error('MetricsService not initialized');
        }

        const { frequency = this.collectionFrequency } = options;
        
        // Run initial collection
        await this.collectMetrics();
        
        // Schedule periodic collection
        this.collectionInterval = setInterval(async () => {
            try {
                await this.collectMetrics();
            } catch (error) {
                console.error('Error in scheduled metric collection:', error);
                this.emit('collection:error', error);
            }
        }, frequency);

        console.log(`Started metric collection with ${frequency}ms frequency`);
        this.emit('collection:started', { frequency });
    }

    /**
     * Stop metric collection
     */
    stopCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
            console.log('Stopped metric collection');
            this.emit('collection:stopped');
        }
    }

    /**
     * Start metric aggregation
     * @param {Object} options - Aggregation options
     */
    async startAggregation(options = {}) {
        const { frequency = this.aggregationFrequency } = options;
        
        // Run initial aggregation
        await this.aggregateMetrics();
        
        // Schedule periodic aggregation
        this.aggregationInterval = setInterval(async () => {
            try {
                await this.aggregateMetrics();
            } catch (error) {
                console.error('Error in scheduled metric aggregation:', error);
                this.emit('aggregation:error', error);
            }
        }, frequency);

        console.log(`Started metric aggregation with ${frequency}ms frequency`);
        this.emit('aggregation:started', { frequency });
    }

    /**
     * Stop metric aggregation
     */
    stopAggregation() {
        if (this.aggregationInterval) {
            clearInterval(this.aggregationInterval);
            this.aggregationInterval = null;
            console.log('Stopped metric aggregation');
            this.emit('aggregation:stopped');
        }
    }

    /**
     * Collect metrics from all registered collectors
     * @param {Object} options - Collection options
     */
    async collectMetrics(options = {}) {
        const { collectors: targetCollectors = null } = options;
        const collectorsToRun = targetCollectors ? 
            Array.from(this.collectors.entries()).filter(([name]) => targetCollectors.includes(name)) :
            Array.from(this.collectors.entries());

        const results = {
            collected: 0,
            failed: 0,
            collectors: {},
            timestamp: new Date().toISOString()
        };

        // Run collectors in parallel
        const collectionPromises = collectorsToRun.map(async ([name, collector]) => {
            try {
                const startTime = Date.now();
                const metrics = await collector.collect();
                const duration = Date.now() - startTime;
                
                if (Array.isArray(metrics)) {
                    await this.storeMetrics(metrics);
                    results.collected += metrics.length;
                    results.collectors[name] = {
                        success: true,
                        count: metrics.length,
                        duration
                    };
                } else if (metrics) {
                    await this.storeMetric(metrics);
                    results.collected += 1;
                    results.collectors[name] = {
                        success: true,
                        count: 1,
                        duration
                    };
                }

                this.emit('collector:success', { name, metrics, duration });
            } catch (error) {
                results.failed += 1;
                results.collectors[name] = {
                    success: false,
                    error: error.message
                };
                
                console.error(`Error in collector ${name}:`, error);
                this.emit('collector:error', { name, error });
            }
        });

        await Promise.all(collectionPromises);
        
        this.emit('collection:completed', results);
        return results;
    }

    /**
     * Aggregate metrics for time ranges
     * @param {Object} options - Aggregation options
     */
    async aggregateMetrics(options = {}) {
        const { 
            timeRange = '1h',
            intervals = ['hour', 'day'],
            metricTypes = null 
        } = options;

        const results = {
            aggregated: 0,
            intervals: {},
            timestamp: new Date().toISOString()
        };

        for (const interval of intervals) {
            try {
                const aggregationResult = await this.aggregateForInterval(interval, metricTypes);
                results.aggregated += aggregationResult.count;
                results.intervals[interval] = aggregationResult;
                
                this.emit('aggregation:interval:completed', { interval, result: aggregationResult });
            } catch (error) {
                console.error(`Error aggregating metrics for interval ${interval}:`, error);
                results.intervals[interval] = { error: error.message };
            }
        }

        this.emit('aggregation:completed', results);
        return results;
    }

    /**
     * Aggregate metrics for a specific time interval
     * @param {string} interval - Time interval (hour, day, week, month)
     * @param {Array} metricTypes - Optional filter for metric types
     */
    async aggregateForInterval(interval, metricTypes = null) {
        const timeWindow = this.getTimeWindowForInterval(interval);
        const existingAggregations = await this.storage.getAggregatedMetrics({
            interval,
            timeRange: timeWindow
        });

        // Get raw metrics for aggregation
        const rawMetrics = await this.storage.getMetrics({
            timeRange: timeWindow,
            metricTypes
        });

        // Group by metric_type and entity_id
        const groupedMetrics = this.groupMetricsForAggregation(rawMetrics, interval);
        const aggregations = [];

        for (const [key, dataPoints] of groupedMetrics.entries()) {
            const [metricType, entityId] = key.split('|');
            const aggregationData = AggregatedMetrics.calculateAggregations(dataPoints);
            
            const aggregatedMetric = new AggregatedMetrics({
                metricType,
                entityId,
                interval,
                timestamp: this.getIntervalTimestamp(dataPoints[0].timestamp, interval),
                aggregations: aggregationData
            });

            aggregations.push(aggregatedMetric);
        }

        // Store aggregations
        if (aggregations.length > 0) {
            await this.storage.storeAggregatedMetrics(aggregations);
        }

        return {
            count: aggregations.length,
            interval,
            timeWindow
        };
    }

    /**
     * Store a single metric
     * @param {MetricDataPoint|Object} metric - Metric to store
     */
    async storeMetric(metric) {
        const metricPoint = metric instanceof MetricDataPoint ? 
            metric : new MetricDataPoint(metric);
        
        await this.storage.storeMetric(metricPoint);
        this.emit('metric:stored', metricPoint);
    }

    /**
     * Store multiple metrics in batch
     * @param {Array} metrics - Array of metrics to store
     */
    async storeMetrics(metrics) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return;
        }

        const metricPoints = metrics.map(metric => 
            metric instanceof MetricDataPoint ? metric : new MetricDataPoint(metric)
        );

        // Process in batches to avoid overwhelming the database
        for (let i = 0; i < metricPoints.length; i += this.maxBatchSize) {
            const batch = metricPoints.slice(i, i + this.maxBatchSize);
            await this.storage.storeMetrics(batch);
        }

        this.emit('metrics:stored', { count: metrics.length });
    }

    /**
     * Query metrics with advanced filtering
     * @param {Object|MetricsQuery} query - Query parameters
     */
    async queryMetrics(query) {
        const cacheKey = this.generateCacheKey('query', query);
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const result = await this.storage.queryMetrics(query);
        
        // Cache the result
        this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        return result;
    }

    /**
     * Get metrics overview/summary
     * @param {Object} options - Overview options
     */
    async getMetricsOverview(options = {}) {
        const { timeRange = '24h' } = options;
        const cacheKey = this.generateCacheKey('overview', options);
        
        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const overview = await this.storage.getMetricsOverview(timeRange);
        
        // Cache the result
        this.cache.set(cacheKey, {
            data: overview,
            timestamp: Date.now()
        });

        return overview;
    }

    /**
     * Export metrics in various formats
     * @param {Object} options - Export options
     */
    async exportMetrics(options = {}) {
        const { 
            format = 'json',
            query = {},
            filename = null 
        } = options;

        const metrics = await this.queryMetrics(query);
        
        switch (format.toLowerCase()) {
            case 'csv':
                return this.exportToCSV(metrics, filename);
            case 'prometheus':
                return this.exportToPrometheus(metrics);
            case 'json':
            default:
                return {
                    format: 'json',
                    data: metrics,
                    filename: filename || `metrics_${Date.now()}.json`
                };
        }
    }

    /**
     * Helper methods
     */
    
    groupMetricsForAggregation(metrics, interval) {
        const groups = new Map();
        
        for (const metric of metrics) {
            const key = `${metric.metricType}|${metric.entityId}`;
            const intervalKey = this.getIntervalKey(metric.timestamp, interval);
            const groupKey = `${key}|${intervalKey}`;
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey).push(metric);
        }
        
        return groups;
    }

    getTimeWindowForInterval(interval) {
        const now = new Date();
        const windows = {
            hour: new Date(now.getTime() - 2 * 60 * 60 * 1000), // Last 2 hours
            day: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Last 2 days
            week: new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000), // Last 2 weeks
            month: new Date(now.getTime() - 2 * 30 * 24 * 60 * 60 * 1000) // Last 2 months
        };
        
        return {
            from: windows[interval] || windows.hour,
            to: now
        };
    }

    getIntervalKey(timestamp, interval) {
        const date = new Date(timestamp);
        
        switch (interval) {
            case 'hour':
                return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
            case 'day':
                return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            case 'week':
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                return `${weekStart.getFullYear()}-W${Math.ceil(weekStart.getDate() / 7)}`;
            case 'month':
                return `${date.getFullYear()}-${date.getMonth()}`;
            default:
                return date.toISOString();
        }
    }

    getIntervalTimestamp(timestamp, interval) {
        const date = new Date(timestamp);
        
        switch (interval) {
            case 'hour':
                return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
            case 'day':
                return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
            case 'week':
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).toISOString();
            case 'month':
                return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
            default:
                return timestamp;
        }
    }

    generateCacheKey(type, data) {
        return `${type}_${JSON.stringify(data)}`;
    }

    exportToCSV(metrics, filename = null) {
        const headers = ['timestamp', 'metric_type', 'entity_id', 'value', 'unit', 'tags'];
        const rows = [headers.join(',')];
        
        for (const metric of metrics) {
            const row = [
                metric.timestamp,
                metric.metricType,
                metric.entityId,
                metric.value,
                metric.unit || '',
                JSON.stringify(metric.tags || {})
            ];
            rows.push(row.join(','));
        }
        
        return {
            format: 'csv',
            data: rows.join('\n'),
            filename: filename || `metrics_${Date.now()}.csv`
        };
    }

    exportToPrometheus(metrics) {
        const lines = [];
        const metricGroups = new Map();
        
        // Group metrics by type
        for (const metric of metrics) {
            if (!metricGroups.has(metric.metricType)) {
                metricGroups.set(metric.metricType, []);
            }
            metricGroups.get(metric.metricType).push(metric);
        }
        
        // Convert to Prometheus format
        for (const [metricType, metricList] of metricGroups.entries()) {
            const metricName = metricType.replace(/[^a-zA-Z0-9_]/g, '_');
            
            for (const metric of metricList) {
                const labels = Object.entries(metric.tags || {})
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(',');
                
                const labelStr = labels ? `{${labels}}` : '';
                lines.push(`${metricName}${labelStr} ${metric.value} ${Date.parse(metric.timestamp)}`);
            }
        }
        
        return {
            format: 'prometheus',
            data: lines.join('\n'),
            filename: `metrics_${Date.now()}.prom`
        };
    }

    /**
     * Cleanup old metrics based on retention policy
     */
    async cleanupOldMetrics() {
        try {
            const retentionDate = new Date();
            retentionDate.setDate(retentionDate.getDate() - this.retentionDays);
            
            const result = await this.storage.deleteOldMetrics(retentionDate);
            
            console.log(`Cleaned up ${result.deletedCount} old metric records`);
            this.emit('cleanup:completed', result);
            
            return result;
        } catch (error) {
            console.error('Error cleaning up old metrics:', error);
            this.emit('cleanup:error', error);
            throw error;
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            initialized: this.isInitialized,
            collecting: !!this.collectionInterval,
            aggregating: !!this.aggregationInterval,
            collectors: this.collectors.size,
            aggregators: this.aggregators.size,
            cacheSize: this.cache.size,
            uptime: process.uptime()
        };
    }

    /**
     * Shutdown the service gracefully
     */
    async shutdown() {
        console.log('Shutting down MetricsService...');
        
        this.stopCollection();
        this.stopAggregation();
        this.cache.clear();
        
        if (this.storage && typeof this.storage.close === 'function') {
            await this.storage.close();
        }
        
        this.emit('service:shutdown');
        console.log('MetricsService shutdown complete');
    }
}

module.exports = MetricsService;
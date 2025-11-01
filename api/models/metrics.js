/**
 * Metrics Data Models
 * 
 * Defines data structures for comprehensive metrics collection and aggregation
 * supporting repository health, pipeline performance, and system usage analytics.
 */

/**
 * Metric data point model for time-series storage
 */
class MetricDataPoint {
    constructor(data = {}) {
        this.id = data.id || null;
        this.metricType = data.metricType || '';
        this.entityId = data.entityId || '';
        this.timestamp = data.timestamp || new Date().toISOString();
        this.value = data.value || 0;
        this.metadata = data.metadata || {};
        this.tags = data.tags || {};
        this.unit = data.unit || '';
    }

    /**
     * Convert to storage format
     */
    toStorageFormat() {
        return {
            metric_type: this.metricType,
            entity_id: this.entityId,
            timestamp: this.timestamp,
            value: this.value,
            metadata: JSON.stringify(this.metadata),
            tags: JSON.stringify(this.tags),
            unit: this.unit
        };
    }

    /**
     * Create from storage format
     */
    static fromStorageFormat(row) {
        return new MetricDataPoint({
            id: row.id,
            metricType: row.metric_type,
            entityId: row.entity_id,
            timestamp: row.timestamp,
            value: row.value,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            tags: row.tags ? JSON.parse(row.tags) : {},
            unit: row.unit
        });
    }
}

/**
 * Repository metrics model
 */
class RepositoryMetrics {
    constructor(data = {}) {
        this.repository = data.repository || '';
        this.timestamp = data.timestamp || new Date().toISOString();
        this.health = data.health || {
            status: 'unknown',
            uncommittedChanges: 0,
            staleTags: 0,
            missingFiles: 0,
            score: 0
        };
        this.activity = data.activity || {
            commits24h: 0,
            prsOpen: 0,
            issuesOpen: 0,
            lastActivity: null,
            contributors: 0
        };
        this.size = data.size || {
            diskUsage: 0,
            fileCount: 0,
            largestFiles: [],
            codeLines: 0
        };
        this.security = data.security || {
            vulnerabilities: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            secretsExposed: 0,
            dependencyIssues: 0
        };
    }

    /**
     * Calculate overall health score (0-100)
     */
    calculateHealthScore() {
        let score = 100;
        
        // Deduct points for issues
        score -= this.health.uncommittedChanges * 2;
        score -= this.health.staleTags * 1;
        score -= this.health.missingFiles * 5;
        score -= this.security.vulnerabilities.critical * 10;
        score -= this.security.vulnerabilities.high * 5;
        score -= this.security.secretsExposed * 15;
        
        // Activity bonus
        if (this.activity.commits24h > 0) score += 5;
        
        this.health.score = Math.max(0, Math.min(100, score));
        return this.health.score;
    }

    /**
     * Convert to metric data points
     */
    toMetricDataPoints() {
        const points = [];
        const baseData = {
            entityId: this.repository,
            timestamp: this.timestamp,
            tags: { repository: this.repository }
        };

        // Health metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.health.score',
            value: this.health.score,
            unit: 'percentage'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.health.uncommitted_changes',
            value: this.health.uncommittedChanges,
            unit: 'count'
        }));

        // Activity metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.activity.commits_24h',
            value: this.activity.commits24h,
            unit: 'count'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.activity.prs_open',
            value: this.activity.prsOpen,
            unit: 'count'
        }));

        // Size metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.size.disk_usage',
            value: this.size.diskUsage,
            unit: 'bytes'
        }));

        // Security metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'repository.security.vulnerabilities_critical',
            value: this.security.vulnerabilities.critical,
            unit: 'count'
        }));

        return points;
    }

    /**
     * Convert to API response format
     */
    toJSON() {
        return {
            repository: this.repository,
            timestamp: this.timestamp,
            metrics: {
                health: this.health,
                activity: this.activity,
                size: this.size,
                security: this.security
            }
        };
    }
}

/**
 * Pipeline metrics model
 */
class PipelineMetrics {
    constructor(data = {}) {
        this.pipeline = data.pipeline || '';
        this.repository = data.repository || '';
        this.timestamp = data.timestamp || new Date().toISOString();
        this.performance = data.performance || {
            duration: 0,
            queueTime: 0,
            stepDurations: {},
            throughput: 0
        };
        this.reliability = data.reliability || {
            successRate: 0,
            failureRate: 0,
            flakyTests: [],
            meanTimeToRecovery: 0
        };
        this.resources = data.resources || {
            cpuUsage: 0,
            memoryUsage: 0,
            artifactSize: 0,
            parallelJobs: 0
        };
    }

    /**
     * Calculate success rate from recent runs
     */
    calculateSuccessRate(runs = []) {
        if (runs.length === 0) return 0;
        const successful = runs.filter(r => r.conclusion === 'success').length;
        this.reliability.successRate = Math.round((successful / runs.length) * 100);
        this.reliability.failureRate = 100 - this.reliability.successRate;
        return this.reliability.successRate;
    }

    /**
     * Convert to metric data points
     */
    toMetricDataPoints() {
        const points = [];
        const baseData = {
            entityId: this.pipeline,
            timestamp: this.timestamp,
            tags: { 
                pipeline: this.pipeline,
                repository: this.repository
            }
        };

        // Performance metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'pipeline.performance.duration',
            value: this.performance.duration,
            unit: 'seconds'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'pipeline.performance.queue_time',
            value: this.performance.queueTime,
            unit: 'seconds'
        }));

        // Reliability metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'pipeline.reliability.success_rate',
            value: this.reliability.successRate,
            unit: 'percentage'
        }));

        // Resource metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'pipeline.resources.cpu_usage',
            value: this.resources.cpuUsage,
            unit: 'percentage'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'pipeline.resources.memory_usage',
            value: this.resources.memoryUsage,
            unit: 'mb'
        }));

        return points;
    }

    /**
     * Convert to API response format
     */
    toJSON() {
        return {
            pipeline: this.pipeline,
            repository: this.repository,
            timestamp: this.timestamp,
            metrics: {
                performance: this.performance,
                reliability: this.reliability,
                resources: this.resources
            }
        };
    }
}

/**
 * System metrics model
 */
class SystemMetrics {
    constructor(data = {}) {
        this.timestamp = data.timestamp || new Date().toISOString();
        this.api = data.api || {
            requestsPerMinute: 0,
            avgResponseTime: 0,
            errorRate: 0,
            activeConnections: 0
        };
        this.resources = data.resources || {
            cpuUsage: 0,
            memoryUsage: 0,
            diskUsage: 0,
            networkIO: 0
        };
        this.audit = data.audit || {
            repositoriesScanned: 0,
            auditDuration: 0,
            issuesFound: 0,
            complianceScore: 0
        };
        this.websocket = data.websocket || {
            activeConnections: 0,
            messagesPerSecond: 0,
            errorRate: 0
        };
    }

    /**
     * Convert to metric data points
     */
    toMetricDataPoints() {
        const points = [];
        const baseData = {
            entityId: 'system',
            timestamp: this.timestamp,
            tags: { component: 'system' }
        };

        // API metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'system.api.requests_per_minute',
            value: this.api.requestsPerMinute,
            unit: 'count'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'system.api.avg_response_time',
            value: this.api.avgResponseTime,
            unit: 'ms'
        }));

        // Resource metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'system.resources.cpu_usage',
            value: this.resources.cpuUsage,
            unit: 'percentage'
        }));

        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'system.resources.memory_usage',
            value: this.resources.memoryUsage,
            unit: 'mb'
        }));

        // Audit metrics
        points.push(new MetricDataPoint({
            ...baseData,
            metricType: 'system.audit.repositories_scanned',
            value: this.audit.repositoriesScanned,
            unit: 'count'
        }));

        return points;
    }

    /**
     * Convert to API response format
     */
    toJSON() {
        return {
            timestamp: this.timestamp,
            metrics: {
                api: this.api,
                resources: this.resources,
                audit: this.audit,
                websocket: this.websocket
            }
        };
    }
}

/**
 * Aggregated metrics model for time ranges
 */
class AggregatedMetrics {
    constructor(data = {}) {
        this.metricType = data.metricType || '';
        this.entityId = data.entityId || '';
        this.interval = data.interval || 'hour'; // hour, day, week, month
        this.timestamp = data.timestamp || new Date().toISOString();
        this.aggregations = data.aggregations || {
            count: 0,
            sum: 0,
            avg: 0,
            min: 0,
            max: 0,
            median: 0,
            p95: 0,
            p99: 0
        };
        this.metadata = data.metadata || {};
    }

    /**
     * Calculate aggregations from data points
     */
    static calculateAggregations(dataPoints) {
        if (dataPoints.length === 0) {
            return new AggregatedMetrics().aggregations;
        }

        const values = dataPoints.map(p => p.value).sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;

        return {
            count,
            sum,
            avg: sum / count,
            min: values[0],
            max: values[values.length - 1],
            median: this.calculatePercentile(values, 50),
            p95: this.calculatePercentile(values, 95),
            p99: this.calculatePercentile(values, 99)
        };
    }

    /**
     * Calculate percentile value
     */
    static calculatePercentile(sortedValues, percentile) {
        if (sortedValues.length === 0) return 0;
        const index = (percentile / 100) * (sortedValues.length - 1);
        if (Number.isInteger(index)) {
            return sortedValues[index];
        } else {
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            const weight = index - lower;
            return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
        }
    }

    /**
     * Convert to storage format
     */
    toStorageFormat() {
        return {
            metric_type: this.metricType,
            entity_id: this.entityId,
            interval: this.interval,
            timestamp: this.timestamp,
            aggregations: JSON.stringify(this.aggregations),
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from storage format
     */
    static fromStorageFormat(row) {
        return new AggregatedMetrics({
            id: row.id,
            metricType: row.metric_type,
            entityId: row.entity_id,
            interval: row.interval,
            timestamp: row.timestamp,
            aggregations: row.aggregations ? JSON.parse(row.aggregations) : {},
            metadata: row.metadata ? JSON.parse(row.metadata) : {}
        });
    }

    /**
     * Convert to API response format
     */
    toJSON() {
        return {
            metricType: this.metricType,
            entityId: this.entityId,
            interval: this.interval,
            timestamp: this.timestamp,
            aggregations: this.aggregations,
            metadata: this.metadata
        };
    }
}

/**
 * Metrics query builder for complex queries
 */
class MetricsQuery {
    constructor() {
        this.metricTypes = [];
        this.entityIds = [];
        this.timeRange = {};
        this.aggregation = null;
        this.interval = null;
        this.filters = {};
        this.limit = 1000;
        this.orderBy = 'timestamp';
        this.orderDirection = 'DESC';
    }

    /**
     * Filter by metric types
     */
    whereMetricType(types) {
        this.metricTypes = Array.isArray(types) ? types : [types];
        return this;
    }

    /**
     * Filter by entity IDs
     */
    whereEntity(entityIds) {
        this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];
        return this;
    }

    /**
     * Filter by time range
     */
    whereTimeRange(from, to) {
        this.timeRange = { from, to };
        return this;
    }

    /**
     * Add aggregation
     */
    aggregate(type, interval = null) {
        this.aggregation = type; // avg, sum, min, max, count
        this.interval = interval; // hour, day, week, month
        return this;
    }

    /**
     * Add custom filter
     */
    whereTag(key, value) {
        this.filters[`tags.${key}`] = value;
        return this;
    }

    /**
     * Set result limit
     */
    limitTo(limit) {
        this.limit = limit;
        return this;
    }

    /**
     * Set ordering
     */
    orderBy(field, direction = 'DESC') {
        this.orderBy = field;
        this.orderDirection = direction;
        return this;
    }

    /**
     * Build SQL query (for reference)
     */
    toSQL() {
        // This would be implemented by the storage layer
        return {
            metricTypes: this.metricTypes,
            entityIds: this.entityIds,
            timeRange: this.timeRange,
            aggregation: this.aggregation,
            interval: this.interval,
            filters: this.filters,
            limit: this.limit,
            orderBy: this.orderBy,
            orderDirection: this.orderDirection
        };
    }
}

module.exports = {
    MetricDataPoint,
    RepositoryMetrics,
    PipelineMetrics,
    SystemMetrics,
    AggregatedMetrics,
    MetricsQuery
};
/**
 * WikiJS Agent Performance Metrics Collector
 * Advanced metrics collection for performance analysis and capacity planning
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            collection_interval: config.collection_interval || 15000, // 15 seconds
            metrics_retention: config.metrics_retention || 7 * 24 * 60 * 60 * 1000, // 7 days
            storage_path: config.storage_path || '/home/dev/workspace/wikijs-monitoring/data',
            batch_size: config.batch_size || 100,
            ...config
        };

        this.metrics = new Map();
        this.metricHistory = new Map();
        this.collectors = new Map();
        this.isCollecting = false;
        this.currentBatch = [];
    }

    /**
     * Start metrics collection
     */
    async start() {
        if (this.isCollecting) {
            return;
        }

        this.isCollecting = true;
        console.log('📊 Starting WikiJS Agent Metrics Collection');

        // Ensure storage directory exists
        await fs.mkdir(this.config.storage_path, { recursive: true });

        // Initialize metric collectors
        this.initializeCollectors();

        // Start collection loop
        this.startCollection();

        this.emit('collection-started');
    }

    /**
     * Stop metrics collection
     */
    async stop() {
        if (!this.isCollecting) {
            return;
        }

        this.isCollecting = false;
        console.log('⏹️ Stopping WikiJS Agent Metrics Collection');

        // Clear collection intervals
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
        }
        if (this.persistenceInterval) {
            clearInterval(this.persistenceInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Flush remaining data
        await this.flushMetrics();

        this.emit('collection-stopped');
    }

    /**
     * Initialize metric collectors
     */
    initializeCollectors() {
        // Performance metrics collector
        this.collectors.set('performance', {
            name: 'Performance Metrics',
            collect: () => this.collectPerformanceMetrics(),
            interval: 15000 // 15 seconds
        });

        // Resource utilization collector
        this.collectors.set('resources', {
            name: 'Resource Utilization',
            collect: () => this.collectResourceMetrics(),
            interval: 10000 // 10 seconds
        });

        // Application metrics collector
        this.collectors.set('application', {
            name: 'Application Metrics',
            collect: () => this.collectApplicationMetrics(),
            interval: 30000 // 30 seconds
        });

        // Business metrics collector
        this.collectors.set('business', {
            name: 'Business Metrics',
            collect: () => this.collectBusinessMetrics(),
            interval: 60000 // 60 seconds
        });

        // Quality metrics collector
        this.collectors.set('quality', {
            name: 'Quality Metrics',
            collect: () => this.collectQualityMetrics(),
            interval: 120000 // 2 minutes
        });
    }

    /**
     * Start metrics collection loop
     */
    startCollection() {
        // Main collection loop
        this.collectionInterval = setInterval(async () => {
            await this.runCollection();
        }, this.config.collection_interval);

        // Persistence loop - save to disk every minute
        this.persistenceInterval = setInterval(async () => {
            await this.flushMetrics();
        }, 60000);

        // Cleanup loop - remove old data every hour
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupOldMetrics();
        }, 3600000);
    }

    /**
     * Run collection cycle
     */
    async runCollection() {
        const timestamp = Date.now();
        const collectionPromises = [];

        // Run all collectors
        for (const [collectorName, collector] of this.collectors.entries()) {
            try {
                collectionPromises.push(
                    this.runCollector(collectorName, collector, timestamp)
                );
            } catch (error) {
                console.error(`Collector ${collectorName} failed:`, error);
            }
        }

        await Promise.allSettled(collectionPromises);
    }

    /**
     * Run individual collector
     */
    async runCollector(collectorName, collector, timestamp) {
        try {
            const data = await collector.collect();
            if (data) {
                this.recordMetric(collectorName, data, timestamp);
            }
        } catch (error) {
            console.error(`Error in collector ${collectorName}:`, error);
        }
    }

    /**
     * Record metric data
     */
    recordMetric(type, data, timestamp) {
        const metric = {
            timestamp,
            type,
            data
        };

        // Add to current metrics
        this.metrics.set(`${type}_${timestamp}`, metric);

        // Add to batch for persistence
        this.currentBatch.push(metric);

        // Add to history for quick access
        if (!this.metricHistory.has(type)) {
            this.metricHistory.set(type, []);
        }
        
        const history = this.metricHistory.get(type);
        history.push(metric);

        // Keep only recent history in memory (last 1000 entries)
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }

        this.emit('metric-recorded', metric);
    }

    /**
     * Collect performance metrics
     */
    async collectPerformanceMetrics() {
        const timestamp = Date.now();

        return {
            processing: {
                documents_per_minute: await this.getDocumentsPerMinute(),
                processing_time_avg: await this.getAverageProcessingTime(),
                processing_time_p95: await this.getProcessingTimePercentile(95),
                processing_time_p99: await this.getProcessingTimePercentile(99),
                queue_depth: await this.getQueueDepth(),
                active_operations: await this.getActiveOperations()
            },
            network: {
                request_rate: await this.getRequestRate(),
                response_time_avg: await this.getAverageResponseTime(),
                error_rate: await this.getErrorRate(),
                connection_pool_usage: await this.getConnectionPoolUsage()
            },
            cache: {
                hit_rate: await this.getCacheHitRate(),
                memory_usage: await this.getCacheMemoryUsage(),
                eviction_rate: await this.getCacheEvictionRate()
            },
            timestamp
        };
    }

    /**
     * Collect resource utilization metrics
     */
    async collectResourceMetrics() {
        const timestamp = Date.now();

        // CPU metrics
        const cpuUsage = await this.getCPUUsage();
        const loadAverage = os.loadavg();

        // Memory metrics
        const memoryUsage = process.memoryUsage();
        const systemMemory = {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
        };

        // Disk I/O metrics
        const diskMetrics = await this.getDiskMetrics();

        // Network I/O metrics
        const networkMetrics = await this.getNetworkMetrics();

        return {
            cpu: {
                usage_percent: cpuUsage,
                load_1m: loadAverage[0],
                load_5m: loadAverage[1],
                load_15m: loadAverage[2],
                cores: os.cpus().length
            },
            memory: {
                process_rss: memoryUsage.rss,
                process_heap_used: memoryUsage.heapUsed,
                process_heap_total: memoryUsage.heapTotal,
                process_external: memoryUsage.external,
                system_total: systemMemory.total,
                system_free: systemMemory.free,
                system_used: systemMemory.used,
                system_usage_percent: (systemMemory.used / systemMemory.total) * 100
            },
            disk: diskMetrics,
            network: networkMetrics,
            timestamp
        };
    }

    /**
     * Collect application-specific metrics
     */
    async collectApplicationMetrics() {
        const timestamp = Date.now();

        return {
            document_scanner: {
                files_scanned: await this.getFilesScanned(),
                scan_duration_avg: await this.getAverageScanDuration(),
                scan_errors: await this.getScanErrors(),
                discovery_rate: await this.getDiscoveryRate()
            },
            wikijs_integration: {
                pages_created: await this.getPagesCreated(),
                pages_updated: await this.getPagesUpdated(),
                upload_success_rate: await this.getUploadSuccessRate(),
                api_response_time: await this.getWikiJSResponseTime()
            },
            mcp_server: {
                tool_calls_total: await this.getToolCallsTotal(),
                tool_success_rate: await this.getToolSuccessRate(),
                tool_response_time_avg: await this.getToolResponseTime(),
                connection_pool_size: await this.getMCPConnectionPoolSize()
            },
            timestamp
        };
    }

    /**
     * Collect business metrics
     */
    async collectBusinessMetrics() {
        const timestamp = Date.now();

        return {
            productivity: {
                documents_processed_total: await this.getDocumentsProcessedTotal(),
                documents_uploaded_total: await this.getDocumentsUploadedTotal(),
                processing_throughput: await this.getProcessingThroughput(),
                time_saved_estimation: await this.getTimeSavedEstimation()
            },
            quality: {
                enhancement_success_rate: await this.getEnhancementSuccessRate(),
                quality_improvement_avg: await this.getQualityImprovementAverage(),
                categorization_accuracy: await this.getCategorizationAccuracy(),
                link_detection_accuracy: await this.getLinkDetectionAccuracy()
            },
            usage: {
                active_users: await this.getActiveUsers(),
                session_duration_avg: await this.getAverageSessionDuration(),
                feature_usage: await this.getFeatureUsage(),
                error_reports: await this.getErrorReports()
            },
            timestamp
        };
    }

    /**
     * Collect quality metrics
     */
    async collectQualityMetrics() {
        const timestamp = Date.now();

        return {
            ai_processing: {
                quality_score_avg: await this.getAIQualityScoreAverage(),
                processing_confidence_avg: await this.getProcessingConfidenceAverage(),
                enhancement_types: await this.getEnhancementTypes(),
                processing_failures: await this.getProcessingFailures()
            },
            content_quality: {
                readability_score_avg: await this.getReadabilityScoreAverage(),
                grammar_score_avg: await this.getGrammarScoreAverage(),
                technical_accuracy_avg: await this.getTechnicalAccuracyAverage(),
                structure_score_avg: await this.getStructureScoreAverage()
            },
            validation: {
                schema_compliance_rate: await this.getSchemaComplianceRate(),
                link_validation_rate: await this.getLinkValidationRate(),
                metadata_completeness: await this.getMetadataCompleteness(),
                duplicate_detection_rate: await this.getDuplicateDetectionRate()
            },
            timestamp
        };
    }

    /**
     * Get CPU usage percentage
     */
    async getCPUUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = process.hrtime();

            setTimeout(() => {
                const currentUsage = process.cpuUsage(startUsage);
                const currentTime = process.hrtime(startTime);
                
                const totalTime = currentTime[0] * 1e6 + currentTime[1] / 1000; // microseconds
                const totalCPU = currentUsage.user + currentUsage.system;
                const percentage = (totalCPU / totalTime) * 100;
                
                resolve(Math.min(100, Math.max(0, percentage)));
            }, 100);
        });
    }

    /**
     * Get disk metrics
     */
    async getDiskMetrics() {
        try {
            const { spawn } = require('child_process');
            
            return new Promise((resolve) => {
                const iostat = spawn('iostat', ['-x', '1', '1']);
                let output = '';

                iostat.stdout.on('data', (data) => {
                    output += data.toString();
                });

                iostat.on('close', () => {
                    // Parse iostat output for I/O metrics
                    const metrics = {
                        read_iops: Math.random() * 100, // Placeholder
                        write_iops: Math.random() * 50,
                        read_throughput: Math.random() * 1000,
                        write_throughput: Math.random() * 500,
                        utilization: Math.random() * 20
                    };
                    resolve(metrics);
                });

                iostat.on('error', () => {
                    // Fallback if iostat is not available
                    resolve({
                        read_iops: 0,
                        write_iops: 0,
                        read_throughput: 0,
                        write_throughput: 0,
                        utilization: 0
                    });
                });
            });
        } catch (error) {
            return {
                read_iops: 0,
                write_iops: 0,
                read_throughput: 0,
                write_throughput: 0,
                utilization: 0
            };
        }
    }

    /**
     * Get network metrics
     */
    async getNetworkMetrics() {
        // This would typically read from /proc/net/dev on Linux
        // For now, return simulated metrics
        return {
            bytes_received: Math.random() * 1000000,
            bytes_sent: Math.random() * 500000,
            packets_received: Math.random() * 1000,
            packets_sent: Math.random() * 500,
            errors: Math.random() * 5,
            drops: Math.random() * 2
        };
    }

    // Placeholder methods for application-specific metrics
    // These would be implemented based on actual WikiJS agent functionality
    
    async getDocumentsPerMinute() { return Math.floor(Math.random() * 10); }
    async getAverageProcessingTime() { return Math.random() * 5000; }
    async getProcessingTimePercentile(percentile) { return Math.random() * 10000; }
    async getQueueDepth() { return Math.floor(Math.random() * 20); }
    async getActiveOperations() { return Math.floor(Math.random() * 5); }
    async getRequestRate() { return Math.random() * 100; }
    async getAverageResponseTime() { return Math.random() * 1000; }
    async getErrorRate() { return Math.random() * 2; }
    async getConnectionPoolUsage() { return Math.random() * 100; }
    async getCacheHitRate() { return 85 + Math.random() * 15; }
    async getCacheMemoryUsage() { return Math.random() * 100000000; }
    async getCacheEvictionRate() { return Math.random() * 10; }

    // Application metrics placeholders
    async getFilesScanned() { return Math.floor(Math.random() * 1000); }
    async getAverageScanDuration() { return Math.random() * 2000; }
    async getScanErrors() { return Math.floor(Math.random() * 5); }
    async getDiscoveryRate() { return Math.random() * 50; }
    async getPagesCreated() { return Math.floor(Math.random() * 20); }
    async getPagesUpdated() { return Math.floor(Math.random() * 30); }
    async getUploadSuccessRate() { return 90 + Math.random() * 10; }
    async getWikiJSResponseTime() { return Math.random() * 2000; }

    // Business metrics placeholders
    async getDocumentsProcessedTotal() { return Math.floor(Math.random() * 10000); }
    async getDocumentsUploadedTotal() { return Math.floor(Math.random() * 8000); }
    async getProcessingThroughput() { return Math.random() * 100; }
    async getTimeSavedEstimation() { return Math.random() * 1000; }
    async getEnhancementSuccessRate() { return 80 + Math.random() * 20; }
    async getQualityImprovementAverage() { return Math.random(); }
    async getCategorizationAccuracy() { return 85 + Math.random() * 15; }
    async getLinkDetectionAccuracy() { return 75 + Math.random() * 25; }

    // Quality metrics placeholders
    async getAIQualityScoreAverage() { return 0.7 + Math.random() * 0.3; }
    async getProcessingConfidenceAverage() { return 0.8 + Math.random() * 0.2; }
    async getEnhancementTypes() { return ['grammar', 'structure', 'clarity']; }
    async getProcessingFailures() { return Math.floor(Math.random() * 10); }
    async getReadabilityScoreAverage() { return 0.6 + Math.random() * 0.4; }
    async getGrammarScoreAverage() { return 0.8 + Math.random() * 0.2; }
    async getTechnicalAccuracyAverage() { return 0.85 + Math.random() * 0.15; }
    async getStructureScoreAverage() { return 0.7 + Math.random() * 0.3; }

    // Additional placeholder methods
    async getToolCallsTotal() { return Math.floor(Math.random() * 1000); }
    async getToolSuccessRate() { return 95 + Math.random() * 5; }
    async getToolResponseTime() { return Math.random() * 500; }
    async getMCPConnectionPoolSize() { return Math.floor(Math.random() * 10); }
    async getActiveUsers() { return Math.floor(Math.random() * 50); }
    async getAverageSessionDuration() { return Math.random() * 3600; }
    async getFeatureUsage() { return { upload: 80, enhance: 60, categorize: 40 }; }
    async getErrorReports() { return Math.floor(Math.random() * 5); }
    async getSchemaComplianceRate() { return 90 + Math.random() * 10; }
    async getLinkValidationRate() { return 85 + Math.random() * 15; }
    async getMetadataCompleteness() { return 75 + Math.random() * 25; }
    async getDuplicateDetectionRate() { return 95 + Math.random() * 5; }

    /**
     * Flush metrics to persistent storage
     */
    async flushMetrics() {
        if (this.currentBatch.length === 0) {
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `metrics-${timestamp}.json`;
        const filepath = path.join(this.config.storage_path, filename);

        try {
            await fs.writeFile(
                filepath,
                JSON.stringify(this.currentBatch, null, 2),
                'utf8'
            );

            this.emit('metrics-flushed', {
                filename,
                count: this.currentBatch.length
            });

            this.currentBatch = [];
        } catch (error) {
            console.error('Failed to flush metrics:', error);
        }
    }

    /**
     * Clean up old metrics files
     */
    async cleanupOldMetrics() {
        try {
            const files = await fs.readdir(this.config.storage_path);
            const now = Date.now();
            
            for (const file of files) {
                if (file.startsWith('metrics-') && file.endsWith('.json')) {
                    const filepath = path.join(this.config.storage_path, file);
                    const stats = await fs.stat(filepath);
                    
                    if (now - stats.mtime.getTime() > this.config.metrics_retention) {
                        await fs.unlink(filepath);
                        console.log(`Cleaned up old metrics file: ${file}`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old metrics:', error);
        }
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        const summary = {
            collection_status: this.isCollecting ? 'active' : 'stopped',
            collectors: this.collectors.size,
            metrics_in_memory: this.metrics.size,
            batch_size: this.currentBatch.length,
            history_size: Array.from(this.metricHistory.values()).reduce((sum, arr) => sum + arr.length, 0),
            last_collection: this.lastCollection || null
        };

        return summary;
    }

    /**
     * Get metrics by type and time range
     */
    getMetrics(type, startTime, endTime) {
        const history = this.metricHistory.get(type) || [];
        
        return history.filter(metric => {
            return metric.timestamp >= startTime && metric.timestamp <= endTime;
        });
    }

    /**
     * Export all metrics data
     */
    exportMetrics() {
        return {
            current_metrics: Object.fromEntries(this.metrics.entries()),
            metric_history: Object.fromEntries(this.metricHistory.entries()),
            summary: this.getMetricsSummary()
        };
    }
}

module.exports = MetricsCollector;
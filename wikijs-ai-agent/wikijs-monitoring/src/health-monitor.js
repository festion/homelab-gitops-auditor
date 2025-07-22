/**
 * WikiJS Agent Health Monitor
 * Comprehensive health monitoring system for WikiJS agent infrastructure
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const axios = require('axios');

class HealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            checkInterval: config.checkInterval || 30000, // 30 seconds
            healthChecks: {
                wikijs_agent: {
                    enabled: true,
                    endpoint: 'http://localhost:3001/health',
                    timeout: 5000,
                    critical: true,
                    interval: 30000
                },
                wikijs_mcp_server: {
                    enabled: true,
                    check: 'mcp_connection_test',
                    timeout: 10000,
                    critical: true,
                    interval: 60000
                },
                database_connection: {
                    enabled: true,
                    check: 'sqlite_connection_test',
                    timeout: 5000,
                    critical: true,
                    interval: 30000
                },
                file_system_access: {
                    enabled: true,
                    check: 'directory_accessibility',
                    paths: ['/repos', '/home/dev/workspace'],
                    timeout: 5000,
                    critical: false,
                    interval: 300000 // 5 minutes
                }
            },
            thresholds: {
                cpu_usage: { warning: 70, critical: 85 },
                memory_usage: { warning: 75, critical: 90 },
                disk_space: { warning: 80, critical: 95 },
                response_time: { warning: 2000, critical: 5000 },
                error_rate: { warning: 2, critical: 5 }
            },
            ...config
        };

        this.healthStatus = new Map();
        this.metrics = new Map();
        this.lastChecks = new Map();
        this.alerts = new Map();
        this.isMonitoring = false;
    }

    /**
     * Start health monitoring
     */
    async start() {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        console.log('🔍 Starting WikiJS Agent Health Monitor');

        // Initialize health status
        for (const [checkName, config] of Object.entries(this.config.healthChecks)) {
            if (config.enabled) {
                this.healthStatus.set(checkName, {
                    status: 'unknown',
                    lastCheck: null,
                    lastSuccess: null,
                    errorCount: 0,
                    responseTime: null
                });
            }
        }

        // Start monitoring loops
        this.startHealthChecks();
        this.startResourceMonitoring();
        this.startMetricsCollection();

        this.emit('monitor-started');
    }

    /**
     * Stop health monitoring
     */
    async stop() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        console.log('⏹️ Stopping WikiJS Agent Health Monitor');

        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        this.emit('monitor-stopped');
    }

    /**
     * Start health check monitoring
     */
    startHealthChecks() {
        // Run initial checks
        this.runAllHealthChecks();

        // Schedule periodic checks
        this.healthCheckInterval = setInterval(() => {
            this.runAllHealthChecks();
        }, this.config.checkInterval);
    }

    /**
     * Run all configured health checks
     */
    async runAllHealthChecks() {
        const checks = Object.entries(this.config.healthChecks)
            .filter(([_, config]) => config.enabled);

        await Promise.allSettled(
            checks.map(([name, config]) => this.runHealthCheck(name, config))
        );
    }

    /**
     * Run individual health check
     */
    async runHealthCheck(checkName, checkConfig) {
        const startTime = Date.now();
        let status = 'healthy';
        let error = null;
        let responseTime = null;

        try {
            switch (checkConfig.check || 'endpoint') {
                case 'endpoint':
                    await this.checkEndpoint(checkConfig.endpoint, checkConfig.timeout);
                    break;
                case 'mcp_connection_test':
                    await this.checkMCPConnection();
                    break;
                case 'sqlite_connection_test':
                    await this.checkDatabaseConnection();
                    break;
                case 'directory_accessibility':
                    await this.checkDirectoryAccess(checkConfig.paths);
                    break;
                default:
                    throw new Error(`Unknown check type: ${checkConfig.check}`);
            }

            responseTime = Date.now() - startTime;

            // Reset error count on success
            const currentStatus = this.healthStatus.get(checkName);
            if (currentStatus) {
                currentStatus.errorCount = 0;
                currentStatus.lastSuccess = new Date().toISOString();
            }

        } catch (err) {
            status = 'unhealthy';
            error = err.message;
            responseTime = Date.now() - startTime;

            // Increment error count
            const currentStatus = this.healthStatus.get(checkName);
            if (currentStatus) {
                currentStatus.errorCount++;
            }
        }

        // Update health status
        this.updateHealthStatus(checkName, {
            status,
            error,
            responseTime,
            lastCheck: new Date().toISOString()
        });

        // Check thresholds and generate alerts
        await this.evaluateHealthThresholds(checkName, checkConfig, status, responseTime, error);
    }

    /**
     * Check HTTP endpoint health
     */
    async checkEndpoint(url, timeout = 5000) {
        try {
            const response = await axios.get(url, { timeout });
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Service not available');
            }
            throw error;
        }
    }

    /**
     * Check MCP server connection
     */
    async checkMCPConnection() {
        // This would need to be implemented based on your MCP client
        // For now, simulate a check
        try {
            const wrapperPath = '/home/dev/workspace/wikijs-mcp-wrapper.sh';
            const exists = await fs.access(wrapperPath).then(() => true).catch(() => false);
            if (!exists) {
                throw new Error('WikiJS MCP wrapper not found');
            }
            return true;
        } catch (error) {
            throw new Error(`MCP connection failed: ${error.message}`);
        }
    }

    /**
     * Check database connection
     */
    async checkDatabaseConnection() {
        // Simulate database connectivity check
        try {
            // This would check SQLite database access
            const dbPath = '/home/dev/workspace/data/wikijs_agent.db';
            await fs.access(dbPath);
            return true;
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    /**
     * Check directory accessibility
     */
    async checkDirectoryAccess(paths) {
        for (const dirPath of paths) {
            try {
                const stats = await fs.stat(dirPath);
                if (!stats.isDirectory()) {
                    throw new Error(`${dirPath} is not a directory`);
                }
                // Test write access
                const testFile = path.join(dirPath, '.health-check');
                await fs.writeFile(testFile, 'health check');
                await fs.unlink(testFile);
            } catch (error) {
                throw new Error(`Directory access failed for ${dirPath}: ${error.message}`);
            }
        }
    }

    /**
     * Update health status
     */
    updateHealthStatus(checkName, update) {
        const current = this.healthStatus.get(checkName) || {};
        const updated = { ...current, ...update };
        this.healthStatus.set(checkName, updated);

        // Emit status change event
        this.emit('health-status-change', {
            check: checkName,
            status: updated,
            timestamp: update.lastCheck
        });
    }

    /**
     * Start resource monitoring
     */
    startResourceMonitoring() {
        // Run initial resource check
        this.collectResourceMetrics();

        // Schedule periodic resource monitoring
        this.resourceMonitorInterval = setInterval(() => {
            this.collectResourceMetrics();
        }, 15000); // Every 15 seconds
    }

    /**
     * Collect system resource metrics
     */
    async collectResourceMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                cpu: {
                    usage: await this.getCPUUsage(),
                    loadAverage: os.loadavg()
                },
                memory: {
                    total: os.totalmem(),
                    free: os.freemem(),
                    usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
                },
                disk: await this.getDiskUsage(),
                network: await this.getNetworkStats(),
                processes: await this.getProcessStats()
            };

            this.metrics.set('resources', metrics);

            // Check resource thresholds
            await this.evaluateResourceThresholds(metrics);

            this.emit('metrics-collected', { type: 'resources', data: metrics });
        } catch (error) {
            console.error('Resource metrics collection failed:', error);
        }
    }

    /**
     * Get CPU usage percentage
     */
    async getCPUUsage() {
        return new Promise((resolve) => {
            const startMeasure = this.cpuAverage();
            
            setTimeout(() => {
                const endMeasure = this.cpuAverage();
                const idleDifference = endMeasure.idle - startMeasure.idle;
                const totalDifference = endMeasure.total - startMeasure.total;
                const usage = 100 - ~~(100 * idleDifference / totalDifference);
                resolve(usage);
            }, 100);
        });
    }

    /**
     * Calculate CPU average
     */
    cpuAverage() {
        let totalIdle = 0;
        let totalTick = 0;
        const cpus = os.cpus();

        for (let cpu of cpus) {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }

        return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
    }

    /**
     * Get disk usage statistics
     */
    async getDiskUsage() {
        try {
            const { spawn } = require('child_process');
            
            return new Promise((resolve, reject) => {
                const df = spawn('df', ['-h', '/']);
                let output = '';

                df.stdout.on('data', (data) => {
                    output += data.toString();
                });

                df.on('close', (code) => {
                    if (code === 0) {
                        const lines = output.trim().split('\n');
                        if (lines.length > 1) {
                            const parts = lines[1].split(/\s+/);
                            resolve({
                                filesystem: parts[0],
                                size: parts[1],
                                used: parts[2],
                                available: parts[3],
                                usage_percent: parseInt(parts[4].replace('%', ''))
                            });
                        } else {
                            resolve({ usage_percent: 0 });
                        }
                    } else {
                        reject(new Error('Failed to get disk usage'));
                    }
                });
            });
        } catch (error) {
            return { usage_percent: 0 };
        }
    }

    /**
     * Get network statistics
     */
    async getNetworkStats() {
        const interfaces = os.networkInterfaces();
        const stats = {};

        for (const [name, addresses] of Object.entries(interfaces)) {
            if (addresses) {
                stats[name] = {
                    addresses: addresses.length,
                    ipv4: addresses.filter(addr => addr.family === 'IPv4').length,
                    ipv6: addresses.filter(addr => addr.family === 'IPv6').length
                };
            }
        }

        return stats;
    }

    /**
     * Get process statistics
     */
    async getProcessStats() {
        return {
            pid: process.pid,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        };
    }

    /**
     * Start application metrics collection
     */
    startMetricsCollection() {
        // Initialize metrics tracking
        this.applicationMetrics = {
            documents_processed: 0,
            documents_uploaded: 0,
            processing_errors: 0,
            upload_errors: 0,
            average_processing_time: 0,
            queue_depth: 0,
            last_processing_time: null
        };

        this.metricsInterval = setInterval(() => {
            this.collectApplicationMetrics();
        }, 60000); // Every minute
    }

    /**
     * Collect application-specific metrics
     */
    async collectApplicationMetrics() {
        const timestamp = new Date().toISOString();
        
        // This would collect metrics from the WikiJS agent
        // For now, simulate some metrics
        const metrics = {
            timestamp,
            processing: {
                documents_per_minute: Math.floor(Math.random() * 10),
                processing_time_avg: Math.random() * 5000,
                queue_depth: Math.floor(Math.random() * 5),
                error_rate: Math.random() * 2
            },
            uploads: {
                success_rate: 95 + Math.random() * 5,
                total_uploads: this.applicationMetrics.documents_uploaded,
                failed_uploads: this.applicationMetrics.upload_errors
            },
            ai_processing: {
                enhancement_success_rate: 85 + Math.random() * 15,
                quality_score_avg: 0.7 + Math.random() * 0.3,
                processing_time_avg: Math.random() * 10000
            }
        };

        this.metrics.set('application', metrics);
        this.emit('metrics-collected', { type: 'application', data: metrics });
    }

    /**
     * Evaluate health thresholds and generate alerts
     */
    async evaluateHealthThresholds(checkName, checkConfig, status, responseTime, error) {
        const alertKey = `health_${checkName}`;
        
        if (status === 'unhealthy' && checkConfig.critical) {
            await this.generateAlert('critical', alertKey, {
                check: checkName,
                message: `Critical health check failed: ${error}`,
                responseTime,
                error
            });
        } else if (responseTime && responseTime > this.config.thresholds.response_time.critical) {
            await this.generateAlert('critical', `${alertKey}_response_time`, {
                check: checkName,
                message: `Response time critical: ${responseTime}ms`,
                responseTime
            });
        } else if (responseTime && responseTime > this.config.thresholds.response_time.warning) {
            await this.generateAlert('warning', `${alertKey}_response_time`, {
                check: checkName,
                message: `Response time high: ${responseTime}ms`,
                responseTime
            });
        } else {
            // Clear alerts if everything is OK
            await this.clearAlert(alertKey);
            await this.clearAlert(`${alertKey}_response_time`);
        }
    }

    /**
     * Evaluate resource thresholds
     */
    async evaluateResourceThresholds(metrics) {
        // CPU usage alerts
        if (metrics.cpu.usage >= this.config.thresholds.cpu_usage.critical) {
            await this.generateAlert('critical', 'cpu_usage', {
                message: `CPU usage critical: ${metrics.cpu.usage}%`,
                value: metrics.cpu.usage,
                threshold: this.config.thresholds.cpu_usage.critical
            });
        } else if (metrics.cpu.usage >= this.config.thresholds.cpu_usage.warning) {
            await this.generateAlert('warning', 'cpu_usage', {
                message: `CPU usage high: ${metrics.cpu.usage}%`,
                value: metrics.cpu.usage,
                threshold: this.config.thresholds.cpu_usage.warning
            });
        } else {
            await this.clearAlert('cpu_usage');
        }

        // Memory usage alerts
        if (metrics.memory.usage >= this.config.thresholds.memory_usage.critical) {
            await this.generateAlert('critical', 'memory_usage', {
                message: `Memory usage critical: ${metrics.memory.usage.toFixed(1)}%`,
                value: metrics.memory.usage,
                threshold: this.config.thresholds.memory_usage.critical
            });
        } else if (metrics.memory.usage >= this.config.thresholds.memory_usage.warning) {
            await this.generateAlert('warning', 'memory_usage', {
                message: `Memory usage high: ${metrics.memory.usage.toFixed(1)}%`,
                value: metrics.memory.usage,
                threshold: this.config.thresholds.memory_usage.warning
            });
        } else {
            await this.clearAlert('memory_usage');
        }

        // Disk usage alerts
        if (metrics.disk.usage_percent >= this.config.thresholds.disk_space.critical) {
            await this.generateAlert('critical', 'disk_usage', {
                message: `Disk usage critical: ${metrics.disk.usage_percent}%`,
                value: metrics.disk.usage_percent,
                threshold: this.config.thresholds.disk_space.critical
            });
        } else if (metrics.disk.usage_percent >= this.config.thresholds.disk_space.warning) {
            await this.generateAlert('warning', 'disk_usage', {
                message: `Disk usage high: ${metrics.disk.usage_percent}%`,
                value: metrics.disk.usage_percent,
                threshold: this.config.thresholds.disk_space.warning
            });
        } else {
            await this.clearAlert('disk_usage');
        }
    }

    /**
     * Generate an alert
     */
    async generateAlert(severity, alertKey, details) {
        const existingAlert = this.alerts.get(alertKey);
        const now = new Date().toISOString();

        if (existingAlert && existingAlert.severity === severity) {
            // Update existing alert
            existingAlert.lastOccurrence = now;
            existingAlert.count++;
        } else {
            // Create new alert
            const alert = {
                key: alertKey,
                severity,
                message: details.message,
                details,
                firstOccurrence: now,
                lastOccurrence: now,
                count: 1,
                status: 'active'
            };

            this.alerts.set(alertKey, alert);

            this.emit('alert-generated', alert);
        }
    }

    /**
     * Clear an alert
     */
    async clearAlert(alertKey) {
        if (this.alerts.has(alertKey)) {
            const alert = this.alerts.get(alertKey);
            alert.status = 'resolved';
            alert.resolvedAt = new Date().toISOString();

            this.emit('alert-resolved', alert);
            this.alerts.delete(alertKey);
        }
    }

    /**
     * Get current health status summary
     */
    getHealthSummary() {
        const summary = {
            overall: 'healthy',
            checks: {},
            metrics: {},
            alerts: Array.from(this.alerts.values()).filter(alert => alert.status === 'active'),
            lastUpdate: new Date().toISOString()
        };

        // Aggregate health check status
        let hasWarnings = false;
        let hasCritical = false;

        for (const [checkName, status] of this.healthStatus.entries()) {
            summary.checks[checkName] = status;
            
            if (status.status === 'unhealthy') {
                const checkConfig = this.config.healthChecks[checkName];
                if (checkConfig && checkConfig.critical) {
                    hasCritical = true;
                } else {
                    hasWarnings = true;
                }
            }
        }

        // Determine overall status
        if (hasCritical) {
            summary.overall = 'critical';
        } else if (hasWarnings || summary.alerts.length > 0) {
            summary.overall = 'warning';
        }

        // Include latest metrics
        summary.metrics = Object.fromEntries(this.metrics.entries());

        return summary;
    }

    /**
     * Export health data
     */
    exportHealthData() {
        return {
            healthStatus: Object.fromEntries(this.healthStatus.entries()),
            metrics: Object.fromEntries(this.metrics.entries()),
            alerts: Array.from(this.alerts.values()),
            config: this.config
        };
    }
}

module.exports = HealthMonitor;
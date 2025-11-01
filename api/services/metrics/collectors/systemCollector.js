/**
 * System Metrics Collector
 * 
 * Collects comprehensive system-level metrics including API performance,
 * resource usage, audit statistics, and WebSocket connections.
 */

const EventEmitter = require('events');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { SystemMetrics } = require('../../../models/metrics');

class SystemCollector extends EventEmitter {
    constructor(config, webSocketManager = null) {
        super();
        this.config = config;
        this.webSocketManager = webSocketManager;
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute
        
        // Tracking state
        this.apiRequestCount = 0;
        this.apiResponseTimes = [];
        this.apiErrors = 0;
        this.lastResetTime = Date.now();
        this.processStartTime = Date.now();
    }

    /**
     * Collect all system metrics
     */
    async collect() {
        try {
            const metrics = await this.collectSystemMetrics();
            const dataPoints = metrics.toMetricDataPoints();
            
            this.emit('system:collected', { metrics, count: dataPoints.length });
            return dataPoints;
        } catch (error) {
            console.error('Error collecting system metrics:', error);
            this.emit('system:error', error);
            throw error;
        }
    }

    /**
     * Collect comprehensive system metrics
     */
    async collectSystemMetrics() {
        const cacheKey = 'system_metrics';
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        // Collect all metrics in parallel
        const [
            apiMetrics,
            resourceMetrics,
            auditMetrics,
            websocketMetrics
        ] = await Promise.all([
            this.collectAPIMetrics(),
            this.collectResourceMetrics(),
            this.collectAuditMetrics(),
            this.collectWebSocketMetrics()
        ]);

        const systemMetrics = new SystemMetrics({
            timestamp: new Date().toISOString(),
            api: apiMetrics,
            resources: resourceMetrics,
            audit: auditMetrics,
            websocket: websocketMetrics
        });

        // Cache the result
        this.cache.set(cacheKey, {
            data: systemMetrics,
            timestamp: Date.now()
        });

        return systemMetrics;
    }

    /**
     * Collect API performance metrics
     */
    async collectAPIMetrics() {
        const api = {
            requestsPerMinute: 0,
            avgResponseTime: 0,
            errorRate: 0,
            activeConnections: 0
        };

        const timeDiff = (Date.now() - this.lastResetTime) / 1000 / 60; // Minutes
        
        if (timeDiff > 0) {
            api.requestsPerMinute = Math.round(this.apiRequestCount / timeDiff);
        }

        if (this.apiResponseTimes.length > 0) {
            const totalTime = this.apiResponseTimes.reduce((sum, time) => sum + time, 0);
            api.avgResponseTime = Math.round(totalTime / this.apiResponseTimes.length);
        }

        const totalRequests = this.apiRequestCount;
        if (totalRequests > 0) {
            api.errorRate = Math.round((this.apiErrors / totalRequests) * 100);
        }

        // Get active connections (if available)
        try {
            const connections = await this.getActiveConnections();
            api.activeConnections = connections;
        } catch (error) {
            // Ignore connection count errors
        }

        return api;
    }

    /**
     * Collect system resource metrics
     */
    async collectResourceMetrics() {
        const resources = {
            cpuUsage: 0,
            memoryUsage: 0,
            diskUsage: 0,
            networkIO: 0
        };

        try {
            // CPU usage
            const cpuUsage = await this.getCPUUsage();
            resources.cpuUsage = cpuUsage;

            // Memory usage
            const memInfo = process.memoryUsage();
            resources.memoryUsage = Math.round(memInfo.heapUsed / 1024 / 1024); // MB

            // Disk usage
            const diskUsage = await this.getDiskUsage();
            resources.diskUsage = diskUsage;

            // Network I/O (simplified)
            const networkIO = await this.getNetworkIO();
            resources.networkIO = networkIO;

        } catch (error) {
            console.error('Error collecting resource metrics:', error);
        }

        return resources;
    }

    /**
     * Collect audit system metrics
     */
    async collectAuditMetrics() {
        const audit = {
            repositoriesScanned: 0,
            auditDuration: 0,
            issuesFound: 0,
            complianceScore: 0
        };

        try {
            // Get audit statistics from recent runs
            const auditStats = await this.getAuditStatistics();
            Object.assign(audit, auditStats);

        } catch (error) {
            console.error('Error collecting audit metrics:', error);
        }

        return audit;
    }

    /**
     * Collect WebSocket metrics
     */
    async collectWebSocketMetrics() {
        const websocket = {
            activeConnections: 0,
            messagesPerSecond: 0,
            errorRate: 0
        };

        try {
            if (this.webSocketManager) {
                const stats = this.webSocketManager.getStats();
                websocket.activeConnections = stats.activeConnections || 0;
                websocket.messagesPerSecond = stats.messagesPerSecond || 0;
                websocket.errorRate = stats.errorRate || 0;
            }
        } catch (error) {
            console.error('Error collecting WebSocket metrics:', error);
        }

        return websocket;
    }

    /**
     * Get CPU usage percentage
     */
    async getCPUUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = Date.now();

            setTimeout(() => {
                const currentUsage = process.cpuUsage(startUsage);
                const currentTime = Date.now();
                
                const userTime = currentUsage.user / 1000; // Convert to ms
                const systemTime = currentUsage.system / 1000;
                const totalTime = currentTime - startTime;
                
                const cpuPercent = Math.round(((userTime + systemTime) / totalTime) * 100);
                resolve(Math.min(100, cpuPercent));
            }, 100);
        });
    }

    /**
     * Get disk usage percentage
     */
    async getDiskUsage() {
        try {
            if (process.platform === 'win32') {
                // Windows disk usage
                return await this.getWindowsDiskUsage();
            } else {
                // Unix-like disk usage
                return await this.getUnixDiskUsage();
            }
        } catch (error) {
            console.error('Error getting disk usage:', error);
            return 0;
        }
    }

    /**
     * Get Unix disk usage
     */
    getUnixDiskUsage() {
        return new Promise((resolve, reject) => {
            exec('df -h /', (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const lines = stdout.trim().split('\n');
                if (lines.length >= 2) {
                    const usage = lines[1].split(/\s+/)[4];
                    const percent = parseInt(usage.replace('%', ''));
                    resolve(percent);
                } else {
                    resolve(0);
                }
            });
        });
    }

    /**
     * Get Windows disk usage
     */
    getWindowsDiskUsage() {
        return new Promise((resolve, reject) => {
            exec('wmic logicaldisk get size,freespace,caption', (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const lines = stdout.trim().split('\n').slice(1);
                if (lines.length > 0) {
                    const parts = lines[0].trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const freeSpace = parseInt(parts[1]);
                        const totalSpace = parseInt(parts[2]);
                        const usedSpace = totalSpace - freeSpace;
                        const percent = Math.round((usedSpace / totalSpace) * 100);
                        resolve(percent);
                    } else {
                        resolve(0);
                    }
                } else {
                    resolve(0);
                }
            });
        });
    }

    /**
     * Get network I/O (simplified estimation)
     */
    async getNetworkIO() {
        try {
            if (process.platform === 'linux') {
                const netstat = await this.execCommand('cat /proc/net/dev');
                const lines = netstat.split('\n').slice(2);
                
                let totalBytes = 0;
                for (const line of lines) {
                    if (line.trim()) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 9) {
                            const rxBytes = parseInt(parts[1]) || 0;
                            const txBytes = parseInt(parts[9]) || 0;
                            totalBytes += rxBytes + txBytes;
                        }
                    }
                }
                
                return Math.round(totalBytes / 1024 / 1024); // MB
            }
        } catch (error) {
            // Ignore network I/O errors
        }
        
        return 0;
    }

    /**
     * Get active network connections count
     */
    async getActiveConnections() {
        try {
            if (process.platform === 'linux') {
                const netstat = await this.execCommand('netstat -an | grep ESTABLISHED | wc -l');
                return parseInt(netstat.trim()) || 0;
            } else if (process.platform === 'darwin') {
                const netstat = await this.execCommand('netstat -an | grep ESTABLISHED | wc -l');
                return parseInt(netstat.trim()) || 0;
            }
        } catch (error) {
            // Ignore connection count errors
        }
        
        return 0;
    }

    /**
     * Get audit system statistics
     */
    async getAuditStatistics() {
        const stats = {
            repositoriesScanned: 0,
            auditDuration: 0,
            issuesFound: 0,
            complianceScore: 0
        };

        try {
            // Try to read audit history or logs
            const auditHistoryPath = this.config.get('HISTORY_DIR', './history');
            
            if (fs.existsSync(auditHistoryPath)) {
                const historyFiles = fs.readdirSync(auditHistoryPath)
                    .filter(file => file.endsWith('.json'))
                    .sort()
                    .slice(-5); // Last 5 audit runs

                let totalRepos = 0;
                let totalDuration = 0;
                let totalIssues = 0;
                let auditCount = 0;

                for (const file of historyFiles) {
                    try {
                        const filePath = `${auditHistoryPath}/${file}`;
                        const auditData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (auditData.repositories) {
                            totalRepos += Object.keys(auditData.repositories).length;
                            auditCount++;
                            
                            // Count issues
                            for (const repo of Object.values(auditData.repositories)) {
                                if (repo.issues) {
                                    totalIssues += repo.issues.length;
                                }
                            }
                        }
                        
                        // Estimate duration from file timestamp
                        if (auditData.timestamp) {
                            const fileTime = new Date(auditData.timestamp);
                            const now = new Date();
                            if (now - fileTime < 24 * 60 * 60 * 1000) { // Last 24 hours
                                totalDuration += 300; // Estimate 5 minutes per audit
                            }
                        }
                    } catch (e) {
                        // Ignore individual file errors
                    }
                }

                if (auditCount > 0) {
                    stats.repositoriesScanned = Math.round(totalRepos / auditCount);
                    stats.auditDuration = Math.round(totalDuration / auditCount);
                    stats.issuesFound = Math.round(totalIssues / auditCount);
                    
                    // Simple compliance score calculation
                    const avgIssuesPerRepo = totalIssues / totalRepos;
                    stats.complianceScore = Math.max(0, Math.round(100 - (avgIssuesPerRepo * 10)));
                }
            }
        } catch (error) {
            console.error('Error getting audit statistics:', error);
        }

        return stats;
    }

    /**
     * Track API request
     */
    trackAPIRequest(responseTime, isError = false) {
        this.apiRequestCount++;
        
        if (responseTime) {
            this.apiResponseTimes.push(responseTime);
            
            // Keep only recent response times (last 100)
            if (this.apiResponseTimes.length > 100) {
                this.apiResponseTimes = this.apiResponseTimes.slice(-100);
            }
        }
        
        if (isError) {
            this.apiErrors++;
        }
    }

    /**
     * Reset API tracking counters
     */
    resetAPITracking() {
        this.apiRequestCount = 0;
        this.apiResponseTimes = [];
        this.apiErrors = 0;
        this.lastResetTime = Date.now();
    }

    /**
     * Execute shell command
     */
    execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout: 10000 }, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get collector statistics
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            apiRequestCount: this.apiRequestCount,
            apiErrors: this.apiErrors,
            uptime: Date.now() - this.processStartTime,
            hasWebSocketManager: !!this.webSocketManager
        };
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
            cpuCores: os.cpus().length,
            uptime: os.uptime(),
            processUptime: process.uptime()
        };
    }
}

module.exports = SystemCollector;
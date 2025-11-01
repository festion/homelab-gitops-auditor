/**
 * WikiJS Agent Monitoring Dashboard
 * Real-time monitoring dashboard with comprehensive system visibility
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

class MonitoringDashboard {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3002,
            host: config.host || '0.0.0.0',
            update_interval: config.update_interval || 5000, // 5 seconds
            data_retention: config.data_retention || 24 * 60 * 60 * 1000, // 24 hours
            dashboard_path: config.dashboard_path || '/home/dev/workspace/wikijs-monitoring/dashboard',
            api_prefix: config.api_prefix || '/api/v1',
            ...config
        };

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.healthMonitor = null;
        this.metricsCollector = null;
        this.alertManager = null;
        this.logger = null;

        this.dashboardData = {
            health: {},
            metrics: {},
            alerts: [],
            logs: [],
            system: {},
            lastUpdate: null
        };

        this.connectedClients = new Set();
        this.isRunning = false;
    }

    /**
     * Initialize dashboard with monitoring components
     */
    initialize(healthMonitor, metricsCollector, alertManager, logger) {
        this.healthMonitor = healthMonitor;
        this.metricsCollector = metricsCollector;
        this.alertManager = alertManager;
        this.logger = logger;

        this.setupEventListeners();
        this.setupRoutes();
        this.setupWebSocket();
    }

    /**
     * Setup event listeners for real-time updates
     */
    setupEventListeners() {
        if (this.healthMonitor) {
            this.healthMonitor.on('health-status-change', (data) => {
                this.broadcastHealthUpdate(data);
            });

            this.healthMonitor.on('metrics-collected', (data) => {
                this.broadcastMetricsUpdate(data);
            });
        }

        if (this.metricsCollector) {
            this.metricsCollector.on('metric-recorded', (data) => {
                this.updateDashboardMetrics(data);
            });
        }

        if (this.alertManager) {
            this.alertManager.on('alert-generated', (alert) => {
                this.broadcastAlertUpdate(alert, 'generated');
            });

            this.alertManager.on('alert-resolved', (alert) => {
                this.broadcastAlertUpdate(alert, 'resolved');
            });

            this.alertManager.on('alert-acknowledged', (alert) => {
                this.broadcastAlertUpdate(alert, 'acknowledged');
            });
        }

        if (this.logger) {
            this.logger.on('log-entry', (logEntry) => {
                this.updateDashboardLogs(logEntry);
            });
        }
    }

    /**
     * Setup Express routes
     */
    setupRoutes() {
        // Middleware
        this.app.use(express.json());
        this.app.use(express.static(path.join(this.config.dashboard_path, 'public')));

        // CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            next();
        });

        // API Routes
        this.setupAPIRoutes();

        // Dashboard routes
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(this.config.dashboard_path, 'public', 'index.html'));
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Setup API routes
     */
    setupAPIRoutes() {
        const api = express.Router();

        // Health status endpoints
        api.get('/health/summary', (req, res) => {
            const summary = this.healthMonitor ? this.healthMonitor.getHealthSummary() : {};
            res.json(summary);
        });

        api.get('/health/checks', (req, res) => {
            const healthStatus = this.healthMonitor ? this.healthMonitor.healthStatus : new Map();
            res.json(Object.fromEntries(healthStatus));
        });

        // Metrics endpoints
        api.get('/metrics/summary', (req, res) => {
            const summary = this.metricsCollector ? this.metricsCollector.getMetricsSummary() : {};
            res.json(summary);
        });

        api.get('/metrics/:type', (req, res) => {
            const { type } = req.params;
            const { start, end, limit } = req.query;
            
            const startTime = start ? parseInt(start) : Date.now() - (24 * 60 * 60 * 1000);
            const endTime = end ? parseInt(end) : Date.now();
            
            const metrics = this.metricsCollector ? 
                this.metricsCollector.getMetrics(type, startTime, endTime) : [];
            
            res.json({
                type,
                timeRange: { start: startTime, end: endTime },
                count: metrics.length,
                data: limit ? metrics.slice(0, parseInt(limit)) : metrics
            });
        });

        // Alert endpoints
        api.get('/alerts/summary', (req, res) => {
            const summary = this.alertManager ? this.alertManager.getAlertsSummary() : {};
            res.json(summary);
        });

        api.get('/alerts/active', (req, res) => {
            const alerts = this.alertManager ? this.alertManager.getActiveAlerts() : [];
            res.json(alerts);
        });

        api.get('/alerts/history', (req, res) => {
            const { limit = 100 } = req.query;
            const history = this.alertManager ? 
                this.alertManager.getAlertHistory(parseInt(limit)) : [];
            res.json(history);
        });

        api.post('/alerts/:alertId/acknowledge', async (req, res) => {
            const { alertId } = req.params;
            const { acknowledgedBy, notes } = req.body;
            
            if (this.alertManager) {
                await this.alertManager.acknowledgeAlert(alertId, acknowledgedBy, notes);
                res.json({ success: true });
            } else {
                res.status(503).json({ error: 'Alert manager not available' });
            }
        });

        // Log endpoints
        api.get('/logs/recent', (req, res) => {
            const { limit = 100, level } = req.query;
            const logs = this.getRecentLogs(parseInt(limit), level);
            res.json(logs);
        });

        api.get('/logs/search', async (req, res) => {
            const { query, limit = 100 } = req.query;
            const results = this.logger ? 
                await this.logger.searchLogs(query, { limit: parseInt(limit) }) : 
                { results: [], total: 0 };
            res.json(results);
        });

        // System information endpoints
        api.get('/system/info', (req, res) => {
            res.json(this.getSystemInfo());
        });

        api.get('/system/config', (req, res) => {
            res.json({
                dashboard: this.getDashboardConfig(),
                monitoring: this.getMonitoringConfig()
            });
        });

        // Dashboard data endpoint (for initial load)
        api.get('/dashboard/data', (req, res) => {
            res.json(this.getDashboardData());
        });

        // Export endpoints
        api.get('/export/health', (req, res) => {
            const data = this.healthMonitor ? this.healthMonitor.exportHealthData() : {};
            res.json(data);
        });

        api.get('/export/metrics', (req, res) => {
            const data = this.metricsCollector ? this.metricsCollector.exportMetrics() : {};
            res.json(data);
        });

        api.get('/export/alerts', (req, res) => {
            const data = this.alertManager ? this.alertManager.exportAlertData() : {};
            res.json(data);
        });

        this.app.use(this.config.api_prefix, api);
    }

    /**
     * Setup WebSocket for real-time updates
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`Dashboard client connected: ${socket.id}`);
            this.connectedClients.add(socket);

            // Send initial data
            socket.emit('dashboard-data', this.getDashboardData());

            // Handle client requests
            socket.on('request-update', () => {
                socket.emit('dashboard-data', this.getDashboardData());
            });

            socket.on('subscribe-alerts', () => {
                socket.join('alerts');
            });

            socket.on('subscribe-metrics', (metricTypes) => {
                socket.join('metrics');
                if (metricTypes && Array.isArray(metricTypes)) {
                    for (const type of metricTypes) {
                        socket.join(`metrics-${type}`);
                    }
                }
            });

            socket.on('acknowledge-alert', async (data) => {
                if (this.alertManager) {
                    await this.alertManager.acknowledgeAlert(
                        data.alertId, 
                        data.acknowledgedBy || 'dashboard-user', 
                        data.notes
                    );
                }
            });

            socket.on('disconnect', () => {
                console.log(`Dashboard client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket);
            });
        });
    }

    /**
     * Start dashboard server
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        
        // Ensure dashboard directory exists
        await fs.mkdir(this.config.dashboard_path, { recursive: true });
        await fs.mkdir(path.join(this.config.dashboard_path, 'public'), { recursive: true });

        // Create dashboard HTML if it doesn't exist
        await this.createDashboardHTML();

        // Start periodic updates
        this.startPeriodicUpdates();

        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`📊 Monitoring Dashboard started on http://${this.config.host}:${this.config.port}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Stop dashboard server
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        // Stop periodic updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Close server
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('📊 Monitoring Dashboard stopped');
                resolve();
            });
        });
    }

    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        this.updateInterval = setInterval(() => {
            this.updateDashboardData();
            this.broadcastUpdate();
        }, this.config.update_interval);
    }

    /**
     * Update dashboard data
     */
    updateDashboardData() {
        this.dashboardData = {
            health: this.healthMonitor ? this.healthMonitor.getHealthSummary() : {},
            metrics: this.metricsCollector ? this.metricsCollector.getMetricsSummary() : {},
            alerts: this.alertManager ? this.alertManager.getAlertsSummary() : {},
            system: this.getSystemInfo(),
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Get dashboard data
     */
    getDashboardData() {
        return {
            ...this.dashboardData,
            config: this.getDashboardConfig()
        };
    }

    /**
     * Get dashboard configuration
     */
    getDashboardConfig() {
        return {
            updateInterval: this.config.update_interval,
            dataRetention: this.config.data_retention,
            connectedClients: this.connectedClients.size,
            features: {
                realTimeUpdates: true,
                alerting: !!this.alertManager,
                metrics: !!this.metricsCollector,
                healthChecks: !!this.healthMonitor,
                logging: !!this.logger
            }
        };
    }

    /**
     * Get monitoring configuration
     */
    getMonitoringConfig() {
        return {
            healthMonitor: this.healthMonitor ? this.healthMonitor.config : null,
            metricsCollector: this.metricsCollector ? this.metricsCollector.config : null,
            alertManager: this.alertManager ? this.alertManager.config : null,
            logger: this.logger ? this.logger.config : null
        };
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        const os = require('os');
        
        return {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: process.uptime(),
            pid: process.pid,
            memory: process.memoryUsage(),
            cpus: os.cpus().length,
            loadAverage: os.loadavg(),
            networkInterfaces: Object.keys(os.networkInterfaces()),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get recent logs
     */
    getRecentLogs(limit, level) {
        // This would get recent logs from the logger
        // For now, return from our dashboard data
        let logs = this.dashboardData.logs || [];
        
        if (level) {
            logs = logs.filter(log => log.level === level);
        }
        
        return logs
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Broadcast real-time updates
     */
    broadcastUpdate() {
        this.io.emit('dashboard-update', {
            timestamp: new Date().toISOString(),
            data: this.dashboardData
        });
    }

    /**
     * Broadcast health status update
     */
    broadcastHealthUpdate(data) {
        this.io.emit('health-update', {
            timestamp: new Date().toISOString(),
            data
        });
    }

    /**
     * Broadcast metrics update
     */
    broadcastMetricsUpdate(data) {
        this.io.to('metrics').emit('metrics-update', {
            timestamp: new Date().toISOString(),
            data
        });

        if (data.type) {
            this.io.to(`metrics-${data.type}`).emit('metric-data', {
                timestamp: new Date().toISOString(),
                type: data.type,
                data: data.data
            });
        }
    }

    /**
     * Broadcast alert update
     */
    broadcastAlertUpdate(alert, action) {
        this.io.to('alerts').emit('alert-update', {
            timestamp: new Date().toISOString(),
            action,
            alert
        });

        // Also broadcast to main dashboard
        this.io.emit('alert-notification', {
            timestamp: new Date().toISOString(),
            action,
            alert
        });
    }

    /**
     * Update dashboard metrics
     */
    updateDashboardMetrics(metric) {
        // Keep recent metrics in memory for dashboard
        if (!this.dashboardData.recentMetrics) {
            this.dashboardData.recentMetrics = [];
        }

        this.dashboardData.recentMetrics.unshift(metric);
        
        // Keep only last 1000 metrics
        if (this.dashboardData.recentMetrics.length > 1000) {
            this.dashboardData.recentMetrics = this.dashboardData.recentMetrics.slice(0, 1000);
        }
    }

    /**
     * Update dashboard logs
     */
    updateDashboardLogs(logEntry) {
        // Keep recent logs in memory for dashboard
        if (!this.dashboardData.logs) {
            this.dashboardData.logs = [];
        }

        this.dashboardData.logs.unshift(logEntry);
        
        // Keep only last 500 log entries
        if (this.dashboardData.logs.length > 500) {
            this.dashboardData.logs = this.dashboardData.logs.slice(0, 500);
        }

        // Broadcast to connected clients
        this.io.emit('log-entry', {
            timestamp: new Date().toISOString(),
            entry: logEntry
        });
    }

    /**
     * Create dashboard HTML file
     */
    async createDashboardHTML() {
        const htmlPath = path.join(this.config.dashboard_path, 'public', 'index.html');
        
        try {
            await fs.access(htmlPath);
            return; // File already exists
        } catch (error) {
            // File doesn't exist, create it
        }

        const htmlContent = this.generateDashboardHTML();
        await fs.writeFile(htmlPath, htmlContent, 'utf8');
    }

    /**
     * Generate dashboard HTML
     */
    generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WikiJS Agent Monitoring Dashboard</title>
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .metric-card { transition: all 0.3s ease; }
        .metric-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .status-healthy { color: #28a745; }
        .status-warning { color: #ffc107; }
        .status-critical { color: #dc3545; }
        .alert-critical { border-left: 4px solid #dc3545; }
        .alert-warning { border-left: 4px solid #ffc107; }
        .log-error { color: #dc3545; }
        .log-warn { color: #ffc107; }
        .log-info { color: #17a2b8; }
        .log-debug { color: #6c757d; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container-fluid">
            <span class="navbar-brand">
                <i class="fas fa-chart-line"></i> WikiJS Agent Monitor
            </span>
            <div class="d-flex">
                <span class="badge bg-success me-2" id="connection-status">Connected</span>
                <span class="text-light" id="last-update">--</span>
            </div>
        </div>
    </nav>

    <div class="container-fluid mt-3">
        <!-- Status Overview -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <i class="fas fa-heartbeat fa-2x mb-2" id="overall-status-icon"></i>
                        <h5>Overall Status</h5>
                        <h3 id="overall-status">--</h3>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2 text-warning"></i>
                        <h5>Active Alerts</h5>
                        <h3 id="active-alerts">--</h3>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <i class="fas fa-tachometer-alt fa-2x mb-2 text-info"></i>
                        <h5>Health Checks</h5>
                        <h3 id="health-checks">--</h3>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <i class="fas fa-server fa-2x mb-2 text-secondary"></i>
                        <h5>Uptime</h5>
                        <h3 id="system-uptime">--</h3>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Row -->
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>Resource Usage</h5>
                    </div>
                    <div class="card-body">
                        <canvas id="resource-chart"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>Performance Metrics</h5>
                    </div>
                    <div class="card-body">
                        <canvas id="performance-chart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Alerts and Logs -->
        <div class="row">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>Recent Alerts</h5>
                    </div>
                    <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                        <div id="alerts-list">
                            <p class="text-muted">No alerts</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>Recent Logs</h5>
                    </div>
                    <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                        <div id="logs-list">
                            <p class="text-muted">No logs</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        class MonitoringDashboard {
            constructor() {
                this.socket = io();
                this.charts = {};
                this.data = {};
                this.setupSocketEvents();
                this.initializeCharts();
            }

            setupSocketEvents() {
                this.socket.on('connect', () => {
                    document.getElementById('connection-status').textContent = 'Connected';
                    document.getElementById('connection-status').className = 'badge bg-success me-2';
                });

                this.socket.on('disconnect', () => {
                    document.getElementById('connection-status').textContent = 'Disconnected';
                    document.getElementById('connection-status').className = 'badge bg-danger me-2';
                });

                this.socket.on('dashboard-data', (data) => {
                    this.updateDashboard(data);
                });

                this.socket.on('dashboard-update', (update) => {
                    this.updateDashboard(update.data);
                });

                this.socket.on('alert-notification', (notification) => {
                    this.handleAlertNotification(notification);
                });

                this.socket.on('log-entry', (logData) => {
                    this.addLogEntry(logData.entry);
                });
            }

            initializeCharts() {
                // Resource usage chart
                const resourceCtx = document.getElementById('resource-chart').getContext('2d');
                this.charts.resource = new Chart(resourceCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'CPU %',
                            data: [],
                            borderColor: 'rgb(255, 99, 132)',
                            tension: 0.1
                        }, {
                            label: 'Memory %',
                            data: [],
                            borderColor: 'rgb(54, 162, 235)',
                            tension: 0.1
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100
                            }
                        }
                    }
                });

                // Performance chart
                const performanceCtx = document.getElementById('performance-chart').getContext('2d');
                this.charts.performance = new Chart(performanceCtx, {
                    type: 'bar',
                    data: {
                        labels: ['Response Time', 'Queue Depth', 'Throughput'],
                        datasets: [{
                            label: 'Performance Metrics',
                            data: [0, 0, 0],
                            backgroundColor: [
                                'rgba(255, 99, 132, 0.2)',
                                'rgba(54, 162, 235, 0.2)',
                                'rgba(255, 205, 86, 0.2)'
                            ],
                            borderColor: [
                                'rgb(255, 99, 132)',
                                'rgb(54, 162, 235)',
                                'rgb(255, 205, 86)'
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }

            updateDashboard(data) {
                this.data = data;
                
                // Update status overview
                this.updateStatusOverview(data);
                
                // Update charts
                this.updateCharts(data);
                
                // Update alerts
                this.updateAlerts(data);
                
                // Update last update time
                document.getElementById('last-update').textContent = 
                    new Date(data.lastUpdate).toLocaleTimeString();
            }

            updateStatusOverview(data) {
                const health = data.health || {};
                const alerts = data.alerts || {};
                const system = data.system || {};

                // Overall status
                const overallStatus = health.overall || 'unknown';
                const statusElement = document.getElementById('overall-status');
                const statusIcon = document.getElementById('overall-status-icon');
                
                statusElement.textContent = overallStatus.toUpperCase();
                statusElement.className = \`status-\${overallStatus}\`;
                
                if (overallStatus === 'healthy') {
                    statusIcon.className = 'fas fa-heartbeat fa-2x mb-2 status-healthy';
                } else if (overallStatus === 'warning') {
                    statusIcon.className = 'fas fa-exclamation-triangle fa-2x mb-2 status-warning';
                } else {
                    statusIcon.className = 'fas fa-exclamation-circle fa-2x mb-2 status-critical';
                }

                // Active alerts
                document.getElementById('active-alerts').textContent = alerts.total_active || 0;

                // Health checks
                const checksCount = Object.keys(health.checks || {}).length;
                document.getElementById('health-checks').textContent = checksCount;

                // System uptime
                if (system.uptime) {
                    const hours = Math.floor(system.uptime / 3600);
                    const minutes = Math.floor((system.uptime % 3600) / 60);
                    document.getElementById('system-uptime').textContent = \`\${hours}h \${minutes}m\`;
                }
            }

            updateCharts(data) {
                // This would update charts with real data
                // For now, just update with sample data
                
                // Update resource chart
                const now = new Date().toLocaleTimeString();
                const resourceChart = this.charts.resource;
                
                if (resourceChart.data.labels.length > 20) {
                    resourceChart.data.labels.shift();
                    resourceChart.data.datasets[0].data.shift();
                    resourceChart.data.datasets[1].data.shift();
                }
                
                resourceChart.data.labels.push(now);
                resourceChart.data.datasets[0].data.push(Math.random() * 100);
                resourceChart.data.datasets[1].data.push(Math.random() * 100);
                resourceChart.update('none');

                // Update performance chart
                const performanceChart = this.charts.performance;
                performanceChart.data.datasets[0].data = [
                    Math.random() * 1000, // Response time
                    Math.floor(Math.random() * 50), // Queue depth
                    Math.random() * 100 // Throughput
                ];
                performanceChart.update('none');
            }

            updateAlerts(data) {
                const alertsList = document.getElementById('alerts-list');
                const alerts = data.alerts || {};
                
                if (!alerts.total_active) {
                    alertsList.innerHTML = '<p class="text-muted">No active alerts</p>';
                    return;
                }

                // This would display actual alerts
                alertsList.innerHTML = \`
                    <div class="alert alert-warning alert-warning mb-2">
                        <strong>Sample Alert:</strong> High CPU usage detected
                        <small class="d-block text-muted">2 minutes ago</small>
                    </div>
                \`;
            }

            handleAlertNotification(notification) {
                // Show toast notification for new alerts
                console.log('Alert notification:', notification);
            }

            addLogEntry(entry) {
                const logsList = document.getElementById('logs-list');
                const logElement = document.createElement('div');
                logElement.className = \`log-entry log-\${entry.level.toLowerCase()}\`;
                logElement.innerHTML = \`
                    <small>\${new Date(entry.timestamp).toLocaleTimeString()}</small>
                    <strong>[\${entry.level}]</strong> \${entry.message}
                \`;
                
                logsList.insertBefore(logElement, logsList.firstChild);
                
                // Keep only last 50 log entries
                while (logsList.children.length > 50) {
                    logsList.removeChild(logsList.lastChild);
                }
            }
        }

        // Initialize dashboard when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new MonitoringDashboard();
        });
    </script>
</body>
</html>`;
    }
}

module.exports = MonitoringDashboard;
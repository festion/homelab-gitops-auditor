/**
 * WikiJS Agent Monitoring System
 * Main orchestration system that coordinates all monitoring components
 */

const HealthMonitor = require('./health-monitor');
const MetricsCollector = require('./metrics-collector');
const AlertManager = require('./alert-manager');
const WikiJSLogger = require('./logger');
const MonitoringDashboard = require('./monitoring-dashboard');
const fs = require('fs').promises;
const path = require('path');

class WikiJSMonitoringSystem {
    constructor(config = {}) {
        this.config = {
            // System configuration
            name: config.name || 'wikijs-agent-monitor',
            environment: config.environment || 'production',
            data_path: config.data_path || '/home/dev/workspace/wikijs-monitoring/data',
            
            // Component configurations
            health_monitor: config.health_monitor || {},
            metrics_collector: config.metrics_collector || {},
            alert_manager: config.alert_manager || {},
            logger: config.logger || {},
            dashboard: config.dashboard || {},
            
            // Integration settings
            integrations: {
                home_assistant: {
                    enabled: config.ha_enabled || false,
                    url: config.ha_url || 'http://192.168.1.155:8123',
                    token: config.ha_token
                },
                prometheus: {
                    enabled: config.prometheus_enabled || false,
                    port: config.prometheus_port || 9090,
                    metrics_path: config.prometheus_metrics_path || '/metrics'
                },
                grafana: {
                    enabled: config.grafana_enabled || false,
                    url: config.grafana_url || 'http://localhost:3000',
                    api_key: config.grafana_api_key
                }
            },
            
            // Auto-recovery settings
            recovery: {
                enabled: config.recovery_enabled !== false,
                restart_threshold: config.restart_threshold || 5,
                restart_window: config.restart_window || 300000, // 5 minutes
                max_restarts: config.max_restarts || 3
            },
            
            ...config
        };

        // Component instances
        this.healthMonitor = null;
        this.metricsCollector = null;
        this.alertManager = null;
        this.logger = null;
        this.dashboard = null;

        // System state
        this.isRunning = false;
        this.startTime = null;
        this.restartCount = 0;
        this.lastRestart = null;

        // Recovery state
        this.recoveryActions = new Map();
        this.componentHealth = new Map();
    }

    /**
     * Initialize the monitoring system
     */
    async initialize() {
        console.log('🚀 Initializing WikiJS Agent Monitoring System');

        // Ensure data directory exists
        await fs.mkdir(this.config.data_path, { recursive: true });
        await fs.mkdir(path.join(this.config.data_path, 'logs'), { recursive: true });
        await fs.mkdir(path.join(this.config.data_path, 'alerts'), { recursive: true });
        await fs.mkdir(path.join(this.config.data_path, 'metrics'), { recursive: true });

        // Load configuration
        await this.loadConfiguration();

        // Initialize components
        await this.initializeComponents();

        // Setup component integrations
        this.setupComponentIntegrations();

        // Setup recovery mechanisms
        this.setupRecoveryMechanisms();

        console.log('✅ WikiJS Agent Monitoring System initialized');
    }

    /**
     * Load configuration from files
     */
    async loadConfiguration() {
        const configFiles = [
            'health-monitor.json',
            'metrics-collector.json',
            'alert-manager.json',
            'logger.json',
            'dashboard.json'
        ];

        for (const configFile of configFiles) {
            const configPath = path.join(this.config.data_path, 'config', configFile);
            
            try {
                const data = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(data);
                const componentName = configFile.replace('.json', '').replace('-', '_');
                
                this.config[componentName] = { ...this.config[componentName], ...config };
                console.log(`📝 Loaded configuration for ${componentName}`);
            } catch (error) {
                // Configuration file doesn't exist or is invalid
                console.log(`⚠️ No configuration file found for ${configFile}, using defaults`);
            }
        }
    }

    /**
     * Initialize monitoring components
     */
    async initializeComponents() {
        // Initialize logger first (other components may need it)
        this.logger = new WikiJSLogger({
            ...this.config.logger,
            log_path: path.join(this.config.data_path, 'logs')
        });
        await this.logger.start();
        this.logger.info('Logger initialized', { component: 'monitoring-system' });

        // Initialize health monitor
        this.healthMonitor = new HealthMonitor({
            ...this.config.health_monitor,
            storage_path: this.config.data_path
        });
        await this.healthMonitor.start();
        this.logger.info('Health monitor initialized', { component: 'monitoring-system' });

        // Initialize metrics collector
        this.metricsCollector = new MetricsCollector({
            ...this.config.metrics_collector,
            storage_path: path.join(this.config.data_path, 'metrics')
        });
        await this.metricsCollector.start();
        this.logger.info('Metrics collector initialized', { component: 'monitoring-system' });

        // Initialize alert manager
        this.alertManager = new AlertManager({
            ...this.config.alert_manager,
            storage_path: path.join(this.config.data_path, 'alerts')
        });
        await this.alertManager.start();
        this.logger.info('Alert manager initialized', { component: 'monitoring-system' });

        // Initialize dashboard
        this.dashboard = new MonitoringDashboard({
            ...this.config.dashboard,
            dashboard_path: path.join(this.config.data_path, 'dashboard')
        });
        this.dashboard.initialize(
            this.healthMonitor,
            this.metricsCollector,
            this.alertManager,
            this.logger
        );
        await this.dashboard.start();
        this.logger.info('Monitoring dashboard initialized', { component: 'monitoring-system' });
    }

    /**
     * Setup integrations between components
     */
    setupComponentIntegrations() {
        // Health monitor → Alert manager
        this.healthMonitor.on('alert-generated', async (alert) => {
            await this.alertManager.generateAlert(alert.severity, alert.key, alert.details);
        });

        // Metrics collector → Alert manager (threshold violations)
        this.metricsCollector.on('metric-recorded', async (metric) => {
            await this.evaluateMetricThresholds(metric);
        });

        // Alert manager → Logger
        this.alertManager.on('alert-generated', (alert) => {
            this.logger.warn(`Alert generated: ${alert.title}`, {
                component: 'alert-manager',
                alert_id: alert.id,
                severity: alert.severity
            });
        });

        this.alertManager.on('alert-resolved', (alert) => {
            this.logger.info(`Alert resolved: ${alert.title}`, {
                component: 'alert-manager',
                alert_id: alert.id,
                resolution: alert.resolution
            });
        });

        // Component error handling
        this.setupComponentErrorHandling();
    }

    /**
     * Setup error handling for all components
     */
    setupComponentErrorHandling() {
        const components = [
            { name: 'health-monitor', instance: this.healthMonitor },
            { name: 'metrics-collector', instance: this.metricsCollector },
            { name: 'alert-manager', instance: this.alertManager },
            { name: 'logger', instance: this.logger },
            { name: 'dashboard', instance: this.dashboard }
        ];

        for (const { name, instance } of components) {
            if (instance) {
                instance.on('error', (error) => {
                    this.handleComponentError(name, error);
                });
            }
        }

        // Global error handlers
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception', { error, component: 'monitoring-system' });
            this.handleCriticalError('uncaught-exception', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection', { 
                error: reason, 
                promise: promise.toString(),
                component: 'monitoring-system' 
            });
            this.handleCriticalError('unhandled-rejection', reason);
        });
    }

    /**
     * Setup automated recovery mechanisms
     */
    setupRecoveryMechanisms() {
        if (!this.config.recovery.enabled) {
            return;
        }

        // Component health check interval
        setInterval(async () => {
            await this.checkComponentHealth();
        }, 60000); // Every minute

        // Setup recovery actions
        this.setupRecoveryActions();
    }

    /**
     * Setup recovery actions for common issues
     */
    setupRecoveryActions() {
        // High memory usage recovery
        this.recoveryActions.set('high-memory', async () => {
            this.logger.warn('Executing memory recovery action', { component: 'monitoring-system' });
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            // Clear old metrics from memory
            if (this.metricsCollector) {
                await this.metricsCollector.cleanup?.();
            }

            return true;
        });

        // Component restart recovery
        this.recoveryActions.set('component-restart', async (componentName) => {
            this.logger.warn(`Attempting to restart component: ${componentName}`, {
                component: 'monitoring-system'
            });

            try {
                const component = this[componentName];
                if (component && typeof component.stop === 'function' && typeof component.start === 'function') {
                    await component.stop();
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    await component.start();
                    
                    this.logger.info(`Component restarted successfully: ${componentName}`, {
                        component: 'monitoring-system'
                    });
                    
                    return true;
                }
            } catch (error) {
                this.logger.error(`Failed to restart component: ${componentName}`, {
                    component: 'monitoring-system',
                    error
                });
            }

            return false;
        });

        // Disk cleanup recovery
        this.recoveryActions.set('disk-cleanup', async () => {
            this.logger.warn('Executing disk cleanup recovery action', { component: 'monitoring-system' });

            try {
                // Clean old log files
                if (this.logger && typeof this.logger.cleanupOldLogs === 'function') {
                    await this.logger.cleanupOldLogs();
                }

                // Clean old metrics files
                if (this.metricsCollector && typeof this.metricsCollector.cleanupOldMetrics === 'function') {
                    await this.metricsCollector.cleanupOldMetrics();
                }

                // Clean old alerts
                if (this.alertManager && typeof this.alertManager.cleanupResolvedAlerts === 'function') {
                    await this.alertManager.cleanupResolvedAlerts();
                }

                return true;
            } catch (error) {
                this.logger.error('Disk cleanup failed', { component: 'monitoring-system', error });
                return false;
            }
        });
    }

    /**
     * Start the monitoring system
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.startTime = new Date();

        this.logger.info('Starting WikiJS Agent Monitoring System', {
            component: 'monitoring-system',
            environment: this.config.environment
        });

        // Start monitoring components (already started in initialize)
        // Start external integrations
        await this.startExternalIntegrations();

        // Generate startup alert
        if (this.alertManager) {
            await this.alertManager.generateAlert('info', 'system-startup', {
                message: 'WikiJS Agent Monitoring System started successfully',
                timestamp: this.startTime.toISOString(),
                environment: this.config.environment
            });
        }

        this.logger.info('WikiJS Agent Monitoring System started successfully', {
            component: 'monitoring-system',
            startup_time: Date.now() - this.startTime.getTime()
        });
    }

    /**
     * Stop the monitoring system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        this.logger.info('Stopping WikiJS Agent Monitoring System', {
            component: 'monitoring-system'
        });

        // Generate shutdown alert
        if (this.alertManager) {
            await this.alertManager.generateAlert('info', 'system-shutdown', {
                message: 'WikiJS Agent Monitoring System shutting down',
                timestamp: new Date().toISOString(),
                uptime: this.getUptime()
            });
        }

        // Stop components in reverse order
        const components = [
            { name: 'dashboard', instance: this.dashboard },
            { name: 'alert-manager', instance: this.alertManager },
            { name: 'metrics-collector', instance: this.metricsCollector },
            { name: 'health-monitor', instance: this.healthMonitor },
            { name: 'logger', instance: this.logger }
        ];

        for (const { name, instance } of components) {
            try {
                if (instance && typeof instance.stop === 'function') {
                    await instance.stop();
                    console.log(`✅ ${name} stopped`);
                }
            } catch (error) {
                console.error(`❌ Failed to stop ${name}:`, error);
            }
        }

        console.log('⏹️ WikiJS Agent Monitoring System stopped');
    }

    /**
     * Start external integrations
     */
    async startExternalIntegrations() {
        // Home Assistant integration
        if (this.config.integrations.home_assistant.enabled) {
            await this.setupHomeAssistantIntegration();
        }

        // Prometheus integration
        if (this.config.integrations.prometheus.enabled) {
            await this.setupPrometheusIntegration();
        }

        // Grafana integration
        if (this.config.integrations.grafana.enabled) {
            await this.setupGrafanaIntegration();
        }
    }

    /**
     * Setup Home Assistant integration
     */
    async setupHomeAssistantIntegration() {
        try {
            // This would setup Home Assistant sensors and notifications
            this.logger.info('Home Assistant integration enabled', {
                component: 'monitoring-system',
                url: this.config.integrations.home_assistant.url
            });

            // Create sensors in Home Assistant for key metrics
            await this.createHomeAssistantSensors();
        } catch (error) {
            this.logger.error('Failed to setup Home Assistant integration', {
                component: 'monitoring-system',
                error
            });
        }
    }

    /**
     * Setup Prometheus integration
     */
    async setupPrometheusIntegration() {
        try {
            // This would setup Prometheus metrics endpoint
            this.logger.info('Prometheus integration enabled', {
                component: 'monitoring-system',
                port: this.config.integrations.prometheus.port
            });

            // Setup Prometheus metrics export
            await this.setupPrometheusMetrics();
        } catch (error) {
            this.logger.error('Failed to setup Prometheus integration', {
                component: 'monitoring-system',
                error
            });
        }
    }

    /**
     * Setup Grafana integration
     */
    async setupGrafanaIntegration() {
        try {
            // This would setup Grafana dashboards
            this.logger.info('Grafana integration enabled', {
                component: 'monitoring-system',
                url: this.config.integrations.grafana.url
            });

            // Create Grafana dashboards
            await this.createGrafanaDashboards();
        } catch (error) {
            this.logger.error('Failed to setup Grafana integration', {
                component: 'monitoring-system',
                error
            });
        }
    }

    /**
     * Check component health and trigger recovery if needed
     */
    async checkComponentHealth() {
        const components = [
            'healthMonitor',
            'metricsCollector', 
            'alertManager',
            'logger',
            'dashboard'
        ];

        for (const componentName of components) {
            const component = this[componentName];
            if (!component) continue;

            try {
                // Check if component is responsive
                const isHealthy = await this.isComponentHealthy(componentName, component);
                
                if (!isHealthy) {
                    await this.handleUnhealthyComponent(componentName);
                }
                
                this.componentHealth.set(componentName, {
                    healthy: isHealthy,
                    lastCheck: new Date(),
                    consecutiveFailures: isHealthy ? 0 : (this.componentHealth.get(componentName)?.consecutiveFailures || 0) + 1
                });

            } catch (error) {
                this.logger.error(`Health check failed for ${componentName}`, {
                    component: 'monitoring-system',
                    error
                });
            }
        }
    }

    /**
     * Check if a component is healthy
     */
    async isComponentHealthy(componentName, component) {
        // Basic health check - component exists and has required methods
        if (!component) return false;

        // Check if component is active/running
        if (component.isActive !== undefined && !component.isActive) return false;
        if (component.isRunning !== undefined && !component.isRunning) return false;
        if (component.isProcessing !== undefined && !component.isProcessing) return false;

        // Component-specific health checks
        try {
            switch (componentName) {
                case 'healthMonitor':
                    return component.healthStatus?.size > 0;
                case 'metricsCollector':
                    return component.isCollecting;
                case 'alertManager':
                    return component.isProcessing;
                case 'logger':
                    return component.isActive;
                case 'dashboard':
                    return component.isRunning;
                default:
                    return true;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Handle unhealthy component
     */
    async handleUnhealthyComponent(componentName) {
        const health = this.componentHealth.get(componentName);
        const failures = health?.consecutiveFailures || 0;

        this.logger.warn(`Component unhealthy: ${componentName}`, {
            component: 'monitoring-system',
            consecutive_failures: failures
        });

        // Generate alert
        if (this.alertManager) {
            await this.alertManager.generateAlert('warning', `component-unhealthy-${componentName}`, {
                message: `Component ${componentName} is unhealthy`,
                component: componentName,
                consecutive_failures: failures
            });
        }

        // Attempt recovery if threshold reached
        if (failures >= 3) {
            await this.attemptComponentRecovery(componentName);
        }
    }

    /**
     * Attempt to recover unhealthy component
     */
    async attemptComponentRecovery(componentName) {
        this.logger.warn(`Attempting recovery for component: ${componentName}`, {
            component: 'monitoring-system'
        });

        const recoveryAction = this.recoveryActions.get('component-restart');
        if (recoveryAction) {
            const success = await recoveryAction(componentName);
            
            if (success) {
                this.logger.info(`Component recovery successful: ${componentName}`, {
                    component: 'monitoring-system'
                });

                // Reset failure count
                this.componentHealth.set(componentName, {
                    healthy: true,
                    lastCheck: new Date(),
                    consecutiveFailures: 0
                });

                // Resolve alert
                if (this.alertManager) {
                    await this.alertManager.resolveAlert(
                        `component-unhealthy-${componentName}`,
                        'Component recovered automatically'
                    );
                }
            }
        }
    }

    /**
     * Handle component errors
     */
    handleComponentError(componentName, error) {
        this.logger.error(`Component error: ${componentName}`, {
            component: 'monitoring-system',
            error,
            component_name: componentName
        });

        // Generate alert
        if (this.alertManager) {
            this.alertManager.generateAlert('critical', `component-error-${componentName}`, {
                message: `Critical error in component: ${componentName}`,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Handle critical system errors
     */
    handleCriticalError(type, error) {
        console.error(`Critical system error (${type}):`, error);
        
        // Generate critical alert
        if (this.alertManager) {
            this.alertManager.generateAlert('critical', `system-critical-${type}`, {
                message: `Critical system error: ${type}`,
                error: error.message || error.toString(),
                stack: error.stack
            });
        }

        // Initiate graceful shutdown after a delay
        setTimeout(async () => {
            console.log('Initiating graceful shutdown due to critical error...');
            await this.stop();
            process.exit(1);
        }, 5000);
    }

    /**
     * Evaluate metric thresholds
     */
    async evaluateMetricThresholds(metric) {
        // This would evaluate metrics against configured thresholds
        // and generate alerts if thresholds are exceeded
        
        if (metric.type === 'resources' && metric.data) {
            const { cpu, memory, disk } = metric.data;

            // CPU usage alerts
            if (cpu && cpu.usage_percent > 85) {
                await this.alertManager.generateAlert('critical', 'high-cpu-usage', {
                    message: `High CPU usage: ${cpu.usage_percent.toFixed(1)}%`,
                    value: cpu.usage_percent,
                    threshold: 85
                });
            }

            // Memory usage alerts
            if (memory && memory.system_usage_percent > 90) {
                await this.alertManager.generateAlert('critical', 'high-memory-usage', {
                    message: `High memory usage: ${memory.system_usage_percent.toFixed(1)}%`,
                    value: memory.system_usage_percent,
                    threshold: 90
                });
            }

            // Disk usage alerts
            if (disk && disk.usage_percent > 95) {
                await this.alertManager.generateAlert('critical', 'high-disk-usage', {
                    message: `High disk usage: ${disk.usage_percent}%`,
                    value: disk.usage_percent,
                    threshold: 95
                });
            }
        }
    }

    /**
     * Get system uptime
     */
    getUptime() {
        if (!this.startTime) return 0;
        return Date.now() - this.startTime.getTime();
    }

    /**
     * Get system status
     */
    getSystemStatus() {
        return {
            name: this.config.name,
            version: '1.0.0',
            environment: this.config.environment,
            uptime: this.getUptime(),
            running: this.isRunning,
            start_time: this.startTime,
            restart_count: this.restartCount,
            last_restart: this.lastRestart,
            components: {
                health_monitor: !!this.healthMonitor,
                metrics_collector: !!this.metricsCollector,
                alert_manager: !!this.alertManager,
                logger: !!this.logger,
                dashboard: !!this.dashboard
            },
            component_health: Object.fromEntries(this.componentHealth),
            integrations: this.config.integrations
        };
    }

    /**
     * Export system data
     */
    exportSystemData() {
        return {
            status: this.getSystemStatus(),
            health: this.healthMonitor ? this.healthMonitor.exportHealthData() : {},
            metrics: this.metricsCollector ? this.metricsCollector.exportMetrics() : {},
            alerts: this.alertManager ? this.alertManager.exportAlertData() : {},
            logs: this.logger ? this.logger.exportData() : {}
        };
    }

    // Placeholder methods for external integrations
    async createHomeAssistantSensors() {
        this.logger.info('Creating Home Assistant sensors', { component: 'monitoring-system' });
    }

    async setupPrometheusMetrics() {
        this.logger.info('Setting up Prometheus metrics', { component: 'monitoring-system' });
    }

    async createGrafanaDashboards() {
        this.logger.info('Creating Grafana dashboards', { component: 'monitoring-system' });
    }
}

module.exports = WikiJSMonitoringSystem;
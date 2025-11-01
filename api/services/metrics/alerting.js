/**
 * Metrics Alerting System
 * 
 * Threshold-based alerting, anomaly detection, and notification delivery
 * for comprehensive metrics monitoring with configurable alert rules.
 */

const EventEmitter = require('events');

class MetricsAlertingSystem extends EventEmitter {
    constructor(metricsService, config) {
        super();
        this.metricsService = metricsService;
        this.config = config;
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.thresholds = new Map();
        this.checkInterval = null;
        this.isRunning = false;
        
        // Configuration
        this.checkFrequency = 60000; // 1 minute
        this.alertCooldown = 300000; // 5 minutes
        this.maxAlertHistory = 1000;
        this.anomalyThreshold = 2; // Standard deviations
        
        this.loadThresholds();
    }

    /**
     * Start the alerting system
     */
    async start() {
        if (this.isRunning) {
            console.log('Alerting system is already running');
            return;
        }

        try {
            await this.loadThresholds();
            
            // Start periodic threshold checks
            this.checkInterval = setInterval(() => {
                this.checkAllThresholds().catch(error => {
                    console.error('Error in threshold check:', error);
                    this.emit('alerting:error', error);
                });
            }, this.checkFrequency);

            this.isRunning = true;
            console.log('Metrics alerting system started');
            this.emit('alerting:started');
        } catch (error) {
            console.error('Error starting alerting system:', error);
            this.emit('alerting:error', error);
            throw error;
        }
    }

    /**
     * Stop the alerting system
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        this.isRunning = false;
        console.log('Metrics alerting system stopped');
        this.emit('alerting:stopped');
    }

    /**
     * Load alert thresholds from database
     */
    async loadThresholds() {
        try {
            const sql = 'SELECT * FROM metric_thresholds WHERE is_enabled = 1';
            const rows = await this.metricsService.storage.allQuery(sql);
            
            this.thresholds.clear();
            
            for (const row of rows) {
                const threshold = {
                    id: row.id,
                    metricType: row.metric_type,
                    entityId: row.entity_id,
                    thresholdType: row.threshold_type,
                    warningValue: row.warning_value,
                    criticalValue: row.critical_value,
                    durationMinutes: row.duration_minutes,
                    isEnabled: row.is_enabled
                };
                
                const key = `${threshold.metricType}:${threshold.entityId}`;
                this.thresholds.set(key, threshold);
            }
            
            console.log(`Loaded ${this.thresholds.size} alert thresholds`);
        } catch (error) {
            console.error('Error loading thresholds:', error);
        }
    }

    /**
     * Check all thresholds against current metrics
     */
    async checkAllThresholds() {
        const checkPromises = [];
        
        for (const [key, threshold] of this.thresholds.entries()) {
            checkPromises.push(this.checkThreshold(threshold));
        }
        
        await Promise.all(checkPromises);
    }

    /**
     * Check a specific threshold
     */
    async checkThreshold(threshold) {
        try {
            const metrics = await this.getRecentMetrics(threshold);
            
            if (metrics.length === 0) {
                return;
            }

            // Check if threshold is breached
            const breach = this.evaluateThreshold(threshold, metrics);
            
            if (breach) {
                await this.handleThresholdBreach(threshold, breach);
            } else {
                // Check if alert should be resolved
                await this.checkAlertResolution(threshold);
            }
        } catch (error) {
            console.error(`Error checking threshold ${threshold.metricType}:`, error);
        }
    }

    /**
     * Get recent metrics for threshold evaluation
     */
    async getRecentMetrics(threshold) {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - threshold.durationMinutes * 60 * 1000);
        
        const entityFilter = threshold.entityId === '*' ? [] : [threshold.entityId];
        
        return await this.metricsService.storage.queryMetrics({
            metricTypes: [threshold.metricType],
            entityIds: entityFilter,
            timeRange: {
                from: startTime.toISOString(),
                to: endTime.toISOString()
            },
            orderBy: 'timestamp',
            orderDirection: 'DESC',
            limit: 100
        });
    }

    /**
     * Evaluate if threshold is breached
     */
    evaluateThreshold(threshold, metrics) {
        if (metrics.length === 0) return null;

        const latestMetric = metrics[0];
        const currentValue = latestMetric.value;
        
        let breachLevel = null;
        let breachValue = null;

        switch (threshold.thresholdType) {
            case 'above':
                if (threshold.criticalValue !== null && currentValue > threshold.criticalValue) {
                    breachLevel = 'critical';
                    breachValue = threshold.criticalValue;
                } else if (threshold.warningValue !== null && currentValue > threshold.warningValue) {
                    breachLevel = 'warning';
                    breachValue = threshold.warningValue;
                }
                break;
                
            case 'below':
                if (threshold.criticalValue !== null && currentValue < threshold.criticalValue) {
                    breachLevel = 'critical';
                    breachValue = threshold.criticalValue;
                } else if (threshold.warningValue !== null && currentValue < threshold.warningValue) {
                    breachLevel = 'warning';
                    breachValue = threshold.warningValue;
                }
                break;
                
            case 'change_rate':
                const changeRate = this.calculateChangeRate(metrics);
                if (threshold.criticalValue !== null && Math.abs(changeRate) > threshold.criticalValue) {
                    breachLevel = 'critical';
                    breachValue = threshold.criticalValue;
                } else if (threshold.warningValue !== null && Math.abs(changeRate) > threshold.warningValue) {
                    breachLevel = 'warning';
                    breachValue = threshold.warningValue;
                }
                break;
        }

        if (breachLevel) {
            return {
                level: breachLevel,
                currentValue,
                thresholdValue: breachValue,
                metric: latestMetric,
                metrics
            };
        }

        return null;
    }

    /**
     * Calculate change rate from metrics
     */
    calculateChangeRate(metrics) {
        if (metrics.length < 2) return 0;

        const latest = metrics[0].value;
        const previous = metrics[Math.min(metrics.length - 1, 10)].value; // Compare with 10 points ago or last available
        
        if (previous === 0) return 0;
        return ((latest - previous) / previous) * 100;
    }

    /**
     * Handle threshold breach
     */
    async handleThresholdBreach(threshold, breach) {
        const alertKey = `${threshold.metricType}:${threshold.entityId}:${breach.level}`;
        
        // Check if alert is already active and within cooldown
        if (this.activeAlerts.has(alertKey)) {
            const existingAlert = this.activeAlerts.get(alertKey);
            const timeSinceLastAlert = Date.now() - existingAlert.lastFired;
            
            if (timeSinceLastAlert < this.alertCooldown) {
                return; // Still in cooldown
            }
        }

        // Create alert
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            thresholdId: threshold.id,
            metricType: threshold.metricType,
            entityId: threshold.entityId,
            level: breach.level,
            currentValue: breach.currentValue,
            thresholdValue: breach.thresholdValue,
            message: this.generateAlertMessage(threshold, breach),
            firedAt: new Date().toISOString(),
            resolvedAt: null,
            isResolved: false
        };

        // Store alert in database
        await this.storeAlert(alert);
        
        // Update active alerts
        this.activeAlerts.set(alertKey, {
            alert,
            lastFired: Date.now()
        });
        
        // Add to history
        this.alertHistory.unshift(alert);
        if (this.alertHistory.length > this.maxAlertHistory) {
            this.alertHistory = this.alertHistory.slice(0, this.maxAlertHistory);
        }

        // Send notifications
        await this.sendNotifications(alert);
        
        console.log(`Alert fired: ${alert.message}`);
        this.emit('alert:fired', alert);
    }

    /**
     * Check if active alerts should be resolved
     */
    async checkAlertResolution(threshold) {
        const alertKeys = Array.from(this.activeAlerts.keys()).filter(key => 
            key.startsWith(`${threshold.metricType}:${threshold.entityId}:`)
        );

        for (const alertKey of alertKeys) {
            const activeAlert = this.activeAlerts.get(alertKey);
            
            // Get recent metrics to check if condition is resolved
            const recentMetrics = await this.getRecentMetrics(threshold);
            const breach = this.evaluateThreshold(threshold, recentMetrics);
            
            // If no breach or breach level is lower, resolve the alert
            if (!breach || breach.level !== activeAlert.alert.level) {
                await this.resolveAlert(activeAlert.alert);
                this.activeAlerts.delete(alertKey);
            }
        }
    }

    /**
     * Resolve an active alert
     */
    async resolveAlert(alert) {
        const resolvedAt = new Date().toISOString();
        
        // Update database
        const sql = 'UPDATE metric_alerts SET resolved_at = ?, is_resolved = 1 WHERE id = ?';
        await this.metricsService.storage.runQuery(sql, [resolvedAt, alert.id]);
        
        // Update alert object
        alert.resolvedAt = resolvedAt;
        alert.isResolved = true;
        
        console.log(`Alert resolved: ${alert.message}`);
        this.emit('alert:resolved', alert);
    }

    /**
     * Store alert in database
     */
    async storeAlert(alert) {
        const sql = `
            INSERT INTO metric_alerts 
            (threshold_id, metric_type, entity_id, alert_level, current_value, threshold_value, message, fired_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            alert.thresholdId,
            alert.metricType,
            alert.entityId,
            alert.level,
            alert.currentValue,
            alert.thresholdValue,
            alert.message,
            alert.firedAt
        ];
        
        const result = await this.metricsService.storage.runQuery(sql, params);
        alert.id = result.lastID;
    }

    /**
     * Generate alert message
     */
    generateAlertMessage(threshold, breach) {
        const entity = threshold.entityId === '*' ? 'system' : threshold.entityId;
        const metricName = this.formatMetricName(threshold.metricType);
        
        let condition;
        switch (threshold.thresholdType) {
            case 'above':
                condition = `is above ${breach.thresholdValue}`;
                break;
            case 'below':
                condition = `is below ${breach.thresholdValue}`;
                break;
            case 'change_rate':
                condition = `change rate exceeds ${breach.thresholdValue}%`;
                break;
            default:
                condition = `breaches threshold`;
        }
        
        return `${breach.level.toUpperCase()}: ${metricName} for ${entity} ${condition} (current: ${breach.currentValue})`;
    }

    /**
     * Format metric name for display
     */
    formatMetricName(metricType) {
        return metricType
            .split('.')
            .map(part => part.replace(/_/g, ' '))
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    /**
     * Send notifications for alert
     */
    async sendNotifications(alert) {
        try {
            // Emit event for other systems to handle
            this.emit('notification:send', alert);
            
            // Built-in notification methods
            await this.sendConsoleNotification(alert);
            
            // Additional notification channels can be added here
            if (this.config.get('SLACK_WEBHOOK_URL')) {
                await this.sendSlackNotification(alert);
            }
            
            if (this.config.get('EMAIL_NOTIFICATIONS_ENABLED')) {
                await this.sendEmailNotification(alert);
            }
            
        } catch (error) {
            console.error('Error sending notifications:', error);
            this.emit('notification:error', { alert, error });
        }
    }

    /**
     * Send console notification
     */
    async sendConsoleNotification(alert) {
        const timestamp = new Date(alert.firedAt).toLocaleString();
        const levelColor = alert.level === 'critical' ? '\x1b[31m' : '\x1b[33m'; // Red for critical, yellow for warning
        const resetColor = '\x1b[0m';
        
        console.log(`${levelColor}[ALERT ${alert.level.toUpperCase()}] ${timestamp}: ${alert.message}${resetColor}`);
    }

    /**
     * Send Slack notification (placeholder)
     */
    async sendSlackNotification(alert) {
        // Implementation would depend on Slack webhook integration
        console.log(`[Slack] ${alert.message}`);
    }

    /**
     * Send email notification (placeholder)
     */
    async sendEmailNotification(alert) {
        // Implementation would depend on email service integration
        console.log(`[Email] ${alert.message}`);
    }

    /**
     * Detect anomalies in metric data
     */
    async detectAnomalies(metricType, entityId = '*') {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
            
            const metrics = await this.metricsService.storage.queryMetrics({
                metricTypes: [metricType],
                entityIds: entityId === '*' ? [] : [entityId],
                timeRange: {
                    from: startTime.toISOString(),
                    to: endTime.toISOString()
                },
                orderBy: 'timestamp',
                limit: 1000
            });

            if (metrics.length < 10) {
                return []; // Not enough data for anomaly detection
            }

            const values = metrics.map(m => m.value);
            const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
            const stdDev = Math.sqrt(
                values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
            );

            const anomalies = [];
            
            for (let i = 0; i < metrics.length; i++) {
                const value = values[i];
                const deviation = Math.abs(value - mean) / stdDev;
                
                if (deviation > this.anomalyThreshold) {
                    anomalies.push({
                        timestamp: metrics[i].timestamp,
                        value,
                        expectedValue: mean,
                        deviation,
                        severity: deviation > 3 ? 'high' : 'medium',
                        metricType,
                        entityId: metrics[i].entityId
                    });
                }
            }
            
            return anomalies;
        } catch (error) {
            console.error('Error detecting anomalies:', error);
            return [];
        }
    }

    /**
     * Add or update threshold
     */
    async addThreshold(threshold) {
        const sql = `
            INSERT OR REPLACE INTO metric_thresholds 
            (metric_type, entity_id, threshold_type, warning_value, critical_value, duration_minutes, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            threshold.metricType,
            threshold.entityId || '*',
            threshold.thresholdType,
            threshold.warningValue,
            threshold.criticalValue,
            threshold.durationMinutes || 5,
            threshold.isEnabled !== false ? 1 : 0
        ];
        
        await this.metricsService.storage.runQuery(sql, params);
        await this.loadThresholds(); // Reload thresholds
        
        this.emit('threshold:added', threshold);
    }

    /**
     * Remove threshold
     */
    async removeThreshold(thresholdId) {
        const sql = 'DELETE FROM metric_thresholds WHERE id = ?';
        await this.metricsService.storage.runQuery(sql, [thresholdId]);
        await this.loadThresholds(); // Reload thresholds
        
        this.emit('threshold:removed', { id: thresholdId });
    }

    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values()).map(item => item.alert);
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 50) {
        return this.alertHistory.slice(0, limit);
    }

    /**
     * Get alerting system statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            thresholdCount: this.thresholds.size,
            activeAlertCount: this.activeAlerts.size,
            alertHistoryCount: this.alertHistory.length,
            checkFrequency: this.checkFrequency,
            alertCooldown: this.alertCooldown
        };
    }
}

module.exports = MetricsAlertingSystem;
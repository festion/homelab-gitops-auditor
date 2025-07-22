/**
 * WikiJS Agent Alert Manager
 * Comprehensive alerting and notification system
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class AlertManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            notification_channels: {
                email: {
                    enabled: config.email_enabled || false,
                    smtp_host: config.smtp_host || 'localhost',
                    smtp_port: config.smtp_port || 587,
                    smtp_user: config.smtp_user,
                    smtp_pass: config.smtp_pass,
                    recipients: config.email_recipients || ['admin@homelab.local']
                },
                slack: {
                    enabled: config.slack_enabled || false,
                    webhook_url: config.slack_webhook_url,
                    channel: config.slack_channel || '#homelab-alerts',
                    mention_users: config.slack_mentions || ['@admin']
                },
                home_assistant: {
                    enabled: config.ha_enabled || true,
                    url: config.ha_url || 'http://192.168.1.155:8123',
                    token: config.ha_token,
                    notification_service: config.ha_notification_service || 'notify.mobile_app'
                },
                dashboard: {
                    enabled: true,
                    persistent: true,
                    real_time: true
                }
            },
            alert_rules: {
                escalation: {
                    warning_timeout: config.warning_timeout || 900, // 15 minutes
                    critical_immediate: config.critical_immediate !== false,
                    repeat_interval: config.repeat_interval || 1800 // 30 minutes
                },
                suppression: {
                    similar_alert_window: config.similar_alert_window || 300, // 5 minutes
                    max_alerts_per_hour: config.max_alerts_per_hour || 10,
                    maintenance_mode: false
                },
                thresholds: {
                    cpu_usage: { warning: 70, critical: 85 },
                    memory_usage: { warning: 75, critical: 90 },
                    disk_space: { warning: 80, critical: 95 },
                    response_time: { warning: 2000, critical: 5000 },
                    error_rate: { warning: 2, critical: 5 },
                    queue_depth: { warning: 100, critical: 500 }
                }
            },
            storage_path: config.storage_path || '/home/dev/workspace/wikijs-monitoring/data/alerts',
            ...config
        };

        this.alerts = new Map();
        this.alertHistory = [];
        this.suppressedAlerts = new Map();
        this.notificationQueue = [];
        this.isProcessing = false;
    }

    /**
     * Start alert manager
     */
    async start() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        console.log('🚨 Starting WikiJS Agent Alert Manager');

        // Ensure storage directory exists
        await fs.mkdir(this.config.storage_path, { recursive: true });

        // Load existing alerts
        await this.loadPersistedAlerts();

        // Start notification processing
        this.startNotificationProcessing();

        // Start alert cleanup
        this.startAlertCleanup();

        this.emit('alert-manager-started');
    }

    /**
     * Stop alert manager
     */
    async stop() {
        if (!this.isProcessing) {
            return;
        }

        this.isProcessing = false;
        console.log('⏹️ Stopping WikiJS Agent Alert Manager');

        // Clear intervals
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Persist current alerts
        await this.persistAlerts();

        this.emit('alert-manager-stopped');
    }

    /**
     * Generate an alert
     */
    async generateAlert(severity, alertKey, details) {
        // Check maintenance mode
        if (this.config.alert_rules.suppression.maintenance_mode) {
            console.log(`Alert suppressed (maintenance mode): ${alertKey}`);
            return;
        }

        // Check for similar alerts (suppression)
        if (this.shouldSuppressAlert(alertKey, severity)) {
            console.log(`Alert suppressed (similar recent alert): ${alertKey}`);
            return;
        }

        const now = new Date().toISOString();
        const existingAlert = this.alerts.get(alertKey);

        if (existingAlert && existingAlert.status === 'active') {
            // Update existing alert
            existingAlert.lastOccurrence = now;
            existingAlert.occurrenceCount++;
            existingAlert.details = { ...existingAlert.details, ...details };
            
            // Check if severity has changed
            if (existingAlert.severity !== severity) {
                existingAlert.severity = severity;
                existingAlert.severityChanged = true;
                await this.sendNotification(existingAlert, 'severity_change');
            }
        } else {
            // Create new alert
            const alert = {
                id: this.generateAlertId(),
                key: alertKey,
                severity,
                status: 'active',
                title: this.generateAlertTitle(alertKey, severity),
                message: details.message || `${severity} alert for ${alertKey}`,
                details,
                firstOccurrence: now,
                lastOccurrence: now,
                occurrenceCount: 1,
                acknowledged: false,
                assignee: null,
                tags: this.generateAlertTags(alertKey, details),
                source: 'wikijs-agent',
                category: this.categorizeAlert(alertKey),
                runbook: this.getRunbookURL(alertKey),
                correlationId: this.generateCorrelationId(alertKey, details)
            };

            this.alerts.set(alertKey, alert);
            this.alertHistory.push({ ...alert, action: 'created' });

            // Send notifications
            await this.sendNotification(alert, 'new');

            this.emit('alert-generated', alert);
        }

        // Update suppression tracking
        this.updateSuppressionTracking(alertKey, severity);
    }

    /**
     * Resolve an alert
     */
    async resolveAlert(alertKey, resolution) {
        const alert = this.alerts.get(alertKey);
        if (!alert || alert.status !== 'active') {
            return;
        }

        alert.status = 'resolved';
        alert.resolvedAt = new Date().toISOString();
        alert.resolution = resolution || 'Automatically resolved';
        
        this.alertHistory.push({ ...alert, action: 'resolved' });

        // Send resolution notification
        await this.sendNotification(alert, 'resolved');

        // Remove from suppression tracking
        this.suppressedAlerts.delete(alertKey);

        this.emit('alert-resolved', alert);
    }

    /**
     * Acknowledge an alert
     */
    async acknowledgeAlert(alertKey, acknowledgedBy, notes) {
        const alert = this.alerts.get(alertKey);
        if (!alert || alert.status !== 'active') {
            return;
        }

        alert.acknowledged = true;
        alert.acknowledgedBy = acknowledgedBy;
        alert.acknowledgedAt = new Date().toISOString();
        alert.acknowledgmentNotes = notes;

        this.alertHistory.push({ ...alert, action: 'acknowledged' });

        // Send acknowledgment notification
        await this.sendNotification(alert, 'acknowledged');

        this.emit('alert-acknowledged', alert);
    }

    /**
     * Check if alert should be suppressed
     */
    shouldSuppressAlert(alertKey, severity) {
        const suppression = this.suppressedAlerts.get(alertKey);
        if (!suppression) {
            return false;
        }

        const now = Date.now();
        const windowMs = this.config.alert_rules.suppression.similar_alert_window * 1000;
        
        // Check if within suppression window
        if (now - suppression.lastAlert < windowMs) {
            suppression.count++;
            suppression.lastAlert = now;
            
            // Check if too many alerts in the last hour
            const hourAgo = now - (60 * 60 * 1000);
            const recentAlerts = suppression.history.filter(time => time > hourAgo);
            
            return recentAlerts.length >= this.config.alert_rules.suppression.max_alerts_per_hour;
        }

        return false;
    }

    /**
     * Update suppression tracking
     */
    updateSuppressionTracking(alertKey, severity) {
        const now = Date.now();
        
        if (!this.suppressedAlerts.has(alertKey)) {
            this.suppressedAlerts.set(alertKey, {
                count: 1,
                firstAlert: now,
                lastAlert: now,
                severity,
                history: [now]
            });
        } else {
            const suppression = this.suppressedAlerts.get(alertKey);
            suppression.lastAlert = now;
            suppression.history.push(now);
            
            // Keep only last hour of history
            const hourAgo = now - (60 * 60 * 1000);
            suppression.history = suppression.history.filter(time => time > hourAgo);
        }
    }

    /**
     * Send notification for alert
     */
    async sendNotification(alert, type) {
        const notification = {
            alert,
            type, // 'new', 'severity_change', 'resolved', 'acknowledged'
            timestamp: new Date().toISOString()
        };

        this.notificationQueue.push(notification);
    }

    /**
     * Start notification processing
     */
    startNotificationProcessing() {
        this.notificationInterval = setInterval(async () => {
            await this.processNotificationQueue();
        }, 5000); // Process every 5 seconds
    }

    /**
     * Process notification queue
     */
    async processNotificationQueue() {
        if (this.notificationQueue.length === 0) {
            return;
        }

        const notifications = [...this.notificationQueue];
        this.notificationQueue = [];

        for (const notification of notifications) {
            try {
                await this.deliverNotification(notification);
            } catch (error) {
                console.error('Notification delivery failed:', error);
                // Re-queue for retry (with limit)
                if (!notification.retryCount || notification.retryCount < 3) {
                    notification.retryCount = (notification.retryCount || 0) + 1;
                    this.notificationQueue.push(notification);
                }
            }
        }
    }

    /**
     * Deliver notification to configured channels
     */
    async deliverNotification(notification) {
        const { alert, type } = notification;
        const channels = this.config.notification_channels;

        const deliveryPromises = [];

        // Email notifications
        if (channels.email.enabled) {
            deliveryPromises.push(this.sendEmailNotification(alert, type));
        }

        // Slack notifications
        if (channels.slack.enabled) {
            deliveryPromises.push(this.sendSlackNotification(alert, type));
        }

        // Home Assistant notifications
        if (channels.home_assistant.enabled) {
            deliveryPromises.push(this.sendHomeAssistantNotification(alert, type));
        }

        // Dashboard notifications (always enabled)
        if (channels.dashboard.enabled) {
            deliveryPromises.push(this.sendDashboardNotification(alert, type));
        }

        await Promise.allSettled(deliveryPromises);
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(alert, type) {
        const nodemailer = require('nodemailer');
        const config = this.config.notification_channels.email;

        const transporter = nodemailer.createTransporter({
            host: config.smtp_host,
            port: config.smtp_port,
            secure: config.smtp_port === 465,
            auth: {
                user: config.smtp_user,
                pass: config.smtp_pass
            }
        });

        const subject = this.generateEmailSubject(alert, type);
        const body = this.generateEmailBody(alert, type);

        const mailOptions = {
            from: config.smtp_user,
            to: config.recipients.join(', '),
            subject,
            html: body
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email notification sent for alert: ${alert.key}`);
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(alert, type) {
        const config = this.config.notification_channels.slack;
        const message = this.generateSlackMessage(alert, type);

        await axios.post(config.webhook_url, {
            channel: config.channel,
            username: 'WikiJS Agent Monitor',
            icon_emoji: this.getAlertEmoji(alert.severity),
            attachments: [{
                color: this.getAlertColor(alert.severity),
                title: alert.title,
                text: message,
                fields: [
                    { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
                    { title: 'Status', value: alert.status.toUpperCase(), short: true },
                    { title: 'Category', value: alert.category, short: true },
                    { title: 'First Occurrence', value: alert.firstOccurrence, short: true }
                ],
                footer: 'WikiJS Agent Monitor',
                ts: Math.floor(new Date(alert.lastOccurrence).getTime() / 1000)
            }]
        });

        console.log(`Slack notification sent for alert: ${alert.key}`);
    }

    /**
     * Send Home Assistant notification
     */
    async sendHomeAssistantNotification(alert, type) {
        const config = this.config.notification_channels.home_assistant;
        const message = this.generateHAMessage(alert, type);

        await axios.post(`${config.url}/api/services/notify/${config.notification_service}`, {
            message,
            title: `WikiJS Agent Alert: ${alert.severity.toUpperCase()}`,
            data: {
                alert_id: alert.id,
                severity: alert.severity,
                category: alert.category,
                url: this.generateAlertURL(alert.id)
            }
        }, {
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Home Assistant notification sent for alert: ${alert.key}`);
    }

    /**
     * Send dashboard notification
     */
    async sendDashboardNotification(alert, type) {
        // This would integrate with the existing dashboard system
        const notification = {
            id: alert.id,
            type: 'alert',
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            timestamp: alert.lastOccurrence,
            persistent: this.config.notification_channels.dashboard.persistent
        };

        // Store in dashboard notifications
        const notificationFile = path.join(this.config.storage_path, 'dashboard-notifications.json');
        
        try {
            let notifications = [];
            try {
                const data = await fs.readFile(notificationFile, 'utf8');
                notifications = JSON.parse(data);
            } catch (error) {
                // File doesn't exist or is invalid, start with empty array
            }

            notifications.unshift(notification);
            
            // Keep only last 100 notifications
            notifications = notifications.slice(0, 100);

            await fs.writeFile(notificationFile, JSON.stringify(notifications, null, 2));
            
            console.log(`Dashboard notification stored for alert: ${alert.key}`);
        } catch (error) {
            console.error('Failed to store dashboard notification:', error);
        }
    }

    /**
     * Generate alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate alert title
     */
    generateAlertTitle(alertKey, severity) {
        const titles = {
            cpu_usage: 'High CPU Usage',
            memory_usage: 'High Memory Usage', 
            disk_usage: 'High Disk Usage',
            health_wikijs_agent: 'WikiJS Agent Health Check Failed',
            health_wikijs_mcp_server: 'WikiJS MCP Server Unavailable',
            health_database_connection: 'Database Connection Failed',
            processing_queue_depth: 'Processing Queue Overloaded',
            response_time: 'High Response Time',
            error_rate: 'High Error Rate'
        };

        const baseTitle = titles[alertKey] || `Alert: ${alertKey}`;
        return `[${severity.toUpperCase()}] ${baseTitle}`;
    }

    /**
     * Generate alert tags
     */
    generateAlertTags(alertKey, details) {
        const tags = ['wikijs-agent'];
        
        if (alertKey.startsWith('health_')) {
            tags.push('health-check');
        }
        if (alertKey.includes('cpu') || alertKey.includes('memory') || alertKey.includes('disk')) {
            tags.push('resources');
        }
        if (alertKey.includes('processing')) {
            tags.push('performance');
        }
        
        return tags;
    }

    /**
     * Categorize alert
     */
    categorizeAlert(alertKey) {
        if (alertKey.startsWith('health_')) return 'Health Check';
        if (alertKey.includes('cpu') || alertKey.includes('memory') || alertKey.includes('disk')) return 'Resource Usage';
        if (alertKey.includes('processing') || alertKey.includes('queue')) return 'Performance';
        if (alertKey.includes('error')) return 'Error Rate';
        if (alertKey.includes('response')) return 'Response Time';
        return 'Other';
    }

    /**
     * Get runbook URL
     */
    getRunbookURL(alertKey) {
        const runbooks = {
            cpu_usage: '/wikijs-monitoring/runbooks/high-cpu-usage.md',
            memory_usage: '/wikijs-monitoring/runbooks/high-memory-usage.md',
            disk_usage: '/wikijs-monitoring/runbooks/high-disk-usage.md',
            health_wikijs_agent: '/wikijs-monitoring/runbooks/agent-health-check.md',
            health_wikijs_mcp_server: '/wikijs-monitoring/runbooks/mcp-server-health.md'
        };
        
        return runbooks[alertKey] || '/wikijs-monitoring/runbooks/general-troubleshooting.md';
    }

    /**
     * Generate correlation ID
     */
    generateCorrelationId(alertKey, details) {
        // Group related alerts together
        if (alertKey.startsWith('health_')) {
            return 'service-health';
        }
        if (alertKey.includes('cpu') || alertKey.includes('memory')) {
            return 'resource-pressure';
        }
        if (alertKey.includes('processing')) {
            return 'processing-issues';
        }
        
        return alertKey;
    }

    /**
     * Get alert emoji for Slack
     */
    getAlertEmoji(severity) {
        const emojis = {
            critical: '🚨',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return emojis[severity] || '📢';
    }

    /**
     * Get alert color for Slack
     */
    getAlertColor(severity) {
        const colors = {
            critical: 'danger',
            warning: 'warning',
            info: 'good'
        };
        return colors[severity] || '#808080';
    }

    /**
     * Generate email subject
     */
    generateEmailSubject(alert, type) {
        const actions = {
            new: 'NEW',
            severity_change: 'UPDATED',
            resolved: 'RESOLVED',
            acknowledged: 'ACKNOWLEDGED'
        };

        return `[${actions[type] || 'ALERT'}] ${alert.title}`;
    }

    /**
     * Generate email body
     */
    generateEmailBody(alert, type) {
        return `
            <h2>${alert.title}</h2>
            <p><strong>Status:</strong> ${alert.status.toUpperCase()}</p>
            <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
            <p><strong>Message:</strong> ${alert.message}</p>
            <p><strong>First Occurrence:</strong> ${alert.firstOccurrence}</p>
            <p><strong>Last Occurrence:</strong> ${alert.lastOccurrence}</p>
            <p><strong>Occurrence Count:</strong> ${alert.occurrenceCount}</p>
            
            <h3>Details</h3>
            <pre>${JSON.stringify(alert.details, null, 2)}</pre>
            
            <p><a href="${this.generateAlertURL(alert.id)}">View Alert Details</a></p>
            
            <hr>
            <p><small>Generated by WikiJS Agent Monitor</small></p>
        `;
    }

    /**
     * Generate Slack message
     */
    generateSlackMessage(alert, type) {
        const actions = {
            new: '🆕 New alert generated',
            severity_change: '🔄 Alert severity changed',
            resolved: '✅ Alert resolved',
            acknowledged: '👍 Alert acknowledged'
        };

        let message = `${actions[type] || '📢 Alert update'}\n`;
        message += `*Message:* ${alert.message}\n`;
        
        if (alert.details.value !== undefined) {
            message += `*Current Value:* ${alert.details.value}\n`;
        }
        
        if (type === 'resolved' && alert.resolution) {
            message += `*Resolution:* ${alert.resolution}\n`;
        }
        
        return message;
    }

    /**
     * Generate Home Assistant message
     */
    generateHAMessage(alert, type) {
        const actions = {
            new: 'New alert',
            severity_change: 'Alert updated',
            resolved: 'Alert resolved',
            acknowledged: 'Alert acknowledged'
        };

        return `${actions[type] || 'Alert update'}: ${alert.message}`;
    }

    /**
     * Generate alert URL
     */
    generateAlertURL(alertId) {
        return `http://localhost:3001/monitoring/alerts/${alertId}`;
    }

    /**
     * Start alert cleanup
     */
    startAlertCleanup() {
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupResolvedAlerts();
        }, 3600000); // Every hour
    }

    /**
     * Cleanup old resolved alerts
     */
    async cleanupResolvedAlerts() {
        const now = Date.now();
        const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        for (const [key, alert] of this.alerts.entries()) {
            if (alert.status === 'resolved' && alert.resolvedAt) {
                const resolvedTime = new Date(alert.resolvedAt).getTime();
                if (now - resolvedTime > retentionPeriod) {
                    this.alerts.delete(key);
                    console.log(`Cleaned up resolved alert: ${key}`);
                }
            }
        }
        
        // Cleanup history
        this.alertHistory = this.alertHistory.filter(entry => {
            const entryTime = new Date(entry.lastOccurrence).getTime();
            return now - entryTime <= retentionPeriod;
        });
    }

    /**
     * Load persisted alerts
     */
    async loadPersistedAlerts() {
        const alertsFile = path.join(this.config.storage_path, 'active-alerts.json');
        
        try {
            const data = await fs.readFile(alertsFile, 'utf8');
            const alertsData = JSON.parse(data);
            
            for (const alert of alertsData) {
                this.alerts.set(alert.key, alert);
            }
            
            console.log(`Loaded ${alertsData.length} persisted alerts`);
        } catch (error) {
            // File doesn't exist or is invalid, start fresh
            console.log('No persisted alerts found, starting fresh');
        }
    }

    /**
     * Persist current alerts
     */
    async persistAlerts() {
        const alertsFile = path.join(this.config.storage_path, 'active-alerts.json');
        const activeAlerts = Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
        
        try {
            await fs.writeFile(alertsFile, JSON.stringify(activeAlerts, null, 2));
            console.log(`Persisted ${activeAlerts.length} active alerts`);
        } catch (error) {
            console.error('Failed to persist alerts:', error);
        }
    }

    /**
     * Get alerts summary
     */
    getAlertsSummary() {
        const activeAlerts = Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
        const criticalCount = activeAlerts.filter(alert => alert.severity === 'critical').length;
        const warningCount = activeAlerts.filter(alert => alert.severity === 'warning').length;
        
        return {
            total_active: activeAlerts.length,
            critical: criticalCount,
            warning: warningCount,
            info: activeAlerts.length - criticalCount - warningCount,
            acknowledged: activeAlerts.filter(alert => alert.acknowledged).length,
            maintenance_mode: this.config.alert_rules.suppression.maintenance_mode,
            notification_queue_size: this.notificationQueue.length,
            suppressed_alerts: this.suppressedAlerts.size
        };
    }

    /**
     * Get all active alerts
     */
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 100) {
        return this.alertHistory.slice(-limit);
    }

    /**
     * Export alert data
     */
    exportAlertData() {
        return {
            alerts: Object.fromEntries(this.alerts.entries()),
            history: this.alertHistory,
            suppressed: Object.fromEntries(this.suppressedAlerts.entries()),
            summary: this.getAlertsSummary()
        };
    }
}

module.exports = AlertManager;
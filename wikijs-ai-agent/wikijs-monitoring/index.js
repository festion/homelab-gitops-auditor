#!/usr/bin/env node

/**
 * WikiJS Agent Monitoring System
 * Entry point for the comprehensive monitoring and alerting system
 */

const path = require('path');
const fs = require('fs').promises;
const WikiJSMonitoringSystem = require('./src/monitoring-system');

// Configuration
const config = {
    // Environment
    name: 'wikijs-agent-monitor',
    environment: process.env.NODE_ENV || 'production',
    data_path: process.env.WIKIJS_MONITOR_DATA_PATH || path.join(__dirname, 'data'),

    // Health Monitor Configuration
    health_monitor: {
        checkInterval: 30000, // 30 seconds
        healthChecks: {
            wikijs_agent: {
                enabled: true,
                endpoint: process.env.WIKIJS_AGENT_URL || 'http://localhost:3001/health',
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
                paths: [
                    process.env.REPOS_PATH || '/repos',
                    process.env.WORKSPACE_PATH || '/home/dev/workspace'
                ],
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
        }
    },

    // Metrics Collector Configuration
    metrics_collector: {
        collection_interval: 15000, // 15 seconds
        metrics_retention: 7 * 24 * 60 * 60 * 1000, // 7 days
        buffer_size: 1000,
        flush_interval: 5000 // 5 seconds
    },

    // Alert Manager Configuration
    alert_manager: {
        email_enabled: process.env.EMAIL_ENABLED === 'true',
        smtp_host: process.env.SMTP_HOST || 'localhost',
        smtp_port: parseInt(process.env.SMTP_PORT || '587'),
        smtp_user: process.env.SMTP_USER,
        smtp_pass: process.env.SMTP_PASS,
        email_recipients: process.env.EMAIL_RECIPIENTS ? process.env.EMAIL_RECIPIENTS.split(',') : ['admin@homelab.local'],

        slack_enabled: process.env.SLACK_ENABLED === 'true',
        slack_webhook_url: process.env.SLACK_WEBHOOK_URL,
        slack_channel: process.env.SLACK_CHANNEL || '#homelab-alerts',
        slack_mentions: process.env.SLACK_MENTIONS ? process.env.SLACK_MENTIONS.split(',') : ['@admin'],

        ha_enabled: process.env.HA_ENABLED !== 'false',
        ha_url: process.env.HA_URL || 'http://192.168.1.155:8123',
        ha_token: process.env.HA_TOKEN,
        ha_notification_service: process.env.HA_NOTIFICATION_SERVICE || 'notify.mobile_app',

        warning_timeout: parseInt(process.env.ALERT_WARNING_TIMEOUT || '900'), // 15 minutes
        critical_immediate: process.env.ALERT_CRITICAL_IMMEDIATE !== 'false',
        repeat_interval: parseInt(process.env.ALERT_REPEAT_INTERVAL || '1800'), // 30 minutes
        similar_alert_window: parseInt(process.env.ALERT_SUPPRESSION_WINDOW || '300'), // 5 minutes
        max_alerts_per_hour: parseInt(process.env.MAX_ALERTS_PER_HOUR || '10')
    },

    // Logger Configuration
    logger: {
        default_level: process.env.LOG_LEVEL || 'INFO',
        file_enabled: process.env.LOG_FILE_ENABLED !== 'false',
        console_enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
        console_level: process.env.LOG_CONSOLE_LEVEL || 'INFO',
        colorize: process.env.LOG_COLORIZE !== 'false',
        rotation: process.env.LOG_ROTATION || 'daily',
        retention: parseInt(process.env.LOG_RETENTION || '30'), // days
        compression: process.env.LOG_COMPRESSION !== 'false',
        max_file_size: process.env.LOG_MAX_SIZE || '100MB',

        syslog_enabled: process.env.SYSLOG_ENABLED === 'true',
        syslog_host: process.env.SYSLOG_HOST || 'localhost',
        syslog_port: parseInt(process.env.SYSLOG_PORT || '514'),

        elasticsearch_enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
        elasticsearch_url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
        elasticsearch_index: process.env.ELASTICSEARCH_INDEX || 'wikijs-agent-logs'
    },

    // Dashboard Configuration
    dashboard: {
        port: parseInt(process.env.DASHBOARD_PORT || '3002'),
        host: process.env.DASHBOARD_HOST || '0.0.0.0',
        update_interval: parseInt(process.env.DASHBOARD_UPDATE_INTERVAL || '5000'), // 5 seconds
        data_retention: 24 * 60 * 60 * 1000 // 24 hours
    },

    // Integration Configuration
    integrations: {
        home_assistant: {
            enabled: process.env.HA_INTEGRATION_ENABLED === 'true',
            url: process.env.HA_URL || 'http://192.168.1.155:8123',
            token: process.env.HA_TOKEN
        },
        prometheus: {
            enabled: process.env.PROMETHEUS_ENABLED === 'true',
            port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
            metrics_path: process.env.PROMETHEUS_METRICS_PATH || '/metrics'
        },
        grafana: {
            enabled: process.env.GRAFANA_ENABLED === 'true',
            url: process.env.GRAFANA_URL || 'http://localhost:3000',
            api_key: process.env.GRAFANA_API_KEY
        }
    },

    // Recovery Configuration
    recovery: {
        enabled: process.env.RECOVERY_ENABLED !== 'false',
        restart_threshold: parseInt(process.env.RECOVERY_RESTART_THRESHOLD || '5'),
        restart_window: parseInt(process.env.RECOVERY_RESTART_WINDOW || '300000'), // 5 minutes
        max_restarts: parseInt(process.env.RECOVERY_MAX_RESTARTS || '3')
    }
};

// Global variables
let monitoringSystem = null;
let isShuttingDown = false;

/**
 * Main function to start the monitoring system
 */
async function main() {
    try {
        console.log('🚀 Starting WikiJS Agent Monitoring System...');
        console.log(`📍 Environment: ${config.environment}`);
        console.log(`📂 Data Path: ${config.data_path}`);
        console.log(`🔧 Dashboard Port: ${config.dashboard.port}`);
        
        // Create monitoring system
        monitoringSystem = new WikiJSMonitoringSystem(config);

        // Initialize system
        await monitoringSystem.initialize();

        // Start monitoring
        await monitoringSystem.start();

        console.log('✅ WikiJS Agent Monitoring System started successfully!');
        console.log(`🌐 Dashboard: http://localhost:${config.dashboard.port}`);
        console.log(`📊 Metrics: http://localhost:${config.dashboard.port}/api/v1/metrics/summary`);
        console.log(`🚨 Alerts: http://localhost:${config.dashboard.port}/api/v1/alerts/summary`);
        console.log('');
        console.log('Press Ctrl+C to stop the monitoring system');

    } catch (error) {
        console.error('❌ Failed to start WikiJS Agent Monitoring System:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown function
 */
async function shutdown(signal) {
    if (isShuttingDown) {
        console.log('⚠️ Force shutdown requested');
        process.exit(1);
        return;
    }

    isShuttingDown = true;
    console.log(`\n🔄 Received ${signal}. Initiating graceful shutdown...`);

    try {
        if (monitoringSystem) {
            await monitoringSystem.stop();
        }
        
        console.log('✅ WikiJS Agent Monitoring System stopped gracefully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

/**
 * Create systemd service file
 */
async function createSystemdService() {
    const serviceName = 'wikijs-agent-monitor';
    const serviceContent = `[Unit]
Description=WikiJS Agent Monitoring System
After=network.target

[Service]
Type=simple
User=homelab
WorkingDirectory=${__dirname}
ExecStart=${process.execPath} ${__filename}
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=WIKIJS_MONITOR_DATA_PATH=${config.data_path}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${serviceName}

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${config.data_path}

[Install]
WantedBy=multi-user.target`;

    const servicePath = `/etc/systemd/system/${serviceName}.service`;
    
    try {
        await fs.writeFile(servicePath, serviceContent);
        console.log(`✅ Systemd service file created: ${servicePath}`);
        console.log('To enable and start the service:');
        console.log(`  sudo systemctl enable ${serviceName}`);
        console.log(`  sudo systemctl start ${serviceName}`);
        console.log('To view logs:');
        console.log(`  journalctl -u ${serviceName} -f`);
    } catch (error) {
        console.error('❌ Failed to create systemd service file:', error);
        console.log('You may need to run this as root or use sudo');
    }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
WikiJS Agent Monitoring System

Usage: node index.js [options]

Options:
  --help, -h              Show this help message
  --create-service        Create systemd service file
  --config-check          Validate configuration
  --version, -v           Show version information

Environment Variables:
  NODE_ENV                Environment (development/production)
  WIKIJS_MONITOR_DATA_PATH Data directory path
  DASHBOARD_PORT          Dashboard port (default: 3002)
  LOG_LEVEL              Log level (ERROR/WARN/INFO/DEBUG/TRACE)
  EMAIL_ENABLED          Enable email notifications
  SLACK_ENABLED          Enable Slack notifications
  HA_ENABLED             Enable Home Assistant notifications

Examples:
  node index.js                    # Start monitoring system
  node index.js --create-service   # Create systemd service
  node index.js --config-check     # Validate configuration
        `);
        process.exit(0);
    }

    if (args.includes('--version') || args.includes('-v')) {
        console.log('WikiJS Agent Monitoring System v1.0.0');
        process.exit(0);
    }

    if (args.includes('--create-service')) {
        createSystemdService().then(() => process.exit(0));
        return;
    }

    if (args.includes('--config-check')) {
        validateConfiguration();
        return;
    }
}

/**
 * Validate configuration
 */
function validateConfiguration() {
    console.log('🔍 Validating configuration...');
    
    const issues = [];

    // Check required directories
    const requiredDirs = [config.data_path];
    for (const dir of requiredDirs) {
        try {
            require('fs').accessSync(dir);
        } catch (error) {
            issues.push(`Directory not accessible: ${dir}`);
        }
    }

    // Check port availability
    const ports = [config.dashboard.port];
    if (config.integrations.prometheus.enabled) {
        ports.push(config.integrations.prometheus.port);
    }

    // Check email configuration
    if (config.alert_manager.email_enabled) {
        if (!config.alert_manager.smtp_user || !config.alert_manager.smtp_pass) {
            issues.push('Email enabled but SMTP credentials not configured');
        }
    }

    // Check Slack configuration
    if (config.alert_manager.slack_enabled) {
        if (!config.alert_manager.slack_webhook_url) {
            issues.push('Slack enabled but webhook URL not configured');
        }
    }

    // Check Home Assistant configuration
    if (config.alert_manager.ha_enabled || config.integrations.home_assistant.enabled) {
        if (!config.alert_manager.ha_token) {
            issues.push('Home Assistant enabled but token not configured');
        }
    }

    if (issues.length === 0) {
        console.log('✅ Configuration validation passed');
    } else {
        console.log('❌ Configuration issues found:');
        issues.forEach(issue => console.log(`  - ${issue}`));
        process.exit(1);
    }
}

// Handle command line arguments
parseArguments();

// Setup signal handlers for graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    if (monitoringSystem) {
        monitoringSystem.handleCriticalError?.('uncaught-exception', error);
    } else {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    if (monitoringSystem) {
        monitoringSystem.handleCriticalError?.('unhandled-rejection', reason);
    } else {
        process.exit(1);
    }
});

// Start the monitoring system
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Startup failed:', error);
        process.exit(1);
    });
}

module.exports = { WikiJSMonitoringSystem, config };
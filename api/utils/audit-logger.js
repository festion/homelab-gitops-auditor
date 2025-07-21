const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../../config/utils/config-manager');

/**
 * AuditLogger Class
 * 
 * Provides comprehensive audit logging for webhook events including:
 * - Structured JSON logging with timestamps
 * - Webhook event tracking and statistics
 * - Security event logging for failed validations
 * - File-based persistent logging with rotation
 * - Integration with configuration management
 */
class AuditLogger {
  
  /**
   * Log a successful webhook event
   * @param {Object} event - Webhook event details
   */
  static logWebhookEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'webhook-event',
      level: 'info',
      eventType: event.eventType,
      delivery: event.delivery,
      repository: event.repository,
      result: event.result || 'success',
      deploymentId: event.deploymentId,
      processingTime: event.processingTime,
      trigger: event.trigger,
      userAgent: event.userAgent,
      contentLength: event.contentLength,
      metadata: {
        branch: event.branch,
        commit: event.commit,
        author: event.author,
        reason: event.reason
      }
    };
    
    console.log(JSON.stringify(logEntry));
    this.writeToAuditLog(logEntry);
    
    // Update webhook statistics
    this.updateWebhookStats(event.eventType, true);
  }

  /**
   * Log a webhook processing error
   * @param {Object} event - Webhook error details
   */
  static logWebhookError(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'webhook-error',
      level: 'error',
      eventType: event.eventType,
      delivery: event.delivery,
      error: event.error,
      errorCode: event.errorCode,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      repository: event.repository,
      requestSize: event.requestSize,
      headers: this.sanitizeHeaders(event.headers),
      stackTrace: event.stackTrace
    };
    
    console.error(JSON.stringify(logEntry));
    this.writeToAuditLog(logEntry);
    
    // Update webhook statistics
    this.updateWebhookStats(event.eventType, false);
    
    // Log security events separately for monitoring
    if (this.isSecurityEvent(event.errorCode)) {
      this.logSecurityEvent(logEntry);
    }
  }

  /**
   * Log security-related events for monitoring
   * @param {Object} event - Security event details
   */
  static logSecurityEvent(event) {
    const securityLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'security-event',
      level: 'warn',
      eventType: 'webhook-security-violation',
      violation: event.errorCode,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      error: event.error,
      severity: this.getSecuritySeverity(event.errorCode),
      metadata: {
        delivery: event.delivery,
        repository: event.repository,
        headers: event.headers
      }
    };
    
    console.warn(JSON.stringify(securityLogEntry));
    this.writeToSecurityLog(securityLogEntry);
  }

  /**
   * Log deployment events
   * @param {Object} deployment - Deployment details
   */
  static logDeploymentEvent(deployment) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'deployment-event',
      level: 'info',
      deploymentId: deployment.deploymentId,
      repository: deployment.repository,
      branch: deployment.branch,
      commit: deployment.commit,
      trigger: deployment.trigger,
      status: deployment.status,
      requestedBy: deployment.requestedBy,
      webhookDelivery: deployment.webhookDelivery,
      processingTime: deployment.processingTime,
      metadata: deployment.metadata || {}
    };
    
    console.log(JSON.stringify(logEntry));
    this.writeToAuditLog(logEntry);
  }

  /**
   * Log system performance metrics
   * @param {Object} metrics - Performance metrics
   */
  static logPerformanceMetrics(metrics) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'performance-metrics',
      level: 'debug',
      metrics: {
        webhookProcessingTime: metrics.webhookProcessingTime,
        deploymentQueueSize: metrics.deploymentQueueSize,
        activeDeployments: metrics.activeDeployments,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        eventRate: metrics.eventRate,
        errorRate: metrics.errorRate
      }
    };
    
    if (metrics.logToConsole) {
      console.debug(JSON.stringify(logEntry));
    }
    
    this.writeToMetricsLog(logEntry);
  }

  /**
   * Write log entry to the main audit log file
   * @param {Object} entry - Log entry to write
   */
  static writeToAuditLog(entry) {
    try {
      const logDir = this.getLogDirectory();
      const logFile = path.join(logDir, 'webhook-audit.log');
      
      this.ensureLogDirectory(logDir);
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(logFile, logLine);
      
      // Rotate logs if file is too large
      this.rotateLogIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write to audit log:', error);
    }
  }

  /**
   * Write log entry to the security log file
   * @param {Object} entry - Security log entry to write
   */
  static writeToSecurityLog(entry) {
    try {
      const logDir = this.getLogDirectory();
      const logFile = path.join(logDir, 'webhook-security.log');
      
      this.ensureLogDirectory(logDir);
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(logFile, logLine);
      
      this.rotateLogIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write to security log:', error);
    }
  }

  /**
   * Write log entry to the metrics log file
   * @param {Object} entry - Metrics log entry to write
   */
  static writeToMetricsLog(entry) {
    try {
      const logDir = this.getLogDirectory();
      const logFile = path.join(logDir, 'webhook-metrics.log');
      
      this.ensureLogDirectory(logDir);
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(logFile, logLine);
      
      this.rotateLogIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write to metrics log:', error);
    }
  }

  /**
   * Get the configured log directory
   * @returns {string} Log directory path
   */
  static getLogDirectory() {
    try {
      // Try to load from configuration
      const config = require('../../config/deployment-config.json');
      const logOutput = config.logging?.output;
      
      if (logOutput) {
        return path.dirname(logOutput);
      }
    } catch (error) {
      // Fallback to default directory
    }
    
    return '/var/log/homelab-gitops-auditor';
  }

  /**
   * Ensure log directory exists
   * @param {string} logDir - Log directory path
   */
  static ensureLogDirectory(logDir) {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Rotate log file if it exceeds size limit
   * @param {string} logFile - Path to log file
   */
  static rotateLogIfNeeded(logFile) {
    try {
      const stats = fs.statSync(logFile);
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = `${logFile}.${timestamp}`;
        
        fs.renameSync(logFile, rotatedFile);
        
        // Keep only last 5 rotated logs
        this.cleanupOldLogs(path.dirname(logFile), path.basename(logFile));
      }
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  /**
   * Clean up old rotated log files
   * @param {string} logDir - Log directory
   * @param {string} baseLogName - Base log file name
   */
  static cleanupOldLogs(logDir, baseLogName) {
    try {
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith(baseLogName) && file !== baseLogName)
        .sort()
        .reverse();
      
      // Keep only the 5 most recent rotated logs
      if (files.length > 5) {
        const filesToDelete = files.slice(5);
        filesToDelete.forEach(file => {
          fs.unlinkSync(path.join(logDir, file));
        });
      }
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
    }
  }

  /**
   * Sanitize headers for logging (remove sensitive information)
   * @param {Object} headers - Request headers
   * @returns {Object} Sanitized headers
   */
  static sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    delete sanitized['x-hub-signature-256'];
    delete sanitized['authorization'];
    delete sanitized['cookie'];
    
    return sanitized;
  }

  /**
   * Check if an error code represents a security event
   * @param {string} errorCode - Error code
   * @returns {boolean} True if it's a security event
   */
  static isSecurityEvent(errorCode) {
    const securityCodes = [
      'INVALID_SIGNATURE',
      'MISSING_SIGNATURE',
      'UNAUTHORIZED_IP',
      'INVALID_USER_AGENT',
      'REQUEST_TOO_LARGE'
    ];
    
    return securityCodes.includes(errorCode);
  }

  /**
   * Get security severity level for an error code
   * @param {string} errorCode - Error code
   * @returns {string} Severity level
   */
  static getSecuritySeverity(errorCode) {
    switch (errorCode) {
      case 'INVALID_SIGNATURE':
      case 'UNAUTHORIZED_IP':
        return 'high';
      case 'MISSING_SIGNATURE':
      case 'REQUEST_TOO_LARGE':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Update webhook statistics
   * @param {string} eventType - Event type
   * @param {boolean} success - Whether the event was successful
   */
  static updateWebhookStats(eventType, success) {
    // This could be enhanced to write to a persistent stats file
    // or database for long-term analytics
    const statsFile = path.join(this.getLogDirectory(), 'webhook-stats.json');
    
    try {
      let stats = {};
      if (fs.existsSync(statsFile)) {
        stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
      }
      
      if (!stats[eventType]) {
        stats[eventType] = { total: 0, successful: 0, failed: 0 };
      }
      
      stats[eventType].total++;
      if (success) {
        stats[eventType].successful++;
      } else {
        stats[eventType].failed++;
      }
      
      stats.lastUpdated = new Date().toISOString();
      
      fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('Error updating webhook stats:', error);
    }
  }

  /**
   * Get webhook statistics
   * @returns {Object} Webhook statistics
   */
  static getWebhookStats() {
    const statsFile = path.join(this.getLogDirectory(), 'webhook-stats.json');
    
    try {
      if (fs.existsSync(statsFile)) {
        return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error reading webhook stats:', error);
    }
    
    return {};
  }

  /**
   * Generate audit report for a specific time period
   * @param {Date} startDate - Start date for the report
   * @param {Date} endDate - End date for the report
   * @returns {Object} Audit report
   */
  static generateAuditReport(startDate, endDate) {
    const logDir = this.getLogDirectory();
    const auditLogFile = path.join(logDir, 'webhook-audit.log');
    
    try {
      if (!fs.existsSync(auditLogFile)) {
        return { error: 'No audit log file found' };
      }
      
      const logContent = fs.readFileSync(auditLogFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      
      const events = logLines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(event => {
          if (!event || !event.timestamp) return false;
          const eventDate = new Date(event.timestamp);
          return eventDate >= startDate && eventDate <= endDate;
        });
      
      const report = {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalEvents: events.length,
          successfulEvents: events.filter(e => e.type === 'webhook-event').length,
          errorEvents: events.filter(e => e.type === 'webhook-error').length,
          securityEvents: events.filter(e => e.type === 'security-event').length
        },
        eventBreakdown: {},
        repositoryActivity: {},
        errors: []
      };
      
      // Analyze events
      events.forEach(event => {
        // Event type breakdown
        if (event.eventType) {
          report.eventBreakdown[event.eventType] = 
            (report.eventBreakdown[event.eventType] || 0) + 1;
        }
        
        // Repository activity
        if (event.repository) {
          if (!report.repositoryActivity[event.repository]) {
            report.repositoryActivity[event.repository] = { events: 0, deployments: 0 };
          }
          report.repositoryActivity[event.repository].events++;
          if (event.deploymentId) {
            report.repositoryActivity[event.repository].deployments++;
          }
        }
        
        // Collect errors
        if (event.type === 'webhook-error') {
          report.errors.push({
            timestamp: event.timestamp,
            error: event.error,
            eventType: event.eventType,
            ipAddress: event.ipAddress
          });
        }
      });
      
      return report;
    } catch (error) {
      return { error: `Failed to generate audit report: ${error.message}` };
    }
  }

  /**
   * Log authentication events
   * @param {Object} event - Authentication event details
   */
  static logAuthenticationEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'authentication-event',
      level: event.type.includes('failure') ? 'warn' : 'info',
      authType: event.type,
      userId: event.userId,
      username: event.username,
      apiKeyId: event.apiKeyId,
      apiKeyName: event.apiKeyName,
      success: !event.type.includes('failure'),
      error: event.error,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      endpoint: event.endpoint,
      method: event.method,
      metadata: event.metadata || {}
    };
    
    console.log(JSON.stringify(logEntry));
    this.writeToAuditLog(logEntry);
  }

  /**
   * Log authorization events
   * @param {Object} event - Authorization event details
   */
  static logAuthorizationEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'authorization-event',
      level: event.type.includes('failure') ? 'warn' : 'info',
      authzType: event.type,
      userId: event.userId,
      username: event.username,
      requiredPermissions: event.requiredPermissions,
      userPermissions: event.userPermissions,
      success: !event.type.includes('failure'),
      ipAddress: event.ipAddress,
      endpoint: event.endpoint,
      method: event.method,
      metadata: event.metadata || {}
    };
    
    console.log(JSON.stringify(logEntry));
    this.writeToAuditLog(logEntry);
  }
}

module.exports = { AuditLogger };
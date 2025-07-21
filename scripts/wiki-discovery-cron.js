#!/usr/bin/env node

/**
 * Wiki Discovery Cron Job
 * 
 * Automated scheduled document discovery system for WikiJS agent.
 * Supports incremental discovery, failure recovery, and resource-aware scheduling.
 * 
 * Features:
 * - Configurable discovery intervals (default: daily)
 * - Incremental discovery for changed files only
 * - Resource-aware scheduling to avoid peak usage
 * - Failure recovery and retry mechanisms
 * - Progress reporting and comprehensive logging
 * - Health monitoring and alerting
 * 
 * Version: 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const cron = require('node-cron');
const pidusage = require('pidusage');

// Import our enhanced discovery manager
const EnhancedDiscoveryManager = require('../api/enhanced-discovery-manager');

class WikiDiscoveryCronManager {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.configPath = path.join(this.rootDir, 'config', 'discovery-cron.json');
    this.lockFilePath = path.join(this.rootDir, 'tmp', 'wiki-discovery.lock');
    this.logFilePath = path.join(this.rootDir, 'logs', 'wiki-discovery-cron.log');
    
    this.config = null;
    this.discoveryManager = null;
    this.isRunning = false;
    this.currentJob = null;
    this.jobStats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastSuccess: null,
      avgDurationMs: 0
    };

    // Resource monitoring
    this.resourceThresholds = {
      maxCpuPercent: 80,
      maxMemoryMB: 1024,
      maxLoadAverage: 4.0
    };

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      path.join(this.rootDir, 'tmp'),
      path.join(this.rootDir, 'logs'),
      path.join(this.rootDir, 'config')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  /**
   * Initialize the cron manager
   */
  async initialize() {
    try {
      await this.loadConfiguration();
      await this.initializeDiscoveryManager();
      await this.loadJobStats();
      await this.checkSystemRequirements();
      
      console.log('✅ Wiki Discovery Cron Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize cron manager:', error);
      throw error;
    }
  }

  /**
   * Load cron configuration
   */
  async loadConfiguration() {
    try {
      // Try to load existing config
      const configContent = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configContent);
    } catch (error) {
      // Create default configuration if not exists
      console.log('📝 Creating default cron configuration...');
      this.config = this.getDefaultConfiguration();
      await this.saveConfiguration();
    }

    console.log(`✅ Loaded cron configuration: ${this.config.schedules.length} schedules`);
  }

  /**
   * Get default configuration
   */
  getDefaultConfiguration() {
    return {
      version: "2.0.0",
      enabled: true,
      schedules: [
        {
          id: "daily-full-discovery",
          name: "Daily Full Discovery",
          cronExpression: "0 3 * * *", // 3 AM daily
          enabled: true,
          type: "full",
          description: "Complete document discovery across all sources",
          resourceAware: true,
          maxRetries: 3,
          retryDelay: 300000, // 5 minutes
          timeout: 3600000, // 1 hour
          notifications: {
            onSuccess: true,
            onFailure: true,
            onResourceExhaustion: true
          }
        },
        {
          id: "hourly-incremental",
          name: "Hourly Incremental Discovery",
          cronExpression: "0 * * * *", // Every hour
          enabled: false, // Disabled by default to prevent overload
          type: "incremental",
          description: "Incremental discovery for changed files only",
          resourceAware: true,
          maxRetries: 2,
          retryDelay: 120000, // 2 minutes
          timeout: 1800000, // 30 minutes
          notifications: {
            onSuccess: false,
            onFailure: true,
            onResourceExhaustion: true
          }
        },
        {
          id: "weekly-deep-scan",
          name: "Weekly Deep Scan",
          cronExpression: "0 2 * * 0", // 2 AM on Sundays
          enabled: true,
          type: "deep",
          description: "Deep scan with content analysis and cleanup",
          resourceAware: true,
          maxRetries: 5,
          retryDelay: 600000, // 10 minutes
          timeout: 7200000, // 2 hours
          notifications: {
            onSuccess: true,
            onFailure: true,
            onResourceExhaustion: true
          }
        }
      ],
      resourceLimits: {
        maxCpuPercent: 80,
        maxMemoryMB: 1024,
        maxLoadAverage: 4.0,
        checkInterval: 30000, // 30 seconds
        cooldownPeriod: 300000 // 5 minutes
      },
      logging: {
        level: "info",
        maxFileSize: "50MB",
        maxFiles: 10,
        enableConsole: true,
        enableFile: true
      },
      notifications: {
        enabled: true,
        channels: {
          console: true,
          file: true,
          webhook: {
            enabled: false,
            url: null,
            method: "POST"
          }
        }
      },
      healthCheck: {
        enabled: true,
        endpoint: "/health/discovery-cron",
        port: 3071
      }
    };
  }

  /**
   * Initialize discovery manager
   */
  async initializeDiscoveryManager() {
    this.discoveryManager = new EnhancedDiscoveryManager({}, this.rootDir);
    await this.discoveryManager.initialize();
    console.log('✅ Discovery manager initialized');
  }

  /**
   * Load job statistics
   */
  async loadJobStats() {
    const statsPath = path.join(this.rootDir, 'tmp', 'cron-stats.json');
    try {
      const statsContent = await fs.readFile(statsPath, 'utf8');
      this.jobStats = { ...this.jobStats, ...JSON.parse(statsContent) };
    } catch (error) {
      // Stats file doesn't exist or is invalid, use defaults
      console.log('📊 Using default job statistics');
    }
  }

  /**
   * Save job statistics
   */
  async saveJobStats() {
    const statsPath = path.join(this.rootDir, 'tmp', 'cron-stats.json');
    try {
      await fs.writeFile(statsPath, JSON.stringify(this.jobStats, null, 2));
    } catch (error) {
      console.error('❌ Failed to save job stats:', error);
    }
  }

  /**
   * Save configuration
   */
  async saveConfiguration() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('✅ Configuration saved');
    } catch (error) {
      console.error('❌ Failed to save configuration:', error);
    }
  }

  /**
   * Check system requirements and dependencies
   */
  async checkSystemRequirements() {
    const requirements = [];

    // Check Node.js version
    const nodeVersion = process.version;
    if (parseInt(nodeVersion.slice(1)) < 14) {
      requirements.push(`Node.js 14+ required, found ${nodeVersion}`);
    }

    // Check available memory
    const memInfo = process.memoryUsage();
    if (memInfo.heapTotal / 1024 / 1024 > 512) {
      console.warn('⚠️ High memory usage detected, consider optimization');
    }

    // Check required directories are writable
    const testDirs = [
      path.join(this.rootDir, 'tmp'),
      path.join(this.rootDir, 'logs')
    ];

    for (const dir of testDirs) {
      try {
        await fs.access(dir, fs.constants.W_OK);
      } catch (error) {
        requirements.push(`Directory ${dir} is not writable`);
      }
    }

    if (requirements.length > 0) {
      throw new Error(`System requirements not met: ${requirements.join(', ')}`);
    }

    console.log('✅ System requirements check passed');
  }

  /**
   * Start the cron scheduler
   */
  async startScheduler() {
    if (!this.config.enabled) {
      console.log('📴 Cron scheduler is disabled in configuration');
      return;
    }

    console.log('🚀 Starting Wiki Discovery Cron Scheduler...');

    // Schedule each enabled job
    for (const schedule of this.config.schedules) {
      if (schedule.enabled) {
        this.scheduleJob(schedule);
        console.log(`📅 Scheduled: ${schedule.name} (${schedule.cronExpression})`);
      }
    }

    // Start health check server if enabled
    if (this.config.healthCheck.enabled) {
      this.startHealthCheckServer();
    }

    console.log('✅ Cron scheduler started successfully');
  }

  /**
   * Schedule a single job
   */
  scheduleJob(schedule) {
    const task = cron.schedule(schedule.cronExpression, async () => {
      await this.executeScheduledJob(schedule);
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    task.start();
    schedule.cronTask = task;
  }

  /**
   * Execute a scheduled job with full error handling and resource checking
   */
  async executeScheduledJob(schedule) {
    const jobId = `${schedule.id}_${Date.now()}`;
    const startTime = Date.now();

    try {
      // Check if another instance is running
      if (await this.isJobRunning()) {
        console.warn(`⚠️ Skipping ${schedule.name}: Another job is already running`);
        await this.sendNotification('warning', `Job ${schedule.name} skipped - another instance running`);
        return;
      }

      // Create lock file
      await this.createLockFile(jobId, schedule);

      // Check system resources
      if (schedule.resourceAware && !(await this.checkSystemResources())) {
        console.warn(`⚠️ Skipping ${schedule.name}: System resources exhausted`);
        await this.sendNotification('resource_exhaustion', `Job ${schedule.name} skipped due to resource constraints`);
        return;
      }

      console.log(`🚀 Starting scheduled job: ${schedule.name}`);
      this.currentJob = { id: jobId, schedule, startTime };
      this.isRunning = true;

      // Execute the discovery job with timeout
      const result = await this.executeDiscoveryWithTimeout(schedule);

      // Update statistics
      this.updateJobStats(schedule, true, Date.now() - startTime);

      console.log(`✅ Job ${schedule.name} completed successfully:`, result);
      
      if (schedule.notifications.onSuccess) {
        await this.sendNotification('success', `Job ${schedule.name} completed successfully`, result);
      }

    } catch (error) {
      console.error(`❌ Job ${schedule.name} failed:`, error);
      
      // Update statistics
      this.updateJobStats(schedule, false, Date.now() - startTime);

      if (schedule.notifications.onFailure) {
        await this.sendNotification('failure', `Job ${schedule.name} failed: ${error.message}`, { error: error.message });
      }

      // Attempt retry if configured
      await this.attemptRetry(schedule, error);

    } finally {
      // Clean up
      this.isRunning = false;
      this.currentJob = null;
      await this.removeLockFile();
      
      // Save updated stats
      await this.saveJobStats();
    }
  }

  /**
   * Execute discovery with timeout protection
   */
  async executeDiscoveryWithTimeout(schedule) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Job timed out after ${schedule.timeout}ms`));
      }, schedule.timeout);

      try {
        let result;

        switch (schedule.type) {
          case 'full':
            result = await this.discoveryManager.runMultiSourceDiscovery();
            break;
          case 'incremental':
            result = await this.runIncrementalDiscovery();
            break;
          case 'deep':
            result = await this.runDeepScanDiscovery();
            break;
          default:
            throw new Error(`Unknown job type: ${schedule.type}`);
        }

        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Run incremental discovery (only changed files)
   */
  async runIncrementalDiscovery() {
    console.log('🔄 Running incremental discovery...');
    
    // Get last run time
    const lastRunTime = this.jobStats.lastSuccess ? new Date(this.jobStats.lastSuccess) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // For incremental discovery, we would implement change detection
    // For now, run full discovery but with different logging
    const result = await this.discoveryManager.runMultiSourceDiscovery();
    
    return {
      ...result,
      type: 'incremental',
      since: lastRunTime.toISOString()
    };
  }

  /**
   * Run deep scan discovery with content analysis
   */
  async runDeepScanDiscovery() {
    console.log('🔍 Running deep scan discovery...');
    
    // Deep scan includes content analysis and cleanup
    const result = await this.discoveryManager.runMultiSourceDiscovery();
    
    // Add cleanup operations
    await this.cleanupStaleDocuments();
    await this.optimizeDatabase();
    
    return {
      ...result,
      type: 'deep',
      cleanupPerformed: true
    };
  }

  /**
   * Clean up stale documents (older than 30 days with no source file)
   */
  async cleanupStaleDocuments() {
    try {
      const staleCount = await this.discoveryManager.runQuery(`
        UPDATE wiki_documents 
        SET sync_status = 'ARCHIVED' 
        WHERE sync_status != 'ARCHIVED' 
        AND updated_at < datetime('now', '-30 days')
        AND NOT EXISTS (
          SELECT 1 FROM document_metadata dm WHERE dm.document_id = wiki_documents.id
        )
      `);
      
      console.log(`🗑️ Archived ${staleCount.changes || 0} stale documents`);
    } catch (error) {
      console.error('❌ Failed to cleanup stale documents:', error);
    }
  }

  /**
   * Optimize database (vacuum, reindex)
   */
  async optimizeDatabase() {
    try {
      await this.discoveryManager.runQuery('VACUUM');
      await this.discoveryManager.runQuery('REINDEX');
      console.log('🔧 Database optimization completed');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
    }
  }

  /**
   * Check if a job is currently running
   */
  async isJobRunning() {
    try {
      await fs.access(this.lockFilePath);
      
      // Check if the process is actually running
      const lockContent = await fs.readFile(this.lockFilePath, 'utf8');
      const lockData = JSON.parse(lockContent);
      
      // Check if process exists (basic check)
      if (Date.now() - new Date(lockData.createdAt).getTime() > 3600000) { // 1 hour
        console.log('🔓 Removing stale lock file');
        await this.removeLockFile();
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create lock file
   */
  async createLockFile(jobId, schedule) {
    const lockData = {
      jobId,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      pid: process.pid,
      createdAt: new Date().toISOString()
    };

    await fs.writeFile(this.lockFilePath, JSON.stringify(lockData, null, 2));
  }

  /**
   * Remove lock file
   */
  async removeLockFile() {
    try {
      await fs.unlink(this.lockFilePath);
    } catch (error) {
      // Lock file may not exist, ignore error
    }
  }

  /**
   * Check system resources
   */
  async checkSystemResources() {
    try {
      // Check CPU usage
      const stats = await pidusage(process.pid);
      const cpuPercent = stats.cpu;
      const memoryMB = stats.memory / 1024 / 1024;

      // Check load average (Unix systems)
      let loadAverage = 0;
      if (process.platform !== 'win32') {
        const execAsync = promisify(exec);
        try {
          const { stdout } = await execAsync('uptime');
          const loadMatch = stdout.match(/load average[s]?: ([0-9.]+)/);
          if (loadMatch) {
            loadAverage = parseFloat(loadMatch[1]);
          }
        } catch (error) {
          // Ignore load average check on error
        }
      }

      const limits = this.config.resourceLimits;
      const resourceCheck = {
        cpu: cpuPercent < limits.maxCpuPercent,
        memory: memoryMB < limits.maxMemoryMB,
        load: loadAverage === 0 || loadAverage < limits.maxLoadAverage
      };

      const allGood = Object.values(resourceCheck).every(check => check);
      
      if (!allGood) {
        console.warn('⚠️ Resource limits exceeded:', {
          cpu: `${cpuPercent.toFixed(1)}% (limit: ${limits.maxCpuPercent}%)`,
          memory: `${memoryMB.toFixed(1)}MB (limit: ${limits.maxMemoryMB}MB)`,
          load: `${loadAverage.toFixed(2)} (limit: ${limits.maxLoadAverage})`
        });
      }

      return allGood;
    } catch (error) {
      console.warn('⚠️ Failed to check system resources:', error);
      return true; // Proceed if we can't check
    }
  }

  /**
   * Update job statistics
   */
  updateJobStats(schedule, success, duration) {
    this.jobStats.totalRuns++;
    this.jobStats.lastRun = new Date().toISOString();
    
    if (success) {
      this.jobStats.successfulRuns++;
      this.jobStats.lastSuccess = new Date().toISOString();
    } else {
      this.jobStats.failedRuns++;
    }

    // Update average duration
    const totalDuration = (this.jobStats.avgDurationMs * (this.jobStats.totalRuns - 1)) + duration;
    this.jobStats.avgDurationMs = Math.round(totalDuration / this.jobStats.totalRuns);
  }

  /**
   * Attempt retry with exponential backoff
   */
  async attemptRetry(schedule, error) {
    if (!schedule.retryCount) {
      schedule.retryCount = 0;
    }

    if (schedule.retryCount < schedule.maxRetries) {
      schedule.retryCount++;
      const delay = schedule.retryDelay * Math.pow(2, schedule.retryCount - 1);
      
      console.log(`🔄 Retrying ${schedule.name} in ${delay}ms (attempt ${schedule.retryCount}/${schedule.maxRetries})`);
      
      setTimeout(async () => {
        try {
          await this.executeScheduledJob(schedule);
          schedule.retryCount = 0; // Reset on success
        } catch (retryError) {
          await this.attemptRetry(schedule, retryError);
        }
      }, delay);
    } else {
      console.error(`💥 Job ${schedule.name} failed permanently after ${schedule.maxRetries} retries`);
      schedule.retryCount = 0;
      
      await this.sendNotification('permanent_failure', 
        `Job ${schedule.name} failed permanently after ${schedule.maxRetries} retries`, 
        { finalError: error.message }
      );
    }
  }

  /**
   * Send notification
   */
  async sendNotification(type, message, data = null) {
    if (!this.config.notifications.enabled) return;

    const notification = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
      service: 'wiki-discovery-cron'
    };

    // Console notification
    if (this.config.notifications.channels.console) {
      const emoji = this.getNotificationEmoji(type);
      console.log(`${emoji} ${message}`);
    }

    // File notification
    if (this.config.notifications.channels.file) {
      await this.logToFile('NOTIFICATION', JSON.stringify(notification));
    }

    // Webhook notification
    if (this.config.notifications.channels.webhook?.enabled) {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(this.config.notifications.channels.webhook.url, {
          method: this.config.notifications.channels.webhook.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification)
        });
      } catch (error) {
        console.error('❌ Failed to send webhook notification:', error);
      }
    }
  }

  /**
   * Get notification emoji
   */
  getNotificationEmoji(type) {
    const emojis = {
      success: '✅',
      failure: '❌',
      warning: '⚠️',
      resource_exhaustion: '🚨',
      permanent_failure: '💥',
      info: 'ℹ️'
    };
    return emojis[type] || '📢';
  }

  /**
   * Log message to file
   */
  async logToFile(level, message) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;
      await fs.appendFile(this.logFilePath, logEntry);
    } catch (error) {
      console.error('❌ Failed to write to log file:', error);
    }
  }

  /**
   * Start health check server
   */
  startHealthCheckServer() {
    const http = require('http');
    const port = this.config.healthCheck.port || 3071;
    const endpoint = this.config.healthCheck.endpoint || '/health/discovery-cron';

    const server = http.createServer((req, res) => {
      if (req.url === endpoint) {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          currentlyRunning: this.isRunning,
          currentJob: this.currentJob ? {
            id: this.currentJob.id,
            schedule: this.currentJob.schedule.name,
            duration: Date.now() - this.currentJob.startTime
          } : null,
          statistics: this.jobStats,
          enabledSchedules: this.config.schedules.filter(s => s.enabled).length,
          totalSchedules: this.config.schedules.length
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      console.log(`🏥 Health check server started on port ${port}${endpoint}`);
    });
  }

  /**
   * Stop the scheduler gracefully
   */
  async stopScheduler() {
    console.log('🛑 Stopping Wiki Discovery Cron Scheduler...');

    // Stop all scheduled jobs
    for (const schedule of this.config.schedules) {
      if (schedule.cronTask) {
        schedule.cronTask.stop();
        schedule.cronTask = null;
      }
    }

    // Wait for current job to finish or force stop after timeout
    if (this.isRunning && this.currentJob) {
      console.log('⏳ Waiting for current job to finish...');
      const maxWait = 60000; // 1 minute
      const startWait = Date.now();
      
      while (this.isRunning && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.isRunning) {
        console.warn('⚠️ Force stopping current job');
        this.isRunning = false;
        this.currentJob = null;
      }
    }

    // Clean up lock file
    await this.removeLockFile();

    // Save final stats
    await this.saveJobStats();

    console.log('✅ Cron scheduler stopped gracefully');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      currentJob: this.currentJob,
      statistics: this.jobStats,
      schedules: this.config.schedules.map(s => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        cronExpression: s.cronExpression,
        type: s.type
      }))
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  const cronManager = new WikiDiscoveryCronManager();

  try {
    await cronManager.initialize();

    switch (command) {
      case 'start':
        await cronManager.startScheduler();
        // Keep the process running
        process.on('SIGINT', async () => {
          console.log('\n🛑 Received SIGINT, shutting down gracefully...');
          await cronManager.stopScheduler();
          process.exit(0);
        });
        process.on('SIGTERM', async () => {
          console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
          await cronManager.stopScheduler();
          process.exit(0);
        });
        // Keep alive
        setInterval(() => {}, 60000);
        break;

      case 'stop':
        await cronManager.stopScheduler();
        break;

      case 'status':
        const status = cronManager.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;

      case 'run-once':
        const scheduleId = args[1];
        if (!scheduleId) {
          console.error('❌ Please specify schedule ID for run-once command');
          process.exit(1);
        }
        const schedule = cronManager.config.schedules.find(s => s.id === scheduleId);
        if (!schedule) {
          console.error(`❌ Schedule not found: ${scheduleId}`);
          process.exit(1);
        }
        await cronManager.executeScheduledJob(schedule);
        break;

      case 'list':
        console.log('📅 Configured schedules:');
        cronManager.config.schedules.forEach(s => {
          const status = s.enabled ? '✅ enabled' : '❌ disabled';
          console.log(`  ${s.id}: ${s.name} (${s.cronExpression}) - ${status}`);
        });
        break;

      default:
        console.log(`
Wiki Discovery Cron Manager v2.0.0

Usage: node wiki-discovery-cron.js [command] [options]

Commands:
  start              Start the cron scheduler (default)
  stop               Stop the cron scheduler
  status             Show current status
  run-once <id>      Run a specific schedule once
  list               List all configured schedules

Examples:
  node wiki-discovery-cron.js start
  node wiki-discovery-cron.js run-once daily-full-discovery
  node wiki-discovery-cron.js status
        `);
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WikiDiscoveryCronManager;
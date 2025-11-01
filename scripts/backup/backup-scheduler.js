// scripts/backup/backup-scheduler.js
const cron = require('node-cron');
const { BackupManager } = require('./backup-manager');
const { BackupMetadata } = require('./backup-metadata');
const { Logger } = require('../services/utils/logger');

class BackupScheduler {
  constructor(options = {}) {
    this.backupManager = new BackupManager(options);
    this.backupMetadata = new BackupMetadata(options);
    this.logger = new Logger('BackupScheduler');
    
    this.config = {
      // Default schedule: daily at 2 AM
      schedules: {
        daily: '0 2 * * *',
        weekly: '0 3 * * 0', // Sunday at 3 AM
        monthly: '0 4 1 * *' // 1st of month at 4 AM
      },
      retentionPolicies: {
        daily: 7,     // Keep 7 daily backups
        weekly: 4,    // Keep 4 weekly backups  
        monthly: 12   // Keep 12 monthly backups
      },
      cleanupSchedule: '0 5 * * *', // Daily cleanup at 5 AM
      enabledSchedules: ['daily', 'cleanup'],
      ...options
    };
    
    this.scheduledTasks = new Map();
    this.isRunning = false;
  }

  async initialize() {
    try {
      await this.backupManager.initialize();
      await this.backupMetadata.initialize();
      
      this.logger.info('Backup Scheduler initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Backup Scheduler', { error: error.message });
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Backup Scheduler is already running');
      return;
    }

    try {
      await this.initialize();
      
      // Schedule enabled backup tasks
      for (const scheduleType of this.config.enabledSchedules) {
        if (scheduleType === 'cleanup') {
          this.scheduleCleanupTask();
        } else if (this.config.schedules[scheduleType]) {
          this.scheduleBackupTask(scheduleType);
        }
      }
      
      this.isRunning = true;
      this.logger.info('Backup Scheduler started', {
        enabledSchedules: this.config.enabledSchedules,
        scheduledTasks: this.scheduledTasks.size
      });
      
    } catch (error) {
      this.logger.error('Failed to start Backup Scheduler', { error: error.message });
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Backup Scheduler is not running');
      return;
    }

    try {
      // Stop all scheduled tasks
      for (const [taskName, task] of this.scheduledTasks) {
        if (task && typeof task.stop === 'function') {
          task.stop();
          this.logger.debug(`Stopped scheduled task: ${taskName}`);
        }
      }
      
      this.scheduledTasks.clear();
      this.isRunning = false;
      
      this.logger.info('Backup Scheduler stopped');
      
    } catch (error) {
      this.logger.error('Error stopping Backup Scheduler', { error: error.message });
      throw error;
    }
  }

  scheduleBackupTask(scheduleType) {
    const cronExpression = this.config.schedules[scheduleType];
    
    if (!cronExpression) {
      this.logger.warn(`No cron expression found for schedule type: ${scheduleType}`);
      return;
    }

    const taskName = `backup-${scheduleType}`;
    
    try {
      const task = cron.schedule(cronExpression, async () => {
        await this.executeScheduledBackup(scheduleType);
      }, {
        scheduled: false,
        timezone: this.config.timezone || 'UTC'
      });
      
      task.start();
      this.scheduledTasks.set(taskName, task);
      
      this.logger.info(`Scheduled ${scheduleType} backup task`, {
        schedule: cronExpression,
        timezone: this.config.timezone || 'UTC'
      });
      
    } catch (error) {
      this.logger.error(`Failed to schedule ${scheduleType} backup task`, { error: error.message });
    }
  }

  scheduleCleanupTask() {
    const cronExpression = this.config.cleanupSchedule;
    
    try {
      const task = cron.schedule(cronExpression, async () => {
        await this.executeScheduledCleanup();
      }, {
        scheduled: false,
        timezone: this.config.timezone || 'UTC'
      });
      
      task.start();
      this.scheduledTasks.set('cleanup', task);
      
      this.logger.info('Scheduled backup cleanup task', {
        schedule: cronExpression,
        timezone: this.config.timezone || 'UTC'
      });
      
    } catch (error) {
      this.logger.error('Failed to schedule cleanup task', { error: error.message });
    }
  }

  async executeScheduledBackup(scheduleType) {
    const startTime = Date.now();
    
    this.logger.info(`Executing scheduled ${scheduleType} backup`);
    
    try {
      // Create the backup
      const backupId = await this.backupManager.createScheduledBackup();
      
      // Update backup metadata with schedule information
      await this.backupMetadata.updateBackup(backupId, {
        scheduleType: scheduleType,
        scheduledExecution: true,
        executionTime: Date.now() - startTime
      });
      
      this.logger.info(`Scheduled ${scheduleType} backup completed successfully`, {
        backupId,
        executionTimeMs: Date.now() - startTime
      });
      
      // Trigger cleanup for this schedule type after successful backup
      await this.cleanupByScheduleType(scheduleType);
      
    } catch (error) {
      this.logger.error(`Scheduled ${scheduleType} backup failed`, {
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
      
      // Optionally send alert/notification about backup failure
      await this.handleBackupFailure(scheduleType, error);
    }
  }

  async executeScheduledCleanup() {
    const startTime = Date.now();
    
    this.logger.info('Executing scheduled backup cleanup');
    
    try {
      const cleanupResult = await this.backupManager.cleanupExpiredBackups();
      
      this.logger.info('Scheduled backup cleanup completed', {
        deletedBackups: cleanupResult.deletedCount,
        remainingBackups: cleanupResult.remainingBackups,
        executionTimeMs: Date.now() - startTime
      });
      
    } catch (error) {
      this.logger.error('Scheduled backup cleanup failed', {
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  async cleanupByScheduleType(scheduleType) {
    try {
      const retentionDays = this.config.retentionPolicies[scheduleType];
      
      if (!retentionDays) {
        this.logger.debug(`No retention policy defined for schedule type: ${scheduleType}`);
        return;
      }
      
      // Get backups of this schedule type
      const backups = await this.backupMetadata.listBackups({
        type: 'scheduled',
        sortBy: 'timestamp',
        sortOrder: 'desc'
      });
      
      // Filter by schedule type
      const scheduleBackups = backups.filter(backup => 
        backup.scheduleType === scheduleType
      );
      
      if (scheduleBackups.length <= retentionDays) {
        this.logger.debug(`No cleanup needed for ${scheduleType} backups`, {
          current: scheduleBackups.length,
          retention: retentionDays
        });
        return;
      }
      
      // Remove excess backups
      const backupsToDelete = scheduleBackups.slice(retentionDays);
      let deletedCount = 0;
      
      for (const backup of backupsToDelete) {
        try {
          const fs = require('fs').promises;
          await fs.unlink(backup.path);
          await this.backupMetadata.removeBackup(backup.backupId);
          deletedCount++;
          
          this.logger.debug(`Deleted ${scheduleType} backup`, {
            backupId: backup.backupId,
            age: Math.floor((Date.now() - new Date(backup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
          });
          
        } catch (error) {
          this.logger.warn(`Failed to delete ${scheduleType} backup`, {
            backupId: backup.backupId,
            error: error.message
          });
        }
      }
      
      this.logger.info(`Cleaned up ${scheduleType} backups`, {
        deleted: deletedCount,
        remaining: scheduleBackups.length - deletedCount,
        retentionDays
      });
      
    } catch (error) {
      this.logger.error(`Failed to cleanup ${scheduleType} backups`, { error: error.message });
    }
  }

  async handleBackupFailure(scheduleType, error) {
    // Log the failure
    this.logger.error(`Backup failure requires attention`, {
      scheduleType,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Could implement notification systems here:
    // - Email alerts
    // - Slack/Discord notifications
    // - Health check endpoint updates
    // - Home Assistant notifications
    
    try {
      // Example: Create a failure record
      const failureRecord = {
        scheduleType,
        error: error.message,
        timestamp: new Date().toISOString(),
        severity: 'error'
      };
      
      // Could write to a failures log or alert system
      this.logger.warn('Backup failure recorded for monitoring', failureRecord);
      
    } catch (recordError) {
      this.logger.error('Failed to record backup failure', { error: recordError.message });
    }
  }

  async getScheduleStatus() {
    const status = {
      isRunning: this.isRunning,
      scheduledTasks: [],
      lastExecution: {},
      nextExecution: {},
      statistics: await this.getBackupStatistics()
    };
    
    // Get status of each scheduled task
    for (const [taskName, task] of this.scheduledTasks) {
      status.scheduledTasks.push({
        name: taskName,
        running: task ? task.running : false,
        status: task ? (task.running ? 'active' : 'scheduled') : 'stopped'
      });
    }
    
    // Get next execution times (would need cron-parser or similar library)
    try {
      const cronParser = require('cron-parser');
      
      for (const [scheduleType, cronExpression] of Object.entries(this.config.schedules)) {
        if (this.config.enabledSchedules.includes(scheduleType)) {
          const interval = cronParser.parseExpression(cronExpression);
          status.nextExecution[scheduleType] = interval.next().toDate().toISOString();
        }
      }
      
      if (this.config.enabledSchedules.includes('cleanup')) {
        const cleanupInterval = cronParser.parseExpression(this.config.cleanupSchedule);
        status.nextExecution.cleanup = cleanupInterval.next().toDate().toISOString();
      }
      
    } catch (error) {
      this.logger.debug('Could not calculate next execution times', { error: error.message });
    }
    
    return status;
  }

  async getBackupStatistics() {
    try {
      const stats = await this.backupMetadata.getStatistics();
      
      // Add schedule-specific statistics
      const backups = await this.backupMetadata.listBackups();
      const scheduledBackups = backups.filter(backup => backup.scheduleType);
      
      const scheduleStats = {};
      for (const scheduleType of Object.keys(this.config.schedules)) {
        const typeBackups = scheduledBackups.filter(backup => backup.scheduleType === scheduleType);
        scheduleStats[scheduleType] = {
          count: typeBackups.length,
          totalSize: typeBackups.reduce((sum, backup) => sum + (backup.size || 0), 0),
          lastBackup: typeBackups.length > 0 ? typeBackups[0].timestamp : null
        };
      }
      
      return {
        ...stats,
        scheduled: scheduleStats,
        totalScheduledBackups: scheduledBackups.length
      };
      
    } catch (error) {
      this.logger.warn('Failed to get backup statistics', { error: error.message });
      return {};
    }
  }

  async updateSchedule(scheduleType, cronExpression) {
    try {
      // Stop existing task if running
      const taskName = `backup-${scheduleType}`;
      if (this.scheduledTasks.has(taskName)) {
        const existingTask = this.scheduledTasks.get(taskName);
        if (existingTask && typeof existingTask.stop === 'function') {
          existingTask.stop();
        }
        this.scheduledTasks.delete(taskName);
      }
      
      // Update configuration
      this.config.schedules[scheduleType] = cronExpression;
      
      // Reschedule if scheduler is running and schedule is enabled
      if (this.isRunning && this.config.enabledSchedules.includes(scheduleType)) {
        this.scheduleBackupTask(scheduleType);
      }
      
      this.logger.info(`Updated ${scheduleType} schedule`, { 
        newSchedule: cronExpression 
      });
      
    } catch (error) {
      this.logger.error(`Failed to update ${scheduleType} schedule`, { error: error.message });
      throw error;
    }
  }

  async enableSchedule(scheduleType) {
    if (!this.config.enabledSchedules.includes(scheduleType)) {
      this.config.enabledSchedules.push(scheduleType);
      
      if (this.isRunning) {
        if (scheduleType === 'cleanup') {
          this.scheduleCleanupTask();
        } else {
          this.scheduleBackupTask(scheduleType);
        }
      }
      
      this.logger.info(`Enabled ${scheduleType} schedule`);
    }
  }

  async disableSchedule(scheduleType) {
    const index = this.config.enabledSchedules.indexOf(scheduleType);
    if (index > -1) {
      this.config.enabledSchedules.splice(index, 1);
      
      // Stop the task if running
      const taskName = scheduleType === 'cleanup' ? 'cleanup' : `backup-${scheduleType}`;
      if (this.scheduledTasks.has(taskName)) {
        const task = this.scheduledTasks.get(taskName);
        if (task && typeof task.stop === 'function') {
          task.stop();
        }
        this.scheduledTasks.delete(taskName);
      }
      
      this.logger.info(`Disabled ${scheduleType} schedule`);
    }
  }
}

module.exports = { BackupScheduler };
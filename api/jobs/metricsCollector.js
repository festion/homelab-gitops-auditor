/**
 * Metrics Collection Scheduler
 * 
 * Automated scheduling and management of metric collection jobs with
 * configurable intervals, error handling, and health monitoring.
 */

const EventEmitter = require('events');

class MetricsCollectorScheduler extends EventEmitter {
    constructor(metricsService, config) {
        super();
        this.metricsService = metricsService;
        this.config = config;
        this.intervals = new Map();
        this.isRunning = false;
        this.lastRun = new Map();
        this.runCount = new Map();
        this.errorCount = new Map();
        
        // Default schedules (can be overridden by config)
        this.defaultSchedules = {
            // Repository metrics - every 5 minutes
            repository: {
                interval: 5 * 60 * 1000,
                collectors: ['repository'],
                enabled: true
            },
            // Pipeline metrics - every 3 minutes
            pipeline: {
                interval: 3 * 60 * 1000,
                collectors: ['pipeline'],
                enabled: true
            },
            // System metrics - every 1 minute
            system: {
                interval: 1 * 60 * 1000,
                collectors: ['system'],
                enabled: true
            },
            // Aggregation job - every 15 minutes
            aggregation: {
                interval: 15 * 60 * 1000,
                task: 'aggregate',
                enabled: true
            },
            // Cleanup job - every 6 hours
            cleanup: {
                interval: 6 * 60 * 60 * 1000,
                task: 'cleanup',
                enabled: true
            }
        };
    }

    /**
     * Start the scheduler
     */
    async start() {
        if (this.isRunning) {
            console.log('Metrics collector scheduler is already running');
            return;
        }

        try {
            await this.setupSchedules();
            this.isRunning = true;
            
            console.log('Metrics collector scheduler started');
            this.emit('scheduler:started');
        } catch (error) {
            console.error('Error starting metrics collector scheduler:', error);
            this.emit('scheduler:error', error);
            throw error;
        }
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('Metrics collector scheduler is not running');
            return;
        }

        // Clear all intervals
        for (const [name, intervalId] of this.intervals.entries()) {
            clearInterval(intervalId);
            console.log(`Stopped ${name} collection job`);
        }

        this.intervals.clear();
        this.isRunning = false;
        
        console.log('Metrics collector scheduler stopped');
        this.emit('scheduler:stopped');
    }

    /**
     * Setup scheduled jobs based on configuration
     */
    async setupSchedules() {
        const schedules = this.getScheduleConfig();
        
        for (const [name, schedule] of Object.entries(schedules)) {
            if (schedule.enabled) {
                await this.scheduleJob(name, schedule);
            } else {
                console.log(`Skipping disabled job: ${name}`);
            }
        }
    }

    /**
     * Schedule a specific job
     */
    async scheduleJob(name, schedule) {
        try {
            // Run initial collection
            if (schedule.immediate !== false) {
                await this.executeJob(name, schedule);
            }

            // Schedule recurring job
            const intervalId = setInterval(async () => {
                try {
                    await this.executeJob(name, schedule);
                } catch (error) {
                    console.error(`Error in scheduled job ${name}:`, error);
                    this.handleJobError(name, error);
                }
            }, schedule.interval);

            this.intervals.set(name, intervalId);
            console.log(`Scheduled ${name} job every ${schedule.interval}ms`);
            
            this.emit('job:scheduled', { name, schedule });
        } catch (error) {
            console.error(`Error scheduling job ${name}:`, error);
            this.emit('job:error', { name, error });
        }
    }

    /**
     * Execute a specific job
     */
    async executeJob(name, schedule) {
        const startTime = Date.now();
        
        try {
            console.log(`Executing ${name} job...`);
            
            let result;
            if (schedule.collectors) {
                // Collection job
                result = await this.metricsService.collectMetrics({
                    collectors: schedule.collectors
                });
            } else if (schedule.task) {
                // Task job
                result = await this.executeTask(schedule.task, schedule);
            } else {
                throw new Error(`Invalid job configuration for ${name}`);
            }

            const duration = Date.now() - startTime;
            this.recordJobSuccess(name, duration, result);
            
            console.log(`Completed ${name} job in ${duration}ms`);
            this.emit('job:completed', { name, duration, result });
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.recordJobError(name, duration, error);
            
            console.error(`Failed ${name} job after ${duration}ms:`, error);
            this.emit('job:failed', { name, duration, error });
            
            throw error;
        }
    }

    /**
     * Execute a specific task (aggregation, cleanup, etc.)
     */
    async executeTask(taskName, schedule) {
        switch (taskName) {
            case 'aggregate':
                return await this.metricsService.aggregateMetrics(schedule.options || {});
                
            case 'cleanup':
                return await this.metricsService.cleanupOldMetrics();
                
            case 'health_check':
                return this.performHealthCheck();
                
            default:
                throw new Error(`Unknown task: ${taskName}`);
        }
    }

    /**
     * Perform health check on the metrics system
     */
    async performHealthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            service: this.metricsService.getHealthStatus(),
            storage: await this.metricsService.storage.getStats(),
            scheduler: this.getSchedulerStats(),
            issues: []
        };

        // Check for issues
        if (!health.service.initialized) {
            health.issues.push('Metrics service not initialized');
        }

        if (!health.service.collecting) {
            health.issues.push('Metric collection not running');
        }

        if (health.storage.totalMetrics === 0) {
            health.issues.push('No metrics data found');
        }

        // Check error rates
        for (const [jobName, errorCount] of this.errorCount.entries()) {
            const runCount = this.runCount.get(jobName) || 0;
            if (runCount > 0 && (errorCount / runCount) > 0.5) {
                health.issues.push(`High error rate for ${jobName} job: ${Math.round((errorCount / runCount) * 100)}%`);
            }
        }

        this.emit('health:checked', health);
        return health;
    }

    /**
     * Handle job errors with retry logic
     */
    handleJobError(name, error) {
        const errorCount = this.errorCount.get(name) || 0;
        this.errorCount.set(name, errorCount + 1);

        // If too many errors, disable the job temporarily
        const runCount = this.runCount.get(name) || 0;
        if (runCount > 10 && (errorCount / runCount) > 0.8) {
            console.warn(`Temporarily disabling ${name} job due to high error rate`);
            this.pauseJob(name, 5 * 60 * 1000); // Pause for 5 minutes
        }
    }

    /**
     * Pause a job temporarily
     */
    pauseJob(name, duration) {
        if (this.intervals.has(name)) {
            clearInterval(this.intervals.get(name));
            this.intervals.delete(name);
            
            setTimeout(() => {
                const schedules = this.getScheduleConfig();
                if (schedules[name] && schedules[name].enabled) {
                    this.scheduleJob(name, schedules[name]);
                    console.log(`Resumed ${name} job after pause`);
                }
            }, duration);
            
            this.emit('job:paused', { name, duration });
        }
    }

    /**
     * Record successful job execution
     */
    recordJobSuccess(name, duration, result) {
        this.lastRun.set(name, {
            timestamp: new Date().toISOString(),
            duration,
            status: 'success',
            result: result ? { count: result.collected || result.count || 0 } : {}
        });
        
        const runCount = this.runCount.get(name) || 0;
        this.runCount.set(name, runCount + 1);
    }

    /**
     * Record failed job execution
     */
    recordJobError(name, duration, error) {
        this.lastRun.set(name, {
            timestamp: new Date().toISOString(),
            duration,
            status: 'error',
            error: error.message
        });
        
        const runCount = this.runCount.get(name) || 0;
        const errorCount = this.errorCount.get(name) || 0;
        
        this.runCount.set(name, runCount + 1);
        this.errorCount.set(name, errorCount + 1);
    }

    /**
     * Get schedule configuration
     */
    getScheduleConfig() {
        const configSchedules = this.config.get('METRICS_SCHEDULES', {});
        return { ...this.defaultSchedules, ...configSchedules };
    }

    /**
     * Get scheduler statistics
     */
    getSchedulerStats() {
        const stats = {
            isRunning: this.isRunning,
            activeJobs: this.intervals.size,
            totalRuns: 0,
            totalErrors: 0,
            jobs: {}
        };

        for (const [name, runCount] of this.runCount.entries()) {
            const errorCount = this.errorCount.get(name) || 0;
            const lastRun = this.lastRun.get(name);
            
            stats.totalRuns += runCount;
            stats.totalErrors += errorCount;
            
            stats.jobs[name] = {
                runs: runCount,
                errors: errorCount,
                errorRate: runCount > 0 ? Math.round((errorCount / runCount) * 100) : 0,
                lastRun,
                isActive: this.intervals.has(name)
            };
        }

        return stats;
    }

    /**
     * Update job schedule
     */
    updateJobSchedule(name, newSchedule) {
        if (this.intervals.has(name)) {
            clearInterval(this.intervals.get(name));
            this.intervals.delete(name);
        }

        if (newSchedule.enabled) {
            this.scheduleJob(name, newSchedule);
        }

        this.emit('job:updated', { name, schedule: newSchedule });
    }

    /**
     * Add a new job
     */
    addJob(name, schedule) {
        if (this.intervals.has(name)) {
            throw new Error(`Job ${name} already exists`);
        }

        this.scheduleJob(name, schedule);
        this.emit('job:added', { name, schedule });
    }

    /**
     * Remove a job
     */
    removeJob(name) {
        if (this.intervals.has(name)) {
            clearInterval(this.intervals.get(name));
            this.intervals.delete(name);
        }

        this.lastRun.delete(name);
        this.runCount.delete(name);
        this.errorCount.delete(name);

        this.emit('job:removed', { name });
    }

    /**
     * Force run a specific job
     */
    async runJob(name) {
        const schedules = this.getScheduleConfig();
        const schedule = schedules[name];
        
        if (!schedule) {
            throw new Error(`Job ${name} not found`);
        }

        return await this.executeJob(name, schedule);
    }

    /**
     * Get job status
     */
    getJobStatus(name) {
        return {
            name,
            isActive: this.intervals.has(name),
            lastRun: this.lastRun.get(name),
            runCount: this.runCount.get(name) || 0,
            errorCount: this.errorCount.get(name) || 0
        };
    }

    /**
     * List all jobs
     */
    listJobs() {
        const schedules = this.getScheduleConfig();
        const jobs = [];

        for (const [name, schedule] of Object.entries(schedules)) {
            jobs.push({
                name,
                schedule,
                status: this.getJobStatus(name)
            });
        }

        return jobs;
    }
}

module.exports = MetricsCollectorScheduler;
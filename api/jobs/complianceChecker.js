/**
 * Scheduled Compliance Checker
 * 
 * Provides automated compliance checking and reporting capabilities.
 * Runs on a schedule to monitor template compliance across repositories.
 */

const ComplianceService = require('../services/compliance/complianceService');
const EventEmitter = require('events');

class ComplianceChecker extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = config;
    this.complianceService = new ComplianceService(config, options);
    this.interval = options.interval || 24 * 60 * 60 * 1000; // 24 hours default
    this.enabled = options.enabled !== false;
    this.isRunning = false;
    this.timer = null;
    this.lastRun = null;
    this.nextRun = null;
    
    this.setupEventListeners();
  }

  /**
   * Start scheduled compliance checking
   */
  start() {
    if (!this.enabled) {
      console.log('📋 Compliance checker is disabled');
      return;
    }

    if (this.timer) {
      console.log('📋 Compliance checker is already running');
      return;
    }

    console.log(`📋 Starting compliance checker with ${this.interval / 1000 / 60 / 60}h interval`);
    
    // Run immediately on start
    this.runComplianceCheck();
    
    // Schedule recurring checks
    this.timer = setInterval(() => {
      this.runComplianceCheck();
    }, this.interval);

    this.emit('started');
  }

  /**
   * Stop scheduled compliance checking
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('📋 Compliance checker stopped');
      this.emit('stopped');
    }
  }

  /**
   * Run a single compliance check cycle
   */
  async runComplianceCheck() {
    if (this.isRunning) {
      console.log('📋 Compliance check already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();
    this.nextRun = new Date(Date.now() + this.interval);

    console.log('📋 Starting scheduled compliance check...');
    
    try {
      const startTime = Date.now();
      
      // Get all repositories
      const repositories = await this.complianceService.getMonitoredRepositories();
      console.log(`📋 Checking compliance for ${repositories.length} repositories`);

      // Trigger compliance check
      const result = await this.complianceService.triggerComplianceCheck({
        repositories,
        templates: [], // Use all enabled templates
        priority: 'scheduled'
      });

      // Wait for job completion (with timeout)
      const jobResult = await this.waitForJobCompletion(result.jobId, 300000); // 5 minute timeout

      const duration = Date.now() - startTime;
      
      if (jobResult.success) {
        console.log(`✅ Compliance check completed in ${Math.round(duration / 1000)}s`);
        
        // Generate compliance report
        const report = await this.generateComplianceReport(jobResult.results);
        
        // Emit events for dashboard updates
        this.emitComplianceEvents(report);
        
        // Check for critical issues
        await this.checkCriticalIssues(report);
        
      } else {
        console.error('❌ Compliance check failed:', jobResult.error);
        this.emit('check_failed', { error: jobResult.error, duration });
      }

    } catch (error) {
      console.error('❌ Error during compliance check:', error);
      this.emit('check_failed', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Wait for compliance job to complete
   */
  async waitForJobCompletion(jobId, timeout = 300000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = 5000; // Check every 5 seconds
      
      const check = () => {
        const job = this.complianceService.jobQueue.get(jobId);
        
        if (!job) {
          resolve({ success: false, error: 'Job not found' });
          return;
        }

        if (job.status === 'completed') {
          resolve({ 
            success: true, 
            results: job.results,
            progress: job.progress
          });
          return;
        }

        if (job.status === 'failed') {
          resolve({ 
            success: false, 
            error: job.error || 'Job failed',
            results: job.results
          });
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          resolve({ 
            success: false, 
            error: 'Job timeout',
            results: job.results
          });
          return;
        }

        // Continue checking
        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(jobResults) {
    const repositories = [];
    const summary = {
      totalRepositories: jobResults.length,
      compliantRepositories: 0,
      nonCompliantRepositories: 0,
      totalIssues: 0,
      criticalIssues: 0,
      averageScore: 0,
      complianceRate: 0,
      timestamp: new Date().toISOString()
    };

    let totalScore = 0;

    for (const result of jobResults) {
      if (result.success && result.compliance) {
        const repo = result.compliance;
        repositories.push(repo);

        if (repo.compliant) {
          summary.compliantRepositories++;
        } else {
          summary.nonCompliantRepositories++;
        }

        summary.totalIssues += repo.issues.length;
        summary.criticalIssues += repo.issues.filter(issue => issue.severity === 'high').length;
        totalScore += repo.score;
      }
    }

    if (summary.totalRepositories > 0) {
      summary.averageScore = Math.round(totalScore / summary.totalRepositories);
      summary.complianceRate = Math.round((summary.compliantRepositories / summary.totalRepositories) * 100);
    }

    return {
      summary,
      repositories,
      generatedAt: new Date().toISOString(),
      jobResults
    };
  }

  /**
   * Emit compliance events for real-time dashboard updates
   */
  emitComplianceEvents(report) {
    // Emit summary update
    this.emit('compliance_summary', {
      summary: report.summary,
      timestamp: report.generatedAt
    });

    // Emit repository updates
    report.repositories.forEach(repo => {
      this.emit('repository_compliance', {
        repository: repo.name,
        compliant: repo.compliant,
        score: repo.score,
        issues: repo.issues.length,
        lastChecked: repo.lastChecked
      });
    });

    // Emit trend data
    this.emit('compliance_trend', {
      complianceRate: report.summary.complianceRate,
      averageScore: report.summary.averageScore,
      totalIssues: report.summary.totalIssues,
      timestamp: report.generatedAt
    });
  }

  /**
   * Check for critical compliance issues that need immediate attention
   */
  async checkCriticalIssues(report) {
    const criticalThresholds = {
      complianceRate: 70, // Alert if overall compliance < 70%
      averageScore: 60,   // Alert if average score < 60
      criticalIssues: 10  // Alert if more than 10 critical issues
    };

    const alerts = [];

    // Check overall compliance rate
    if (report.summary.complianceRate < criticalThresholds.complianceRate) {
      alerts.push({
        type: 'low_compliance_rate',
        severity: 'high',
        message: `Overall compliance rate is ${report.summary.complianceRate}% (threshold: ${criticalThresholds.complianceRate}%)`,
        value: report.summary.complianceRate,
        threshold: criticalThresholds.complianceRate
      });
    }

    // Check average score
    if (report.summary.averageScore < criticalThresholds.averageScore) {
      alerts.push({
        type: 'low_average_score',
        severity: 'medium',
        message: `Average compliance score is ${report.summary.averageScore} (threshold: ${criticalThresholds.averageScore})`,
        value: report.summary.averageScore,
        threshold: criticalThresholds.averageScore
      });
    }

    // Check critical issues count
    if (report.summary.criticalIssues > criticalThresholds.criticalIssues) {
      alerts.push({
        type: 'high_critical_issues',
        severity: 'high',
        message: `${report.summary.criticalIssues} critical compliance issues found (threshold: ${criticalThresholds.criticalIssues})`,
        value: report.summary.criticalIssues,
        threshold: criticalThresholds.criticalIssues
      });
    }

    // Check for repositories with zero compliance
    const zeroeComplicanceRepos = report.repositories.filter(repo => repo.score === 0);
    if (zeroeComplicanceRepos.length > 0) {
      alerts.push({
        type: 'zero_compliance_repos',
        severity: 'critical',
        message: `${zeroeComplicanceRepos.length} repositories have zero compliance score`,
        repositories: zeroeComplicanceRepos.map(repo => repo.name),
        value: zeroeComplicanceRepos.length
      });
    }

    if (alerts.length > 0) {
      console.warn(`⚠️  ${alerts.length} compliance alerts generated`);
      alerts.forEach(alert => {
        console.warn(`   ${alert.severity.toUpperCase()}: ${alert.message}`);
      });

      this.emit('compliance_alerts', {
        alerts,
        timestamp: new Date().toISOString(),
        report: report.summary
      });
    } else {
      console.log('✅ No critical compliance issues detected');
    }

    return alerts;
  }

  /**
   * Setup event listeners for compliance service
   */
  setupEventListeners() {
    this.complianceService.on('compliance:job-progress', (data) => {
      this.emit('job_progress', data);
    });

    this.complianceService.on('compliance:job-completed', (data) => {
      this.emit('job_completed', data);
    });

    this.complianceService.on('compliance:job-failed', (data) => {
      this.emit('job_failed', data);
    });
  }

  /**
   * Get checker status and statistics
   */
  getStatus() {
    return {
      enabled: this.enabled,
      running: this.isRunning,
      interval: this.interval,
      intervalHours: this.interval / 1000 / 60 / 60,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      hasTimer: !!this.timer
    };
  }

  /**
   * Manually trigger a compliance check
   */
  async triggerManualCheck() {
    console.log('📋 Manual compliance check triggered');
    await this.runComplianceCheck();
  }

  /**
   * Update checker interval
   */
  updateInterval(newInterval) {
    this.interval = newInterval;
    this.nextRun = this.lastRun ? new Date(this.lastRun.getTime() + newInterval) : null;
    
    // Restart timer with new interval
    if (this.timer) {
      this.stop();
      this.start();
    }
    
    console.log(`📋 Compliance checker interval updated to ${newInterval / 1000 / 60 / 60}h`);
  }

  /**
   * Get compliance trends over time
   */
  async getComplianceTrends(days = 30) {
    // This would integrate with historical data storage
    // For now, return mock trend data
    const trends = {
      complianceRate: [85, 87, 82, 89, 91, 88, 90], // Last 7 days
      averageScore: [82, 84, 80, 86, 88, 85, 87],
      totalIssues: [25, 23, 28, 20, 18, 22, 19],
      period: 'last_7_days',
      generated: new Date().toISOString()
    };

    return trends;
  }
}

module.exports = ComplianceChecker;
/**
 * Pipeline Data Models
 * 
 * Defines data structures and validation for pipeline operations.
 */

/**
 * Pipeline status enumeration
 */
const PipelineStatus = {
  PENDING: 'pending',
  RUNNING: 'running', 
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled'
};

/**
 * Pipeline conclusion enumeration (GitHub-specific)
 */
const PipelineConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure', 
  NEUTRAL: 'neutral',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
  TIMED_OUT: 'timed_out',
  ACTION_REQUIRED: 'action_required'
};

/**
 * Pipeline Run Model
 */
class PipelineRun {
  constructor(data = {}) {
    this.id = data.id || null;
    this.repository = data.repository || '';
    this.branch = data.branch || 'main';
    this.status = data.status || PipelineStatus.PENDING;
    this.conclusion = data.conclusion || null;
    this.workflowName = data.workflowName || '';
    this.runId = data.runId || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.duration = data.duration || null;
    this.actor = data.actor || '';
    this.commitSha = data.commitSha || '';
    this.commitMessage = data.commitMessage || '';
    this.jobs = data.jobs || [];
    this.steps = data.steps || [];
    this.artifacts = data.artifacts || [];
  }

  /**
   * Calculate duration from start and end times
   */
  calculateDuration() {
    if (this.startedAt && this.completedAt) {
      const start = new Date(this.startedAt);
      const end = new Date(this.completedAt);
      this.duration = Math.round((end - start) / 1000); // Duration in seconds
    }
    return this.duration;
  }

  /**
   * Check if pipeline is currently running
   */
  isRunning() {
    return this.status === PipelineStatus.RUNNING;
  }

  /**
   * Check if pipeline completed successfully
   */
  isSuccessful() {
    return this.status === PipelineStatus.SUCCESS && this.conclusion === PipelineConclusion.SUCCESS;
  }

  /**
   * Check if pipeline failed
   */
  isFailed() {
    return this.status === PipelineStatus.FAILURE || 
           [PipelineConclusion.FAILURE, PipelineConclusion.TIMED_OUT].includes(this.conclusion);
  }

  /**
   * Get formatted duration string
   */
  getFormattedDuration() {
    if (!this.duration) return 'N/A';
    
    const minutes = Math.floor(this.duration / 60);
    const seconds = this.duration % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      id: this.id,
      repository: this.repository,
      branch: this.branch,
      status: this.status,
      conclusion: this.conclusion,
      workflowName: this.workflowName,
      runId: this.runId,
      lastRun: this.updatedAt,
      duration: this.duration,
      durationFormatted: this.getFormattedDuration(),
      actor: this.actor,
      commitSha: this.commitSha,
      commitMessage: this.commitMessage,
      steps: this.steps.slice(0, 10), // Limit steps for performance
      jobs: this.jobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        duration: job.duration
      }))
    };
  }
}

/**
 * Pipeline Metrics Model
 */
class PipelineMetrics {
  constructor(data = {}) {
    this.repository = data.repository || '';
    this.timeRange = data.timeRange || '30d';
    this.total = data.total || 0;
    this.successful = data.successful || 0;
    this.failed = data.failed || 0;
    this.cancelled = data.cancelled || 0;
    this.successRate = data.successRate || 0;
    this.failureRate = data.failureRate || 0;
    this.averageDuration = data.averageDuration || 0;
    this.medianDuration = data.medianDuration || 0;
    this.totalDuration = data.totalDuration || 0;
    this.trends = data.trends || {};
  }

  /**
   * Calculate success rate percentage
   */
  calculateSuccessRate() {
    if (this.total === 0) return 0;
    this.successRate = Math.round((this.successful / this.total) * 100);
    return this.successRate;
  }

  /**
   * Calculate failure rate percentage
   */
  calculateFailureRate() {
    if (this.total === 0) return 0;
    this.failureRate = Math.round((this.failed / this.total) * 100);
    return this.failureRate;
  }

  /**
   * Add pipeline run to metrics calculation
   */
  addRun(run) {
    this.total++;
    
    if (run.isSuccessful()) {
      this.successful++;
    } else if (run.isFailed()) {
      this.failed++;
    } else if (run.status === PipelineStatus.CANCELLED) {
      this.cancelled++;
    }

    if (run.duration) {
      this.totalDuration += run.duration;
      this.averageDuration = Math.round(this.totalDuration / this.total);
    }

    this.calculateSuccessRate();
    this.calculateFailureRate();
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      repository: this.repository,
      timeRange: this.timeRange,
      total: this.total,
      successful: this.successful,
      failed: this.failed,
      cancelled: this.cancelled,
      successRate: this.successRate,
      failureRate: this.failureRate,
      averageDuration: this.averageDuration,
      medianDuration: this.medianDuration,
      trends: this.trends
    };
  }
}

/**
 * Pipeline Cache Manager
 */
class PipelineCacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 60000; // 1 minute default TTL
  }

  /**
   * Set cache entry
   */
  set(key, value, customTTL = null) {
    const ttl = customTTL || this.ttl;
    const entry = {
      value,
      timestamp: Date.now(),
      ttl
    };

    // Clean up if cache is too large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, entry);
  }

  /**
   * Get cache entry
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Check if key exists and is valid
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete cache entry
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      hitRate: this.hitRate || 0
    };
  }
}

module.exports = {
  PipelineStatus,
  PipelineConclusion,
  PipelineRun,
  PipelineMetrics,
  PipelineCacheManager
};
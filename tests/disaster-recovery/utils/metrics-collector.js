/**
 * Metrics Collector for Disaster Recovery Testing
 * 
 * This utility collects, analyzes, and reports metrics from disaster recovery tests
 * to track performance, reliability, and compliance with recovery objectives.
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      recovery: [],
      backup: [],
      performance: [],
      reliability: [],
      compliance: []
    };
    this.sessions = new Map();
    this.thresholds = {
      rto: 30 * 60 * 1000, // 30 minutes in milliseconds
      rpo: 60 * 60 * 1000, // 1 hour in milliseconds
      integrityScore: 0.95, // 95% minimum integrity
      successRate: 0.99 // 99% success rate
    };
  }

  /**
   * Start a new metrics collection session
   * @param {string} testName - Name of the test
   * @param {Object} options - Session options
   * @returns {string} Session ID
   */
  startSession(testName, options = {}) {
    const sessionId = `${testName}-${Date.now()}`;
    
    const session = {
      id: sessionId,
      testName: testName,
      startTime: Date.now(),
      endTime: null,
      metrics: {},
      options: options,
      status: 'active'
    };
    
    this.sessions.set(sessionId, session);
    
    console.log(`📊 Started metrics collection session: ${sessionId}`);
    return sessionId;
  }

  /**
   * End a metrics collection session
   * @param {string} sessionId - Session ID
   */
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;
      session.status = 'completed';
      
      console.log(`📊 Ended metrics collection session: ${sessionId} (${session.duration}ms)`);
    }
  }

  /**
   * Record recovery metrics
   * @param {string} testType - Type of recovery test
   * @param {Object} metrics - Recovery metrics
   * @param {string} sessionId - Optional session ID
   */
  async recordRecoveryMetrics(testType, metrics, sessionId = null) {
    const timestamp = Date.now();
    
    const recoveryMetric = {
      timestamp: timestamp,
      testType: testType,
      sessionId: sessionId,
      ...metrics,
      // Calculate derived metrics
      rtoCompliant: metrics.recoveryDuration ? metrics.recoveryDuration <= this.thresholds.rto : null,
      rpoCompliant: metrics.dataLossWindow ? metrics.dataLossWindow <= this.thresholds.rpo : null,
      integrityCompliant: metrics.integrityScore ? metrics.integrityScore >= this.thresholds.integrityScore : null
    };
    
    this.metrics.recovery.push(recoveryMetric);
    
    // Add to session if provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metrics.recovery = session.metrics.recovery || [];
        session.metrics.recovery.push(recoveryMetric);
      }
    }
    
    this.emit('recovery-metric-recorded', recoveryMetric);
    
    console.log(`📊 Recorded recovery metrics for ${testType}`);
  }

  /**
   * Record backup metrics
   * @param {string} testType - Type of backup test
   * @param {Object} metrics - Backup metrics
   * @param {string} sessionId - Optional session ID
   */
  async recordBackupMetrics(testType, metrics, sessionId = null) {
    const timestamp = Date.now();
    
    const backupMetric = {
      timestamp: timestamp,
      testType: testType,
      sessionId: sessionId,
      ...metrics,
      // Calculate derived metrics
      backupEfficiency: metrics.size && metrics.duration ? metrics.size / metrics.duration : null,
      compressionRatio: metrics.originalSize && metrics.size ? metrics.originalSize / metrics.size : null
    };
    
    this.metrics.backup.push(backupMetric);
    
    // Add to session if provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metrics.backup = session.metrics.backup || [];
        session.metrics.backup.push(backupMetric);
      }
    }
    
    this.emit('backup-metric-recorded', backupMetric);
    
    console.log(`📊 Recorded backup metrics for ${testType}`);
  }

  /**
   * Record performance metrics
   * @param {string} testType - Type of performance test
   * @param {Object} metrics - Performance metrics
   * @param {string} sessionId - Optional session ID
   */
  async recordPerformanceMetrics(testType, metrics, sessionId = null) {
    const timestamp = Date.now();
    
    const performanceMetric = {
      timestamp: timestamp,
      testType: testType,
      sessionId: sessionId,
      ...metrics,
      // Calculate derived metrics
      throughput: metrics.requests && metrics.duration ? metrics.requests / (metrics.duration / 1000) : null,
      efficiency: metrics.successful && metrics.total ? metrics.successful / metrics.total : null
    };
    
    this.metrics.performance.push(performanceMetric);
    
    // Add to session if provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metrics.performance = session.metrics.performance || [];
        session.metrics.performance.push(performanceMetric);
      }
    }
    
    this.emit('performance-metric-recorded', performanceMetric);
    
    console.log(`📊 Recorded performance metrics for ${testType}`);
  }

  /**
   * Record reliability metrics
   * @param {string} testType - Type of reliability test
   * @param {Object} metrics - Reliability metrics
   * @param {string} sessionId - Optional session ID
   */
  async recordReliabilityMetrics(testType, metrics, sessionId = null) {
    const timestamp = Date.now();
    
    const reliabilityMetric = {
      timestamp: timestamp,
      testType: testType,
      sessionId: sessionId,
      ...metrics,
      // Calculate derived metrics
      mttr: metrics.failures && metrics.totalRecoveryTime ? metrics.totalRecoveryTime / metrics.failures : null,
      availability: metrics.uptime && metrics.totalTime ? metrics.uptime / metrics.totalTime : null
    };
    
    this.metrics.reliability.push(reliabilityMetric);
    
    // Add to session if provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metrics.reliability = session.metrics.reliability || [];
        session.metrics.reliability.push(reliabilityMetric);
      }
    }
    
    this.emit('reliability-metric-recorded', reliabilityMetric);
    
    console.log(`📊 Recorded reliability metrics for ${testType}`);
  }

  /**
   * Record compliance metrics
   * @param {string} testType - Type of compliance test
   * @param {Object} metrics - Compliance metrics
   * @param {string} sessionId - Optional session ID
   */
  async recordComplianceMetrics(testType, metrics, sessionId = null) {
    const timestamp = Date.now();
    
    const complianceMetric = {
      timestamp: timestamp,
      testType: testType,
      sessionId: sessionId,
      ...metrics,
      // Calculate derived metrics
      overallCompliance: this.calculateOverallCompliance(metrics)
    };
    
    this.metrics.compliance.push(complianceMetric);
    
    // Add to session if provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metrics.compliance = session.metrics.compliance || [];
        session.metrics.compliance.push(complianceMetric);
      }
    }
    
    this.emit('compliance-metric-recorded', complianceMetric);
    
    console.log(`📊 Recorded compliance metrics for ${testType}`);
  }

  /**
   * Calculate overall compliance score
   * @param {Object} metrics - Compliance metrics
   * @returns {number} Overall compliance score (0-1)
   */
  calculateOverallCompliance(metrics) {
    const factors = [];
    
    if (metrics.rtoCompliant !== undefined) {
      factors.push(metrics.rtoCompliant ? 1 : 0);
    }
    if (metrics.rpoCompliant !== undefined) {
      factors.push(metrics.rpoCompliant ? 1 : 0);
    }
    if (metrics.integrityCompliant !== undefined) {
      factors.push(metrics.integrityCompliant ? 1 : 0);
    }
    if (metrics.successRate !== undefined) {
      factors.push(metrics.successRate >= this.thresholds.successRate ? 1 : 0);
    }
    
    return factors.length > 0 ? factors.reduce((sum, factor) => sum + factor, 0) / factors.length : 0;
  }

  /**
   * Generate analytics report
   * @param {Object} options - Report options
   * @returns {Object} Analytics report
   */
  generateAnalyticsReport(options = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      period: options.period || 'all-time',
      summary: {},
      detailed: {},
      trends: {},
      recommendations: []
    };

    // Filter metrics by period if specified
    const filteredMetrics = this.filterMetricsByPeriod(options.period);

    // Generate summary
    report.summary = this.generateSummary(filteredMetrics);

    // Generate detailed analysis
    report.detailed = this.generateDetailedAnalysis(filteredMetrics);

    // Generate trends
    report.trends = this.generateTrends(filteredMetrics);

    // Generate recommendations
    report.recommendations = this.generateRecommendations(filteredMetrics);

    return report;
  }

  /**
   * Filter metrics by time period
   * @param {string} period - Time period (e.g., '24h', '7d', '30d')
   * @returns {Object} Filtered metrics
   */
  filterMetricsByPeriod(period) {
    if (!period || period === 'all-time') {
      return this.metrics;
    }

    const now = Date.now();
    let cutoff;

    switch (period) {
      case '1h':
        cutoff = now - (60 * 60 * 1000);
        break;
      case '24h':
        cutoff = now - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoff = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = 0;
    }

    const filtered = {};
    
    for (const [category, metrics] of Object.entries(this.metrics)) {
      filtered[category] = metrics.filter(metric => metric.timestamp >= cutoff);
    }

    return filtered;
  }

  /**
   * Generate summary statistics
   * @param {Object} metrics - Metrics to analyze
   * @returns {Object} Summary statistics
   */
  generateSummary(metrics) {
    const summary = {
      totalTests: 0,
      recovery: {
        totalTests: metrics.recovery.length,
        averageRecoveryTime: 0,
        rtoCompliance: 0,
        rpoCompliance: 0,
        averageIntegrityScore: 0
      },
      backup: {
        totalTests: metrics.backup.length,
        averageSize: 0,
        averageDuration: 0,
        successRate: 0
      },
      performance: {
        totalTests: metrics.performance.length,
        averageThroughput: 0,
        averageResponseTime: 0
      },
      reliability: {
        totalTests: metrics.reliability.length,
        averageMTTR: 0,
        averageAvailability: 0
      },
      compliance: {
        totalTests: metrics.compliance.length,
        overallCompliance: 0
      }
    };

    // Calculate recovery summary
    if (metrics.recovery.length > 0) {
      const recoveryTimes = metrics.recovery.map(m => m.recoveryDuration).filter(d => d !== undefined);
      summary.recovery.averageRecoveryTime = recoveryTimes.length > 0 ? 
        recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length : 0;
      
      summary.recovery.rtoCompliance = metrics.recovery.filter(m => m.rtoCompliant).length / metrics.recovery.length;
      summary.recovery.rpoCompliance = metrics.recovery.filter(m => m.rpoCompliant).length / metrics.recovery.length;
      
      const integrityScores = metrics.recovery.map(m => m.integrityScore).filter(s => s !== undefined);
      summary.recovery.averageIntegrityScore = integrityScores.length > 0 ?
        integrityScores.reduce((sum, score) => sum + score, 0) / integrityScores.length : 0;
    }

    // Calculate backup summary
    if (metrics.backup.length > 0) {
      const sizes = metrics.backup.map(m => m.size).filter(s => s !== undefined);
      summary.backup.averageSize = sizes.length > 0 ? 
        sizes.reduce((sum, size) => sum + size, 0) / sizes.length : 0;
      
      const durations = metrics.backup.map(m => m.duration).filter(d => d !== undefined);
      summary.backup.averageDuration = durations.length > 0 ?
        durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0;
      
      summary.backup.successRate = metrics.backup.filter(m => m.success).length / metrics.backup.length;
    }

    // Calculate performance summary
    if (metrics.performance.length > 0) {
      const throughputs = metrics.performance.map(m => m.throughput).filter(t => t !== undefined);
      summary.performance.averageThroughput = throughputs.length > 0 ?
        throughputs.reduce((sum, throughput) => sum + throughput, 0) / throughputs.length : 0;
      
      const responseTimes = metrics.performance.map(m => m.responseTime).filter(r => r !== undefined);
      summary.performance.averageResponseTime = responseTimes.length > 0 ?
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
    }

    // Calculate reliability summary
    if (metrics.reliability.length > 0) {
      const mttrs = metrics.reliability.map(m => m.mttr).filter(m => m !== undefined);
      summary.reliability.averageMTTR = mttrs.length > 0 ?
        mttrs.reduce((sum, mttr) => sum + mttr, 0) / mttrs.length : 0;
      
      const availabilities = metrics.reliability.map(m => m.availability).filter(a => a !== undefined);
      summary.reliability.averageAvailability = availabilities.length > 0 ?
        availabilities.reduce((sum, availability) => sum + availability, 0) / availabilities.length : 0;
    }

    // Calculate compliance summary
    if (metrics.compliance.length > 0) {
      const compliances = metrics.compliance.map(m => m.overallCompliance).filter(c => c !== undefined);
      summary.compliance.overallCompliance = compliances.length > 0 ?
        compliances.reduce((sum, compliance) => sum + compliance, 0) / compliances.length : 0;
    }

    // Calculate total tests
    summary.totalTests = Object.values(summary).reduce((sum, category) => {
      return sum + (category.totalTests || 0);
    }, 0);

    return summary;
  }

  /**
   * Generate detailed analysis
   * @param {Object} metrics - Metrics to analyze
   * @returns {Object} Detailed analysis
   */
  generateDetailedAnalysis(metrics) {
    const analysis = {
      recovery: this.analyzeRecoveryMetrics(metrics.recovery),
      backup: this.analyzeBackupMetrics(metrics.backup),
      performance: this.analyzePerformanceMetrics(metrics.performance),
      reliability: this.analyzeReliabilityMetrics(metrics.reliability),
      compliance: this.analyzeComplianceMetrics(metrics.compliance)
    };

    return analysis;
  }

  /**
   * Analyze recovery metrics
   * @param {Array} recoveryMetrics - Recovery metrics
   * @returns {Object} Recovery analysis
   */
  analyzeRecoveryMetrics(recoveryMetrics) {
    const analysis = {
      testTypes: {},
      rtoAnalysis: {},
      rpoAnalysis: {},
      integrityAnalysis: {}
    };

    // Group by test type
    for (const metric of recoveryMetrics) {
      if (!analysis.testTypes[metric.testType]) {
        analysis.testTypes[metric.testType] = [];
      }
      analysis.testTypes[metric.testType].push(metric);
    }

    // Analyze RTO compliance
    const rtoMetrics = recoveryMetrics.filter(m => m.recoveryDuration !== undefined);
    if (rtoMetrics.length > 0) {
      analysis.rtoAnalysis = {
        compliant: rtoMetrics.filter(m => m.rtoCompliant).length,
        nonCompliant: rtoMetrics.filter(m => !m.rtoCompliant).length,
        averageTime: rtoMetrics.reduce((sum, m) => sum + m.recoveryDuration, 0) / rtoMetrics.length,
        maxTime: Math.max(...rtoMetrics.map(m => m.recoveryDuration)),
        minTime: Math.min(...rtoMetrics.map(m => m.recoveryDuration))
      };
    }

    // Analyze RPO compliance
    const rpoMetrics = recoveryMetrics.filter(m => m.dataLossWindow !== undefined);
    if (rpoMetrics.length > 0) {
      analysis.rpoAnalysis = {
        compliant: rpoMetrics.filter(m => m.rpoCompliant).length,
        nonCompliant: rpoMetrics.filter(m => !m.rpoCompliant).length,
        averageWindow: rpoMetrics.reduce((sum, m) => sum + m.dataLossWindow, 0) / rpoMetrics.length,
        maxWindow: Math.max(...rpoMetrics.map(m => m.dataLossWindow)),
        minWindow: Math.min(...rpoMetrics.map(m => m.dataLossWindow))
      };
    }

    // Analyze integrity scores
    const integrityMetrics = recoveryMetrics.filter(m => m.integrityScore !== undefined);
    if (integrityMetrics.length > 0) {
      analysis.integrityAnalysis = {
        compliant: integrityMetrics.filter(m => m.integrityCompliant).length,
        nonCompliant: integrityMetrics.filter(m => !m.integrityCompliant).length,
        averageScore: integrityMetrics.reduce((sum, m) => sum + m.integrityScore, 0) / integrityMetrics.length,
        maxScore: Math.max(...integrityMetrics.map(m => m.integrityScore)),
        minScore: Math.min(...integrityMetrics.map(m => m.integrityScore))
      };
    }

    return analysis;
  }

  /**
   * Analyze backup metrics
   * @param {Array} backupMetrics - Backup metrics
   * @returns {Object} Backup analysis
   */
  analyzeBackupMetrics(backupMetrics) {
    const analysis = {
      testTypes: {},
      sizeAnalysis: {},
      durationAnalysis: {},
      successAnalysis: {}
    };

    // Group by test type
    for (const metric of backupMetrics) {
      if (!analysis.testTypes[metric.testType]) {
        analysis.testTypes[metric.testType] = [];
      }
      analysis.testTypes[metric.testType].push(metric);
    }

    // Analyze backup sizes
    const sizeMetrics = backupMetrics.filter(m => m.size !== undefined);
    if (sizeMetrics.length > 0) {
      analysis.sizeAnalysis = {
        averageSize: sizeMetrics.reduce((sum, m) => sum + m.size, 0) / sizeMetrics.length,
        maxSize: Math.max(...sizeMetrics.map(m => m.size)),
        minSize: Math.min(...sizeMetrics.map(m => m.size)),
        totalSize: sizeMetrics.reduce((sum, m) => sum + m.size, 0)
      };
    }

    // Analyze backup durations
    const durationMetrics = backupMetrics.filter(m => m.duration !== undefined);
    if (durationMetrics.length > 0) {
      analysis.durationAnalysis = {
        averageDuration: durationMetrics.reduce((sum, m) => sum + m.duration, 0) / durationMetrics.length,
        maxDuration: Math.max(...durationMetrics.map(m => m.duration)),
        minDuration: Math.min(...durationMetrics.map(m => m.duration))
      };
    }

    // Analyze success rates
    const successMetrics = backupMetrics.filter(m => m.success !== undefined);
    if (successMetrics.length > 0) {
      analysis.successAnalysis = {
        successful: successMetrics.filter(m => m.success).length,
        failed: successMetrics.filter(m => !m.success).length,
        successRate: successMetrics.filter(m => m.success).length / successMetrics.length
      };
    }

    return analysis;
  }

  /**
   * Analyze performance metrics
   * @param {Array} performanceMetrics - Performance metrics
   * @returns {Object} Performance analysis
   */
  analyzePerformanceMetrics(performanceMetrics) {
    const analysis = {
      testTypes: {},
      throughputAnalysis: {},
      responseTimeAnalysis: {}
    };

    // Group by test type
    for (const metric of performanceMetrics) {
      if (!analysis.testTypes[metric.testType]) {
        analysis.testTypes[metric.testType] = [];
      }
      analysis.testTypes[metric.testType].push(metric);
    }

    // Analyze throughput
    const throughputMetrics = performanceMetrics.filter(m => m.throughput !== undefined);
    if (throughputMetrics.length > 0) {
      analysis.throughputAnalysis = {
        averageThroughput: throughputMetrics.reduce((sum, m) => sum + m.throughput, 0) / throughputMetrics.length,
        maxThroughput: Math.max(...throughputMetrics.map(m => m.throughput)),
        minThroughput: Math.min(...throughputMetrics.map(m => m.throughput))
      };
    }

    // Analyze response times
    const responseTimeMetrics = performanceMetrics.filter(m => m.responseTime !== undefined);
    if (responseTimeMetrics.length > 0) {
      analysis.responseTimeAnalysis = {
        averageResponseTime: responseTimeMetrics.reduce((sum, m) => sum + m.responseTime, 0) / responseTimeMetrics.length,
        maxResponseTime: Math.max(...responseTimeMetrics.map(m => m.responseTime)),
        minResponseTime: Math.min(...responseTimeMetrics.map(m => m.responseTime))
      };
    }

    return analysis;
  }

  /**
   * Analyze reliability metrics
   * @param {Array} reliabilityMetrics - Reliability metrics
   * @returns {Object} Reliability analysis
   */
  analyzeReliabilityMetrics(reliabilityMetrics) {
    const analysis = {
      testTypes: {},
      mttrAnalysis: {},
      availabilityAnalysis: {}
    };

    // Group by test type
    for (const metric of reliabilityMetrics) {
      if (!analysis.testTypes[metric.testType]) {
        analysis.testTypes[metric.testType] = [];
      }
      analysis.testTypes[metric.testType].push(metric);
    }

    // Analyze MTTR
    const mttrMetrics = reliabilityMetrics.filter(m => m.mttr !== undefined);
    if (mttrMetrics.length > 0) {
      analysis.mttrAnalysis = {
        averageMTTR: mttrMetrics.reduce((sum, m) => sum + m.mttr, 0) / mttrMetrics.length,
        maxMTTR: Math.max(...mttrMetrics.map(m => m.mttr)),
        minMTTR: Math.min(...mttrMetrics.map(m => m.mttr))
      };
    }

    // Analyze availability
    const availabilityMetrics = reliabilityMetrics.filter(m => m.availability !== undefined);
    if (availabilityMetrics.length > 0) {
      analysis.availabilityAnalysis = {
        averageAvailability: availabilityMetrics.reduce((sum, m) => sum + m.availability, 0) / availabilityMetrics.length,
        maxAvailability: Math.max(...availabilityMetrics.map(m => m.availability)),
        minAvailability: Math.min(...availabilityMetrics.map(m => m.availability))
      };
    }

    return analysis;
  }

  /**
   * Analyze compliance metrics
   * @param {Array} complianceMetrics - Compliance metrics
   * @returns {Object} Compliance analysis
   */
  analyzeComplianceMetrics(complianceMetrics) {
    const analysis = {
      testTypes: {},
      complianceAnalysis: {}
    };

    // Group by test type
    for (const metric of complianceMetrics) {
      if (!analysis.testTypes[metric.testType]) {
        analysis.testTypes[metric.testType] = [];
      }
      analysis.testTypes[metric.testType].push(metric);
    }

    // Analyze overall compliance
    const complianceScores = complianceMetrics.filter(m => m.overallCompliance !== undefined);
    if (complianceScores.length > 0) {
      analysis.complianceAnalysis = {
        averageCompliance: complianceScores.reduce((sum, m) => sum + m.overallCompliance, 0) / complianceScores.length,
        maxCompliance: Math.max(...complianceScores.map(m => m.overallCompliance)),
        minCompliance: Math.min(...complianceScores.map(m => m.overallCompliance)),
        compliantTests: complianceScores.filter(m => m.overallCompliance >= 0.95).length
      };
    }

    return analysis;
  }

  /**
   * Generate trend analysis
   * @param {Object} metrics - Metrics to analyze
   * @returns {Object} Trend analysis
   */
  generateTrends(metrics) {
    const trends = {
      recovery: this.calculateTrend(metrics.recovery, 'recoveryDuration'),
      backup: this.calculateTrend(metrics.backup, 'duration'),
      performance: this.calculateTrend(metrics.performance, 'throughput'),
      reliability: this.calculateTrend(metrics.reliability, 'availability'),
      compliance: this.calculateTrend(metrics.compliance, 'overallCompliance')
    };

    return trends;
  }

  /**
   * Calculate trend for a metric
   * @param {Array} metrics - Metrics array
   * @param {string} field - Field to analyze
   * @returns {Object} Trend analysis
   */
  calculateTrend(metrics, field) {
    const values = metrics.map(m => m[field]).filter(v => v !== undefined);
    
    if (values.length < 2) {
      return { trend: 'insufficient-data', slope: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, y) => sum + y, 0);
    const sumXY = values.reduce((sum, y, i) => sum + (i * y), 0);
    const sumX2 = values.reduce((sum, _, i) => sum + (i * i), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    let trend;
    if (Math.abs(slope) < 0.001) {
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'improving';
    } else {
      trend = 'declining';
    }

    return { trend, slope };
  }

  /**
   * Generate recommendations
   * @param {Object} metrics - Metrics to analyze
   * @returns {Array} Recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Recovery recommendations
    const recoveryMetrics = metrics.recovery;
    if (recoveryMetrics.length > 0) {
      const rtoViolations = recoveryMetrics.filter(m => !m.rtoCompliant).length;
      if (rtoViolations > 0) {
        recommendations.push({
          category: 'recovery',
          priority: 'high',
          message: `${rtoViolations} RTO violations detected. Consider improving recovery automation.`
        });
      }

      const lowIntegrityTests = recoveryMetrics.filter(m => m.integrityScore < 0.90).length;
      if (lowIntegrityTests > 0) {
        recommendations.push({
          category: 'recovery',
          priority: 'medium',
          message: `${lowIntegrityTests} tests with low integrity scores. Review backup verification procedures.`
        });
      }
    }

    // Backup recommendations
    const backupMetrics = metrics.backup;
    if (backupMetrics.length > 0) {
      const failedBackups = backupMetrics.filter(m => !m.success).length;
      if (failedBackups > 0) {
        recommendations.push({
          category: 'backup',
          priority: 'high',
          message: `${failedBackups} backup failures detected. Investigate backup system reliability.`
        });
      }
    }

    // Performance recommendations
    const performanceMetrics = metrics.performance;
    if (performanceMetrics.length > 0) {
      const lowThroughput = performanceMetrics.filter(m => m.throughput < 100).length;
      if (lowThroughput > 0) {
        recommendations.push({
          category: 'performance',
          priority: 'medium',
          message: `${lowThroughput} tests with low throughput. Consider performance optimization.`
        });
      }
    }

    return recommendations;
  }

  /**
   * Save metrics to file
   * @param {string} filePath - File path to save metrics
   */
  async saveMetrics(filePath) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        metrics: this.metrics,
        sessions: Array.from(this.sessions.values()),
        thresholds: this.thresholds
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`📊 Metrics saved to ${filePath}`);
    } catch (error) {
      console.error('❌ Error saving metrics:', error.message);
      throw error;
    }
  }

  /**
   * Load metrics from file
   * @param {string} filePath - File path to load metrics from
   */
  async loadMetrics(filePath) {
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      this.metrics = data.metrics || this.metrics;
      this.thresholds = data.thresholds || this.thresholds;
      
      if (data.sessions) {
        this.sessions.clear();
        for (const session of data.sessions) {
          this.sessions.set(session.id, session);
        }
      }

      console.log(`📊 Metrics loaded from ${filePath}`);
    } catch (error) {
      console.error('❌ Error loading metrics:', error.message);
      throw error;
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = {
      recovery: [],
      backup: [],
      performance: [],
      reliability: [],
      compliance: []
    };
    this.sessions.clear();
    console.log('📊 All metrics cleared');
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    const summary = {
      recovery: this.metrics.recovery.length,
      backup: this.metrics.backup.length,
      performance: this.metrics.performance.length,
      reliability: this.metrics.reliability.length,
      compliance: this.metrics.compliance.length,
      sessions: this.sessions.size
    };

    return summary;
  }
}

module.exports = { MetricsCollector };
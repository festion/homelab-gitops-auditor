const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      resultsDir: options.resultsDir || global.PERFORMANCE_TEST_CONFIG?.resultsDir || path.join(__dirname, '../results'),
      enablePersistence: options.enablePersistence !== false,
      maxResults: options.maxResults || 1000,
      ...options
    };
    
    this.results = new Map();
    this.testMetrics = new Map();
    this.sessionId = this.generateSessionId();
    
    this.ensureResultsDirectory();
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  ensureResultsDirectory() {
    if (!fs.existsSync(this.options.resultsDir)) {
      fs.mkdirSync(this.options.resultsDir, { recursive: true });
    }
  }

  async recordTestResults(testName, results) {
    const timestamp = Date.now();
    const testId = `${testName}-${timestamp}`;
    
    const testResult = {
      testId,
      testName,
      sessionId: this.sessionId,
      timestamp,
      results,
      metadata: {
        environment: this.getEnvironmentInfo(),
        configuration: this.getTestConfiguration(),
        system: this.getSystemInfo()
      }
    };
    
    // Store in memory
    this.results.set(testId, testResult);
    
    // Update test metrics
    this.updateTestMetrics(testName, results);
    
    // Persist to disk if enabled
    if (this.options.enablePersistence) {
      await this.persistResults(testId, testResult);
    }
    
    // Emit event
    this.emit('results_recorded', testResult);
    
    console.log(`📊 Test results recorded: ${testName}`);
    console.log(`   Average Response Time: ${results.averageResponseTime}ms`);
    console.log(`   Throughput: ${results.throughput} RPS`);
    console.log(`   Error Rate: ${(results.errorRate * 100).toFixed(2)}%`);
    
    return testResult;
  }

  async recordMetrics(testName, metrics) {
    const timestamp = Date.now();
    const metricsId = `${testName}-metrics-${timestamp}`;
    
    const metricsResult = {
      metricsId,
      testName,
      sessionId: this.sessionId,
      timestamp,
      metrics,
      type: 'metrics'
    };
    
    // Store in memory
    this.results.set(metricsId, metricsResult);
    
    // Persist to disk if enabled
    if (this.options.enablePersistence) {
      await this.persistResults(metricsId, metricsResult);
    }
    
    // Emit event
    this.emit('metrics_recorded', metricsResult);
    
    return metricsResult;
  }

  async persistResults(resultId, result) {
    try {
      const filePath = path.join(this.options.resultsDir, `${resultId}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(result, null, 2));
      
      // Also write to session file
      const sessionFilePath = path.join(this.options.resultsDir, `${this.sessionId}.json`);
      await this.appendToSessionFile(sessionFilePath, result);
      
    } catch (error) {
      console.error('❌ Failed to persist results:', error.message);
      this.emit('persistence_error', error);
    }
  }

  async appendToSessionFile(sessionFilePath, result) {
    try {
      let sessionData = { sessionId: this.sessionId, results: [] };
      
      // Read existing session data
      if (fs.existsSync(sessionFilePath)) {
        const content = await fs.promises.readFile(sessionFilePath, 'utf8');
        sessionData = JSON.parse(content);
      }
      
      // Add new result
      sessionData.results.push(result);
      
      // Write back
      await fs.promises.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));
      
    } catch (error) {
      console.error('❌ Failed to append to session file:', error.message);
    }
  }

  updateTestMetrics(testName, results) {
    if (!this.testMetrics.has(testName)) {
      this.testMetrics.set(testName, {
        testName,
        runCount: 0,
        totalDuration: 0,
        totalRequests: 0,
        totalErrors: 0,
        responseTimes: [],
        throughputs: [],
        errorRates: [],
        performanceScores: [],
        firstRun: null,
        lastRun: null
      });
    }
    
    const metrics = this.testMetrics.get(testName);
    
    // Update metrics
    metrics.runCount++;
    metrics.totalDuration += results.duration || 0;
    metrics.totalRequests += results.totalRequests || 0;
    metrics.totalErrors += results.failedRequests || 0;
    
    if (results.averageResponseTime) {
      metrics.responseTimes.push(results.averageResponseTime);
    }
    
    if (results.throughput) {
      metrics.throughputs.push(results.throughput);
    }
    
    if (results.errorRate !== undefined) {
      metrics.errorRates.push(results.errorRate);
    }
    
    if (results.performanceScore !== undefined) {
      metrics.performanceScores.push(results.performanceScore);
    }
    
    // Update timestamps
    if (!metrics.firstRun) {
      metrics.firstRun = Date.now();
    }
    metrics.lastRun = Date.now();
    
    // Calculate derived metrics
    metrics.averageResponseTime = metrics.responseTimes.reduce((sum, time) => sum + time, 0) / metrics.responseTimes.length;
    metrics.averageThroughput = metrics.throughputs.reduce((sum, tp) => sum + tp, 0) / metrics.throughputs.length;
    metrics.averageErrorRate = metrics.errorRates.reduce((sum, er) => sum + er, 0) / metrics.errorRates.length;
    metrics.averagePerformanceScore = metrics.performanceScores.reduce((sum, ps) => sum + ps, 0) / metrics.performanceScores.length;
    
    // Performance trends
    metrics.performanceTrend = this.calculatePerformanceTrend(metrics);
    
    this.testMetrics.set(testName, metrics);
  }

  calculatePerformanceTrend(metrics) {
    if (metrics.performanceScores.length < 2) {
      return 'stable';
    }
    
    const recent = metrics.performanceScores.slice(-3);
    const older = metrics.performanceScores.slice(0, Math.max(1, metrics.performanceScores.length - 3));
    
    const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
    const olderAvg = older.reduce((sum, score) => sum + score, 0) / older.length;
    
    const difference = recentAvg - olderAvg;
    
    if (difference > 5) {
      return 'improving';
    } else if (difference < -5) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require('os').cpus().length,
      totalMemory: require('os').totalmem(),
      freeMemory: require('os').freemem(),
      uptime: require('os').uptime(),
      loadAverage: require('os').loadavg()
    };
  }

  getTestConfiguration() {
    return {
      baseUrl: global.PERFORMANCE_TEST_CONFIG?.baseUrl,
      thresholds: global.PERFORMANCE_TEST_CONFIG?.thresholds,
      testDuration: global.PERFORMANCE_TEST_CONFIG?.testDuration,
      metricsInterval: global.PERFORMANCE_TEST_CONFIG?.metricsInterval
    };
  }

  getSystemInfo() {
    try {
      const { execSync } = require('child_process');
      
      return {
        hostname: require('os').hostname(),
        userInfo: require('os').userInfo(),
        networkInterfaces: require('os').networkInterfaces(),
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    } catch (error) {
      return {
        hostname: 'unknown',
        error: error.message
      };
    }
  }

  getAllResults() {
    const results = {};
    
    for (const [testId, result] of this.results) {
      if (result.type !== 'metrics') {
        results[result.testName] = result.results;
      }
    }
    
    return results;
  }

  getTestMetrics(testName) {
    return this.testMetrics.get(testName);
  }

  getAllTestMetrics() {
    const metrics = {};
    
    for (const [testName, testMetrics] of this.testMetrics) {
      metrics[testName] = testMetrics;
    }
    
    return metrics;
  }

  getResultsForTest(testName) {
    const testResults = [];
    
    for (const [testId, result] of this.results) {
      if (result.testName === testName && result.type !== 'metrics') {
        testResults.push(result);
      }
    }
    
    return testResults.sort((a, b) => a.timestamp - b.timestamp);
  }

  async loadPreviousResults() {
    try {
      const files = await fs.promises.readdir(this.options.resultsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json') && !file.includes('session-'));
      
      console.log(`📂 Loading ${jsonFiles.length} previous results...`);
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.options.resultsDir, file);
          const content = await fs.promises.readFile(filePath, 'utf8');
          const result = JSON.parse(content);
          
          if (result.testName && result.results) {
            this.results.set(result.testId, result);
            this.updateTestMetrics(result.testName, result.results);
          }
        } catch (error) {
          console.warn(`⚠️  Failed to load result file ${file}:`, error.message);
        }
      }
      
      console.log(`📊 Loaded results for ${this.testMetrics.size} tests`);
      
    } catch (error) {
      console.error('❌ Failed to load previous results:', error.message);
    }
  }

  async generateSummaryReport() {
    const allMetrics = this.getAllTestMetrics();
    const summary = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      testSummary: {
        totalTests: Object.keys(allMetrics).length,
        totalRuns: Object.values(allMetrics).reduce((sum, metrics) => sum + metrics.runCount, 0),
        totalRequests: Object.values(allMetrics).reduce((sum, metrics) => sum + metrics.totalRequests, 0),
        totalErrors: Object.values(allMetrics).reduce((sum, metrics) => sum + metrics.totalErrors, 0)
      },
      performanceSummary: {
        averageResponseTime: this.calculateGlobalAverage(allMetrics, 'averageResponseTime'),
        averageThroughput: this.calculateGlobalAverage(allMetrics, 'averageThroughput'),
        averageErrorRate: this.calculateGlobalAverage(allMetrics, 'averageErrorRate'),
        averagePerformanceScore: this.calculateGlobalAverage(allMetrics, 'averagePerformanceScore')
      },
      testDetails: allMetrics,
      recommendations: this.generateRecommendations(allMetrics),
      environment: this.getEnvironmentInfo(),
      configuration: this.getTestConfiguration()
    };
    
    // Save summary report
    const summaryPath = path.join(this.options.resultsDir, `summary-${this.sessionId}.json`);
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log(`📋 Summary report generated: ${summaryPath}`);
    
    return summary;
  }

  calculateGlobalAverage(allMetrics, property) {
    const values = Object.values(allMetrics)
      .map(metrics => metrics[property])
      .filter(value => value !== undefined && !isNaN(value));
    
    if (values.length === 0) return 0;
    
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  generateRecommendations(allMetrics) {
    const recommendations = [];
    
    // Performance recommendations
    for (const [testName, metrics] of Object.entries(allMetrics)) {
      if (metrics.averageResponseTime > 1000) {
        recommendations.push({
          test: testName,
          type: 'performance',
          severity: 'high',
          message: `High response time detected (${metrics.averageResponseTime}ms). Consider optimizing the endpoint.`,
          suggestion: 'Review database queries, add caching, or optimize business logic.'
        });
      }
      
      if (metrics.averageErrorRate > 0.05) {
        recommendations.push({
          test: testName,
          type: 'reliability',
          severity: 'high',
          message: `High error rate detected (${(metrics.averageErrorRate * 100).toFixed(1)}%). System may be unstable under load.`,
          suggestion: 'Review error logs, improve error handling, or increase resource limits.'
        });
      }
      
      if (metrics.averageThroughput < 10) {
        recommendations.push({
          test: testName,
          type: 'scalability',
          severity: 'medium',
          message: `Low throughput detected (${metrics.averageThroughput} RPS). System may not handle expected load.`,
          suggestion: 'Consider horizontal scaling, connection pooling, or performance tuning.'
        });
      }
      
      if (metrics.performanceTrend === 'degrading') {
        recommendations.push({
          test: testName,
          type: 'trend',
          severity: 'medium',
          message: 'Performance is degrading over time. This may indicate resource leaks or system drift.',
          suggestion: 'Monitor system resources, check for memory leaks, and review recent changes.'
        });
      }
    }
    
    return recommendations;
  }

  async cleanup() {
    // Clean up old results to prevent disk space issues
    try {
      const files = await fs.promises.readdir(this.options.resultsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      if (jsonFiles.length > this.options.maxResults) {
        // Sort by creation time and remove oldest
        const fileStats = await Promise.all(
          jsonFiles.map(async (file) => {
            const filePath = path.join(this.options.resultsDir, file);
            const stats = await fs.promises.stat(filePath);
            return { file, birthtime: stats.birthtime };
          })
        );
        
        const sortedFiles = fileStats.sort((a, b) => a.birthtime - b.birthtime);
        const filesToDelete = sortedFiles.slice(0, jsonFiles.length - this.options.maxResults);
        
        for (const { file } of filesToDelete) {
          const filePath = path.join(this.options.resultsDir, file);
          await fs.promises.unlink(filePath);
        }
        
        console.log(`🗑️  Cleaned up ${filesToDelete.length} old result files`);
      }
    } catch (error) {
      console.error('❌ Failed to cleanup old results:', error.message);
    }
    
    // Clear memory
    this.results.clear();
    this.testMetrics.clear();
    
    // Remove event listeners
    this.removeAllListeners();
  }

  // Static methods for analyzing results
  static async analyzeResultsDirectory(resultsDir) {
    const files = await fs.promises.readdir(resultsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const analysis = {
      totalFiles: jsonFiles.length,
      testTypes: new Set(),
      dateRange: { earliest: null, latest: null },
      performanceMetrics: []
    };
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(resultsDir, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        const result = JSON.parse(content);
        
        if (result.testName) {
          analysis.testTypes.add(result.testName);
        }
        
        if (result.timestamp) {
          if (!analysis.dateRange.earliest || result.timestamp < analysis.dateRange.earliest) {
            analysis.dateRange.earliest = result.timestamp;
          }
          if (!analysis.dateRange.latest || result.timestamp > analysis.dateRange.latest) {
            analysis.dateRange.latest = result.timestamp;
          }
        }
        
        if (result.results) {
          analysis.performanceMetrics.push({
            testName: result.testName,
            timestamp: result.timestamp,
            averageResponseTime: result.results.averageResponseTime,
            throughput: result.results.throughput,
            errorRate: result.results.errorRate,
            performanceScore: result.results.performanceScore
          });
        }
      } catch (error) {
        console.warn(`⚠️  Failed to analyze result file ${file}:`, error.message);
      }
    }
    
    analysis.testTypes = Array.from(analysis.testTypes);
    
    return analysis;
  }
}

module.exports = { MetricsCollector };
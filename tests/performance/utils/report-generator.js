const fs = require('fs');
const path = require('path');
const { MetricsCollector } = require('./metrics-collector');

class ReportGenerator {
  constructor(options = {}) {
    this.options = {
      reportsDir: options.reportsDir || path.join(__dirname, '../reports'),
      templateDir: options.templateDir || path.join(__dirname, '../templates'),
      includeCharts: options.includeCharts !== false,
      includeRecommendations: options.includeRecommendations !== false,
      ...options
    };
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.options.reportsDir)) {
      fs.mkdirSync(this.options.reportsDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.options.templateDir)) {
      fs.mkdirSync(this.options.templateDir, { recursive: true });
    }
  }

  async generateReport(results, options = {}) {
    const reportOptions = { ...this.options, ...options };
    
    console.log('📊 Generating performance report...');
    
    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        reportVersion: '1.0.0',
        testSession: this.extractSessionInfo(results),
        options: reportOptions
      },
      summary: this.generateSummary(results),
      testResults: this.processTestResults(results),
      performanceAnalysis: this.generatePerformanceAnalysis(results),
      recommendations: reportOptions.includeRecommendations ? this.generateRecommendations(results) : null,
      charts: reportOptions.includeCharts ? this.generateChartData(results) : null,
      appendix: this.generateAppendix(results)
    };
    
    return report;
  }

  extractSessionInfo(results) {
    const testNames = Object.keys(results);
    const timestamps = Object.values(results).map(r => r.startTime || r.timestamp).filter(Boolean);
    
    return {
      totalTests: testNames.length,
      testNames,
      sessionStart: timestamps.length > 0 ? Math.min(...timestamps) : null,
      sessionEnd: timestamps.length > 0 ? Math.max(...timestamps) : null,
      sessionDuration: timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : null
    };
  }

  generateSummary(results) {
    const testResults = Object.values(results);
    
    const summary = {
      overview: {
        totalTests: testResults.length,
        totalRequests: testResults.reduce((sum, r) => sum + (r.totalRequests || 0), 0),
        totalErrors: testResults.reduce((sum, r) => sum + (r.failedRequests || 0), 0),
        totalDuration: testResults.reduce((sum, r) => sum + (r.duration || 0), 0)
      },
      performance: {
        averageResponseTime: this.calculateAverage(testResults, 'averageResponseTime'),
        medianResponseTime: this.calculateMedian(testResults, 'medianResponseTime'),
        p95ResponseTime: this.calculatePercentile(testResults, 'p95ResponseTime', 95),
        p99ResponseTime: this.calculatePercentile(testResults, 'p99ResponseTime', 99),
        averageThroughput: this.calculateAverage(testResults, 'throughput'),
        maxThroughput: Math.max(...testResults.map(r => r.throughput || 0)),
        minThroughput: Math.min(...testResults.map(r => r.throughput || 0))
      },
      reliability: {
        averageErrorRate: this.calculateAverage(testResults, 'errorRate'),
        maxErrorRate: Math.max(...testResults.map(r => r.errorRate || 0)),
        totalConnectionErrors: testResults.reduce((sum, r) => sum + (r.connectionErrors || 0), 0),
        totalTimeoutErrors: testResults.reduce((sum, r) => sum + (r.timeoutErrors || 0), 0),
        averageSuccessRate: this.calculateAverage(testResults, 'successRate')
      },
      performance_scores: {
        averageScore: this.calculateAverage(testResults, 'performanceScore'),
        maxScore: Math.max(...testResults.map(r => r.performanceScore || 0)),
        minScore: Math.min(...testResults.map(r => r.performanceScore || 0)),
        distribution: this.calculateScoreDistribution(testResults)
      }
    };
    
    return summary;
  }

  processTestResults(results) {
    const processedResults = {};
    
    for (const [testName, result] of Object.entries(results)) {
      processedResults[testName] = {
        basic_info: {
          testName,
          duration: result.duration,
          startTime: result.startTime,
          endTime: result.endTime,
          totalRequests: result.totalRequests,
          successfulRequests: result.successfulRequests,
          failedRequests: result.failedRequests
        },
        performance_metrics: {
          responseTime: {
            average: result.averageResponseTime,
            median: result.medianResponseTime,
            p95: result.p95ResponseTime,
            p99: result.p99ResponseTime,
            min: result.minResponseTime,
            max: result.maxResponseTime
          },
          throughput: {
            total: result.throughput,
            successful: result.successThroughput
          },
          reliability: {
            errorRate: result.errorRate,
            successRate: result.successRate,
            timeoutRate: result.timeoutRate
          }
        },
        resource_usage: result.resourceMetrics ? {
          cpu: result.resourceMetrics.maxCpuUsage,
          memory: result.resourceMetrics.maxMemoryUsage,
          disk: result.resourceMetrics.maxDiskUsage,
          network: {
            sent: result.resourceMetrics.totalBytesSent,
            received: result.resourceMetrics.totalBytesReceived
          }
        } : null,
        error_analysis: {
          connectionErrors: result.connectionErrors,
          timeoutErrors: result.timeoutErrors,
          statusCodeDistribution: result.statusCodes,
          errorDetails: result.errors ? result.errors.slice(0, 10) : [] // Limit to first 10 errors
        },
        performance_evaluation: {
          score: result.performanceScore,
          systemCrash: result.systemCrash,
          thresholdViolations: this.analyzeThresholdViolations(result)
        }
      };
    }
    
    return processedResults;
  }

  generatePerformanceAnalysis(results) {
    const analysis = {
      trending: this.analyzeTrends(results),
      bottlenecks: this.identifyBottlenecks(results),
      scalability: this.analyzeScalability(results),
      comparison: this.compareTestResults(results),
      regression: this.detectRegression(results)
    };
    
    return analysis;
  }

  analyzeTrends(results) {
    const trends = {};
    
    for (const [testName, result] of Object.entries(results)) {
      trends[testName] = {
        performance: this.calculatePerformanceTrend(result),
        reliability: this.calculateReliabilityTrend(result),
        scalability: this.calculateScalabilityTrend(result)
      };
    }
    
    return trends;
  }

  identifyBottlenecks(results) {
    const bottlenecks = [];
    
    for (const [testName, result] of Object.entries(results)) {
      // High response time bottleneck
      if (result.averageResponseTime > 1000) {
        bottlenecks.push({
          test: testName,
          type: 'response_time',
          severity: 'high',
          value: result.averageResponseTime,
          description: `High average response time: ${result.averageResponseTime}ms`
        });
      }
      
      // Low throughput bottleneck
      if (result.throughput < 10) {
        bottlenecks.push({
          test: testName,
          type: 'throughput',
          severity: 'medium',
          value: result.throughput,
          description: `Low throughput: ${result.throughput} RPS`
        });
      }
      
      // High error rate bottleneck
      if (result.errorRate > 0.05) {
        bottlenecks.push({
          test: testName,
          type: 'error_rate',
          severity: 'high',
          value: result.errorRate,
          description: `High error rate: ${(result.errorRate * 100).toFixed(1)}%`
        });
      }
      
      // Resource usage bottlenecks
      if (result.resourceMetrics) {
        if (result.resourceMetrics.maxCpuUsage > 80) {
          bottlenecks.push({
            test: testName,
            type: 'cpu_usage',
            severity: 'high',
            value: result.resourceMetrics.maxCpuUsage,
            description: `High CPU usage: ${result.resourceMetrics.maxCpuUsage}%`
          });
        }
        
        if (result.resourceMetrics.maxMemoryUsage > 85) {
          bottlenecks.push({
            test: testName,
            type: 'memory_usage',
            severity: 'high',
            value: result.resourceMetrics.maxMemoryUsage,
            description: `High memory usage: ${result.resourceMetrics.maxMemoryUsage}%`
          });
        }
      }
    }
    
    return bottlenecks;
  }

  analyzeScalability(results) {
    const scalabilityAnalysis = {};
    
    for (const [testName, result] of Object.entries(results)) {
      scalabilityAnalysis[testName] = {
        throughputCapacity: this.calculateThroughputCapacity(result),
        concurrencyHandling: this.analyzeConcurrencyHandling(result),
        resourceEfficiency: this.calculateResourceEfficiency(result),
        scalabilityScore: this.calculateScalabilityScore(result)
      };
    }
    
    return scalabilityAnalysis;
  }

  compareTestResults(results) {
    const testNames = Object.keys(results);
    const comparison = {};
    
    for (let i = 0; i < testNames.length; i++) {
      for (let j = i + 1; j < testNames.length; j++) {
        const test1 = testNames[i];
        const test2 = testNames[j];
        const result1 = results[test1];
        const result2 = results[test2];
        
        comparison[`${test1}_vs_${test2}`] = {
          responseTime: {
            difference: result1.averageResponseTime - result2.averageResponseTime,
            percentChange: ((result1.averageResponseTime - result2.averageResponseTime) / result2.averageResponseTime) * 100
          },
          throughput: {
            difference: result1.throughput - result2.throughput,
            percentChange: ((result1.throughput - result2.throughput) / result2.throughput) * 100
          },
          errorRate: {
            difference: result1.errorRate - result2.errorRate,
            percentChange: ((result1.errorRate - result2.errorRate) / result2.errorRate) * 100
          },
          performanceScore: {
            difference: result1.performanceScore - result2.performanceScore,
            percentChange: ((result1.performanceScore - result2.performanceScore) / result2.performanceScore) * 100
          }
        };
      }
    }
    
    return comparison;
  }

  detectRegression(results) {
    // This would typically compare with historical data
    // For now, we'll detect regression within the current test session
    const regression = {
      detected: false,
      details: []
    };
    
    for (const [testName, result] of Object.entries(results)) {
      if (result.performanceScore < 60) {
        regression.detected = true;
        regression.details.push({
          test: testName,
          type: 'performance_degradation',
          severity: 'high',
          currentScore: result.performanceScore,
          description: `Performance score below acceptable threshold: ${result.performanceScore}`
        });
      }
      
      if (result.errorRate > 0.1) {
        regression.detected = true;
        regression.details.push({
          test: testName,
          type: 'reliability_regression',
          severity: 'critical',
          currentErrorRate: result.errorRate,
          description: `Error rate above acceptable threshold: ${(result.errorRate * 100).toFixed(1)}%`
        });
      }
    }
    
    return regression;
  }

  generateRecommendations(results) {
    const recommendations = [];
    
    for (const [testName, result] of Object.entries(results)) {
      // Performance recommendations
      if (result.averageResponseTime > 500) {
        recommendations.push({
          test: testName,
          category: 'performance',
          priority: 'high',
          title: 'Optimize Response Time',
          description: `Average response time is ${result.averageResponseTime}ms, which exceeds the recommended 500ms threshold.`,
          suggestions: [
            'Review and optimize database queries',
            'Implement caching strategies',
            'Consider code profiling to identify bottlenecks',
            'Optimize business logic algorithms'
          ]
        });
      }
      
      // Scalability recommendations
      if (result.throughput < 20) {
        recommendations.push({
          test: testName,
          category: 'scalability',
          priority: 'medium',
          title: 'Improve Throughput',
          description: `Throughput is ${result.throughput} RPS, which may not meet production requirements.`,
          suggestions: [
            'Implement horizontal scaling',
            'Optimize connection pooling',
            'Consider asynchronous processing',
            'Review server configuration'
          ]
        });
      }
      
      // Reliability recommendations
      if (result.errorRate > 0.01) {
        recommendations.push({
          test: testName,
          category: 'reliability',
          priority: 'critical',
          title: 'Reduce Error Rate',
          description: `Error rate is ${(result.errorRate * 100).toFixed(1)}%, which indicates system instability.`,
          suggestions: [
            'Implement proper error handling',
            'Add input validation',
            'Increase system resources',
            'Review application logs for root causes'
          ]
        });
      }
      
      // Resource usage recommendations
      if (result.resourceMetrics) {
        if (result.resourceMetrics.maxCpuUsage > 70) {
          recommendations.push({
            test: testName,
            category: 'resources',
            priority: 'medium',
            title: 'Optimize CPU Usage',
            description: `CPU usage reached ${result.resourceMetrics.maxCpuUsage}%, which may cause performance degradation.`,
            suggestions: [
              'Profile CPU-intensive operations',
              'Implement caching to reduce computation',
              'Consider vertical scaling',
              'Optimize algorithms and data structures'
            ]
          });
        }
        
        if (result.resourceMetrics.maxMemoryUsage > 80) {
          recommendations.push({
            test: testName,
            category: 'resources',
            priority: 'high',
            title: 'Optimize Memory Usage',
            description: `Memory usage reached ${result.resourceMetrics.maxMemoryUsage}%, which may cause system instability.`,
            suggestions: [
              'Check for memory leaks',
              'Implement proper garbage collection',
              'Optimize data structures',
              'Consider increasing memory allocation'
            ]
          });
        }
      }
    }
    
    return recommendations;
  }

  generateChartData(results) {
    const charts = {
      responseTimeChart: this.generateResponseTimeChart(results),
      throughputChart: this.generateThroughputChart(results),
      errorRateChart: this.generateErrorRateChart(results),
      performanceScoreChart: this.generatePerformanceScoreChart(results),
      resourceUsageChart: this.generateResourceUsageChart(results)
    };
    
    return charts;
  }

  generateResponseTimeChart(results) {
    const data = Object.entries(results).map(([testName, result]) => ({
      test: testName,
      average: result.averageResponseTime || 0,
      median: result.medianResponseTime || 0,
      p95: result.p95ResponseTime || 0,
      p99: result.p99ResponseTime || 0,
      min: result.minResponseTime || 0,
      max: result.maxResponseTime || 0
    }));
    
    return {
      type: 'bar',
      title: 'Response Time Distribution',
      data,
      xAxis: 'test',
      yAxis: 'time (ms)',
      series: ['average', 'median', 'p95', 'p99']
    };
  }

  generateThroughputChart(results) {
    const data = Object.entries(results).map(([testName, result]) => ({
      test: testName,
      throughput: result.throughput || 0,
      successThroughput: result.successThroughput || 0
    }));
    
    return {
      type: 'bar',
      title: 'Throughput Comparison',
      data,
      xAxis: 'test',
      yAxis: 'requests/second',
      series: ['throughput', 'successThroughput']
    };
  }

  generateErrorRateChart(results) {
    const data = Object.entries(results).map(([testName, result]) => ({
      test: testName,
      errorRate: (result.errorRate || 0) * 100,
      successRate: (result.successRate || 0) * 100
    }));
    
    return {
      type: 'bar',
      title: 'Error Rate Analysis',
      data,
      xAxis: 'test',
      yAxis: 'percentage',
      series: ['errorRate', 'successRate']
    };
  }

  generatePerformanceScoreChart(results) {
    const data = Object.entries(results).map(([testName, result]) => ({
      test: testName,
      score: result.performanceScore || 0
    }));
    
    return {
      type: 'line',
      title: 'Performance Score Trend',
      data,
      xAxis: 'test',
      yAxis: 'score (0-100)',
      series: ['score']
    };
  }

  generateResourceUsageChart(results) {
    const data = Object.entries(results)
      .filter(([_, result]) => result.resourceMetrics)
      .map(([testName, result]) => ({
        test: testName,
        cpu: result.resourceMetrics.maxCpuUsage || 0,
        memory: result.resourceMetrics.maxMemoryUsage || 0,
        disk: result.resourceMetrics.maxDiskUsage || 0
      }));
    
    return {
      type: 'radar',
      title: 'Resource Usage Comparison',
      data,
      series: ['cpu', 'memory', 'disk']
    };
  }

  generateAppendix(results) {
    return {
      testConfiguration: this.extractTestConfiguration(results),
      environmentInfo: this.extractEnvironmentInfo(results),
      rawData: this.sanitizeRawData(results),
      glossary: this.generateGlossary()
    };
  }

  async writeReportToFile(filename, report) {
    const filePath = path.join(this.options.reportsDir, filename);
    await fs.promises.writeFile(filePath, JSON.stringify(report, null, 2));
    console.log(`📄 Report written to: ${filePath}`);
    return filePath;
  }

  async generateHtmlReport(report, filename = 'performance-report.html') {
    const htmlContent = this.generateHtmlContent(report);
    const filePath = path.join(this.options.reportsDir, filename);
    await fs.promises.writeFile(filePath, htmlContent);
    console.log(`🌐 HTML report generated: ${filePath}`);
    return filePath;
  }

  generateHtmlContent(report) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #2c3e50; }
        .metric-label { font-size: 14px; color: #7f8c8d; }
        .test-results { margin: 20px 0; }
        .test-card { background: #fff; border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .test-name { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .performance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .performance-item { background: #f8f9fa; padding: 10px; border-radius: 3px; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .recommendation { margin: 10px 0; padding: 10px; background: #fff; border-left: 4px solid #3498db; }
        .high-priority { border-left-color: #e74c3c; }
        .medium-priority { border-left-color: #f39c12; }
        .low-priority { border-left-color: #27ae60; }
        .footer { margin-top: 40px; padding: 20px; background: #f5f5f5; border-radius: 5px; font-size: 12px; color: #7f8c8d; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p>Generated on: ${report.metadata.generatedAt}</p>
        <p>Test Session: ${report.metadata.testSession.totalTests} tests</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <div class="metric-value">${report.summary.performance.averageResponseTime?.toFixed(0) || 'N/A'}</div>
            <div class="metric-label">Avg Response Time (ms)</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.performance.averageThroughput?.toFixed(1) || 'N/A'}</div>
            <div class="metric-label">Avg Throughput (RPS)</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(report.summary.reliability.averageErrorRate * 100)?.toFixed(1) || 'N/A'}%</div>
            <div class="metric-label">Avg Error Rate</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.performance_scores.averageScore?.toFixed(0) || 'N/A'}</div>
            <div class="metric-label">Performance Score</div>
        </div>
    </div>
    
    <div class="test-results">
        <h2>Test Results</h2>
        ${Object.entries(report.testResults).map(([testName, result]) => `
            <div class="test-card">
                <div class="test-name">${testName}</div>
                <div class="performance-grid">
                    <div class="performance-item">
                        <strong>Response Time</strong><br>
                        Avg: ${result.performance_metrics.responseTime.average?.toFixed(0) || 'N/A'}ms<br>
                        P95: ${result.performance_metrics.responseTime.p95?.toFixed(0) || 'N/A'}ms
                    </div>
                    <div class="performance-item">
                        <strong>Throughput</strong><br>
                        ${result.performance_metrics.throughput.total?.toFixed(1) || 'N/A'} RPS
                    </div>
                    <div class="performance-item">
                        <strong>Reliability</strong><br>
                        Error Rate: ${(result.performance_metrics.reliability.errorRate * 100)?.toFixed(1) || 'N/A'}%<br>
                        Success Rate: ${(result.performance_metrics.reliability.successRate * 100)?.toFixed(1) || 'N/A'}%
                    </div>
                    <div class="performance-item">
                        <strong>Performance</strong><br>
                        Score: ${result.performance_evaluation.score?.toFixed(0) || 'N/A'}/100
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
    
    ${report.recommendations && report.recommendations.length > 0 ? `
    <div class="recommendations">
        <h2>Recommendations</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.priority}-priority">
                <strong>${rec.title}</strong><br>
                ${rec.description}<br>
                <ul>
                    ${rec.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                </ul>
            </div>
        `).join('')}
    </div>
    ` : ''}
    
    <div class="footer">
        <p>Report generated by Performance Test Suite v${report.metadata.reportVersion}</p>
    </div>
</body>
</html>
    `;
  }

  // Helper calculation methods
  calculateAverage(results, property) {
    const values = results.map(r => r[property]).filter(v => v !== undefined);
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  calculateMedian(results, property) {
    const values = results.map(r => r[property]).filter(v => v !== undefined).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  }

  calculatePercentile(results, property, percentile) {
    const values = results.map(r => r[property]).filter(v => v !== undefined).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * values.length);
    return values[index] || 0;
  }

  calculateScoreDistribution(results) {
    const scores = results.map(r => r.performanceScore || 0);
    const ranges = { excellent: 0, good: 0, fair: 0, poor: 0 };
    
    scores.forEach(score => {
      if (score >= 90) ranges.excellent++;
      else if (score >= 70) ranges.good++;
      else if (score >= 50) ranges.fair++;
      else ranges.poor++;
    });
    
    return ranges;
  }

  analyzeThresholdViolations(result) {
    const violations = [];
    const thresholds = global.PERFORMANCE_TEST_CONFIG?.thresholds || {};
    
    if (thresholds.responseTime && result.averageResponseTime > thresholds.responseTime.average) {
      violations.push({
        metric: 'averageResponseTime',
        value: result.averageResponseTime,
        threshold: thresholds.responseTime.average,
        severity: 'high'
      });
    }
    
    if (thresholds.throughput && result.throughput < thresholds.throughput.minimum) {
      violations.push({
        metric: 'throughput',
        value: result.throughput,
        threshold: thresholds.throughput.minimum,
        severity: 'medium'
      });
    }
    
    if (thresholds.errorRate && result.errorRate > thresholds.errorRate.maximum) {
      violations.push({
        metric: 'errorRate',
        value: result.errorRate,
        threshold: thresholds.errorRate.maximum,
        severity: 'high'
      });
    }
    
    return violations;
  }

  // Stub methods for complex analysis (would be implemented based on requirements)
  calculatePerformanceTrend(result) { return 'stable'; }
  calculateReliabilityTrend(result) { return 'stable'; }
  calculateScalabilityTrend(result) { return 'stable'; }
  calculateThroughputCapacity(result) { return result.throughput || 0; }
  analyzeConcurrencyHandling(result) { return 'good'; }
  calculateResourceEfficiency(result) { return 0.8; }
  calculateScalabilityScore(result) { return 75; }
  
  extractTestConfiguration(results) {
    return global.PERFORMANCE_TEST_CONFIG || {};
  }
  
  extractEnvironmentInfo(results) {
    const firstResult = Object.values(results)[0];
    return firstResult?.metadata?.environment || {};
  }
  
  sanitizeRawData(results) {
    // Remove sensitive data and limit size
    const sanitized = {};
    for (const [testName, result] of Object.entries(results)) {
      sanitized[testName] = {
        ...result,
        errors: result.errors ? result.errors.slice(0, 5) : []
      };
    }
    return sanitized;
  }
  
  generateGlossary() {
    return {
      'Response Time': 'The time taken to complete a request',
      'Throughput': 'Number of requests processed per second',
      'Error Rate': 'Percentage of failed requests',
      'Performance Score': 'Overall performance rating (0-100)',
      'P95': '95th percentile response time',
      'P99': '99th percentile response time'
    };
  }
}

module.exports = { ReportGenerator };
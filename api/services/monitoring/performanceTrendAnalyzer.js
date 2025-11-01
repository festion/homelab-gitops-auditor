const { createLogger } = require('../../utils/logger');
const { MetricsService } = require('../metrics');

class PerformanceTrendAnalyzer {
  constructor(metricsService = null) {
    this.logger = createLogger('PerformanceTrendAnalyzer');
    this.metrics = metricsService || new MetricsService();
    
    // Analysis configuration
    this.config = {
      minDataPoints: 5,
      significanceThreshold: 0.05, // 5% change is significant
      trendWindow: {
        short: 7,   // 7 days
        medium: 30, // 30 days
        long: 90    // 90 days
      },
      smoothingFactor: 0.3, // For exponential smoothing
      outlierThreshold: 2.5  // Z-score threshold for outlier detection
    };
    
    this.trendCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async analyzeTrends(repository, options = {}) {
    try {
      const {
        timeWindow = 'medium',
        includeForecasting = false,
        includeSeasonality = false,
        includeAnomalies = true
      } = options;

      this.logger.debug(`Analyzing trends for ${repository} with ${timeWindow} window`);

      // Check cache first
      const cacheKey = `${repository}-${timeWindow}-${Date.now() - (Date.now() % this.cacheTimeout)}`;
      if (this.trendCache.has(cacheKey)) {
        return this.trendCache.get(cacheKey);
      }

      const days = this.config.trendWindow[timeWindow] || this.config.trendWindow.medium;
      const historicalData = await this.getHistoricalData(repository, days);

      if (!historicalData || historicalData.length < this.config.minDataPoints) {
        return {
          error: 'Insufficient data for trend analysis',
          dataPoints: historicalData?.length || 0,
          required: this.config.minDataPoints
        };
      }

      const analysis = {
        repository,
        timeWindow,
        period: `${days} days`,
        timestamp: new Date(),
        dataPoints: historicalData.length,
        
        // Core trend analysis
        performance: await this.analyzePerformanceTrends(historicalData),
        reliability: await this.analyzeReliabilityTrends(historicalData),
        quality: await this.analyzeQualityTrends(historicalData),
        
        // Advanced analysis
        correlations: this.analyzeCorrelations(historicalData),
        patterns: this.identifyPatterns(historicalData),
        
        // Statistical insights
        statistics: this.calculateStatistics(historicalData),
        changePoints: this.detectChangePoints(historicalData)
      };

      // Optional advanced features
      if (includeAnomalies) {
        analysis.anomalies = this.detectTrendAnomalies(historicalData);
      }

      if (includeSeasonality) {
        analysis.seasonality = this.analyzeSeasonality(historicalData);
      }

      if (includeForecasting) {
        analysis.forecast = await this.generateForecast(historicalData, repository);
      }

      // Add trend summary
      analysis.summary = this.generateTrendSummary(analysis);

      // Cache the result
      this.trendCache.set(cacheKey, analysis);

      this.logger.debug(`Trend analysis completed for ${repository}: ${analysis.summary.overallTrend}`);
      return analysis;

    } catch (error) {
      this.logger.error(`Trend analysis failed for ${repository}:`, error);
      return {
        error: error.message,
        repository,
        timestamp: new Date()
      };
    }
  }

  async analyzePerformanceTrends(data) {
    const performanceMetrics = this.extractPerformanceMetrics(data);
    
    return {
      duration: {
        trend: this.calculateTrend(performanceMetrics.durations),
        average: this.calculateAverage(performanceMetrics.durations),
        median: this.calculateMedian(performanceMetrics.durations),
        p95: this.calculatePercentile(performanceMetrics.durations, 95),
        volatility: this.calculateVolatility(performanceMetrics.durations),
        improvement: this.calculateImprovementRate(performanceMetrics.durations)
      },
      
      queueTime: {
        trend: this.calculateTrend(performanceMetrics.queueTimes),
        average: this.calculateAverage(performanceMetrics.queueTimes),
        median: this.calculateMedian(performanceMetrics.queueTimes),
        p95: this.calculatePercentile(performanceMetrics.queueTimes, 95),
        volatility: this.calculateVolatility(performanceMetrics.queueTimes)
      },
      
      throughput: {
        trend: this.calculateThroughputTrend(data),
        dailyAverage: this.calculateDailyThroughput(data),
        peakHours: this.identifyPeakHours(data)
      },
      
      efficiency: {
        cpuUtilization: this.analyzeCpuTrends(performanceMetrics),
        memoryUtilization: this.analyzeMemoryTrends(performanceMetrics),
        resourceEfficiency: this.calculateResourceEfficiency(performanceMetrics)
      }
    };
  }

  async analyzeReliabilityTrends(data) {
    const reliabilityMetrics = this.extractReliabilityMetrics(data);
    
    return {
      successRate: {
        trend: this.calculateSuccessRateTrend(data),
        current: this.calculateCurrentSuccessRate(data),
        movingAverage: this.calculateMovingAverage(reliabilityMetrics.successRates, 7),
        stability: this.calculateStability(reliabilityMetrics.successRates)
      },
      
      failurePatterns: {
        consecutiveFailures: this.analyzeConsecutiveFailures(data),
        failureFrequency: this.calculateFailureFrequency(data),
        failureTypes: this.categorizeFailures(data),
        recoveryTime: this.calculateRecoveryTime(data)
      },
      
      availability: {
        uptime: this.calculateUptime(data),
        mtbf: this.calculateMTBF(data), // Mean Time Between Failures
        mttr: this.calculateMTTR(data)  // Mean Time To Recovery
      },
      
      stability: {
        variability: this.calculateVariability(reliabilityMetrics.successRates),
        predictability: this.calculatePredictability(data),
        resilience: this.calculateResilience(data)
      }
    };
  }

  async analyzeQualityTrends(data) {
    // Quality trends would typically come from integrated quality tools
    // For now, we'll analyze what we can from pipeline data
    
    return {
      testMetrics: {
        testDuration: this.calculateTestDurationTrend(data),
        testCoverage: await this.getTestCoverageTrend(data),
        testStability: this.calculateTestStability(data)
      },
      
      codeQuality: {
        buildHealth: this.calculateBuildHealthTrend(data),
        deploymentQuality: this.calculateDeploymentQuality(data),
        regressionRate: this.calculateRegressionRate(data)
      },
      
      maintenance: {
        technicalDebt: await this.getTechnicalDebtTrend(data),
        refactoringFrequency: this.calculateRefactoringFrequency(data),
        maintenanceEffort: this.calculateMaintenanceEffort(data)
      }
    };
  }

  analyzeCorrelations(data) {
    const metrics = this.extractAllMetrics(data);
    const correlations = {};
    
    // Calculate correlations between different metrics
    const metricPairs = [
      ['duration', 'queueTime'],
      ['duration', 'successRate'],
      ['queueTime', 'successRate'],
      ['concurrentRuns', 'duration'],
      ['timeOfDay', 'successRate'],
      ['dayOfWeek', 'duration']
    ];
    
    for (const [metric1, metric2] of metricPairs) {
      if (metrics[metric1] && metrics[metric2]) {
        correlations[`${metric1}_${metric2}`] = this.calculateCorrelation(
          metrics[metric1], 
          metrics[metric2]
        );
      }
    }
    
    return {
      coefficients: correlations,
      strongCorrelations: this.identifyStrongCorrelations(correlations),
      insights: this.generateCorrelationInsights(correlations)
    };
  }

  identifyPatterns(data) {
    return {
      cyclical: this.identifyCyclicalPatterns(data),
      seasonal: this.identifySeasonalPatterns(data),
      recurring: this.identifyRecurringPatterns(data),
      anomalous: this.identifyAnomalousPatterns(data)
    };
  }

  calculateStatistics(data) {
    const durations = data.map(d => d.duration).filter(d => d != null);
    const successRates = this.calculateDailySuccessRates(data);
    
    return {
      duration: {
        mean: this.calculateAverage(durations),
        median: this.calculateMedian(durations),
        stdDev: this.calculateStandardDeviation(durations),
        skewness: this.calculateSkewness(durations),
        kurtosis: this.calculateKurtosis(durations)
      },
      
      reliability: {
        overallSuccessRate: this.calculateOverallSuccessRate(data),
        successRateStability: this.calculateStandardDeviation(successRates),
        consistencyScore: this.calculateConsistencyScore(data)
      },
      
      performance: {
        performanceStability: this.calculatePerformanceStability(durations),
        improvementRate: this.calculateOverallImprovementRate(data),
        efficiencyTrend: this.calculateEfficiencyTrend(data)
      }
    };
  }

  detectChangePoints(data) {
    // Detect significant changes in trends using statistical methods
    const changePoints = [];
    const windowSize = Math.max(5, Math.floor(data.length / 10));
    
    for (let i = windowSize; i < data.length - windowSize; i++) {
      const beforeWindow = data.slice(i - windowSize, i);
      const afterWindow = data.slice(i, i + windowSize);
      
      const changePoint = this.detectSignificantChange(beforeWindow, afterWindow, i);
      if (changePoint) {
        changePoints.push(changePoint);
      }
    }
    
    return changePoints;
  }

  detectTrendAnomalies(data) {
    const anomalies = [];
    const durations = data.map(d => d.duration).filter(d => d != null);
    
    if (durations.length < this.config.minDataPoints) return anomalies;
    
    const mean = this.calculateAverage(durations);
    const stdDev = this.calculateStandardDeviation(durations);
    
    data.forEach((run, index) => {
      if (run.duration != null) {
        const zScore = Math.abs((run.duration - mean) / stdDev);
        
        if (zScore > this.config.outlierThreshold) {
          anomalies.push({
            type: 'performance_outlier',
            index,
            timestamp: run.created_at || run.updated_at,
            value: run.duration,
            expected: mean,
            deviation: zScore,
            severity: this.classifyAnomalySeverity(zScore)
          });
        }
      }
    });
    
    return anomalies;
  }

  analyzeSeasonality(data) {
    return {
      hourly: this.analyzeHourlyPatterns(data),
      daily: this.analyzeDailyPatterns(data),
      weekly: this.analyzeWeeklyPatterns(data),
      monthly: this.analyzeMonthlyPatterns(data)
    };
  }

  async generateForecast(data, repository) {
    // Simple linear regression forecast
    const durations = data
      .map(d => d.duration)
      .filter(d => d != null)
      .slice(-30); // Last 30 data points
    
    if (durations.length < 10) {
      return { error: 'Insufficient data for forecasting' };
    }
    
    const trend = this.calculateTrend(durations);
    const currentAvg = this.calculateAverage(durations.slice(-7)); // Last week average
    
    // Generate 7-day forecast
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const predictedValue = currentAvg + (trend * i);
      forecast.push({
        day: i,
        predicted: Math.max(0, predictedValue),
        confidence: this.calculateForecastConfidence(durations, i)
      });
    }
    
    return {
      method: 'linear_regression',
      horizon: '7 days',
      trend: trend,
      forecast: forecast,
      accuracy: this.calculateForecastAccuracy(data),
      assumptions: [
        'Linear trend continuation',
        'No major system changes',
        'Historical patterns remain valid'
      ]
    };
  }

  generateTrendSummary(analysis) {
    const trends = [];
    
    // Performance trends
    if (analysis.performance.duration.trend > this.config.significanceThreshold) {
      trends.push('Duration increasing');
    } else if (analysis.performance.duration.trend < -this.config.significanceThreshold) {
      trends.push('Duration improving');
    }
    
    // Reliability trends
    if (analysis.reliability.successRate.trend < -this.config.significanceThreshold) {
      trends.push('Reliability declining');
    } else if (analysis.reliability.successRate.trend > this.config.significanceThreshold) {
      trends.push('Reliability improving');
    }
    
    // Overall assessment
    let overallTrend = 'stable';
    if (trends.some(t => t.includes('declining') || t.includes('increasing'))) {
      overallTrend = 'degrading';
    } else if (trends.some(t => t.includes('improving'))) {
      overallTrend = 'improving';
    }
    
    return {
      overallTrend,
      keyTrends: trends,
      concerns: this.identifyConcerns(analysis),
      recommendations: this.generateRecommendations(analysis),
      healthScore: this.calculateHealthScore(analysis)
    };
  }

  // Utility methods for calculations
  calculateTrend(values) {
    if (!values || values.length < 2) return 0;
    
    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
    const sumXX = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgY = sumY / n;
    
    return avgY > 0 ? slope / avgY : 0; // Relative slope
  }

  calculateAverage(values) {
    if (!values || values.length === 0) return null;
    const validValues = values.filter(v => v != null && !isNaN(v));
    return validValues.length > 0 ? 
      validValues.reduce((sum, v) => sum + v, 0) / validValues.length : null;
  }

  calculateMedian(values) {
    if (!values || values.length === 0) return null;
    const validValues = values.filter(v => v != null && !isNaN(v)).sort((a, b) => a - b);
    const mid = Math.floor(validValues.length / 2);
    return validValues.length % 2 === 0 ? 
      (validValues[mid - 1] + validValues[mid]) / 2 : validValues[mid];
  }

  calculatePercentile(values, percentile) {
    if (!values || values.length === 0) return null;
    const validValues = values.filter(v => v != null && !isNaN(v)).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * validValues.length) - 1;
    return validValues[Math.max(0, index)];
  }

  calculateStandardDeviation(values) {
    if (!values || values.length === 0) return null;
    const validValues = values.filter(v => v != null && !isNaN(v));
    if (validValues.length === 0) return null;
    
    const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
    const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
    return Math.sqrt(variance);
  }

  calculateVolatility(values) {
    const stdDev = this.calculateStandardDeviation(values);
    const mean = this.calculateAverage(values);
    return (stdDev && mean) ? stdDev / mean : null; // Coefficient of variation
  }

  calculateCorrelation(values1, values2) {
    if (!values1 || !values2 || values1.length !== values2.length || values1.length < 2) {
      return null;
    }
    
    const n = values1.length;
    const sum1 = values1.reduce((a, b) => a + b, 0);
    const sum2 = values2.reduce((a, b) => a + b, 0);
    const sum1Sq = values1.reduce((sum, v) => sum + v * v, 0);
    const sum2Sq = values2.reduce((sum, v) => sum + v * v, 0);
    const sum12 = values1.map((v1, i) => v1 * values2[i]).reduce((a, b) => a + b, 0);
    
    const numerator = n * sum12 - sum1 * sum2;
    const denominator = Math.sqrt((n * sum1Sq - sum1 * sum1) * (n * sum2Sq - sum2 * sum2));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Data extraction methods
  async getHistoricalData(repository, days) {
    try {
      return await this.metrics.getPipelineRuns(repository, {
        since: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        limit: 1000
      });
    } catch (error) {
      this.logger.error(`Failed to get historical data for ${repository}:`, error);
      return [];
    }
  }

  extractPerformanceMetrics(data) {
    return {
      durations: data.map(d => d.duration).filter(d => d != null),
      queueTimes: data.map(d => d.queueTime).filter(d => d != null),
      timestamps: data.map(d => new Date(d.created_at || d.updated_at)),
      conclusions: data.map(d => d.conclusion)
    };
  }

  extractReliabilityMetrics(data) {
    const dailyGroups = this.groupByDay(data);
    const successRates = Object.values(dailyGroups).map(dayData => {
      const successful = dayData.filter(d => d.conclusion === 'success').length;
      return successful / dayData.length;
    });
    
    return {
      successRates,
      failures: data.filter(d => d.conclusion === 'failure'),
      successes: data.filter(d => d.conclusion === 'success')
    };
  }

  extractAllMetrics(data) {
    return {
      duration: data.map(d => d.duration).filter(d => d != null),
      queueTime: data.map(d => d.queueTime).filter(d => d != null),
      successRate: this.calculateDailySuccessRates(data),
      timeOfDay: data.map(d => new Date(d.created_at || d.updated_at).getHours()),
      dayOfWeek: data.map(d => new Date(d.created_at || d.updated_at).getDay()),
      concurrentRuns: data.map(d => d.concurrentRuns || 1)
    };
  }

  groupByDay(data) {
    const groups = {};
    
    data.forEach(run => {
      const date = new Date(run.created_at || run.updated_at);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(run);
    });
    
    return groups;
  }

  calculateDailySuccessRates(data) {
    const dailyGroups = this.groupByDay(data);
    return Object.values(dailyGroups).map(dayData => {
      const successful = dayData.filter(d => d.conclusion === 'success').length;
      return successful / dayData.length;
    });
  }

  // Additional analysis methods would be implemented here...
  // (Keeping the file manageable, these would include methods for:)
  // - calculateMovingAverage
  // - identifyStrongCorrelations
  // - generateCorrelationInsights
  // - detectSignificantChange
  // - calculateForecastConfidence
  // - identifyConcerns
  // - generateRecommendations
  // - calculateHealthScore
  // etc.

  calculateMovingAverage(values, window) {
    if (!values || values.length < window) return [];
    
    const result = [];
    for (let i = window - 1; i < values.length; i++) {
      const windowValues = values.slice(i - window + 1, i + 1);
      result.push(this.calculateAverage(windowValues));
    }
    return result;
  }

  identifyStrongCorrelations(correlations) {
    return Object.entries(correlations)
      .filter(([_, coeff]) => Math.abs(coeff) > 0.7)
      .map(([pair, coeff]) => ({ pair, coefficient: coeff, strength: 'strong' }));
  }

  classifyAnomalySeverity(zScore) {
    if (zScore > 4) return 'critical';
    if (zScore > 3.5) return 'high';
    if (zScore > 3) return 'medium';
    return 'low';
  }
}

module.exports = PerformanceTrendAnalyzer;
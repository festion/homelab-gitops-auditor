const { createLogger } = require('../../utils/logger');
const { MetricsService } = require('../metrics');

class PipelineAnomalyDetector {
  constructor(metricsService = null) {
    this.logger = createLogger('PipelineAnomalyDetector');
    this.metrics = metricsService || new MetricsService();
    this.models = new Map();
    this.trainingData = new Map();
    this.baselineData = new Map();
    
    // Statistical parameters
    this.confidenceThreshold = 0.95; // 95% confidence interval
    this.minDataPoints = 10; // Minimum data points for reliable predictions
    this.anomalyThreshold = 2.5; // Z-score threshold for anomaly detection
  }

  async predictFailure(repository) {
    try {
      this.logger.debug(`Predicting failure for repository: ${repository}`);
      
      const features = await this.extractFeatures(repository);
      if (!features) {
        return {
          probability: 0,
          confidence: 0,
          factors: [],
          recommendations: ['Insufficient data for prediction'],
          error: 'No features extracted'
        };
      }

      const model = await this.getOrTrainModel(repository);
      const prediction = this.calculateFailureProbability(features, model);
      
      const result = {
        repository,
        timestamp: new Date(),
        probability: Math.min(1, Math.max(0, prediction.failureProbability)),
        confidence: prediction.confidence,
        factors: prediction.contributingFactors,
        recommendations: this.generateRecommendations(prediction),
        features: features,
        anomalies: await this.detectAnomalies(repository, features)
      };

      this.logger.debug(`Failure prediction for ${repository}: ${(result.probability * 100).toFixed(1)}% probability`);
      return result;
      
    } catch (error) {
      this.logger.error(`Failure prediction failed for ${repository}:`, error);
      return {
        probability: 0,
        confidence: 0,
        factors: [],
        recommendations: ['Prediction unavailable due to error'],
        error: error.message
      };
    }
  }

  async extractFeatures(repository) {
    try {
      const historicalData = await this.getHistoricalData(repository);
      if (!historicalData || historicalData.length < this.minDataPoints) {
        this.logger.warn(`Insufficient historical data for ${repository}: ${historicalData?.length || 0} data points`);
        return null;
      }

      const features = {
        // Recent performance metrics (last 7 days)
        avgDuration: this.calculateRecentAverage(historicalData, 'duration', 7),
        successRate: this.calculateRecentSuccessRate(historicalData, 7),
        queueTime: this.calculateRecentAverage(historicalData, 'queueTime', 7),
        failureRate: this.calculateRecentFailureRate(historicalData, 7),
        
        // Medium-term trends (last 30 days)
        durationTrend: this.calculateTrend(historicalData, 'duration', 30),
        successTrend: this.calculateTrend(historicalData, 'success', 30),
        queueTimeTrend: this.calculateTrend(historicalData, 'queueTime', 30),
        
        // Temporal factors
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        hourOfWeek: new Date().getDay() * 24 + new Date().getHours(),
        
        // Recent activity patterns
        recentChanges: await this.getRecentRepositoryChanges(repository),
        runFrequency: this.calculateRunFrequency(historicalData, 7),
        lastRunAge: this.getLastRunAge(historicalData),
        
        // Quality indicators (if available)
        testCoverage: await this.getTestCoverage(repository),
        codeComplexity: await this.getCodeComplexity(repository),
        dependencyHealth: await this.getDependencyHealth(repository),
        
        // Environmental factors
        concurrentRuns: await this.getConcurrentRuns(repository),
        resourceContention: await this.getResourceContention(repository),
        
        // Historical patterns
        historicalFailurePattern: this.analyzeFailurePattern(historicalData),
        seasonalFactors: this.analyzeSeasonalFactors(historicalData)
      };

      // Remove null/undefined values
      const cleanFeatures = Object.fromEntries(
        Object.entries(features).filter(([_, value]) => value != null && !isNaN(value))
      );

      this.logger.debug(`Extracted ${Object.keys(cleanFeatures).length} features for ${repository}`);
      return cleanFeatures;
      
    } catch (error) {
      this.logger.error(`Feature extraction failed for ${repository}:`, error);
      return null;
    }
  }

  async getOrTrainModel(repository) {
    // Check if we have a cached model
    if (this.models.has(repository)) {
      const model = this.models.get(repository);
      
      // Check if model is still fresh (updated within last hour)
      if (Date.now() - model.lastUpdated < 60 * 60 * 1000) {
        return model;
      }
    }

    // Train or update the model
    const model = await this.trainModel(repository);
    this.models.set(repository, model);
    
    return model;
  }

  async trainModel(repository) {
    try {
      this.logger.debug(`Training prediction model for ${repository}`);
      
      const trainingData = await this.getTrainingData(repository);
      if (!trainingData || trainingData.length < this.minDataPoints) {
        // Return a simple baseline model
        return this.createBaselineModel(repository);
      }

      // Create a simple ensemble model with multiple approaches
      const model = {
        repository,
        lastUpdated: Date.now(),
        dataPoints: trainingData.length,
        
        // Statistical model (based on historical patterns)
        statisticalModel: this.trainStatisticalModel(trainingData),
        
        // Trend-based model
        trendModel: this.trainTrendModel(trainingData),
        
        // Pattern recognition model
        patternModel: this.trainPatternModel(trainingData),
        
        // Baseline statistics
        baseline: this.calculateBaseline(trainingData)
      };

      this.logger.debug(`Model trained for ${repository} with ${trainingData.length} data points`);
      return model;
      
    } catch (error) {
      this.logger.error(`Model training failed for ${repository}:`, error);
      return this.createBaselineModel(repository);
    }
  }

  calculateFailureProbability(features, model) {
    try {
      // Ensemble prediction combining multiple models
      const predictions = {
        statistical: this.predictWithStatisticalModel(features, model.statisticalModel),
        trend: this.predictWithTrendModel(features, model.trendModel),
        pattern: this.predictWithPatternModel(features, model.patternModel)
      };

      // Weight the predictions (can be tuned based on historical accuracy)
      const weights = { statistical: 0.4, trend: 0.3, pattern: 0.3 };
      
      let weightedProbability = 0;
      let totalWeight = 0;
      const contributingFactors = [];

      for (const [modelType, prediction] of Object.entries(predictions)) {
        if (prediction && !isNaN(prediction.probability)) {
          weightedProbability += prediction.probability * weights[modelType];
          totalWeight += weights[modelType];
          
          if (prediction.factors) {
            contributingFactors.push(...prediction.factors);
          }
        }
      }

      const finalProbability = totalWeight > 0 ? weightedProbability / totalWeight : 0;
      
      // Calculate confidence based on model agreement
      const probabilities = Object.values(predictions)
        .filter(p => p && !isNaN(p.probability))
        .map(p => p.probability);
        
      const variance = this.calculateVariance(probabilities);
      const confidence = Math.max(0, 1 - variance); // Lower variance = higher confidence

      return {
        failureProbability: finalProbability,
        confidence: confidence,
        contributingFactors: this.consolidateFactors(contributingFactors),
        modelPredictions: predictions
      };
      
    } catch (error) {
      this.logger.error('Failure probability calculation failed:', error);
      return {
        failureProbability: 0,
        confidence: 0,
        contributingFactors: [],
        error: error.message
      };
    }
  }

  async detectAnomalies(repository, metrics) {
    try {
      const baseline = await this.getBaselineMetrics(repository);
      if (!baseline) return [];

      const anomalies = [];

      for (const [metric, value] of Object.entries(metrics)) {
        if (typeof value !== 'number' || !baseline[metric]) continue;

        const zScore = this.calculateZScore(value, baseline[metric]);
        
        if (Math.abs(zScore) > this.anomalyThreshold) {
          anomalies.push({
            metric,
            value,
            expected: baseline[metric].mean,
            deviation: Math.abs(zScore),
            severity: this.classifyAnomalySeverity(Math.abs(zScore)),
            direction: zScore > 0 ? 'increase' : 'decrease'
          });
        }
      }

      this.logger.debug(`Detected ${anomalies.length} anomalies for ${repository}`);
      return anomalies;
      
    } catch (error) {
      this.logger.error(`Anomaly detection failed for ${repository}:`, error);
      return [];
    }
  }

  generateRecommendations(prediction) {
    const recommendations = [];
    
    if (!prediction.contributingFactors || prediction.contributingFactors.length === 0) {
      return ['Monitor pipeline health regularly'];
    }
    
    for (const factor of prediction.contributingFactors) {
      switch (factor.type) {
        case 'duration-increase':
          recommendations.push('Optimize build performance and enable caching');
          recommendations.push('Review recent changes for performance impact');
          break;
          
        case 'success-rate-decline':
          recommendations.push('Investigate recent test failures');
          recommendations.push('Review code quality and test coverage');
          break;
          
        case 'queue-time-increase':
          recommendations.push('Add more build capacity or optimize scheduling');
          recommendations.push('Review concurrent pipeline limits');
          break;
          
        case 'failure-pattern':
          recommendations.push('Analyze failure logs for recurring issues');
          recommendations.push('Implement additional error handling');
          break;
          
        case 'resource-contention':
          recommendations.push('Monitor and optimize resource usage');
          recommendations.push('Consider pipeline parallelization');
          break;
          
        case 'dependency-issues':
          recommendations.push('Update and audit dependencies');
          recommendations.push('Implement dependency vulnerability scanning');
          break;
          
        case 'temporal-pattern':
          recommendations.push('Consider time-based factors in pipeline design');
          recommendations.push('Implement retry mechanisms for temporal failures');
          break;
          
        default:
          recommendations.push(`Address ${factor.type} issues`);
      }
    }
    
    // Remove duplicates and limit to most relevant
    return [...new Set(recommendations)].slice(0, 5);
  }

  // Statistical model methods
  trainStatisticalModel(data) {
    const failures = data.filter(d => d.conclusion === 'failure');
    const successes = data.filter(d => d.conclusion === 'success');
    
    return {
      failureRate: failures.length / data.length,
      avgFailureDuration: this.calculateAverage(failures, 'duration'),
      avgSuccessDuration: this.calculateAverage(successes, 'duration'),
      failureByHour: this.groupByHour(failures),
      failureByDay: this.groupByDay(failures)
    };
  }

  trainTrendModel(data) {
    const chronologicalData = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    return {
      durationTrend: this.calculateLinearTrend(chronologicalData, 'duration'),
      successTrend: this.calculateSuccessTrend(chronologicalData),
      recentTrend: this.calculateRecentTrend(chronologicalData.slice(-20)) // Last 20 runs
    };
  }

  trainPatternModel(data) {
    return {
      consecutiveFailurePatterns: this.findConsecutiveFailurePatterns(data),
      periodicPatterns: this.findPeriodicPatterns(data),
      changeBasedPatterns: this.findChangeBasedPatterns(data)
    };
  }

  predictWithStatisticalModel(features, model) {
    if (!model) return { probability: 0, factors: [] };
    
    let probability = model.failureRate;
    const factors = [];
    
    // Adjust based on current hour
    const currentHour = features.timeOfDay;
    if (model.failureByHour && model.failureByHour[currentHour]) {
      const hourlyRate = model.failureByHour[currentHour];
      if (hourlyRate > model.failureRate * 1.5) {
        probability *= 1.3;
        factors.push({ type: 'temporal-pattern', impact: 0.3, description: 'Higher failure rate at this time' });
      }
    }
    
    // Adjust based on recent performance
    if (features.avgDuration && model.avgSuccessDuration) {
      const durationRatio = features.avgDuration / model.avgSuccessDuration;
      if (durationRatio > 1.5) {
        probability *= 1.2;
        factors.push({ type: 'duration-increase', impact: 0.2, description: 'Increased build duration' });
      }
    }
    
    return { probability: Math.min(1, probability), factors };
  }

  predictWithTrendModel(features, model) {
    if (!model) return { probability: 0, factors: [] };
    
    let probability = 0.1; // Base probability
    const factors = [];
    
    // Check duration trend
    if (model.durationTrend > 0.1) { // 10% increase trend
      probability += 0.2;
      factors.push({ type: 'duration-increase', impact: 0.2, description: 'Increasing build duration trend' });
    }
    
    // Check success trend
    if (model.successTrend < -0.1) { // 10% decrease in success
      probability += 0.3;
      factors.push({ type: 'success-rate-decline', impact: 0.3, description: 'Declining success rate trend' });
    }
    
    return { probability: Math.min(1, probability), factors };
  }

  predictWithPatternModel(features, model) {
    if (!model) return { probability: 0, factors: [] };
    
    let probability = 0.05; // Base probability
    const factors = [];
    
    // Check for consecutive failure patterns
    if (model.consecutiveFailurePatterns && model.consecutiveFailurePatterns.maxConsecutive > 2) {
      probability += 0.25;
      factors.push({ type: 'failure-pattern', impact: 0.25, description: 'Pattern of consecutive failures detected' });
    }
    
    return { probability: Math.min(1, probability), factors };
  }

  // Utility methods
  async getHistoricalData(repository) {
    try {
      return await this.metrics.getPipelineRuns(repository, {
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        limit: 1000
      });
    } catch (error) {
      this.logger.error(`Failed to get historical data for ${repository}:`, error);
      return [];
    }
  }

  async getTrainingData(repository) {
    try {
      return await this.metrics.getPipelineRuns(repository, {
        since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        limit: 5000
      });
    } catch (error) {
      this.logger.error(`Failed to get training data for ${repository}:`, error);
      return [];
    }
  }

  calculateRecentAverage(data, field, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentData = data.filter(d => new Date(d.created_at || d.updated_at) > cutoff);
    
    if (recentData.length === 0) return null;
    
    const values = recentData.map(d => d[field]).filter(v => v != null && !isNaN(v));
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  }

  calculateRecentSuccessRate(data, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentData = data.filter(d => new Date(d.created_at || d.updated_at) > cutoff);
    
    if (recentData.length === 0) return null;
    
    const successful = recentData.filter(d => d.conclusion === 'success').length;
    return successful / recentData.length;
  }

  calculateRecentFailureRate(data, days = 7) {
    const successRate = this.calculateRecentSuccessRate(data, days);
    return successRate != null ? 1 - successRate : null;
  }

  calculateTrend(data, field, days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentData = data
      .filter(d => new Date(d.created_at || d.updated_at) > cutoff)
      .sort((a, b) => new Date(a.created_at || a.updated_at) - new Date(b.created_at || b.updated_at));
    
    if (recentData.length < 2) return 0;
    
    if (field === 'success') {
      // Calculate success rate trend
      const midpoint = Math.floor(recentData.length / 2);
      const firstHalf = recentData.slice(0, midpoint);
      const secondHalf = recentData.slice(midpoint);
      
      const firstSuccessRate = firstHalf.filter(d => d.conclusion === 'success').length / firstHalf.length;
      const secondSuccessRate = secondHalf.filter(d => d.conclusion === 'success').length / secondHalf.length;
      
      return secondSuccessRate - firstSuccessRate;
    } else {
      // Calculate linear trend for numeric fields
      return this.calculateLinearTrend(recentData, field);
    }
  }

  calculateLinearTrend(data, field) {
    const values = data.map(d => d[field]).filter(v => v != null && !isNaN(v));
    if (values.length < 2) return 0;
    
    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
    const sumXX = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgValue = sumY / n;
    
    return avgValue > 0 ? slope / avgValue : 0; // Relative slope
  }

  async getRecentRepositoryChanges(repository) {
    // This would integrate with your Git/VCS system
    // For now, return a placeholder value
    return Math.random() * 10; // 0-10 recent changes
  }

  calculateRunFrequency(data, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentRuns = data.filter(d => new Date(d.created_at || d.updated_at) > cutoff);
    return recentRuns.length / days; // Runs per day
  }

  getLastRunAge(data) {
    if (data.length === 0) return null;
    
    const lastRun = data.reduce((latest, run) => {
      const runDate = new Date(run.created_at || run.updated_at);
      const latestDate = new Date(latest.created_at || latest.updated_at);
      return runDate > latestDate ? run : latest;
    });
    
    return (Date.now() - new Date(lastRun.created_at || lastRun.updated_at)) / (60 * 60 * 1000); // Hours
  }

  async getTestCoverage(repository) {
    // Integration point for test coverage data
    return null; // Placeholder
  }

  async getCodeComplexity(repository) {
    // Integration point for code complexity metrics
    return null; // Placeholder
  }

  async getDependencyHealth(repository) {
    // Integration point for dependency health data
    return null; // Placeholder
  }

  async getConcurrentRuns(repository) {
    // Check for concurrent pipeline runs
    return 0; // Placeholder
  }

  async getResourceContention(repository) {
    // Check for resource contention
    return 0; // Placeholder
  }

  calculateZScore(value, baseline) {
    if (!baseline || baseline.stdDev === 0) return 0;
    return (value - baseline.mean) / baseline.stdDev;
  }

  async getBaselineMetrics(repository) {
    if (this.baselineData.has(repository)) {
      const baseline = this.baselineData.get(repository);
      // Refresh baseline every 24 hours
      if (Date.now() - baseline.lastUpdated < 24 * 60 * 60 * 1000) {
        return baseline.data;
      }
    }

    // Calculate new baseline
    const historicalData = await this.getHistoricalData(repository);
    if (!historicalData || historicalData.length < this.minDataPoints) return null;

    const baseline = this.calculateBaseline(historicalData);
    this.baselineData.set(repository, {
      data: baseline,
      lastUpdated: Date.now()
    });

    return baseline;
  }

  calculateBaseline(data) {
    const baseline = {};
    const fields = ['duration', 'queueTime'];
    
    for (const field of fields) {
      const values = data.map(d => d[field]).filter(v => v != null && !isNaN(v));
      if (values.length > 0) {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        baseline[field] = { mean, stdDev, variance, count: values.length };
      }
    }
    
    return baseline;
  }

  classifyAnomalySeverity(zScore) {
    if (zScore > 4) return 'critical';
    if (zScore > 3) return 'high';
    if (zScore > 2.5) return 'medium';
    return 'low';
  }

  calculateVariance(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return variance;
  }

  consolidateFactors(factors) {
    // Group similar factors and consolidate impact
    const factorMap = new Map();
    
    for (const factor of factors) {
      if (factorMap.has(factor.type)) {
        const existing = factorMap.get(factor.type);
        existing.impact = Math.max(existing.impact, factor.impact);
      } else {
        factorMap.set(factor.type, { ...factor });
      }
    }
    
    return Array.from(factorMap.values()).sort((a, b) => b.impact - a.impact);
  }

  // Pattern analysis methods
  analyzeFailurePattern(data) {
    const failures = data.filter(d => d.conclusion === 'failure');
    return {
      totalFailures: failures.length,
      failureRate: failures.length / data.length,
      avgTimeBetweenFailures: this.calculateAvgTimeBetweenFailures(failures)
    };
  }

  analyzeSeasonalFactors(data) {
    // Simple seasonal analysis
    const byHour = this.groupByHour(data);
    const byDay = this.groupByDay(data);
    
    return { byHour, byDay };
  }

  calculateAverage(data, field) {
    const values = data.map(d => d[field]).filter(v => v != null && !isNaN(v));
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  groupByHour(data) {
    const hourMap = new Map();
    
    for (const item of data) {
      const hour = new Date(item.created_at || item.updated_at).getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    }
    
    return Object.fromEntries(hourMap);
  }

  groupByDay(data) {
    const dayMap = new Map();
    
    for (const item of data) {
      const day = new Date(item.created_at || item.updated_at).getDay();
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    
    return Object.fromEntries(dayMap);
  }

  findConsecutiveFailurePatterns(data) {
    // Find patterns of consecutive failures
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    
    const sortedData = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    for (const run of sortedData) {
      if (run.conclusion === 'failure') {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    
    return { maxConsecutive };
  }

  findPeriodicPatterns(data) {
    // Placeholder for more sophisticated periodic pattern analysis
    return {};
  }

  findChangeBasedPatterns(data) {
    // Placeholder for change-based pattern analysis
    return {};
  }

  calculateSuccessTrend(data) {
    if (data.length < 10) return 0;
    
    const midpoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midpoint);
    const secondHalf = data.slice(midpoint);
    
    const firstSuccessRate = firstHalf.filter(d => d.conclusion === 'success').length / firstHalf.length;
    const secondSuccessRate = secondHalf.filter(d => d.conclusion === 'success').length / secondHalf.length;
    
    return secondSuccessRate - firstSuccessRate;
  }

  calculateRecentTrend(data) {
    if (data.length < 5) return 0;
    
    const durations = data.map(d => d.duration).filter(d => d != null);
    if (durations.length < 2) return 0;
    
    return this.calculateLinearTrend(data, 'duration');
  }

  calculateAvgTimeBetweenFailures(failures) {
    if (failures.length < 2) return null;
    
    const sortedFailures = failures.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let totalTime = 0;
    
    for (let i = 1; i < sortedFailures.length; i++) {
      const timeDiff = new Date(sortedFailures[i].created_at) - new Date(sortedFailures[i - 1].created_at);
      totalTime += timeDiff;
    }
    
    return totalTime / (sortedFailures.length - 1) / (60 * 60 * 1000); // Hours
  }

  createBaselineModel(repository) {
    return {
      repository,
      lastUpdated: Date.now(),
      dataPoints: 0,
      statisticalModel: { failureRate: 0.1 }, // 10% default failure rate
      trendModel: {},
      patternModel: {},
      baseline: {}
    };
  }
}

module.exports = PipelineAnomalyDetector;
const PipelineHealthMonitor = require('./pipelineHealthMonitor');
const PipelineAnomalyDetector = require('./pipelineAnomalyDetector');
const PerformanceTrendAnalyzer = require('./performanceTrendAnalyzer');
const { createLogger } = require('../../utils/logger');

class MonitoringService {
  constructor(services = {}) {
    this.logger = createLogger('MonitoringService');
    this.services = services;
    
    // Initialize monitoring components
    this.healthMonitor = new PipelineHealthMonitor(services);
    this.anomalyDetector = new PipelineAnomalyDetector(services.metrics);
    this.trendAnalyzer = new PerformanceTrendAnalyzer(services.metrics);
    
    this.isInitialized = false;
    this.monitoringStatus = {
      healthMonitoring: false,
      trendAnalysis: false,
      anomalyDetection: false
    };
  }

  async initialize() {
    try {
      this.logger.info('Initializing monitoring service');
      
      // Start health monitoring
      await this.healthMonitor.startMonitoring();
      this.monitoringStatus.healthMonitoring = true;
      
      this.isInitialized = true;
      this.logger.info('Monitoring service initialized successfully');
      
      return {
        success: true,
        timestamp: new Date(),
        status: this.monitoringStatus
      };
      
    } catch (error) {
      this.logger.error('Failed to initialize monitoring service:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      this.logger.info('Shutting down monitoring service');
      
      await this.healthMonitor.stopMonitoring();
      this.monitoringStatus.healthMonitoring = false;
      
      this.isInitialized = false;
      this.logger.info('Monitoring service shut down successfully');
      
    } catch (error) {
      this.logger.error('Error during monitoring service shutdown:', error);
      throw error;
    }
  }

  // Health monitoring methods
  async getHealthOverview() {
    if (!this.isInitialized) {
      throw new Error('Monitoring service not initialized');
    }
    
    return await this.healthMonitor.performHealthChecks();
  }

  async getRepositoryHealth(repository, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Monitoring service not initialized');
    }
    
    const health = await this.healthMonitor.checkRepositoryHealth(repository);
    
    // Add trend analysis if requested
    if (options.includeTrends) {
      health.trends = await this.trendAnalyzer.analyzeTrends(repository, {
        timeWindow: options.trendWindow || 'medium',
        includeForecasting: options.includeForecasting || false
      });
    }
    
    // Add predictions if requested
    if (options.includePredictions) {
      health.predictions = await this.anomalyDetector.predictFailure(repository);
    }
    
    return health;
  }

  // Trend analysis methods
  async analyzeTrends(repository, options = {}) {
    return await this.trendAnalyzer.analyzeTrends(repository, options);
  }

  async getPerformanceTrends(repositories = null, timeWindow = 'medium') {
    if (!repositories) {
      repositories = await this.healthMonitor.getMonitoredRepositories();
    }
    
    const trends = new Map();
    
    for (const repo of repositories) {
      try {
        const trend = await this.trendAnalyzer.analyzeTrends(repo, { timeWindow });
        trends.set(repo, trend);
      } catch (error) {
        this.logger.error(`Trend analysis failed for ${repo}:`, error);
        trends.set(repo, { error: error.message });
      }
    }
    
    return {
      timeWindow,
      timestamp: new Date(),
      repositories: Object.fromEntries(trends),
      summary: this.summarizeTrends(trends)
    };
  }

  // Anomaly detection and prediction methods
  async predictFailures(repositories = null) {
    if (!repositories) {
      repositories = await this.healthMonitor.getMonitoredRepositories();
    }
    
    const predictions = new Map();
    
    for (const repo of repositories) {
      try {
        const prediction = await this.anomalyDetector.predictFailure(repo);
        predictions.set(repo, prediction);
      } catch (error) {
        this.logger.error(`Failure prediction failed for ${repo}:`, error);
        predictions.set(repo, { error: error.message });
      }
    }
    
    return {
      timestamp: new Date(),
      predictions: Object.fromEntries(predictions),
      summary: this.summarizePredictions(predictions)
    };
  }

  async detectAnomalies(repository, metrics) {
    return await this.anomalyDetector.detectAnomalies(repository, metrics);
  }

  // Comprehensive monitoring dashboard data
  async getDashboardData(options = {}) {
    try {
      this.logger.debug('Generating dashboard data');
      
      const {
        includeTrends = true,
        includePredictions = true,
        includeAnomalies = true,
        timeWindow = 'medium'
      } = options;
      
      const dashboardData = {
        timestamp: new Date(),
        monitoring: {
          status: this.monitoringStatus,
          uptime: this.getMonitoringUptime()
        }
      };
      
      // Health overview
      dashboardData.health = await this.getHealthOverview();
      
      // Performance trends
      if (includeTrends) {
        dashboardData.trends = await this.getPerformanceTrends(null, timeWindow);
      }
      
      // Failure predictions
      if (includePredictions) {
        dashboardData.predictions = await this.predictFailures();
      }
      
      // System-wide insights
      dashboardData.insights = this.generateSystemInsights(dashboardData);
      
      // Alerts and recommendations
      dashboardData.alerts = this.generateAlerts(dashboardData);
      dashboardData.recommendations = this.generateRecommendations(dashboardData);
      
      this.logger.debug('Dashboard data generated successfully');
      return dashboardData;
      
    } catch (error) {
      this.logger.error('Failed to generate dashboard data:', error);
      throw error;
    }
  }

  // Alert and recommendation generation
  generateSystemInsights(data) {
    const insights = [];
    
    if (data.health) {
      const { overall } = data.health;
      const totalRepos = overall.healthy + overall.warning + overall.critical;
      
      if (totalRepos > 0) {
        const healthyPercentage = (overall.healthy / totalRepos) * 100;
        
        insights.push({
          type: 'health_overview',
          message: `${healthyPercentage.toFixed(1)}% of repositories are healthy`,
          severity: healthyPercentage >= 80 ? 'info' : healthyPercentage >= 60 ? 'warning' : 'critical'
        });
        
        if (overall.critical > 0) {
          insights.push({
            type: 'critical_repositories',
            message: `${overall.critical} repositories require immediate attention`,
            severity: 'critical'
          });
        }
      }
    }
    
    if (data.trends && data.trends.repositories) {
      const degradingRepos = Object.values(data.trends.repositories)
        .filter(trend => !trend.error && trend.summary?.overallTrend === 'degrading').length;
      
      if (degradingRepos > 0) {
        insights.push({
          type: 'performance_degradation',
          message: `${degradingRepos} repositories showing performance degradation`,
          severity: 'warning'
        });
      }
    }
    
    if (data.predictions && data.predictions.predictions) {
      const highRiskRepos = Object.values(data.predictions.predictions)
        .filter(pred => !pred.error && pred.probability > 0.7).length;
      
      if (highRiskRepos > 0) {
        insights.push({
          type: 'failure_risk',
          message: `${highRiskRepos} repositories at high risk of failure`,
          severity: 'warning'
        });
      }
    }
    
    return insights;
  }

  generateAlerts(data) {
    const alerts = [];
    
    // Critical health alerts
    if (data.health && data.health.overall.critical > 0) {
      alerts.push({
        id: `critical-health-${Date.now()}`,
        type: 'critical_health',
        title: 'Critical Pipeline Health Issues',
        message: `${data.health.overall.critical} repositories have critical health issues`,
        severity: 'critical',
        timestamp: new Date(),
        action: 'Review critical repositories immediately'
      });
    }
    
    // Performance degradation alerts
    if (data.trends) {
      const degradingCount = Object.values(data.trends.repositories || {})
        .filter(trend => !trend.error && trend.summary?.overallTrend === 'degrading').length;
      
      if (degradingCount >= 3) {
        alerts.push({
          id: `performance-degradation-${Date.now()}`,
          type: 'performance_degradation',
          title: 'Performance Degradation Detected',
          message: `${degradingCount} repositories showing performance degradation`,
          severity: 'warning',
          timestamp: new Date(),
          action: 'Investigate performance trends and optimize pipelines'
        });
      }
    }
    
    // High failure prediction alerts
    if (data.predictions) {
      const highRiskCount = Object.values(data.predictions.predictions || {})
        .filter(pred => !pred.error && pred.probability > 0.8).length;
      
      if (highRiskCount > 0) {
        alerts.push({
          id: `high-failure-risk-${Date.now()}`,
          type: 'failure_prediction',
          title: 'High Failure Risk Predicted',
          message: `${highRiskCount} repositories predicted to fail soon`,
          severity: 'warning',
          timestamp: new Date(),
          action: 'Review and address contributing factors'
        });
      }
    }
    
    return alerts;
  }

  generateRecommendations(data) {
    const recommendations = [];
    
    // Health-based recommendations
    if (data.health) {
      const { overall } = data.health;
      const totalRepos = overall.healthy + overall.warning + overall.critical;
      
      if (totalRepos > 0) {
        const healthyPercentage = (overall.healthy / totalRepos) * 100;
        
        if (healthyPercentage < 70) {
          recommendations.push({
            type: 'health_improvement',
            priority: 'high',
            title: 'Improve Overall Pipeline Health',
            description: 'Focus on addressing critical and warning status repositories',
            actions: [
              'Review and fix failing pipelines',
              'Optimize performance bottlenecks',
              'Implement better error handling',
              'Consider infrastructure scaling'
            ]
          });
        }
      }
    }
    
    // Trend-based recommendations
    if (data.trends) {
      const degradingRepos = Object.entries(data.trends.repositories || {})
        .filter(([_, trend]) => !trend.error && trend.summary?.overallTrend === 'degrading');
      
      if (degradingRepos.length > 0) {
        recommendations.push({
          type: 'performance_optimization',
          priority: 'medium',
          title: 'Address Performance Degradation',
          description: 'Several repositories show declining performance trends',
          actions: [
            'Review recent changes affecting performance',
            'Optimize build caching and parallelization',
            'Monitor resource usage and scaling',
            'Implement performance budgets'
          ]
        });
      }
    }
    
    // Prediction-based recommendations
    if (data.predictions) {
      const riskCount = Object.values(data.predictions.predictions || {})
        .filter(pred => !pred.error && pred.probability > 0.6).length;
      
      if (riskCount > 0) {
        recommendations.push({
          type: 'proactive_maintenance',
          priority: 'medium',
          title: 'Proactive Failure Prevention',
          description: 'Take preventive action for repositories at risk',
          actions: [
            'Review and stabilize flaky tests',
            'Update dependencies and security patches',
            'Improve monitoring and alerting',
            'Implement circuit breakers and retries'
          ]
        });
      }
    }
    
    return recommendations;
  }

  // Utility methods
  summarizeTrends(trends) {
    const validTrends = Array.from(trends.values()).filter(t => !t.error);
    
    if (validTrends.length === 0) {
      return { message: 'No trend data available' };
    }
    
    const improving = validTrends.filter(t => t.summary?.overallTrend === 'improving').length;
    const stable = validTrends.filter(t => t.summary?.overallTrend === 'stable').length;
    const degrading = validTrends.filter(t => t.summary?.overallTrend === 'degrading').length;
    
    return {
      total: validTrends.length,
      improving,
      stable,
      degrading,
      overallHealth: degrading === 0 ? 'good' : degrading < improving ? 'fair' : 'concerning'
    };
  }

  summarizePredictions(predictions) {
    const validPredictions = Array.from(predictions.values()).filter(p => !p.error);
    
    if (validPredictions.length === 0) {
      return { message: 'No prediction data available' };
    }
    
    const lowRisk = validPredictions.filter(p => p.probability < 0.3).length;
    const mediumRisk = validPredictions.filter(p => p.probability >= 0.3 && p.probability < 0.7).length;
    const highRisk = validPredictions.filter(p => p.probability >= 0.7).length;
    
    const avgProbability = validPredictions.reduce((sum, p) => sum + p.probability, 0) / validPredictions.length;
    
    return {
      total: validPredictions.length,
      lowRisk,
      mediumRisk,
      highRisk,
      averageProbability: Math.round(avgProbability * 1000) / 1000,
      riskLevel: highRisk > 0 ? 'high' : mediumRisk > lowRisk ? 'medium' : 'low'
    };
  }

  getMonitoringUptime() {
    // This would track actual uptime - placeholder for now
    return {
      started: new Date(),
      uptimeSeconds: 0,
      uptimePercentage: 100
    };
  }

  // Configuration and status methods
  getStatus() {
    return {
      initialized: this.isInitialized,
      monitoring: this.monitoringStatus,
      timestamp: new Date()
    };
  }

  async updateConfiguration(config) {
    this.logger.info('Updating monitoring configuration');
    
    if (config.thresholds && this.healthMonitor) {
      this.healthMonitor.updateThresholds(config.thresholds);
    }
    
    return {
      success: true,
      timestamp: new Date(),
      message: 'Configuration updated successfully'
    };
  }
}

// Factory function for creating monitoring service
function createMonitoringService(services = {}) {
  return new MonitoringService(services);
}

// Service initialization function for use in server setup
async function initializeMonitoringService(services = {}) {
  const monitoringService = new MonitoringService(services);
  await monitoringService.initialize();
  return monitoringService;
}

module.exports = {
  MonitoringService,
  PipelineHealthMonitor,
  PipelineAnomalyDetector,
  PerformanceTrendAnalyzer,
  createMonitoringService,
  initializeMonitoringService
};
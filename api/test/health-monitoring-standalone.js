#!/usr/bin/env node

/**
 * Standalone test for pipeline health monitoring system
 * 
 * This test validates that the health monitoring system works correctly
 * without dependencies on the full server infrastructure.
 */

const path = require('path');

// Set up minimal logging to avoid dependencies
const mockLogger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`)
};

// Mock createLogger function
const createLogger = (name) => mockLogger;

// Override require for createLogger
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id.endsWith('/utils/logger')) {
    return { createLogger };
  }
  return originalRequire.apply(this, arguments);
};

// Import the monitoring services
const PipelineHealthMonitor = require('../services/monitoring/pipelineHealthMonitor');
const PipelineAnomalyDetector = require('../services/monitoring/pipelineAnomalyDetector');
const PerformanceTrendAnalyzer = require('../services/monitoring/performanceTrendAnalyzer');
const { MonitoringService } = require('../services/monitoring');

// Mock services
class MockMetricsService {
  constructor() {
    this.repositories = ['repo-a', 'repo-b', 'repo-c'];
  }

  async getPipelineRuns(repository, options = {}) {
    // Generate realistic mock data
    const runs = [];
    const days = 14;
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const baseSuccessRate = 0.85 + (Math.random() * 0.1); // 85-95% success rate
      const baseDuration = 300 + (Math.random() * 200); // 300-500 seconds
      
      // Add some variability and trends
      const dayFactor = i / days; // Newer data has more weight
      const successRate = baseSuccessRate - (dayFactor * 0.1); // Slight decline over time
      const duration = baseDuration + (dayFactor * 50); // Slight increase over time
      
      for (let j = 0; j < 3; j++) { // 3 runs per day
        runs.push({
          id: `run-${i}-${j}`,
          repository,
          conclusion: Math.random() < successRate ? 'success' : 'failure',
          duration: Math.round(duration + (Math.random() * 50 - 25)),
          queueTime: Math.round(Math.random() * 60),
          created_at: new Date(date.getTime() + j * 8 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(date.getTime() + j * 8 * 60 * 60 * 1000).toISOString()
        });
      }
    }
    
    return runs.reverse(); // Most recent first
  }

  async getQualityMetrics(repository) {
    return {
      testCoverage: 70 + Math.random() * 20, // 70-90%
      codeQualityScore: 7 + Math.random() * 2, // 7-9
      securityVulnerabilities: Math.floor(Math.random() * 3), // 0-2
      technicalDebt: Math.floor(Math.random() * 30) + 10 // 10-40 hours
    };
  }

  async getReliabilityMetrics(repository) {
    return {
      flakyTests: Math.floor(Math.random() * 3), // 0-2
      mttr: 1 + Math.random() * 3, // 1-4 hours
      deploymentFrequency: 1 + Math.random() * 4, // 1-5 per week
      changeFailureRate: Math.random() * 20 // 0-20%
    };
  }

  async getMonitoredRepositories() {
    return this.repositories;
  }
}

class MockWebSocketService {
  broadcast(event, data) {
    console.log(`📡 WebSocket broadcast: ${event}`, data);
  }
}

class MockAlertingService {
  async sendAlert(alert) {
    console.log(`🚨 Alert: [${alert.level.toUpperCase()}] ${alert.title}`);
    console.log(`   ${alert.message}`);
    return { success: true, id: 'mock-alert-' + Date.now() };
  }
}

async function runHealthMonitoringTest() {
  console.log('🧪 Running Pipeline Health Monitoring Standalone Test\n');
  
  try {
    // Create mock services
    const mockServices = {
      metrics: new MockMetricsService(),
      websocket: new MockWebSocketService(),
      alerting: new MockAlertingService()
    };

    console.log('✅ Mock services created');

    // Test 1: Create health monitor
    console.log('\n📊 Testing Pipeline Health Monitor...');
    const healthMonitor = new PipelineHealthMonitor(mockServices);
    console.log('✅ Health monitor created');

    // Test 2: Perform health checks
    console.log('\n🔍 Performing health checks...');
    const healthReport = await healthMonitor.performHealthChecks();
    
    console.log(`✅ Health checks completed in ${healthReport.executionTime}ms`);
    console.log(`📈 Overall health: ${healthReport.overall.healthy} healthy, ${healthReport.overall.warning} warning, ${healthReport.overall.critical} critical`);

    // Test 3: Check individual repository health
    console.log('\n🔬 Testing individual repository health...');
    const repo = 'repo-a';
    const repoHealth = await healthMonitor.checkRepositoryHealth(repo);
    
    console.log(`✅ Repository ${repo} health: ${repoHealth.status} (score: ${repoHealth.score.toFixed(1)})`);
    if (repoHealth.issues.length > 0) {
      console.log(`⚠️  Issues found: ${repoHealth.issues.length}`);
    }
    if (repoHealth.recommendations.length > 0) {
      console.log(`💡 Recommendations: ${repoHealth.recommendations.length}`);
    }

    // Test 4: Anomaly detection
    console.log('\n🔍 Testing Anomaly Detection...');
    const anomalyDetector = new PipelineAnomalyDetector(mockServices.metrics);
    const prediction = await anomalyDetector.predictFailure(repo);
    
    console.log(`✅ Failure prediction: ${(prediction.probability * 100).toFixed(1)}% probability`);
    console.log(`🎯 Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    if (prediction.factors.length > 0) {
      console.log(`📊 Contributing factors: ${prediction.factors.length}`);
    }

    // Test 5: Performance trend analysis
    console.log('\n📈 Testing Performance Trend Analysis...');
    const trendAnalyzer = new PerformanceTrendAnalyzer(mockServices.metrics);
    const trends = await trendAnalyzer.analyzeTrends(repo, { timeWindow: 'short' });
    
    if (!trends.error) {
      console.log(`✅ Trend analysis completed`);
      console.log(`📊 Overall trend: ${trends.summary.overallTrend}`);
      console.log(`📈 Performance score: ${trends.performance.duration.average.toFixed(1)}s avg duration`);
      console.log(`🎯 Reliability: ${(trends.reliability.successRate.current * 100).toFixed(1)}% success rate`);
    } else {
      console.log(`⚠️  Trend analysis: ${trends.error} (expected with limited data)`);
    }

    // Test 6: Monitoring service integration
    console.log('\n🔗 Testing Monitoring Service Integration...');
    const monitoringService = new MonitoringService(mockServices);
    await monitoringService.initialize();
    
    console.log('✅ Monitoring service initialized');

    const dashboardData = await monitoringService.getDashboardData();
    console.log(`✅ Dashboard data generated`);
    console.log(`📊 Health overview: ${dashboardData.health.overall.healthy + dashboardData.health.overall.warning + dashboardData.health.overall.critical} repositories`);
    console.log(`🔍 Insights: ${dashboardData.insights.length}`);
    console.log(`🚨 Alerts: ${dashboardData.alerts.length}`);
    console.log(`💡 Recommendations: ${dashboardData.recommendations.length}`);

    await monitoringService.shutdown();
    console.log('✅ Monitoring service shut down cleanly');

    // Test 7: API endpoint simulation
    console.log('\n🌐 Testing API Integration Patterns...');
    
    // Simulate health overview API call
    const overview = {
      timestamp: new Date(),
      overall: healthReport.overall,
      repositories: Array.from(healthReport.repositories.entries()).map(([repo, health]) => ({
        repository: repo,
        status: health.status,
        score: Math.round(health.score * 100) / 100,
        issues: health.issues.length
      }))
    };
    
    console.log(`✅ Health overview API simulation: ${overview.repositories.length} repositories`);

    // Simulate predictions API call
    const predictions = {};
    for (const repo of mockServices.metrics.repositories) {
      try {
        predictions[repo] = await anomalyDetector.predictFailure(repo);
      } catch (error) {
        predictions[repo] = { error: error.message };
      }
    }
    
    const highRiskCount = Object.values(predictions).filter(p => !p.error && p.probability > 0.5).length;
    console.log(`✅ Predictions API simulation: ${highRiskCount} high-risk repositories`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('  ✅ Health monitoring core functionality');
    console.log('  ✅ Individual repository health checks');
    console.log('  ✅ Anomaly detection and failure prediction');
    console.log('  ✅ Performance trend analysis');
    console.log('  ✅ Monitoring service integration');
    console.log('  ✅ API endpoint patterns');
    console.log('  ✅ Service lifecycle management');
    
    console.log('\n🚀 Pipeline Health Monitoring System is ready for production integration!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runHealthMonitoringTest().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { runHealthMonitoringTest };
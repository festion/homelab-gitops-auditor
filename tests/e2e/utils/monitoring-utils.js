const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

class MonitoringUtils {
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl || 'http://localhost:3000';
    this.dashboardUrl = config.dashboardUrl || 'http://localhost:8080';
    this.mcpServerUrl = config.mcpServerUrl || 'http://localhost:8081';
    this.pollInterval = config.pollInterval || 2000;
    this.maxRetries = config.maxRetries || 150; // 5 minutes at 2s intervals
    this.metrics = {
      deployments: {},
      performance: {},
      resources: {},
      errors: []
    };
  }

  async pollDeploymentStatus(deploymentId, timeout = 300000) {
    const startTime = performance.now();
    const endTime = startTime + timeout;
    let attempts = 0;
    
    while (performance.now() < endTime && attempts < this.maxRetries) {
      try {
        const response = await axios.get(`${this.apiBaseUrl}/api/deployments/${deploymentId}`);
        const deployment = response.data;
        
        // Track deployment progress metrics
        this.recordDeploymentMetric(deploymentId, {
          status: deployment.status,
          progress: deployment.progress || 0,
          timestamp: Date.now(),
          attempt: attempts + 1,
          elapsedMs: performance.now() - startTime
        });

        // Check for completion states
        if (deployment.status === 'completed') {
          return {
            success: true,
            deployment,
            totalTime: performance.now() - startTime,
            attempts: attempts + 1
          };
        }
        
        if (deployment.status === 'failed') {
          return {
            success: false,
            deployment,
            totalTime: performance.now() - startTime,
            attempts: attempts + 1,
            error: deployment.error || 'Deployment failed'
          };
        }

        // Continue polling for in-progress states
        if (['pending', 'in_progress', 'deploying'].includes(deployment.status)) {
          await this.sleep(this.pollInterval);
          attempts++;
          continue;
        }

        // Unknown status
        throw new Error(`Unknown deployment status: ${deployment.status}`);
        
      } catch (error) {
        this.recordError('deployment_polling', error, { deploymentId, attempt: attempts + 1 });
        
        // If it's a network error, continue polling
        if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
          await this.sleep(this.pollInterval);
          attempts++;
          continue;
        }
        
        // For other errors, fail immediately
        throw error;
      }
    }
    
    // Timeout reached
    throw new Error(`Deployment ${deploymentId} did not complete within ${timeout}ms (${attempts} attempts)`);
  }

  async waitForServiceHealth(serviceName, url, healthPath = '/health', timeout = 120000) {
    const startTime = performance.now();
    const endTime = startTime + timeout;
    let attempts = 0;
    
    while (performance.now() < endTime) {
      try {
        const response = await axios.get(`${url}${healthPath}`, {
          timeout: 5000,
          validateStatus: status => status < 500
        });
        
        if (response.status === 200) {
          const healthTime = performance.now() - startTime;
          this.recordPerformanceMetric(`${serviceName}_health_check`, {
            responseTime: healthTime,
            attempts: attempts + 1,
            success: true
          });
          
          return {
            healthy: true,
            responseTime: healthTime,
            attempts: attempts + 1,
            response: response.data
          };
        }
        
      } catch (error) {
        this.recordError('service_health_check', error, { serviceName, url, attempt: attempts + 1 });
      }
      
      await this.sleep(2000);
      attempts++;
    }
    
    throw new Error(`Service ${serviceName} at ${url} did not become healthy within ${timeout}ms`);
  }

  async measureApiResponseTime(endpoint, method = 'GET', data = null) {
    const startTime = performance.now();
    
    try {
      const config = {
        method: method.toLowerCase(),
        url: `${this.apiBaseUrl}${endpoint}`,
        timeout: 30000
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      const responseTime = performance.now() - startTime;
      
      this.recordPerformanceMetric('api_response_time', {
        endpoint,
        method,
        responseTime,
        statusCode: response.status,
        success: true
      });
      
      return {
        responseTime,
        status: response.status,
        data: response.data
      };
      
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      this.recordPerformanceMetric('api_response_time', {
        endpoint,
        method,
        responseTime,
        statusCode: error.response?.status || 0,
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }

  async captureResourceUsage(label = 'default') {
    try {
      // Capture memory usage
      const memUsage = process.memoryUsage();
      
      // Attempt to get system metrics if available
      let systemMetrics = {};
      try {
        const os = require('os');
        systemMetrics = {
          loadAverage: os.loadavg(),
          freeMemory: os.freemem(),
          totalMemory: os.totalmem(),
          cpuUsage: process.cpuUsage()
        };
      } catch (err) {
        // System metrics not available
      }
      
      const metrics = {
        timestamp: Date.now(),
        label,
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        },
        system: systemMetrics
      };
      
      this.recordResourceMetric(label, metrics);
      return metrics;
      
    } catch (error) {
      this.recordError('resource_capture', error, { label });
      return null;
    }
  }

  async validateDeploymentArtifacts(deploymentId) {
    try {
      // Check if deployment created expected artifacts
      const deployment = await this.getDeployment(deploymentId);
      
      const validations = {
        configUpdated: false,
        servicesRestarted: false,
        healthChecksPass: false,
        logsGenerated: false
      };
      
      // Validate configuration was updated
      if (deployment.configHash && deployment.targetConfigHash) {
        validations.configUpdated = deployment.configHash === deployment.targetConfigHash;
      }
      
      // Validate services were restarted (check restart timestamps)
      if (deployment.restartedServices && deployment.restartedServices.length > 0) {
        validations.servicesRestarted = true;
      }
      
      // Validate health checks pass
      try {
        await this.waitForServiceHealth('homeassistant', 'http://localhost:8123', '/api/', 30000);
        validations.healthChecksPass = true;
      } catch (error) {
        validations.healthChecksPass = false;
      }
      
      // Validate logs were generated
      const logEntries = await this.getDeploymentLogs(deploymentId);
      validations.logsGenerated = logEntries && logEntries.length > 0;
      
      return validations;
      
    } catch (error) {
      this.recordError('artifact_validation', error, { deploymentId });
      throw error;
    }
  }

  async getDeployment(deploymentId) {
    const response = await axios.get(`${this.apiBaseUrl}/api/deployments/${deploymentId}`);
    return response.data;
  }

  async getDeploymentLogs(deploymentId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/deployments/${deploymentId}/logs`);
      return response.data.logs || [];
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  recordDeploymentMetric(deploymentId, metric) {
    if (!this.metrics.deployments[deploymentId]) {
      this.metrics.deployments[deploymentId] = [];
    }
    this.metrics.deployments[deploymentId].push(metric);
  }

  recordPerformanceMetric(operation, metric) {
    if (!this.metrics.performance[operation]) {
      this.metrics.performance[operation] = [];
    }
    this.metrics.performance[operation].push({
      ...metric,
      timestamp: Date.now()
    });
  }

  recordResourceMetric(label, metric) {
    if (!this.metrics.resources[label]) {
      this.metrics.resources[label] = [];
    }
    this.metrics.resources[label].push(metric);
  }

  recordError(operation, error, context = {}) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      operation,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.response?.status
      },
      context
    });
  }

  getMetricsSummary() {
    const summary = {
      deployments: {},
      performance: {},
      resources: {},
      errors: this.metrics.errors.length
    };
    
    // Summarize deployment metrics
    for (const [deploymentId, metrics] of Object.entries(this.metrics.deployments)) {
      const lastMetric = metrics[metrics.length - 1];
      summary.deployments[deploymentId] = {
        finalStatus: lastMetric?.status,
        totalTime: lastMetric?.elapsedMs,
        attempts: lastMetric?.attempt,
        progressPoints: metrics.length
      };
    }
    
    // Summarize performance metrics
    for (const [operation, metrics] of Object.entries(this.metrics.performance)) {
      const responseTimes = metrics.map(m => m.responseTime || 0);
      summary.performance[operation] = {
        count: metrics.length,
        avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        minResponseTime: Math.min(...responseTimes),
        maxResponseTime: Math.max(...responseTimes),
        successRate: metrics.filter(m => m.success).length / metrics.length
      };
    }
    
    // Summarize resource metrics
    for (const [label, metrics] of Object.entries(this.metrics.resources)) {
      const memoryUsage = metrics.map(m => m.memory?.heapUsed || 0);
      summary.resources[label] = {
        samples: metrics.length,
        avgMemoryUsage: memoryUsage.reduce((a, b) => a + b, 0) / memoryUsage.length,
        maxMemoryUsage: Math.max(...memoryUsage),
        timeSpan: metrics.length > 0 ? 
          metrics[metrics.length - 1].timestamp - metrics[0].timestamp : 0
      };
    }
    
    return summary;
  }

  async saveMetricsReport(testName, outputDir = './test-results') {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      
      const report = {
        testName,
        timestamp: new Date().toISOString(),
        summary: this.getMetricsSummary(),
        detailedMetrics: this.metrics
      };
      
      const filename = `${testName}-metrics-${Date.now()}.json`;
      const filepath = path.join(outputDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      
      return filepath;
      
    } catch (error) {
      console.error('Failed to save metrics report:', error);
      throw error;
    }
  }

  clearMetrics() {
    this.metrics = {
      deployments: {},
      performance: {},
      resources: {},
      errors: []
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MonitoringUtils;
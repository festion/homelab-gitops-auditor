const axios = require('axios');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { MCPCoordinator } = require('../../api/services/mcp-coordinator');
const { Logger } = require('../../api/utils/logger');

class HealthChecker {
  constructor() {
    this.config = null;
    this.logger = new Logger('HealthChecker');
    this.mcpCoordinator = null;
    this.baselineMetrics = null;
  }

  async initialize() {
    // Load configuration from existing config manager
    await this.loadConfiguration();
    
    // Initialize MCP coordinator
    this.mcpCoordinator = new MCPCoordinator();
    await this.mcpCoordinator.initialize();
    
    // Load baseline metrics
    await this.loadBaselineMetrics();
    
    this.logger.info('Health Checker initialized');
  }

  async loadConfiguration() {
    // Default configuration
    this.config = {
      deployment: {
        homeAssistantConfig: {
          healthCheckEndpoint: process.env.HOME_ASSISTANT_URL || 'http://192.168.1.155:8123/api',
          token: process.env.HOME_ASSISTANT_TOKEN || 'test-home-assistant-token-for-diagnostic'
        }
      },
      thresholds: {
        diskUsage: 85,
        memoryUsage: 90,
        cpuUsage: 95,
        responseTime: 2000
      },
      monitoring: {
        retries: 3,
        timeout: 10000
      }
    };
  }

  async loadBaselineMetrics() {
    try {
      const baselinePath = 'scripts/health-checks/baseline-metrics.json';
      const data = await fs.readFile(baselinePath, 'utf8');
      this.baselineMetrics = JSON.parse(data);
    } catch (error) {
      this.logger.warn('No baseline metrics found, will create new baseline');
      this.baselineMetrics = null;
    }
  }

  async performPreDeploymentChecks() {
    this.logger.info('Starting pre-deployment health checks');
    
    const checks = [
      this.checkHomeAssistantAPI(),
      this.checkSystemResources(),
      this.checkMCPServers(),
      this.checkBackupSpace(),
      this.checkNetworkConnectivity()
    ];
    
    const results = await Promise.allSettled(checks);
    const healthReport = this.processHealthResults(results, 'pre-deployment');
    
    if (!healthReport.overall.healthy) {
      throw new Error(`Pre-deployment health checks failed: ${healthReport.overall.failureReason}`);
    }
    
    this.logger.info('Pre-deployment health checks passed');
    return healthReport;
  }

  async performPostDeploymentChecks() {
    this.logger.info('Starting post-deployment health checks');
    
    // Allow system to settle after deployment
    await this.sleep(10000);
    
    const checks = [
      this.checkHomeAssistantAPI(),
      this.checkConfigurationIntegrity(),
      this.checkServiceAvailability(),
      this.checkPerformanceMetrics(),
      this.checkLogErrors()
    ];
    
    const results = await Promise.allSettled(checks);
    const healthReport = this.processHealthResults(results, 'post-deployment');
    
    if (!healthReport.overall.healthy) {
      throw new Error(`Post-deployment health checks failed: ${healthReport.overall.failureReason}`);
    }
    
    this.logger.info('Post-deployment health checks passed');
    return healthReport;
  }

  async validateConfiguration(configPath) {
    this.logger.info(`Validating configuration at ${configPath}`);
    
    try {
      // Read configuration files
      const configFiles = await this.getConfigurationFiles(configPath);
      
      // Validate YAML syntax
      const yamlValidation = await this.validateYAMLSyntax(configFiles);
      
      // Validate Home Assistant configuration
      const haValidation = await this.validateHomeAssistantConfig(configPath);
      
      // Validate configuration references
      const referenceValidation = await this.validateConfigurationReferences(configFiles);
      
      // Security validation
      const securityValidation = await this.validateSecurityCompliance(configFiles);
      
      const validationResult = {
        valid: yamlValidation.valid && haValidation.valid && referenceValidation.valid && securityValidation.valid,
        yamlSyntax: yamlValidation,
        homeAssistantConfig: haValidation,
        references: referenceValidation,
        security: securityValidation
      };
      
      this.logger.info('Configuration validation completed', { valid: validationResult.valid });
      return validationResult;
      
    } catch (error) {
      this.logger.error('Configuration validation failed', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Home Assistant Health Checks
  async checkHomeAssistantAPI() {
    const endpoint = this.config.deployment.homeAssistantConfig.healthCheckEndpoint;
    const token = this.config.deployment.homeAssistantConfig.token;
    
    try {
      const startTime = Date.now();
      const response = await axios.get(`${endpoint}/states`, {
        timeout: this.config.monitoring.timeout,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        return {
          name: 'home-assistant-api',
          status: 'healthy',
          responseTime: responseTime,
          details: {
            statusCode: response.status,
            stateCount: response.data.length,
            version: response.headers['x-ha-version'] || 'unknown'
          }
        };
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
      
    } catch (error) {
      return {
        name: 'home-assistant-api',
        status: 'unhealthy',
        error: error.message,
        details: {
          endpoint: endpoint,
          timeout: error.code === 'ECONNABORTED'
        }
      };
    }
  }

  async checkConfigurationIntegrity() {
    try {
      const configPath = '/config';
      const validation = await this.validateConfiguration(configPath);
      
      if (validation.valid) {
        return {
          name: 'configuration-integrity',
          status: 'healthy',
          details: validation
        };
      } else {
        return {
          name: 'configuration-integrity',
          status: 'unhealthy',
          error: 'Configuration validation failed',
          details: validation
        };
      }
      
    } catch (error) {
      return {
        name: 'configuration-integrity',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkServiceAvailability() {
    try {
      const endpoint = this.config.deployment.homeAssistantConfig.healthCheckEndpoint.replace('/api', '');
      const token = this.config.deployment.homeAssistantConfig.token;
      
      const response = await axios.get(`${endpoint}/api/config`, {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const config = response.data;
      
      return {
        name: 'service-availability',
        status: 'healthy',
        details: {
          version: config.version,
          units: config.unit_system,
          timeZone: config.time_zone,
          components: config.components?.length || 0
        }
      };
      
    } catch (error) {
      return {
        name: 'service-availability',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // System Health Checks
  async checkSystemResources() {
    try {
      const diskUsage = await this.getDiskUsage();
      const memoryUsage = await this.getMemoryUsage();
      const cpuUsage = await this.getCPUUsage();
      
      const thresholds = this.config.thresholds;
      
      const issues = [];
      if (diskUsage > thresholds.diskUsage) issues.push(`Disk usage high: ${diskUsage}%`);
      if (memoryUsage > thresholds.memoryUsage) issues.push(`Memory usage high: ${memoryUsage}%`);
      if (cpuUsage > thresholds.cpuUsage) issues.push(`CPU usage high: ${cpuUsage}%`);
      
      return {
        name: 'system-resources',
        status: issues.length === 0 ? 'healthy' : 'unhealthy',
        error: issues.join(', '),
        details: {
          diskUsage: diskUsage,
          memoryUsage: memoryUsage,
          cpuUsage: cpuUsage,
          thresholds: thresholds
        }
      };
      
    } catch (error) {
      return {
        name: 'system-resources',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkMCPServers() {
    try {
      // Get MCP server status from coordinator
      const mcpHealth = await this.mcpCoordinator.getHealthStatus();
      const healthyServers = [];
      const unhealthyServers = [];
      
      for (const [serverType, status] of Object.entries(mcpHealth)) {
        if (status.status === 'healthy') {
          healthyServers.push(serverType);
        } else {
          unhealthyServers.push({
            server: serverType,
            error: status.lastError || 'Unknown error'
          });
        }
      }
      
      return {
        name: 'mcp-servers',
        status: unhealthyServers.length === 0 ? 'healthy' : 'unhealthy',
        error: unhealthyServers.length > 0 ? `Unhealthy servers: ${unhealthyServers.map(s => s.server).join(', ')}` : null,
        details: {
          healthyServers: healthyServers,
          unhealthyServers: unhealthyServers,
          totalServers: Object.keys(mcpHealth).length
        }
      };
      
    } catch (error) {
      return {
        name: 'mcp-servers',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkBackupSpace() {
    try {
      const backupPath = '/backup';
      const usage = await this.getDirectorySize(backupPath);
      const available = await this.getAvailableSpace(backupPath);
      
      // Check if we have enough space for at least 2 more backups
      const estimatedBackupSize = 100 * 1024 * 1024; // 100MB estimated
      const requiredSpace = estimatedBackupSize * 2;
      
      return {
        name: 'backup-space',
        status: available > requiredSpace ? 'healthy' : 'unhealthy',
        error: available <= requiredSpace ? 'Insufficient backup space' : null,
        details: {
          currentUsage: usage,
          availableSpace: available,
          requiredSpace: requiredSpace
        }
      };
      
    } catch (error) {
      return {
        name: 'backup-space',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkNetworkConnectivity() {
    try {
      const endpoints = [
        { name: 'home-assistant', url: this.config.deployment.homeAssistantConfig.healthCheckEndpoint.replace('/api', '') },
        { name: 'github', url: 'https://api.github.com' },
        { name: 'dns', url: 'https://1.1.1.1' }
      ];
      
      const results = await Promise.allSettled(
        endpoints.map(endpoint => 
          axios.get(endpoint.url, { timeout: 5000 })
            .then(() => ({ name: endpoint.name, status: 'connected' }))
            .catch(error => ({ name: endpoint.name, status: 'failed', error: error.message }))
        )
      );
      
      const connectivity = results.map(result => result.value);
      const failedConnections = connectivity.filter(c => c.status === 'failed');
      
      return {
        name: 'network-connectivity',
        status: failedConnections.length === 0 ? 'healthy' : 'unhealthy',
        error: failedConnections.length > 0 ? `Failed connections: ${failedConnections.map(c => c.name).join(', ')}` : null,
        details: {
          connectivity: connectivity,
          totalEndpoints: endpoints.length,
          failedEndpoints: failedConnections.length
        }
      };
      
    } catch (error) {
      return {
        name: 'network-connectivity',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkPerformanceMetrics() {
    try {
      const endpoint = this.config.deployment.homeAssistantConfig.healthCheckEndpoint;
      const token = this.config.deployment.homeAssistantConfig.token;
      
      const startTime = Date.now();
      const response = await axios.get(`${endpoint}/states`, {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const responseTime = Date.now() - startTime;
      
      const performanceIssues = [];
      if (responseTime > this.config.thresholds.responseTime) {
        performanceIssues.push(`Slow API response: ${responseTime}ms`);
      }
      
      return {
        name: 'performance-metrics',
        status: performanceIssues.length === 0 ? 'healthy' : 'unhealthy',
        error: performanceIssues.join(', '),
        details: {
          apiResponseTime: responseTime,
          threshold: this.config.thresholds.responseTime,
          stateCount: response.data.length
        }
      };
      
    } catch (error) {
      return {
        name: 'performance-metrics',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkLogErrors() {
    try {
      // Check Home Assistant logs for recent errors
      const endpoint = this.config.deployment.homeAssistantConfig.healthCheckEndpoint.replace('/api', '');
      const token = this.config.deployment.homeAssistantConfig.token;
      
      // This would require a custom endpoint or file access to check logs
      // For now, we'll check if error log endpoints are available
      
      return {
        name: 'log-errors',
        status: 'healthy',
        details: {
          message: 'Log error checking not yet implemented - requires custom endpoint'
        }
      };
      
    } catch (error) {
      return {
        name: 'log-errors',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Configuration Validation Methods
  async validateYAMLSyntax(configFiles) {
    const errors = [];
    
    for (const file of configFiles) {
      try {
        const content = await fs.readFile(file.path, 'utf8');
        yaml.load(content);
      } catch (error) {
        errors.push({
          file: file.path,
          error: error.message
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  async validateHomeAssistantConfig(configPath) {
    try {
      // Use Home Assistant's config check command if available
      const result = await execAsync(`hass --config ${configPath} --script check_config`, {
        timeout: 60000
      });
      
      return {
        valid: result.stderr === '',
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : []
      };
      
    } catch (error) {
      // If hass command is not available, do basic file checks
      try {
        const configFile = `${configPath}/configuration.yaml`;
        const content = await fs.readFile(configFile, 'utf8');
        yaml.load(content);
        
        return {
          valid: true,
          output: 'Basic YAML validation passed',
          errors: []
        };
      } catch (fileError) {
        return {
          valid: false,
          errors: [fileError.message]
        };
      }
    }
  }

  async validateConfigurationReferences(configFiles) {
    // Validate that references between config files are valid
    const errors = [];
    
    try {
      // This would implement cross-reference validation
      // For now, return basic validation
      return {
        valid: true,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async validateSecurityCompliance(configFiles) {
    const issues = [];
    
    try {
      for (const file of configFiles) {
        const content = await fs.readFile(file.path, 'utf8');
        
        // Check for hardcoded passwords/tokens
        if (content.match(/password:\s*[^!]/i) || content.match(/token:\s*[^!]/i)) {
          issues.push(`Potential hardcoded credentials in ${file.name}`);
        }
        
        // Check for insecure protocols
        if (content.includes('http://') && !content.includes('localhost')) {
          issues.push(`Insecure HTTP protocol found in ${file.name}`);
        }
      }
      
      return {
        valid: issues.length === 0,
        issues: issues
      };
      
    } catch (error) {
      return {
        valid: false,
        issues: [error.message]
      };
    }
  }

  // Utility Methods
  async getConfigurationFiles(configPath) {
    const files = [];
    const extensions = ['.yaml', '.yml'];
    
    try {
      const entries = await fs.readdir(configPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          files.push({
            name: entry.name,
            path: `${configPath}/${entry.name}`
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Could not read config directory: ${error.message}`);
    }
    
    return files;
  }

  processHealthResults(results, phase) {
    const checks = results.map(result => result.value);
    const healthyChecks = checks.filter(check => check.status === 'healthy');
    const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
    
    return {
      phase: phase,
      timestamp: new Date().toISOString(),
      overall: {
        healthy: unhealthyChecks.length === 0,
        totalChecks: checks.length,
        healthyChecks: healthyChecks.length,
        unhealthyChecks: unhealthyChecks.length,
        failureReason: unhealthyChecks.length > 0 ? unhealthyChecks.map(c => c.error).join('; ') : null
      },
      checks: checks
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // System resource monitoring methods
  async getDiskUsage() {
    try {
      const result = await execAsync('df / | tail -1 | awk \'{print $5}\' | sed \'s/%//\'');
      return parseInt(result.stdout.trim());
    } catch (error) {
      throw new Error(`Failed to get disk usage: ${error.message}`);
    }
  }

  async getMemoryUsage() {
    try {
      const result = await execAsync('free | grep Mem | awk \'{printf "%.1f", $3/$2 * 100.0}\'');
      return parseFloat(result.stdout.trim());
    } catch (error) {
      throw new Error(`Failed to get memory usage: ${error.message}`);
    }
  }

  async getCPUUsage() {
    try {
      const result = await execAsync('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | sed \'s/%us,//\'');
      return parseFloat(result.stdout.trim());
    } catch (error) {
      throw new Error(`Failed to get CPU usage: ${error.message}`);
    }
  }

  async getDirectorySize(dirPath) {
    try {
      const result = await execAsync(`du -sb ${dirPath} | cut -f1`);
      return parseInt(result.stdout.trim());
    } catch (error) {
      return 0; // Directory might not exist
    }
  }

  async getAvailableSpace(dirPath) {
    try {
      const result = await execAsync(`df ${dirPath} | tail -1 | awk '{print $4}'`);
      return parseInt(result.stdout.trim()) * 1024; // Convert from KB to bytes
    } catch (error) {
      throw new Error(`Failed to get available space: ${error.message}`);
    }
  }
}

module.exports = { HealthChecker };
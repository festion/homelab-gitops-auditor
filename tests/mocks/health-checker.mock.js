/**
 * Mock implementation for Health Checker
 * Used to isolate deployment and orchestration components during testing
 */
class MockHealthChecker {
  constructor() {
    this.performPreDeploymentChecks = jest.fn();
    this.performPostDeploymentChecks = jest.fn();
    this.validateConfiguration = jest.fn();
    this.checkHomeAssistantHealth = jest.fn();
    this.checkMCPServerHealth = jest.fn();
    this.checkSystemResources = jest.fn();
    this.validateYAMLSyntax = jest.fn();
    
    // Internal state for health status
    this._healthState = {
      homeAssistant: 'healthy',
      mcpServers: 'healthy',
      systemResources: 'healthy',
      overallStatus: 'healthy'
    };
  }

  // Mock successful pre-deployment checks
  mockPreDeploymentSuccess() {
    this.performPreDeploymentChecks.mockResolvedValue({
      overall: {
        healthy: true,
        healthyChecks: 5,
        unhealthyChecks: 0,
        timestamp: new Date().toISOString()
      },
      checks: [
        {
          name: 'home-assistant-api',
          status: 'healthy',
          responseTime: 45,
          details: 'API responding normally'
        },
        {
          name: 'mcp-network-fs',
          status: 'healthy',
          responseTime: 12,
          details: 'Network FS server connected'
        },
        {
          name: 'mcp-github',
          status: 'healthy',
          responseTime: 156,
          details: 'GitHub MCP server connected'
        },
        {
          name: 'disk-space',
          status: 'healthy',
          value: 75,
          threshold: 90,
          details: 'Sufficient disk space available'
        },
        {
          name: 'memory-usage',
          status: 'healthy',
          value: 68,
          threshold: 85,
          details: 'Memory usage within acceptable limits'
        }
      ]
    });
  }

  // Mock pre-deployment check failure
  mockPreDeploymentFailure(failingCheck = 'home-assistant-api') {
    this.performPreDeploymentChecks.mockRejectedValue(
      new Error(`Pre-deployment health checks failed: ${failingCheck} is unhealthy`)
    );
  }

  // Mock successful post-deployment checks
  mockPostDeploymentSuccess() {
    this.performPostDeploymentChecks.mockResolvedValue({
      overall: {
        healthy: true,
        healthyChecks: 4,
        unhealthyChecks: 0,
        timestamp: new Date().toISOString()
      },
      checks: [
        {
          name: 'home-assistant-api',
          status: 'healthy',
          responseTime: 52,
          details: 'API responding after deployment'
        },
        {
          name: 'configuration-valid',
          status: 'healthy',
          details: 'Home Assistant configuration is valid'
        },
        {
          name: 'services-running',
          status: 'healthy',
          details: 'All critical services operational'
        },
        {
          name: 'integrations-loaded',
          status: 'healthy',
          details: 'All integrations loaded successfully'
        }
      ]
    });
  }

  // Mock post-deployment check failure
  mockPostDeploymentFailure(failingCheck = 'configuration-valid') {
    this.performPostDeploymentChecks.mockRejectedValue(
      new Error(`Post-deployment health checks failed: ${failingCheck} failed`)
    );
  }

  // Mock configuration validation success
  mockConfigurationValidationSuccess() {
    this.validateConfiguration.mockResolvedValue({
      valid: true,
      yamlSyntax: {
        valid: true,
        errors: []
      },
      homeAssistantConfig: {
        valid: true,
        warnings: [],
        errors: []
      },
      integrations: {
        valid: true,
        loaded: 45,
        failed: 0
      }
    });
  }

  // Mock configuration validation with YAML errors
  mockConfigurationValidationYAMLError() {
    this.validateConfiguration.mockResolvedValue({
      valid: false,
      yamlSyntax: {
        valid: false,
        errors: [
          {
            line: 42,
            column: 15,
            message: 'mapping values are not allowed here',
            severity: 'error'
          }
        ]
      },
      homeAssistantConfig: {
        valid: false,
        warnings: [],
        errors: ['YAML syntax error prevents configuration validation']
      }
    });
  }

  // Mock configuration validation with Home Assistant errors
  mockConfigurationValidationHAError() {
    this.validateConfiguration.mockResolvedValue({
      valid: false,
      yamlSyntax: {
        valid: true,
        errors: []
      },
      homeAssistantConfig: {
        valid: false,
        warnings: [
          'Deprecated sensor platform detected',
          'Unused integration configuration found'
        ],
        errors: [
          'Invalid entity_id format in automation',
          'Missing required integration: mqtt'
        ]
      }
    });
  }

  // Mock Home Assistant health check
  mockHomeAssistantHealthy() {
    this.checkHomeAssistantHealth.mockResolvedValue({
      status: 'healthy',
      api: {
        reachable: true,
        responseTime: 45,
        version: '2025.7.0'
      },
      supervisor: {
        running: true,
        version: '2025.07.0'
      },
      addons: {
        total: 12,
        running: 12,
        stopped: 0
      }
    });
  }

  // Mock Home Assistant unreachable
  mockHomeAssistantUnreachable() {
    this.checkHomeAssistantHealth.mockRejectedValue(
      new Error('Home Assistant API unreachable: Connection timeout')
    );
  }

  // Mock Home Assistant configuration error
  mockHomeAssistantConfigurationError() {
    this.checkHomeAssistantHealth.mockResolvedValue({
      status: 'unhealthy',
      api: {
        reachable: true,
        responseTime: 89,
        version: '2025.7.0'
      },
      configurationErrors: [
        'Invalid YAML in configuration.yaml',
        'Failed to load integration: invalid_sensor'
      ],
      supervisor: {
        running: false,
        error: 'Configuration validation failed'
      }
    });
  }

  // Mock system resource checks
  mockSystemResourcesHealthy() {
    this.checkSystemResources.mockResolvedValue({
      disk: {
        status: 'healthy',
        usage: 75,
        threshold: 90,
        available: '2.5GB'
      },
      memory: {
        status: 'healthy',
        usage: 68,
        threshold: 85,
        available: '1.2GB'
      },
      cpu: {
        status: 'healthy',
        usage: 45,
        threshold: 80
      }
    });
  }

  // Mock system resource warnings
  mockSystemResourcesWarning() {
    this.checkSystemResources.mockResolvedValue({
      disk: {
        status: 'warning',
        usage: 92,
        threshold: 90,
        available: '256MB'
      },
      memory: {
        status: 'healthy',
        usage: 72,
        threshold: 85,
        available: '896MB'
      },
      cpu: {
        status: 'healthy',
        usage: 55,
        threshold: 80
      }
    });
  }

  // Utility methods for state management
  setHealthState(component, status) {
    this._healthState[component] = status;
    this._updateOverallStatus();
  }

  _updateOverallStatus() {
    const unhealthyComponents = Object.values(this._healthState)
      .filter(status => status !== 'healthy');
    this._healthState.overallStatus = unhealthyComponents.length > 0 ? 'unhealthy' : 'healthy';
  }

  getHealthState() {
    return { ...this._healthState };
  }

  // Reset all mocks to default state
  reset() {
    jest.clearAllMocks();
    this._healthState = {
      homeAssistant: 'healthy',
      mcpServers: 'healthy',
      systemResources: 'healthy',
      overallStatus: 'healthy'
    };
  }
}

module.exports = { MockHealthChecker };
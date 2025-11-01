/**
 * Mock implementation for Home Assistant API
 * Used to isolate health checking and deployment validation
 */
class MockHomeAssistantAPI {
  constructor() {
    this.checkHealth = jest.fn();
    this.validateConfig = jest.fn();
    this.getSystemInfo = jest.fn();
    this.listEntities = jest.fn();
    this.getEntity = jest.fn();
    this.callService = jest.fn();
    this.getEvents = jest.fn();
    this.getStates = jest.fn();
    this.restartCore = jest.fn();
    this.reloadConfig = jest.fn();
    
    // Mock state
    this._systemInfo = {
      version: '2025.7.0',
      installation_type: 'Home Assistant Supervised',
      timezone: 'America/New_York'
    };
    this._entities = new Map();
    this._isHealthy = true;
  }

  // Mock healthy API response
  mockHealthyResponse() {
    this.checkHealth.mockResolvedValue({
      status: 'healthy',
      version: '2025.7.0',
      uptime: 86400,
      lastRestart: new Date(Date.now() - 86400000).toISOString(),
      api: {
        reachable: true,
        responseTime: 45,
        authenticated: true
      },
      supervisor: {
        version: '2025.07.0',
        healthy: true,
        addons: {
          running: 12,
          total: 12
        }
      },
      core: {
        state: 'RUNNING',
        safe_mode: false
      }
    });

    this.getSystemInfo.mockResolvedValue(this._systemInfo);
    this._isHealthy = true;
  }

  // Mock unreachable API
  mockUnreachableResponse() {
    this.checkHealth.mockRejectedValue(
      new Error('Home Assistant API unreachable: ECONNREFUSED')
    );
    this._isHealthy = false;
  }

  // Mock configuration error response
  mockConfigurationError() {
    this.checkHealth.mockResolvedValue({
      status: 'unhealthy',
      version: '2025.7.0',
      api: {
        reachable: true,
        responseTime: 156,
        authenticated: true
      },
      configurationErrors: [
        'Invalid YAML in configuration.yaml at line 42',
        'Integration "invalid_sensor" not found',
        'Duplicate entity_id: sensor.temperature'
      ],
      supervisor: {
        version: '2025.07.0',
        healthy: false,
        error: 'Configuration check failed'
      },
      core: {
        state: 'NOT_RUNNING',
        safe_mode: true
      }
    });
    this._isHealthy = false;
  }

  // Mock successful configuration validation
  mockValidConfigValidation() {
    this.validateConfig.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
      result: 'Configuration check successful',
      processing_time: 2.45
    });
  }

  // Mock configuration validation with errors
  mockInvalidConfigValidation() {
    this.validateConfig.mockResolvedValue({
      valid: false,
      errors: [
        {
          type: 'yaml_error',
          message: 'Invalid YAML syntax',
          file: 'configuration.yaml',
          line: 42,
          column: 15
        },
        {
          type: 'integration_error',
          message: 'Component not found: invalid_component',
          file: 'configuration.yaml',
          line: 156
        }
      ],
      warnings: [
        {
          type: 'deprecation',
          message: 'sensor.template is deprecated, use template sensor instead',
          file: 'sensors.yaml',
          line: 25
        }
      ],
      result: 'Configuration check failed',
      processing_time: 1.82
    });
  }

  // Mock entity listing
  mockEntityList() {
    const entities = [
      {
        entity_id: 'light.living_room',
        state: 'on',
        attributes: {
          friendly_name: 'Living Room Light',
          brightness: 255
        }
      },
      {
        entity_id: 'sensor.temperature',
        state: '22.5',
        attributes: {
          friendly_name: 'Temperature',
          unit_of_measurement: '°C'
        }
      },
      {
        entity_id: 'binary_sensor.door',
        state: 'off',
        attributes: {
          friendly_name: 'Front Door',
          device_class: 'door'
        }
      }
    ];

    this.listEntities.mockResolvedValue(entities);
    
    entities.forEach(entity => {
      this._entities.set(entity.entity_id, entity);
    });
  }

  // Mock specific entity retrieval
  mockEntityGet(entityId) {
    this.getEntity.mockImplementation((id) => {
      const entity = this._entities.get(id);
      if (entity) {
        return Promise.resolve(entity);
      }
      return Promise.reject(new Error(`Entity ${id} not found`));
    });
  }

  // Mock service calls
  mockServiceCallSuccess() {
    this.callService.mockResolvedValue({
      success: true,
      service_called: true,
      context: {
        id: 'mock-context-id',
        user_id: null
      }
    });
  }

  // Mock service call failure
  mockServiceCallFailure() {
    this.callService.mockRejectedValue(
      new Error('Service call failed: Entity not available')
    );
  }

  // Mock system restart
  mockRestartSuccess() {
    this.restartCore.mockResolvedValue({
      success: true,
      message: 'Home Assistant restart initiated'
    });
  }

  // Mock config reload
  mockConfigReloadSuccess() {
    this.reloadConfig.mockResolvedValue({
      success: true,
      reloaded_configs: [
        'automation',
        'script', 
        'scene',
        'group'
      ]
    });
  }

  // Mock config reload failure
  mockConfigReloadFailure() {
    this.reloadConfig.mockRejectedValue(
      new Error('Configuration reload failed: YAML syntax error')
    );
  }

  // Mock slow response for timeout testing
  mockSlowResponse(delay = 30000) {
    this.checkHealth.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            status: 'healthy',
            version: '2025.7.0',
            responseTime: delay
          });
        }, delay);
      });
    });
  }

  // Mock authentication failure
  mockAuthenticationFailure() {
    this.checkHealth.mockRejectedValue(
      new Error('Authentication failed: Invalid access token')
    );
  }

  // Utility methods
  isHealthy() {
    return this._isHealthy;
  }

  setSystemInfo(info) {
    this._systemInfo = { ...this._systemInfo, ...info };
  }

  addEntity(entityId, state, attributes = {}) {
    this._entities.set(entityId, {
      entity_id: entityId,
      state,
      attributes
    });
  }

  // Reset all mocks and state
  reset() {
    jest.clearAllMocks();
    this._entities.clear();
    this._isHealthy = true;
    this._systemInfo = {
      version: '2025.7.0',
      installation_type: 'Home Assistant Supervised',
      timezone: 'America/New_York'
    };
  }
}

module.exports = { MockHomeAssistantAPI };
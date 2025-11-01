/**
 * Test fixtures for health check testing
 * Provides consistent test data for health validation scenarios
 */

const HealthCheckFixtures = {
  /**
   * Valid Home Assistant configuration for testing
   */
  validHomeAssistantConfig() {
    return `
# Home Assistant Configuration
homeassistant:
  name: Home
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: America/New_York
  currency: USD
  country: US

# Core components
default_config:

# Includes
automation: !include automations.yaml
script: !include scripts.yaml
scene: !include scenes.yaml

# Input components
input_boolean:
  test_switch:
    name: Test Switch
    initial: false

input_number:
  temperature_threshold:
    name: Temperature Threshold
    min: 15
    max: 35
    step: 0.5
    unit_of_measurement: "°C"

# Sensors
sensor:
  - platform: template
    sensors:
      temperature_difference:
        friendly_name: "Temperature Difference"
        unit_of_measurement: "°C"
        value_template: "{{ states('sensor.outdoor_temp') | float - states('sensor.indoor_temp') | float }}"
        device_class: temperature

# Binary sensors
binary_sensor:
  - platform: template
    sensors:
      window_open:
        friendly_name: "Any Window Open"
        value_template: >
          {{ is_state('binary_sensor.window_living_room', 'on') or
             is_state('binary_sensor.window_bedroom', 'on') }}

# HTTP configuration
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 192.168.1.0/24
    - 127.0.0.1
  cors_allowed_origins:
    - https://cast.home-assistant.io

# Logger
logger:
  default: info
  logs:
    homeassistant.core: debug
    custom_components: debug
`;
  },

  /**
   * Invalid YAML configuration for syntax error testing
   */
  invalidYAMLConfig() {
    return `
# Invalid YAML Configuration
homeassistant:
  name: Home
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: America/New_York

# Invalid YAML - mapping values not allowed here
sensor:
  - platform: template
    sensors:
      temperature: value: invalid_syntax_here
      humidity: 
        friendly_name: Humidity
        value_template: "{{ states('sensor.hum') }}"
        unit_of_measurement: %

# Another syntax error - incorrect indentation
automation:
- alias: Test Automation
  trigger:
    platform: state
    entity_id: sensor.temperature
action:  # This should be indented
  service: light.turn_on
  entity_id: light.living_room
`;
  },

  /**
   * Invalid Home Assistant configuration for HA-specific validation
   */
  invalidHomeAssistantConfig() {
    return `
# Invalid Home Assistant Configuration
homeassistant:
  name: Home
  latitude: invalid_latitude
  longitude: -74.0060
  elevation: 10
  unit_system: invalid_unit_system
  time_zone: Invalid/Timezone
  country: INVALID_COUNTRY

# Invalid sensor configuration
sensor:
  - platform: nonexistent_platform
    name: Invalid Sensor
    entity_id: invalid.entity.id.format.too.long
    
  - platform: template
    sensors:
      invalid_template:
        friendly_name: "Invalid Template"
        value_template: "{{ invalid_function() }}"
        unit_of_measurement: invalid_unit

# Invalid automation
automation:
  - alias: Invalid Automation
    trigger:
      platform: invalid_platform
      entity_id: sensor.nonexistent
    condition:
      condition: invalid_condition
    action:
      service: nonexistent.service
      entity_id: invalid_entity_format

# Invalid input components
input_number:
  invalid_input:
    name: Invalid Input
    min: 100  # min > max
    max: 50
    step: -1  # negative step

# Invalid device tracker
device_tracker:
  - platform: nonexistent_tracker
    invalid_option: value
`;
  },

  /**
   * Health check responses for API testing
   */
  healthCheckResponses: {
    healthyHomeAssistant() {
      return {
        status: 200,
        data: [
          {
            entity_id: 'sensor.temperature',
            state: '22.5',
            attributes: {
              friendly_name: 'Temperature',
              unit_of_measurement: '°C',
              device_class: 'temperature'
            },
            last_changed: new Date().toISOString(),
            last_updated: new Date().toISOString()
          },
          {
            entity_id: 'light.living_room',
            state: 'on',
            attributes: {
              friendly_name: 'Living Room Light',
              brightness: 255,
              supported_features: 41
            },
            last_changed: new Date(Date.now() - 300000).toISOString(),
            last_updated: new Date().toISOString()
          },
          {
            entity_id: 'binary_sensor.door',
            state: 'off',
            attributes: {
              friendly_name: 'Front Door',
              device_class: 'door'
            },
            last_changed: new Date(Date.now() - 3600000).toISOString(),
            last_updated: new Date().toISOString()
          }
        ],
        headers: {
          'x-ha-version': '2025.7.0',
          'content-type': 'application/json'
        }
      };
    },

    homeAssistantConfig() {
      return {
        status: 200,
        data: {
          version: '2025.7.0',
          installation_type: 'Home Assistant Supervised',
          unit_system: {
            length: 'km',
            mass: 'kg',
            temperature: '°C',
            volume: 'L'
          },
          time_zone: 'America/New_York',
          latitude: 40.7128,
          longitude: -74.0060,
          elevation: 10,
          components: [
            'automation',
            'binary_sensor',
            'climate',
            'default_config',
            'device_tracker',
            'frontend',
            'history',
            'http',
            'input_boolean',
            'input_number',
            'light',
            'logger',
            'media_player',
            'mqtt',
            'script',
            'sensor',
            'switch',
            'template',
            'zone'
          ],
          whitelist_external_dirs: [
            '/config'
          ],
          allowlist_external_dirs: [
            '/config'
          ],
          country: 'US',
          currency: 'USD',
          safe_mode: false
        }
      };
    },

    unhealthyHomeAssistant() {
      return {
        status: 503,
        data: {
          message: 'Service Unavailable'
        },
        headers: {
          'content-type': 'application/json'
        }
      };
    },

    slowHomeAssistantResponse() {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            status: 200,
            data: [],
            headers: {
              'x-ha-version': '2025.7.0'
            }
          });
        }, 5000); // 5 second delay
      });
    }
  },

  /**
   * System resource data for testing
   */
  systemResources: {
    healthy() {
      return {
        disk: {
          usage: 75,
          available: '2.5GB',
          total: '10GB'
        },
        memory: {
          usage: 68.5,
          used: '2.1GB',
          total: '4GB'
        },
        cpu: {
          usage: 45.2,
          loadAverage: [0.5, 0.7, 0.8]
        }
      };
    },

    critical() {
      return {
        disk: {
          usage: 95,
          available: '128MB',
          total: '10GB'
        },
        memory: {
          usage: 98.5,
          used: '3.9GB',
          total: '4GB'
        },
        cpu: {
          usage: 99.2,
          loadAverage: [8.5, 9.2, 9.8]
        }
      };
    },

    moderate() {
      return {
        disk: {
          usage: 82,
          available: '1.8GB',
          total: '10GB'
        },
        memory: {
          usage: 78.3,
          used: '3.1GB',
          total: '4GB'
        },
        cpu: {
          usage: 65.7,
          loadAverage: [2.1, 2.3, 2.0]
        }
      };
    }
  },

  /**
   * MCP server health status data
   */
  mcpServerStatus: {
    allHealthy() {
      return {
        networkFs: {
          status: 'healthy',
          lastHealthCheck: new Date().toISOString(),
          lastError: null,
          retryCount: 0,
          connectionTime: 156
        },
        github: {
          status: 'healthy',
          lastHealthCheck: new Date().toISOString(),
          lastError: null,
          retryCount: 0,
          connectionTime: 234
        }
      };
    },

    partiallyUnhealthy() {
      return {
        networkFs: {
          status: 'error',
          lastHealthCheck: new Date(Date.now() - 300000).toISOString(),
          lastError: 'Connection timeout after 30 seconds',
          retryCount: 2,
          connectionTime: null
        },
        github: {
          status: 'healthy',
          lastHealthCheck: new Date().toISOString(),
          lastError: null,
          retryCount: 0,
          connectionTime: 234
        }
      };
    },

    allUnhealthy() {
      return {
        networkFs: {
          status: 'error',
          lastHealthCheck: new Date(Date.now() - 600000).toISOString(),
          lastError: 'Network unreachable',
          retryCount: 3,
          connectionTime: null
        },
        github: {
          status: 'error',
          lastHealthCheck: new Date(Date.now() - 450000).toISOString(),
          lastError: 'Authentication failed',
          retryCount: 2,
          connectionTime: null
        }
      };
    }
  },

  /**
   * Network connectivity test data
   */
  networkConnectivity: {
    allReachable() {
      return [
        { name: 'home-assistant', status: 'connected', responseTime: 45 },
        { name: 'github', status: 'connected', responseTime: 156 },
        { name: 'dns', status: 'connected', responseTime: 12 }
      ];
    },

    partiallyReachable() {
      return [
        { name: 'home-assistant', status: 'failed', error: 'ECONNREFUSED' },
        { name: 'github', status: 'connected', responseTime: 156 },
        { name: 'dns', status: 'connected', responseTime: 12 }
      ];
    },

    allUnreachable() {
      return [
        { name: 'home-assistant', status: 'failed', error: 'ECONNREFUSED' },
        { name: 'github', status: 'failed', error: 'ETIMEDOUT' },
        { name: 'dns', status: 'failed', error: 'ENOTFOUND' }
      ];
    }
  },

  /**
   * Performance metrics data
   */
  performanceMetrics: {
    good() {
      return {
        apiResponseTime: 156,
        databaseQueryTime: 23,
        memoryUsage: 68.5,
        cpuUsage: 45.2,
        activeConnections: 12,
        entityCount: 234
      };
    },

    degraded() {
      return {
        apiResponseTime: 2500, // Exceeds threshold
        databaseQueryTime: 156,
        memoryUsage: 85.3,
        cpuUsage: 78.9,
        activeConnections: 45,
        entityCount: 234
      };
    },

    poor() {
      return {
        apiResponseTime: 5000, // Very slow
        databaseQueryTime: 890,
        memoryUsage: 95.7,
        cpuUsage: 98.2,
        activeConnections: 89,
        entityCount: 234
      };
    }
  },

  /**
   * Configuration validation results
   */
  validationResults: {
    allValid() {
      return {
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
        references: {
          valid: true,
          errors: []
        },
        security: {
          valid: true,
          issues: []
        }
      };
    },

    yamlErrors() {
      return {
        valid: false,
        yamlSyntax: {
          valid: false,
          errors: [
            {
              file: 'configuration.yaml',
              line: 42,
              column: 15,
              error: 'mapping values are not allowed here'
            },
            {
              file: 'automations.yaml',
              line: 15,
              column: 3,
              error: 'found unexpected end of stream'
            }
          ]
        },
        homeAssistantConfig: {
          valid: false,
          warnings: [],
          errors: ['YAML syntax errors prevent configuration validation']
        }
      };
    },

    haConfigErrors() {
      return {
        valid: false,
        yamlSyntax: {
          valid: true,
          errors: []
        },
        homeAssistantConfig: {
          valid: false,
          warnings: [
            'Component "sensor.template" is deprecated, use "template" domain instead',
            'Unused integration "group" found in configuration'
          ],
          errors: [
            'Platform not found: sensor.nonexistent_platform',
            'Invalid entity_id format: invalid.entity.format',
            'Required key "platform" not provided for automation trigger',
            'Service "nonexistent.service" not found'
          ]
        },
        references: {
          valid: true,
          errors: []
        },
        security: {
          valid: true,
          issues: []
        }
      };
    },

    securityIssues() {
      return {
        valid: false,
        yamlSyntax: {
          valid: true,
          errors: []
        },
        homeAssistantConfig: {
          valid: true,
          warnings: [],
          errors: []
        },
        references: {
          valid: true,
          errors: []
        },
        security: {
          valid: false,
          issues: [
            'Hardcoded password found in configuration.yaml line 25',
            'Insecure HTTP protocol detected in http.yaml line 12',
            'Weak encryption algorithm (MD5) found in secrets.yaml line 8'
          ]
        }
      };
    }
  },

  /**
   * Backup space information
   */
  backupSpace: {
    sufficient() {
      return {
        currentUsage: 52428800, // 50MB
        availableSpace: 5368709120, // 5GB
        requiredSpace: 209715200, // 200MB (2 backups)
        backupCount: 5
      };
    },

    insufficient() {
      return {
        currentUsage: 104857600, // 100MB
        availableSpace: 157286400, // 150MB
        requiredSpace: 209715200, // 200MB (2 backups)
        backupCount: 3
      };
    },

    critical() {
      return {
        currentUsage: 209715200, // 200MB
        availableSpace: 52428800, // 50MB
        requiredSpace: 209715200, // 200MB (2 backups)
        backupCount: 2
      };
    }
  },

  /**
   * Complete health report examples
   */
  healthReports: {
    allHealthy() {
      return {
        phase: 'pre-deployment',
        timestamp: new Date().toISOString(),
        overall: {
          healthy: true,
          totalChecks: 5,
          healthyChecks: 5,
          unhealthyChecks: 0,
          failureReason: null
        },
        checks: [
          {
            name: 'home-assistant-api',
            status: 'healthy',
            responseTime: 156,
            details: {
              statusCode: 200,
              stateCount: 234,
              version: '2025.7.0'
            }
          },
          {
            name: 'system-resources',
            status: 'healthy',
            details: {
              diskUsage: 75,
              memoryUsage: 68.5,
              cpuUsage: 45.2
            }
          },
          {
            name: 'mcp-servers',
            status: 'healthy',
            details: {
              healthyServers: ['networkFs', 'github'],
              unhealthyServers: [],
              totalServers: 2
            }
          },
          {
            name: 'backup-space',
            status: 'healthy',
            details: {
              currentUsage: 52428800,
              availableSpace: 5368709120,
              requiredSpace: 209715200
            }
          },
          {
            name: 'network-connectivity',
            status: 'healthy',
            details: {
              totalEndpoints: 3,
              failedEndpoints: 0
            }
          }
        ]
      };
    },

    partiallyUnhealthy() {
      return {
        phase: 'pre-deployment',
        timestamp: new Date().toISOString(),
        overall: {
          healthy: false,
          totalChecks: 5,
          healthyChecks: 3,
          unhealthyChecks: 2,
          failureReason: 'Disk usage high: 95%; Unhealthy servers: networkFs'
        },
        checks: [
          {
            name: 'home-assistant-api',
            status: 'healthy',
            responseTime: 156
          },
          {
            name: 'system-resources',
            status: 'unhealthy',
            error: 'Disk usage high: 95%',
            details: {
              diskUsage: 95,
              memoryUsage: 72.1,
              cpuUsage: 48.3
            }
          },
          {
            name: 'mcp-servers',
            status: 'unhealthy',
            error: 'Unhealthy servers: networkFs',
            details: {
              healthyServers: ['github'],
              unhealthyServers: [{ server: 'networkFs', error: 'Connection timeout' }],
              totalServers: 2
            }
          },
          {
            name: 'backup-space',
            status: 'healthy'
          },
          {
            name: 'network-connectivity',
            status: 'healthy'
          }
        ]
      };
    }
  }
};

module.exports = { HealthCheckFixtures };
/**
 * Test fixtures for deployment testing
 * Provides consistent test data for deployment scenarios
 */

const DeploymentFixtures = {
  /**
   * Valid deployment request for testing successful deployments
   */
  validDeploymentRequest() {
    return {
      repository: 'festion/home-assistant-config',
      branch: 'main',
      commit: '689a045f7c12e8b9a3456789def12345abcdef01',
      source: 'webhook',
      trigger: {
        type: 'push',
        user: 'festion',
        timestamp: new Date().toISOString()
      },
      metadata: {
        pusher: 'festion',
        commitMessage: 'Update sensor configuration',
        changedFiles: [
          'configuration.yaml',
          'sensors.yaml',
          'automations.yaml'
        ]
      }
    };
  },

  /**
   * Alternative valid deployment request
   */
  validDeploymentRequestAlt() {
    return {
      repository: 'festion/home-assistant-config',
      branch: 'development',
      commit: 'abc123def456789012345678901234567890abcd',
      source: 'manual',
      trigger: {
        type: 'manual',
        user: 'admin',
        timestamp: new Date().toISOString()
      },
      metadata: {
        operator: 'admin',
        reason: 'Emergency hotfix deployment',
        changedFiles: [
          'automations/security.yaml'
        ]
      }
    };
  },

  /**
   * Invalid deployment requests for validation testing
   */
  invalidRequests: {
    missingRepository() {
      return {
        branch: 'main',
        commit: '689a045f7c12e8b9a3456789def12345abcdef01'
      };
    },

    invalidRepositoryFormat() {
      return {
        repository: 'invalid-repo-format',
        branch: 'main',
        commit: '689a045f7c12e8b9a3456789def12345abcdef01'
      };
    },

    invalidCommitHash() {
      return {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commit: 'invalid-commit-hash'
      };
    },

    missingBranch() {
      return {
        repository: 'festion/home-assistant-config',
        commit: '689a045f7c12e8b9a3456789def12345abcdef01'
      };
    },

    invalidBranchName() {
      return {
        repository: 'festion/home-assistant-config',
        branch: 'invalid branch name with spaces',
        commit: '689a045f7c12e8b9a3456789def12345abcdef01'
      };
    }
  },

  /**
   * Deployment status responses
   */
  deploymentStatus: {
    pending() {
      return {
        deploymentId: 'deploy-20250713-101117',
        state: 'pending',
        progress: { current: 0, total: 5 },
        startTime: new Date().toISOString(),
        steps: [
          { name: 'validation', status: 'pending' },
          { name: 'backup', status: 'pending' },
          { name: 'deployment', status: 'pending' },
          { name: 'verification', status: 'pending' },
          { name: 'cleanup', status: 'pending' }
        ]
      };
    },

    inProgress() {
      return {
        deploymentId: 'deploy-20250713-101117',
        state: 'in-progress',
        progress: { current: 2, total: 5 },
        startTime: new Date(Date.now() - 30000).toISOString(),
        currentStep: 'deployment',
        steps: [
          { name: 'validation', status: 'completed', duration: 5000 },
          { name: 'backup', status: 'completed', duration: 15000 },
          { name: 'deployment', status: 'in-progress', startTime: new Date(Date.now() - 10000).toISOString() },
          { name: 'verification', status: 'pending' },
          { name: 'cleanup', status: 'pending' }
        ]
      };
    },

    completed() {
      return {
        deploymentId: 'deploy-20250713-101117',
        state: 'completed',
        progress: { current: 5, total: 5 },
        startTime: new Date(Date.now() - 60000).toISOString(),
        endTime: new Date().toISOString(),
        duration: 60000,
        steps: [
          { name: 'validation', status: 'completed', duration: 5000 },
          { name: 'backup', status: 'completed', duration: 15000 },
          { name: 'deployment', status: 'completed', duration: 25000 },
          { name: 'verification', status: 'completed', duration: 10000 },
          { name: 'cleanup', status: 'completed', duration: 5000 }
        ],
        result: {
          filesDeployed: 15,
          backupId: 'backup-1720865477000',
          verificationPassed: true
        }
      };
    },

    failed() {
      return {
        deploymentId: 'deploy-20250713-101117',
        state: 'failed',
        progress: { current: 2, total: 5 },
        startTime: new Date(Date.now() - 45000).toISOString(),
        endTime: new Date().toISOString(),
        duration: 45000,
        error: 'Configuration validation failed',
        steps: [
          { name: 'validation', status: 'completed', duration: 5000 },
          { name: 'backup', status: 'completed', duration: 15000 },
          { name: 'deployment', status: 'failed', duration: 25000, error: 'YAML syntax error in configuration.yaml' },
          { name: 'verification', status: 'skipped' },
          { name: 'cleanup', status: 'skipped' }
        ],
        rollback: {
          triggered: true,
          status: 'completed',
          duration: 12000
        }
      };
    }
  },

  /**
   * Webhook payloads for testing
   */
  webhookPayloads: {
    pushEvent() {
      return {
        ref: 'refs/heads/main',
        before: '0000000000000000000000000000000000000000',
        after: '689a045f7c12e8b9a3456789def12345abcdef01',
        repository: {
          name: 'home-assistant-config',
          full_name: 'festion/home-assistant-config',
          owner: {
            login: 'festion'
          }
        },
        pusher: {
          name: 'festion',
          email: 'user@example.com'
        },
        head_commit: {
          id: '689a045f7c12e8b9a3456789def12345abcdef01',
          message: 'Update sensor configuration',
          author: {
            name: 'festion',
            email: 'user@example.com'
          },
          modified: [
            'configuration.yaml',
            'sensors.yaml'
          ],
          added: [
            'automations/new_automation.yaml'
          ],
          removed: []
        },
        commits: [
          {
            id: '689a045f7c12e8b9a3456789def12345abcdef01',
            message: 'Update sensor configuration',
            modified: ['configuration.yaml', 'sensors.yaml'],
            added: ['automations/new_automation.yaml'],
            removed: []
          }
        ]
      };
    },

    releaseEvent() {
      return {
        action: 'published',
        release: {
          tag_name: 'v1.2.0',
          name: 'Release v1.2.0',
          body: 'Major configuration updates',
          target_commitish: 'main'
        },
        repository: {
          name: 'home-assistant-config',
          full_name: 'festion/home-assistant-config',
          owner: {
            login: 'festion'
          }
        }
      };
    }
  },

  /**
   * Configuration files for testing
   */
  configFiles: {
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

# Includes
automation: !include automations.yaml
script: !include scripts.yaml
scene: !include scenes.yaml

# Components
sensor:
  - platform: template
    sensors:
      temperature_difference:
        friendly_name: "Temperature Difference"
        unit_of_measurement: "°C"
        value_template: "{{ states('sensor.outdoor_temp') | float - states('sensor.indoor_temp') | float }}"

# HTTP
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 192.168.1.0/24
`;
    },

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
      temperature: value: invalid
`;
    },

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

# Invalid sensor configuration
sensor:
  - platform: nonexistent_platform
    name: Invalid Sensor
    entity_id: invalid.entity.id.format
`;
    }
  },

  /**
   * MCP operation responses
   */
  mcpResponses: {
    successful() {
      return {
        success: true,
        operation: 'deploy_configuration',
        timestamp: new Date().toISOString(),
        details: {
          filesTransferred: 15,
          totalSize: 2048576,
          duration: 25000,
          networkFs: {
            connected: true,
            filesWritten: 15,
            errors: []
          },
          github: {
            connected: true,
            filesRead: 15,
            errors: []
          }
        }
      };
    },

    failed() {
      return {
        success: false,
        operation: 'deploy_configuration',
        timestamp: new Date().toISOString(),
        error: 'Network timeout during file transfer',
        details: {
          filesTransferred: 8,
          totalSize: 1048576,
          duration: 15000,
          networkFs: {
            connected: false,
            filesWritten: 8,
            errors: ['Connection timeout after 30 seconds']
          },
          github: {
            connected: true,
            filesRead: 15,
            errors: []
          }
        }
      };
    }
  }
};

module.exports = { DeploymentFixtures };
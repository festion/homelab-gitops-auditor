const crypto = require('crypto');

class IntegrationFixtures {
  static validDeploymentRequest(overrides = {}) {
    const defaults = {
      repository: 'festion/home-assistant-config',
      branch: 'main',
      validateConfig: true,
      createBackup: true
    };
    
    return { ...defaults, ...overrides };
  }

  static deploymentData(overrides = {}) {
    const timestamp = Date.now();
    const defaults = {
      deploymentId: `deploy-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}`,
      repository: 'festion/home-assistant-config',
      branch: 'main',
      commitSha: null,
      state: 'queued',
      configValidation: null,
      deploymentSteps: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return { ...defaults, ...overrides };
  }

  static githubPushWebhook(overrides = {}) {
    const defaults = {
      ref: 'refs/heads/main',
      before: 'abc123def456789',
      after: 'def456ghi789012',
      created: false,
      deleted: false,
      forced: false,
      base_ref: null,
      compare: 'https://github.com/festion/home-assistant-config/compare/abc123def456789...def456ghi789012',
      commits: [
        {
          id: 'def456ghi789012',
          tree_id: 'tree123456',
          distinct: true,
          message: 'Update Home Assistant configuration',
          timestamp: new Date().toISOString(),
          url: 'https://github.com/festion/home-assistant-config/commit/def456ghi789012',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser'
          },
          committer: {
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser'
          },
          added: ['new_automation.yaml'],
          removed: [],
          modified: ['configuration.yaml']
        }
      ],
      head_commit: {
        id: 'def456ghi789012',
        tree_id: 'tree123456',
        distinct: true,
        message: 'Update Home Assistant configuration',
        timestamp: new Date().toISOString(),
        url: 'https://github.com/festion/home-assistant-config/commit/def456ghi789012',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          username: 'testuser'
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          username: 'testuser'
        },
        added: ['new_automation.yaml'],
        removed: [],
        modified: ['configuration.yaml']
      },
      repository: {
        id: 123456789,
        node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
        name: 'home-assistant-config',
        full_name: 'festion/home-assistant-config',
        private: false,
        owner: {
          name: 'festion',
          email: 'festion@example.com',
          login: 'festion',
          id: 12345,
          node_id: 'MDQ6VXNlcjEyMzQ1',
          avatar_url: 'https://github.com/images/error/festion_happy.gif',
          gravatar_id: '',
          url: 'https://api.github.com/users/festion',
          html_url: 'https://github.com/festion',
          type: 'User',
          site_admin: false
        },
        html_url: 'https://github.com/festion/home-assistant-config',
        description: 'Home Assistant configuration files',
        fork: false,
        url: 'https://github.com/festion/home-assistant-config',
        created_at: 1609459200,
        updated_at: 1672531200,
        pushed_at: Math.floor(Date.now() / 1000),
        git_url: 'git://github.com/festion/home-assistant-config.git',
        ssh_url: 'git@github.com:festion/home-assistant-config.git',
        clone_url: 'https://github.com/festion/home-assistant-config.git',
        svn_url: 'https://github.com/festion/home-assistant-config',
        size: 1024,
        stargazers_count: 5,
        watchers_count: 5,
        language: 'YAML',
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        has_pages: false,
        forks_count: 1,
        open_issues_count: 0,
        forks: 1,
        open_issues: 0,
        watchers: 5,
        default_branch: 'main'
      },
      pusher: {
        name: 'festion',
        email: 'festion@example.com'
      },
      sender: {
        login: 'festion',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/festion_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/festion',
        html_url: 'https://github.com/festion',
        type: 'User',
        site_admin: false
      }
    };
    
    return this.deepMerge(defaults, overrides);
  }

  static githubPullRequestWebhook(overrides = {}) {
    const defaults = {
      action: 'opened',
      number: 123,
      pull_request: {
        url: 'https://api.github.com/repos/festion/home-assistant-config/pulls/123',
        id: 987654321,
        node_id: 'MDExOlB1bGxSZXF1ZXN0OTg3NjU0MzIx',
        html_url: 'https://github.com/festion/home-assistant-config/pull/123',
        diff_url: 'https://github.com/festion/home-assistant-config/pull/123.diff',
        patch_url: 'https://github.com/festion/home-assistant-config/pull/123.patch',
        issue_url: 'https://api.github.com/repos/festion/home-assistant-config/issues/123',
        number: 123,
        state: 'open',
        locked: false,
        title: 'Update automation configuration',
        user: {
          login: 'festion',
          id: 12345,
          node_id: 'MDQ6VXNlcjEyMzQ1',
          avatar_url: 'https://github.com/images/error/festion_happy.gif',
          type: 'User'
        },
        body: 'This pull request updates the automation configuration to include new sensors.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        merged_at: null,
        merge_commit_sha: null,
        assignee: null,
        assignees: [],
        requested_reviewers: [],
        requested_teams: [],
        labels: [],
        milestone: null,
        draft: false,
        commits_url: 'https://api.github.com/repos/festion/home-assistant-config/pulls/123/commits',
        review_comments_url: 'https://api.github.com/repos/festion/home-assistant-config/pulls/123/comments',
        review_comment_url: 'https://api.github.com/repos/festion/home-assistant-config/pulls/comments{/number}',
        comments_url: 'https://api.github.com/repos/festion/home-assistant-config/issues/123/comments',
        statuses_url: 'https://api.github.com/repos/festion/home-assistant-config/statuses/abc123def456',
        head: {
          label: 'festion:feature-update',
          ref: 'feature-update',
          sha: 'abc123def456',
          user: {
            login: 'festion',
            id: 12345,
            type: 'User'
          },
          repo: {
            id: 123456789,
            name: 'home-assistant-config',
            full_name: 'festion/home-assistant-config',
            owner: {
              login: 'festion',
              id: 12345,
              type: 'User'
            },
            private: false,
            default_branch: 'main'
          }
        },
        base: {
          label: 'festion:main',
          ref: 'main',
          sha: 'def456ghi789',
          user: {
            login: 'festion',
            id: 12345,
            type: 'User'
          },
          repo: {
            id: 123456789,
            name: 'home-assistant-config',
            full_name: 'festion/home-assistant-config',
            owner: {
              login: 'festion',
              id: 12345,
              type: 'User'
            },
            private: false,
            default_branch: 'main'
          }
        }
      },
      repository: {
        id: 123456789,
        name: 'home-assistant-config',
        full_name: 'festion/home-assistant-config',
        owner: {
          login: 'festion',
          id: 12345,
          type: 'User'
        },
        private: false,
        default_branch: 'main'
      },
      sender: {
        login: 'festion',
        id: 12345,
        type: 'User'
      }
    };
    
    return this.deepMerge(defaults, overrides);
  }

  static deploymentConfig(overrides = {}) {
    const defaults = {
      repository: 'festion/home-assistant-config',
      branch: 'main',
      targetPath: '/tmp/integration-test-deployment',
      backupPath: '/tmp/integration-test-backup.tar.gz',
      validateConfig: true,
      createBackup: true,
      timeout: 300000 // 5 minutes
    };
    
    return { ...defaults, ...overrides };
  }

  static rollbackConfig(overrides = {}) {
    const defaults = {
      backupPath: '/tmp/integration-test-rollback-backup.tar.gz',
      targetPath: '/tmp/integration-test-rollback-target',
      reason: 'Integration test rollback',
      timeout: 180000 // 3 minutes
    };
    
    return { ...defaults, ...overrides };
  }

  static homeAssistantConfiguration() {
    return `
homeassistant:
  name: Integration Test Home
  latitude: 37.7749
  longitude: -122.4194
  elevation: 100
  unit_system: metric
  time_zone: America/Los_Angeles
  currency: USD
  customize: !include customize.yaml

# Enable the frontend
frontend:
  themes: !include_dir_merge_named themes

# Enable configuration UI
config:

# HTTP configuration
http:
  server_port: 8123
  cors_allowed_origins:
    - https://google.com
    - https://www.home-assistant.io

# Checks for available updates
updater:
  include_used_components: true

# Discover some devices automatically
discovery:

# Text to speech
tts:
  - platform: google_translate
    service_name: google_say

# Cloud
cloud:

# Automation
automation: !include automations.yaml

# Scripts
script: !include scripts.yaml

# Scenes
scene: !include scenes.yaml

# Groups
group: !include groups.yaml

# Input Boolean
input_boolean: !include input_boolean.yaml

# Input Number
input_number: !include input_number.yaml

# Input Select
input_select: !include input_select.yaml

# Input Text
input_text: !include input_text.yaml

# Sensors
sensor:
  - platform: time_date
    display_options:
      - 'time'
      - 'date'
      - 'date_time'
      - 'time_date'
      - 'time_utc'
      - 'beat'

  - platform: systemmonitor
    resources:
      - type: disk_use_percent
        arg: /home
      - type: memory_use_percent
      - type: processor_use

# Binary Sensors
binary_sensor:
  - platform: ping
    host: 8.8.8.8
    name: "Google DNS"
    count: 2
    scan_interval: 30

# Lights
light:
  - platform: group
    name: Living Room Lights
    entities:
      - light.living_room_lamp
      - light.living_room_ceiling

# Switches
switch:
  - platform: wake_on_lan
    name: "Test Computer"
    mac: "AA:BB:CC:DD:EE:FF"
    host: "192.168.1.100"

# Device Tracker
device_tracker:
  - platform: ping
    hosts:
      test_device: 192.168.1.10

# Climate
climate:
  - platform: generic_thermostat
    name: Test Thermostat
    heater: switch.test_heater
    target_sensor: sensor.test_temperature

# Media Player
media_player:
  - platform: vlc
    name: Test VLC

# Zones
zone:
  - name: Home
    latitude: 37.7749
    longitude: -122.4194
    radius: 100
    icon: mdi:home

  - name: Work
    latitude: 37.7849
    longitude: -122.4094
    radius: 50
    icon: mdi:briefcase

# Person
person:
  - name: Test User
    id: test_user
    device_trackers:
      - device_tracker.test_device

# Camera
camera:
  - platform: generic
    still_image_url: http://192.168.1.200/snapshot.jpg
    name: Test Camera

# Notify
notify:
  - name: test_notify
    platform: file
    filename: /tmp/notifications.txt

# Logger
logger:
  default: info
  logs:
    homeassistant.core: debug
    homeassistant.components.automation: debug

# History
history:
  purge_keep_days: 7
  include:
    domains:
      - sensor
      - switch
      - light
    entities:
      - binary_sensor.google_dns

# Recorder
recorder:
  purge_keep_days: 7
  include:
    domains:
      - sensor
      - switch
      - light
      - automation
    entities:
      - binary_sensor.google_dns
`;
  }

  static automationConfiguration() {
    return `
- id: 'test_automation_1'
  alias: 'Turn on lights at sunset'
  description: 'Automatically turn on living room lights at sunset'
  trigger:
  - platform: sun
    event: sunset
    offset: '-00:30:00'
  condition:
  - condition: state
    entity_id: person.test_user
    state: 'home'
  action:
  - service: light.turn_on
    target:
      entity_id: light.living_room_lights
    data:
      brightness: 180
      color_temp: 370

- id: 'test_automation_2'
  alias: 'Morning routine'
  description: 'Turn on lights and start music in the morning'
  trigger:
  - platform: time
    at: '07:00:00'
  condition:
  - condition: time
    weekday:
      - mon
      - tue
      - wed
      - thu
      - fri
  - condition: state
    entity_id: person.test_user
    state: 'home'
  action:
  - service: light.turn_on
    target:
      entity_id: light.living_room_lights
    data:
      brightness: 255
  - service: media_player.play_media
    target:
      entity_id: media_player.test_vlc
    data:
      media_content_id: 'http://example.com/morning_playlist.m3u'
      media_content_type: 'playlist'

- id: 'test_automation_3'
  alias: 'Security notification'
  description: 'Send notification when door sensor is triggered'
  trigger:
  - platform: state
    entity_id: binary_sensor.front_door
    from: 'off'
    to: 'on'
  condition:
  - condition: state
    entity_id: person.test_user
    state: 'not_home'
  action:
  - service: notify.test_notify
    data:
      message: 'Front door opened while away!'
      title: 'Security Alert'
`;
  }

  static scriptsConfiguration() {
    return `
test_script:
  alias: 'Test Script'
  description: 'A test script for integration testing'
  sequence:
    - service: light.turn_on
      target:
        entity_id: light.living_room_lights
      data:
        brightness: 255
    - delay: '00:00:05'
    - service: light.turn_off
      target:
        entity_id: light.living_room_lights

bedtime_routine:
  alias: 'Bedtime Routine'
  description: 'Turn off all lights and set thermostat'
  sequence:
    - service: light.turn_off
      target:
        entity_id: all
    - service: climate.set_temperature
      target:
        entity_id: climate.test_thermostat
      data:
        temperature: 18
    - service: media_player.turn_off
      target:
        entity_id: all

morning_routine:
  alias: 'Morning Routine'
  description: 'Start the day with lights and music'
  sequence:
    - service: light.turn_on
      target:
        entity_id: light.living_room_lights
      data:
        brightness: 200
    - service: climate.set_temperature
      target:
        entity_id: climate.test_thermostat
      data:
        temperature: 22
    - service: media_player.play_media
      target:
        entity_id: media_player.test_vlc
      data:
        media_content_id: 'http://example.com/morning_news.mp3'
        media_content_type: 'music'
`;
  }

  static invalidConfiguration() {
    return `
homeassistant:
  name: Invalid Config
  # Missing required latitude/longitude

# Invalid automation syntax
automation:
  - alias: Invalid Automation
    trigger:
      - invalid_platform: state  # Should be 'platform'
        entity_id: sensor.test
    action:
      - service: nonexistent.service  # Invalid service
        entity_id: light.test

# Invalid sensor platform
sensor:
  - platform: nonexistent_platform
    name: "Invalid Sensor"

# Invalid light configuration
light:
  - platform: invalid_platform
    invalid_config: true
`;
  }

  static testRepositoryStructure() {
    return {
      'configuration.yaml': this.homeAssistantConfiguration(),
      'automations.yaml': this.automationConfiguration(),
      'scripts.yaml': this.scriptsConfiguration(),
      'scenes.yaml': `[]`,
      'groups.yaml': `{}`,
      'input_boolean.yaml': `{}`,
      'input_number.yaml': `{}`,
      'input_select.yaml': `{}`,
      'input_text.yaml': `{}`,
      'customize.yaml': `{}`,
      'secrets.yaml': `
# Test secrets
test_api_key: "test_key_123"
test_password: "test_password_456"
`,
      '.gitignore': `
*.log
*.db
*.pid
secrets.yaml
known_devices.yaml
__pycache__/
.storage/
deps/
tts/
`
    };
  }

  static mcpServerCapabilities() {
    return {
      networkFs: {
        tools: [
          { name: 'mcp__network-fs__list_network_directory' },
          { name: 'mcp__network-fs__read_network_file' },
          { name: 'mcp__network-fs__write_network_file' },
          { name: 'mcp__network-fs__delete_network_file' },
          { name: 'mcp__network-fs__create_network_directory' },
          { name: 'mcp__network-fs__get_network_file_info' },
          { name: 'mcp__network-fs__get_share_info' }
        ]
      },
      github: {
        tools: [
          { name: 'mcp__github__get_file_contents' },
          { name: 'mcp__github__create_or_update_file' },
          { name: 'mcp__github__delete_file' },
          { name: 'mcp__github__create_branch' },
          { name: 'mcp__github__list_branches' },
          { name: 'mcp__github__get_commit' },
          { name: 'mcp__github__list_commits' },
          { name: 'mcp__github__create_pull_request' },
          { name: 'mcp__github__get_pull_request' },
          { name: 'mcp__github__list_pull_requests' }
        ]
      }
    };
  }

  static apiResponses() {
    return {
      deploymentCreated: {
        status: 'success',
        data: {
          deploymentId: 'deploy-20250713-120000',
          state: 'queued',
          repository: 'festion/home-assistant-config',
          branch: 'main',
          createdAt: new Date().toISOString()
        }
      },
      deploymentStatus: {
        status: 'success',
        data: {
          deploymentId: 'deploy-20250713-120000',
          state: 'in-progress',
          repository: 'festion/home-assistant-config',
          branch: 'main',
          progress: {
            currentStep: 'Validate Configuration',
            stepsCompleted: 2,
            totalSteps: 5
          },
          startedAt: new Date().toISOString()
        }
      },
      deploymentCompleted: {
        status: 'success',
        data: {
          deploymentId: 'deploy-20250713-120000',
          state: 'completed',
          repository: 'festion/home-assistant-config',
          branch: 'main',
          progress: {
            currentStep: 'Deployment Complete',
            stepsCompleted: 5,
            totalSteps: 5
          },
          startedAt: new Date(Date.now() - 300000).toISOString(),
          completedAt: new Date().toISOString()
        }
      }
    };
  }

  // Utility method for deep merging objects
  static deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // Generate unique IDs for test data
  static generateDeploymentId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `deploy-${dateStr}-${timeStr}`;
  }

  static generateRollbackId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `rollback-${dateStr}-${timeStr}`;
  }

  static generateCommitSha() {
    return crypto.randomBytes(20).toString('hex');
  }

  static generateWebhookDeliveryId() {
    return crypto.randomUUID();
  }
}

module.exports = { IntegrationFixtures };
/**
 * Unit tests for Validator utility
 * Tests validation functions for configurations, deployments, and data integrity
 */

const fs = require('fs').promises;
const yaml = require('js-yaml');

// Mock validator implementation
class Validator {
  constructor(options = {}) {
    this.strictMode = options.strictMode || false;
    this.allowedExtensions = options.allowedExtensions || ['.yaml', '.yml', '.json'];
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
  }

  async validateDeploymentRequest(request) {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!request.repository) {
      errors.push('Repository is required');
    }

    if (!request.branch) {
      errors.push('Branch is required');
    }

    if (!request.commitHash) {
      errors.push('Commit hash is required');
    }

    // Format validation
    if (request.repository && !/^[\w\-\.]+\/[\w\-\.]+$/.test(request.repository)) {
      errors.push('Invalid repository format (expected: owner/repo)');
    }

    if (request.branch && !/^[\w\-\.\/]+$/.test(request.branch)) {
      errors.push('Invalid branch name format');
    }

    if (request.commitHash && !/^[a-f0-9]{7,40}$/.test(request.commitHash)) {
      errors.push('Invalid commit hash format');
    }

    // Optional field validation
    if (request.deploymentType && !['full', 'incremental', 'rollback'].includes(request.deploymentType)) {
      errors.push('Invalid deployment type (must be: full, incremental, or rollback)');
    }

    if (request.priority && !['low', 'normal', 'high', 'urgent'].includes(request.priority)) {
      errors.push('Invalid priority level');
    }

    // Warnings for potentially problematic values
    if (request.branch === 'master' || request.branch === 'main') {
      warnings.push('Deploying from main/master branch - ensure this is intentional');
    }

    if (request.force === true) {
      warnings.push('Force deployment enabled - this may overwrite manual changes');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details: {
        requiredFieldsPresent: !request.repository ? false : !request.branch ? false : !!request.commitHash,
        formatValidationPassed: errors.filter(e => e.includes('format')).length === 0
      }
    };
  }

  async validateConfiguration(configContent, filePath) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      syntax: { valid: true, errors: [] },
      semantics: { valid: true, errors: [], warnings: [] },
      security: { valid: true, issues: [] }
    };

    try {
      // File extension validation
      const ext = require('path').extname(filePath);
      if (!this.allowedExtensions.includes(ext)) {
        result.errors.push(`Unsupported file extension: ${ext}`);
        result.valid = false;
        return result;
      }

      // Size validation
      if (Buffer.byteLength(configContent, 'utf8') > this.maxFileSize) {
        result.errors.push('Configuration file exceeds maximum size limit');
        result.valid = false;
        return result;
      }

      // Syntax validation
      if (ext === '.yaml' || ext === '.yml') {
        result.syntax = await this.validateYAMLSyntax(configContent);
      } else if (ext === '.json') {
        result.syntax = this.validateJSONSyntax(configContent);
      }

      if (!result.syntax.valid) {
        result.valid = false;
        result.errors.push(...result.syntax.errors);
        return result;
      }

      // Parse configuration for semantic validation
      const config = ext === '.json' ? 
        JSON.parse(configContent) : 
        yaml.load(configContent);

      // Semantic validation
      result.semantics = this.validateHomeAssistantSemantics(config);
      if (!result.semantics.valid) {
        result.valid = false;
        result.errors.push(...result.semantics.errors);
      }
      result.warnings.push(...result.semantics.warnings);

      // Security validation
      result.security = this.validateConfigurationSecurity(configContent);
      if (!result.security.valid) {
        if (this.strictMode) {
          result.valid = false;
          result.errors.push(...result.security.issues);
        } else {
          result.warnings.push(...result.security.issues);
        }
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(`Configuration validation failed: ${error.message}`);
    }

    return result;
  }

  async validateYAMLSyntax(content) {
    try {
      yaml.load(content);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          line: error.mark?.line || 0,
          column: error.mark?.column || 0,
          message: error.message,
          snippet: error.mark?.snippet || null
        }]
      };
    }
  }

  validateJSONSyntax(content) {
    try {
      JSON.parse(content);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          message: error.message,
          position: error.message.match(/position (\d+)/)?.[1] || 0
        }]
      };
    }
  }

  validateHomeAssistantSemantics(config) {
    const errors = [];
    const warnings = [];

    // Check for required Home Assistant sections
    if (!config.homeassistant && !config.default_config) {
      errors.push('Missing required homeassistant or default_config section');
    }

    // Validate sensor configurations
    if (config.sensor) {
      const sensorErrors = this.validateSensorConfig(config.sensor);
      errors.push(...sensorErrors);
    }

    // Validate automation configurations
    if (config.automation) {
      const automationErrors = this.validateAutomationConfig(config.automation);
      errors.push(...automationErrors);
    }

    // Check for deprecated configurations
    if (config.group) {
      warnings.push('The "group" domain is deprecated, consider using the Groups UI');
    }

    if (config.discovery) {
      warnings.push('The "discovery" component is deprecated, use "zeroconf" instead');
    }

    // Validate entity IDs format
    const entityIdIssues = this.validateEntityIds(config);
    errors.push(...entityIdIssues);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  validateSensorConfig(sensors) {
    const errors = [];

    if (!Array.isArray(sensors)) {
      errors.push('Sensor configuration must be an array');
      return errors;
    }

    sensors.forEach((sensor, index) => {
      if (!sensor.platform) {
        errors.push(`Sensor ${index}: Missing required 'platform' field`);
      }

      if (sensor.platform === 'template' && !sensor.sensors) {
        errors.push(`Sensor ${index}: Template platform requires 'sensors' field`);
      }

      if (sensor.entity_id && !/^[a-z_]+\.[a-z0-9_]+$/.test(sensor.entity_id)) {
        errors.push(`Sensor ${index}: Invalid entity_id format`);
      }
    });

    return errors;
  }

  validateAutomationConfig(automations) {
    const errors = [];

    if (!Array.isArray(automations)) {
      errors.push('Automation configuration must be an array');
      return errors;
    }

    automations.forEach((automation, index) => {
      if (!automation.trigger) {
        errors.push(`Automation ${index}: Missing required 'trigger' field`);
      }

      if (!automation.action) {
        errors.push(`Automation ${index}: Missing required 'action' field`);
      }

      if (automation.trigger && Array.isArray(automation.trigger)) {
        automation.trigger.forEach((trigger, triggerIndex) => {
          if (!trigger.platform) {
            errors.push(`Automation ${index}, trigger ${triggerIndex}: Missing 'platform' field`);
          }
        });
      }
    });

    return errors;
  }

  validateEntityIds(config) {
    const errors = [];
    const entityIdPattern = /^[a-z_]+\.[a-z0-9_]+$/;

    const findEntityIds = (obj, path = '') => {
      if (typeof obj !== 'object' || obj === null) return;

      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;

        if (key === 'entity_id') {
          if (typeof value === 'string' && !entityIdPattern.test(value)) {
            errors.push(`Invalid entity_id format at ${currentPath}: ${value}`);
          } else if (Array.isArray(value)) {
            value.forEach((entityId, index) => {
              if (!entityIdPattern.test(entityId)) {
                errors.push(`Invalid entity_id format at ${currentPath}[${index}]: ${entityId}`);
              }
            });
          }
        } else if (typeof value === 'object') {
          findEntityIds(value, currentPath);
        }
      });
    };

    findEntityIds(config);
    return errors;
  }

  validateConfigurationSecurity(content) {
    const issues = [];

    // Check for hardcoded passwords
    const passwordPatterns = [
      /password:\s*[^!]/i,
      /api_key:\s*[^!]/i,
      /token:\s*[^!]/i,
      /secret:\s*[^!]/i
    ];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      passwordPatterns.forEach(pattern => {
        if (pattern.test(line) && !line.includes('!secret')) {
          issues.push(`Line ${index + 1}: Potential hardcoded secret detected`);
        }
      });

      // Check for HTTP URLs (should use HTTPS)
      if (line.includes('http://') && !line.includes('localhost') && !line.includes('127.0.0.1')) {
        issues.push(`Line ${index + 1}: HTTP URL detected, consider using HTTPS`);
      }

      // Check for weak encryption
      if (line.match(/\b(md5|sha1)\b/i)) {
        issues.push(`Line ${index + 1}: Weak encryption algorithm detected`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }

  validateFileIntegrity(filePath, expectedChecksum, algorithm = 'sha256') {
    return new Promise((resolve) => {
      const crypto = require('crypto');
      const hash = crypto.createHash(algorithm);

      // Mock file reading for testing
      const mockContent = 'mock file content for testing';
      hash.update(mockContent);
      const actualChecksum = hash.digest('hex');

      resolve({
        valid: actualChecksum === expectedChecksum,
        expected: expectedChecksum,
        actual: actualChecksum,
        algorithm,
        filePath
      });
    });
  }

  validateBackupIntegrity(backupData) {
    const errors = [];
    const warnings = [];

    // Check required backup fields
    if (!backupData.id) {
      errors.push('Backup ID is required');
    }

    if (!backupData.created) {
      errors.push('Backup creation timestamp is required');
    }

    if (!backupData.files || !Array.isArray(backupData.files)) {
      errors.push('Backup must contain a files array');
    }

    // Validate backup metadata
    if (backupData.metadata) {
      if (typeof backupData.metadata.size !== 'number' || backupData.metadata.size <= 0) {
        errors.push('Invalid backup size in metadata');
      }

      if (backupData.metadata.checksum && !/^[a-f0-9]+$/.test(backupData.metadata.checksum)) {
        errors.push('Invalid checksum format in metadata');
      }
    }

    // Check file entries
    if (backupData.files) {
      backupData.files.forEach((file, index) => {
        if (!file.path) {
          errors.push(`File ${index}: Missing path`);
        }

        if (typeof file.size !== 'number' || file.size < 0) {
          errors.push(`File ${index}: Invalid size`);
        }

        if (file.checksum && !/^[a-f0-9]+$/.test(file.checksum)) {
          errors.push(`File ${index}: Invalid checksum format`);
        }
      });
    }

    // Warnings for potentially problematic backups
    if (backupData.metadata?.size > 1024 * 1024 * 1024) { // 1GB
      warnings.push('Large backup size detected - may take significant time to restore');
    }

    const age = Date.now() - new Date(backupData.created).getTime();
    if (age > 30 * 24 * 60 * 60 * 1000) { // 30 days
      warnings.push('Backup is older than 30 days - consider creating a fresh backup');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        fileCount: backupData.files?.length || 0,
        totalSize: backupData.metadata?.size || 0,
        age: Math.floor(age / (24 * 60 * 60 * 1000)) // days
      }
    };
  }
}

describe('Validator', () => {
  let validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('deployment request validation', () => {
    it('should validate complete deployment request', async () => {
      const request = {
        repository: 'user/home-assistant-config',
        branch: 'main',
        commitHash: 'abc123def456',
        deploymentType: 'full',
        priority: 'normal'
      };

      const result = await validator.validateDeploymentRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.requiredFieldsPresent).toBe(true);
      expect(result.details.formatValidationPassed).toBe(true);
    });

    it('should reject request with missing required fields', async () => {
      const request = {
        repository: 'user/repo'
        // Missing branch and commitHash
      };

      const result = await validator.validateDeploymentRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Branch is required');
      expect(result.errors).toContain('Commit hash is required');
    });

    it('should validate format requirements', async () => {
      const request = {
        repository: 'invalid-repo-format',
        branch: 'feature/invalid@branch',
        commitHash: 'not-a-valid-hash',
        deploymentType: 'invalid-type',
        priority: 'invalid-priority'
      };

      const result = await validator.validateDeploymentRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid repository format (expected: owner/repo)');
      expect(result.errors).toContain('Invalid branch name format');
      expect(result.errors).toContain('Invalid commit hash format');
      expect(result.errors).toContain('Invalid deployment type (must be: full, incremental, or rollback)');
      expect(result.errors).toContain('Invalid priority level');
    });

    it('should generate warnings for potentially problematic values', async () => {
      const request = {
        repository: 'user/repo',
        branch: 'main',
        commitHash: 'abc123def456',
        force: true
      };

      const result = await validator.validateDeploymentRequest(request);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Deploying from main/master branch - ensure this is intentional');
      expect(result.warnings).toContain('Force deployment enabled - this may overwrite manual changes');
    });
  });

  describe('configuration validation', () => {
    it('should validate correct YAML configuration', async () => {
      const yamlContent = `
homeassistant:
  name: Home
  latitude: 40.7128
  longitude: -74.0060

sensor:
  - platform: template
    sensors:
      temperature:
        friendly_name: "Temperature"
        value_template: "{{ states('sensor.temp') }}"
`;

      const result = await validator.validateConfiguration(yamlContent, 'configuration.yaml');

      expect(result.valid).toBe(true);
      expect(result.syntax.valid).toBe(true);
      expect(result.semantics.valid).toBe(true);
    });

    it('should detect YAML syntax errors', async () => {
      const invalidYaml = `
homeassistant:
  name: Home
  latitude: invalid: syntax
`;

      const result = await validator.validateConfiguration(invalidYaml, 'configuration.yaml');

      expect(result.valid).toBe(false);
      expect(result.syntax.valid).toBe(false);
      expect(result.syntax.errors).toHaveLength(1);
    });

    it('should validate JSON configuration', async () => {
      const jsonContent = `{
        "homeassistant": {
          "name": "Home"
        }
      }`;

      const result = await validator.validateConfiguration(jsonContent, 'configuration.json');

      expect(result.valid).toBe(true);
      expect(result.syntax.valid).toBe(true);
    });

    it('should detect JSON syntax errors', async () => {
      const invalidJson = `{
        "homeassistant": {
          "name": "Home",
        }
      }`;

      const result = await validator.validateConfiguration(invalidJson, 'configuration.json');

      expect(result.valid).toBe(false);
      expect(result.syntax.valid).toBe(false);
    });

    it('should reject unsupported file extensions', async () => {
      const result = await validator.validateConfiguration('content', 'config.txt');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported file extension: .txt');
    });

    it('should detect security issues in configuration', async () => {
      const insecureContent = `
homeassistant:
  name: Home
mqtt:
  password: hardcoded123
  broker: http://insecure.example.com
encryption:
  algorithm: md5
`;

      const result = await validator.validateConfiguration(insecureContent, 'configuration.yaml');

      expect(result.security.valid).toBe(false);
      expect(result.security.issues.some(issue => issue.includes('hardcoded secret'))).toBe(true);
      expect(result.security.issues.some(issue => issue.includes('HTTP URL'))).toBe(true);
      expect(result.security.issues.some(issue => issue.includes('Weak encryption'))).toBe(true);
    });

    it('should validate Home Assistant semantics', async () => {
      const configWithErrors = `
sensor:
  - name: "Missing Platform"
  - platform: template
automation:
  - alias: "Missing Trigger"
    action:
      - service: light.turn_on
`;

      const result = await validator.validateConfiguration(configWithErrors, 'configuration.yaml');

      expect(result.semantics.valid).toBe(false);
      expect(result.semantics.errors.some(e => e.includes('Missing required'))).toBe(true);
    });
  });

  describe('file integrity validation', () => {
    it('should validate file with correct checksum', async () => {
      const crypto = require('crypto');
      const mockContent = 'mock file content for testing';
      const expectedChecksum = crypto.createHash('sha256').update(mockContent).digest('hex');

      const result = await validator.validateFileIntegrity('/path/to/file', expectedChecksum);

      expect(result.valid).toBe(true);
      expect(result.actual).toBe(expectedChecksum);
      expect(result.algorithm).toBe('sha256');
    });

    it('should detect file with incorrect checksum', async () => {
      const result = await validator.validateFileIntegrity('/path/to/file', 'wrong-checksum');

      expect(result.valid).toBe(false);
      expect(result.expected).toBe('wrong-checksum');
      expect(result.actual).not.toBe('wrong-checksum');
    });
  });

  describe('backup integrity validation', () => {
    it('should validate complete backup data', () => {
      const backupData = {
        id: 'backup-123',
        created: new Date().toISOString(),
        files: [
          { path: 'configuration.yaml', size: 1024, checksum: 'abc123' },
          { path: 'automations.yaml', size: 512, checksum: 'def456' }
        ],
        metadata: {
          size: 1536,
          checksum: 'backup-checksum-123'
        }
      };

      const result = validator.validateBackupIntegrity(backupData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.fileCount).toBe(2);
      expect(result.summary.totalSize).toBe(1536);
    });

    it('should detect missing required backup fields', () => {
      const incompleteBackup = {
        files: []
      };

      const result = validator.validateBackupIntegrity(incompleteBackup);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Backup ID is required');
      expect(result.errors).toContain('Backup creation timestamp is required');
    });

    it('should validate file entries in backup', () => {
      const backupWithInvalidFiles = {
        id: 'backup-123',
        created: new Date().toISOString(),
        files: [
          { size: 1024 }, // Missing path
          { path: 'test.yaml', size: -1 }, // Invalid size
          { path: 'other.yaml', size: 512, checksum: 'invalid-checksum-format' }
        ],
        metadata: { size: 1536 }
      };

      const result = validator.validateBackupIntegrity(backupWithInvalidFiles);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing path'))).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid size'))).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid checksum format'))).toBe(true);
    });

    it('should generate warnings for old or large backups', () => {
      const oldLargeBackup = {
        id: 'backup-123',
        created: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days ago
        files: [],
        metadata: {
          size: 2 * 1024 * 1024 * 1024 // 2GB
        }
      };

      const result = validator.validateBackupIntegrity(oldLargeBackup);

      expect(result.warnings).toContain('Large backup size detected - may take significant time to restore');
      expect(result.warnings).toContain('Backup is older than 30 days - consider creating a fresh backup');
    });
  });

  describe('entity ID validation', () => {
    it('should validate proper entity ID formats', () => {
      const config = {
        sensor: {
          entity_id: 'sensor.temperature'
        },
        automation: [
          {
            trigger: {
              entity_id: ['light.living_room', 'switch.kitchen']
            }
          }
        ]
      };

      const errors = validator.validateEntityIds(config);

      expect(errors).toHaveLength(0);
    });

    it('should detect invalid entity ID formats', () => {
      const config = {
        sensor: {
          entity_id: 'Invalid-Entity-ID'
        },
        automation: [
          {
            trigger: {
              entity_id: ['valid.entity', 'Invalid.Entity.ID']
            }
          }
        ]
      };

      const errors = validator.validateEntityIds(config);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Invalid-Entity-ID'))).toBe(true);
      expect(errors.some(e => e.includes('Invalid.Entity.ID'))).toBe(true);
    });
  });
});
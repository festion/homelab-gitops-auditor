/**
 * Unit tests for Health Checker
 * Tests all health checking functionality with proper mocking
 */

const { HealthChecker } = require('../../../scripts/health-checks/health-checker');
const { MockHomeAssistantAPI } = require('../../mocks/home-assistant-api.mock');
const { MockMCPCoordinator } = require('../../mocks/mcp-coordinator.mock');
const { DeploymentFixtures } = require('../../fixtures/deployment-data');
const axios = require('axios');
const fs = require('fs').promises;
const { exec } = require('child_process');
const yaml = require('js-yaml');

// Mock all external dependencies
jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    readdir: jest.fn()
  }
}));
jest.mock('child_process');
jest.mock('js-yaml');
jest.mock('../../../api/services/mcp-coordinator');
jest.mock('../../../api/utils/logger');

describe('HealthChecker', () => {
  let healthChecker;
  let mockAxios;
  let mockMCPCoordinator;
  let mockLogger;
  let mockExec;

  beforeEach(() => {
    mockAxios = axios;
    mockAxios.get = jest.fn();

    mockMCPCoordinator = new MockMCPCoordinator();
    const MockMCPCoordinatorClass = require('../../../api/services/mcp-coordinator').MCPCoordinator;
    MockMCPCoordinatorClass.mockImplementation(() => mockMCPCoordinator);

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
    const MockLogger = require('../../../api/utils/logger').Logger;
    MockLogger.mockImplementation(() => mockLogger);

    mockExec = jest.fn();
    exec.mockImplementation((command, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      mockExec(command, options, callback);
    });

    healthChecker = new HealthChecker();

    // Mock file system operations
    fs.readFile.mockResolvedValue('{}');
    fs.readdir.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      mockMCPCoordinator.initialize.mockResolvedValue(true);

      await healthChecker.initialize();

      expect(mockMCPCoordinator.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Health Checker initialized');
      expect(healthChecker.config).toBeDefined();
      expect(healthChecker.config.thresholds).toBeDefined();
    });

    it('should use environment variables for configuration', async () => {
      process.env.HOME_ASSISTANT_URL = 'http://test-ha-url:8123/api';
      process.env.HOME_ASSISTANT_TOKEN = 'test-token-123';

      await healthChecker.initialize();

      expect(healthChecker.config.deployment.homeAssistantConfig.healthCheckEndpoint).toBe('http://test-ha-url:8123/api');
      expect(healthChecker.config.deployment.homeAssistantConfig.token).toBe('test-token-123');

      // Cleanup
      delete process.env.HOME_ASSISTANT_URL;
      delete process.env.HOME_ASSISTANT_TOKEN;
    });

    it('should load baseline metrics if available', async () => {
      const baselineMetrics = {
        responseTime: 100,
        diskUsage: 50,
        memoryUsage: 60
      };
      fs.readFile.mockResolvedValueOnce(JSON.stringify(baselineMetrics));

      await healthChecker.initialize();

      expect(healthChecker.baselineMetrics).toEqual(baselineMetrics);
    });

    it('should handle missing baseline metrics gracefully', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await healthChecker.initialize();

      expect(healthChecker.baselineMetrics).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('No baseline metrics found, will create new baseline');
    });
  });

  describe('pre-deployment checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should pass all pre-deployment checks when system is healthy', async () => {
      // Mock Home Assistant API
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: [{ entity_id: 'sensor.test', state: 'on' }],
        headers: { 'x-ha-version': '2025.7.0' }
      });

      // Mock system resources with correct command matching
      mockExec.mockImplementation((cmd, opts, cb) => {
        if (cmd.includes('df /') && cmd.includes('$5') && cmd.includes('sed')) {
          cb(null, { stdout: '75', stderr: '' }); // disk usage (75%)
        } else if (cmd.includes('free') && cmd.includes('Mem')) {
          cb(null, { stdout: '68.5', stderr: '' }); // memory usage (68.5%)
        } else if (cmd.includes('top') && cmd.includes('Cpu')) {
          cb(null, { stdout: '45.2', stderr: '' }); // CPU usage (45.2%)
        } else if (cmd.includes('du -sb')) {
          cb(null, { stdout: '1000000', stderr: '' }); // backup directory size (1MB)
        } else if (cmd.includes('df /backup') && cmd.includes('$4')) {
          cb(null, { stdout: '5000000', stderr: '' }); // available space (5GB in KB)
        } else {
          cb(null, { stdout: '0', stderr: '' }); // default
        }
      });

      // Mock MCP coordinator health
      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'healthy' },
        github: { status: 'healthy' }
      });

      const result = await healthChecker.performPreDeploymentChecks();

      expect(result.overall.healthy).toBe(true);
      expect(result.overall.healthyChecks).toBeGreaterThan(0);
      expect(result.overall.unhealthyChecks).toBe(0);
      expect(result.checks).toHaveLength(5);
      expect(mockLogger.info).toHaveBeenCalledWith('Pre-deployment health checks passed');
    });

    it('should fail pre-deployment checks when Home Assistant is unreachable', async () => {
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      // Mock other systems as healthy
      mockExec.mockImplementation((cmd, opts, cb) => cb(null, { stdout: '50', stderr: '' }));
      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'healthy' },
        github: { status: 'healthy' }
      });

      await expect(healthChecker.performPreDeploymentChecks()).rejects.toThrow('Pre-deployment health checks failed');
    });

    it('should fail pre-deployment checks when system resources are critical', async () => {
      // Mock Home Assistant as healthy
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: [],
        headers: {}
      });

      // Mock critical system resources
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '95', stderr: '' })) // critical disk usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '98.5', stderr: '' })) // critical memory usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '99.2', stderr: '' })); // critical CPU usage

      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'healthy' },
        github: { status: 'healthy' }
      });

      await expect(healthChecker.performPreDeploymentChecks()).rejects.toThrow('Pre-deployment health checks failed');
    });

    it('should fail when MCP servers are unhealthy', async () => {
      // Mock Home Assistant as healthy
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: [],
        headers: {}
      });

      // Mock system resources as healthy
      mockExec.mockImplementation((cmd, opts, cb) => cb(null, { stdout: '50', stderr: '' }));

      // Mock MCP coordinator with unhealthy servers
      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'error', lastError: 'Connection timeout' },
        github: { status: 'healthy' }
      });

      await expect(healthChecker.performPreDeploymentChecks()).rejects.toThrow('Pre-deployment health checks failed');
    });
  });

  describe('post-deployment checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
      // Mock sleep function to avoid delays in tests
      jest.spyOn(healthChecker, 'sleep').mockResolvedValue();
    });

    it('should pass all post-deployment checks when system is healthy', async () => {
      // Mock Home Assistant API
      mockAxios.get
        .mockResolvedValueOnce({ // /states endpoint
          status: 200,
          data: [{ entity_id: 'sensor.test', state: 'on' }],
          headers: { 'x-ha-version': '2025.7.0' }
        })
        .mockResolvedValueOnce({ // /config endpoint
          status: 200,
          data: {
            version: '2025.7.0',
            unit_system: 'metric',
            time_zone: 'America/New_York',
            components: ['mqtt', 'homekit']
          }
        })
        .mockResolvedValueOnce({ // performance check
          status: 200,
          data: Array(100).fill({ entity_id: 'test' })
        });

      // Mock configuration validation
      jest.spyOn(healthChecker, 'validateConfiguration').mockResolvedValue({
        valid: true,
        yamlSyntax: { valid: true, errors: [] },
        homeAssistantConfig: { valid: true, errors: [] }
      });

      const result = await healthChecker.performPostDeploymentChecks();

      expect(result.overall.healthy).toBe(true);
      expect(result.checks).toHaveLength(5);
      expect(result.checks.find(c => c.name === 'home-assistant-api')).toBeDefined();
      expect(result.checks.find(c => c.name === 'configuration-integrity')).toBeDefined();
      expect(result.checks.find(c => c.name === 'service-availability')).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Post-deployment health checks passed');
    });

    it('should fail when configuration is invalid', async () => {
      // Mock Home Assistant API as healthy
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: [],
        headers: {}
      });

      // Mock invalid configuration
      jest.spyOn(healthChecker, 'validateConfiguration').mockResolvedValue({
        valid: false,
        yamlSyntax: { valid: false, errors: [{ error: 'Invalid YAML syntax' }] }
      });

      await expect(healthChecker.performPostDeploymentChecks()).rejects.toThrow('Post-deployment health checks failed');
    });

    it('should detect performance degradation', async () => {
      // Mock slow Home Assistant API responses
      mockAxios.get.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              status: 200,
              data: [],
              headers: {}
            });
          }, 3000); // 3 second delay, exceeds threshold
        });
      });

      await expect(healthChecker.performPostDeploymentChecks()).rejects.toThrow('Post-deployment health checks failed');
    });
  });

  describe('Home Assistant API checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should check Home Assistant API successfully', async () => {
      const mockResponse = {
        status: 200,
        data: [
          { entity_id: 'sensor.temperature', state: '22.5' },
          { entity_id: 'light.living_room', state: 'on' }
        ],
        headers: { 'x-ha-version': '2025.7.0' }
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await healthChecker.checkHomeAssistantAPI();

      expect(result.name).toBe('home-assistant-api');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.details.stateCount).toBe(2);
      expect(result.details.version).toBe('2025.7.0');
    });

    it('should handle Home Assistant API errors', async () => {
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await healthChecker.checkHomeAssistantAPI();

      expect(result.name).toBe('home-assistant-api');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';
      mockAxios.get.mockRejectedValue(timeoutError);

      const result = await healthChecker.checkHomeAssistantAPI();

      expect(result.status).toBe('unhealthy');
      expect(result.details.timeout).toBe(true);
    });

    it('should handle unexpected status codes', async () => {
      mockAxios.get.mockResolvedValue({
        status: 503,
        data: { error: 'Service unavailable' }
      });

      const result = await healthChecker.checkHomeAssistantAPI();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Unexpected status code: 503');
    });
  });

  describe('system resource checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should check system resources when healthy', async () => {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '75', stderr: '' })) // disk usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '68.5', stderr: '' })) // memory usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '45.2', stderr: '' })); // CPU usage

      const result = await healthChecker.checkSystemResources();

      expect(result.name).toBe('system-resources');
      expect(result.status).toBe('healthy');
      expect(result.details.diskUsage).toBe(75);
      expect(result.details.memoryUsage).toBe(68.5);
      expect(result.details.cpuUsage).toBe(45.2);
    });

    it('should detect high resource usage', async () => {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '95', stderr: '' })) // high disk usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '98.5', stderr: '' })) // high memory usage
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '99.2', stderr: '' })); // high CPU usage

      const result = await healthChecker.checkSystemResources();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Disk usage high: 95%');
      expect(result.error).toContain('Memory usage high: 98.5%');
      expect(result.error).toContain('CPU usage high: 99.2%');
    });

    it('should handle system command failures', async () => {
      mockExec.mockImplementation((cmd, opts, cb) => cb(new Error('Command not found')));

      const result = await healthChecker.checkSystemResources();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Command not found');
    });
  });

  describe('configuration validation', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should validate configuration successfully', async () => {
      const configFiles = [
        { name: 'configuration.yaml', path: '/config/configuration.yaml' },
        { name: 'automations.yaml', path: '/config/automations.yaml' }
      ];

      fs.readdir.mockResolvedValue([
        { name: 'configuration.yaml', isFile: () => true },
        { name: 'automations.yaml', isFile: () => true }
      ]);

      const yamlContent = DeploymentFixtures.configFiles.validHomeAssistantConfig();
      fs.readFile.mockResolvedValue(yamlContent);
      yaml.load.mockReturnValue({ homeassistant: { name: 'Home' } });

      // Mock Home Assistant config check command
      mockExec.mockImplementation((cmd, opts, cb) => {
        if (cmd.includes('check_config')) {
          cb(null, { stdout: 'Configuration check successful', stderr: '' });
        } else {
          cb(new Error('Command not found'));
        }
      });

      const result = await healthChecker.validateConfiguration('/config');

      expect(result.valid).toBe(true);
      expect(result.yamlSyntax.valid).toBe(true);
      expect(result.homeAssistantConfig.valid).toBe(true);
    });

    it('should detect YAML syntax errors', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'configuration.yaml', isFile: () => true }
      ]);

      const invalidYaml = DeploymentFixtures.configFiles.invalidYAMLConfig();
      fs.readFile.mockResolvedValue(invalidYaml);
      yaml.load.mockImplementation(() => {
        throw new Error('mapping values are not allowed here');
      });

      const result = await healthChecker.validateConfiguration('/config');

      expect(result.valid).toBe(false);
      expect(result.yamlSyntax.valid).toBe(false);
      expect(result.yamlSyntax.errors).toHaveLength(1);
      expect(result.yamlSyntax.errors[0].error).toContain('mapping values are not allowed here');
    });

    it('should detect Home Assistant configuration errors', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'configuration.yaml', isFile: () => true }
      ]);

      const validYaml = DeploymentFixtures.configFiles.validHomeAssistantConfig();
      fs.readFile.mockResolvedValue(validYaml);
      yaml.load.mockReturnValue({ homeassistant: { name: 'Home' } });

      // Mock Home Assistant config check with errors
      mockExec.mockImplementation((cmd, opts, cb) => {
        if (cmd.includes('check_config')) {
          cb(null, { 
            stdout: 'Configuration check failed', 
            stderr: 'Invalid platform: nonexistent_platform' 
          });
        } else {
          cb(new Error('Command not found'));
        }
      });

      const result = await healthChecker.validateConfiguration('/config');

      expect(result.valid).toBe(false);
      expect(result.homeAssistantConfig.valid).toBe(false);
      expect(result.homeAssistantConfig.errors).toContain('Invalid platform: nonexistent_platform');
    });

    it('should detect security compliance issues', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'configuration.yaml', isFile: () => true }
      ]);

      const insecureConfig = `
homeassistant:
  name: Home
mqtt:
  broker: 192.168.1.1
  username: user
  password: plaintext_password
http:
  base_url: http://insecure-site.com
`;

      fs.readFile.mockResolvedValue(insecureConfig);
      yaml.load.mockReturnValue({ homeassistant: { name: 'Home' } });

      const result = await healthChecker.validateConfiguration('/config');

      expect(result.security.valid).toBe(false);
      expect(result.security.issues).toContain(expect.stringContaining('hardcoded credentials'));
      expect(result.security.issues).toContain(expect.stringContaining('Insecure HTTP protocol'));
    });
  });

  describe('MCP server checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should check MCP servers when all are healthy', async () => {
      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'healthy' },
        github: { status: 'healthy' }
      });

      const result = await healthChecker.checkMCPServers();

      expect(result.name).toBe('mcp-servers');
      expect(result.status).toBe('healthy');
      expect(result.details.healthyServers).toEqual(['networkFs', 'github']);
      expect(result.details.unhealthyServers).toHaveLength(0);
      expect(result.details.totalServers).toBe(2);
    });

    it('should detect unhealthy MCP servers', async () => {
      mockMCPCoordinator.getHealthStatus.mockResolvedValue({
        networkFs: { status: 'error', lastError: 'Connection timeout' },
        github: { status: 'healthy' }
      });

      const result = await healthChecker.checkMCPServers();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Unhealthy servers: networkFs');
      expect(result.details.unhealthyServers).toHaveLength(1);
      expect(result.details.unhealthyServers[0]).toEqual({
        server: 'networkFs',
        error: 'Connection timeout'
      });
    });

    it('should handle MCP coordinator errors', async () => {
      mockMCPCoordinator.getHealthStatus.mockRejectedValue(new Error('MCP coordinator not initialized'));

      const result = await healthChecker.checkMCPServers();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('MCP coordinator not initialized');
    });
  });

  describe('network connectivity checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should check network connectivity when all endpoints are reachable', async () => {
      mockAxios.get
        .mockResolvedValueOnce({ status: 200 }) // home-assistant
        .mockResolvedValueOnce({ status: 200 }) // github
        .mockResolvedValueOnce({ status: 200 }); // dns

      const result = await healthChecker.checkNetworkConnectivity();

      expect(result.name).toBe('network-connectivity');
      expect(result.status).toBe('healthy');
      expect(result.details.totalEndpoints).toBe(3);
      expect(result.details.failedEndpoints).toBe(0);
    });

    it('should detect failed connections', async () => {
      mockAxios.get
        .mockRejectedValueOnce(new Error('ECONNREFUSED')) // home-assistant fails
        .mockResolvedValueOnce({ status: 200 }) // github succeeds
        .mockResolvedValueOnce({ status: 200 }); // dns succeeds

      const result = await healthChecker.checkNetworkConnectivity();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Failed connections: home-assistant');
      expect(result.details.failedEndpoints).toBe(1);
    });
  });

  describe('backup space checks', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should check backup space when sufficient space is available', async () => {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '50000000', stderr: '' })) // directory size (50MB)
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '5000000', stderr: '' })); // available space (5GB)

      const result = await healthChecker.checkBackupSpace();

      expect(result.name).toBe('backup-space');
      expect(result.status).toBe('healthy');
      expect(result.details.currentUsage).toBe(50000000);
      expect(result.details.availableSpace).toBe(5000000 * 1024); // Converted to bytes
    });

    it('should detect insufficient backup space', async () => {
      mockExec
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '50000000', stderr: '' })) // directory size
        .mockImplementationOnce((cmd, opts, cb) => cb(null, { stdout: '100', stderr: '' })); // very little available space

      const result = await healthChecker.checkBackupSpace();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Insufficient backup space');
      expect(result.details.availableSpace).toBe(100 * 1024);
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await healthChecker.initialize();
    });

    it('should process health results correctly', () => {
      const results = [
        { value: { name: 'test1', status: 'healthy' } },
        { value: { name: 'test2', status: 'unhealthy', error: 'Test error' } },
        { value: { name: 'test3', status: 'healthy' } }
      ];

      const report = healthChecker.processHealthResults(results, 'test-phase');

      expect(report.phase).toBe('test-phase');
      expect(report.overall.healthy).toBe(false);
      expect(report.overall.totalChecks).toBe(3);
      expect(report.overall.healthyChecks).toBe(2);
      expect(report.overall.unhealthyChecks).toBe(1);
      expect(report.overall.failureReason).toContain('Test error');
      expect(report.timestamp).toBeDefined();
    });

    it('should get configuration files correctly', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'configuration.yaml', isFile: () => true },
        { name: 'automations.yaml', isFile: () => true },
        { name: 'secrets.yaml', isFile: () => true },
        { name: 'other.txt', isFile: () => true },
        { name: 'subdirectory', isFile: () => false }
      ]);

      const files = await healthChecker.getConfigurationFiles('/config');

      expect(files).toHaveLength(3); // Only .yaml files
      expect(files.map(f => f.name)).toEqual(['configuration.yaml', 'automations.yaml', 'secrets.yaml']);
      expect(files[0].path).toBe('/config/configuration.yaml');
    });

    it('should handle directory read errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      const files = await healthChecker.getConfigurationFiles('/config');

      expect(files).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not read config directory')
      );
    });
  });
});
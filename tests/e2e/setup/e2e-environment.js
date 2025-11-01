const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

class E2ETestEnvironment {
  constructor() {
    this.services = new Map();
    this.isInitialized = false;
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3071';
    this.dashboardUrl = process.env.DASHBOARD_BASE_URL || 'http://localhost:3000';
    this.homeAssistantUrl = process.env.HOME_ASSISTANT_URL || 'http://localhost:8123';
    this.mcpServerProcesses = new Map();
    this.cleanupTasks = [];
  }

  async startFullEnvironment() {
    if (this.isInitialized) {
      console.log('✅ E2E environment already initialized');
      return;
    }

    console.log('🚀 Starting full E2E test environment...');
    
    try {
      // Start services in order
      await this.startDatabaseService();
      await this.startMCPServers();
      await this.startAPIService();
      await this.startDashboardService();
      await this.startMockHomeAssistant();
      
      // Wait for all services to be ready
      await this.waitForServicesReady();
      
      // Setup test data
      await this.setupTestData();
      
      this.isInitialized = true;
      console.log('✅ E2E test environment started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start E2E test environment:', error.message);
      await this.stopFullEnvironment();
      throw error;
    }
  }

  async stopFullEnvironment() {
    console.log('🛑 Stopping E2E test environment...');
    
    // Execute cleanup tasks
    for (const cleanupTask of this.cleanupTasks) {
      try {
        await cleanupTask();
      } catch (error) {
        console.warn('⚠️ Cleanup task failed:', error.message);
      }
    }
    
    // Stop services
    for (const [serviceName, service] of this.services) {
      try {
        if (service.stop) {
          await service.stop();
        } else if (service.kill) {
          service.kill('SIGTERM');
        }
        console.log(`✅ Stopped ${serviceName}`);
      } catch (error) {
        console.warn(`⚠️ Error stopping ${serviceName}:`, error.message);
      }
    }
    
    // Stop MCP servers
    for (const [serverName, process] of this.mcpServerProcesses) {
      try {
        process.kill('SIGTERM');
        console.log(`✅ Stopped MCP server ${serverName}`);
      } catch (error) {
        console.warn(`⚠️ Error stopping MCP server ${serverName}:`, error.message);
      }
    }
    
    this.services.clear();
    this.mcpServerProcesses.clear();
    this.cleanupTasks = [];
    this.isInitialized = false;
    
    console.log('✅ E2E test environment stopped');
  }

  async startDatabaseService() {
    console.log('🗄️ Starting database service...');
    
    // Check if PostgreSQL is available
    try {
      const { Pool } = require('pg');
      const testPool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || '5432',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: 'postgres',
        connectionTimeoutMillis: 5000
      });
      
      const client = await testPool.connect();
      
      // Create E2E test database
      const e2eDbName = `homelab_gitops_e2e_${Date.now()}`;
      await client.query(`CREATE DATABASE "${e2eDbName}"`);
      
      client.release();
      await testPool.end();
      
      // Store database info for cleanup
      this.e2eDbName = e2eDbName;
      this.cleanupTasks.push(async () => {
        try {
          const adminPool = new Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: process.env.POSTGRES_PORT || '5432',
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'postgres',
            database: 'postgres'
          });
          
          const adminClient = await adminPool.connect();
          await adminClient.query(`DROP DATABASE IF EXISTS "${e2eDbName}"`);
          adminClient.release();
          await adminPool.end();
        } catch (error) {
          console.warn('Failed to cleanup E2E database:', error.message);
        }
      });
      
      console.log(`✅ Database service ready (${e2eDbName})`);
      
    } catch (error) {
      console.warn('⚠️ PostgreSQL not available, using in-memory database');
    }
  }

  async startMCPServers() {
    console.log('🔌 Starting MCP servers...');
    
    const mcpServers = [
      {
        name: 'network-fs',
        script: '/home/dev/workspace/network-mcp-wrapper.sh',
        env: { MCP_TEST_MODE: 'true', E2E_TEST_MODE: 'true' }
      },
      {
        name: 'github',
        script: '/home/dev/workspace/github-wrapper.sh',
        env: { MCP_TEST_MODE: 'true', E2E_TEST_MODE: 'true' }
      }
    ];
    
    for (const server of mcpServers) {
      try {
        const serverExists = await fs.access(server.script).then(() => true).catch(() => false);
        if (serverExists) {
          await this.startMCPServer(server);
          console.log(`✅ MCP server ${server.name} started`);
        } else {
          console.warn(`⚠️ MCP server script not found: ${server.script}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to start MCP server ${server.name}:`, error.message);
      }
    }
  }

  async startMCPServer(serverConfig) {
    return new Promise((resolve, reject) => {
      const process = spawn('bash', [serverConfig.script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...serverConfig.env
        }
      });
      
      this.mcpServerProcesses.set(serverConfig.name, process);
      
      const timeout = setTimeout(() => {
        reject(new Error(`MCP server ${serverConfig.name} failed to start within timeout`));
      }, 15000);
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server started') || output.includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      process.stderr.on('data', (data) => {
        console.warn(`MCP ${serverConfig.name} stderr:`, data.toString().trim());
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async startAPIService() {
    console.log('🚀 Starting API service...');
    
    return new Promise((resolve, reject) => {
      const apiProcess = spawn('node', ['api/server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          E2E_TEST_MODE: 'true',
          PORT: '3071',
          DATABASE_URL: this.e2eDbName ? `postgresql://postgres:postgres@localhost:5432/${this.e2eDbName}` : undefined
        },
        cwd: process.cwd()
      });
      
      this.services.set('api', apiProcess);
      
      const timeout = setTimeout(() => {
        reject(new Error('API service failed to start within timeout'));
      }, 30000);
      
      apiProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server listening') || output.includes('API server started')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      apiProcess.stderr.on('data', (data) => {
        console.warn('API stderr:', data.toString().trim());
      });
      
      apiProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      apiProcess.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`API service exited with code ${code}`));
        }
      });
    });
  }

  async startDashboardService() {
    console.log('📊 Starting dashboard service...');
    
    return new Promise((resolve, reject) => {
      const dashboardProcess = spawn('npm', ['run', 'start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          E2E_TEST_MODE: 'true',
          PORT: '3000',
          REACT_APP_API_URL: this.baseUrl
        },
        cwd: path.join(process.cwd(), 'dashboard')
      });
      
      this.services.set('dashboard', dashboardProcess);
      
      const timeout = setTimeout(() => {
        reject(new Error('Dashboard service failed to start within timeout'));
      }, 60000);
      
      dashboardProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('serve') || output.includes('Local:') || output.includes('serving')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      dashboardProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // React dev server sometimes outputs warnings to stderr
        if (output.includes('serve') || output.includes('Local:')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      dashboardProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async startMockHomeAssistant() {
    console.log('🏠 Starting mock Home Assistant...');
    
    // Create a simple mock Home Assistant server for E2E tests
    const mockHACode = `
const express = require('express');
const app = express();

app.use(express.json());

let isHealthy = true;
let configValid = true;

// Health check endpoint
app.get('/api/', (req, res) => {
  res.json({
    message: 'API running.',
    version: '2024.1.0'
  });
});

// Configuration check endpoint
app.get('/api/config', (req, res) => {
  res.json({
    unit_system: {
      length: 'km',
      mass: 'kg',
      temperature: '°C',
      volume: 'L'
    },
    location_name: 'E2E Test Home',
    time_zone: 'UTC',
    version: '2024.1.0',
    config_dir: '/config'
  });
});

// State endpoint
app.get('/api/states', (req, res) => {
  res.json([
    {
      entity_id: 'sun.sun',
      state: 'above_horizon',
      attributes: {
        next_dawn: '2024-01-01T06:00:00+00:00',
        next_dusk: '2024-01-01T18:00:00+00:00'
      }
    }
  ]);
});

// Services endpoint
app.get('/api/services', (req, res) => {
  res.json([
    {
      domain: 'homeassistant',
      services: {
        restart: {
          description: 'Restart Home Assistant',
          fields: {}
        }
      }
    }
  ]);
});

// Error endpoints for testing failure scenarios
app.post('/api/test/fail', (req, res) => {
  isHealthy = false;
  configValid = false;
  res.json({ message: 'Failure mode enabled' });
});

app.post('/api/test/recover', (req, res) => {
  isHealthy = true;
  configValid = true;
  res.json({ message: 'Recovery mode enabled' });
});

// Health check for our tests
app.get('/api/test/health', (req, res) => {
  res.json({
    status: isHealthy ? 'running' : 'error',
    configurationValid: configValid,
    apiResponsive: true,
    version: '2024.1.0'
  });
});

const port = process.env.PORT || 8123;
app.listen(port, () => {
  console.log(\`Mock Home Assistant listening on port \${port}\`);
});
`;
    
    // Write mock HA server file
    const mockHAPath = path.join(process.cwd(), 'tests/e2e/mock-home-assistant.js');
    await fs.writeFile(mockHAPath, mockHACode);
    
    return new Promise((resolve, reject) => {
      const mockHAProcess = spawn('node', [mockHAPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PORT: '8123'
        }
      });
      
      this.services.set('mock-home-assistant', mockHAProcess);
      
      const timeout = setTimeout(() => {
        reject(new Error('Mock Home Assistant failed to start within timeout'));
      }, 15000);
      
      mockHAProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('listening on port')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      mockHAProcess.stderr.on('data', (data) => {
        console.warn('Mock HA stderr:', data.toString().trim());
      });
      
      mockHAProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async waitForServicesReady() {
    console.log('⏳ Waiting for services to be ready...');
    
    const services = [
      { name: 'API', url: `${this.baseUrl}/health`, timeout: 30000 },
      { name: 'Dashboard', url: `${this.dashboardUrl}/`, timeout: 60000 },
      { name: 'Mock Home Assistant', url: `${this.homeAssistantUrl}/api/`, timeout: 15000 }
    ];
    
    for (const service of services) {
      try {
        await this.waitForService(service.url, service.timeout);
        console.log(`✅ ${service.name} is ready`);
      } catch (error) {
        console.warn(`⚠️ ${service.name} not ready: ${error.message}`);
      }
    }
    
    // Additional wait for stability
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  async waitForService(url, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url, { timeout: 5000 });
        if (response.ok || response.status < 500) {
          return true;
        }
      } catch (error) {
        // Continue polling
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Service at ${url} not ready within ${timeout}ms`);
  }

  async setupTestData() {
    console.log('📊 Setting up test data...');
    
    try {
      // Create test users
      await this.createTestUsers();
      
      // Setup test configurations
      await this.setupTestConfigurations();
      
      console.log('✅ Test data setup completed');
    } catch (error) {
      console.warn('⚠️ Test data setup failed:', error.message);
    }
  }

  async createTestUsers() {
    const users = [
      { username: 'admin', password: 'test-password-123', role: 'admin' },
      { username: 'operator', password: 'test-password-123', role: 'operator' },
      { username: 'viewer', password: 'test-password-123', role: 'viewer' }
    ];
    
    for (const user of users) {
      try {
        await fetch(`${this.baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });
      } catch (error) {
        // User might already exist, continue
      }
    }
  }

  async setupTestConfigurations() {
    // Setup any additional test configurations needed
    // This could include test repositories, webhooks, etc.
  }

  async resetState() {
    console.log('🔄 Resetting test state...');
    
    try {
      // Reset database state
      await fetch(`${this.baseUrl}/api/test/reset`, { method: 'POST' });
      
      // Reset mock Home Assistant state
      await fetch(`${this.homeAssistantUrl}/api/test/recover`, { method: 'POST' });
      
      // Clear any test files
      await this.clearTestFiles();
      
    } catch (error) {
      console.warn('⚠️ State reset failed:', error.message);
    }
  }

  async clearTestFiles() {
    const testPaths = [
      '/tmp/e2e-test-data',
      '/tmp/e2e-test-backups',
      '/tmp/e2e-test-deployments'
    ];
    
    for (const testPath of testPaths) {
      try {
        await fs.rmdir(testPath, { recursive: true });
      } catch (error) {
        // Directory might not exist
      }
    }
  }

  // Utility methods for tests
  async authenticateUser(role = 'operator') {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: role,
        password: 'test-password-123'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.token;
  }

  async triggerManualDeployment(deploymentData, authToken) {
    return await fetch(`${this.baseUrl}/api/deployments/home-assistant-config/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(deploymentData)
    });
  }

  async triggerManualRollback(rollbackData, authToken) {
    return await fetch(`${this.baseUrl}/api/deployments/home-assistant-config/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(rollbackData)
    });
  }

  async getDeploymentStatus(deploymentId) {
    const response = await fetch(`${this.baseUrl}/api/deployments/${deploymentId}/status`);
    return await response.json();
  }

  async getHomeAssistantStatus() {
    const response = await fetch(`${this.homeAssistantUrl}/api/test/health`);
    return await response.json();
  }

  async simulateHomeAssistantFailure() {
    await fetch(`${this.homeAssistantUrl}/api/test/fail`, { method: 'POST' });
  }

  async simulateHomeAssistantRecovery() {
    await fetch(`${this.homeAssistantUrl}/api/test/recover`, { method: 'POST' });
  }
}

module.exports = { E2ETestEnvironment };
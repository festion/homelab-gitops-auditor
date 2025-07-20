const { setup: setupDevServer } = require('@jest/test-sequencer');
const E2ETestEnvironment = require('./e2e-environment');
const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Global test environment instance
let globalTestEnv = null;
let globalGitHubSim = null;
let globalMonitoring = null;

async function globalSetup() {
  console.log('🚀 Starting E2E Test Global Setup...');
  
  try {
    // Create test results directories
    await createTestDirectories();
    
    // Initialize test environment
    console.log('🔧 Initializing E2E test environment...');
    globalTestEnv = new E2ETestEnvironment();
    
    // Start all services
    console.log('🏗️  Starting test services...');
    await globalTestEnv.startFullEnvironment();
    
    // Initialize GitHub simulator
    console.log('🐙 Initializing GitHub simulator...');
    globalGitHubSim = new GitHubSimulator({
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'test-webhook-secret'
    });
    
    // Initialize monitoring
    console.log('📊 Initializing monitoring utilities...');
    globalMonitoring = new MonitoringUtils({
      apiBaseUrl: 'http://localhost:3000',
      dashboardUrl: 'http://localhost:8080',
      mcpServerUrl: 'http://localhost:8081'
    });
    
    // Verify all services are healthy
    console.log('🔍 Performing health checks...');
    await verifyServicesHealth();
    
    // Set up test data
    console.log('📝 Setting up test data...');
    await setupTestData();
    
    // Store global instances for tests to access
    global.__E2E_TEST_ENV__ = globalTestEnv;
    global.__GITHUB_SIMULATOR__ = globalGitHubSim;
    global.__MONITORING_UTILS__ = globalMonitoring;
    
    console.log('✅ E2E Test Global Setup completed successfully');
    
    // Save setup completion marker
    await fs.writeFile(
      path.join(process.cwd(), 'test-results', 'setup-complete.json'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        services: {
          api: 'http://localhost:3000',
          dashboard: 'http://localhost:8080',
          mcp: 'http://localhost:8081',
          homeassistant: 'http://localhost:8123'
        }
      }, null, 2)
    );
    
  } catch (error) {
    console.error('❌ E2E Test Global Setup failed:', error);
    
    // Attempt cleanup on failure
    if (globalTestEnv) {
      try {
        await globalTestEnv.cleanup();
      } catch (cleanupError) {
        console.error('Failed to cleanup after setup failure:', cleanupError);
      }
    }
    
    throw error;
  }
}

async function createTestDirectories() {
  const directories = [
    'test-results',
    'test-results/screenshots',
    'test-results/logs',
    'test-results/metrics',
    'test-results/artifacts',
    'test-results/reports'
  ];
  
  for (const dir of directories) {
    await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
  }
  
  console.log('📁 Created test directories');
}

async function verifyServicesHealth() {
  const healthChecks = [
    {
      name: 'API Server',
      url: 'http://localhost:3000/api/health',
      timeout: 30000
    },
    {
      name: 'Dashboard',
      url: 'http://localhost:8080/health',
      timeout: 30000
    },
    {
      name: 'MCP Server',
      url: 'http://localhost:8081/api/health',
      timeout: 30000
    },
    {
      name: 'Mock Home Assistant',
      url: 'http://localhost:8123/api/',
      timeout: 30000
    }
  ];
  
  for (const check of healthChecks) {
    try {
      await globalMonitoring.waitForServiceHealth(
        check.name.toLowerCase().replace(' ', '-'),
        check.url.split('/')[0] + '//' + check.url.split('/')[2],
        '/' + check.url.split('/').slice(3).join('/'),
        check.timeout
      );
      console.log(`✅ ${check.name} is healthy`);
    } catch (error) {
      console.error(`❌ ${check.name} health check failed:`, error.message);
      throw new Error(`Service ${check.name} failed health check`);
    }
  }
}

async function setupTestData() {
  try {
    // Create initial successful deployment for baseline
    const baselinePayload = globalGitHubSim.createSuccessfulDeploymentScenario();
    const signature = globalGitHubSim.generateWebhookSignature(baselinePayload);
    
    const axios = require('axios');
    const response = await axios.post('http://localhost:3000/api/webhook/github', 
      baselinePayload, {
        headers: {
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'push',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status === 200) {
      const deploymentId = response.data.deploymentId;
      await globalMonitoring.pollDeploymentStatus(deploymentId, 300000);
      console.log('✅ Baseline deployment created successfully');
      
      // Store baseline deployment ID for tests
      global.__BASELINE_DEPLOYMENT_ID__ = deploymentId;
    }
    
  } catch (error) {
    console.warn('⚠️  Failed to create baseline deployment:', error.message);
    // This is not critical for all tests, so we continue
  }
}

// Function to get test environment instances (for use in tests)
function getTestEnvironment() {
  return {
    testEnv: global.__E2E_TEST_ENV__,
    githubSim: global.__GITHUB_SIMULATOR__,
    monitoring: global.__MONITORING_UTILS__,
    baselineDeploymentId: global.__BASELINE_DEPLOYMENT_ID__
  };
}

module.exports = {
  globalSetup,
  getTestEnvironment
};
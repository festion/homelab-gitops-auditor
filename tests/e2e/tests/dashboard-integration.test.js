const puppeteer = require('puppeteer');
const GitHubSimulator = require('../utils/github-simulator');
const MonitoringUtils = require('../utils/monitoring-utils');
const E2ETestEnvironment = require('../setup/e2e-environment');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

describe('Dashboard Integration E2E Tests', () => {
  let testEnv;
  let githubSim;
  let monitoring;
  let browser;
  let page;
  const screenshotDir = './test-results/screenshots';

  beforeAll(async () => {
    testEnv = new E2ETestEnvironment();
    await testEnv.startFullEnvironment();
    
    githubSim = new GitHubSimulator({
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'test-webhook-secret'
    });
    
    monitoring = new MonitoringUtils({
      apiBaseUrl: 'http://localhost:3000',
      dashboardUrl: 'http://localhost:8080',
      mcpServerUrl: 'http://localhost:8081'
    });

    // Create screenshots directory
    await fs.mkdir(screenshotDir, { recursive: true });

    // Launch browser for UI testing
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    
    await monitoring.saveMetricsReport('dashboard-integration');
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (page) await page.close();
    page = await browser.newPage();
    
    // Set viewport for consistent screenshots
    await page.setViewport({ width: 1280, height: 720 });
    
    monitoring.clearMetrics();
  });

  async function takeScreenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(screenshotDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  async function waitForDashboardLoad() {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for main dashboard elements to be present
    await page.waitForSelector('[data-testid="dashboard-container"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="deployments-section"]', { timeout: 15000 });
  }

  describe('Dashboard Loading and Initial State', () => {
    test('should load dashboard and display initial deployment state', async () => {
      await monitoring.captureResourceUsage('dashboard_load_start');
      
      const startTime = Date.now();
      await waitForDashboardLoad();
      const loadTime = Date.now() - startTime;
      
      await monitoring.captureResourceUsage('dashboard_load_end');
      await takeScreenshot('dashboard-initial-load');

      // Verify dashboard loads within reasonable time
      expect(loadTime).toBeLessThan(10000); // 10 seconds

      // Check essential dashboard elements
      const title = await page.$eval('[data-testid="dashboard-title"]', el => el.textContent);
      expect(title).toContain('Homelab GitOps Auditor');

      const deploymentsSection = await page.$('[data-testid="deployments-section"]');
      expect(deploymentsSection).toBeTruthy();

      const statusIndicator = await page.$('[data-testid="system-status"]');
      expect(statusIndicator).toBeTruthy();

      // Verify no JavaScript errors
      const errors = await page.evaluate(() => window.jsErrors || []);
      expect(errors).toEqual([]);
    });

    test('should display correct initial system status', async () => {
      await waitForDashboardLoad();
      await takeScreenshot('dashboard-system-status');

      // Check system status indicators
      const systemStatus = await page.$eval('[data-testid="system-status"]', el => el.textContent);
      expect(systemStatus).toMatch(/(healthy|operational)/i);

      // Check service status indicators
      const services = ['api', 'home-assistant', 'mcp-server'];
      for (const service of services) {
        const serviceStatus = await page.$eval(
          `[data-testid="service-status-${service}"]`, 
          el => el.getAttribute('data-status')
        );
        expect(serviceStatus).toBe('healthy');
      }

      // Verify dashboard API connectivity
      const lastUpdated = await page.$eval('[data-testid="last-updated"]', el => el.textContent);
      expect(lastUpdated).toMatch(/\d+.*ago/); // Should show relative time
    });
  });

  describe('Live Deployment Monitoring', () => {
    test('should show real-time deployment progress in dashboard', async () => {
      await waitForDashboardLoad();
      await takeScreenshot('dashboard-before-deployment');

      // Start a deployment
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentId = webhookResponse.data.deploymentId;

      // Wait for deployment to appear in dashboard
      await page.waitForSelector(`[data-testid="deployment-${deploymentId}"]`, { timeout: 30000 });
      await takeScreenshot('dashboard-deployment-started');

      // Monitor deployment progress in UI
      let deploymentCompleted = false;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes at 5-second intervals

      while (!deploymentCompleted && attempts < maxAttempts) {
        await page.reload({ waitUntil: 'networkidle0' });
        
        const deploymentElement = await page.$(`[data-testid="deployment-${deploymentId}"]`);
        if (deploymentElement) {
          const status = await deploymentElement.evaluate(el => el.getAttribute('data-status'));
          const progress = await deploymentElement.evaluate(el => 
            el.querySelector('[data-testid="progress-bar"]')?.getAttribute('data-progress') || '0'
          );

          console.log(`Deployment ${deploymentId} status: ${status}, progress: ${progress}%`);

          if (status === 'completed') {
            deploymentCompleted = true;
            await takeScreenshot('dashboard-deployment-completed');
          } else if (status === 'failed') {
            await takeScreenshot('dashboard-deployment-failed');
            throw new Error('Deployment failed in dashboard');
          }
        }

        if (!deploymentCompleted) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      expect(deploymentCompleted).toBe(true);

      // Verify deployment details are shown correctly
      const deploymentCard = await page.$(`[data-testid="deployment-${deploymentId}"]`);
      const commitHash = await deploymentCard.$eval('[data-testid="commit-hash"]', el => el.textContent);
      expect(commitHash).toBe(webhookPayload.after.substring(0, 8));

      const timestamp = await deploymentCard.$eval('[data-testid="deployment-timestamp"]', el => el.textContent);
      expect(timestamp).toMatch(/\d+.*ago/);
    });

    test('should display deployment logs in expandable view', async () => {
      await waitForDashboardLoad();

      // Trigger a deployment first
      const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentId = webhookResponse.data.deploymentId;

      // Wait for deployment to complete
      await monitoring.pollDeploymentStatus(deploymentId, 300000);
      
      // Refresh dashboard and find the deployment
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector(`[data-testid="deployment-${deploymentId}"]`, { timeout: 30000 });

      // Click to expand deployment details
      await page.click(`[data-testid="deployment-${deploymentId}"] [data-testid="expand-button"]`);
      
      // Wait for logs section to appear
      await page.waitForSelector(`[data-testid="deployment-logs-${deploymentId}"]`, { timeout: 10000 });
      await takeScreenshot('dashboard-deployment-logs');

      // Verify logs are displayed
      const logsContainer = await page.$(`[data-testid="deployment-logs-${deploymentId}"]`);
      const logEntries = await logsContainer.$$('[data-testid="log-entry"]');
      expect(logEntries.length).toBeGreaterThan(0);

      // Check log content
      const firstLogEntry = await logEntries[0].evaluate(el => el.textContent);
      expect(firstLogEntry).toMatch(/(deployment|webhook|started|configuration)/i);

      // Test log filtering if available
      const logFilter = await page.$(`[data-testid="log-filter-${deploymentId}"]`);
      if (logFilter) {
        await logFilter.select('error');
        await page.waitForSelector(`[data-testid="filtered-logs-${deploymentId}"]`, { timeout: 5000 });
      }
    });
  });

  describe('Dashboard Interactivity', () => {
    test('should allow manual deployment trigger from dashboard', async () => {
      await waitForDashboardLoad();

      // Find and click manual deployment button
      const manualDeployButton = await page.$('[data-testid="manual-deploy-button"]');
      if (manualDeployButton) {
        await manualDeployButton.click();
        
        // Fill in deployment form
        await page.waitForSelector('[data-testid="deploy-form"]', { timeout: 10000 });
        await takeScreenshot('dashboard-manual-deploy-form');

        await page.type('[data-testid="commit-hash-input"]', 'test-manual-commit-hash');
        await page.type('[data-testid="deploy-reason-input"]', 'Manual deployment from E2E test');
        
        // Submit deployment
        await page.click('[data-testid="submit-deploy-button"]');
        
        // Wait for deployment to be created
        await page.waitForSelector('[data-testid^="deployment-"]', { timeout: 30000 });
        await takeScreenshot('dashboard-manual-deploy-triggered');

        // Verify deployment appears in the list
        const deployments = await page.$$('[data-testid^="deployment-"]');
        expect(deployments.length).toBeGreaterThan(0);
      }
    });

    test('should allow deployment cancellation from dashboard', async () => {
      await waitForDashboardLoad();

      // Start a long-running deployment
      const webhookPayload = githubSim.createLargeConfigScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentId = webhookResponse.data.deploymentId;

      // Wait for deployment to appear and be in progress
      await page.waitForSelector(`[data-testid="deployment-${deploymentId}"]`, { timeout: 30000 });
      
      // Wait a bit for deployment to start
      await new Promise(resolve => setTimeout(resolve, 10000));
      await page.reload({ waitUntil: 'networkidle0' });

      const deploymentElement = await page.$(`[data-testid="deployment-${deploymentId}"]`);
      const status = await deploymentElement.evaluate(el => el.getAttribute('data-status'));

      if (status === 'in_progress' || status === 'deploying') {
        // Click cancel button
        const cancelButton = await deploymentElement.$('[data-testid="cancel-button"]');
        if (cancelButton) {
          await cancelButton.click();
          
          // Confirm cancellation in modal
          await page.waitForSelector('[data-testid="confirm-cancel-modal"]', { timeout: 5000 });
          await page.click('[data-testid="confirm-cancel-button"]');
          await takeScreenshot('dashboard-deployment-cancelled');

          // Wait for status to update
          await new Promise(resolve => setTimeout(resolve, 5000));
          await page.reload({ waitUntil: 'networkidle0' });

          const updatedElement = await page.$(`[data-testid="deployment-${deploymentId}"]`);
          const updatedStatus = await updatedElement.evaluate(el => el.getAttribute('data-status'));
          expect(updatedStatus).toBe('cancelled');
        }
      }
    });

    test('should refresh deployment status automatically', async () => {
      await waitForDashboardLoad();
      
      // Check for auto-refresh functionality
      const lastUpdatedBefore = await page.$eval('[data-testid="last-updated"]', el => el.textContent);
      
      // Wait for auto-refresh (should happen every 30 seconds or so)
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      const lastUpdatedAfter = await page.$eval('[data-testid="last-updated"]', el => el.textContent);
      expect(lastUpdatedAfter).not.toBe(lastUpdatedBefore);

      await takeScreenshot('dashboard-auto-refreshed');
    });
  });

  describe('Dashboard Error Handling', () => {
    test('should display error states gracefully when API is unavailable', async () => {
      await waitForDashboardLoad();
      
      // Stop the API service temporarily
      await testEnv.stopAPIService();
      
      // Wait for dashboard to detect API unavailability
      await new Promise(resolve => setTimeout(resolve, 10000));
      await page.reload({ waitUntil: 'networkidle0' });
      
      await takeScreenshot('dashboard-api-unavailable');

      // Check for error state in UI
      const errorIndicator = await page.$('[data-testid="api-error"]');
      if (errorIndicator) {
        const errorMessage = await errorIndicator.evaluate(el => el.textContent);
        expect(errorMessage).toMatch(/(unavailable|error|connection)/i);
      }

      // Restart API service
      await testEnv.startAPIService();
      
      // Wait for dashboard to recover
      await new Promise(resolve => setTimeout(resolve, 15000));
      await page.reload({ waitUntil: 'networkidle0' });
      
      // Verify dashboard recovers
      const systemStatus = await page.$eval('[data-testid="system-status"]', el => el.textContent);
      expect(systemStatus).toMatch(/(healthy|operational)/i);
    });

    test('should handle failed deployments display correctly', async () => {
      await waitForDashboardLoad();

      // Trigger a failing deployment
      const webhookPayload = githubSim.createHomeAssistantFailureScenario();
      const signature = githubSim.generateWebhookSignature(webhookPayload);

      const webhookResponse = await axios.post('http://localhost:3000/api/webhook/github', 
        webhookPayload, {
          headers: {
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'push',
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentId = webhookResponse.data.deploymentId;

      // Wait for deployment to complete (fail)
      await monitoring.pollDeploymentStatus(deploymentId, 600000);
      
      // Refresh dashboard
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector(`[data-testid="deployment-${deploymentId}"]`, { timeout: 30000 });

      await takeScreenshot('dashboard-failed-deployment');

      // Verify failed deployment is displayed correctly
      const deploymentElement = await page.$(`[data-testid="deployment-${deploymentId}"]`);
      const status = await deploymentElement.evaluate(el => el.getAttribute('data-status'));
      expect(status).toBe('failed');

      // Check for error details
      const errorIndicator = await deploymentElement.$('[data-testid="error-indicator"]');
      expect(errorIndicator).toBeTruthy();

      // Expand to see error details
      await deploymentElement.click('[data-testid="expand-button"]');
      await page.waitForSelector(`[data-testid="error-details-${deploymentId}"]`, { timeout: 5000 });

      const errorDetails = await page.$eval(`[data-testid="error-details-${deploymentId}"]`, el => el.textContent);
      expect(errorDetails).toMatch(/(error|failed|configuration)/i);
    });
  });

  describe('Dashboard Performance', () => {
    test('should maintain responsive performance with multiple deployments', async () => {
      const performanceStart = Date.now();
      await waitForDashboardLoad();
      const initialLoadTime = Date.now() - performanceStart;

      // Trigger multiple deployments to populate the dashboard
      const deploymentPromises = [];
      for (let i = 0; i < 5; i++) {
        const webhookPayload = githubSim.createSuccessfulDeploymentScenario();
        webhookPayload.after = `test-commit-${i}-${Date.now()}`;
        const signature = githubSim.generateWebhookSignature(webhookPayload);

        deploymentPromises.push(
          axios.post('http://localhost:3000/api/webhook/github', webhookPayload, {
            headers: {
              'X-Hub-Signature-256': signature,
              'X-GitHub-Event': 'push',
              'Content-Type': 'application/json'
            }
          })
        );

        // Stagger requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      await Promise.all(deploymentPromises);

      // Wait for all deployments to appear in dashboard
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const refreshStart = Date.now();
      await page.reload({ waitUntil: 'networkidle0' });
      const refreshTime = Date.now() - refreshStart;

      await takeScreenshot('dashboard-multiple-deployments');

      // Performance checks
      expect(initialLoadTime).toBeLessThan(15000); // 15 seconds initial load
      expect(refreshTime).toBeLessThan(10000); // 10 seconds refresh with data

      // Check that all deployments are displayed
      const deploymentElements = await page.$$('[data-testid^="deployment-"]');
      expect(deploymentElements.length).toBeGreaterThanOrEqual(5);

      // Verify dashboard remains responsive
      const scrollStart = Date.now();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, 0));
      const scrollTime = Date.now() - scrollStart;
      
      expect(scrollTime).toBeLessThan(1000); // Scrolling should be smooth
    });
  });
});
#!/usr/bin/env node
/**
 * Complete Health Check System Test
 * Tests the entire health check and deployment integration
 */

const { HealthChecker } = require('./health-checker');
const { DeploymentOrchestrator } = require('../../api/services/deployment-orchestrator');

class CompleteSystemTester {
  constructor() {
    this.healthChecker = null;
    this.deploymentOrchestrator = null;
    this.testResults = [];
  }

  async runCompleteSystemTest() {
    console.log('🚀 Complete Health Check System Test\n');
    console.log('Testing health check integration with deployment orchestrator...\n');

    try {
      await this.initializeComponents();
      await this.testHealthCheckerStandalone();
      await this.testDeploymentIntegration();
      await this.testErrorScenarios();
      
      this.printCompleteSummary();
      
    } catch (error) {
      console.error('❌ System test failed:', error.message);
      process.exit(1);
    }
  }

  async initializeComponents() {
    console.log('🔧 Initializing Components...');
    
    try {
      // Initialize Health Checker
      this.healthChecker = new HealthChecker();
      await this.healthChecker.initialize();
      console.log('   ✅ Health Checker initialized');
      
      // Initialize Deployment Orchestrator
      this.deploymentOrchestrator = new DeploymentOrchestrator({
        healthChecksEnabled: true,
        rollbackEnabled: true
      });
      await this.deploymentOrchestrator.initialize();
      console.log('   ✅ Deployment Orchestrator initialized');
      
      this.recordTest('Component Initialization', true);
      
    } catch (error) {
      this.recordTest('Component Initialization', false, error.message);
      throw error;
    }
    console.log();
  }

  async testHealthCheckerStandalone() {
    console.log('🏥 Testing Health Checker Standalone...');
    
    // Test individual health checks
    const healthChecks = [
      { name: 'System Resources', method: () => this.healthChecker.checkSystemResources() },
      { name: 'Network Connectivity', method: () => this.healthChecker.checkNetworkConnectivity() },
      { name: 'MCP Servers', method: () => this.healthChecker.checkMCPServers() },
      { name: 'Home Assistant API', method: () => this.healthChecker.checkHomeAssistantAPI() }
    ];

    for (const check of healthChecks) {
      try {
        console.log(`   🔍 Testing ${check.name}...`);
        const result = await check.method();
        
        const passed = result && result.name && (result.status === 'healthy' || result.status === 'unhealthy');
        this.recordTest(`Health Check: ${check.name}`, passed);
        
        if (passed) {
          console.log(`   ✅ ${check.name}: ${result.status}`);
        } else {
          console.log(`   ❌ ${check.name}: Invalid response format`);
        }
        
      } catch (error) {
        this.recordTest(`Health Check: ${check.name}`, false, error.message);
        console.log(`   ⚠️  ${check.name}: ${error.message}`);
      }
    }
    console.log();
  }

  async testDeploymentIntegration() {
    console.log('🔧 Testing Deployment Integration...');
    
    try {
      // Test pre-deployment health check method
      console.log('   🔍 Testing pre-deployment health checks...');
      const mockDeployment = {
        id: 'test-deployment-001',
        config: { validation: { enabled: true } },
        steps: []
      };
      
      await this.deploymentOrchestrator.performPreDeploymentHealthChecks(mockDeployment);
      
      if (mockDeployment.preHealthReport) {
        console.log('   ✅ Pre-deployment health checks completed');
        console.log(`   📊 Healthy checks: ${mockDeployment.preHealthReport.overall.healthyChecks}/${mockDeployment.preHealthReport.overall.totalChecks}`);
        this.recordTest('Pre-deployment Health Checks', true);
      } else {
        console.log('   ❌ Pre-deployment health checks failed - no report generated');
        this.recordTest('Pre-deployment Health Checks', false);
      }
      
    } catch (error) {
      this.recordTest('Pre-deployment Health Checks', false, error.message);
      console.log(`   ⚠️  Pre-deployment test failed: ${error.message}`);
    }

    try {
      // Test configuration validation integration
      console.log('   🔍 Testing configuration validation integration...');
      const testConfigPath = '/tmp/test-deployment-config';
      await this.createTestDeploymentConfig(testConfigPath);
      
      const validationResult = await this.deploymentOrchestrator.validateConfigurationHealth(testConfigPath);
      
      if (validationResult && typeof validationResult.valid === 'boolean') {
        console.log(`   ✅ Configuration validation completed: ${validationResult.valid ? 'Valid' : 'Invalid'}`);
        this.recordTest('Configuration Validation Integration', true);
      } else {
        console.log('   ❌ Configuration validation failed - invalid response');
        this.recordTest('Configuration Validation Integration', false);
      }
      
      // Cleanup
      await this.cleanupTestConfig(testConfigPath);
      
    } catch (error) {
      this.recordTest('Configuration Validation Integration', false, error.message);
      console.log(`   ⚠️  Configuration validation test failed: ${error.message}`);
    }
    
    console.log();
  }

  async testErrorScenarios() {
    console.log('⚠️  Testing Error Scenarios...');
    
    try {
      // Test with invalid configuration
      console.log('   🔍 Testing invalid configuration handling...');
      const invalidConfigPath = '/tmp/invalid-config-test';
      await this.createInvalidTestConfig(invalidConfigPath);
      
      try {
        await this.deploymentOrchestrator.validateConfigurationHealth(invalidConfigPath);
        console.log('   ❌ Invalid configuration was accepted (should have failed)');
        this.recordTest('Invalid Configuration Handling', false);
      } catch (error) {
        console.log('   ✅ Invalid configuration properly rejected');
        this.recordTest('Invalid Configuration Handling', true);
      }
      
      await this.cleanupTestConfig(invalidConfigPath);
      
    } catch (error) {
      this.recordTest('Invalid Configuration Handling', false, error.message);
      console.log(`   ⚠️  Error scenario test failed: ${error.message}`);
    }
    
    console.log();
  }

  async createTestDeploymentConfig(configPath) {
    const fs = require('fs').promises;
    
    await fs.mkdir(configPath, { recursive: true });
    
    const validConfig = `
homeassistant:
  name: Test Deployment
  latitude: 32.87336
  longitude: 117.22743
  time_zone: America/Los_Angeles

frontend:
  themes: !include_dir_merge_named themes

logger:
  default: info
`;
    
    await fs.writeFile(`${configPath}/configuration.yaml`, validConfig);
  }

  async createInvalidTestConfig(configPath) {
    const fs = require('fs').promises;
    
    await fs.mkdir(configPath, { recursive: true });
    
    const invalidConfig = `
homeassistant:
  name: Invalid Test
  # This will create a YAML syntax error
  invalid_yaml:
    - unbalanced brackets [
      item1
      item2
  malformed: {incomplete dict
`;
    
    await fs.writeFile(`${configPath}/configuration.yaml`, invalidConfig);
  }

  async cleanupTestConfig(configPath) {
    const fs = require('fs').promises;
    
    try {
      await fs.rm(configPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Cleanup warning: ${error.message}`);
    }
  }

  recordTest(testName, passed, error = null) {
    this.testResults.push({
      name: testName,
      passed: passed,
      error: error,
      timestamp: new Date().toISOString()
    });
  }

  printCompleteSummary() {
    console.log('📋 Complete System Test Summary');
    console.log('='.repeat(50));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(test => test.passed).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log();
    
    // Group by category
    const categories = {
      'Component Tests': this.testResults.filter(t => t.name.includes('Initialization') || t.name.includes('Health Check:')),
      'Integration Tests': this.testResults.filter(t => t.name.includes('Integration') || t.name.includes('deployment')),
      'Error Handling': this.testResults.filter(t => t.name.includes('Invalid') || t.name.includes('Error'))
    };
    
    for (const [category, tests] of Object.entries(categories)) {
      if (tests.length > 0) {
        console.log(`${category}:`);
        tests.forEach(test => {
          const icon = test.passed ? '✅' : '❌';
          console.log(`  ${icon} ${test.name}`);
          if (!test.passed && test.error) {
            console.log(`      Error: ${test.error}`);
          }
        });
        console.log();
      }
    }
    
    if (failedTests === 0) {
      console.log('🎉 All health check system tests passed!');
      console.log('✨ Health check and deployment integration is ready for production use.');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.');
      console.log('🔧 Consider fixing failing components before production deployment.');
    }
    
    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Run complete system test if called directly
if (require.main === module) {
  const tester = new CompleteSystemTester();
  tester.runCompleteSystemTest().catch(error => {
    console.error('Fatal system test error:', error);
    process.exit(1);
  });
}

module.exports = { CompleteSystemTester };
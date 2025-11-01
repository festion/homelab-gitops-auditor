#!/usr/bin/env node
/**
 * Health check validation testing module
 * Tests configuration validation and health check methods
 */

const { HealthChecker } = require('./health-checker');
const fs = require('fs').promises;
const path = require('path');

async function runValidationTests() {
  console.log('🔍 Health Check Validation Tests\n');

  const healthChecker = new HealthChecker();
  await healthChecker.initialize();

  const testResults = [];

  // Test 1: YAML Syntax Validation
  console.log('1. Testing YAML Syntax Validation...');
  try {
    const testFiles = [
      { name: 'valid.yaml', path: '/tmp/valid.yaml', content: 'key: value\nlist:\n  - item1\n  - item2' },
      { name: 'invalid.yaml', path: '/tmp/invalid.yaml', content: 'key: value\n  invalid_indent:\n- item' }
    ];

    // Create test files
    for (const file of testFiles) {
      await fs.writeFile(file.path, file.content);
    }

    const result = await healthChecker.validateYAMLSyntax(testFiles);
    testResults.push({ name: 'YAML Validation', passed: result.errors.length === 1 }); // Should find 1 error

    console.log(`   Valid files: ${testFiles.length - result.errors.length}`);
    console.log(`   Invalid files: ${result.errors.length}`);
    console.log('   ✅ YAML validation working correctly\n');

    // Cleanup
    for (const file of testFiles) {
      try { await fs.unlink(file.path); } catch {}
    }

  } catch (error) {
    testResults.push({ name: 'YAML Validation', passed: false });
    console.log(`   ❌ Test failed: ${error.message}\n`);
  }

  // Test 2: System Resource Checks
  console.log('2. Testing System Resource Checks...');
  try {
    const result = await healthChecker.checkSystemResources();
    testResults.push({ name: 'System Resources', passed: result.name === 'system-resources' });

    console.log(`   Status: ${result.status}`);
    console.log(`   Disk Usage: ${result.details?.diskUsage || 'N/A'}%`);
    console.log(`   Memory Usage: ${result.details?.memoryUsage || 'N/A'}%`);
    console.log('   ✅ System resource monitoring working\n');

  } catch (error) {
    testResults.push({ name: 'System Resources', passed: false });
    console.log(`   ❌ Test failed: ${error.message}\n`);
  }

  // Test 3: Network Connectivity
  console.log('3. Testing Network Connectivity...');
  try {
    const result = await healthChecker.checkNetworkConnectivity();
    testResults.push({ name: 'Network Connectivity', passed: result.name === 'network-connectivity' });

    console.log(`   Status: ${result.status}`);
    console.log(`   Endpoints tested: ${result.details?.totalEndpoints || 0}`);
    console.log(`   Failed connections: ${result.details?.failedEndpoints || 0}`);
    console.log('   ✅ Network connectivity check working\n');

  } catch (error) {
    testResults.push({ name: 'Network Connectivity', passed: false });
    console.log(`   ❌ Test failed: ${error.message}\n`);
  }

  // Print summary
  console.log('📊 Test Summary');
  console.log('='.repeat(30));
  const passed = testResults.filter(t => t.passed).length;
  const total = testResults.length;
  
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%`);
  
  testResults.forEach(test => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${test.name}`);
  });

  return passed === total;
}

// Export for use in other modules
module.exports = { runValidationTests };

// Run if called directly
if (require.main === module) {
  runValidationTests()
    .then(success => {
      console.log('\n🎉 Validation tests complete!');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
#!/usr/bin/env node

/**
 * Simple test runner for webhook functionality
 * Runs basic integration tests without complex dependencies
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Running Webhook Integration Tests...\n');

// Run webhook handler tests
const testProcess = spawn('node', [
  path.join(__dirname, 'webhook-handler.test.js')
], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Webhook handler tests completed successfully');
    
    // Run integration tests
    const integrationProcess = spawn('node', [
      path.join(__dirname, 'webhook-integration.test.js')
    ], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    integrationProcess.on('close', (integrationCode) => {
      if (integrationCode === 0) {
        console.log('\n🎉 All webhook tests passed successfully!');
        console.log('\n📊 Test Summary:');
        console.log('   ✓ Webhook Handler Tests');
        console.log('   ✓ Event Queue Tests');
        console.log('   ✓ Integration Tests');
        console.log('   ✓ Error Handling Tests');
        process.exit(0);
      } else {
        console.log('\n❌ Integration tests failed');
        process.exit(integrationCode);
      }
    });
  } else {
    console.log('\n❌ Webhook handler tests failed');
    process.exit(code);
  }
});

testProcess.on('error', (err) => {
  console.error('❌ Failed to run webhook tests:', err.message);
  process.exit(1);
});
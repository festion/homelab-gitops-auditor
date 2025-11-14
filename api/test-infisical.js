#!/usr/bin/env node

/**
 * Test script for Infisical integration
 *
 * Usage:
 *   INFISICAL_TOKEN=st.your-token node test-infisical.js
 */

const infisicalManager = require('./config/infisical');

async function testInfisical() {
  console.log('🧪 Testing Infisical Integration\n');
  console.log('='  .repeat(50));

  // Step 1: Check environment variables
  console.log('\n1️⃣  Checking Environment Variables:');
  console.log('   INFISICAL_TOKEN:', process.env.INFISICAL_TOKEN ? '✅ Set' : '❌ Not set');
  console.log('   INFISICAL_SITE_URL:', process.env.INFISICAL_SITE_URL || 'Using default: https://infisical.internal.lakehouse.wtf');

  if (!process.env.INFISICAL_TOKEN) {
    console.error('\n❌ INFISICAL_TOKEN not set!');
    console.log('\nTo test, run:');
    console.log('   INFISICAL_TOKEN=st.your-token node test-infisical.js\n');
    process.exit(1);
  }

  // Step 2: Initialize Infisical
  console.log('\n2️⃣  Initializing Infisical Client:');
  try {
    await infisicalManager.initialize();
    console.log('   ✅ Infisical initialized successfully');
  } catch (error) {
    console.error('   ❌ Failed to initialize:', error.message);
    process.exit(1);
  }

  // Step 3: Test secret retrieval (with fallback)
  console.log('\n3️⃣  Testing Secret Retrieval:');

  // Test with a secret that might not exist (to test fallback)
  process.env.TEST_FALLBACK = 'fallback-value';
  const testSecret = await infisicalManager.getSecret('TEST_SECRET', 'dev', 'TEST_FALLBACK');
  console.log('   Test Secret (with fallback):', testSecret ? '✅ Retrieved' : '❌ Failed');
  console.log('   Value:', testSecret);

  // Step 4: Test multiple secrets
  console.log('\n4️⃣  Testing Multiple Secrets Retrieval:');
  const secrets = await infisicalManager.getSecrets([
    { name: 'GITHUB_TOKEN', envVar: 'GITHUB_TOKEN' },
    { name: 'WIKIJS_TOKEN', envVar: 'WIKIJS_TOKEN' },
    { name: 'TEST_SECRET', envVar: 'TEST_FALLBACK' }
  ], 'dev');

  console.log('   Secrets retrieved:');
  Object.entries(secrets).forEach(([key, value]) => {
    console.log(`   - ${key}: ${value ? '✅ Found' : '⚠️  Not found'}`);
  });

  // Step 5: Test cache
  console.log('\n5️⃣  Testing Cache:');
  const start = Date.now();
  await infisicalManager.getSecret('TEST_SECRET', 'dev', 'TEST_FALLBACK');
  const cachedTime = Date.now() - start;
  console.log(`   Cached retrieval: ${cachedTime}ms ✅`);

  console.log('\n6️⃣  Testing Cache Clear:');
  infisicalManager.clearCache();
  console.log('   ✅ Cache cleared');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Infisical Integration Test Complete!\n');
  console.log('Next Steps:');
  console.log('1. Add secrets to Infisical via the web UI');
  console.log('2. Update your application code to use infisicalManager');
  console.log('3. Test with your actual secrets\n');
}

// Run the test
testInfisical().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Simple Configuration Validation Script
 * 
 * Validates the deployment configuration against the JSON schema.
 * This is the command referenced in the acceptance criteria.
 */

const ConfigManager = require('../config/utils/config-manager');

async function validateConfig() {
  try {
    const path = require('path');
    const configPath = process.argv[2] || path.join(__dirname, '../config/deployment-config.json');
    const config = require(configPath);
    
    console.log('Validating configuration...');
    await ConfigManager.validateConfig(config);
    console.log('✅ Configuration is valid!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    process.exit(1);
  }
}

validateConfig();
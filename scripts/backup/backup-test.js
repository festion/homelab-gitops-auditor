#!/usr/bin/env node
// scripts/backup/backup-test.js
// Comprehensive test script for the backup and recovery system

const path = require('path');
const fs = require('fs').promises;
const { BackupSystem, utils } = require('./index');

class BackupTester {
  constructor() {
    this.testDir = '/tmp/backup-test';
    this.configDir = path.join(this.testDir, 'config');
    this.backupDir = path.join(this.testDir, 'backups');
    
    this.backupSystem = new BackupSystem({
      backupDir: this.backupDir,
      enableScheduler: false,
      enableValidation: true
    });
    
    this.results = { passed: 0, failed: 0, tests: [] };
  }

  async runTests() {
    console.log('🧪 Backup System Test Suite');
    console.log('============================\n');
    
    try {
      await this.setup();
      await this.testBasicOperations();
      await this.testValidation();
      await this.testRecovery();
      await this.showResults();
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    await fs.mkdir(this.testDir, { recursive: true });
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
    
    // Create sample config files
    const configs = {
      'configuration.yaml': 'homeassistant:\n  name: Test Home\n',
      'automations.yaml': '[]',
      'scripts.yaml': '{}'
    };
    
    for (const [file, content] of Object.entries(configs)) {
      await fs.writeFile(path.join(this.configDir, file), content);
    }
    
    await this.backupSystem.initialize();
    console.log('✅ Environment ready\n');
  }

  async testBasicOperations() {
    console.log('📦 Testing Basic Operations');
    console.log('----------------------------');
    
    await this.test('Create Backup', async () => {
      const result = await this.backupSystem.createPreDeploymentBackup('test-001');
      if (!result.backupId) throw new Error('No backup ID returned');
      console.log(`   Created: ${result.backupId}`);
      return result;
    });
    
    await this.test('List Backups', async () => {
      const backups = await this.backupSystem.listBackups();
      if (backups.length === 0) throw new Error('No backups found');
      console.log(`   Found: ${backups.length} backups`);
      return backups;
    });
    
    console.log();
  }

  async testValidation() {
    console.log('🔍 Testing Validation');
    console.log('----------------------');
    
    const backups = await this.backupSystem.listBackups({ limit: 1 });
    if (backups.length === 0) throw new Error('No backups for validation');
    
    await this.test('Validate Backup', async () => {
      const validation = await this.backupSystem.validateBackup(backups[0].path);
      if (!validation.valid) throw new Error('Validation failed');
      console.log(`   Checks: ${Object.keys(validation.checks).length}`);
      return validation;
    });
    
    console.log();
  }

  async testRecovery() {
    console.log('🔄 Testing Recovery');
    console.log('--------------------');
    
    await this.test('System Status', async () => {
      const status = await this.backupSystem.getSystemStatus();
      if (!status.initialized) throw new Error('System not initialized');
      console.log(`   Status: ${status.healthStatus.status}`);
      return status;
    });
    
    console.log();
  }

  async test(name, fn) {
    try {
      console.log(`🧪 ${name}...`);
      const start = Date.now();
      await fn();
      const duration = Date.now() - start;
      console.log(`   ✅ PASSED (${duration}ms)`);
      this.results.passed++;
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      this.results.failed++;
    }
  }

  async showResults() {
    console.log('\n📋 Results');
    console.log('===========');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    
    const rate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`🎯 Success: ${rate}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed!');
    }
  }

  async cleanup() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      await promisify(exec)(`rm -rf "${this.testDir}"`);
      console.log('\n🧹 Cleanup completed');
    } catch (error) {
      console.warn(`⚠️  Cleanup warning: ${error.message}`);
    }
  }
}

if (require.main === module) {
  new BackupTester().runTests();
}

module.exports = { BackupTester };
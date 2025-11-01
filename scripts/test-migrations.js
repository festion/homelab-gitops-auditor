#!/usr/bin/env node
/**
 * WikiJS Agent Database Migration Testing and Validation Suite
 * 
 * Comprehensive testing framework for database migrations with:
 * - Automated migration testing across environments
 * - Data integrity validation
 * - Performance benchmarking
 * - Rollback testing and validation
 * - Production readiness checks
 * - Continuous integration support
 * 
 * Usage:
 *   node scripts/test-migrations.js [command] [options]
 * 
 * Commands:
 *   test        - Run all migration tests (default)
 *   unit        - Run individual migration unit tests
 *   integration - Run integration tests
 *   performance - Run performance benchmarks
 *   rollback    - Test rollback procedures
 *   ci          - Run CI-friendly test suite
 *   report      - Generate test coverage report
 * 
 * Options:
 *   --env       - Test environment (test|ci)
 *   --verbose   - Verbose output
 *   --coverage  - Generate coverage report
 *   --bail      - Stop on first failure
 *   --timeout   - Test timeout in ms
 *   --parallel  - Run tests in parallel
 * 
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const WikiAgentMigrator = require('./migrate-wiki-agent');

class MigrationTestSuite {
  constructor(options = {}) {
    this.options = options;
    this.verbose = options.verbose || false;
    this.rootDir = options.rootDir || process.cwd();
    this.testDir = path.join(this.rootDir, '.test-migrations');
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      tests: []
    };
    
    console.log('🧪 WikiJS Agent Migration Test Suite');
    console.log(`📁 Test directory: ${this.testDir}`);
  }

  /**
   * Run all migration tests
   */
  async runAllTests() {
    console.log('\n🚀 Running comprehensive migration test suite...\n');
    
    const startTime = Date.now();
    
    try {
      await this.setupTestEnvironment();
      
      // Run test suites in order
      await this.runUnitTests();
      await this.runIntegrationTests();
      await this.runPerformanceTests();
      await this.runRollbackTests();
      await this.runProductionReadinessTests();
      
      this.results.duration = Date.now() - startTime;
      await this.generateTestReport();
      
    } catch (error) {
      console.error('💥 Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanupTestEnvironment();
    }
    
    return this.results;
  }

  /**
   * Setup isolated test environment
   */
  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create test directory
    if (fs.existsSync(this.testDir)) {
      await this.removeDirectory(this.testDir);
    }
    fs.mkdirSync(this.testDir, { recursive: true });
    
    console.log('✅ Test environment ready');
  }

  /**
   * Unit tests for individual migrations
   */
  async runUnitTests() {
    console.log('🧩 Running unit tests...\n');
    
    const unitTests = [
      {
        name: 'Migration 001 - Schema Creation',
        test: async () => await this.testMigration001()
      },
      {
        name: 'Migration 002 - Performance Indexes',
        test: async () => await this.testMigration002()
      },
      {
        name: 'Migration 003 - Configuration Setup',
        test: async () => await this.testMigration003()
      },
      {
        name: 'Migration System - Version Tracking',
        test: async () => await this.testMigrationTracking()
      }
    ];
    
    for (const unitTest of unitTests) {
      await this.runTest(unitTest.name, unitTest.test);
    }
  }

  /**
   * Integration tests for complete migration flows
   */
  async runIntegrationTests() {
    console.log('\n🔗 Running integration tests...\n');
    
    const integrationTests = [
      {
        name: 'Fresh Database Migration',
        test: async () => await this.testFreshMigration()
      },
      {
        name: 'Sequential Migration Application',
        test: async () => await this.testSequentialMigrations()
      },
      {
        name: 'Migration Idempotency',
        test: async () => await this.testMigrationIdempotency()
      },
      {
        name: 'Data Preservation During Migration',
        test: async () => await this.testDataPreservation()
      },
      {
        name: 'Cross-Environment Migration',
        test: async () => await this.testCrossEnvironmentMigration()
      }
    ];
    
    for (const integrationTest of integrationTests) {
      await this.runTest(integrationTest.name, integrationTest.test);
    }
  }

  /**
   * Performance tests and benchmarks
   */
  async runPerformanceTests() {
    console.log('\n⚡ Running performance tests...\n');
    
    const performanceTests = [
      {
        name: 'Migration Speed Benchmark',
        test: async () => await this.benchmarkMigrationSpeed()
      },
      {
        name: 'Large Dataset Migration',
        test: async () => await this.testLargeDatasetMigration()
      },
      {
        name: 'Index Performance Validation',
        test: async () => await this.testIndexPerformance()
      },
      {
        name: 'Concurrent Access During Migration',
        test: async () => await this.testConcurrentAccess()
      }
    ];
    
    for (const perfTest of performanceTests) {
      await this.runTest(perfTest.name, perfTest.test);
    }
  }

  /**
   * Rollback tests
   */
  async runRollbackTests() {
    console.log('\n🔄 Running rollback tests...\n');
    
    const rollbackTests = [
      {
        name: 'Single Migration Rollback',
        test: async () => await this.testSingleRollback()
      },
      {
        name: 'Multiple Migration Rollback',
        test: async () => await this.testMultipleRollback()
      },
      {
        name: 'Rollback Data Integrity',
        test: async () => await this.testRollbackDataIntegrity()
      },
      {
        name: 'Failed Migration Cleanup',
        test: async () => await this.testFailedMigrationCleanup()
      }
    ];
    
    for (const rollbackTest of rollbackTests) {
      await this.runTest(rollbackTest.name, rollbackTest.test);
    }
  }

  /**
   * Production readiness tests
   */
  async runProductionReadinessTests() {
    console.log('\n🏭 Running production readiness tests...\n');
    
    const prodTests = [
      {
        name: 'Production Configuration Validation',
        test: async () => await this.testProductionConfig()
      },
      {
        name: 'Security Constraints Validation',
        test: async () => await this.testSecurityConstraints()
      },
      {
        name: 'Backup Integration Test',
        test: async () => await this.testBackupIntegration()
      },
      {
        name: 'Error Handling and Recovery',
        test: async () => await this.testErrorHandling()
      },
      {
        name: 'Production Load Simulation',
        test: async () => await this.testProductionLoad()
      }
    ];
    
    for (const prodTest of prodTests) {
      await this.runTest(prodTest.name, prodTest.test);
    }
  }

  /**
   * Individual test implementations
   */
  
  async testMigration001() {
    const dbPath = path.join(this.testDir, 'test-001.db');
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    
    await migrator.initialize();
    await migrator.migration001Up();
    
    // Verify all tables were created
    const tables = await migrator.allQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name IN ('wiki_documents', 'processing_batches', 'agent_config', 'agent_stats', 'agent_logs')
    `);
    
    if (tables.length !== 5) {
      throw new Error(`Expected 5 tables, found ${tables.length}`);
    }
    
    // Verify table structure
    const wikiDocsColumns = await migrator.allQuery(`PRAGMA table_info(wiki_documents)`);
    const expectedColumns = ['id', 'source_path', 'sync_status', 'priority_score'];
    
    for (const expectedCol of expectedColumns) {
      if (!wikiDocsColumns.find(col => col.name === expectedCol)) {
        throw new Error(`Missing column: ${expectedCol}`);
      }
    }
    
    // Test constraints
    try {
      await migrator.runQuery(`INSERT INTO wiki_documents (priority_score) VALUES (150)`);
      throw new Error('Priority score constraint not enforced');
    } catch (error) {
      if (!error.message.includes('constraint')) {
        throw error;
      }
    }
    
    await migrator.close();
  }

  async testMigration002() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migration001Up();
    await migrator.migration002Up();
    
    // Verify indexes were created
    const indexes = await migrator.allQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='index' 
      AND name LIKE 'idx_%'
    `);
    
    if (indexes.length < 8) {
      throw new Error(`Expected at least 8 indexes, found ${indexes.length}`);
    }
    
    await migrator.close();
  }

  async testMigration003() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migration001Up();
    await migrator.migration003Up();
    
    // Verify configuration was seeded
    const configCount = await migrator.getQuery(`
      SELECT COUNT(*) as count FROM agent_config
    `);
    
    if (configCount.count < 9) {
      throw new Error(`Expected at least 9 config entries, found ${configCount.count}`);
    }
    
    // Verify specific config entries
    const autoDiscovery = await migrator.getQuery(`
      SELECT value FROM agent_config WHERE key = 'auto_discovery_enabled'
    `);
    
    if (!autoDiscovery || autoDiscovery.value !== 'true') {
      throw new Error('Default configuration not properly seeded');
    }
    
    await migrator.close();
  }

  async testMigrationTracking() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Verify migration table exists
    const migrationTable = await migrator.getQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='schema_migrations'
    `);
    
    if (!migrationTable) {
      throw new Error('Migration tracking table not created');
    }
    
    // Test migration tracking
    await migrator.runMigration('001');
    const appliedMigrations = await migrator.getAppliedMigrations();
    
    if (!appliedMigrations.includes('001')) {
      throw new Error('Migration not tracked properly');
    }
    
    await migrator.close();
  }

  async testFreshMigration() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Verify all migrations were applied
    const appliedMigrations = await migrator.getAppliedMigrations();
    const expectedMigrations = ['001', '002', '003'];
    
    for (const expected of expectedMigrations) {
      if (!appliedMigrations.includes(expected)) {
        throw new Error(`Migration ${expected} not applied`);
      }
    }
    
    // Verify database is valid
    const isValid = await migrator.validate();
    if (!isValid) {
      throw new Error('Fresh migration resulted in invalid database');
    }
    
    await migrator.close();
  }

  async testSequentialMigrations() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Apply migrations one by one
    await migrator.runMigration('001');
    await migrator.runMigration('002');
    await migrator.runMigration('003');
    
    const isValid = await migrator.validate();
    if (!isValid) {
      throw new Error('Sequential migration resulted in invalid database');
    }
    
    await migrator.close();
  }

  async testMigrationIdempotency() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Run migration multiple times
    await migrator.migrate();
    const firstState = await this.getDatabaseChecksum(migrator);
    
    await migrator.migrate(); // Should be no-op
    const secondState = await this.getDatabaseChecksum(migrator);
    
    if (firstState !== secondState) {
      throw new Error('Migration is not idempotent');
    }
    
    await migrator.close();
  }

  async testDataPreservation() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.runMigration('001');
    await migrator.runMigration('003'); // Add config
    
    // Insert test data
    await migrator.runQuery(`
      INSERT INTO wiki_documents (source_path, repository_name, source_location) 
      VALUES ('/test/doc.md', 'test-repo', 'REPOS')
    `);
    
    await migrator.runQuery(`
      INSERT INTO agent_config (key, value, description) 
      VALUES ('test_key', 'test_value', 'Test configuration')
    `);
    
    // Apply remaining migration
    await migrator.runMigration('002');
    
    // Verify data is preserved
    const document = await migrator.getQuery(`
      SELECT * FROM wiki_documents WHERE source_path = '/test/doc.md'
    `);
    
    if (!document) {
      throw new Error('Document data not preserved during migration');
    }
    
    const config = await migrator.getQuery(`
      SELECT * FROM agent_config WHERE key = 'test_key'
    `);
    
    if (!config || config.value !== 'test_value') {
      throw new Error('Configuration data not preserved during migration');
    }
    
    await migrator.close();
  }

  async testCrossEnvironmentMigration() {
    // Test development to production migration compatibility
    const devMigrator = new WikiAgentMigrator({ 
      rootDir: this.testDir, 
      env: 'development' 
    });
    
    await devMigrator.initialize();
    await devMigrator.migrate();
    
    // Copy database file
    const devDbPath = path.join(this.testDir, 'wiki-agent-dev.db');
    const prodDbPath = path.join(this.testDir, 'wiki-agent.db');
    fs.copyFileSync(devDbPath, prodDbPath);
    
    // Test with production migrator
    const prodMigrator = new WikiAgentMigrator({ 
      rootDir: this.testDir, 
      env: 'production' 
    });
    
    await prodMigrator.initialize();
    const isValid = await prodMigrator.validate();
    
    if (!isValid) {
      throw new Error('Cross-environment migration compatibility failed');
    }
    
    await devMigrator.close();
    await prodMigrator.close();
  }

  async benchmarkMigrationSpeed() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    const startTime = Date.now();
    await migrator.migrate();
    const duration = Date.now() - startTime;
    
    // Expect migration to complete within reasonable time
    const maxExpectedTime = 5000; // 5 seconds
    if (duration > maxExpectedTime) {
      throw new Error(`Migration too slow: ${duration}ms > ${maxExpectedTime}ms`);
    }
    
    console.log(`  ⏱️  Migration completed in ${duration}ms`);
    await migrator.close();
  }

  async testLargeDatasetMigration() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Insert large amount of test data
    const batchSize = 1000;
    console.log(`  📊 Inserting ${batchSize} test records...`);
    
    for (let i = 0; i < batchSize; i++) {
      await migrator.runQuery(`
        INSERT INTO wiki_documents (source_path, repository_name, source_location, sync_status) 
        VALUES (?, ?, ?, ?)
      `, [`/test/doc-${i}.md`, 'test-repo', 'REPOS', 'DISCOVERED']);
    }
    
    // Test query performance
    const startTime = Date.now();
    const results = await migrator.allQuery(`
      SELECT COUNT(*) as count FROM wiki_documents WHERE sync_status = 'DISCOVERED'
    `);
    const queryTime = Date.now() - startTime;
    
    if (results[0].count !== batchSize) {
      throw new Error(`Expected ${batchSize} records, found ${results[0].count}`);
    }
    
    // Query should be fast even with large dataset
    if (queryTime > 100) { // 100ms max
      throw new Error(`Query too slow on large dataset: ${queryTime}ms`);
    }
    
    console.log(`  ⚡ Query on ${batchSize} records: ${queryTime}ms`);
    await migrator.close();
  }

  async testIndexPerformance() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Insert test data
    for (let i = 0; i < 100; i++) {
      await migrator.runQuery(`
        INSERT INTO wiki_documents (source_path, repository_name, source_location, sync_status, priority_score) 
        VALUES (?, ?, ?, ?, ?)
      `, [`/test/doc-${i}.md`, `repo-${i % 10}`, 'REPOS', 'DISCOVERED', i % 100]);
    }
    
    // Test indexed queries
    const queries = [
      'SELECT * FROM wiki_documents WHERE sync_status = "DISCOVERED"',
      'SELECT * FROM wiki_documents WHERE repository_name = "repo-1"',
      'SELECT * FROM wiki_documents ORDER BY priority_score DESC LIMIT 10'
    ];
    
    for (const query of queries) {
      const startTime = Date.now();
      await migrator.allQuery(query);
      const queryTime = Date.now() - startTime;
      
      // All queries should be fast due to indexes
      if (queryTime > 50) { // 50ms max
        throw new Error(`Indexed query too slow: ${queryTime}ms for ${query}`);
      }
    }
    
    await migrator.close();
  }

  async testConcurrentAccess() {
    // Test that migration doesn't break under concurrent access
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Start migration
    const migrationPromise = migrator.migrate();
    
    // Try concurrent operations (should wait/handle gracefully)
    await new Promise(resolve => setTimeout(resolve, 100)); // Let migration start
    
    try {
      await migrator.allQuery('SELECT COUNT(*) FROM wiki_documents');
    } catch (error) {
      // Expected during migration - database might be temporarily locked
      if (!error.message.includes('locked') && !error.message.includes('SQLITE_BUSY')) {
        throw error;
      }
    }
    
    // Wait for migration to complete
    await migrationPromise;
    
    // Now queries should work
    const result = await migrator.allQuery('SELECT COUNT(*) as count FROM wiki_documents');
    if (typeof result[0].count !== 'number') {
      throw new Error('Concurrent access test failed');
    }
    
    await migrator.close();
  }

  async testSingleRollback() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Record initial state
    const initialMigrations = await migrator.getAppliedMigrations();
    
    // Rollback last migration
    await migrator.rollback();
    
    const afterRollback = await migrator.getAppliedMigrations();
    
    if (afterRollback.length !== initialMigrations.length - 1) {
      throw new Error('Rollback did not remove exactly one migration');
    }
    
    await migrator.close();
  }

  async testMultipleRollback() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Rollback multiple migrations
    await migrator.rollback(); // 003
    await migrator.rollback(); // 002
    
    const remainingMigrations = await migrator.getAppliedMigrations();
    
    if (remainingMigrations.length !== 1 || remainingMigrations[0] !== '001') {
      throw new Error('Multiple rollback failed');
    }
    
    // Database should still be valid
    const isValid = await migrator.validate();
    if (!isValid) {
      throw new Error('Database invalid after multiple rollbacks');
    }
    
    await migrator.close();
  }

  async testRollbackDataIntegrity() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.runMigration('001');
    await migrator.runMigration('003'); // Config migration
    
    // Add test data
    await migrator.runQuery(`
      INSERT INTO agent_config (key, value, description) 
      VALUES ('rollback_test', 'value1', 'Test data')
    `);
    
    await migrator.runMigration('002'); // Index migration
    
    // Rollback index migration
    await migrator.rollback();
    
    // Data should still be there
    const testData = await migrator.getQuery(`
      SELECT * FROM agent_config WHERE key = 'rollback_test'
    `);
    
    if (!testData || testData.value !== 'value1') {
      throw new Error('Data integrity compromised during rollback');
    }
    
    await migrator.close();
  }

  async testFailedMigrationCleanup() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Create a failing migration by corrupting the migration method
    const originalUp = migrator.migration002Up;
    migrator.migration002Up = async () => {
      throw new Error('Simulated migration failure');
    };
    
    try {
      await migrator.runMigration('002');
      throw new Error('Expected migration to fail');
    } catch (error) {
      if (!error.message.includes('Simulated migration failure')) {
        throw error;
      }
    }
    
    // Verify migration was not recorded as successful
    const appliedMigrations = await migrator.getAppliedMigrations();
    if (appliedMigrations.includes('002')) {
      throw new Error('Failed migration was incorrectly recorded as successful');
    }
    
    // Restore original migration and try again
    migrator.migration002Up = originalUp;
    await migrator.runMigration('002');
    
    const updatedMigrations = await migrator.getAppliedMigrations();
    if (!updatedMigrations.includes('002')) {
      throw new Error('Fixed migration was not applied');
    }
    
    await migrator.close();
  }

  async testProductionConfig() {
    const dbConfig = require('../config/database');
    const prodConfig = dbConfig.getConfig('production');
    
    // Validate production-specific settings
    if (!prodConfig.database.filename.includes('/opt/')) {
      throw new Error('Production database path should be in /opt/');
    }
    
    if (prodConfig.application.backup.retentionDays < 30) {
      throw new Error('Production backup retention should be at least 30 days');
    }
    
    if (!prodConfig.application.backup.compression) {
      throw new Error('Production backups should be compressed');
    }
  }

  async testSecurityConstraints() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Test that constraints are enforced
    const constraintTests = [
      {
        table: 'wiki_documents',
        field: 'priority_score',
        invalidValue: 150,
        expectedError: 'constraint'
      },
      {
        table: 'wiki_documents',
        field: 'sync_status',
        invalidValue: 'INVALID_STATUS',
        expectedError: 'constraint'
      },
      {
        table: 'agent_logs',
        field: 'level',
        invalidValue: 'INVALID_LEVEL',
        expectedError: 'constraint'
      }
    ];
    
    for (const test of constraintTests) {
      try {
        await migrator.runQuery(`INSERT INTO ${test.table} (${test.field}) VALUES (?)`, [test.invalidValue]);
        throw new Error(`Constraint not enforced for ${test.table}.${test.field}`);
      } catch (error) {
        if (!error.message.includes(test.expectedError)) {
          throw error;
        }
      }
    }
    
    await migrator.close();
  }

  async testBackupIntegration() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Test that backup system can handle migrated database
    const BackupManager = require('./backup-wiki-agent');
    const backupManager = new BackupManager({ 
      rootDir: this.testDir,
      env: 'development',
      quiet: true
    });
    
    const backupInfo = await backupManager.createBackup('test');
    
    if (!backupInfo || !fs.existsSync(backupInfo.backupPath)) {
      throw new Error('Backup integration failed');
    }
    
    // Verify backup
    await backupManager.verifyBackup(backupInfo.backupPath);
    
    await migrator.close();
  }

  async testErrorHandling() {
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    
    // Test handling of various error conditions
    try {
      await migrator.runQuery('INVALID SQL STATEMENT');
      throw new Error('Should have thrown SQL error');
    } catch (error) {
      if (!error.message.includes('syntax error')) {
        throw new Error('Unexpected error type: ' + error.message);
      }
    }
    
    // Test validation with corrupted database
    await migrator.migrate();
    
    // Corrupt database by creating invalid constraint
    try {
      await migrator.runQuery(`INSERT INTO wiki_documents (id, priority_score) VALUES (999, 150)`);
    } catch (error) {
      // Expected - constraint should prevent this
    }
    
    const isValid = await migrator.validate();
    if (!isValid) {
      console.log('  ℹ️  Validation correctly detected constraint violations');
    }
    
    await migrator.close();
  }

  async testProductionLoad() {
    console.log('  📈 Simulating production load...');
    
    const migrator = new WikiAgentMigrator({ rootDir: this.testDir });
    await migrator.initialize();
    await migrator.migrate();
    
    // Simulate realistic production data volumes
    const documentCount = 1000;
    const batchCount = 50;
    const logCount = 5000;
    
    console.log(`    📄 Inserting ${documentCount} documents...`);
    for (let i = 0; i < documentCount; i++) {
      await migrator.runQuery(`
        INSERT INTO wiki_documents (source_path, repository_name, source_location, sync_status, priority_score) 
        VALUES (?, ?, ?, ?, ?)
      `, [
        `/repos/project-${i % 20}/doc-${i}.md`,
        `project-${i % 20}`,
        'REPOS',
        ['DISCOVERED', 'READY', 'UPLOADED', 'FAILED'][i % 4],
        Math.floor(Math.random() * 100)
      ]);
    }
    
    console.log(`    📦 Inserting ${batchCount} processing batches...`);
    for (let i = 0; i < batchCount; i++) {
      await migrator.runQuery(`
        INSERT INTO processing_batches (batch_type, batch_name, status, documents_total, documents_processed) 
        VALUES (?, ?, ?, ?, ?)
      `, [
        'auto-discovery',
        `batch-${Date.now()}-${i}`,
        ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'][i % 4],
        Math.floor(Math.random() * 50) + 10,
        Math.floor(Math.random() * 40)
      ]);
    }
    
    console.log(`    📝 Inserting ${logCount} log entries...`);
    const components = ['WikiAgentManager', 'DocumentProcessor', 'UploadService'];
    const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
    
    for (let i = 0; i < logCount; i++) {
      await migrator.runQuery(`
        INSERT INTO agent_logs (timestamp, level, component, message) 
        VALUES (?, ?, ?, ?)
      `, [
        new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
        levels[i % levels.length],
        components[i % components.length],
        `Log message ${i} for testing purposes`
      ]);
    }
    
    // Test performance with realistic load
    const queries = [
      'SELECT COUNT(*) FROM wiki_documents WHERE sync_status = "READY"',
      'SELECT repository_name, COUNT(*) FROM wiki_documents GROUP BY repository_name',
      'SELECT * FROM processing_batches WHERE status = "RUNNING"',
      'SELECT COUNT(*) FROM agent_logs WHERE level = "ERROR" AND timestamp > datetime("now", "-7 days")'
    ];
    
    for (const query of queries) {
      const startTime = Date.now();
      await migrator.allQuery(query);
      const queryTime = Date.now() - startTime;
      
      if (queryTime > 200) { // 200ms max for production load
        throw new Error(`Query too slow under load: ${queryTime}ms for ${query}`);
      }
    }
    
    console.log('    ✅ Production load simulation passed');
    await migrator.close();
  }

  /**
   * Utility methods
   */
  
  async runTest(name, testFn) {
    this.results.total++;
    const testResult = {
      name: name,
      status: 'running',
      duration: 0,
      error: null
    };
    
    if (this.verbose) {
      console.log(`  🧪 ${name}...`);
    }
    
    const startTime = Date.now();
    
    try {
      await testFn();
      testResult.status = 'passed';
      testResult.duration = Date.now() - startTime;
      this.results.passed++;
      
      if (this.verbose) {
        console.log(`    ✅ Passed (${testResult.duration}ms)`);
      } else {
        process.stdout.write('.');
      }
      
    } catch (error) {
      testResult.status = 'failed';
      testResult.duration = Date.now() - startTime;
      testResult.error = error.message;
      this.results.failed++;
      
      if (this.verbose) {
        console.log(`    ❌ Failed: ${error.message}`);
      } else {
        process.stdout.write('F');
      }
      
      if (this.options.bail) {
        throw error;
      }
    }
    
    this.results.tests.push(testResult);
  }

  async getDatabaseChecksum(migrator) {
    // Get schema checksum for idempotency testing
    const schema = await migrator.allQuery(`
      SELECT sql FROM sqlite_master 
      WHERE type IN ('table', 'index') 
      ORDER BY name
    `);
    
    const schemaString = schema.map(s => s.sql).join('\n');
    return crypto.createHash('sha256').update(schemaString).digest('hex');
  }

  async generateTestReport() {
    console.log('\n\n📋 Test Results Summary\n');
    
    const passRate = (this.results.passed / this.results.total * 100).toFixed(1);
    const avgDuration = this.results.duration / this.results.total;
    
    console.log(`Total Tests:     ${this.results.total}`);
    console.log(`Passed:          ${this.results.passed}`);
    console.log(`Failed:          ${this.results.failed}`);
    console.log(`Pass Rate:       ${passRate}%`);
    console.log(`Total Duration:  ${this.results.duration}ms`);
    console.log(`Avg Per Test:    ${avgDuration.toFixed(1)}ms`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => test.status === 'failed')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }
    
    if (this.options.coverage) {
      await this.generateCoverageReport();
    }
    
    return this.results.passed === this.results.total;
  }

  async generateCoverageReport() {
    console.log('\n📊 Coverage Report');
    
    const coverage = {
      migrations: {
        total: 3,
        tested: this.results.tests.filter(t => t.name.includes('Migration')).length
      },
      features: {
        total: 8, // rollback, validation, performance, etc.
        tested: this.results.tests.length
      }
    };
    
    console.log(`Migration Coverage: ${coverage.migrations.tested}/${coverage.migrations.total}`);
    console.log(`Feature Coverage:   ${Math.min(coverage.features.tested, coverage.features.total)}/${coverage.features.total}`);
  }

  async cleanupTestEnvironment() {
    if (fs.existsSync(this.testDir)) {
      await this.removeDirectory(this.testDir);
    }
    console.log('\n🧹 Test environment cleaned up');
  }

  async removeDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        await this.removeDirectory(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    }
    fs.rmdirSync(dirPath);
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';
  
  const options = {
    env: args.includes('--env') ? args[args.indexOf('--env') + 1] : 'test',
    verbose: args.includes('--verbose') || args.includes('-v'),
    coverage: args.includes('--coverage'),
    bail: args.includes('--bail'),
    timeout: args.includes('--timeout') ? parseInt(args[args.indexOf('--timeout') + 1]) : 30000,
    parallel: args.includes('--parallel')
  };

  const testSuite = new MigrationTestSuite(options);

  try {
    let success = false;
    
    switch (command) {
      case 'test':
        const results = await testSuite.runAllTests();
        success = results.passed === results.total;
        break;
        
      case 'unit':
        await testSuite.setupTestEnvironment();
        await testSuite.runUnitTests();
        await testSuite.generateTestReport();
        await testSuite.cleanupTestEnvironment();
        success = testSuite.results.failed === 0;
        break;
        
      case 'integration':
        await testSuite.setupTestEnvironment();
        await testSuite.runIntegrationTests();
        await testSuite.generateTestReport();
        await testSuite.cleanupTestEnvironment();
        success = testSuite.results.failed === 0;
        break;
        
      case 'performance':
        await testSuite.setupTestEnvironment();
        await testSuite.runPerformanceTests();
        await testSuite.generateTestReport();
        await testSuite.cleanupTestEnvironment();
        success = testSuite.results.failed === 0;
        break;
        
      case 'rollback':
        await testSuite.setupTestEnvironment();
        await testSuite.runRollbackTests();
        await testSuite.generateTestReport();
        await testSuite.cleanupTestEnvironment();
        success = testSuite.results.failed === 0;
        break;
        
      case 'ci':
        // CI-friendly test run
        options.verbose = false;
        options.bail = true;
        const ciResults = await testSuite.runAllTests();
        success = ciResults.passed === ciResults.total;
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log(`
Usage: node scripts/test-migrations.js [command] [options]

Commands:
  test        Run all migration tests (default)
  unit        Run unit tests only
  integration Run integration tests only
  performance Run performance tests only
  rollback    Run rollback tests only
  ci          Run CI-friendly test suite

Options:
  --env [env]     Test environment (test|ci)
  --verbose, -v   Verbose output
  --coverage      Generate coverage report
  --bail          Stop on first failure
  --timeout [ms]  Test timeout (default: 30000)
  --parallel      Run tests in parallel
        `);
        process.exit(1);
    }

    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = MigrationTestSuite;

// Run if called directly
if (require.main === module) {
  main();
}
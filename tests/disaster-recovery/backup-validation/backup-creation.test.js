const { BackupManager } = require('../../../scripts/backup/backup-manager');
const { TestEnvironment } = require('../../integration/setup/test-environment');
const { MetricsCollector } = require('../utils/metrics-collector');
const fs = require('fs').promises;
const path = require('path');

describe('Backup Creation Disaster Recovery Tests', () => {
  let backupManager;
  let testEnvironment;
  let metricsCollector;

  beforeAll(async () => {
    testEnvironment = new TestEnvironment();
    await testEnvironment.startFullEnvironment();
    
    backupManager = new BackupManager();
    await backupManager.initialize();
    
    metricsCollector = new MetricsCollector();
  });

  afterAll(async () => {
    await testEnvironment.stopFullEnvironment();
  });

  describe('Backup Creation Under Stress', () => {
    it('should create backups under high system load', async () => {
      console.log('📊 Starting backup creation under stress test...');
      
      // Generate high system load
      const loadSimulation = await testEnvironment.generateSystemLoad({
        cpu: 80,
        memory: 70,
        disk: 60
      });
      
      const backupStartTime = Date.now();
      
      // Create backup while system is under stress
      const backupId = await backupManager.createScheduledBackup();
      
      const backupEndTime = Date.now();
      const backupDuration = backupEndTime - backupStartTime;
      
      // Stop load simulation
      await loadSimulation.stop();
      
      expect(backupId).toBeDefined();
      
      // Verify backup was created successfully
      const backupInfo = await backupManager.getBackupInfo(backupId);
      expect(backupInfo.status).toBe('completed');
      expect(backupInfo.size).toBeGreaterThan(0);
      
      // Verify backup integrity
      const integrityCheck = await backupManager.verifyBackupIntegrity(backupInfo.path);
      expect(integrityCheck).toBe(true);
      
      // Collect metrics
      await metricsCollector.recordBackupMetrics('stress-backup', {
        duration: backupDuration,
        size: backupInfo.size,
        integrity: integrityCheck,
        systemLoad: 80
      });
      
      console.log(`✅ Backup created successfully under stress in ${backupDuration}ms`);
    });

    it('should handle concurrent backup requests', async () => {
      console.log('🔄 Starting concurrent backup test...');
      
      // Attempt to create multiple backups simultaneously
      const backupPromises = [];
      for (let i = 0; i < 3; i++) {
        backupPromises.push(backupManager.createScheduledBackup());
      }
      
      const results = await Promise.allSettled(backupPromises);
      
      // Should only allow one backup to succeed
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      expect(successful).toBe(1);
      expect(failed).toBe(2);
      
      // Verify the successful backup
      const successfulResult = results.find(r => r.status === 'fulfilled');
      const backupId = successfulResult.value;
      
      const backupInfo = await backupManager.getBackupInfo(backupId);
      expect(backupInfo.status).toBe('completed');
      
      console.log('✅ Concurrent backup handling test completed');
    });

    it('should handle backup creation during system failure', async () => {
      console.log('💥 Starting backup creation during failure test...');
      
      // Start backup process
      const backupPromise = backupManager.createScheduledBackup();
      
      // Simulate system failure during backup
      setTimeout(async () => {
        await testEnvironment.simulatePartialSystemFailure();
      }, 5000);
      
      // Backup should either complete or fail gracefully
      try {
        const backupId = await backupPromise;
        
        // If backup completed, verify it's valid
        const backupInfo = await backupManager.getBackupInfo(backupId);
        expect(backupInfo.status).toBe('completed');
        
        console.log('✅ Backup completed despite system failure');
      } catch (error) {
        // If backup failed, it should fail gracefully
        expect(error.message).toContain('backup');
        console.log('✅ Backup failed gracefully during system failure');
      }
      
      // Restore system
      await testEnvironment.restoreSystem();
    });
  });

  describe('Backup Storage Validation', () => {
    it('should validate backup storage availability', async () => {
      console.log('💾 Starting backup storage validation test...');
      
      // Check storage availability before backup
      const storageAvailable = await backupManager.checkStorageAvailability();
      expect(storageAvailable).toBe(true);
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Verify backup is stored correctly
      const backupInfo = await backupManager.getBackupInfo(backupId);
      const backupExists = await fs.access(backupInfo.path).then(() => true).catch(() => false);
      
      expect(backupExists).toBe(true);
      
      // Verify backup file is not empty
      const stats = await fs.stat(backupInfo.path);
      expect(stats.size).toBeGreaterThan(0);
      
      console.log('✅ Backup storage validation test completed');
    });

    it('should handle insufficient storage space', async () => {
      console.log('📦 Starting insufficient storage test...');
      
      // Simulate low storage space
      await testEnvironment.simulateLowStorageSpace();
      
      // Attempt backup creation
      try {
        const backupId = await backupManager.createScheduledBackup();
        
        // Should not reach this point if storage is truly insufficient
        const backupInfo = await backupManager.getBackupInfo(backupId);
        expect(backupInfo.status).toBe('completed');
        
      } catch (error) {
        // Should fail with storage error
        expect(error.message).toContain('storage');
        console.log('✅ Backup correctly failed due to insufficient storage');
      }
      
      // Restore storage space
      await testEnvironment.restoreStorageSpace();
    });
  });

  describe('Backup Integrity Validation', () => {
    it('should validate backup file integrity', async () => {
      console.log('🔍 Starting backup integrity validation test...');
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Get backup info
      const backupInfo = await backupManager.getBackupInfo(backupId);
      
      // Verify backup integrity
      const integrityCheck = await backupManager.verifyBackupIntegrity(backupInfo.path);
      expect(integrityCheck).toBe(true);
      
      // Verify backup contains expected files
      const backupContents = await backupManager.listBackupContents(backupId);
      expect(backupContents).toContain('configuration.yaml');
      expect(backupContents).toContain('database.sql');
      expect(backupContents).toContain('audit-logs');
      
      console.log('✅ Backup integrity validation test completed');
    });

    it('should detect corrupted backup files', async () => {
      console.log('🔍 Starting backup corruption detection test...');
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      const backupInfo = await backupManager.getBackupInfo(backupId);
      
      // Corrupt the backup file
      await fs.writeFile(backupInfo.path, 'corrupted data');
      
      // Verify corruption is detected
      const integrityCheck = await backupManager.verifyBackupIntegrity(backupInfo.path);
      expect(integrityCheck).toBe(false);
      
      console.log('✅ Backup corruption detection test completed');
    });
  });

  describe('Backup Metadata Validation', () => {
    it('should maintain accurate backup metadata', async () => {
      console.log('📋 Starting backup metadata validation test...');
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Verify metadata
      const backupInfo = await backupManager.getBackupInfo(backupId);
      
      expect(backupInfo.id).toBe(backupId);
      expect(backupInfo.timestamp).toBeDefined();
      expect(backupInfo.version).toBeDefined();
      expect(backupInfo.type).toBe('scheduled');
      expect(backupInfo.status).toBe('completed');
      expect(backupInfo.size).toBeGreaterThan(0);
      expect(backupInfo.checksum).toBeDefined();
      
      // Verify metadata file exists
      const metadataPath = path.join(path.dirname(backupInfo.path), `${backupId}.metadata.json`);
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(metadataExists).toBe(true);
      
      console.log('✅ Backup metadata validation test completed');
    });
  });
});
const { BackupManager } = require('../../../scripts/backup/backup-manager');
const { FailureInjector } = require('../utils/failure-injector');
const { RecoveryValidator } = require('../utils/recovery-validator');
const { TestEnvironment } = require('../../integration/setup/test-environment');
const { MetricsCollector } = require('../utils/metrics-collector');

describe('Configuration Corruption Recovery Tests', () => {
  let backupManager;
  let failureInjector;
  let recoveryValidator;
  let testEnvironment;
  let metricsCollector;

  beforeAll(async () => {
    testEnvironment = new TestEnvironment();
    await testEnvironment.startFullEnvironment();
    
    backupManager = new BackupManager();
    await backupManager.initialize();
    
    failureInjector = new FailureInjector();
    recoveryValidator = new RecoveryValidator();
    metricsCollector = new MetricsCollector();
  });

  afterAll(async () => {
    await failureInjector.cleanup();
    await testEnvironment.stopFullEnvironment();
  });

  describe('Configuration File Corruption', () => {
    it('should recover from configuration file corruption', async () => {
      console.log('📄 Starting configuration file corruption recovery test...');
      
      // Create initial configuration state
      await testEnvironment.setupInitialConfiguration();
      const initialState = await testEnvironment.captureSystemState();
      
      // Create backup before corruption
      const backupId = await backupManager.createScheduledBackup();
      
      // Corrupt configuration files
      const corruptionFailureId = await failureInjector.injectServiceFailure('configuration', 'corrupt', {
        corruptionType: 'random'
      });
      
      // Verify configuration is corrupted
      const configCorrupted = await testEnvironment.verifyConfigurationCorruption();
      expect(configCorrupted).toBe(true);
      
      // System should detect corruption
      const corruptionDetected = await testEnvironment.waitForCorruptionDetection();
      expect(corruptionDetected).toBe(true);
      
      // Restore configuration from backup
      console.log('🔄 Restoring configuration from backup...');
      const recoveryStartTime = Date.now();
      
      const recoveryResult = await backupManager.restoreFromBackup(backupId, {
        restoreMode: 'configuration-only',
        skipValidation: false
      });
      
      expect(recoveryResult.success).toBe(true);
      
      const recoveryEndTime = Date.now();
      const recoveryDuration = recoveryEndTime - recoveryStartTime;
      
      // Verify configuration is restored
      const configRestored = await testEnvironment.waitForConfigurationRecovery();
      expect(configRestored).toBe(true);
      
      // Validate configuration integrity
      const postRecoveryState = await testEnvironment.captureSystemState();
      const integrityCheck = await recoveryValidator.validateDataIntegrity(
        initialState,
        postRecoveryState
      );
      
      expect(integrityCheck.configurationIntegrity.integrityScore).toBeGreaterThan(0.95);
      
      // Verify system functionality
      const systemFunctional = await testEnvironment.verifySystemFunctional();
      expect(systemFunctional).toBe(true);
      
      // Collect metrics
      await metricsCollector.recordRecoveryMetrics('configuration-corruption-recovery', {
        recoveryDuration: recoveryDuration,
        integrityScore: integrityCheck.configurationIntegrity.integrityScore,
        corruptionType: 'random'
      });
      
      console.log('✅ Configuration file corruption recovery test completed');
    });

    it('should handle partial configuration corruption', async () => {
      console.log('📄 Starting partial configuration corruption recovery test...');
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Corrupt only specific configuration files
      await testEnvironment.corruptConfigurationFiles([
        'configuration.yaml',
        'automations.yaml'
      ]);
      
      // Verify specific files are corrupted
      const corruptedFiles = await testEnvironment.getCorruptedConfigurationFiles();
      expect(corruptedFiles).toContain('configuration.yaml');
      expect(corruptedFiles).toContain('automations.yaml');
      
      // Restore only corrupted files
      console.log('🔄 Restoring corrupted configuration files...');
      const recoveryResult = await backupManager.restoreFromBackup(backupId, {
        restoreMode: 'selective-configuration',
        files: ['configuration.yaml', 'automations.yaml']
      });
      
      expect(recoveryResult.success).toBe(true);
      
      // Verify files are restored
      const filesRestored = await testEnvironment.verifyConfigurationFilesRestored([
        'configuration.yaml',
        'automations.yaml'
      ]);
      expect(filesRestored).toBe(true);
      
      // Verify other files remain intact
      const otherFilesIntact = await testEnvironment.verifyConfigurationFilesIntact([
        'scripts.yaml',
        'scenes.yaml'
      ]);
      expect(otherFilesIntact).toBe(true);
      
      console.log('✅ Partial configuration corruption recovery test completed');
    });
  });

  describe('Configuration Validation Recovery', () => {
    it('should recover from invalid configuration', async () => {
      console.log('❌ Starting invalid configuration recovery test...');
      
      // Create backup with valid configuration
      const backupId = await backupManager.createScheduledBackup();
      
      // Inject invalid configuration
      await testEnvironment.injectInvalidConfiguration();
      
      // Verify configuration is invalid
      const configInvalid = await testEnvironment.verifyConfigurationInvalid();
      expect(configInvalid).toBe(true);
      
      // System should detect invalid configuration
      const invalidConfigDetected = await testEnvironment.waitForInvalidConfigDetection();
      expect(invalidConfigDetected).toBe(true);
      
      // System should automatically restore valid configuration
      const autoRecovery = await testEnvironment.waitForAutoConfigRecovery();
      expect(autoRecovery).toBe(true);
      
      // Verify configuration is now valid
      const configValid = await testEnvironment.verifyConfigurationValid();
      expect(configValid).toBe(true);
      
      console.log('✅ Invalid configuration recovery test completed');
    });

    it('should handle configuration schema changes', async () => {
      console.log('🔄 Starting configuration schema change recovery test...');
      
      // Create backup with current schema
      const backupId = await backupManager.createScheduledBackup();
      
      // Simulate schema upgrade
      await testEnvironment.simulateSchemaUpgrade();
      
      // Attempt to restore old configuration
      const recoveryResult = await backupManager.restoreFromBackup(backupId, {
        restoreMode: 'configuration-only',
        schemaUpgrade: true
      });
      
      expect(recoveryResult.success).toBe(true);
      
      // Verify configuration is migrated to new schema
      const schemaMigrated = await testEnvironment.verifyConfigurationSchemaMigrated();
      expect(schemaMigrated).toBe(true);
      
      // Verify system works with migrated configuration
      const systemFunctional = await testEnvironment.verifySystemFunctional();
      expect(systemFunctional).toBe(true);
      
      console.log('✅ Configuration schema change recovery test completed');
    });
  });

  describe('Configuration Backup Validation', () => {
    it('should validate configuration backup integrity', async () => {
      console.log('🔍 Starting configuration backup integrity test...');
      
      // Create configuration backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Validate backup contains all configuration files
      const backupInfo = await backupManager.getBackupInfo(backupId);
      const configFiles = await testEnvironment.listConfigurationFiles();
      
      for (const file of configFiles) {
        const fileInBackup = await testEnvironment.verifyFileInBackup(backupInfo.path, file);
        expect(fileInBackup).toBe(true);
      }
      
      // Validate configuration syntax in backup
      const backupSyntaxValid = await testEnvironment.validateBackupConfigurationSyntax(backupInfo.path);
      expect(backupSyntaxValid).toBe(true);
      
      console.log('✅ Configuration backup integrity test completed');
    });

    it('should handle configuration backup corruption', async () => {
      console.log('🔍 Starting configuration backup corruption test...');
      
      // Create multiple configuration backups
      const backupIds = [];
      for (let i = 0; i < 3; i++) {
        const backupId = await backupManager.createScheduledBackup();
        backupIds.push(backupId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Corrupt the most recent backup
      const corruptedBackupId = backupIds[backupIds.length - 1];
      await testEnvironment.corruptBackup(corruptedBackupId);
      
      // Corrupt current configuration
      await failureInjector.injectServiceFailure('configuration', 'corrupt');
      
      // Attempt restore with corrupted backup
      const corruptedRestoreResult = await backupManager.restoreFromBackup(corruptedBackupId);
      expect(corruptedRestoreResult.success).toBe(false);
      
      // Should automatically try previous backup
      const previousBackupId = backupIds[backupIds.length - 2];
      const fallbackRestoreResult = await backupManager.restoreFromBackup(previousBackupId);
      expect(fallbackRestoreResult.success).toBe(true);
      
      // Verify configuration is restored
      const configRestored = await testEnvironment.waitForConfigurationRecovery();
      expect(configRestored).toBe(true);
      
      console.log('✅ Configuration backup corruption test completed');
    });
  });

  describe('Runtime Configuration Recovery', () => {
    it('should recover from runtime configuration errors', async () => {
      console.log('⚡ Starting runtime configuration recovery test...');
      
      // Create backup
      const backupId = await backupManager.createScheduledBackup();
      
      // Inject runtime configuration error
      await testEnvironment.injectRuntimeConfigurationError();
      
      // Verify runtime error is detected
      const runtimeErrorDetected = await testEnvironment.waitForRuntimeConfigErrorDetection();
      expect(runtimeErrorDetected).toBe(true);
      
      // System should revert to last known good configuration
      const configReverted = await testEnvironment.waitForConfigurationRevert();
      expect(configReverted).toBe(true);
      
      // Verify system stability
      const systemStable = await testEnvironment.verifySystemStability();
      expect(systemStable).toBe(true);
      
      console.log('✅ Runtime configuration recovery test completed');
    });

    it('should handle configuration hot reloading failures', async () => {
      console.log('🔄 Starting configuration hot reload failure test...');
      
      // Start configuration hot reloading
      await testEnvironment.enableConfigurationHotReload();
      
      // Inject configuration that causes hot reload failure
      await testEnvironment.injectHotReloadFailureConfiguration();
      
      // Verify hot reload failure is detected
      const hotReloadFailureDetected = await testEnvironment.waitForHotReloadFailureDetection();
      expect(hotReloadFailureDetected).toBe(true);
      
      // System should continue with previous configuration
      const previousConfigMaintained = await testEnvironment.verifyPreviousConfigurationMaintained();
      expect(previousConfigMaintained).toBe(true);
      
      // Verify system continues operating
      const systemOperating = await testEnvironment.verifySystemOperating();
      expect(systemOperating).toBe(true);
      
      console.log('✅ Configuration hot reload failure test completed');
    });
  });
});
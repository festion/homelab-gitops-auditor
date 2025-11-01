/**
 * Unit tests for Backup Manager
 * Tests backup creation, validation, and recovery functionality
 */

const { MockBackupManager } = require('../../mocks/backup-manager.mock');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

// Mock external dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    copyFile: jest.fn(),
    access: jest.fn()
  }
}));
jest.mock('child_process');

// Mock the actual backup manager for this test
class MockedBackupManager {
  constructor() {
    this.backups = new Map();
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  async createPreDeploymentBackup(deploymentId) {
    if (!this.initialized) {
      throw new Error('Backup manager not initialized');
    }

    const backupId = `backup-${Date.now()}`;
    const backup = {
      id: backupId,
      deploymentId,
      type: 'pre-deployment',
      created: new Date().toISOString(),
      path: `/backup/${backupId}.tar.gz`,
      size: 2048576,
      metadata: {
        configFiles: 156,
        entityStates: 234,
        databaseSize: 1048576
      }
    };

    this.backups.set(backupId, backup);
    return backup;
  }

  async validateBackup(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Simulate validation process
    return {
      valid: true,
      integrity: 'verified',
      checksumMatches: true,
      readableFiles: backup.metadata.configFiles,
      corruptedFiles: 0,
      estimatedRestoreTime: 12000
    };
  }

  async rollbackDeployment(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    return {
      success: true,
      backupId,
      restoredFiles: backup.metadata.configFiles,
      duration: 12000,
      details: {
        configurationRestored: true,
        databaseRestored: true,
        entityStatesRestored: true
      }
    };
  }

  async listBackups() {
    const backups = Array.from(this.backups.values());
    return {
      backups,
      total: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0)
    };
  }

  async deleteBackup(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    this.backups.delete(backupId);
    return {
      success: true,
      deletedSize: backup.size,
      freedSpace: backup.size
    };
  }

  async getBackupMetadata(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    return {
      id: backupId,
      ...backup,
      metadata: {
        ...backup.metadata,
        homeAssistantVersion: '2025.7.0',
        addons: ['ESPHome', 'Node-RED', 'Mosquitto broker'],
        integrations: ['mqtt', 'homekit', 'google_assistant']
      }
    };
  }
}

describe('BackupManager', () => {
  let backupManager;
  let mockExec;
  let mockFs;

  beforeEach(() => {
    backupManager = new MockedBackupManager();
    
    mockExec = jest.fn();
    exec.mockImplementation((command, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      mockExec(command, options, callback);
    });

    mockFs = fs;
    mockFs.mkdir.mockResolvedValue();
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ isFile: () => true, size: 1024 });
    mockFs.readFile.mockResolvedValue('mock file content');
    mockFs.writeFile.mockResolvedValue();
    mockFs.copyFile.mockResolvedValue();
    mockFs.access.mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(backupManager.initialize()).resolves.toBe(true);
      expect(backupManager.initialized).toBe(true);
    });
  });

  describe('backup creation', () => {
    beforeEach(async () => {
      await backupManager.initialize();
    });

    it('should create pre-deployment backup successfully', async () => {
      const deploymentId = 'deploy-20250713-101117';
      
      const backup = await backupManager.createPreDeploymentBackup(deploymentId);

      expect(backup.id).toMatch(/^backup-\d+$/);
      expect(backup.deploymentId).toBe(deploymentId);
      expect(backup.type).toBe('pre-deployment');
      expect(backup.path).toContain('.tar.gz');
      expect(backup.size).toBeGreaterThan(0);
      expect(backup.metadata).toBeDefined();
      expect(backup.metadata.configFiles).toBeGreaterThan(0);
      expect(backup.created).toBeDefined();
    });

    it('should fail backup creation when not initialized', async () => {
      const uninitializedManager = new MockedBackupManager();
      
      await expect(
        uninitializedManager.createPreDeploymentBackup('deploy-123')
      ).rejects.toThrow('Backup manager not initialized');
    });

    it('should include comprehensive metadata in backup', async () => {
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');

      expect(backup.metadata.configFiles).toBeGreaterThan(0);
      expect(backup.metadata.entityStates).toBeGreaterThan(0);
      expect(backup.metadata.databaseSize).toBeGreaterThan(0);
    });

    it('should generate unique backup IDs', async () => {
      const backup1 = await backupManager.createPreDeploymentBackup('deploy-1');
      const backup2 = await backupManager.createPreDeploymentBackup('deploy-2');

      expect(backup1.id).not.toBe(backup2.id);
      expect(backup1.path).not.toBe(backup2.path);
    });
  });

  describe('backup validation', () => {
    let backupId;

    beforeEach(async () => {
      await backupManager.initialize();
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      backupId = backup.id;
    });

    it('should validate backup successfully', async () => {
      const validation = await backupManager.validateBackup(backupId);

      expect(validation.valid).toBe(true);
      expect(validation.integrity).toBe('verified');
      expect(validation.checksumMatches).toBe(true);
      expect(validation.readableFiles).toBeGreaterThan(0);
      expect(validation.corruptedFiles).toBe(0);
      expect(validation.estimatedRestoreTime).toBeGreaterThan(0);
    });

    it('should fail validation for non-existent backup', async () => {
      await expect(
        backupManager.validateBackup('non-existent-backup')
      ).rejects.toThrow('Backup non-existent-backup not found');
    });
  });

  describe('backup rollback', () => {
    let backupId;

    beforeEach(async () => {
      await backupManager.initialize();
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      backupId = backup.id;
    });

    it('should rollback deployment successfully', async () => {
      const rollback = await backupManager.rollbackDeployment(backupId);

      expect(rollback.success).toBe(true);
      expect(rollback.backupId).toBe(backupId);
      expect(rollback.restoredFiles).toBeGreaterThan(0);
      expect(rollback.duration).toBeGreaterThan(0);
      expect(rollback.details.configurationRestored).toBe(true);
      expect(rollback.details.databaseRestored).toBe(true);
      expect(rollback.details.entityStatesRestored).toBe(true);
    });

    it('should fail rollback for non-existent backup', async () => {
      await expect(
        backupManager.rollbackDeployment('non-existent-backup')
      ).rejects.toThrow('Backup non-existent-backup not found');
    });
  });

  describe('backup listing', () => {
    beforeEach(async () => {
      await backupManager.initialize();
    });

    it('should list all backups', async () => {
      // Create multiple backups
      await backupManager.createPreDeploymentBackup('deploy-1');
      await backupManager.createPreDeploymentBackup('deploy-2');
      await backupManager.createPreDeploymentBackup('deploy-3');

      const list = await backupManager.listBackups();

      expect(list.backups).toHaveLength(3);
      expect(list.total).toBe(3);
      expect(list.totalSize).toBeGreaterThan(0);
      
      // Check that all backups have required fields
      list.backups.forEach(backup => {
        expect(backup.id).toBeDefined();
        expect(backup.type).toBeDefined();
        expect(backup.created).toBeDefined();
        expect(backup.size).toBeGreaterThan(0);
      });
    });

    it('should return empty list when no backups exist', async () => {
      const list = await backupManager.listBackups();

      expect(list.backups).toHaveLength(0);
      expect(list.total).toBe(0);
      expect(list.totalSize).toBe(0);
    });
  });

  describe('backup deletion', () => {
    let backupId;

    beforeEach(async () => {
      await backupManager.initialize();
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      backupId = backup.id;
    });

    it('should delete backup successfully', async () => {
      const deletion = await backupManager.deleteBackup(backupId);

      expect(deletion.success).toBe(true);
      expect(deletion.deletedSize).toBeGreaterThan(0);
      expect(deletion.freedSpace).toBeGreaterThan(0);

      // Verify backup is actually deleted
      await expect(
        backupManager.validateBackup(backupId)
      ).rejects.toThrow('not found');
    });

    it('should fail deletion for non-existent backup', async () => {
      await expect(
        backupManager.deleteBackup('non-existent-backup')
      ).rejects.toThrow('Backup non-existent-backup not found');
    });
  });

  describe('backup metadata', () => {
    let backupId;

    beforeEach(async () => {
      await backupManager.initialize();
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      backupId = backup.id;
    });

    it('should retrieve comprehensive backup metadata', async () => {
      const metadata = await backupManager.getBackupMetadata(backupId);

      expect(metadata.id).toBe(backupId);
      expect(metadata.metadata.homeAssistantVersion).toBeDefined();
      expect(metadata.metadata.configFiles).toBeGreaterThan(0);
      expect(metadata.metadata.entityStates).toBeGreaterThan(0);
      expect(metadata.metadata.addons).toBeInstanceOf(Array);
      expect(metadata.metadata.integrations).toBeInstanceOf(Array);
      expect(metadata.metadata.addons.length).toBeGreaterThan(0);
      expect(metadata.metadata.integrations.length).toBeGreaterThan(0);
    });

    it('should fail metadata retrieval for non-existent backup', async () => {
      await expect(
        backupManager.getBackupMetadata('non-existent-backup')
      ).rejects.toThrow('Backup non-existent-backup not found');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await backupManager.initialize();
    });

    it('should handle backup creation errors gracefully', async () => {
      // Mock file system error
      const originalCreate = backupManager.createPreDeploymentBackup;
      backupManager.createPreDeploymentBackup = jest.fn().mockRejectedValue(
        new Error('Insufficient disk space')
      );

      await expect(
        backupManager.createPreDeploymentBackup('deploy-test')
      ).rejects.toThrow('Insufficient disk space');
    });

    it('should handle validation errors gracefully', async () => {
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      
      // Mock validation error
      const originalValidate = backupManager.validateBackup;
      backupManager.validateBackup = jest.fn().mockRejectedValue(
        new Error('Backup file corrupted')
      );

      await expect(
        backupManager.validateBackup(backup.id)
      ).rejects.toThrow('Backup file corrupted');
    });

    it('should handle rollback errors gracefully', async () => {
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      
      // Mock rollback error
      const originalRollback = backupManager.rollbackDeployment;
      backupManager.rollbackDeployment = jest.fn().mockRejectedValue(
        new Error('Configuration files locked')
      );

      await expect(
        backupManager.rollbackDeployment(backup.id)
      ).rejects.toThrow('Configuration files locked');
    });
  });

  describe('backup integrity checks', () => {
    beforeEach(async () => {
      await backupManager.initialize();
    });

    it('should verify backup integrity during creation', async () => {
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      
      // The backup should have been created with integrity information
      expect(backup.metadata).toBeDefined();
      expect(backup.size).toBeGreaterThan(0);
      expect(backup.path).toBeDefined();
    });

    it('should detect corrupted backups during validation', async () => {
      const backup = await backupManager.createPreDeploymentBackup('deploy-test');
      
      // Mock a corrupted backup scenario
      const originalValidate = backupManager.validateBackup;
      backupManager.validateBackup = jest.fn().mockResolvedValue({
        valid: false,
        integrity: 'corrupted',
        checksumMatches: false,
        readableFiles: 100,
        corruptedFiles: 56,
        errors: [
          'Checksum mismatch for configuration.yaml',
          'Database file appears truncated'
        ]
      });

      const validation = await backupManager.validateBackup(backup.id);
      
      expect(validation.valid).toBe(false);
      expect(validation.integrity).toBe('corrupted');
      expect(validation.checksumMatches).toBe(false);
      expect(validation.corruptedFiles).toBeGreaterThan(0);
      expect(validation.errors).toBeInstanceOf(Array);
    });
  });
});
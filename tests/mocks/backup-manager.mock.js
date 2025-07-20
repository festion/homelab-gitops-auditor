/**
 * Mock implementation for Backup Manager
 * Used to isolate deployment and recovery components during testing
 */
class MockBackupManager {
  constructor() {
    this.createPreDeploymentBackup = jest.fn();
    this.createPostDeploymentBackup = jest.fn();
    this.rollbackDeployment = jest.fn();
    this.validateBackup = jest.fn();
    this.listBackups = jest.fn();
    this.deleteBackup = jest.fn();
    this.getBackupMetadata = jest.fn();
    this.estimateBackupSize = jest.fn();
    
    // Internal state tracking
    this._backups = new Map();
    this._currentBackupId = null;
  }

  // Mock successful backup creation
  mockBackupSuccess() {
    const backupId = `backup-${Date.now()}`;
    this._currentBackupId = backupId;
    
    this.createPreDeploymentBackup.mockResolvedValue({
      success: true,
      backupId,
      path: `/backup/${backupId}.tar.gz`,
      size: 2048576,
      duration: 15000,
      timestamp: new Date().toISOString(),
      metadata: {
        configFiles: 156,
        entityStates: 234,
        databaseSize: 1048576
      }
    });

    this._backups.set(backupId, {
      id: backupId,
      type: 'pre-deployment',
      status: 'completed',
      size: 2048576,
      created: new Date()
    });
  }

  // Mock backup failure
  mockBackupFailure(errorMessage = 'Insufficient disk space') {
    this.createPreDeploymentBackup.mockRejectedValue(
      new Error(`Backup creation failed: ${errorMessage}`)
    );
  }

  // Mock slow backup for testing timeouts
  mockSlowBackup(duration = 30000) {
    this.createPreDeploymentBackup.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const backupId = `backup-${Date.now()}`;
          resolve({
            success: true,
            backupId,
            path: `/backup/${backupId}.tar.gz`,
            size: 2048576,
            duration,
            timestamp: new Date().toISOString()
          });
        }, duration);
      });
    });
  }

  // Mock successful rollback
  mockRollbackSuccess() {
    this.rollbackDeployment.mockResolvedValue({
      success: true,
      backupId: this._currentBackupId,
      restoredFiles: 156,
      duration: 12000,
      timestamp: new Date().toISOString(),
      details: {
        configurationRestored: true,
        databaseRestored: true,
        entityStatesRestored: true
      }
    });
  }

  // Mock rollback failure
  mockRollbackFailure(errorMessage = 'Backup file corrupted') {
    this.rollbackDeployment.mockRejectedValue(
      new Error(`Rollback failed: ${errorMessage}`)
    );
  }

  // Mock backup validation success
  mockValidationSuccess() {
    this.validateBackup.mockResolvedValue({
      valid: true,
      integrity: 'verified',
      checksumMatches: true,
      readableFiles: 156,
      corruptedFiles: 0,
      estimatedRestoreTime: 12000
    });
  }

  // Mock backup validation failure
  mockValidationFailure() {
    this.validateBackup.mockResolvedValue({
      valid: false,
      integrity: 'corrupted',
      checksumMatches: false,
      readableFiles: 143,
      corruptedFiles: 13,
      errors: [
        'Checksum mismatch for configuration.yaml',
        'Database file appears truncated',
        'Missing automation files'
      ]
    });
  }

  // Mock backup listing
  mockBackupList() {
    const backups = [
      {
        id: 'backup-20250713-090000',
        type: 'pre-deployment',
        status: 'completed',
        size: 2048576,
        created: new Date('2025-07-13T09:00:00Z'),
        deploymentId: 'deploy-20250713-090030'
      },
      {
        id: 'backup-20250713-080000',
        type: 'scheduled',
        status: 'completed',
        size: 1987654,
        created: new Date('2025-07-13T08:00:00Z')
      },
      {
        id: 'backup-20250712-210000',
        type: 'manual',
        status: 'completed',
        size: 2156789,
        created: new Date('2025-07-12T21:00:00Z')
      }
    ];

    this.listBackups.mockResolvedValue({
      backups,
      total: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0)
    });

    backups.forEach(backup => {
      this._backups.set(backup.id, backup);
    });
  }

  // Mock backup metadata retrieval
  mockBackupMetadata(backupId) {
    this.getBackupMetadata.mockResolvedValue({
      id: backupId,
      metadata: {
        homeAssistantVersion: '2025.7.0',
        configFiles: 156,
        entityStates: 234,
        automations: 15,
        scripts: 8,
        scenes: 12,
        databaseSize: 1048576,
        addons: [
          'ESPHome',
          'Node-RED',
          'Mosquitto broker'
        ],
        integrations: [
          'mqtt',
          'homekit',
          'google_assistant',
          'alexa'
        ]
      },
      creation: {
        timestamp: new Date().toISOString(),
        duration: 15000,
        trigger: 'pre-deployment'
      }
    });
  }

  // Mock backup size estimation
  mockSizeEstimation() {
    this.estimateBackupSize.mockResolvedValue({
      estimatedSize: 2097152,
      breakdown: {
        configuration: 524288,
        database: 1048576,
        customComponents: 262144,
        www: 131072,
        addons: 131072
      },
      estimatedDuration: 15000
    });
  }

  // Mock backup deletion
  mockDeleteSuccess() {
    this.deleteBackup.mockResolvedValue({
      success: true,
      deletedSize: 2048576,
      freedSpace: 2048576
    });
  }

  // Mock delete failure
  mockDeleteFailure() {
    this.deleteBackup.mockRejectedValue(
      new Error('Backup deletion failed: File is locked')
    );
  }

  // Utility methods
  getCurrentBackupId() {
    return this._currentBackupId;
  }

  hasBackup(backupId) {
    return this._backups.has(backupId);
  }

  getBackupCount() {
    return this._backups.size;
  }

  // Reset all mocks and state
  reset() {
    jest.clearAllMocks();
    this._backups.clear();
    this._currentBackupId = null;
  }
}

module.exports = { MockBackupManager };
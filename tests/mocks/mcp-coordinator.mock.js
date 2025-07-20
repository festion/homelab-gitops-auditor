/**
 * Mock implementation for MCP Coordinator
 * Used to isolate deployment service and other components during testing
 */
class MockMCPCoordinator {
  constructor() {
    this.deployConfiguration = jest.fn();
    this.transferFile = jest.fn();
    this.createBackup = jest.fn();
    this.rollbackDeployment = jest.fn();
    this.getAllStatus = jest.fn();
    this.getHealthStatus = jest.fn();
    this.checkHealth = jest.fn();
    this.reconnect = jest.fn();
    this.initialize = jest.fn();
    this.shutdown = jest.fn();
    
    // Internal state tracking
    this._deploymentInProgress = false;
    this._healthStatus = new Map();
    this._connectionStatus = new Map();
    
    // Initialize default states
    this._initializeDefaults();
  }

  _initializeDefaults() {
    this._healthStatus.set('networkFs', { status: 'healthy', lastCheck: new Date() });
    this._healthStatus.set('github', { status: 'healthy', lastCheck: new Date() });
    this._connectionStatus.set('networkFs', { status: 'connected', connectedAt: new Date() });
    this._connectionStatus.set('github', { status: 'connected', connectedAt: new Date() });
  }

  // Mock successful deployment
  mockDeploymentSuccess() {
    this.deployConfiguration.mockResolvedValue({
      success: true,
      deploymentId: 'deploy-20250713-101117',
      filesDeployed: 15,
      duration: 45000,
      state: 'completed'
    });
    this._deploymentInProgress = true;
    setTimeout(() => { this._deploymentInProgress = false; }, 100);
  }

  // Mock deployment failure
  mockDeploymentFailure(errorMessage = 'Configuration validation error') {
    this.deployConfiguration.mockRejectedValue(
      new Error(`Deployment failed: ${errorMessage}`)
    );
  }

  // Mock slow deployment for concurrency testing
  mockSlowDeployment(duration = 5000) {
    this.deployConfiguration.mockImplementation(() => {
      this._deploymentInProgress = true;
      return new Promise((resolve) => {
        setTimeout(() => {
          this._deploymentInProgress = false;
          resolve({
            success: true,
            deploymentId: 'deploy-20250713-101117',
            filesDeployed: 15,
            duration,
            state: 'completed'
          });
        }, duration);
      });
    });
  }

  // Mock successful file transfer
  mockTransferSuccess() {
    this.transferFile.mockResolvedValue({
      success: true,
      transferred: true,
      size: 1024
    });
  }

  // Mock file transfer failure with retry logic
  mockTransferFailure() {
    this.transferFile.mockRejectedValue(
      new Error('File transfer failed: Network timeout')
    );
  }

  // Mock successful backup creation
  mockBackupSuccess() {
    this.createBackup.mockResolvedValue({
      success: true,
      backupId: `backup-${Date.now()}`,
      path: '/backup/config-backup.tar.gz',
      size: 2048576
    });
  }

  // Mock backup failure
  mockBackupFailure(errorMessage = 'Insufficient disk space') {
    this.createBackup.mockRejectedValue(
      new Error(`Backup failed: ${errorMessage}`)
    );
  }

  // Mock healthy server status
  mockHealthyStatus() {
    this.getAllStatus.mockReturnValue({
      networkFs: {
        connection: { status: 'connected', connectedAt: new Date() },
        health: { status: 'healthy', lastCheck: new Date() }
      },
      github: {
        connection: { status: 'connected', connectedAt: new Date() },
        health: { status: 'healthy', lastCheck: new Date() }
      }
    });

    this.getHealthStatus.mockImplementation((serverName) => {
      return this._healthStatus.get(serverName) || { status: 'unknown' };
    });

    this.checkHealth.mockResolvedValue(true);
  }

  // Mock unhealthy server status
  mockUnhealthyStatus() {
    this._healthStatus.set('networkFs', { 
      status: 'unhealthy', 
      lastError: 'Connection timeout',
      lastCheck: new Date()
    });

    this.getAllStatus.mockReturnValue({
      networkFs: {
        connection: { status: 'failed', lastError: 'Connection timeout' },
        health: { status: 'unhealthy', lastError: 'Connection timeout' }
      },
      github: {
        connection: { status: 'connected', connectedAt: new Date() },
        health: { status: 'healthy', lastCheck: new Date() }
      }
    });

    this.getHealthStatus.mockImplementation((serverName) => {
      return this._healthStatus.get(serverName) || { status: 'unknown' };
    });

    this.checkHealth.mockResolvedValue(false);
  }

  // Mock connection success
  mockConnectionSuccess() {
    this.initialize.mockResolvedValue(true);
  }

  // Mock connection failure
  mockConnectionFailure(serverName = 'Network-FS') {
    this.initialize.mockRejectedValue(
      new Error(`Failed to connect to ${serverName} MCP server`)
    );
  }

  // Mock rollback success
  mockRollbackSuccess() {
    this.rollbackDeployment.mockResolvedValue({
      success: true,
      rolledBack: true,
      restoredFiles: 12
    });
  }

  // Utility methods for test state management
  isDeploymentInProgress() {
    return this._deploymentInProgress;
  }

  setServerHealth(serverName, status, error = null) {
    this._healthStatus.set(serverName, {
      status,
      lastError: error,
      lastCheck: new Date()
    });
  }

  // Reset all mocks to default state
  reset() {
    jest.clearAllMocks();
    this._deploymentInProgress = false;
    this._healthStatus.clear();
    this._connectionStatus.clear();
    this._initializeDefaults();
  }
}

module.exports = { MockMCPCoordinator };
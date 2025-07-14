/**
 * Environment setup for disaster recovery tests
 */

process.env.NODE_ENV = 'test-disaster-recovery';
process.env.LOG_LEVEL = 'error';
process.env.DISABLE_CONSOLE_LOG = 'true';

// Set extended timeout for disaster recovery tests
jest.setTimeout(600000); // 10 minutes

// Set up global test configuration
global.TEST_CONFIG = {
  environment: 'disaster-recovery',
  timeout: 600000,
  retries: 0, // No retries for DR tests
  isolation: true,
  cleanup: true
};

// Mock console.log for cleaner test output
const originalLog = console.log;
console.log = (...args) => {
  if (process.env.VERBOSE_TESTS === 'true') {
    originalLog(...args);
  }
};

// Set up test environment variables
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'homelab_gitops_dr_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = 'test_redis_password';

process.env.API_PORT = '3072';
process.env.DASHBOARD_PORT = '3002';

// Test data directories
process.env.TEST_DATA_DIR = '/tmp/homelab-gitops-dr-test';
process.env.BACKUP_DIR = '/tmp/homelab-gitops-dr-backup';
process.env.RESTORE_DIR = '/tmp/homelab-gitops-dr-restore';

// Failure injection settings
process.env.FAILURE_INJECTION_ENABLED = 'true';
process.env.RECOVERY_VALIDATION_ENABLED = 'true';
process.env.METRICS_COLLECTION_ENABLED = 'true';

// RTO/RPO settings for testing
process.env.RTO_MINUTES = '30';
process.env.RPO_MINUTES = '60';
process.env.INTEGRITY_THRESHOLD = '0.95';
process.env.SUCCESS_RATE_THRESHOLD = '0.99';
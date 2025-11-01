module.exports = {
  displayName: 'Unit Tests',
  testEnvironment: 'node',
  
  // Root directory for tests and modules
  rootDir: '..',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  
  // Test file patterns - Only unit tests
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/logs/',
    '/tests/integration/',
    '/tests/performance/'
  ],
  
  // Coverage configuration for unit tests
  collectCoverage: true,
  collectCoverageFrom: [
    'scripts/services/**/*.js',
    'scripts/health-checks/**/*.js',
    'scripts/backup/**/*.js',
    'api/services/**/*.js',
    'api/middleware/**/*.js',
    'api/models/**/*.js',
    'api/utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/test/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/logs/**',
    '!**/mocks/**',
    '!**/fixtures/**',
    '!scripts/services/mcp-coordinator.js'
  ],
  
  // Aggressive coverage thresholds for unit tests
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    // Critical deployment components - 100% coverage
    './scripts/services/home-assistant-deployer.js': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './scripts/health-checks/health-checker.js': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './scripts/backup/**/*.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './api/services/mcp-coordinator.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // Coverage reporting
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json'
  ],
  
  // Coverage output directory
  coverageDirectory: '<rootDir>/tests/coverage/unit',
  
  // Test timeout (shorter for unit tests)
  testTimeout: 10000,
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@scripts/(.*)$': '<rootDir>/scripts/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@mocks/(.*)$': '<rootDir>/tests/mocks/$1',
    '^@fixtures/(.*)$': '<rootDir>/tests/fixtures/$1'
  },
  
  // Global variables for tests
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.TEST_DATABASE_URL': 'sqlite::memory:',
    'process.env.JWT_SECRET': 'test-jwt-secret-key-for-unit-tests',
    'process.env.GITHUB_TOKEN': 'test-github-token-unit',
    'process.env.WEBHOOK_SECRET': 'test-webhook-secret-unit'
  },
  
  // Verbose output for unit test debugging
  verbose: true,
  
  // Detect open handles for proper cleanup
  detectOpenHandles: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Performance optimizations for unit tests
  maxWorkers: '75%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache-unit'
};
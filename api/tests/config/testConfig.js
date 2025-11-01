const path = require('path');

module.exports = {
  // Test environment configuration
  testEnvironment: 'node',
  
  // Setup files to run after Jest is initialized
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js',
    '<rootDir>/tests/setup/database.setup.js'
  ],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'phase2-endpoints.js',
    'server.js',
    'server-v2.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/*.config.js'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Specific thresholds for critical files
    './services/pipeline/pipelineService.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './services/compliance/complianceService.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,
  
  // Coverage reporting
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  
  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@models/(.*)$': '<rootDir>/models/$1',
    '^@middleware/(.*)$': '<rootDir>/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Global variables for tests
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.TEST_DATABASE_URL': 'sqlite::memory:',
    'process.env.JWT_SECRET': 'test-jwt-secret-key',
    'process.env.GITHUB_TOKEN': 'test-github-token',
    'process.env.WEBHOOK_SECRET': 'test-webhook-secret'
  },
  
  // Verbose output for debugging
  verbose: true,
  
  // Detect open handles for proper cleanup
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true
};
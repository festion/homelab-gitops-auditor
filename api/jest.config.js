module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory for tests and modules
  rootDir: '.',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js',
    '<rootDir>/tests/setup/database.setup.js'
  ],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/test/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/logs/'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'phase2-endpoints.js',
    'server.js',
    'server-v2.js',
    'websocket-server.js',
    'phase2-websocket.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/test/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/logs/**'
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
    },
    './phase2-endpoints.js': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Coverage reporting
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'clover'
  ],
  
  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage',
  
  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,
  
  // Module name mapping
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
  
  // Test suites organization
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: [
        '<rootDir>/tests/routes/*.test.js',
        '<rootDir>/tests/services/*.test.js',
        '<rootDir>/tests/middleware/*.test.js',
        '<rootDir>/tests/models/*.test.js'
      ],
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup/jest.setup.js',
        '<rootDir>/tests/setup/database.setup.js'
      ]
    },
    {
      displayName: 'Integration Tests',
      testMatch: [
        '<rootDir>/tests/integration/*.test.js'
      ],
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup/jest.setup.js',
        '<rootDir>/tests/setup/database.setup.js'
      ],
      testTimeout: 60000
    },
    {
      displayName: 'WebSocket Tests',
      testMatch: [
        '<rootDir>/tests/websocket/*.test.js'
      ],
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup/jest.setup.js'
      ],
      testTimeout: 30000
    },
    {
      displayName: 'Performance Tests',
      testMatch: [
        '<rootDir>/tests/performance/*.test.js'
      ],
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup/jest.setup.js',
        '<rootDir>/tests/setup/database.setup.js'
      ],
      testTimeout: 120000
    }
  ],
  
  // Verbose output for debugging
  verbose: true,
  
  // Detect open handles for proper cleanup
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Custom test results processor (commented out for initial run)
  // testResultsProcessor: '<rootDir>/tests/utils/testResultsProcessor.js',
  
  // Watch plugins for development (commented out until package is installed)
  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname'
  // ],
  
  // Performance and debugging
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Error handling
  errorOnDeprecated: true,
  
  // Custom environment variables for specific test types
  testEnvironmentOptions: {
    url: 'http://localhost:3000'
  }
};
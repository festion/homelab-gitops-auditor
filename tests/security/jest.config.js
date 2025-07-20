/**
 * Jest configuration for security tests
 */

module.exports = {
  displayName: 'Security Tests',
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/security/**/*.test.js'
  ],
  
  // Setup files
  setupFiles: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  
  setupFilesAfterEnv: [
    '<rootDir>/tests/security/setup/security-setup.js'
  ],
  
  // Module paths
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/security',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  
  // Test timeout (30 seconds for security tests)
  testTimeout: 30000,
  
  // Verbose output for security tests
  verbose: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/security/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/security/setup/global-teardown.js',
  
  // Test environment options
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    SECURITY_TEST_MODE: 'true',
    JWT_SECRET: 'test-jwt-secret-for-security-testing',
    LOG_LEVEL: 'error'
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/coverage/security',
        filename: 'security-test-report.html',
        pageTitle: 'Security Test Report',
        logoImgPath: undefined,
        hideIcon: false,
        expand: false,
        openReport: false,
        customInfos: [
          {
            title: 'Security Test Suite',
            value: 'Comprehensive security testing for homelab-gitops-auditor'
          }
        ]
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/coverage/security',
        outputName: 'security-test-results.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Reset modules between tests
  resetModules: true,
  
  // Test result processor
  testResultsProcessor: '<rootDir>/tests/security/utils/test-results-processor.js',
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Notify mode
  notify: false,
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Max concurrent tests
  maxConcurrency: 5,
  
  // Max workers for parallel test execution
  maxWorkers: '50%',
  
  // Silent mode
  silent: false,
  
  // Collect coverage from
  collectCoverageFrom: [
    'api/**/*.js',
    'scripts/**/*.js',
    'modules/**/*.js',
    '!api/server.js',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Test name pattern
  testNamePattern: undefined,
  
  // Roots
  roots: [
    '<rootDir>/tests/security'
  ],
  
  // Run tests serially
  runInBand: false,
  
  // Bail after first test failure
  bail: 0,
  
  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache-security',
  
  // Extensions to look for when resolving modules
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage/security',
  
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',
  
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'html'
  ],
  
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './tests/security/authentication/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './tests/security/authorization/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './tests/security/input-validation/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Make calling deprecated APIs throw helpful error messages
  errorOnDeprecated: true,
  
  // Use this configuration option to add custom reporters to Jest
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/security',
        filename: 'security-test-report.html',
        pageTitle: 'Security Test Report',
        logoImgPath: undefined,
        hideIcon: false,
        expand: false,
        openReport: false,
        customInfos: [
          {
            title: 'Test Suite',
            value: 'Security Tests'
          },
          {
            title: 'Test Type',
            value: 'Comprehensive Security Testing'
          },
          {
            title: 'Coverage',
            value: 'Authentication, Authorization, Input Validation, API Security'
          }
        ]
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: './coverage/security',
        outputName: 'security-test-results.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  
  // The test environment that will be used for testing
  testEnvironment: 'node',
  
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '<rootDir>/tests/security/**/*.test.js'
  ],
  
  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  
  // The regexp pattern or array of patterns that Jest uses to detect test files
  testRegex: undefined,
  
  // This option allows the use of a custom results processor
  testResultsProcessor: undefined,
  
  // This option allows use of a custom test runner
  testRunner: 'jest-circus/runner',
  
  // Default timeout of a test in milliseconds
  testTimeout: 30000,
  
  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // An array of regexp pattern strings that are matched against all source file paths, matched files will skip transformation
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\\/]+$'
  ],
  
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  
  // An array of regexp patterns that are matched against all source file paths before re-running tests in watch mode
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  
  // Whether to use watchman for file crawling
  watchman: true
};
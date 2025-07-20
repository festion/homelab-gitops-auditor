module.exports = {
  displayName: 'Integration Tests',
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.js'
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/**/node_modules/**',
    '!api/**/*.test.js',
    '!api/**/*.spec.js',
    '!api/coverage/**'
  ],
  coverageDirectory: '<rootDir>/coverage/integration',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/integration/setup/jest-setup.js'
  ],
  testTimeout: 60000, // 60 seconds for integration tests
  maxWorkers: 1, // Run tests serially to avoid conflicts
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  globalSetup: '<rootDir>/tests/integration/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/integration/setup/global-teardown.js',
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/api/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(supertest)/)'
  ],
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/integration/html-report',
        filename: 'integration-test-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'Integration Test Report'
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: './coverage/integration',
        outputName: 'integration-junit.xml',
        suiteName: 'Integration Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ]
};
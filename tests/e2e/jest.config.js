module.exports = {
  displayName: 'End-to-End Tests',
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.js'
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'api/**/*.js',
    'dashboard/**/*.js',
    '!**/node_modules/**',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/coverage/**'
  ],
  coverageDirectory: '<rootDir>/coverage/e2e',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/e2e/setup/jest-setup.js'
  ],
  testTimeout: 300000, // 5 minutes for E2E tests
  maxWorkers: 1, // Run E2E tests serially to avoid conflicts
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  globalSetup: '<rootDir>/tests/e2e/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/e2e/setup/global-teardown.js',
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/api/$1',
    '^@dashboard/(.*)$': '<rootDir>/dashboard/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/docs/'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(supertest|puppeteer|playwright)/)'
  ],
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/e2e/html-report',
        filename: 'e2e-test-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'End-to-End Test Report',
        logoImgPath: undefined,
        openReport: false
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: './coverage/e2e',
        outputName: 'e2e-junit.xml',
        suiteName: 'End-to-End Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  // E2E specific settings
  watchman: false,
  bail: 1, // Stop on first test failure in E2E
  errorOnDeprecated: true
};
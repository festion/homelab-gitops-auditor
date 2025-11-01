module.exports = {
  displayName: 'Disaster Recovery Tests',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/disaster-recovery/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/tests/disaster-recovery/utils/',
    '<rootDir>/tests/disaster-recovery/fixtures/'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/disaster-recovery/setup/jest-setup.js'
  ],
  globalSetup: '<rootDir>/tests/disaster-recovery/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/disaster-recovery/setup/global-teardown.js',
  testTimeout: 600000, // 10 minutes - DR tests need longer timeout
  verbose: true,
  collectCoverage: false, // Disable coverage for DR tests by default
  coverageDirectory: '<rootDir>/coverage/disaster-recovery',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/disaster-recovery/utils/',
    '/tests/disaster-recovery/fixtures/',
    '/tests/disaster-recovery/setup/'
  ],
  testResultsProcessor: 'jest-junit',
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/disaster-recovery',
      filename: 'disaster-recovery-report.html',
      pageTitle: 'Disaster Recovery Test Report',
      logoImgPath: './logo.png',
      hideIcon: true,
      expand: true,
      openReport: false
    }],
    ['jest-junit', {
      outputDirectory: './coverage/disaster-recovery',
      outputName: 'disaster-recovery-results.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  testEnvironmentOptions: {
    NODE_ENV: 'test-disaster-recovery'
  },
  maxWorkers: 1, // Run DR tests sequentially to avoid interference
  bail: false, // Continue running tests even if some fail
  forceExit: true, // Force exit after tests complete
  detectOpenHandles: true, // Detect open handles that prevent exit
  setupFiles: [
    '<rootDir>/tests/disaster-recovery/setup/env-setup.js'
  ]
};
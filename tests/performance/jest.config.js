module.exports = {
  displayName: 'Performance Tests',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.js'],
  testTimeout: 300000, // 5 minutes for performance tests
  setupFilesAfterEnv: ['<rootDir>/setup/jest-setup.js'],
  globalSetup: '<rootDir>/setup/global-setup.js',
  globalTeardown: '<rootDir>/setup/global-teardown.js',
  collectCoverageFrom: [
    'utils/**/*.js',
    '!utils/**/*.test.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageDirectory: '<rootDir>/../../coverage/performance',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1, // Run performance tests sequentially
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/performance/html-report',
      filename: 'performance-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Performance Test Report'
    }]
  ]
};
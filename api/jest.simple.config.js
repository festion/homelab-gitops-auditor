module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js',
    '<rootDir>/tests/setup/database.setup.js'
  ],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
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
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  
  // Coverage thresholds (disabled for initial testing)
  // coverageThreshold: {
  //   global: {
  //     branches: 10,
  //     functions: 10,
  //     lines: 10,
  //     statements: 10
  //   }
  // },
  
  // Coverage reporting
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Force exit after tests complete
  forceExit: true
};
// Jest setup for unit tests
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.TEST_MODE = 'unit';

// Mock external services globally
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(true),
  copy: jest.fn().mockResolvedValue(true),
  remove: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('mock file content'),
  writeFile: jest.fn().mockResolvedValue(true),
  pathExists: jest.fn().mockResolvedValue(true)
}));

jest.mock('axios', () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    }))
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}));

// Mock child_process for shell command execution
jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn(),
  execSync: jest.fn().mockReturnValue('mock command output')
}));

// Mock socket.io for WebSocket testing
jest.mock('socket.io', () => {
  const mockSocket = {
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn()
  };
  
  const mockIo = {
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    })),
    sockets: {
      emit: jest.fn()
    },
    close: jest.fn()
  };
  
  return {
    Server: jest.fn(() => mockIo),
    __mockIo: mockIo
  };
});

// Global test utilities
global.mockDate = (dateString) => {
  const mockDate = new Date(dateString);
  jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
  jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
};

global.restoreDate = () => {
  Date.now.mockRestore?.();
  global.Date.mockRestore?.();
};

// Test timeout configuration
jest.setTimeout(10000);

// Console suppression for cleaner test output
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Restore console after tests if needed
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Custom matchers
expect.extend({
  toBeValidDeploymentId(received) {
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const pass = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid UUID v4 deployment ID format`,
      pass
    };
  },
  
  toBeValidCommitHash(received) {
    const pass = /^[a-f0-9]{7,40}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid git commit hash`,
      pass
    };
  },
  
  toHaveHealthyStatus(received) {
    const pass = received && received.status === 'healthy';
    return {
      message: () => `expected status to be healthy, got ${received?.status}`,
      pass
    };
  }
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  global.restoreDate();
});

// Global cleanup
afterAll(() => {
  global.restoreConsole();
});
/**
 * Security test setup
 * Configure security testing environment and utilities
 */

const { SecurityTestUtils } = require('../utils/security-utils');
const { AttackPayloads } = require('../utils/attack-payloads');

// Extend Jest matchers for security testing
expect.extend({
  toBeSecure(received) {
    const pass = received && received.secure === true;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be secure`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be secure`,
        pass: false
      };
    }
  },
  
  toHaveVulnerabilities(received) {
    const pass = received && Array.isArray(received.vulnerabilities) && received.vulnerabilities.length > 0;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to have vulnerabilities`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to have vulnerabilities`,
        pass: false
      };
    }
  },
  
  toBeValidToken(received) {
    const tokenRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    const pass = typeof received === 'string' && tokenRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid token`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid token format`,
        pass: false
      };
    }
  },
  
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false
      };
    }
  },
  
  toMatchSecurityPattern(received, pattern) {
    const pass = pattern.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to match security pattern ${pattern}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to match security pattern ${pattern}`,
        pass: false
      };
    }
  },
  
  toHaveSecurityHeaders(received) {
    const requiredHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security',
      'content-security-policy'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => 
      !received.headers || !received.headers[header]
    );
    
    const pass = missingHeaders.length === 0;
    
    if (pass) {
      return {
        message: () => `expected response not to have all required security headers`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to have security headers: ${missingHeaders.join(', ')}`,
        pass: false
      };
    }
  },
  
  toBeRateLimited(received) {
    const pass = received.status === 429;
    
    if (pass) {
      return {
        message: () => `expected response not to be rate limited`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to be rate limited (status 429), got ${received.status}`,
        pass: false
      };
    }
  },
  
  toHaveAuthorizationError(received) {
    const pass = received.status === 403 && 
                 received.body.error && 
                 received.body.error.code === 'FORBIDDEN';
    
    if (pass) {
      return {
        message: () => `expected response not to have authorization error`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to have authorization error (403 with FORBIDDEN code)`,
        pass: false
      };
    }
  },
  
  toHaveAuthenticationError(received) {
    const pass = received.status === 401 && 
                 received.body.error && 
                 received.body.error.code === 'UNAUTHORIZED';
    
    if (pass) {
      return {
        message: () => `expected response not to have authentication error`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to have authentication error (401 with UNAUTHORIZED code)`,
        pass: false
      };
    }
  },
  
  toHaveValidationError(received) {
    const pass = [400, 422].includes(received.status) && 
                 received.body.error && 
                 ['VALIDATION_ERROR', 'BAD_REQUEST'].includes(received.body.error.code);
    
    if (pass) {
      return {
        message: () => `expected response not to have validation error`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to have validation error (400/422 with VALIDATION_ERROR/BAD_REQUEST code)`,
        pass: false
      };
    }
  },
  
  toPreventSQLInjection(received) {
    const pass = received.status !== 500 && 
                 !received.body.error?.message?.match(/SQL|database|table|column|syntax|constraint/i);
    
    if (pass) {
      return {
        message: () => `expected response to allow SQL injection`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to prevent SQL injection`,
        pass: false
      };
    }
  },
  
  toPreventXSS(received) {
    const responseBody = JSON.stringify(received.body);
    const pass = !responseBody.includes('<script>') && 
                 !responseBody.includes('javascript:') &&
                 !responseBody.includes('onerror=');
    
    if (pass) {
      return {
        message: () => `expected response to allow XSS`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to prevent XSS`,
        pass: false
      };
    }
  },
  
  toPreventPathTraversal(received) {
    const pass = [400, 403, 404].includes(received.status) && 
                 received.body.error?.message?.match(/invalid.*path|path.*traversal|not.*allowed/i);
    
    if (pass) {
      return {
        message: () => `expected response to allow path traversal`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to prevent path traversal`,
        pass: false
      };
    }
  }
});

// Global security test utilities
global.SecurityTestUtils = SecurityTestUtils;
global.AttackPayloads = AttackPayloads;

// Security test configuration
global.SECURITY_TEST_CONFIG = {
  JWT_SECRET: 'test-jwt-secret-for-security-testing',
  TEST_TIMEOUT: 30000,
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX: 10,
  PASSWORD_MIN_LENGTH: 12,
  TOKEN_EXPIRY: 3600,
  ATTACK_PAYLOAD_TIMEOUT: 5000,
  VULNERABILITY_SCAN_TIMEOUT: 300000
};

// Mock security-related modules for testing
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn((size) => Buffer.alloc(size, 'a')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mockedhash')
  })),
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mockedhmac')
  })),
  timingSafeEqual: jest.fn((a, b) => a.toString() === b.toString())
}));

// Mock JWT for consistent testing
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload, secret, options) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'test-signature';
    return `${header}.${payloadStr}.${signature}`;
  }),
  verify: jest.fn((token, secret, options) => {
    if (token.includes('invalid') || token.includes('expired')) {
      throw new Error('Invalid token');
    }
    return {
      sub: 'test-user',
      roles: ['deployment:read'],
      exp: Math.floor(Date.now() / 1000) + 3600
    };
  }),
  decode: jest.fn((token) => {
    return {
      sub: 'test-user',
      roles: ['deployment:read'],
      exp: Math.floor(Date.now() / 1000) + 3600
    };
  })
}));

// Security test helper functions
global.securityTestHelpers = {
  /**
   * Create a mock security context
   */
  createMockSecurityContext: () => ({
    user: {
      id: 'test-user-id',
      username: 'test-user',
      roles: ['deployment:read']
    },
    session: {
      id: 'test-session-id',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000)
    },
    permissions: ['deployment:read']
  }),
  
  /**
   * Generate test attack payloads
   */
  generateAttackPayloads: (type) => {
    const attackPayloads = new AttackPayloads();
    return attackPayloads.getPayloadsByType(type);
  },
  
  /**
   * Validate security response
   */
  validateSecurityResponse: (response, expectedStatus, expectedError) => {
    expect(response.status).toBe(expectedStatus);
    if (expectedError) {
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(expectedError);
    }
  },
  
  /**
   * Check for security headers
   */
  checkSecurityHeaders: (response) => {
    const securityHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security'
    ];
    
    securityHeaders.forEach(header => {
      expect(response.headers).toHaveProperty(header);
    });
  },
  
  /**
   * Measure response time for timing attacks
   */
  measureResponseTime: async (fn) => {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    return {
      result,
      duration,
      timestamp: Date.now()
    };
  },
  
  /**
   * Generate secure random string
   */
  generateSecureString: (length = 32) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
};

// Console log override for security tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  if (process.env.SECURITY_TEST_VERBOSE === 'true') {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  if (process.env.SECURITY_TEST_VERBOSE === 'true') {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  if (process.env.SECURITY_TEST_VERBOSE === 'true') {
    originalConsoleWarn.apply(console, args);
  }
};

// Cleanup after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Set up security test environment
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SECURITY_TEST_MODE = 'true';
  process.env.JWT_SECRET = 'test-jwt-secret-for-security-testing';
  process.env.LOG_LEVEL = 'error';
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handling for security tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

console.log('🔒 Security test environment initialized');
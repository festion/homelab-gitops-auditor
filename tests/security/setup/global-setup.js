/**
 * Global setup for security tests
 * Initialize security test environment and resources
 */

const { SecurityScanner } = require('../utils/security-scanner');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🔒 Setting up security test environment...');
  
  // Set environment variables for security testing
  process.env.NODE_ENV = 'test';
  process.env.SECURITY_TEST_MODE = 'true';
  process.env.JWT_SECRET = 'test-jwt-secret-for-security-testing';
  process.env.LOG_LEVEL = 'error';
  process.env.SECURITY_TEST_TIMEOUT = '30000';
  process.env.RATE_LIMIT_WINDOW = '60000';
  process.env.RATE_LIMIT_MAX = '10';
  
  // Create security test directories
  const securityDirs = [
    'tests/security/reports',
    'tests/security/temp',
    'tests/security/logs',
    'coverage/security'
  ];
  
  securityDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // Initialize security scanner
  try {
    const scanner = new SecurityScanner({
      verbose: false,
      timeout: 60000,
      outputFormat: 'json'
    });
    
    global.securityScanner = scanner;
    console.log('✅ Security scanner initialized');
  } catch (error) {
    console.warn('⚠️  Security scanner initialization failed:', error.message);
  }
  
  // Create test security configuration
  const securityConfig = {
    jwt: {
      secret: 'test-jwt-secret-for-security-testing',
      expiresIn: '1h',
      algorithm: 'HS256'
    },
    rateLimit: {
      windowMs: 60000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false
    },
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    security: {
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      }
    },
    validation: {
      maxRequestSize: '10mb',
      maxParameterLength: 1000,
      maxHeaderSize: 8192,
      sanitizeInput: true,
      validateInput: true
    },
    authentication: {
      bcryptRounds: 12,
      maxLoginAttempts: 5,
      lockoutDuration: 900000, // 15 minutes
      sessionTimeout: 3600000 // 1 hour
    }
  };
  
  // Write security configuration
  const configPath = path.join(process.cwd(), 'tests/security/temp/security-config.json');
  fs.writeFileSync(configPath, JSON.stringify(securityConfig, null, 2));
  
  global.securityConfig = securityConfig;
  
  // Initialize security test data
  const testData = {
    users: [
      {
        id: 'admin-user',
        username: 'admin',
        password: 'SecureAdminPassword123!',
        roles: ['deployment:admin', 'system:admin', 'user:admin'],
        active: true
      },
      {
        id: 'operator-user',
        username: 'operator',
        password: 'SecureOperatorPassword123!',
        roles: ['deployment:read', 'deployment:write', 'deployment:rollback'],
        active: true
      },
      {
        id: 'viewer-user',
        username: 'viewer',
        password: 'SecureViewerPassword123!',
        roles: ['deployment:read'],
        active: true
      },
      {
        id: 'developer-user',
        username: 'developer',
        password: 'SecureDeveloperPassword123!',
        roles: ['deployment:read', 'deployment:write'],
        active: true
      },
      {
        id: 'inactive-user',
        username: 'inactive',
        password: 'SecureInactivePassword123!',
        roles: ['deployment:read'],
        active: false
      }
    ],
    deployments: [
      {
        id: 'deploy-20250711-123456',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commit: 'abc123def456',
        status: 'success',
        createdBy: 'admin-user',
        createdAt: new Date('2025-07-11T12:34:56Z'),
        updatedAt: new Date('2025-07-11T12:45:00Z')
      },
      {
        id: 'deploy-20250711-234567',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commit: 'def456ghi789',
        status: 'failed',
        createdBy: 'operator-user',
        createdAt: new Date('2025-07-11T23:45:67Z'),
        updatedAt: new Date('2025-07-11T23:50:00Z')
      }
    ],
    sessions: [
      {
        id: 'session-admin-123',
        userId: 'admin-user',
        token: 'admin-session-token',
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        active: true
      },
      {
        id: 'session-operator-456',
        userId: 'operator-user',
        token: 'operator-session-token',
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        active: true
      }
    ]
  };
  
  // Write test data
  const testDataPath = path.join(process.cwd(), 'tests/security/temp/test-data.json');
  fs.writeFileSync(testDataPath, JSON.stringify(testData, null, 2));
  
  global.securityTestData = testData;
  
  // Initialize security metrics
  global.securityMetrics = {
    testStartTime: Date.now(),
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    vulnerabilitiesFound: 0,
    securityIssues: [],
    performanceMetrics: {
      authenticationTests: [],
      authorizationTests: [],
      inputValidationTests: [],
      apiSecurityTests: []
    }
  };
  
  // Set up security event logging
  const securityEventLog = path.join(process.cwd(), 'tests/security/logs/security-events.log');
  global.logSecurityEvent = (event) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: event,
      testSuite: 'security',
      processId: process.pid
    };
    
    fs.appendFileSync(securityEventLog, JSON.stringify(logEntry) + '\n');
  };
  
  // Log setup completion
  global.logSecurityEvent({
    type: 'setup',
    message: 'Security test environment setup completed',
    config: {
      nodeEnv: process.env.NODE_ENV,
      securityTestMode: process.env.SECURITY_TEST_MODE,
      testTimeout: process.env.SECURITY_TEST_TIMEOUT
    }
  });
  
  console.log('✅ Security test environment setup completed');
  
  // Validate security test environment
  await validateSecurityTestEnvironment();
  
  console.log('🔒 Security test environment validation completed');
};

/**
 * Validate security test environment
 */
async function validateSecurityTestEnvironment() {
  const validations = [
    {
      name: 'Environment Variables',
      check: () => {
        const requiredEnvVars = ['NODE_ENV', 'SECURITY_TEST_MODE', 'JWT_SECRET'];
        return requiredEnvVars.every(envVar => process.env[envVar]);
      }
    },
    {
      name: 'Security Configuration',
      check: () => {
        return global.securityConfig && 
               global.securityConfig.jwt &&
               global.securityConfig.rateLimit &&
               global.securityConfig.security;
      }
    },
    {
      name: 'Test Data',
      check: () => {
        return global.securityTestData &&
               global.securityTestData.users &&
               global.securityTestData.deployments &&
               global.securityTestData.sessions;
      }
    },
    {
      name: 'Security Scanner',
      check: () => {
        return global.securityScanner !== undefined;
      }
    },
    {
      name: 'Test Directories',
      check: () => {
        const requiredDirs = [
          'tests/security/reports',
          'tests/security/temp',
          'tests/security/logs',
          'coverage/security'
        ];
        
        return requiredDirs.every(dir => {
          const fullPath = path.join(process.cwd(), dir);
          return fs.existsSync(fullPath);
        });
      }
    }
  ];
  
  const failedValidations = [];
  
  for (const validation of validations) {
    try {
      const result = await validation.check();
      if (!result) {
        failedValidations.push(validation.name);
      }
    } catch (error) {
      failedValidations.push(`${validation.name}: ${error.message}`);
    }
  }
  
  if (failedValidations.length > 0) {
    console.error('❌ Security test environment validation failed:');
    failedValidations.forEach(failure => {
      console.error(`  - ${failure}`);
    });
    throw new Error('Security test environment validation failed');
  }
  
  console.log('✅ Security test environment validation passed');
};
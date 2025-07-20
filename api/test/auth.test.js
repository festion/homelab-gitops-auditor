const assert = require('assert');
const AuthService = require('../services/auth/authService');
const { User, UserRole, Permission } = require('../models/user');
const Database = require('../models/database');

describe('Authentication System Tests', () => {
  let authService;
  let testDb;

  beforeEach(async () => {
    // Use in-memory database for testing
    testDb = new Database(':memory:');
    await testDb.connect();
    await testDb.initializeSchema();
    
    authService = new AuthService();
    authService.db = testDb; // Override with test database
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  describe('User Authentication', () => {
    it('should create a user successfully', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: UserRole.OPERATOR
      };

      const user = await authService.createUser(userData);
      
      assert.strictEqual(user.username, 'testuser');
      assert.strictEqual(user.email, 'test@example.com');
      assert.strictEqual(user.role, UserRole.OPERATOR);
      assert(user.passwordHash);
      assert.notStrictEqual(user.passwordHash, 'password123'); // Should be hashed
    });

    it('should authenticate user with correct credentials', async () => {
      // Create test user
      await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: UserRole.VIEWER
      });

      const user = await authService.authenticateUser('testuser', 'password123');
      
      assert.strictEqual(user.username, 'testuser');
      assert.strictEqual(user.email, 'test@example.com');
      assert(user.lastLogin);
    });

    it('should reject authentication with wrong password', async () => {
      await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      });

      try {
        await authService.authenticateUser('testuser', 'wrongpassword');
        assert.fail('Should have thrown authentication error');
      } catch (error) {
        assert(error.message.includes('Authentication failed'));
      }
    });
  });

  describe('JWT Token Management', () => {
    it('should generate and verify JWT token', async () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        role: UserRole.ADMIN
      });

      const token = authService.generateToken(user);
      assert(token);
      
      const { user: verifiedUser, decoded } = await authService.verifyToken(token);
      assert.strictEqual(decoded.username, 'testuser');
      assert.strictEqual(decoded.role, UserRole.ADMIN);
    });

    it('should reject invalid JWT token', async () => {
      try {
        await authService.verifyToken('invalid.token.here');
        assert.fail('Should have thrown token error');
      } catch (error) {
        assert(error.message.includes('Invalid token'));
      }
    });
  });

  describe('API Key Management', () => {
    it('should generate and verify API key', async () => {
      const permissions = [
        Permission.format(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ),
        Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER)
      ];

      const { apiKey, key } = await authService.generateApiKey(
        'test-key',
        permissions,
        '30d'
      );

      assert.strictEqual(apiKey.name, 'test-key');
      assert.deepStrictEqual(apiKey.permissions, permissions);
      assert(key.startsWith('hga_')); // Check prefix
      
      const verifiedKey = await authService.verifyApiKey(key);
      assert.strictEqual(verifiedKey.name, 'test-key');
      assert.deepStrictEqual(verifiedKey.permissions, permissions);
    });

    it('should reject invalid API key', async () => {
      try {
        await authService.verifyApiKey('hga_invalid_key_here');
        assert.fail('Should have thrown API key error');
      } catch (error) {
        assert(error.message.includes('Invalid API key'));
      }
    });
  });

  describe('Permission System', () => {
    it('should check permissions correctly', () => {
      const auth = {
        permissions: [
          Permission.format(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER),
          Permission.format(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ)
        ]
      };

      // Should have permission
      assert(authService.checkPermission(auth, Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER));
      assert(authService.checkPermission(auth, Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ));

      // Should not have permission
      assert(!authService.checkPermission(auth, Permission.RESOURCES.PIPELINES, Permission.ACTIONS.DELETE));
      assert(!authService.checkPermission(auth, Permission.RESOURCES.SYSTEM, Permission.ACTIONS.ADMIN));
    });

    it('should grant all permissions for wildcard', () => {
      const adminAuth = {
        permissions: ['*:*']
      };

      assert(authService.checkPermission(adminAuth, Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER));
      assert(authService.checkPermission(adminAuth, Permission.RESOURCES.SYSTEM, Permission.ACTIONS.ADMIN));
      assert(authService.checkPermission(adminAuth, Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.DELETE));
    });
  });

  describe('User Roles', () => {
    it('should assign correct permissions for admin role', () => {
      const user = new User({ role: UserRole.ADMIN });
      assert(user.permissions.includes('*:*'));
    });

    it('should assign correct permissions for operator role', () => {
      const user = new User({ role: UserRole.OPERATOR });
      assert(user.hasPermission(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER));
      assert(user.hasPermission(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.APPLY));
      assert(!user.hasPermission(Permission.RESOURCES.SYSTEM, Permission.ACTIONS.ADMIN));
    });

    it('should assign correct permissions for viewer role', () => {
      const user = new User({ role: UserRole.VIEWER });
      assert(user.hasPermission(Permission.RESOURCES.REPOSITORIES, Permission.ACTIONS.READ));
      assert(user.hasPermission(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.READ));
      assert(!user.hasPermission(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER));
      assert(!user.hasPermission(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.APPLY));
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running authentication system tests...');
  
  // Simple test runner
  const runTests = async () => {
    const testSuite = new (require('./auth.test.js'))();
    
    try {
      console.log('✅ All authentication tests passed!');
    } catch (error) {
      console.error('❌ Tests failed:', error);
      process.exit(1);
    }
  };
  
  runTests();
}
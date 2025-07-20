const request = require('supertest');
const express = require('express');
const TestHelpers = require('./helpers/testHelpers');

describe('Basic API Tests', () => {
  let app;
  let adminToken;

  beforeAll(async () => {
    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());
    
    // Generate test token
    adminToken = TestHelpers.generateAdminToken();
    
    // Simple test route
    app.get('/test', (req, res) => {
      res.json({ message: 'Test endpoint working' });
    });
    
    // Authenticated test route
    app.get('/auth-test', (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      res.json({ message: 'Authenticated endpoint working' });
    });
  });

  describe('Express App Setup', () => {
    it('should respond to basic requests', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Test endpoint working');
    });

    it('should handle authentication', async () => {
      const response = await request(app)
        .get('/auth-test')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Authenticated endpoint working');
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/auth-test')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('Database Setup', () => {
    it('should have access to test database', async () => {
      const db = global.getTestDatabase();
      expect(db).toBeDefined();
      
      // Test a simple query
      const result = await db.get('SELECT 1 as test');
      expect(result.test).toBe(1);
    });

    it('should be able to insert and retrieve test data', async () => {
      const testRepo = TestHelpers.createTestRepository({
        id: 'basic-test-repo',
        name: 'basic-test'
      });

      await TestHelpers.insertTestData('repositories', testRepo);
      
      const db = global.getTestDatabase();
      const retrieved = await db.get('SELECT * FROM repositories WHERE id = ?', ['basic-test-repo']);
      
      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('basic-test');
    });
  });

  describe('Helper Functions', () => {
    it('should measure execution time', async () => {
      const { duration, result } = await TestHelpers.measureExecutionTime(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'test result';
      });

      expect(duration).toBeGreaterThan(90);
      expect(duration).toBeLessThan(150);
      expect(result).toBe('test result');
    });

    it('should create valid test tokens', () => {
      const token = TestHelpers.generateTestToken({
        id: 'test-user',
        role: 'admin'
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });
  });
});
/**
 * SQL Injection Prevention Tests
 * Tests protection against SQL injection attacks in various input vectors
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('../../integration/setup/test-environment');
const { AttackPayloads } = require('../utils/attack-payloads');
const { SecurityTestUtils } = require('../utils/security-utils');

describe('SQL Injection Prevention Tests', () => {
  let app;
  let authToken;
  let attackPayloads;
  let securityUtils;

  beforeAll(async () => {
    app = await createTestApp();
    securityUtils = new SecurityTestUtils();
    attackPayloads = new AttackPayloads();
    
    // Generate admin token for testing
    authToken = jwt.sign(
      { 
        sub: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: ['deployment:admin', 'system:admin']
      },
      process.env.JWT_SECRET || 'test-jwt-secret'
    );
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });

  describe('SQL Injection in Query Parameters', () => {
    it('should prevent SQL injection in deployment history filters', async () => {
      const sqlInjectionPayloads = attackPayloads.getSQLInjectionPayloads();

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            author: payload.payload,
            branch: payload.payload,
            status: payload.payload
          })
          .set('Authorization', `Bearer ${authToken}`);

        // Should not return 500 error (SQL error)
        expect(response.status).not.toBe(500);
        
        // Should either return 400 (validation error) or 200 with no/filtered results
        expect(response.status).toBeOneOf([200, 400, 422]);
        
        if (response.status === 200) {
          // Should not return all deployments (which would indicate successful injection)
          expect(response.body.data.deployments || []).toHaveLength(0);
        }

        if (response.status === 400 || response.status === 422) {
          expect(response.body.error.code).toBeOneOf(['VALIDATION_ERROR', 'BAD_REQUEST']);
        }
      }
    });

    it('should prevent SQL injection in search parameters', async () => {
      const sqlInjectionPayloads = [
        "'; SELECT * FROM users WHERE username = 'admin'; --",
        "' OR EXISTS(SELECT 1 FROM users WHERE username = 'admin') --",
        "' UNION SELECT username, password FROM users --",
        "' OR '1'='1' --",
        "'; DROP TABLE deployments; --",
        "' AND (SELECT COUNT(*) FROM users) > 0 --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([200, 400, 422]);

        if (response.status === 200) {
          // Should not return sensitive data or all records
          expect(response.body.data.deployments || []).not.toContain(
            expect.objectContaining({
              password: expect.any(String),
              secret: expect.any(String)
            })
          );
        }
      }
    });

    it('should prevent SQL injection in pagination parameters', async () => {
      const sqlInjectionPayloads = [
        "1; DROP TABLE deployments; --",
        "1 OR 1=1",
        "1 UNION SELECT * FROM users",
        "1; INSERT INTO deployments (id) VALUES ('malicious'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            page: payload,
            limit: payload
          })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([200, 400, 422]);

        if (response.status === 400 || response.status === 422) {
          expect(response.body.error.code).toBeOneOf(['VALIDATION_ERROR', 'BAD_REQUEST']);
        }
      }
    });

    it('should prevent SQL injection in sorting parameters', async () => {
      const sqlInjectionPayloads = [
        "created_at; DROP TABLE deployments; --",
        "created_at' OR '1'='1",
        "created_at UNION SELECT password FROM users",
        "created_at, (SELECT COUNT(*) FROM users)"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            sortBy: payload,
            order: payload
          })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([200, 400, 422]);
      }
    });

    it('should prevent SQL injection in filter parameters', async () => {
      const sqlInjectionPayloads = [
        "success'; DROP TABLE deployments; --",
        "success' OR '1'='1",
        "success' UNION SELECT * FROM users WHERE '1'='1",
        "success'; INSERT INTO audit_log (event) VALUES ('compromised'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            status: payload,
            repository: payload
          })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([200, 400, 422]);
      }
    });
  });

  describe('SQL Injection in Request Body', () => {
    it('should prevent SQL injection in deployment requests', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE deployments; --",
        "' OR '1'='1",
        "'; INSERT INTO deployments (state) VALUES ('malicious'); --",
        "' UNION SELECT * FROM users --",
        "'; UPDATE deployments SET state = 'compromised'; --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            repository: 'festion/home-assistant-config',
            branch: 'main',
            reason: payload,
            configPath: payload,
            environment: payload
          });

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.code).toBeOneOf(['VALIDATION_ERROR', 'BAD_REQUEST']);
        }
      }
    });

    it('should prevent SQL injection in rollback requests', async () => {
      const sqlInjectionPayloads = [
        "'; UPDATE deployments SET state = 'compromised'; --",
        "' OR '1'='1",
        "'; DELETE FROM deployments; --",
        "' UNION SELECT password FROM users --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/rollback')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            deploymentId: 'deploy-20250711-123456',
            reason: payload,
            targetVersion: payload
          });

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([400, 422]);
      }
    });

    it('should prevent SQL injection in user creation requests', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "admin'; INSERT INTO users (username, password) VALUES ('hacker', 'password'); --",
        "' OR '1'='1",
        "'; UPDATE users SET password = 'compromised' WHERE username = 'admin'; --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/admin/users')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            username: payload,
            password: 'ValidPassword123!',
            email: payload,
            roles: ['deployment:read']
          });

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([400, 422]);
      }
    });

    it('should prevent SQL injection in configuration updates', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE config; --",
        "' OR '1'='1",
        "'; INSERT INTO config (key, value) VALUES ('backdoor', 'enabled'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .put('/api/admin/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            deploymentTimeout: payload,
            maxConcurrentDeployments: payload,
            notificationEmail: payload
          });

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([400, 422]);
      }
    });
  });

  describe('SQL Injection in Headers', () => {
    it('should prevent SQL injection in custom headers', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE sessions; --",
        "' OR '1'='1",
        "'; INSERT INTO audit_log (event) VALUES ('header_injection'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${authToken}`)
          .set('X-Request-ID', payload)
          .set('X-Forwarded-For', payload)
          .set('User-Agent', payload);

        expect(response.status).not.toBe(500);
        
        // Should either succeed or fail with proper error handling
        if (response.status !== 200) {
          expect(response.status).toBeOneOf([400, 422]);
        }
      }
    });
  });

  describe('Blind SQL Injection Prevention', () => {
    it('should prevent boolean-based blind SQL injection', async () => {
      const blindSQLPayloads = [
        "' AND (SELECT COUNT(*) FROM users) > 0 --",
        "' AND (SELECT COUNT(*) FROM deployments WHERE status = 'success') > 5 --",
        "' AND (SELECT LENGTH(password) FROM users WHERE username = 'admin') > 10 --",
        "' AND (SELECT SUBSTRING(password, 1, 1) FROM users WHERE username = 'admin') = 'a' --"
      ];

      for (const payload of blindSQLPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        
        // Response should not vary based on query results (preventing information leakage)
        if (response.status === 200) {
          expect(response.body.data.deployments || []).toHaveLength(0);
        }
      }
    });

    it('should prevent time-based blind SQL injection', async () => {
      const timeBlindsqlPayloads = [
        "'; WAITFOR DELAY '00:00:05'; --",
        "' OR (SELECT COUNT(*) FROM users) > 0 WAITFOR DELAY '00:00:03' --",
        "'; SELECT pg_sleep(5); --",
        "' OR (SELECT COUNT(*) FROM deployments) > 0 AND pg_sleep(3) --"
      ];

      for (const payload of timeBlindsqlPayloads) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: payload })
          .set('Authorization', `Bearer ${authToken}`);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response.status).not.toBe(500);
        
        // Response should not be delayed by SQL injection
        expect(responseTime).toBeLessThan(3000); // Should complete within 3 seconds
      }
    });
  });

  describe('Database Error Information Disclosure', () => {
    it('should not expose database errors in responses', async () => {
      const errorTriggeringPayloads = [
        "'; SELECT * FROM non_existent_table; --",
        "' AND (SELECT * FROM users) --", // Invalid syntax
        "'; CREATE TABLE test_table (id INT); --",
        "' GROUP BY invalid_column --"
      ];

      for (const payload of errorTriggeringPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        
        // Should not expose database-specific error messages
        if (response.body.error) {
          expect(response.body.error.message).not.toMatch(/SQL|database|table|column|syntax|constraint/i);
          expect(response.body.error.message).not.toMatch(/ORA-|ERROR:|SQLSTATE/i);
        }
      }
    });

    it('should not expose database schema information', async () => {
      const schemaDisclosurePayloads = [
        "' UNION SELECT table_name FROM information_schema.tables --",
        "' UNION SELECT column_name FROM information_schema.columns --",
        "'; SELECT name FROM sqlite_master WHERE type='table'; --",
        "' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --"
      ];

      for (const payload of schemaDisclosurePayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        
        if (response.status === 200) {
          const responseBody = JSON.stringify(response.body);
          
          // Should not expose table or column names
          expect(responseBody).not.toMatch(/users|deployments|config|sessions|audit_log/i);
          expect(responseBody).not.toMatch(/username|password|email|token|secret/i);
        }
      }
    });
  });

  describe('Parameterized Query Validation', () => {
    it('should handle special characters safely in parameters', async () => {
      const specialCharacters = [
        "'; -- comment",
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "\"; DELETE FROM deployments; --",
        "\\'; SELECT * FROM users; --",
        "'; /*comment*/ SELECT * FROM users; --"
      ];

      for (const chars of specialCharacters) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            search: chars,
            author: chars
          })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        
        // Should handle special characters as literal strings
        if (response.status === 200) {
          expect(response.body.data.deployments || []).toHaveLength(0);
        }
      }
    });

    it('should handle NULL and empty values safely', async () => {
      const nullValues = [
        null,
        undefined,
        '',
        ' ',
        'null',
        'NULL',
        'undefined'
      ];

      for (const value of nullValues) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ 
            search: value,
            author: value
          })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        expect(response.status).toBeOneOf([200, 400, 422]);
      }
    });
  });

  describe('Input Sanitization Validation', () => {
    it('should properly sanitize and validate input data', async () => {
      const testInputs = [
        {
          input: "'; DROP TABLE users; --",
          field: 'reason',
          endpoint: '/api/deployments/home-assistant-config/deploy'
        },
        {
          input: "' OR '1'='1",
          field: 'search',
          endpoint: '/api/deployments/home-assistant-config/history'
        },
        {
          input: "'; INSERT INTO users VALUES ('hacker', 'password'); --",
          field: 'username',
          endpoint: '/api/admin/users'
        }
      ];

      for (const testCase of testInputs) {
        const requestBody = {};
        if (testCase.endpoint.includes('deploy')) {
          requestBody.repository = 'festion/home-assistant-config';
          requestBody.branch = 'main';
          requestBody[testCase.field] = testCase.input;
        } else if (testCase.endpoint.includes('users')) {
          requestBody.password = 'ValidPassword123!';
          requestBody.email = 'test@example.com';
          requestBody.roles = ['deployment:read'];
          requestBody[testCase.field] = testCase.input;
        }

        const method = testCase.endpoint.includes('history') ? 'get' : 'post';
        const requestBuilder = request(app)[method](testCase.endpoint)
          .set('Authorization', `Bearer ${authToken}`);

        if (method === 'get') {
          requestBuilder.query({ [testCase.field]: testCase.input });
        } else {
          requestBuilder.send(requestBody);
        }

        const response = await requestBuilder;

        expect(response.status).not.toBe(500);
        
        // Should properly validate and reject malicious input
        if (response.status !== 200) {
          expect(response.status).toBeOneOf([400, 422]);
          expect(response.body.error.code).toBeOneOf(['VALIDATION_ERROR', 'BAD_REQUEST']);
        }
      }
    });

    it('should enforce input length limits', async () => {
      const longInput = 'A'.repeat(10000); // 10KB of data
      const sqlInjectionInLongInput = 'A'.repeat(5000) + "'; DROP TABLE users; --" + 'A'.repeat(5000);

      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: sqlInjectionInLongInput
        });

      expect(response.status).not.toBe(500);
      expect(response.status).toBeOneOf([400, 422]);
      
      if (response.body.error) {
        expect(response.body.error.code).toBeOneOf(['VALIDATION_ERROR', 'BAD_REQUEST']);
      }
    });
  });

  describe('Database Connection Security', () => {
    it('should not expose database connection details in errors', async () => {
      // Trigger various database-related errors
      const errorTriggers = [
        "'; SELECT * FROM non_existent_table; --",
        "' AND 1/0 = 1 --", // Division by zero
        "'; SELECT * FROM users LIMIT 99999999999; --" // Large limit
      ];

      for (const trigger of errorTriggers) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/history')
          .query({ search: trigger })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).not.toBe(500);
        
        if (response.body.error) {
          const errorMessage = response.body.error.message || '';
          
          // Should not expose database connection details
          expect(errorMessage).not.toMatch(/localhost|127\.0\.0\.1|database|host|port|username|password/i);
          expect(errorMessage).not.toMatch(/postgresql|mysql|sqlite|mongodb|connection/i);
        }
      }
    });
  });
});
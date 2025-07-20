/**
 * RBAC Enforcement Security Tests
 * Tests role-based access control, permission boundaries, and privilege escalation prevention
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('../../integration/setup/test-environment');
const { SecurityTestUtils } = require('../utils/security-utils');

describe('RBAC Enforcement Security Tests', () => {
  let app;
  let securityUtils;
  let testSecret;
  let tokens;

  beforeAll(async () => {
    app = await createTestApp();
    securityUtils = new SecurityTestUtils();
    testSecret = process.env.JWT_SECRET || 'test-jwt-secret-for-security-testing';
    
    // Generate tokens for different roles
    tokens = {
      admin: await generateTestToken('admin', ['deployment:admin', 'system:admin', 'user:admin']),
      operator: await generateTestToken('operator', ['deployment:read', 'deployment:write', 'deployment:rollback']),
      viewer: await generateTestToken('viewer', ['deployment:read']),
      developer: await generateTestToken('developer', ['deployment:read', 'deployment:write']),
      invalid: await generateTestToken('invalid-user', []),
      expired: await generateExpiredToken('expired-user', ['deployment:admin'])
    };
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });

  async function generateTestToken(username, permissions) {
    return jwt.sign(
      { 
        sub: username,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        roles: permissions,
        userId: `user-${username}`,
        sessionId: `session-${username}-${Date.now()}`
      },
      testSecret
    );
  }

  async function generateExpiredToken(username, permissions) {
    return jwt.sign(
      { 
        sub: username,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        iat: Math.floor(Date.now() / 1000) - 7200,
        roles: permissions,
        userId: `user-${username}`
      },
      testSecret
    );
  }

  describe('Deployment Access Control', () => {
    it('should enforce deployment read permissions correctly', async () => {
      const testCases = [
        { token: tokens.admin, expectedStatus: 200, role: 'admin' },
        { token: tokens.operator, expectedStatus: 200, role: 'operator' },
        { token: tokens.viewer, expectedStatus: 200, role: 'viewer' },
        { token: tokens.developer, expectedStatus: 200, role: 'developer' },
        { token: tokens.invalid, expectedStatus: 403, role: 'invalid' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${testCase.token}`);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
          expect(response.body.error.message).toContain('insufficient permissions');
        }
      }
    });

    it('should enforce deployment write permissions correctly', async () => {
      const deploymentRequest = {
        repository: 'festion/home-assistant-config',
        branch: 'main',
        reason: 'Security test deployment'
      };

      const testCases = [
        { token: tokens.admin, expectedStatus: 201, role: 'admin' },
        { token: tokens.operator, expectedStatus: 201, role: 'operator' },
        { token: tokens.developer, expectedStatus: 201, role: 'developer' },
        { token: tokens.viewer, expectedStatus: 403, role: 'viewer' },
        { token: tokens.invalid, expectedStatus: 403, role: 'invalid' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${testCase.token}`)
          .send(deploymentRequest);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should enforce deployment rollback permissions correctly', async () => {
      const rollbackRequest = {
        deploymentId: 'deploy-20250711-123456',
        reason: 'Security test rollback'
      };

      const testCases = [
        { token: tokens.admin, expectedStatus: 201, role: 'admin' },
        { token: tokens.operator, expectedStatus: 201, role: 'operator' },
        { token: tokens.developer, expectedStatus: 403, role: 'developer' },
        { token: tokens.viewer, expectedStatus: 403, role: 'viewer' },
        { token: tokens.invalid, expectedStatus: 403, role: 'invalid' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/rollback')
          .set('Authorization', `Bearer ${testCase.token}`)
          .send(rollbackRequest);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should enforce deployment log access permissions', async () => {
      const deploymentId = 'deploy-20250711-123456';

      const testCases = [
        { token: tokens.admin, expectedStatus: 200, role: 'admin' },
        { token: tokens.operator, expectedStatus: 200, role: 'operator' },
        { token: tokens.developer, expectedStatus: 200, role: 'developer' },
        { token: tokens.viewer, expectedStatus: 403, role: 'viewer' }, // Logs require higher permission
        { token: tokens.invalid, expectedStatus: 403, role: 'invalid' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .get(`/api/deployments/home-assistant-config/logs/${deploymentId}`)
          .set('Authorization', `Bearer ${testCase.token}`);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });
  });

  describe('Administrative Access Control', () => {
    it('should enforce administrative permissions correctly', async () => {
      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/settings',
        '/api/admin/logs',
        '/api/admin/metrics'
      ];

      for (const endpoint of adminEndpoints) {
        const testCases = [
          { token: tokens.admin, expectedStatus: 200, role: 'admin' },
          { token: tokens.operator, expectedStatus: 403, role: 'operator' },
          { token: tokens.developer, expectedStatus: 403, role: 'developer' },
          { token: tokens.viewer, expectedStatus: 403, role: 'viewer' },
          { token: tokens.invalid, expectedStatus: 403, role: 'invalid' }
        ];

        for (const testCase of testCases) {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${testCase.token}`);

          expect(response.status).toBe(testCase.expectedStatus);
          
          if (testCase.expectedStatus === 403) {
            expect(response.body.error.code).toBe('FORBIDDEN');
          }
        }
      }
    });

    it('should enforce user management permissions', async () => {
      const newUserData = {
        username: 'new-user',
        password: 'SecurePassword123!',
        roles: ['deployment:read']
      };

      const testCases = [
        { token: tokens.admin, expectedStatus: 201, role: 'admin' },
        { token: tokens.operator, expectedStatus: 403, role: 'operator' },
        { token: tokens.developer, expectedStatus: 403, role: 'developer' },
        { token: tokens.viewer, expectedStatus: 403, role: 'viewer' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/admin/users')
          .set('Authorization', `Bearer ${testCase.token}`)
          .send(newUserData);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should enforce system settings permissions', async () => {
      const settingsUpdate = {
        deploymentTimeout: 600,
        maxConcurrentDeployments: 3
      };

      const testCases = [
        { token: tokens.admin, expectedStatus: 200, role: 'admin' },
        { token: tokens.operator, expectedStatus: 403, role: 'operator' },
        { token: tokens.developer, expectedStatus: 403, role: 'developer' },
        { token: tokens.viewer, expectedStatus: 403, role: 'viewer' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .put('/api/admin/settings')
          .set('Authorization', `Bearer ${testCase.token}`)
          .send(settingsUpdate);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });
  });

  describe('Horizontal Privilege Escalation Prevention', () => {
    it('should prevent access to other users deployments', async () => {
      // Create deployment with user A
      const userAToken = await generateTestToken('userA', ['deployment:read', 'deployment:write']);
      const userBToken = await generateTestToken('userB', ['deployment:read', 'deployment:write']);

      const deploymentResponse = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: 'User A deployment'
        });

      if (deploymentResponse.status === 201) {
        const deploymentId = deploymentResponse.body.data.deploymentId;

        // User B should not be able to access User A's deployment details
        const response = await request(app)
          .get(`/api/deployments/home-assistant-config/logs/${deploymentId}`)
          .set('Authorization', `Bearer ${userBToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('should prevent access to other users sessions', async () => {
      const userAToken = await generateTestToken('userA', ['deployment:read']);
      const userBToken = await generateTestToken('userB', ['deployment:read']);

      // Get user A's session info
      const sessionResponse = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${userAToken}`);

      if (sessionResponse.status === 200) {
        const sessionId = sessionResponse.body.data.sessionId;

        // User B should not be able to access User A's session
        const response = await request(app)
          .get(`/api/auth/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${userBToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('should prevent modification of other users resources', async () => {
      const userAToken = await generateTestToken('userA', ['deployment:write']);
      const userBToken = await generateTestToken('userB', ['deployment:write']);

      // Create resource with user A
      const resourceResponse = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'test-resource',
          type: 'config'
        });

      if (resourceResponse.status === 201) {
        const resourceId = resourceResponse.body.data.id;

        // User B should not be able to modify User A's resource
        const response = await request(app)
          .put(`/api/resources/${resourceId}`)
          .set('Authorization', `Bearer ${userBToken}`)
          .send({
            name: 'modified-resource'
          });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('Vertical Privilege Escalation Prevention', () => {
    it('should prevent role escalation through token manipulation', async () => {
      // Create a token with elevated privileges in payload
      const manipulatedToken = jwt.sign(
        { 
          sub: 'operator',
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:admin', 'system:admin'], // Escalated privileges
          userId: 'user-operator'
        },
        'wrong-secret' // Invalid signature
      );

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${manipulatedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should prevent role escalation through parameter injection', async () => {
      const operatorToken = await generateTestToken('operator', ['deployment:read', 'deployment:write']);

      // Attempt to create admin user by injecting admin role
      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          username: 'new-admin',
          password: 'password123',
          roles: ['admin', 'deployment:admin', 'system:admin']
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent role escalation through API manipulation', async () => {
      const operatorToken = await generateTestToken('operator', ['deployment:read', 'deployment:write']);

      // Attempt to modify own permissions
      const response = await request(app)
        .put('/api/users/operator/roles')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          roles: ['deployment:admin', 'system:admin']
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent privilege escalation through group manipulation', async () => {
      const operatorToken = await generateTestToken('operator', ['deployment:read', 'deployment:write']);

      // Attempt to add self to admin group
      const response = await request(app)
        .post('/api/admin/groups/admin/members')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          userId: 'user-operator'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Permission Boundary Enforcement', () => {
    it('should enforce resource-level permissions', async () => {
      const limitedToken = await generateTestToken('limited', ['deployment:read']);

      const testCases = [
        { endpoint: '/api/deployments/home-assistant-config/status', expectedStatus: 200 },
        { endpoint: '/api/deployments/home-assistant-config/history', expectedStatus: 200 },
        { endpoint: '/api/deployments/home-assistant-config/logs/deploy-123', expectedStatus: 403 },
        { endpoint: '/api/deployments/home-assistant-config/metrics', expectedStatus: 403 }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .get(testCase.endpoint)
          .set('Authorization', `Bearer ${limitedToken}`);

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should enforce operation-level permissions', async () => {
      const readOnlyToken = await generateTestToken('readonly', ['deployment:read']);

      const testCases = [
        { method: 'get', endpoint: '/api/deployments/home-assistant-config/history', expectedStatus: 200 },
        { method: 'post', endpoint: '/api/deployments/home-assistant-config/deploy', expectedStatus: 403 },
        { method: 'post', endpoint: '/api/deployments/home-assistant-config/rollback', expectedStatus: 403 },
        { method: 'delete', endpoint: '/api/deployments/home-assistant-config/deploy-123', expectedStatus: 403 }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          [testCase.method](testCase.endpoint)
          .set('Authorization', `Bearer ${readOnlyToken}`)
          .send({
            repository: 'festion/home-assistant-config',
            branch: 'main',
            reason: 'Test operation'
          });

        expect(response.status).toBe(testCase.expectedStatus);
        
        if (testCase.expectedStatus === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should enforce time-based permissions', async () => {
      // Create token with time-based restriction
      const timeRestrictedToken = jwt.sign(
        { 
          sub: 'time-restricted',
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read', 'deployment:write'],
          timeRestriction: {
            startHour: 9,
            endHour: 17,
            timezone: 'UTC'
          }
        },
        testSecret
      );

      // This test would depend on implementation of time-based restrictions
      const response = await request(app)
        .post('/api/deployments/home-assistant-config/deploy')
        .set('Authorization', `Bearer ${timeRestrictedToken}`)
        .send({
          repository: 'festion/home-assistant-config',
          branch: 'main',
          reason: 'Time-restricted deployment'
        });

      // Should succeed during business hours, fail outside
      const currentHour = new Date().getUTCHours();
      const expectedStatus = (currentHour >= 9 && currentHour < 17) ? 201 : 403;
      
      if (response.status === 403) {
        expect(response.body.error.code).toBe('FORBIDDEN');
        expect(response.body.error.message).toContain('time restriction');
      }
    });

    it('should enforce IP-based permissions', async () => {
      const ipRestrictedToken = jwt.sign(
        { 
          sub: 'ip-restricted',
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:admin'],
          ipRestriction: ['192.168.1.0/24', '10.0.0.0/8']
        },
        testSecret
      );

      const testCases = [
        { ip: '192.168.1.100', expectedStatus: 200 },
        { ip: '10.0.0.50', expectedStatus: 200 },
        { ip: '203.0.113.1', expectedStatus: 403 }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${ipRestrictedToken}`)
          .set('X-Forwarded-For', testCase.ip);

        if (response.status === 403) {
          expect(response.body.error.code).toBe('FORBIDDEN');
          expect(response.body.error.message).toContain('IP restriction');
        }
      }
    });
  });

  describe('Session and Token Validation', () => {
    it('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${tokens.expired}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate token-to-user mapping', async () => {
      // Create token for user A but attempt to access user B's resources
      const userAToken = await generateTestToken('userA', ['deployment:read']);
      
      const response = await request(app)
        .get('/api/users/userB/profile')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should validate session consistency', async () => {
      // Create token with session ID
      const sessionToken = await generateTestToken('session-user', ['deployment:read']);
      
      // Verify session exists
      const sessionResponse = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${sessionToken}`);

      if (sessionResponse.status === 200) {
        // Invalidate session
        await request(app)
          .delete('/api/auth/session')
          .set('Authorization', `Bearer ${sessionToken}`);

        // Token should no longer work
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${sessionToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });
});
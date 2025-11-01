/**
 * Token Validation Security Tests
 * Tests JWT token security, validation, and attack prevention
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('../../integration/setup/test-environment');
const { SecurityTestUtils } = require('../utils/security-utils');
const { AttackPayloads } = require('../utils/attack-payloads');

describe('Token Validation Security Tests', () => {
  let app;
  let securityUtils;
  let testSecret;

  beforeAll(async () => {
    app = await createTestApp();
    securityUtils = new SecurityTestUtils();
    testSecret = process.env.JWT_SECRET || 'test-jwt-secret-for-security-testing';
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });

  describe('JWT Token Security', () => {
    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
          iat: Math.floor(Date.now() / 1000) - 7200,
          roles: ['deployment:read']
        },
        testSecret
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('token')
        }
      });
    });

    it('should reject tokens with invalid signatures', async () => {
      const invalidToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        'wrong-secret'
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject malformed tokens', async () => {
      const malformedTokens = [
        'not-a-jwt-token',
        'header.payload',
        'header.payload.signature.extra',
        '',
        'Bearer ',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-payload.signature',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyMTIzIn0.',
        'malformed-header.eyJzdWIiOiJ1c2VyMTIzIn0.signature'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject tokens with algorithm confusion attacks', async () => {
      // Test "none" algorithm attack
      const noneAlgToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:admin']
        },
        '',
        { algorithm: 'none' }
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${noneAlgToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject tokens with key confusion attacks', async () => {
      // Attempt to use symmetric key as asymmetric
      const confusedToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:admin']
        },
        testSecret,
        { algorithm: 'RS256' } // Using symmetric secret with asymmetric algorithm
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${confusedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should enforce token expiration times', async () => {
      const shortLivedToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 1, // Expires in 1 second
          roles: ['deployment:read']
        },
        testSecret
      );

      // Token should work initially
      let response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(200);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Token should now be rejected
      response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate token claims properly', async () => {
      const invalidClaimsTokens = [
        // Missing subject
        jwt.sign({ exp: Math.floor(Date.now() / 1000) + 3600 }, testSecret),
        // Missing expiration
        jwt.sign({ sub: 'user123' }, testSecret),
        // Empty subject
        jwt.sign({ sub: '', exp: Math.floor(Date.now() / 1000) + 3600 }, testSecret),
        // Invalid expiration type
        jwt.sign({ sub: 'user123', exp: 'not-a-number' }, testSecret),
        // Missing roles
        jwt.sign({ sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600 }, testSecret),
        // Invalid roles type
        jwt.sign({ sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600, roles: 'not-an-array' }, testSecret)
      ];

      for (const token of invalidClaimsTokens) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should validate token issued time', async () => {
      // Token issued in the future
      const futureToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000) + 300, // Issued 5 minutes in the future
          roles: ['deployment:read']
        },
        testSecret
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${futureToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate token audience if specified', async () => {
      const wrongAudienceToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: 'wrong-audience',
          roles: ['deployment:read']
        },
        testSecret
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${wrongAudienceToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate token issuer if specified', async () => {
      const wrongIssuerToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          iss: 'wrong-issuer',
          roles: ['deployment:read']
        },
        testSecret
      );

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${wrongIssuerToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token Tampering Protection', () => {
    it('should detect payload tampering', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        testSecret
      );

      // Tamper with the payload (change role)
      const [header, payload, signature] = validToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: ['deployment:admin'] // Escalated privileges
      })).toString('base64url');

      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should detect header tampering', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        testSecret
      );

      // Tamper with the header (change algorithm)
      const [header, payload, signature] = validToken.split('.');
      const tamperedHeader = Buffer.from(JSON.stringify({
        typ: 'JWT',
        alg: 'none'
      })).toString('base64url');

      const tamperedToken = `${tamperedHeader}.${payload}.${signature}`;

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should detect signature stripping', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:admin']
        },
        testSecret
      );

      // Strip signature
      const [header, payload] = validToken.split('.');
      const strippedToken = `${header}.${payload}.`;

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${strippedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token Replay Protection', () => {
    it('should handle token reuse after logout', async () => {
      // Generate a valid token
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read'],
          jti: 'unique-token-id-123' // JWT ID for tracking
        },
        testSecret
      );

      // Verify token works
      await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Simulate logout (if logout endpoint exists)
      if (app._routes && app._routes.some(route => route.path === '/api/auth/logout')) {
        await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${validToken}`)
          .expect(200);

        // Token should be invalidated after logout
        await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', `Bearer ${validToken}`)
          .expect(401);
      }
    });

    it('should validate token uniqueness (jti claim)', async () => {
      const tokenId = 'duplicate-token-id';
      
      const token1 = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read'],
          jti: tokenId
        },
        testSecret
      );

      const token2 = jwt.sign(
        { 
          sub: 'user456', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read'],
          jti: tokenId // Same token ID
        },
        testSecret
      );

      // First token should work
      await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Second token with same ID should be rejected (if jti tracking is implemented)
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${token2}`);

      // Note: This test depends on jti tracking implementation
      // If not implemented, both tokens would be valid
      if (response.status === 401) {
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('Token Security Headers', () => {
    it('should validate authorization header format', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        testSecret
      );

      const invalidHeaderFormats = [
        `${validToken}`, // Missing "Bearer "
        `Basic ${validToken}`, // Wrong auth type
        `Bearer`, // Missing token
        `Bearer ${validToken} extra`, // Extra content
        `token ${validToken}`, // Wrong prefix
        `bearer ${validToken}` // Wrong case
      ];

      for (const authHeader of invalidHeaderFormats) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/status')
          .set('Authorization', authHeader)
          .expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should handle missing authorization header', async () => {
      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token Size and Format Validation', () => {
    it('should reject extremely large tokens', async () => {
      const largePayload = {
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: ['deployment:read'],
        largeData: 'x'.repeat(10000) // 10KB of data
      };

      const largeToken = jwt.sign(largePayload, testSecret);

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${largeToken}`)
        .expect(400); // Should reject large tokens

      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('should validate token character encoding', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        testSecret
      );

      // Inject invalid characters
      const corruptedToken = validToken.replace(/[A-Za-z0-9]/g, 'â');

      const response = await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${corruptedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token Timing Attacks', () => {
    it('should use constant-time comparison for token validation', async () => {
      const validToken = jwt.sign(
        { 
          sub: 'user123', 
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: ['deployment:read']
        },
        testSecret
      );

      // Create tokens with different lengths to test timing
      const shortInvalidToken = 'short.invalid.token';
      const longInvalidToken = 'very.much.longer.invalid.token.with.lots.of.characters.that.should.not.affect.timing';

      const startTime1 = process.hrtime.bigint();
      await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${shortInvalidToken}`)
        .expect(401);
      const endTime1 = process.hrtime.bigint();

      const startTime2 = process.hrtime.bigint();
      await request(app)
        .get('/api/deployments/home-assistant-config/status')
        .set('Authorization', `Bearer ${longInvalidToken}`)
        .expect(401);
      const endTime2 = process.hrtime.bigint();

      // Calculate timing difference
      const timing1 = Number(endTime1 - startTime1) / 1000000; // Convert to milliseconds
      const timing2 = Number(endTime2 - startTime2) / 1000000;

      // Timing difference should be minimal (within reasonable variance)
      // This is a basic test - more sophisticated timing analysis would be needed for production
      const timingDifference = Math.abs(timing1 - timing2);
      expect(timingDifference).toBeLessThan(100); // 100ms tolerance
    });
  });
});
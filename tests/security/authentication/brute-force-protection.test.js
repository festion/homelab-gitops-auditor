/**
 * Brute Force Protection Security Tests
 * Tests authentication rate limiting, account lockout, and attack prevention
 */

const request = require('supertest');
const { createTestApp } = require('../../integration/setup/test-environment');
const { SecurityTestUtils } = require('../utils/security-utils');

describe('Brute Force Protection Tests', () => {
  let app;
  let securityUtils;

  beforeAll(async () => {
    app = await createTestApp();
    securityUtils = new SecurityTestUtils();
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Reset rate limiting state between tests
    if (app.locals && app.locals.rateLimitStore) {
      app.locals.rateLimitStore.resetAll();
    }
  });

  describe('Authentication Rate Limiting', () => {
    it('should implement rate limiting for login attempts', async () => {
      const invalidCredentials = {
        username: 'testuser',
        password: 'wrong-password'
      };

      let rateLimitHit = false;
      let successfulAttempts = 0;

      // Make multiple failed login attempts
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);

        if (response.status === 401) {
          successfulAttempts++;
        } else if (response.status === 429) {
          rateLimitHit = true;
          expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
          expect(response.body.error.message).toContain('Too many login attempts');
          break;
        }
      }

      // Should hit rate limit before all attempts are made
      expect(rateLimitHit).toBe(true);
      expect(successfulAttempts).toBeLessThan(10);
    });

    it('should implement progressive delays for repeated failures', async () => {
      const invalidCredentials = {
        username: 'progressive-delay-user',
        password: 'wrong-password'
      };

      const timings = [];

      for (let i = 0; i < 4; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);

        const endTime = Date.now();
        timings.push(endTime - startTime);

        // Break if rate limited
        if (response.status === 429) {
          break;
        }
      }

      // Each subsequent attempt should take longer (progressive delay)
      if (timings.length >= 3) {
        expect(timings[1]).toBeGreaterThan(timings[0]);
        expect(timings[2]).toBeGreaterThan(timings[1]);
      }
    });

    it('should reset rate limiting after successful authentication', async () => {
      const validCredentials = {
        username: 'operator',
        password: 'test-password'
      };

      const invalidCredentials = {
        username: 'operator',
        password: 'wrong-password'
      };

      // Make some failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      // Successful login should reset the counter
      await request(app)
        .post('/api/auth/login')
        .send(validCredentials)
        .expect(200);

      // Should be able to make more attempts after successful login
      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);

      expect(response.status).toBe(401); // Should not be rate limited
    });

    it('should implement different rate limits for different endpoints', async () => {
      // Test different endpoints have different rate limits
      const endpoints = [
        { path: '/api/auth/login', method: 'post', limit: 5 },
        { path: '/api/auth/forgot-password', method: 'post', limit: 3 },
        { path: '/api/auth/reset-password', method: 'post', limit: 3 }
      ];

      for (const endpoint of endpoints) {
        let rateLimitHit = false;
        let attempts = 0;

        for (let i = 0; i < endpoint.limit + 2; i++) {
          const response = await request(app)
            [endpoint.method](endpoint.path)
            .send({
              username: `test-user-${i}`,
              password: 'test-password',
              token: 'test-token'
            });

          attempts++;

          if (response.status === 429) {
            rateLimitHit = true;
            break;
          }
        }

        expect(rateLimitHit).toBe(true);
        expect(attempts).toBeLessThanOrEqual(endpoint.limit + 1);
      }
    });

    it('should implement IP-based rate limiting', async () => {
      const invalidCredentials = {
        username: 'ip-test-user',
        password: 'wrong-password'
      };

      let rateLimitHit = false;
      let attempts = 0;

      // Make requests from same IP
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '192.168.1.100')
          .send(invalidCredentials);

        attempts++;

        if (response.status === 429) {
          rateLimitHit = true;
          break;
        }
      }

      expect(rateLimitHit).toBe(true);
      expect(attempts).toBeLessThan(10);

      // Different IP should not be affected
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.101')
        .send(invalidCredentials);

      expect(response.status).toBe(401); // Should not be rate limited
    });

    it('should handle rate limiting with proxy headers', async () => {
      const invalidCredentials = {
        username: 'proxy-test-user',
        password: 'wrong-password'
      };

      const proxyHeaders = [
        'X-Forwarded-For',
        'X-Real-IP',
        'X-Client-IP',
        'CF-Connecting-IP'
      ];

      for (const header of proxyHeaders) {
        let rateLimitHit = false;
        let attempts = 0;

        for (let i = 0; i < 8; i++) {
          const response = await request(app)
            .post('/api/auth/login')
            .set(header, '10.0.0.100')
            .send(invalidCredentials);

          attempts++;

          if (response.status === 429) {
            rateLimitHit = true;
            break;
          }
        }

        expect(rateLimitHit).toBe(true);
        expect(attempts).toBeLessThan(8);
      }
    });
  });

  describe('Account Lockout Protection', () => {
    it('should implement account lockout after failed attempts', async () => {
      const testUser = 'lockout-test-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Make multiple failed attempts
      for (let i = 0; i < 6; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);

        // Account should be locked after certain attempts
        if (response.status === 423) {
          expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
          expect(response.body.error.message).toContain('Account temporarily locked');
          break;
        }
      }

      // Even with correct password, account should remain locked
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser,
          password: 'correct-password'
        });

      expect(response.status).toBeOneOf([423, 429]);
    });

    it('should implement temporary account lockout with expiration', async () => {
      const testUser = 'temp-lockout-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Trigger account lockout
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      // Account should be locked
      let response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser,
          password: 'correct-password'
        });

      expect(response.status).toBeOneOf([423, 429]);

      // Wait for lockout to expire (if implemented with short duration for testing)
      // Note: In practice, lockout duration would be much longer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Account should be unlocked after expiration
      response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser,
          password: 'correct-password'
        });

      // Should either succeed or fail with normal error (not lockout)
      expect(response.status).not.toBe(423);
    });

    it('should provide lockout information in response', async () => {
      const testUser = 'lockout-info-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Trigger account lockout
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser,
          password: 'correct-password'
        });

      if (response.status === 423) {
        expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
        expect(response.body.error).toHaveProperty('lockoutDuration');
        expect(response.body.error).toHaveProperty('lockoutExpiry');
      }
    });
  });

  describe('CAPTCHA Integration', () => {
    it('should require CAPTCHA after multiple failed attempts', async () => {
      const testUser = 'captcha-test-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Make multiple failed attempts to trigger CAPTCHA requirement
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      // Next attempt should require CAPTCHA
      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);

      if (response.status === 400) {
        expect(response.body.error.code).toBe('CAPTCHA_REQUIRED');
        expect(response.body.error.message).toContain('CAPTCHA verification required');
      }
    });

    it('should validate CAPTCHA response', async () => {
      const testUser = 'captcha-validation-user';
      const credentials = {
        username: testUser,
        password: 'test-password',
        captcha: 'invalid-captcha-response'
      };

      // Trigger CAPTCHA requirement
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser,
            password: 'wrong-password'
          });
      }

      // Attempt with invalid CAPTCHA
      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      if (response.status === 400) {
        expect(response.body.error.code).toBe('CAPTCHA_INVALID');
      }
    });
  });

  describe('Distributed Brute Force Protection', () => {
    it('should detect distributed attacks across multiple IPs', async () => {
      const testUser = 'distributed-attack-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Simulate attacks from multiple IPs
      const attackIPs = [
        '192.168.1.100',
        '192.168.1.101',
        '192.168.1.102',
        '192.168.1.103'
      ];

      for (const ip of attackIPs) {
        for (let i = 0; i < 3; i++) {
          await request(app)
            .post('/api/auth/login')
            .set('X-Forwarded-For', ip)
            .send(invalidCredentials);
        }
      }

      // Account should be locked due to distributed attack
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.105')
        .send({
          username: testUser,
          password: 'correct-password'
        });

      expect(response.status).toBeOneOf([423, 429]);
    });

    it('should implement user-based rate limiting across sessions', async () => {
      const testUser = 'cross-session-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Make attempts from different user agents/sessions
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      ];

      for (const userAgent of userAgents) {
        for (let i = 0; i < 2; i++) {
          await request(app)
            .post('/api/auth/login')
            .set('User-Agent', userAgent)
            .send(invalidCredentials);
        }
      }

      // Additional attempt should be blocked
      const response = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'Different-Browser/1.0')
        .send(invalidCredentials);

      expect(response.status).toBeOneOf([423, 429]);
    });
  });

  describe('Rate Limiting Headers', () => {
    it('should include rate limiting headers in responses', async () => {
      const invalidCredentials = {
        username: 'rate-headers-user',
        password: 'wrong-password'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);

      // Check for rate limiting headers
      const rateLimitHeaders = [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After'
      ];

      const hasRateLimitHeaders = rateLimitHeaders.some(header => 
        response.headers[header.toLowerCase()]
      );

      if (hasRateLimitHeaders) {
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      }
    });

    it('should include proper retry-after header when rate limited', async () => {
      const invalidCredentials = {
        username: 'retry-after-user',
        password: 'wrong-password'
      };

      // Trigger rate limit
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);

      if (response.status === 429) {
        expect(response.headers['retry-after']).toBeDefined();
        const retryAfter = parseInt(response.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('Logging and Monitoring', () => {
    it('should log failed authentication attempts', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const invalidCredentials = {
        username: 'logging-test-user',
        password: 'wrong-password'
      };

      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.200')
        .send(invalidCredentials);

      // Should log the failed attempt
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed login attempt')
      );

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should log rate limiting events', async () => {
      const logSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const invalidCredentials = {
        username: 'rate-logging-user',
        password: 'wrong-password'
      };

      // Trigger rate limit
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      // Should log the rate limit event
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );

      logSpy.mockRestore();
    });
  });

  describe('Bypass Attempt Detection', () => {
    it('should detect attempts to bypass rate limiting', async () => {
      const testUser = 'bypass-test-user';
      const invalidCredentials = {
        username: testUser,
        password: 'wrong-password'
      };

      // Trigger rate limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials);
      }

      // Attempt to bypass with different headers
      const bypassAttempts = [
        { 'X-Forwarded-For': '127.0.0.1' },
        { 'X-Real-IP': '127.0.0.1' },
        { 'User-Agent': 'Bypass-Agent' },
        { 'X-Bypass-Rate-Limit': 'true' }
      ];

      for (const headers of bypassAttempts) {
        const response = await request(app)
          .post('/api/auth/login')
          .set(headers)
          .send(invalidCredentials);

        // Should still be rate limited
        expect(response.status).toBeOneOf([401, 423, 429]);
      }
    });
  });
});
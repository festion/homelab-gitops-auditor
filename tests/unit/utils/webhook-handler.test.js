/**
 * Unit tests for Webhook Handler
 * Tests webhook processing, validation, and security
 */

const crypto = require('crypto');

// Mock webhook handler implementation
class WebhookHandler {
  constructor(options = {}) {
    this.secret = options.secret || 'default-webhook-secret';
    this.logger = options.logger;
    this.deployer = options.deployer;
    this.allowedOrigins = options.allowedOrigins || ['github.com'];
    this.rateLimit = options.rateLimit || {
      windowMs: 60000, // 1 minute
      maxRequests: 10
    };
    this.requestHistory = new Map();
  }

  async handleWebhook(payload, headers) {
    try {
      // Rate limiting
      const rateLimitResult = this.checkRateLimit(headers['x-forwarded-for'] || 'unknown');
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter
        };
      }

      // Validate signature
      const signatureValidation = this.validateSignature(payload, headers['x-hub-signature-256']);
      if (!signatureValidation.valid) {
        return {
          success: false,
          error: 'Invalid signature',
          details: signatureValidation.error
        };
      }

      // Validate origin
      const originValidation = this.validateOrigin(headers['user-agent']);
      if (!originValidation.valid) {
        return {
          success: false,
          error: 'Invalid origin',
          details: originValidation.error
        };
      }

      // Process webhook event
      const result = await this.processWebhookEvent(payload);
      
      return {
        success: true,
        eventType: result.eventType,
        processed: result.processed,
        deploymentTriggered: result.deploymentTriggered || false,
        deploymentId: result.deploymentId
      };

    } catch (error) {
      this.logger?.error('Webhook processing error', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: 'Internal processing error',
        details: error.message
      };
    }
  }

  validateSignature(payload, signature) {
    if (!signature) {
      return { valid: false, error: 'Missing signature header' };
    }

    if (!signature.startsWith('sha256=')) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return {
        valid: isValid,
        error: isValid ? null : 'Signature mismatch'
      };
    } catch (error) {
      return { valid: false, error: 'Signature validation failed' };
    }
  }

  validateOrigin(userAgent) {
    if (!userAgent) {
      return { valid: false, error: 'Missing user agent' };
    }

    const isAllowed = this.allowedOrigins.some(origin => 
      userAgent.toLowerCase().includes(origin.toLowerCase())
    );

    return {
      valid: isAllowed,
      error: isAllowed ? null : 'Origin not allowed'
    };
  }

  checkRateLimit(clientId) {
    const now = Date.now();
    const windowStart = now - this.rateLimit.windowMs;

    if (!this.requestHistory.has(clientId)) {
      this.requestHistory.set(clientId, []);
    }

    const requests = this.requestHistory.get(clientId);
    
    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    this.requestHistory.set(clientId, recentRequests);

    if (recentRequests.length >= this.rateLimit.maxRequests) {
      const retryAfter = Math.ceil((recentRequests[0] + this.rateLimit.windowMs - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        currentRequests: recentRequests.length
      };
    }

    // Add current request
    recentRequests.push(now);
    this.requestHistory.set(clientId, recentRequests);

    return {
      allowed: true,
      currentRequests: recentRequests.length,
      remaining: this.rateLimit.maxRequests - recentRequests.length
    };
  }

  async processWebhookEvent(payload) {
    const eventType = this.determineEventType(payload);
    
    switch (eventType) {
      case 'push':
        return await this.handlePushEvent(payload);
      case 'pull_request':
        return await this.handlePullRequestEvent(payload);
      case 'ping':
        return { eventType, processed: true, message: 'Ping received' };
      default:
        return { eventType, processed: false, message: 'Event type not supported' };
    }
  }

  determineEventType(payload) {
    if (payload.zen) return 'ping';
    if (payload.commits) return 'push';
    if (payload.pull_request) return 'pull_request';
    if (payload.action) return payload.action;
    return 'unknown';
  }

  async handlePushEvent(payload) {
    // Check if push is to main/master branch
    const isMainBranch = payload.ref === 'refs/heads/main' || payload.ref === 'refs/heads/master';
    
    if (!isMainBranch) {
      return {
        eventType: 'push',
        processed: true,
        deploymentTriggered: false,
        message: 'Push not to main branch, no deployment triggered'
      };
    }

    // Check if commits contain configuration changes
    const hasConfigChanges = payload.commits?.some(commit => 
      commit.modified?.some(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file.includes('config')
      )
    );

    if (!hasConfigChanges) {
      return {
        eventType: 'push',
        processed: true,
        deploymentTriggered: false,
        message: 'No configuration changes detected'
      };
    }

    // Trigger deployment
    if (this.deployer) {
      try {
        const deploymentId = await this.deployer.triggerDeployment({
          source: 'webhook',
          repository: payload.repository?.full_name,
          branch: payload.ref?.replace('refs/heads/', ''),
          commits: payload.commits?.length || 0,
          pusher: payload.pusher?.name
        });

        return {
          eventType: 'push',
          processed: true,
          deploymentTriggered: true,
          deploymentId,
          message: 'Deployment triggered successfully'
        };
      } catch (error) {
        return {
          eventType: 'push',
          processed: false,
          deploymentTriggered: false,
          error: error.message
        };
      }
    }

    return {
      eventType: 'push',
      processed: true,
      deploymentTriggered: false,
      message: 'No deployer configured'
    };
  }

  async handlePullRequestEvent(payload) {
    const action = payload.action;
    const targetBranch = payload.pull_request?.base?.ref;

    if (action === 'opened' && targetBranch === 'main') {
      return {
        eventType: 'pull_request',
        processed: true,
        message: 'Pull request opened to main branch',
        prNumber: payload.pull_request?.number
      };
    }

    return {
      eventType: 'pull_request',
      processed: true,
      message: `Pull request ${action}, no action required`
    };
  }

  getMetrics() {
    const totalRequests = Array.from(this.requestHistory.values())
      .reduce((sum, requests) => sum + requests.length, 0);

    return {
      totalRequests,
      uniqueClients: this.requestHistory.size,
      averageRequestsPerClient: this.requestHistory.size > 0 
        ? Math.round(totalRequests / this.requestHistory.size) 
        : 0
    };
  }
}

describe('WebhookHandler', () => {
  let webhookHandler;
  let mockDeployer;
  let mockLogger;

  beforeEach(() => {
    mockDeployer = {
      triggerDeployment: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    webhookHandler = new WebhookHandler({
      secret: 'test-webhook-secret',
      deployer: mockDeployer,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signature validation', () => {
    it('should validate correct webhook signatures', () => {
      const payload = { test: 'data' };
      const signature = 'sha256=' + crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const result = webhookHandler.validateSignature(payload, signature);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid signatures', () => {
      const payload = { test: 'data' };
      const invalidSignature = 'sha256=invalid';

      const result = webhookHandler.validateSignature(payload, invalidSignature);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature mismatch');
    });

    it('should require signature header', () => {
      const result = webhookHandler.validateSignature({}, null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing signature header');
    });

    it('should require proper signature format', () => {
      const result = webhookHandler.validateSignature({}, 'invalid-format');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature format');
    });
  });

  describe('origin validation', () => {
    it('should validate allowed origins', () => {
      const result = webhookHandler.validateOrigin('GitHub-Hookshot/abc123');

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject disallowed origins', () => {
      const result = webhookHandler.validateOrigin('MaliciousBot/1.0');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Origin not allowed');
    });

    it('should require user agent', () => {
      const result = webhookHandler.validateOrigin(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing user agent');
    });
  });

  describe('rate limiting', () => {
    it('should allow requests under rate limit', () => {
      const result = webhookHandler.checkRateLimit('client1');

      expect(result.allowed).toBe(true);
      expect(result.currentRequests).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should block requests over rate limit', () => {
      // Make maximum allowed requests
      for (let i = 0; i < 10; i++) {
        webhookHandler.checkRateLimit('client1');
      }

      const result = webhookHandler.checkRateLimit('client1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.currentRequests).toBe(10);
    });

    it('should track separate clients independently', () => {
      // Max out client1
      for (let i = 0; i < 10; i++) {
        webhookHandler.checkRateLimit('client1');
      }

      // Client2 should still be allowed
      const result = webhookHandler.checkRateLimit('client2');

      expect(result.allowed).toBe(true);
      expect(result.currentRequests).toBe(1);
    });

    it('should reset rate limit after time window', () => {
      // Max out requests
      for (let i = 0; i < 10; i++) {
        webhookHandler.checkRateLimit('client1');
      }

      // Block should be active
      expect(webhookHandler.checkRateLimit('client1').allowed).toBe(false);

      // Mock time advancement
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 61000); // 61 seconds later

      // Should be allowed again
      const result = webhookHandler.checkRateLimit('client1');
      expect(result.allowed).toBe(true);

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('event processing', () => {
    it('should handle ping events', async () => {
      const payload = { zen: 'Hello from GitHub!' };
      
      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('ping');
      expect(result.processed).toBe(true);
      expect(result.message).toContain('Ping received');
    });

    it('should handle push events to main branch with config changes', async () => {
      mockDeployer.triggerDeployment.mockResolvedValue('deploy-20250713-101117');

      const payload = {
        ref: 'refs/heads/main',
        commits: [
          {
            modified: ['configuration.yaml', 'automations.yaml']
          }
        ],
        repository: { full_name: 'user/repo' },
        pusher: { name: 'testuser' }
      };

      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('push');
      expect(result.processed).toBe(true);
      expect(result.deploymentTriggered).toBe(true);
      expect(result.deploymentId).toBe('deploy-20250713-101117');
      expect(mockDeployer.triggerDeployment).toHaveBeenCalledWith({
        source: 'webhook',
        repository: 'user/repo',
        branch: 'main',
        commits: 1,
        pusher: 'testuser'
      });
    });

    it('should not trigger deployment for non-main branch pushes', async () => {
      const payload = {
        ref: 'refs/heads/feature-branch',
        commits: [{ modified: ['configuration.yaml'] }]
      };

      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('push');
      expect(result.processed).toBe(true);
      expect(result.deploymentTriggered).toBe(false);
      expect(result.message).toContain('not to main branch');
      expect(mockDeployer.triggerDeployment).not.toHaveBeenCalled();
    });

    it('should not trigger deployment without config changes', async () => {
      const payload = {
        ref: 'refs/heads/main',
        commits: [
          {
            modified: ['README.md', 'docs/usage.md']
          }
        ]
      };

      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('push');
      expect(result.processed).toBe(true);
      expect(result.deploymentTriggered).toBe(false);
      expect(result.message).toContain('No configuration changes');
      expect(mockDeployer.triggerDeployment).not.toHaveBeenCalled();
    });

    it('should handle pull request events', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 123,
          base: { ref: 'main' }
        }
      };

      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('pull_request');
      expect(result.processed).toBe(true);
      expect(result.prNumber).toBe(123);
      expect(result.message).toContain('Pull request opened');
    });

    it('should handle unknown event types', async () => {
      const payload = { unknown: 'event' };

      const result = await webhookHandler.processWebhookEvent(payload);

      expect(result.eventType).toBe('unknown');
      expect(result.processed).toBe(false);
      expect(result.message).toContain('not supported');
    });
  });

  describe('complete webhook handling', () => {
    it('should process valid webhook successfully', async () => {
      mockDeployer.triggerDeployment.mockResolvedValue('deploy-20250713-101117');

      const payload = {
        ref: 'refs/heads/main',
        commits: [{ modified: ['configuration.yaml'] }],
        repository: { full_name: 'user/repo' }
      };

      const signature = 'sha256=' + crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const headers = {
        'x-hub-signature-256': signature,
        'user-agent': 'GitHub-Hookshot/abc123',
        'x-forwarded-for': '192.168.1.100'
      };

      const result = await webhookHandler.handleWebhook(payload, headers);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('push');
      expect(result.deploymentTriggered).toBe(true);
      expect(result.deploymentId).toBe('deploy-20250713-101117');
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = { test: 'data' };
      const headers = {
        'x-hub-signature-256': 'sha256=invalid',
        'user-agent': 'GitHub-Hookshot/abc123'
      };

      const result = await webhookHandler.handleWebhook(payload, headers);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject webhook from disallowed origin', async () => {
      const payload = { test: 'data' };
      const signature = 'sha256=' + crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const headers = {
        'x-hub-signature-256': signature,
        'user-agent': 'MaliciousBot/1.0'
      };

      const result = await webhookHandler.handleWebhook(payload, headers);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid origin');
    });

    it('should reject webhook when rate limited', async () => {
      const payload = { test: 'data' };
      const signature = 'sha256=' + crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const headers = {
        'x-hub-signature-256': signature,
        'user-agent': 'GitHub-Hookshot/abc123',
        'x-forwarded-for': '192.168.1.100'
      };

      // Max out rate limit
      for (let i = 0; i < 10; i++) {
        await webhookHandler.handleWebhook(payload, headers);
      }

      const result = await webhookHandler.handleWebhook(payload, headers);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should handle processing errors gracefully', async () => {
      mockDeployer.triggerDeployment.mockRejectedValue(new Error('Deployment failed'));

      const payload = {
        ref: 'refs/heads/main',
        commits: [{ modified: ['configuration.yaml'] }]
      };

      const signature = 'sha256=' + crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const headers = {
        'x-hub-signature-256': signature,
        'user-agent': 'GitHub-Hookshot/abc123'
      };

      const result = await webhookHandler.handleWebhook(payload, headers);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal processing error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should track request metrics', () => {
      webhookHandler.checkRateLimit('client1');
      webhookHandler.checkRateLimit('client1');
      webhookHandler.checkRateLimit('client2');

      const metrics = webhookHandler.getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.uniqueClients).toBe(2);
      expect(metrics.averageRequestsPerClient).toBe(2); // (2+1)/2 = 1.5, rounded to 2
    });

    it('should handle empty metrics', () => {
      const metrics = webhookHandler.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.uniqueClients).toBe(0);
      expect(metrics.averageRequestsPerClient).toBe(0);
    });
  });
});
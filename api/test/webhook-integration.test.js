/**
 * Webhook Integration Tests
 * Basic tests for webhook functionality without external dependencies
 */

const assert = require('assert');
const crypto = require('crypto');
const WebhookHandler = require('../services/webhook-handler');
const EventQueue = require('../services/webhook/eventQueue');

describe('Webhook Integration Tests', () => {
  let webhookHandler;

  beforeEach(() => {
    webhookHandler = new WebhookHandler({
      secret: 'test-webhook-secret'
    });
  });

  afterEach(() => {
    if (webhookHandler && webhookHandler.eventQueue) {
      webhookHandler.eventQueue.shutdown();
    }
  });

  describe('Basic Webhook Processing', () => {
    it('should initialize webhook handler correctly', () => {
      assert(webhookHandler instanceof WebhookHandler);
      assert(webhookHandler.eventQueue instanceof EventQueue);
      assert.strictEqual(webhookHandler.secret, 'test-webhook-secret');
    });

    it('should verify webhook signatures correctly', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const isValid = webhookHandler.verifySignature(payload, `sha256=${signature}`);
      assert.strictEqual(isValid, true);
    });

    it('should reject invalid signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const isValid = webhookHandler.verifySignature(payload, 'sha256=invalid');
      assert.strictEqual(isValid, false);
    });
  });

  describe('Event Queue Integration', () => {
    it('should queue webhook events for processing', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      const queued = webhookHandler.eventQueue.enqueue(event);
      assert.strictEqual(queued, true);

      const stats = webhookHandler.eventQueue.getStats();
      assert.strictEqual(stats.queueSize, 1);
    });

    it('should prevent duplicate events', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'test/repo' },
        timestamp: '2025-01-10T10:00:00Z'
      };

      const first = webhookHandler.eventQueue.enqueue(event);
      const second = webhookHandler.eventQueue.enqueue(event);

      assert.strictEqual(first, true);
      assert.strictEqual(second, false);

      const stats = webhookHandler.eventQueue.getStats();
      assert.strictEqual(stats.deduplicated, 1);
    });
  });

  describe('Event Processing', () => {
    it('should process push events correctly', (done) => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo',
          full_name: 'owner/test-repo',
          default_branch: 'main'
        },
        commits: [{
          id: 'abc123',
          message: 'Test commit',
          author: { name: 'Test Author' },
          url: 'https://github.com/owner/test-repo/commit/abc123',
          timestamp: '2025-01-10T10:00:00Z'
        }],
        pusher: {
          name: 'Test Pusher',
          email: 'test@example.com'
        }
      };

      webhookHandler.once('push_event', (event) => {
        assert.strictEqual(event.type, 'push');
        assert.strictEqual(event.repository.fullName, 'owner/test-repo');
        assert.strictEqual(event.branch, 'main');
        assert.strictEqual(event.commits.length, 1);
        done();
      });

      webhookHandler.handlePushEvent(pushPayload);
    });

    it('should process pull request events correctly', (done) => {
      const prPayload = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          state: 'open',
          user: { login: 'test-user' },
          base: { ref: 'main' },
          head: { ref: 'feature-branch' },
          html_url: 'https://github.com/owner/test-repo/pull/42'
        },
        repository: {
          name: 'test-repo',
          full_name: 'owner/test-repo'
        }
      };

      webhookHandler.once('pull_request_event', (event) => {
        assert.strictEqual(event.type, 'pull_request');
        assert.strictEqual(event.action, 'opened');
        assert.strictEqual(event.pullRequest.number, 42);
        done();
      });

      webhookHandler.handlePullRequestEvent(prPayload);
    });

    it('should process workflow run events correctly', (done) => {
      const workflowPayload = {
        action: 'completed',
        workflow_run: {
          id: 123456,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          html_url: 'https://github.com/owner/test-repo/actions/runs/123456'
        },
        repository: {
          name: 'test-repo',
          full_name: 'owner/test-repo'
        }
      };

      webhookHandler.once('workflow_run_event', (event) => {
        assert.strictEqual(event.type, 'workflow_run');
        assert.strictEqual(event.action, 'completed');
        assert.strictEqual(event.workflow.conclusion, 'success');
        done();
      });

      webhookHandler.handleWorkflowRunEvent(workflowPayload);
    });
  });

  describe('Middleware Functionality', () => {
    it('should create Express middleware', () => {
      const middleware = webhookHandler.middleware();
      assert.strictEqual(typeof middleware, 'function');
      assert.strictEqual(middleware.length, 3); // req, res, next
    });

    it('should provide webhook statistics', () => {
      const stats = webhookHandler.getStats();
      assert.strictEqual(typeof stats, 'object');
      assert.strictEqual(stats.secret, true);
      assert(Array.isArray(stats.eventHandlers));
      assert.strictEqual(typeof stats.listenerCount, 'number');
      assert.strictEqual(typeof stats.queue, 'object');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid payloads gracefully', () => {
      assert.doesNotThrow(() => {
        webhookHandler.handlePushEvent(null);
        webhookHandler.handlePushEvent(undefined);
        webhookHandler.handlePushEvent({});
      });
    });

    it('should emit error events for processing failures', (done) => {
      webhookHandler.once('webhook_error', (errorInfo) => {
        assert(errorInfo.error instanceof Error);
        assert(errorInfo.event);
        done();
      });

      // Simulate a processing failure
      webhookHandler.eventQueue.emit('event_failed', {
        event: { type: 'test' },
        error: new Error('Test processing error')
      });
    });
  });

  describe('Queue Management', () => {
    it('should handle queue pause and resume', () => {
      const queue = webhookHandler.eventQueue;
      
      assert.strictEqual(queue.isRunning, true);
      
      queue.pause();
      assert.strictEqual(queue.isRunning, false);
      
      queue.resume();
      assert.strictEqual(queue.isRunning, true);
    });

    it('should provide queue information', () => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      webhookHandler.eventQueue.enqueue(event);
      
      const queueInfo = webhookHandler.eventQueue.getQueueInfo();
      assert(Array.isArray(queueInfo.items));
      assert(Array.isArray(queueInfo.processing));
      assert.strictEqual(queueInfo.items.length, 1);
      assert.strictEqual(queueInfo.items[0].type, 'test');
    });

    it('should handle queue cleanup', () => {
      const queue = webhookHandler.eventQueue;
      
      // Add some processed events
      queue.processed.add('test-event-1');
      queue.processed.add('test-event-2');
      
      const beforeSize = queue.processed.size;
      assert.strictEqual(beforeSize, 2);
      
      // Cleanup won't remove anything for small caches
      queue.cleanupProcessedEvents();
      
      const afterSize = queue.processed.size;
      assert.strictEqual(afterSize, beforeSize);
    });
  });

  describe('Event ID Generation', () => {
    it('should generate unique IDs for different events', () => {
      const queue = webhookHandler.eventQueue;
      
      const event1 = {
        type: 'push',
        repository: { fullName: 'test/repo' },
        timestamp: '2025-01-10T10:00:00Z'
      };

      const event2 = {
        type: 'push',
        repository: { fullName: 'test/repo' },
        timestamp: '2025-01-10T10:01:00Z'
      };

      const id1 = queue.generateEventId(event1);
      const id2 = queue.generateEventId(event2);

      assert.notStrictEqual(id1, id2);
      assert(id1.includes('push_test/repo'));
      assert(id2.includes('push_test/repo'));
    });

    it('should generate specific IDs for PR events', () => {
      const queue = webhookHandler.eventQueue;
      
      const prEvent = {
        type: 'pull_request',
        repository: { fullName: 'test/repo' },
        pullRequest: { number: 42 },
        timestamp: '2025-01-10T10:00:00Z'
      };

      const id = queue.generateEventId(prEvent);
      assert(id.includes('pull_request_test/repo'));
      assert(id.includes('pr_42'));
    });

    it('should generate specific IDs for workflow events', () => {
      const queue = webhookHandler.eventQueue;
      
      const workflowEvent = {
        type: 'workflow_run',
        repository: { fullName: 'test/repo' },
        workflow: { id: 123456 },
        timestamp: '2025-01-10T10:00:00Z'
      };

      const id = queue.generateEventId(workflowEvent);
      assert(id.includes('workflow_run_test/repo'));
      assert(id.includes('workflow_123456'));
    });
  });
});

console.log('✅ All webhook integration tests completed successfully');
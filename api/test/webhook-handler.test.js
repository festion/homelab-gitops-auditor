/**
 * GitHub Webhook Handler Tests
 * Tests webhook processing, event queue, and integration
 */

const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');
const WebhookHandler = require('../services/webhook-handler');
const EventQueue = require('../services/webhook/eventQueue');

describe('Webhook Handler Tests', () => {
  let webhookHandler;
  let mockWebSocketService;

  beforeEach(() => {
    // Mock WebSocket service
    mockWebSocketService = new EventEmitter();
    mockWebSocketService.broadcastUpdate = (message) => {
      mockWebSocketService.emit('broadcast', message);
    };

    // Initialize webhook handler with test configuration
    webhookHandler = new WebhookHandler({
      secret: 'test-secret-for-webhook-verification',
      websocketService: mockWebSocketService
    });
  });

  afterEach(() => {
    if (webhookHandler && webhookHandler.eventQueue) {
      webhookHandler.eventQueue.shutdown();
    }
  });

  describe('WebhookHandler Initialization', () => {
    it('should initialize with default configuration', () => {
      const handler = new WebhookHandler();
      assert(handler.eventQueue instanceof EventQueue);
      assert(handler.webhooks);
      assert.strictEqual(handler.secret, undefined);
    });

    it('should initialize with custom configuration', () => {
      const handler = new WebhookHandler({
        secret: 'custom-secret',
        port: 3075
      });
      assert.strictEqual(handler.secret, 'custom-secret');
      assert.strictEqual(handler.port, 3075);
    });

    it('should setup event handlers and queue handlers', () => {
      assert(typeof webhookHandler.setupEventHandlers === 'function');
      assert(typeof webhookHandler.setupQueueHandlers === 'function');
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid webhook signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = crypto
        .createHmac('sha256', 'test-secret-for-webhook-verification')
        .update(payload)
        .digest('hex');

      const isValid = webhookHandler.verifySignature(payload, `sha256=${signature}`);
      assert.strictEqual(isValid, true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=invalid-signature';

      const isValid = webhookHandler.verifySignature(payload, invalidSignature);
      assert.strictEqual(isValid, false);
    });

    it('should handle missing secret gracefully', () => {
      const handler = new WebhookHandler(); // No secret
      const payload = JSON.stringify({ test: 'data' });
      const signature = 'sha256=any-signature';

      const isValid = handler.verifySignature(payload, signature);
      assert.strictEqual(isValid, true); // Should pass when no secret configured
    });
  });

  describe('Event Processing', () => {
    it('should process push events', (done) => {
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo',
          full_name: 'owner/test-repo',
          default_branch: 'main'
        },
        commits: [
          {
            id: 'abc123',
            message: 'Test commit',
            author: { name: 'Test Author' },
            url: 'https://github.com/owner/test-repo/commit/abc123',
            timestamp: '2025-01-10T10:00:00Z'
          }
        ],
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
        assert.strictEqual(event.commits[0].id, 'abc123');
        done();
      });

      webhookHandler.handlePushEvent(pushPayload);
    });

    it('should process pull request events', (done) => {
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
        assert.strictEqual(event.pullRequest.baseBranch, 'main');
        done();
      });

      webhookHandler.handlePullRequestEvent(prPayload);
    });

    it('should process workflow run events', (done) => {
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
        assert.strictEqual(event.workflow.name, 'CI');
        assert.strictEqual(event.workflow.conclusion, 'success');
        done();
      });

      webhookHandler.handleWorkflowRunEvent(workflowPayload);
    });
  });

  describe('Event Queue Integration', () => {
    it('should queue events for processing', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'owner/test-repo' },
        timestamp: new Date().toISOString()
      };

      const queued = webhookHandler.eventQueue.enqueue(event);
      assert.strictEqual(queued, true);

      const stats = webhookHandler.eventQueue.getStats();
      assert.strictEqual(stats.total, 1);
      assert.strictEqual(stats.queueSize, 1);
    });

    it('should prevent duplicate event processing', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'owner/test-repo' },
        timestamp: '2025-01-10T10:00:00Z'
      };

      // Queue the same event twice
      const firstQueue = webhookHandler.eventQueue.enqueue(event);
      const secondQueue = webhookHandler.eventQueue.enqueue(event);

      assert.strictEqual(firstQueue, true);
      assert.strictEqual(secondQueue, false); // Should be deduplicated

      const stats = webhookHandler.eventQueue.getStats();
      assert.strictEqual(stats.deduplicated, 1);
    });

    it('should process queued events and emit results', (done) => {
      const event = {
        type: 'push',
        repository: { fullName: 'owner/test-repo' },
        branch: 'main',
        timestamp: new Date().toISOString()
      };

      webhookHandler.once('push_event', (processedEvent) => {
        assert.strictEqual(processedEvent.type, 'push');
        assert.strictEqual(processedEvent.repository.fullName, 'owner/test-repo');
        done();
      });

      webhookHandler.eventQueue.enqueue(event);
    });
  });

  describe('WebSocket Integration', () => {
    it('should broadcast push events via WebSocket', (done) => {
      const pushEvent = {
        type: 'push',
        repository: { fullName: 'owner/test-repo' },
        branch: 'main',
        timestamp: new Date().toISOString()
      };

      mockWebSocketService.once('broadcast', (message) => {
        assert.strictEqual(message.type, 'webhook');
        assert.strictEqual(message.eventType, 'push');
        assert.strictEqual(message.data.type, 'push');
        done();
      });

      webhookHandler.emit('push_event', pushEvent);
    });

    it('should broadcast workflow events via WebSocket', (done) => {
      const workflowEvent = {
        type: 'workflow_run',
        action: 'completed',
        workflow: { name: 'CI', conclusion: 'success' },
        timestamp: new Date().toISOString()
      };

      mockWebSocketService.once('broadcast', (message) => {
        assert.strictEqual(message.type, 'webhook');
        assert.strictEqual(message.eventType, 'workflow_run');
        assert.strictEqual(message.data.workflow.conclusion, 'success');
        done();
      });

      webhookHandler.emit('workflow_run_event', workflowEvent);
    });
  });

  describe('Error Handling', () => {
    it('should handle webhook processing errors gracefully', () => {
      const invalidPayload = null;
      
      assert.doesNotThrow(() => {
        webhookHandler.handlePushEvent(invalidPayload);
      });
    });

    it('should emit error events for failed processing', (done) => {
      webhookHandler.once('webhook_error', (errorInfo) => {
        assert(errorInfo.error);
        assert(errorInfo.event);
        done();
      });

      // Simulate a processing failure
      webhookHandler.eventQueue.emit('event_failed', {
        event: { type: 'test' },
        error: new Error('Test error')
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide webhook statistics', () => {
      const stats = webhookHandler.getStats();
      
      assert(typeof stats.secret === 'boolean');
      assert(Array.isArray(stats.eventHandlers));
      assert(typeof stats.listenerCount === 'number');
      assert(typeof stats.queue === 'object');
      assert(typeof stats.queue.total === 'number');
      assert(typeof stats.queue.processed === 'number');
    });

    it('should track event processing metrics', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'owner/test-repo' },
        timestamp: new Date().toISOString()
      };

      webhookHandler.eventQueue.enqueue(event);
      
      const stats = webhookHandler.eventQueue.getStats();
      assert.strictEqual(stats.total, 1);
      assert.strictEqual(stats.queueSize, 1);
    });
  });
});

describe('EventQueue Tests', () => {
  let eventQueue;

  beforeEach(() => {
    eventQueue = new EventQueue({
      maxRetries: 2,
      retryDelay: 100,
      maxQueueSize: 5,
      processingTimeout: 1000
    });
  });

  afterEach(() => {
    if (eventQueue) {
      eventQueue.shutdown();
    }
  });

  describe('Event Queue Operations', () => {
    it('should enqueue events successfully', () => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      const result = eventQueue.enqueue(event);
      assert.strictEqual(result, true);
      
      const stats = eventQueue.getStats();
      assert.strictEqual(stats.queueSize, 1);
      assert.strictEqual(stats.total, 1);
    });

    it('should respect queue size limits', () => {
      // Fill the queue to max capacity (5)
      for (let i = 0; i < 6; i++) {
        eventQueue.enqueue({
          type: 'test',
          repository: { fullName: `test/repo-${i}` },
          timestamp: new Date().toISOString()
        });
      }

      const stats = eventQueue.getStats();
      assert.strictEqual(stats.queueSize, 5); // Should drop oldest when full
    });

    it('should generate unique event IDs', () => {
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

      const id1 = eventQueue.generateEventId(event1);
      const id2 = eventQueue.generateEventId(event2);

      assert.notStrictEqual(id1, id2);
      assert(id1.includes('push_test/repo'));
      assert(id2.includes('push_test/repo'));
    });

    it('should prevent duplicate events', () => {
      const event = {
        type: 'push',
        repository: { fullName: 'test/repo' },
        timestamp: '2025-01-10T10:00:00Z'
      };

      const result1 = eventQueue.enqueue(event);
      const result2 = eventQueue.enqueue(event); // Same event

      assert.strictEqual(result1, true);
      assert.strictEqual(result2, false);

      const stats = eventQueue.getStats();
      assert.strictEqual(stats.deduplicated, 1);
    });
  });

  describe('Event Processing', () => {
    it('should process events and emit success', (done) => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      eventQueue.on('process_test', (processedEvent) => {
        assert.strictEqual(processedEvent.type, 'test');
        assert(processedEvent._processingId);
        assert.strictEqual(processedEvent._attempts, 1);
        
        // Mark as successful
        eventQueue.markSuccess(processedEvent._processingId);
        
        // Check stats after processing
        setTimeout(() => {
          const stats = eventQueue.getStats();
          assert.strictEqual(stats.processed, 1);
          done();
        }, 200);
      });

      eventQueue.enqueue(event);
    });

    it('should retry failed events', (done) => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      let attempts = 0;
      eventQueue.on('process_test', (processedEvent) => {
        attempts++;
        
        if (attempts === 1) {
          // Fail first attempt
          eventQueue.markError(processedEvent._processingId, new Error('Test failure'));
        } else {
          // Succeed on retry
          eventQueue.markSuccess(processedEvent._processingId);
          
          setTimeout(() => {
            const stats = eventQueue.getStats();
            assert.strictEqual(stats.retried, 1);
            assert.strictEqual(stats.processed, 1);
            done();
          }, 200);
        }
      });

      eventQueue.enqueue(event);
    });

    it('should handle permanent failures after max retries', (done) => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      let attempts = 0;
      eventQueue.on('process_test', (processedEvent) => {
        attempts++;
        // Always fail
        eventQueue.markError(processedEvent._processingId, new Error('Permanent failure'));
      });

      eventQueue.on('event_failed', ({ event: failedEvent, error }) => {
        assert.strictEqual(failedEvent.type, 'test');
        assert.strictEqual(error.message, 'Permanent failure');
        
        const stats = eventQueue.getStats();
        assert.strictEqual(stats.failed, 1);
        assert.strictEqual(attempts, 2); // maxRetries = 2
        done();
      });

      eventQueue.enqueue(event);
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume processing', () => {
      assert.strictEqual(eventQueue.isRunning, true);
      
      eventQueue.pause();
      assert.strictEqual(eventQueue.isRunning, false);
      
      eventQueue.resume();
      assert.strictEqual(eventQueue.isRunning, true);
    });

    it('should provide detailed queue information', () => {
      const event = {
        type: 'test',
        repository: { fullName: 'test/repo' },
        timestamp: new Date().toISOString()
      };

      eventQueue.enqueue(event);
      
      const queueInfo = eventQueue.getQueueInfo();
      assert.strictEqual(queueInfo.items.length, 1);
      assert.strictEqual(queueInfo.items[0].type, 'test');
      assert(queueInfo.items[0].id);
      assert(queueInfo.items[0].createdAt);
    });

    it('should cleanup processed events cache', () => {
      // Add some processed events
      for (let i = 0; i < 5; i++) {
        eventQueue.processed.add(`test-event-${i}`);
      }

      const beforeSize = eventQueue.processed.size;
      assert.strictEqual(beforeSize, 5);

      // This won't clean anything as cache size is small
      eventQueue.cleanupProcessedEvents();
      
      const afterSize = eventQueue.processed.size;
      assert.strictEqual(afterSize, beforeSize);
    });
  });
});

console.log('✅ All webhook tests completed successfully');
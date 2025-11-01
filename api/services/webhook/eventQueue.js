/**
 * GitHub Webhook Event Processing Queue
 * Handles webhook events with retry logic and deduplication
 */

const EventEmitter = require('events');

class EventQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // ms
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.processingTimeout = options.processingTimeout || 30000; // 30s
    
    // Event queue and processing state
    this.queue = [];
    this.processing = new Map(); // event_id -> processing info
    this.processed = new Set(); // event_id cache for deduplication
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      deduplicated: 0
    };
    
    // Start processing
    this.isRunning = true;
    this.processEvents();
    
    console.log('🎯 Event processing queue initialized');
  }

  /**
   * Add event to processing queue
   */
  enqueue(event) {
    const eventId = this.generateEventId(event);
    
    // Check for duplicate events
    if (this.processed.has(eventId)) {
      this.stats.deduplicated++;
      console.log(`⚡ Duplicate event skipped: ${eventId}`);
      return false;
    }

    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`⚠️ Event queue full, dropping oldest event`);
      this.queue.shift();
    }

    const queueItem = {
      id: eventId,
      event,
      attempts: 0,
      createdAt: new Date(),
      retryAt: null
    };

    this.queue.push(queueItem);
    this.stats.total++;
    
    console.log(`📝 Event queued: ${eventId} (queue: ${this.queue.length})`);
    return true;
  }

  /**
   * Generate unique event ID for deduplication
   */
  generateEventId(event) {
    const { type, timestamp, repository, action } = event;
    const baseId = `${type}_${repository?.fullName || 'unknown'}_${action || 'default'}`;
    
    // For some events, include more specific identifiers
    if (event.pullRequest) {
      return `${baseId}_pr_${event.pullRequest.number}_${timestamp}`;
    }
    if (event.workflow) {
      return `${baseId}_workflow_${event.workflow.id}_${timestamp}`;
    }
    if (event.commits) {
      const commitIds = event.commits.map(c => c.id.substring(0, 7)).join(',');
      return `${baseId}_commits_${commitIds}_${timestamp}`;
    }
    
    return `${baseId}_${timestamp}`;
  }

  /**
   * Main event processing loop
   */
  async processEvents() {
    while (this.isRunning) {
      try {
        await this.processNextEvent();
        await this.sleep(100); // Small delay between processing cycles
      } catch (error) {
        console.error('❌ Error in event processing loop:', error);
        await this.sleep(1000); // Longer delay on error
      }
    }
  }

  /**
   * Process the next available event
   */
  async processNextEvent() {
    const now = new Date();
    
    // Find next event ready for processing
    const eventIndex = this.queue.findIndex(item => {
      // Skip if currently being processed
      if (this.processing.has(item.id)) {
        return false;
      }
      
      // Check if retry delay has passed
      if (item.retryAt && now < item.retryAt) {
        return false;
      }
      
      return true;
    });

    if (eventIndex === -1) {
      return; // No events ready for processing
    }

    const eventItem = this.queue[eventIndex];
    
    // Mark as processing
    this.processing.set(eventItem.id, {
      startedAt: now,
      attempts: eventItem.attempts + 1
    });

    try {
      await this.processEvent(eventItem);
      
      // Success - remove from queue and mark as processed
      this.queue.splice(eventIndex, 1);
      this.processing.delete(eventItem.id);
      this.processed.add(eventItem.id);
      this.stats.processed++;
      
      console.log(`✅ Event processed successfully: ${eventItem.id}`);
      
    } catch (error) {
      console.error(`❌ Error processing event ${eventItem.id}:`, error);
      
      this.processing.delete(eventItem.id);
      eventItem.attempts++;
      
      if (eventItem.attempts >= this.maxRetries) {
        // Max retries reached - remove from queue
        this.queue.splice(eventIndex, 1);
        this.stats.failed++;
        
        console.error(`💀 Event failed after ${this.maxRetries} attempts: ${eventItem.id}`);
        this.emit('event_failed', { event: eventItem.event, error });
        
      } else {
        // Schedule retry
        const delay = this.retryDelay * Math.pow(2, eventItem.attempts - 1); // Exponential backoff
        eventItem.retryAt = new Date(now.getTime() + delay);
        this.stats.retried++;
        
        console.log(`🔄 Event scheduled for retry ${eventItem.attempts}/${this.maxRetries} in ${delay}ms: ${eventItem.id}`);
      }
    }
  }

  /**
   * Process individual event - emit to handlers
   */
  async processEvent(eventItem) {
    const { event } = eventItem;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Event processing timeout after ${this.processingTimeout}ms`));
      }, this.processingTimeout);

      // Emit event for processing
      const eventType = `process_${event.type}`;
      
      const handleSuccess = () => {
        clearTimeout(timeout);
        resolve();
      };

      const handleError = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      // Set up one-time listeners for this event
      this.once(`${eventType}_success_${eventItem.id}`, handleSuccess);
      this.once(`${eventType}_error_${eventItem.id}`, handleError);

      // Emit the event for processing
      this.emit(eventType, {
        ...event,
        _processingId: eventItem.id,
        _attempts: eventItem.attempts + 1
      });

      // If no specific handler, consider it successful after a short delay
      setTimeout(() => {
        if (this.listenerCount(`${eventType}_success_${eventItem.id}`) > 0) {
          this.emit(`${eventType}_success_${eventItem.id}`);
        }
      }, 100);
    });
  }

  /**
   * Mark event processing as successful
   */
  markSuccess(processingId) {
    this.emit(`process_${processingId.split('_')[0]}_success_${processingId}`);
  }

  /**
   * Mark event processing as failed
   */
  markError(processingId, error) {
    this.emit(`process_${processingId.split('_')[0]}_error_${processingId}`, error);
  }

  /**
   * Clean up old processed event IDs to prevent memory leaks
   */
  cleanupProcessedEvents(maxAge = 3600000) { // 1 hour default
    const cutoff = new Date(Date.now() - maxAge);
    let cleanedCount = 0;
    
    // Note: This is a simple cleanup. In production, you might want to store
    // timestamps with the IDs or use a more sophisticated cache with TTL
    if (this.processed.size > 10000) {
      this.processed.clear();
      cleanedCount = this.processed.size;
      console.log(`🧹 Cleared processed events cache (${cleanedCount} entries)`);
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      processing: this.processing.size,
      processedCacheSize: this.processed.size,
      oldestInQueue: this.queue.length > 0 ? this.queue[0].createdAt : null
    };
  }

  /**
   * Get detailed queue information
   */
  getQueueInfo() {
    return {
      items: this.queue.map(item => ({
        id: item.id,
        type: item.event.type,
        attempts: item.attempts,
        createdAt: item.createdAt,
        retryAt: item.retryAt,
        repository: item.event.repository?.fullName
      })),
      processing: Array.from(this.processing.entries()).map(([id, info]) => ({
        id,
        startedAt: info.startedAt,
        attempts: info.attempts
      }))
    };
  }

  /**
   * Pause event processing
   */
  pause() {
    this.isRunning = false;
    console.log('⏸️ Event processing paused');
  }

  /**
   * Resume event processing
   */
  resume() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.processEvents();
      console.log('▶️ Event processing resumed');
    }
  }

  /**
   * Shutdown the queue
   */
  shutdown() {
    this.isRunning = false;
    this.queue.length = 0;
    this.processing.clear();
    console.log('🛑 Event processing queue shutdown');
  }

  /**
   * Helper method for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EventQueue;
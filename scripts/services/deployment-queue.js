const { EventEmitter } = require('events');

class DeploymentQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger;
    this.deploymentRepository = options.deploymentRepository;
    this.maxQueueSize = options.maxQueueSize || 100;
    this.processingTimeout = options.processingTimeout || 300000; // 5 minutes
    
    this.queue = [];
    this.processing = new Set();
    this.priorities = {
      'low': 1,
      'normal': 2,
      'high': 3,
      'urgent': 4
    };
  }

  async enqueue(deployment) {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue is full (max: ${this.maxQueueSize})`);
    }
    
    if (!deployment.id) {
      throw new Error('Deployment must have an ID');
    }
    
    if (this.queue.find(item => item.id === deployment.id)) {
      throw new Error(`Deployment ${deployment.id} is already queued`);
    }
    
    if (this.processing.has(deployment.id)) {
      throw new Error(`Deployment ${deployment.id} is currently being processed`);
    }
    
    const queueItem = {
      ...deployment,
      queuedAt: new Date().toISOString(),
      priority: deployment.priority || 'normal',
      retryCount: deployment.retryCount || 0,
      maxRetries: deployment.maxRetries || 3
    };
    
    this.queue.push(queueItem);
    this.sortQueue();
    
    this.logger?.info('Deployment queued', {
      deploymentId: deployment.id,
      priority: queueItem.priority,
      queueLength: this.queue.length,
      position: this.getQueuePosition(deployment.id)
    });
    
    this.emit('queued', queueItem);
    
    return queueItem;
  }

  async dequeue() {
    if (this.queue.length === 0) {
      return null;
    }
    
    const deployment = this.queue.shift();
    this.processing.add(deployment.id);
    
    this.logger?.info('Deployment dequeued', {
      deploymentId: deployment.id,
      priority: deployment.priority,
      queuedAt: deployment.queuedAt,
      waitTime: Date.now() - new Date(deployment.queuedAt).getTime()
    });
    
    this.emit('dequeued', deployment);
    
    setTimeout(() => {
      if (this.processing.has(deployment.id)) {
        this.logger?.warn('Deployment processing timeout', {
          deploymentId: deployment.id,
          timeout: this.processingTimeout
        });
        
        this.processing.delete(deployment.id);
        this.emit('timeout', deployment);
      }
    }, this.processingTimeout);
    
    return deployment;
  }

  markCompleted(deploymentId) {
    if (this.processing.has(deploymentId)) {
      this.processing.delete(deploymentId);
      
      this.logger?.info('Deployment marked as completed', {
        deploymentId,
        processingCount: this.processing.size
      });
      
      this.emit('completed', deploymentId);
      return true;
    }
    
    return false;
  }

  markFailed(deploymentId, error = null) {
    if (this.processing.has(deploymentId)) {
      this.processing.delete(deploymentId);
      
      this.logger?.info('Deployment marked as failed', {
        deploymentId,
        error: error?.message,
        processingCount: this.processing.size
      });
      
      this.emit('failed', { deploymentId, error });
      return true;
    }
    
    return false;
  }

  async retry(deploymentId) {
    const deployment = this.queue.find(item => item.id === deploymentId) ||
                      [...this.processing].find(id => id === deploymentId);
    
    if (!deployment) {
      const repoDeployment = await this.deploymentRepository?.getDeployment(deploymentId);
      if (!repoDeployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }
      
      if (repoDeployment.retryCount >= repoDeployment.maxRetries) {
        throw new Error(`Deployment ${deploymentId} has exceeded maximum retry attempts`);
      }
      
      const retryDeployment = {
        ...repoDeployment,
        retryCount: (repoDeployment.retryCount || 0) + 1,
        retryAt: new Date().toISOString(),
        priority: 'high'
      };
      
      return await this.enqueue(retryDeployment);
    }
    
    throw new Error(`Deployment ${deploymentId} is already queued or processing`);
  }

  remove(deploymentId) {
    const index = this.queue.findIndex(item => item.id === deploymentId);
    
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      
      this.logger?.info('Deployment removed from queue', {
        deploymentId,
        queueLength: this.queue.length
      });
      
      this.emit('removed', removed);
      return removed;
    }
    
    return null;
  }

  clear() {
    const cleared = this.queue.splice(0);
    
    this.logger?.info('Queue cleared', {
      clearedCount: cleared.length
    });
    
    this.emit('cleared', cleared);
    
    return cleared.length;
  }

  getQueuePosition(deploymentId) {
    const index = this.queue.findIndex(item => item.id === deploymentId);
    return index !== -1 ? index + 1 : -1;
  }

  getQueueLength() {
    return this.queue.length;
  }

  getProcessingCount() {
    return this.processing.size;
  }

  hasItems() {
    return this.queue.length > 0;
  }

  isProcessing(deploymentId) {
    return this.processing.has(deploymentId);
  }

  isQueued(deploymentId) {
    return this.queue.some(item => item.id === deploymentId);
  }

  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  getQueue() {
    return [...this.queue];
  }

  getProcessing() {
    return [...this.processing];
  }

  async getStatus() {
    const status = {
      queueLength: this.queue.length,
      processingCount: this.processing.size,
      maxQueueSize: this.maxQueueSize,
      queue: this.queue.map(item => ({
        id: item.id,
        priority: item.priority,
        queuedAt: item.queuedAt,
        repository: item.repository,
        branch: item.branch,
        requestedBy: item.requestedBy,
        retryCount: item.retryCount,
        type: item.type || 'deployment'
      })),
      processing: [...this.processing],
      priorityDistribution: this.getPriorityDistribution(),
      averageWaitTime: await this.getAverageWaitTime()
    };
    
    return status;
  }

  getPriorityDistribution() {
    const distribution = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0
    };
    
    this.queue.forEach(item => {
      const priority = item.priority || 'normal';
      if (distribution.hasOwnProperty(priority)) {
        distribution[priority]++;
      }
    });
    
    return distribution;
  }

  async getAverageWaitTime() {
    if (this.queue.length === 0) {
      return 0;
    }
    
    const now = Date.now();
    const totalWaitTime = this.queue.reduce((total, item) => {
      return total + (now - new Date(item.queuedAt).getTime());
    }, 0);
    
    return Math.round(totalWaitTime / this.queue.length);
  }

  sortQueue() {
    this.queue.sort((a, b) => {
      const priorityA = this.priorities[a.priority] || this.priorities.normal;
      const priorityB = this.priorities[b.priority] || this.priorities.normal;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      
      return new Date(a.queuedAt) - new Date(b.queuedAt);
    });
  }

  validateDeployment(deployment) {
    const required = ['id', 'repository'];
    const missing = required.filter(field => !deployment[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    if (deployment.priority && !this.priorities.hasOwnProperty(deployment.priority)) {
      throw new Error(`Invalid priority: ${deployment.priority}. Must be one of: ${Object.keys(this.priorities).join(', ')}`);
    }
    
    return true;
  }

  getMetrics() {
    return {
      queueLength: this.queue.length,
      processingCount: this.processing.size,
      maxQueueSize: this.maxQueueSize,
      utilizationPercent: Math.round((this.queue.length / this.maxQueueSize) * 100),
      priorityDistribution: this.getPriorityDistribution(),
      oldestQueuedAt: this.queue.length > 0 ? this.queue[this.queue.length - 1].queuedAt : null,
      newestQueuedAt: this.queue.length > 0 ? this.queue[0].queuedAt : null
    };
  }

  onQueueEvent(event, handler) {
    this.on(event, handler);
  }

  offQueueEvent(event, handler) {
    this.off(event, handler);
  }

  async cleanup() {
    this.queue = [];
    this.processing.clear();
    this.removeAllListeners();
    
    this.logger?.info('Deployment queue cleaned up');
  }
}

module.exports = DeploymentQueue;
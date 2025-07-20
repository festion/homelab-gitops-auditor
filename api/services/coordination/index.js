const RepositoryDependencyManager = require('./dependencyManager');
const SharedResourceManager = require('./sharedResourceManager');
const CoordinationMonitor = require('./monitoring');

/**
 * Cross-Repository Coordination Services
 * 
 * This module provides comprehensive coordination capabilities for managing
 * dependencies, shared resources, and coordinated operations across multiple
 * repositories in the homelab GitOps auditor system.
 * 
 * Features:
 * - Dependency analysis and deployment ordering
 * - Resource conflict detection and resolution
 * - Shared configuration management
 * - Cross-repository deployment coordination
 * - Resource locking and claim management
 */

class CoordinationService {
  constructor(services) {
    this.dependencyManager = new RepositoryDependencyManager(services);
    this.resourceManager = new SharedResourceManager(services.storage);
    this.monitor = new CoordinationMonitor({
      logLevel: services.logLevel || 'info',
      logFile: services.logFile || 'logs/coordination.log'
    });
    this.services = services;
    
    this.initialize();
  }

  async initialize() {
    try {
      // Setup cleanup interval for expired resource locks
      this.cleanupInterval = setInterval(async () => {
        try {
          await this.resourceManager.cleanupExpiredLocks();
        } catch (error) {
          console.error('Failed to cleanup expired locks:', error.message);
        }
      }, 5 * 60 * 1000); // Every 5 minutes

      // Setup resource manager event listeners
      this.resourceManager.on('resourceClaimed', (event) => {
        console.log(`Resource ${event.resourceId} claimed by ${event.repository}`);
      });

      this.resourceManager.on('resourceReleased', (event) => {
        console.log(`Resource ${event.resourceId} released by ${event.repository}`);
      });

      this.resourceManager.on('resolutionApplied', (event) => {
        console.log(`Conflict resolution ${event.resolutionId} applied using strategy ${event.strategy}`);
      });

      console.log('Coordination service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize coordination service:', error.message);
    }
  }

  /**
   * Analyze dependencies across multiple repositories
   */
  async analyzeDependencies(repositories) {
    return await this.dependencyManager.analyzeDependencies(repositories);
  }

  /**
   * Coordinate deployment across repositories
   */
  async coordinateDeployment(repositories, options = {}) {
    return await this.dependencyManager.coordinateDeployment(repositories, options);
  }

  /**
   * Check for resource conflicts
   */
  async checkResourceConflicts(repositories) {
    return await this.dependencyManager.checkResourceConflicts(repositories);
  }

  /**
   * Coordinate shared configurations
   */
  async coordinateSharedConfiguration(repositories) {
    return await this.resourceManager.coordinateSharedConfiguration(repositories);
  }

  /**
   * Register a shared resource
   */
  async registerSharedResource(resource) {
    return await this.resourceManager.registerSharedResource(resource);
  }

  /**
   * Claim a shared resource
   */
  async claimResource(resourceId, repository, operation) {
    return await this.resourceManager.claimResource(resourceId, repository, operation);
  }

  /**
   * Release a resource claim
   */
  async releaseResource(resourceId, claimId) {
    return await this.resourceManager.releaseResource(resourceId, claimId);
  }

  /**
   * Get comprehensive system health
   */
  getSystemHealth() {
    return {
      dependencyManager: {
        status: 'active',
        dependencyCache: this.dependencyManager.dependencies.size,
        lastAnalysis: new Date()
      },
      resourceManager: this.resourceManager.getSystemHealth(),
      coordination: {
        status: 'active',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Shutdown coordination service
   */
  async shutdown() {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Final cleanup
      await this.resourceManager.cleanupExpiredLocks();
      
      // Save current state
      await this.dependencyManager.saveDependencyGraph();
      await this.resourceManager.saveState();

      console.log('Coordination service shutdown complete');
    } catch (error) {
      console.error('Error during coordination service shutdown:', error.message);
    }
  }
}

/**
 * Utility functions for coordination operations
 */
const CoordinationUtils = {
  /**
   * Validate repository list
   */
  validateRepositories(repositories) {
    if (!Array.isArray(repositories) || repositories.length === 0) {
      throw new Error('Repositories must be a non-empty array');
    }

    for (const repo of repositories) {
      if (typeof repo !== 'string' || repo.trim().length === 0) {
        throw new Error('Each repository must be a non-empty string');
      }
    }

    return repositories.map(repo => repo.trim());
  },

  /**
   * Generate deployment phases summary
   */
  generateDeploymentSummary(coordination) {
    const summary = {
      totalRepositories: coordination.repositories.length,
      totalPhases: coordination.phases.length,
      parallelPhases: coordination.phases.filter(p => p.parallel).length,
      sequentialPhases: coordination.phases.filter(p => !p.parallel).length,
      estimatedDuration: coordination.phases.reduce((sum, p) => sum + p.estimatedDuration, 0),
      conflictsDetected: coordination.conflicts.length,
      status: coordination.status
    };

    return summary;
  },

  /**
   * Format conflict severity for display
   */
  formatConflictSeverity(severity) {
    const severityMap = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🔴'
    };

    return severityMap[severity] || '⚪';
  },

  /**
   * Calculate deployment readiness score
   */
  calculateReadinessScore(coordination) {
    let score = 100;
    
    // Deduct points for conflicts
    score -= coordination.conflicts.length * 10;
    
    // Deduct points for circular dependencies
    if (coordination.analysis && coordination.analysis.circularDependencies.length > 0) {
      score -= coordination.analysis.circularDependencies.length * 20;
    }
    
    // Deduct points for missing dependencies
    const missingDeps = coordination.repositories.filter(repo => {
      const deps = coordination.analysis?.directDependencies?.get?.(repo);
      return deps && deps.error;
    });
    score -= missingDeps.length * 15;

    return Math.max(0, score);
  }
};

/**
 * Configuration constants
 */
const CoordinationConfig = {
  DEFAULT_DEPLOYMENT_TIMEOUT: 3600, // 1 hour
  MAX_PARALLEL_REPOSITORIES: 5,
  DEFAULT_RESOURCE_TTL: 1800, // 30 minutes
  CLEANUP_INTERVAL: 300, // 5 minutes
  MAX_RETRY_ATTEMPTS: 3,
  
  CONFLICT_SEVERITY_WEIGHTS: {
    'low': 1,
    'medium': 3,
    'high': 5
  },
  
  RESOURCE_TYPES: {
    PORT: 'port',
    DOMAIN: 'domain',
    VOLUME: 'volume',
    NETWORK: 'network',
    DATABASE: 'database',
    CERTIFICATE: 'certificate'
  },
  
  OPERATION_TYPES: {
    READ: 'read',
    WRITE: 'write',
    BACKUP: 'backup',
    DEPLOY: 'deploy',
    MAINTENANCE: 'maintenance'
  }
};

module.exports = {
  CoordinationService,
  RepositoryDependencyManager,
  SharedResourceManager,
  CoordinationMonitor,
  CoordinationUtils,
  CoordinationConfig
};
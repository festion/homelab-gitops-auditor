const crypto = require('crypto');
const EventEmitter = require('events');

class SharedResourceManager extends EventEmitter {
  constructor(storage) {
    super();
    this.storage = storage;
    this.resources = new Map();
    this.locks = new Map();
    this.reservations = new Map();
    this.conflictResolutions = new Map();
    
    this.loadState();
  }

  async loadState() {
    try {
      const state = await this.storage.get('shared-resource-state');
      if (state) {
        this.resources = new Map(state.resources || []);
        this.locks = new Map(state.locks || []);
        this.reservations = new Map(state.reservations || []);
        this.conflictResolutions = new Map(state.conflictResolutions || []);
      }
    } catch (error) {
      console.warn('Could not load shared resource state:', error.message);
    }
  }

  async saveState() {
    try {
      await this.storage.set('shared-resource-state', {
        resources: Array.from(this.resources.entries()),
        locks: Array.from(this.locks.entries()),
        reservations: Array.from(this.reservations.entries()),
        conflictResolutions: Array.from(this.conflictResolutions.entries()),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to save shared resource state:', error.message);
    }
  }

  async registerSharedResource(resource) {
    const resourceId = `${resource.type}:${resource.identifier}`;
    
    const resourceData = {
      ...resource,
      id: resourceId,
      registeredAt: new Date(),
      owners: new Set(),
      locks: new Map(),
      metadata: resource.metadata || {},
      capacity: resource.capacity || 1,
      currentUsage: 0
    };

    this.resources.set(resourceId, resourceData);
    await this.saveState();
    
    this.emit('resourceRegistered', resourceData);
    return resourceId;
  }

  async claimResource(resourceId, repository, operation) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Check capacity constraints
    if (resource.currentUsage >= resource.capacity) {
      throw new Error(`Resource ${resourceId} is at capacity (${resource.capacity})`);
    }

    // Check if resource is exclusively locked
    const exclusiveLock = Array.from(resource.locks.values())
      .find(lock => lock.exclusive && lock.repository !== repository);
    
    if (exclusiveLock) {
      throw new Error(`Resource ${resourceId} is exclusively locked by ${exclusiveLock.repository}`);
    }

    // Check operation compatibility
    if (!this.areOperationsCompatible(resource, operation)) {
      throw new Error(`Operation ${operation.type} incompatible with current resource usage`);
    }

    // Claim the resource
    const claimId = this.generateClaimId();
    const lock = {
      id: claimId,
      repository,
      operation,
      exclusive: operation.exclusive || false,
      claimedAt: new Date(),
      expiresAt: operation.ttl ? new Date(Date.now() + operation.ttl * 1000) : null
    };

    resource.locks.set(claimId, lock);
    resource.owners.add(repository);
    resource.currentUsage++;
    
    await this.saveState();
    
    this.emit('resourceClaimed', {
      resourceId,
      claimId,
      repository,
      operation
    });
    
    return claimId;
  }

  async releaseResource(resourceId, claimId) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return false;
    }

    const lock = resource.locks.get(claimId);
    if (!lock) {
      return false;
    }

    resource.locks.delete(claimId);
    resource.currentUsage = Math.max(0, resource.currentUsage - 1);
    
    // Remove owner if no more locks
    const hasOtherLocks = Array.from(resource.locks.values())
      .some(l => l.repository === lock.repository);
    
    if (!hasOtherLocks) {
      resource.owners.delete(lock.repository);
    }

    await this.saveState();
    
    this.emit('resourceReleased', {
      resourceId,
      claimId,
      repository: lock.repository
    });

    return true;
  }

  areOperationsCompatible(resource, newOperation) {
    const existingOperations = Array.from(resource.locks.values()).map(lock => lock.operation);
    
    // Check for exclusive operations
    if (newOperation.exclusive) {
      return existingOperations.length === 0;
    }
    
    const hasExclusiveOperation = existingOperations.some(op => op.exclusive);
    if (hasExclusiveOperation) {
      return false;
    }
    
    // Check operation-specific compatibility
    const compatibilityMatrix = {
      'read': ['read', 'backup'],
      'write': [],
      'backup': ['read', 'backup'],
      'deploy': [],
      'maintenance': []
    };
    
    const compatibleOps = compatibilityMatrix[newOperation.type] || [];
    return existingOperations.every(op => compatibleOps.includes(op.type));
  }

  async coordinateSharedConfiguration(repositories) {
    const coordination = {
      id: this.generateCoordinationId(),
      repositories,
      sharedConfigs: new Map(),
      conflicts: [],
      resolutions: [],
      status: 'analyzing',
      createdAt: new Date()
    };

    try {
      console.log(`Coordinating shared configuration for ${repositories.length} repositories...`);

      // Identify shared configurations
      for (const repo of repositories) {
        const configs = await this.getRepositoryConfigurations(repo);
        
        for (const config of configs) {
          const key = this.getConfigurationKey(config);
          
          if (!coordination.sharedConfigs.has(key)) {
            coordination.sharedConfigs.set(key, []);
          }
          
          coordination.sharedConfigs.get(key).push({
            repository: repo,
            config
          });
        }
      }

      // Detect conflicts
      for (const [key, configs] of coordination.sharedConfigs) {
        if (configs.length > 1) {
          const conflict = this.analyzeConfigurationConflict(key, configs);
          if (conflict.hasConflict) {
            coordination.conflicts.push(conflict);
          }
        }
      }

      // Generate resolutions
      for (const conflict of coordination.conflicts) {
        const resolution = await this.generateResolution(conflict);
        coordination.resolutions.push(resolution);
      }

      coordination.status = coordination.conflicts.length > 0 ? 'conflicts_detected' : 'coordinated';
      
      console.log(`Configuration coordination completed with ${coordination.conflicts.length} conflicts`);
      return coordination;
      
    } catch (error) {
      coordination.status = 'failed';
      coordination.error = error.message;
      console.error('Configuration coordination failed:', error.message);
      throw error;
    }
  }

  async getRepositoryConfigurations(repository) {
    // This would integrate with the dependency manager to get configurations
    // For now, return a placeholder implementation
    const configs = [];
    
    try {
      // Common configuration types to check
      const configTypes = [
        { type: 'nginx', pattern: 'server_name', file: 'nginx.conf' },
        { type: 'docker-compose', pattern: 'ports', file: 'docker-compose.yml' },
        { type: 'env', pattern: 'PORT=', file: '.env' },
        { type: 'k8s', pattern: 'port:', file: 'k8s/*.yaml' }
      ];
      
      for (const configType of configTypes) {
        // Simulate configuration extraction
        configs.push({
          type: configType.type,
          repository,
          source: configType.file,
          key: configType.pattern,
          value: `${repository}-${configType.type}-config`,
          extracted: true
        });
      }
    } catch (error) {
      console.error(`Failed to get configurations for ${repository}:`, error.message);
    }
    
    return configs;
  }

  getConfigurationKey(config) {
    return `${config.type}:${config.key}`;
  }

  analyzeConfigurationConflict(key, configs) {
    const conflict = {
      id: this.generateConflictId(),
      key,
      type: this.getConflictType(key),
      hasConflict: false,
      severity: 'low',
      configs,
      details: {}
    };

    // Analyze based on configuration type
    const [configType] = key.split(':');
    
    switch (configType) {
      case 'nginx':
        conflict.hasConflict = this.analyzeNginxConflict(configs, conflict);
        break;
      case 'docker-compose':
        conflict.hasConflict = this.analyzeDockerComposeConflict(configs, conflict);
        break;
      case 'env':
        conflict.hasConflict = this.analyzeEnvironmentConflict(configs, conflict);
        break;
      case 'k8s':
        conflict.hasConflict = this.analyzeKubernetesConflict(configs, conflict);
        break;
      default:
        conflict.hasConflict = this.analyzeGenericConflict(configs, conflict);
    }

    return conflict;
  }

  analyzeNginxConflict(configs, conflict) {
    const domains = configs.map(c => c.value);
    const uniqueDomains = new Set(domains);
    
    if (uniqueDomains.size < domains.length) {
      conflict.severity = 'high';
      conflict.details = {
        conflictingDomains: domains.filter((domain, index) => 
          domains.indexOf(domain) !== index
        ),
        affectedRepositories: configs.map(c => c.repository)
      };
      return true;
    }
    
    return false;
  }

  analyzeDockerComposeConflict(configs, conflict) {
    const ports = configs.map(c => this.extractPortFromConfig(c.value));
    const uniquePorts = new Set(ports);
    
    if (uniquePorts.size < ports.length) {
      conflict.severity = 'high';
      conflict.details = {
        conflictingPorts: ports.filter((port, index) => 
          ports.indexOf(port) !== index
        ),
        affectedRepositories: configs.map(c => c.repository)
      };
      return true;
    }
    
    return false;
  }

  analyzeEnvironmentConflict(configs, conflict) {
    const values = configs.map(c => c.value);
    const uniqueValues = new Set(values);
    
    if (uniqueValues.size > 1) {
      conflict.severity = 'medium';
      conflict.details = {
        conflictingValues: Array.from(uniqueValues),
        affectedRepositories: configs.map(c => c.repository)
      };
      return true;
    }
    
    return false;
  }

  analyzeKubernetesConflict(configs, conflict) {
    // Similar to docker-compose port analysis
    return this.analyzeDockerComposeConflict(configs, conflict);
  }

  analyzeGenericConflict(configs, conflict) {
    const values = configs.map(c => c.value);
    const uniqueValues = new Set(values);
    
    return uniqueValues.size > 1;
  }

  extractPortFromConfig(configValue) {
    // Extract port from various formats like "8080:80", "8080", etc.
    const portMatch = configValue.match(/(\d+)/);
    return portMatch ? portMatch[1] : configValue;
  }

  getConflictType(key) {
    const [configType] = key.split(':');
    
    const typeMap = {
      'nginx': 'nginx-domain',
      'docker-compose': 'port-binding',
      'env': 'environment-variable',
      'k8s': 'kubernetes-resource'
    };
    
    return typeMap[configType] || 'generic-conflict';
  }

  async generateResolution(conflict) {
    const resolution = {
      id: this.generateResolutionId(),
      conflictId: conflict.id,
      type: conflict.type,
      strategies: [],
      recommendedStrategy: null,
      createdAt: new Date()
    };

    switch (conflict.type) {
      case 'nginx-domain':
        resolution.strategies = [
          {
            name: 'subdomain-separation',
            description: 'Use unique subdomains for each repository',
            automatic: true,
            confidence: 0.9,
            changes: this.generateSubdomainChanges(conflict)
          },
          {
            name: 'path-based-routing',
            description: 'Use path-based routing with shared domain',
            automatic: true,
            confidence: 0.8,
            changes: this.generatePathRoutingChanges(conflict)
          },
          {
            name: 'port-based-separation',
            description: 'Use different ports for each service',
            automatic: true,
            confidence: 0.7,
            changes: this.generatePortSeparationChanges(conflict)
          }
        ];
        break;
        
      case 'port-binding':
        resolution.strategies = [
          {
            name: 'port-reassignment',
            description: 'Assign different ports to avoid conflicts',
            automatic: true,
            confidence: 0.95,
            changes: this.generatePortReassignment(conflict)
          },
          {
            name: 'service-consolidation',
            description: 'Consolidate services into fewer ports',
            automatic: false,
            confidence: 0.6,
            changes: this.generateServiceConsolidation(conflict)
          }
        ];
        break;
        
      case 'environment-variable':
        resolution.strategies = [
          {
            name: 'value-standardization',
            description: 'Use the most common value across repositories',
            automatic: true,
            confidence: 0.8,
            changes: this.generateValueStandardization(conflict)
          },
          {
            name: 'repository-specific-override',
            description: 'Allow repository-specific overrides',
            automatic: false,
            confidence: 0.9,
            changes: this.generateRepositoryOverrides(conflict)
          }
        ];
        break;
        
      case 'kubernetes-resource':
        resolution.strategies = [
          {
            name: 'namespace-separation',
            description: 'Use separate namespaces for each repository',
            automatic: true,
            confidence: 0.9,
            changes: this.generateNamespaceSeparation(conflict)
          },
          {
            name: 'resource-name-prefixing',
            description: 'Add repository prefixes to resource names',
            automatic: true,
            confidence: 0.8,
            changes: this.generateResourcePrefixing(conflict)
          }
        ];
        break;
    }

    // Select recommended strategy
    resolution.recommendedStrategy = resolution.strategies
      .filter(s => s.automatic)
      .sort((a, b) => b.confidence - a.confidence)[0];

    return resolution;
  }

  generateSubdomainChanges(conflict) {
    const changes = [];
    
    conflict.configs.forEach((config, index) => {
      const subdomain = config.repository.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'nginx-config',
        operation: 'replace',
        from: config.value,
        to: `${subdomain}.example.com`,
        description: `Update server_name to use unique subdomain`
      });
    });
    
    return changes;
  }

  generatePathRoutingChanges(conflict) {
    const changes = [];
    
    conflict.configs.forEach((config, index) => {
      const pathPrefix = `/${config.repository}`;
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'nginx-config',
        operation: 'modify',
        changes: [
          { add: `location ${pathPrefix} {` },
          { add: `  proxy_pass http://localhost:${8080 + index};` },
          { add: `  proxy_set_header Host $host;` },
          { add: `}` }
        ],
        description: `Add path-based routing for ${pathPrefix}`
      });
    });
    
    return changes;
  }

  generatePortSeparationChanges(conflict) {
    const changes = [];
    let basePort = 8080;
    
    conflict.configs.forEach((config, index) => {
      const newPort = basePort + index;
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'nginx-config',
        operation: 'replace',
        from: config.value,
        to: `${config.repository}.example.com:${newPort}`,
        description: `Use unique port ${newPort} for ${config.repository}`
      });
    });
    
    return changes;
  }

  generatePortReassignment(conflict) {
    const changes = [];
    let basePort = 8080;
    
    conflict.configs.forEach((config, index) => {
      if (index === 0) return; // Keep first repository's port
      
      const newPort = basePort + index;
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'docker-compose',
        operation: 'replace',
        from: config.value,
        to: `${newPort}:80`,
        description: `Reassign port to ${newPort} to avoid conflict`
      });
    });
    
    return changes;
  }

  generateServiceConsolidation(conflict) {
    const changes = [];
    const primaryRepo = conflict.configs[0].repository;
    
    conflict.configs.slice(1).forEach(config => {
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'docker-compose',
        operation: 'remove',
        target: 'ports section',
        description: `Remove port binding, service will be accessed through ${primaryRepo}`
      });
      
      changes.push({
        repository: primaryRepo,
        file: 'nginx.conf',
        type: 'nginx-config',
        operation: 'add',
        content: `location /${config.repository} { proxy_pass http://${config.repository}:80; }`,
        description: `Add routing for ${config.repository} through main service`
      });
    });
    
    return changes;
  }

  generateValueStandardization(conflict) {
    const changes = [];
    const values = conflict.configs.map(c => c.value);
    const valueCount = values.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    
    const standardValue = Object.keys(valueCount)
      .sort((a, b) => valueCount[b] - valueCount[a])[0];
    
    conflict.configs.forEach(config => {
      if (config.value !== standardValue) {
        changes.push({
          repository: config.repository,
          file: config.source,
          type: 'environment',
          operation: 'replace',
          from: config.value,
          to: standardValue,
          description: `Standardize value to most common: ${standardValue}`
        });
      }
    });
    
    return changes;
  }

  generateRepositoryOverrides(conflict) {
    const changes = [];
    
    conflict.configs.forEach(config => {
      const overrideFile = `.env.${config.repository}`;
      
      changes.push({
        repository: config.repository,
        file: overrideFile,
        type: 'environment',
        operation: 'create',
        content: `${conflict.key.split(':')[1]}=${config.value}`,
        description: `Create repository-specific override file`
      });
      
      changes.push({
        repository: config.repository,
        file: 'docker-compose.yml',
        type: 'docker-compose',
        operation: 'modify',
        changes: [
          { section: 'services', service: 'main', add: `env_file: ${overrideFile}` }
        ],
        description: `Add override file to service configuration`
      });
    });
    
    return changes;
  }

  generateNamespaceSeparation(conflict) {
    const changes = [];
    
    conflict.configs.forEach(config => {
      const namespace = config.repository.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      
      changes.push({
        repository: config.repository,
        file: 'k8s/namespace.yaml',
        type: 'kubernetes',
        operation: 'create',
        content: `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${namespace}`,
        description: `Create dedicated namespace for ${config.repository}`
      });
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'kubernetes',
        operation: 'add',
        content: `namespace: ${namespace}`,
        description: `Add namespace to resource metadata`
      });
    });
    
    return changes;
  }

  generateResourcePrefixing(conflict) {
    const changes = [];
    
    conflict.configs.forEach(config => {
      const prefix = config.repository.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      
      changes.push({
        repository: config.repository,
        file: config.source,
        type: 'kubernetes',
        operation: 'replace',
        from: 'name: ',
        to: `name: ${prefix}-`,
        description: `Add repository prefix to resource names`
      });
    });
    
    return changes;
  }

  async applyResolution(resolution, strategyName) {
    const strategy = resolution.strategies.find(s => s.name === strategyName);
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    const results = [];
    
    console.log(`Applying resolution strategy: ${strategy.name}`);
    
    for (const change of strategy.changes) {
      try {
        const result = await this.applyChange(change);
        results.push({ 
          change, 
          result, 
          success: true,
          appliedAt: new Date()
        });
      } catch (error) {
        results.push({ 
          change, 
          error: error.message, 
          success: false,
          failedAt: new Date()
        });
      }
    }

    // Store resolution results
    this.conflictResolutions.set(resolution.id, {
      ...resolution,
      appliedStrategy: strategyName,
      results,
      status: results.every(r => r.success) ? 'applied' : 'partial',
      appliedAt: new Date()
    });

    await this.saveState();
    
    this.emit('resolutionApplied', {
      resolutionId: resolution.id,
      strategy: strategyName,
      results
    });

    return results;
  }

  async applyChange(change) {
    // This would integrate with the actual file modification system
    // For now, return a simulation of the change application
    
    console.log(`Applying change to ${change.repository}:${change.file}`);
    
    const result = {
      repository: change.repository,
      file: change.file,
      operation: change.operation,
      success: true,
      details: change.description
    };

    // Simulate different change types
    switch (change.type) {
      case 'nginx-config':
        result.details = `Updated nginx configuration: ${change.description}`;
        break;
      case 'docker-compose':
        result.details = `Modified docker-compose.yml: ${change.description}`;
        break;
      case 'environment':
        result.details = `Updated environment variables: ${change.description}`;
        break;
      case 'kubernetes':
        result.details = `Applied Kubernetes changes: ${change.description}`;
        break;
      default:
        result.details = `Applied generic change: ${change.description}`;
    }

    // Simulate potential failure
    if (Math.random() < 0.1) { // 10% failure rate for simulation
      throw new Error(`Failed to apply change: ${change.description}`);
    }

    return result;
  }

  async getResourceStatus(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return null;
    }

    return {
      id: resourceId,
      type: resource.type,
      identifier: resource.identifier,
      capacity: resource.capacity,
      currentUsage: resource.currentUsage,
      available: resource.capacity - resource.currentUsage,
      owners: Array.from(resource.owners),
      locks: Array.from(resource.locks.values()),
      registeredAt: resource.registeredAt
    };
  }

  async getConflictHistory() {
    return Array.from(this.conflictResolutions.values())
      .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  }

  generateClaimId() {
    return `claim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateCoordinationId() {
    return `coord_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  generateConflictId() {
    return `conflict_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateResolutionId() {
    return `resolution_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  // Cleanup expired locks
  async cleanupExpiredLocks() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [resourceId, resource] of this.resources) {
      for (const [claimId, lock] of resource.locks) {
        if (lock.expiresAt && lock.expiresAt < now) {
          await this.releaseResource(resourceId, claimId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired resource locks`);
      this.emit('locksCleanedUp', { count: cleanedCount });
    }

    return cleanedCount;
  }

  // Get overall system health
  getSystemHealth() {
    const totalResources = this.resources.size;
    const totalLocks = Array.from(this.resources.values())
      .reduce((sum, resource) => sum + resource.locks.size, 0);
    
    const resourceUtilization = Array.from(this.resources.values())
      .map(resource => resource.currentUsage / resource.capacity)
      .reduce((sum, util) => sum + util, 0) / totalResources;

    const activeConflicts = Array.from(this.conflictResolutions.values())
      .filter(resolution => resolution.status === 'partial').length;

    return {
      totalResources,
      totalLocks,
      resourceUtilization: Math.round(resourceUtilization * 100) / 100,
      activeConflicts,
      systemStatus: activeConflicts === 0 ? 'healthy' : 'conflicts',
      lastUpdated: new Date()
    };
  }
}

module.exports = SharedResourceManager;
const { createLogger } = require('../../config/logging');
const fs = require('fs').promises;
const path = require('path');

class DependencyAnalyzer {
  constructor(options = {}) {
    this.logger = createLogger('dependency-analyzer');
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../data/dependency-cache');
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours
    this.dependencyCache = new Map();
    
    this.initializeCache();
  }

  async initializeCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.logger.info('Dependency analyzer cache initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize dependency cache', error);
    }
  }

  async analyzeDependencies(repositories) {
    this.logger.info(`Analyzing dependencies for ${repositories.length} repositories`);
    
    const analysis = {
      repositories: repositories.length,
      dependencies: {},
      dependencyTypes: {},
      executionOrder: [],
      cycles: [],
      criticalPath: [],
      parallelGroups: [],
      riskAssessment: {}
    };

    try {
      // Build dependency graph
      const dependencyGraph = await this.buildDependencyGraph(repositories);
      analysis.dependencies = dependencyGraph;

      // Analyze dependency types
      analysis.dependencyTypes = this.analyzeDependencyTypes(dependencyGraph);

      // Detect cycles
      analysis.cycles = this.detectCycles(dependencyGraph);
      
      if (analysis.cycles.length > 0) {
        throw new Error(`Circular dependencies detected: ${analysis.cycles.map(c => c.join(' -> ')).join(', ')}`);
      }

      // Calculate execution order
      analysis.executionOrder = this.calculateExecutionOrder(dependencyGraph);

      // Group parallel executions
      analysis.parallelGroups = this.groupParallelExecutions(dependencyGraph, analysis.executionOrder);

      // Calculate critical path
      analysis.criticalPath = this.calculateCriticalPath(dependencyGraph, repositories);

      // Assess risks
      analysis.riskAssessment = this.assessRisks(dependencyGraph, repositories);

      this.logger.info('Dependency analysis completed', {
        repositories: analysis.repositories,
        dependencies: Object.keys(analysis.dependencies).length,
        executionOrder: analysis.executionOrder.length,
        parallelGroups: analysis.parallelGroups.length,
        cycles: analysis.cycles.length
      });

      return analysis;
    } catch (error) {
      this.logger.error('Dependency analysis failed', error);
      throw error;
    }
  }

  async buildDependencyGraph(repositories) {
    const dependencyGraph = {};
    
    for (const repo of repositories) {
      const dependencies = await this.getRepositoryDependencies(repo, repositories);
      dependencyGraph[repo] = dependencies;
    }
    
    return dependencyGraph;
  }

  async getRepositoryDependencies(repository, allRepositories) {
    // Check cache first
    const cacheKey = `deps:${repository}`;
    if (this.dependencyCache.has(cacheKey)) {
      const cached = this.dependencyCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.dependencies;
      }
    }

    const dependencies = await this.detectDependencies(repository, allRepositories);
    
    // Cache the result
    this.dependencyCache.set(cacheKey, {
      dependencies,
      timestamp: Date.now()
    });

    return dependencies;
  }

  async detectDependencies(repository, allRepositories) {
    const dependencies = [];

    // Infrastructure dependencies (simple heuristics)
    if (this.isApplicationRepository(repository)) {
      const infraRepos = allRepositories.filter(repo => this.isInfrastructureRepository(repo));
      dependencies.push(...infraRepos);
    }

    // Service dependencies
    const serviceDeps = await this.detectServiceDependencies(repository, allRepositories);
    dependencies.push(...serviceDeps);

    // Configuration dependencies
    const configDeps = await this.detectConfigurationDependencies(repository, allRepositories);
    dependencies.push(...configDeps);

    // Network dependencies
    const networkDeps = await this.detectNetworkDependencies(repository, allRepositories);
    dependencies.push(...networkDeps);

    // Remove duplicates and self-dependencies
    return [...new Set(dependencies)].filter(dep => dep !== repository);
  }

  isInfrastructureRepository(repository) {
    const infraPatterns = [
      /infrastructure/i,
      /docker-compose/i,
      /kubernetes/i,
      /k8s/i,
      /terraform/i,
      /ansible/i,
      /base/i,
      /platform/i
    ];
    
    return infraPatterns.some(pattern => pattern.test(repository));
  }

  isApplicationRepository(repository) {
    const appPatterns = [
      /app/i,
      /service/i,
      /api/i,
      /frontend/i,
      /backend/i,
      /web/i,
      /mobile/i,
      /client/i
    ];
    
    return appPatterns.some(pattern => pattern.test(repository)) && 
           !this.isInfrastructureRepository(repository);
  }

  async detectServiceDependencies(repository, allRepositories) {
    const dependencies = [];
    
    // Database dependencies
    if (this.requiresDatabase(repository)) {
      const dbRepos = allRepositories.filter(repo => this.isDatabaseRepository(repo));
      dependencies.push(...dbRepos);
    }

    // Message queue dependencies
    if (this.requiresMessageQueue(repository)) {
      const mqRepos = allRepositories.filter(repo => this.isMessageQueueRepository(repo));
      dependencies.push(...mqRepos);
    }

    // Cache dependencies
    if (this.requiresCache(repository)) {
      const cacheRepos = allRepositories.filter(repo => this.isCacheRepository(repo));
      dependencies.push(...cacheRepos);
    }

    return dependencies;
  }

  async detectConfigurationDependencies(repository, allRepositories) {
    const dependencies = [];
    
    // Configuration repositories
    if (this.requiresConfiguration(repository)) {
      const configRepos = allRepositories.filter(repo => this.isConfigurationRepository(repo));
      dependencies.push(...configRepos);
    }

    // Secret management
    if (this.requiresSecrets(repository)) {
      const secretRepos = allRepositories.filter(repo => this.isSecretRepository(repo));
      dependencies.push(...secretRepos);
    }

    return dependencies;
  }

  async detectNetworkDependencies(repository, allRepositories) {
    const dependencies = [];
    
    // Load balancer dependencies
    if (this.requiresLoadBalancer(repository)) {
      const lbRepos = allRepositories.filter(repo => this.isLoadBalancerRepository(repo));
      dependencies.push(...lbRepos);
    }

    // Proxy dependencies
    if (this.requiresProxy(repository)) {
      const proxyRepos = allRepositories.filter(repo => this.isProxyRepository(repo));
      dependencies.push(...proxyRepos);
    }

    return dependencies;
  }

  // Helper methods for repository classification
  requiresDatabase(repository) {
    const dbPatterns = [/api/i, /backend/i, /service/i, /app/i];
    return dbPatterns.some(pattern => pattern.test(repository));
  }

  isDatabaseRepository(repository) {
    const dbPatterns = [/database/i, /db/i, /postgres/i, /mysql/i, /mongo/i, /redis/i];
    return dbPatterns.some(pattern => pattern.test(repository));
  }

  requiresMessageQueue(repository) {
    const mqPatterns = [/worker/i, /job/i, /queue/i, /async/i];
    return mqPatterns.some(pattern => pattern.test(repository));
  }

  isMessageQueueRepository(repository) {
    const mqPatterns = [/rabbitmq/i, /kafka/i, /sqs/i, /queue/i];
    return mqPatterns.some(pattern => pattern.test(repository));
  }

  requiresCache(repository) {
    const cachePatterns = [/api/i, /web/i, /frontend/i];
    return cachePatterns.some(pattern => pattern.test(repository));
  }

  isCacheRepository(repository) {
    const cachePatterns = [/redis/i, /memcached/i, /cache/i];
    return cachePatterns.some(pattern => pattern.test(repository));
  }

  requiresConfiguration(repository) {
    return true; // Most repositories require some configuration
  }

  isConfigurationRepository(repository) {
    const configPatterns = [/config/i, /settings/i, /env/i];
    return configPatterns.some(pattern => pattern.test(repository));
  }

  requiresSecrets(repository) {
    const secretPatterns = [/api/i, /backend/i, /service/i, /app/i];
    return secretPatterns.some(pattern => pattern.test(repository));
  }

  isSecretRepository(repository) {
    const secretPatterns = [/secrets/i, /vault/i, /keys/i];
    return secretPatterns.some(pattern => pattern.test(repository));
  }

  requiresLoadBalancer(repository) {
    const lbPatterns = [/web/i, /frontend/i, /api/i];
    return lbPatterns.some(pattern => pattern.test(repository));
  }

  isLoadBalancerRepository(repository) {
    const lbPatterns = [/nginx/i, /haproxy/i, /traefik/i, /lb/i, /loadbalancer/i];
    return lbPatterns.some(pattern => pattern.test(repository));
  }

  requiresProxy(repository) {
    const proxyPatterns = [/web/i, /frontend/i, /api/i];
    return proxyPatterns.some(pattern => pattern.test(repository));
  }

  isProxyRepository(repository) {
    const proxyPatterns = [/proxy/i, /nginx/i, /traefik/i];
    return proxyPatterns.some(pattern => pattern.test(repository));
  }

  analyzeDependencyTypes(dependencyGraph) {
    const types = {
      infrastructure: [],
      service: [],
      configuration: [],
      network: [],
      application: []
    };

    for (const repo of Object.keys(dependencyGraph)) {
      if (this.isInfrastructureRepository(repo)) {
        types.infrastructure.push(repo);
      } else if (this.isApplicationRepository(repo)) {
        types.application.push(repo);
      } else if (this.isConfigurationRepository(repo)) {
        types.configuration.push(repo);
      } else if (this.isProxyRepository(repo) || this.isLoadBalancerRepository(repo)) {
        types.network.push(repo);
      } else {
        types.service.push(repo);
      }
    }

    return types;
  }

  detectCycles(dependencyGraph) {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const detectCycle = (node, path) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart).concat([node]));
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = dependencyGraph[node] || [];
      for (const dep of dependencies) {
        detectCycle(dep, path.concat([node]));
      }

      recursionStack.delete(node);
    };

    for (const node of Object.keys(dependencyGraph)) {
      if (!visited.has(node)) {
        detectCycle(node, []);
      }
    }

    return cycles;
  }

  calculateExecutionOrder(dependencyGraph) {
    const visited = new Set();
    const recursionStack = new Set();
    const result = [];

    const topologicalSort = (node) => {
      if (recursionStack.has(node)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = dependencyGraph[node] || [];
      for (const dep of dependencies) {
        topologicalSort(dep);
      }

      recursionStack.delete(node);
      result.unshift(node);
    };

    for (const node of Object.keys(dependencyGraph)) {
      if (!visited.has(node)) {
        topologicalSort(node);
      }
    }

    return result;
  }

  groupParallelExecutions(dependencyGraph, executionOrder) {
    const groups = [];
    const processed = new Set();
    
    for (const repo of executionOrder) {
      if (processed.has(repo)) continue;
      
      const parallelGroup = [repo];
      processed.add(repo);
      
      // Find repositories that can run in parallel with this one
      for (const otherRepo of executionOrder) {
        if (processed.has(otherRepo)) continue;
        
        if (this.canRunInParallel(repo, otherRepo, dependencyGraph)) {
          parallelGroup.push(otherRepo);
          processed.add(otherRepo);
        }
      }
      
      groups.push(parallelGroup);
    }
    
    return groups;
  }

  canRunInParallel(repo1, repo2, dependencyGraph) {
    const deps1 = dependencyGraph[repo1] || [];
    const deps2 = dependencyGraph[repo2] || [];
    
    // Cannot run in parallel if one depends on the other
    if (deps1.includes(repo2) || deps2.includes(repo1)) {
      return false;
    }
    
    // Cannot run in parallel if they have conflicting dependencies
    if (this.hasConflictingDependencies(deps1, deps2)) {
      return false;
    }
    
    return true;
  }

  hasConflictingDependencies(deps1, deps2) {
    // Simple heuristic: check for shared critical resources
    const criticalResources = ['database', 'storage', 'network'];
    
    for (const resource of criticalResources) {
      const deps1HasResource = deps1.some(dep => dep.toLowerCase().includes(resource));
      const deps2HasResource = deps2.some(dep => dep.toLowerCase().includes(resource));
      
      if (deps1HasResource && deps2HasResource) {
        return true;
      }
    }
    
    return false;
  }

  calculateCriticalPath(dependencyGraph, repositories) {
    // Find the longest path through the dependency graph
    const memo = new Map();
    
    const getLongestPath = (node) => {
      if (memo.has(node)) {
        return memo.get(node);
      }
      
      const dependencies = dependencyGraph[node] || [];
      if (dependencies.length === 0) {
        memo.set(node, { length: 1, path: [node] });
        return memo.get(node);
      }
      
      let longestPath = { length: 0, path: [] };
      for (const dep of dependencies) {
        const depPath = getLongestPath(dep);
        if (depPath.length > longestPath.length) {
          longestPath = depPath;
        }
      }
      
      const result = {
        length: longestPath.length + 1,
        path: [node, ...longestPath.path]
      };
      
      memo.set(node, result);
      return result;
    };
    
    let criticalPath = { length: 0, path: [] };
    for (const repo of repositories) {
      const path = getLongestPath(repo);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }
    
    return criticalPath.path;
  }

  assessRisks(dependencyGraph, repositories) {
    const risks = {
      singlePointsOfFailure: [],
      highlyConnectedNodes: [],
      criticalDependencies: [],
      bottlenecks: [],
      riskScore: 0
    };
    
    // Identify single points of failure
    for (const repo of repositories) {
      const dependents = this.getDependents(repo, dependencyGraph);
      if (dependents.length > 3) {
        risks.singlePointsOfFailure.push({
          repository: repo,
          dependents: dependents.length,
          impact: 'high'
        });
      }
    }
    
    // Identify highly connected nodes
    for (const repo of repositories) {
      const totalConnections = (dependencyGraph[repo] || []).length + 
                              this.getDependents(repo, dependencyGraph).length;
      if (totalConnections > 5) {
        risks.highlyConnectedNodes.push({
          repository: repo,
          connections: totalConnections,
          risk: 'complexity'
        });
      }
    }
    
    // Identify critical dependencies
    for (const repo of repositories) {
      const dependencies = dependencyGraph[repo] || [];
      for (const dep of dependencies) {
        if (this.isCriticalDependency(dep, dependencyGraph)) {
          risks.criticalDependencies.push({
            repository: repo,
            dependency: dep,
            criticality: 'high'
          });
        }
      }
    }
    
    // Calculate overall risk score
    risks.riskScore = this.calculateRiskScore(risks);
    
    return risks;
  }

  getDependents(repository, dependencyGraph) {
    const dependents = [];
    for (const [repo, deps] of Object.entries(dependencyGraph)) {
      if (deps.includes(repository)) {
        dependents.push(repo);
      }
    }
    return dependents;
  }

  isCriticalDependency(dependency, dependencyGraph) {
    // A dependency is critical if many repositories depend on it
    const dependents = this.getDependents(dependency, dependencyGraph);
    return dependents.length > 2 || this.isInfrastructureRepository(dependency);
  }

  calculateRiskScore(risks) {
    let score = 0;
    
    // Weight different risk factors
    score += risks.singlePointsOfFailure.length * 10;
    score += risks.highlyConnectedNodes.length * 5;
    score += risks.criticalDependencies.length * 3;
    score += risks.bottlenecks.length * 7;
    
    // Normalize to 0-100 scale
    return Math.min(100, score);
  }

  async saveDependencyGraph(repositories, dependencyGraph) {
    try {
      const cacheFile = path.join(this.cacheDir, `graph-${Date.now()}.json`);
      await fs.writeFile(cacheFile, JSON.stringify({
        timestamp: new Date(),
        repositories,
        dependencyGraph
      }, null, 2));
      
      this.logger.info(`Dependency graph saved to ${cacheFile}`);
    } catch (error) {
      this.logger.warn('Failed to save dependency graph', error);
    }
  }

  async loadDependencyGraph(timestamp) {
    try {
      const cacheFile = path.join(this.cacheDir, `graph-${timestamp}.json`);
      const data = await fs.readFile(cacheFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.warn('Failed to load dependency graph', error);
      return null;
    }
  }
}

module.exports = DependencyAnalyzer;
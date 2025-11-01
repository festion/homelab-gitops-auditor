const { Octokit } = require('@octokit/rest');
const path = require('path');
const yaml = require('js-yaml');

class RepositoryDependencyManager {
  constructor(services) {
    this.github = services.github;
    this.storage = services.storage;
    this.dependencies = new Map();
    this.sharedResources = new Map();
    
    this.loadDependencyGraph();
  }

  async loadDependencyGraph() {
    try {
      const storedGraph = await this.storage.get('dependency-graph');
      if (storedGraph) {
        this.dependencies = new Map(storedGraph.dependencies);
        this.sharedResources = new Map(storedGraph.sharedResources);
      }
    } catch (error) {
      console.warn('Could not load dependency graph:', error.message);
    }
  }

  async saveDependencyGraph() {
    try {
      await this.storage.set('dependency-graph', {
        dependencies: Array.from(this.dependencies.entries()),
        sharedResources: Array.from(this.sharedResources.entries()),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to save dependency graph:', error.message);
    }
  }

  async analyzeDependencies(repositories) {
    const analysis = {
      directDependencies: new Map(),
      transitiveDependencies: new Map(),
      circularDependencies: [],
      deploymentOrder: [],
      analysisMetadata: {
        analyzedAt: new Date(),
        repositoryCount: repositories.length,
        dependencyCount: 0
      }
    };

    console.log(`Analyzing dependencies for ${repositories.length} repositories...`);

    for (const repo of repositories) {
      try {
        const deps = await this.extractRepositoryDependencies(repo);
        analysis.directDependencies.set(repo, deps);
        analysis.analysisMetadata.dependencyCount += this.countDependencies(deps);
      } catch (error) {
        console.error(`Failed to analyze dependencies for ${repo}:`, error.message);
        analysis.directDependencies.set(repo, { 
          infrastructure: [], 
          services: [], 
          configurations: [], 
          external: [],
          error: error.message 
        });
      }
    }

    // Calculate transitive dependencies
    for (const [repo, deps] of analysis.directDependencies) {
      if (!deps.error) {
        analysis.transitiveDependencies.set(
          repo, 
          this.calculateTransitiveDependencies(repo, analysis.directDependencies)
        );
      }
    }

    // Detect circular dependencies
    analysis.circularDependencies = this.detectCircularDependencies(analysis.directDependencies);

    // Calculate deployment order if no circular dependencies
    if (analysis.circularDependencies.length === 0) {
      try {
        analysis.deploymentOrder = this.calculateDeploymentOrder(analysis.directDependencies);
      } catch (error) {
        console.error('Failed to calculate deployment order:', error.message);
        analysis.deploymentOrder = [];
      }
    }

    await this.saveDependencyGraph();
    return analysis;
  }

  countDependencies(deps) {
    return deps.infrastructure.length + deps.services.length + 
           deps.configurations.length + deps.external.length;
  }

  async extractRepositoryDependencies(repository) {
    const dependencies = {
      infrastructure: [],
      services: [],
      configurations: [],
      external: []
    };

    try {
      // Check docker-compose dependencies
      const dockerCompose = await this.getDockerComposeConfig(repository);
      if (dockerCompose) {
        dependencies.infrastructure.push(...this.extractDockerDependencies(dockerCompose));
      }

      // Check Kubernetes dependencies
      const k8sManifests = await this.getKubernetesManifests(repository);
      if (k8sManifests.length > 0) {
        dependencies.services.push(...this.extractK8sDependencies(k8sManifests));
      }

      // Check configuration dependencies
      const configDeps = await this.extractConfigurationDependencies(repository);
      dependencies.configurations.push(...configDeps);

      // Check external service dependencies
      const externalDeps = await this.extractExternalDependencies(repository);
      dependencies.external.push(...externalDeps);

      // Store in cache
      this.dependencies.set(repository, dependencies);

    } catch (error) {
      console.error(`Error extracting dependencies for ${repository}:`, error.message);
      throw error;
    }

    return dependencies;
  }

  async getDockerComposeConfig(repository) {
    try {
      const files = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
      
      for (const file of files) {
        try {
          const content = await this.github.getFileContent(repository, file);
          if (content) {
            return yaml.load(content);
          }
        } catch (error) {
          // File doesn't exist, continue to next
          continue;
        }
      }
      return null;
    } catch (error) {
      console.error(`Failed to get docker-compose config for ${repository}:`, error.message);
      return null;
    }
  }

  extractDockerDependencies(dockerCompose) {
    const dependencies = [];
    
    if (dockerCompose.services) {
      for (const [serviceName, service] of Object.entries(dockerCompose.services)) {
        // Service dependencies
        if (service.depends_on) {
          const dependsOn = Array.isArray(service.depends_on) 
            ? service.depends_on 
            : Object.keys(service.depends_on);
          
          dependencies.push(...dependsOn.map(dep => ({
            type: 'docker-service',
            source: serviceName,
            target: dep,
            relationship: 'depends_on'
          })));
        }

        // Network dependencies
        if (service.networks) {
          const networks = Array.isArray(service.networks) 
            ? service.networks 
            : Object.keys(service.networks);
          
          dependencies.push(...networks.map(network => ({
            type: 'docker-network',
            source: serviceName,
            target: network,
            relationship: 'uses_network'
          })));
        }

        // Volume dependencies
        if (service.volumes) {
          service.volumes.forEach(volume => {
            const volumeName = typeof volume === 'string' 
              ? volume.split(':')[0] 
              : volume.source;
            
            if (volumeName && !volumeName.startsWith('./') && !volumeName.startsWith('/')) {
              dependencies.push({
                type: 'docker-volume',
                source: serviceName,
                target: volumeName,
                relationship: 'uses_volume'
              });
            }
          });
        }
      }
    }

    return dependencies;
  }

  async getKubernetesManifests(repository) {
    try {
      const manifestPaths = [
        'k8s', 'kubernetes', 'manifests', 
        'deploy', 'deployment', '.k8s'
      ];
      
      const manifests = [];
      
      for (const manifestPath of manifestPaths) {
        try {
          const files = await this.github.getDirectoryContents(repository, manifestPath);
          for (const file of files) {
            if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
              const content = await this.github.getFileContent(repository, file.path);
              if (content) {
                const docs = yaml.loadAll(content);
                manifests.push(...docs.filter(doc => doc && doc.kind));
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist, continue
          continue;
        }
      }
      
      return manifests;
    } catch (error) {
      console.error(`Failed to get Kubernetes manifests for ${repository}:`, error.message);
      return [];
    }
  }

  extractK8sDependencies(manifests) {
    const dependencies = [];
    
    for (const manifest of manifests) {
      if (manifest.kind === 'Deployment' || manifest.kind === 'StatefulSet') {
        // Service dependencies from environment variables
        const containers = manifest.spec?.template?.spec?.containers || [];
        
        for (const container of containers) {
          if (container.env) {
            container.env.forEach(envVar => {
              if (envVar.name && envVar.name.includes('SERVICE_URL')) {
                dependencies.push({
                  type: 'k8s-service',
                  source: manifest.metadata.name,
                  target: envVar.value,
                  relationship: 'env_dependency'
                });
              }
            });
          }
        }
      }
      
      if (manifest.kind === 'Service') {
        // Service selector dependencies
        if (manifest.spec?.selector) {
          dependencies.push({
            type: 'k8s-selector',
            source: manifest.metadata.name,
            target: JSON.stringify(manifest.spec.selector),
            relationship: 'selects_pods'
          });
        }
      }
    }
    
    return dependencies;
  }

  async extractConfigurationDependencies(repository) {
    const dependencies = [];
    
    try {
      // Check for configuration files
      const configFiles = [
        '.env', '.env.example', '.env.template',
        'config.json', 'config.yaml', 'config.yml',
        'settings.json', 'settings.yaml', 'settings.yml'
      ];
      
      for (const configFile of configFiles) {
        try {
          const content = await this.github.getFileContent(repository, configFile);
          if (content) {
            const configDeps = this.parseConfigurationDependencies(content, configFile);
            dependencies.push(...configDeps);
          }
        } catch (error) {
          // File doesn't exist, continue
          continue;
        }
      }
    } catch (error) {
      console.error(`Failed to extract configuration dependencies for ${repository}:`, error.message);
    }
    
    return dependencies;
  }

  parseConfigurationDependencies(content, filename) {
    const dependencies = [];
    
    try {
      if (filename.endsWith('.json')) {
        const config = JSON.parse(content);
        this.extractConfigReferences(config, dependencies, filename);
      } else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
        const config = yaml.load(content);
        this.extractConfigReferences(config, dependencies, filename);
      } else if (filename.startsWith('.env')) {
        // Parse environment variables
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('=') && !line.startsWith('#')) {
            const [key, value] = line.split('=', 2);
            if (value && (value.includes('://') || value.includes('.local'))) {
              dependencies.push({
                type: 'env-reference',
                source: filename,
                target: value.trim(),
                relationship: 'env_var',
                key: key.trim()
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to parse configuration file ${filename}:`, error.message);
    }
    
    return dependencies;
  }

  extractConfigReferences(obj, dependencies, source, prefix = '') {
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'string') {
          if (value.includes('://') || value.includes('.local') || value.includes('{{')) {
            dependencies.push({
              type: 'config-reference',
              source,
              target: value,
              relationship: 'config_value',
              key: fullKey
            });
          }
        } else if (typeof value === 'object') {
          this.extractConfigReferences(value, dependencies, source, fullKey);
        }
      }
    }
  }

  async extractExternalDependencies(repository) {
    const dependencies = [];
    
    try {
      // Check package.json for Node.js projects
      const packageJson = await this.getPackageJson(repository);
      if (packageJson) {
        const externalDeps = this.extractPackageDependencies(packageJson);
        dependencies.push(...externalDeps);
      }
      
      // Check requirements.txt for Python projects
      const requirements = await this.getPythonRequirements(repository);
      if (requirements) {
        const pythonDeps = this.extractPythonDependencies(requirements);
        dependencies.push(...pythonDeps);
      }
      
      // Check Dockerfile for container dependencies
      const dockerfile = await this.getDockerfile(repository);
      if (dockerfile) {
        const dockerDeps = this.extractDockerfileDependencies(dockerfile);
        dependencies.push(...dockerDeps);
      }
      
    } catch (error) {
      console.error(`Failed to extract external dependencies for ${repository}:`, error.message);
    }
    
    return dependencies;
  }

  async getPackageJson(repository) {
    try {
      const content = await this.github.getFileContent(repository, 'package.json');
      return content ? JSON.parse(content) : null;
    } catch (error) {
      return null;
    }
  }

  extractPackageDependencies(packageJson) {
    const dependencies = [];
    
    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
    
    for (const depType of depTypes) {
      if (packageJson[depType]) {
        for (const [name, version] of Object.entries(packageJson[depType])) {
          dependencies.push({
            type: 'npm-package',
            source: 'package.json',
            target: name,
            relationship: depType,
            version
          });
        }
      }
    }
    
    return dependencies;
  }

  calculateTransitiveDependencies(repository, directDependencies) {
    const transitive = new Set();
    const visited = new Set();
    
    const traverse = (repo) => {
      if (visited.has(repo)) return;
      visited.add(repo);
      
      const deps = directDependencies.get(repo);
      if (!deps || deps.error) return;
      
      const allDeps = [
        ...deps.infrastructure,
        ...deps.services,
        ...deps.configurations
      ];
      
      for (const dep of allDeps) {
        if (dep.target && directDependencies.has(dep.target)) {
          transitive.add(dep.target);
          traverse(dep.target);
        }
      }
    };
    
    traverse(repository);
    return Array.from(transitive);
  }

  detectCircularDependencies(dependencyMap) {
    const circular = [];
    const visiting = new Set();
    const visited = new Set();
    
    const visit = (repo, path = []) => {
      if (visiting.has(repo)) {
        const cycleStart = path.indexOf(repo);
        circular.push(path.slice(cycleStart).concat([repo]));
        return;
      }
      
      if (visited.has(repo)) return;
      
      visiting.add(repo);
      path.push(repo);
      
      const deps = dependencyMap.get(repo);
      if (deps && !deps.error) {
        const allDeps = [
          ...deps.infrastructure,
          ...deps.services,
          ...deps.configurations
        ];
        
        for (const dep of allDeps) {
          if (dep.target && dependencyMap.has(dep.target)) {
            visit(dep.target, [...path]);
          }
        }
      }
      
      visiting.delete(repo);
      visited.add(repo);
      path.pop();
    };
    
    for (const repo of dependencyMap.keys()) {
      if (!visited.has(repo)) {
        visit(repo);
      }
    }
    
    return circular;
  }

  calculateDeploymentOrder(dependencyMap) {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (repo) => {
      if (visiting.has(repo)) {
        throw new Error(`Circular dependency involving ${repo}`);
      }
      if (visited.has(repo)) {
        return;
      }

      visiting.add(repo);
      
      const deps = dependencyMap.get(repo);
      if (deps && !deps.error) {
        const allDeps = [
          ...deps.infrastructure,
          ...deps.services,
          ...deps.configurations
        ].filter(dep => dep.target && dependencyMap.has(dep.target));

        for (const dep of allDeps) {
          visit(dep.target);
        }
      }

      visiting.delete(repo);
      visited.add(repo);
      order.push(repo);
    };

    for (const repo of dependencyMap.keys()) {
      if (!visited.has(repo)) {
        visit(repo);
      }
    }

    return order;
  }

  async coordinateDeployment(repositories, options = {}) {
    const coordination = {
      id: this.generateCoordinationId(),
      repositories,
      status: 'planning',
      phases: [],
      sharedResources: new Map(),
      conflicts: [],
      createdAt: new Date()
    };

    try {
      console.log(`Starting deployment coordination for ${repositories.length} repositories...`);
      
      // Analyze dependencies
      const analysis = await this.analyzeDependencies(repositories);
      
      if (analysis.circularDependencies.length > 0) {
        throw new Error(`Circular dependencies detected: ${analysis.circularDependencies.map(cycle => cycle.join(' -> ')).join(', ')}`);
      }

      // Check for resource conflicts
      coordination.conflicts = await this.checkResourceConflicts(repositories);
      
      if (coordination.conflicts.length > 0 && !options.ignoreConflicts) {
        throw new Error(`Resource conflicts detected: ${coordination.conflicts.map(c => c.resource).join(', ')}`);
      }

      // Plan deployment phases
      coordination.phases = this.planDeploymentPhases(analysis.deploymentOrder, options);
      
      coordination.status = 'ready';
      coordination.analysis = analysis;
      
      console.log(`Deployment coordination ready with ${coordination.phases.length} phases`);
      return coordination;
      
    } catch (error) {
      coordination.status = 'failed';
      coordination.error = error.message;
      console.error('Deployment coordination failed:', error.message);
      throw error;
    }
  }

  planDeploymentPhases(deploymentOrder, options) {
    const phases = [];
    const processed = new Set();
    
    while (processed.size < deploymentOrder.length) {
      const currentPhase = [];
      
      for (const repo of deploymentOrder) {
        if (processed.has(repo)) continue;
        
        // Check if all dependencies are already processed
        const deps = this.getAllDependencies(repo);
        const canDeploy = deps.every(dep => processed.has(dep) || !deploymentOrder.includes(dep));
        
        if (canDeploy) {
          currentPhase.push(repo);
          processed.add(repo);
        }
      }
      
      if (currentPhase.length === 0) {
        throw new Error('Unable to resolve deployment order - possible circular dependency');
      }
      
      phases.push({
        phase: phases.length + 1,
        repositories: currentPhase,
        parallel: options.allowParallel !== false && currentPhase.length > 1,
        estimatedDuration: this.estimatePhaseDuration(currentPhase)
      });
    }
    
    return phases;
  }

  getAllDependencies(repository) {
    const deps = this.dependencies.get(repository);
    if (!deps) return [];
    
    return [
      ...deps.infrastructure,
      ...deps.services,
      ...deps.configurations
    ].map(dep => dep.target).filter(target => target);
  }

  estimatePhaseDuration(repositories) {
    // Simple estimation based on repository count and type
    const baseTime = 30; // seconds
    const perRepoTime = 15; // seconds
    return baseTime + (repositories.length * perRepoTime);
  }

  async checkResourceConflicts(repositories) {
    const conflicts = [];
    const resourceUsage = new Map();
    
    for (const repo of repositories) {
      try {
        const resources = await this.getRepositoryResources(repo);
        
        for (const resource of resources) {
          const key = `${resource.type}:${resource.identifier}`;
          
          if (resourceUsage.has(key)) {
            conflicts.push({
              resource: key,
              repositories: [resourceUsage.get(key), repo],
              type: resource.type,
              severity: this.getConflictSeverity(resource.type),
              details: resource
            });
          } else {
            resourceUsage.set(key, repo);
          }
        }
      } catch (error) {
        console.error(`Failed to get resources for ${repo}:`, error.message);
      }
    }
    
    return conflicts;
  }

  async getRepositoryResources(repository) {
    const resources = [];
    
    try {
      // Extract port bindings
      const dockerCompose = await this.getDockerComposeConfig(repository);
      if (dockerCompose) {
        resources.push(...this.extractPortBindings(dockerCompose));
        resources.push(...this.extractVolumeMounts(dockerCompose));
        resources.push(...this.extractNetworkUsage(dockerCompose));
      }
      
      // Extract domain/subdomain usage
      const nginxConfig = await this.getNginxConfig(repository);
      if (nginxConfig) {
        resources.push(...this.extractDomainUsage(nginxConfig));
      }
    } catch (error) {
      console.error(`Failed to extract resources for ${repository}:`, error.message);
    }
    
    return resources;
  }

  extractPortBindings(dockerCompose) {
    const ports = [];
    
    if (dockerCompose.services) {
      for (const [serviceName, service] of Object.entries(dockerCompose.services)) {
        if (service.ports) {
          service.ports.forEach(port => {
            const portMapping = typeof port === 'string' ? port : `${port.published}:${port.target}`;
            const [hostPort] = portMapping.split(':');
            
            ports.push({
              type: 'port',
              identifier: hostPort,
              service: serviceName,
              mapping: portMapping
            });
          });
        }
      }
    }
    
    return ports;
  }

  extractVolumeMounts(dockerCompose) {
    const volumes = [];
    
    if (dockerCompose.services) {
      for (const [serviceName, service] of Object.entries(dockerCompose.services)) {
        if (service.volumes) {
          service.volumes.forEach(volume => {
            const volumeSpec = typeof volume === 'string' ? volume : `${volume.source}:${volume.target}`;
            const [source] = volumeSpec.split(':');
            
            if (source && !source.startsWith('./') && !source.startsWith('/')) {
              volumes.push({
                type: 'volume',
                identifier: source,
                service: serviceName,
                spec: volumeSpec
              });
            }
          });
        }
      }
    }
    
    return volumes;
  }

  extractNetworkUsage(dockerCompose) {
    const networks = [];
    
    if (dockerCompose.services) {
      for (const [serviceName, service] of Object.entries(dockerCompose.services)) {
        if (service.networks) {
          const serviceNetworks = Array.isArray(service.networks) 
            ? service.networks 
            : Object.keys(service.networks);
          
          serviceNetworks.forEach(network => {
            networks.push({
              type: 'network',
              identifier: network,
              service: serviceName
            });
          });
        }
      }
    }
    
    return networks;
  }

  async getNginxConfig(repository) {
    try {
      const nginxPaths = [
        'nginx.conf', 'nginx/nginx.conf', 'config/nginx.conf',
        'docker/nginx.conf', '.nginx/nginx.conf'
      ];
      
      for (const nginxPath of nginxPaths) {
        try {
          const content = await this.github.getFileContent(repository, nginxPath);
          if (content) {
            return content;
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  extractDomainUsage(nginxConfig) {
    const domains = [];
    const serverNameRegex = /server_name\s+([^;]+);/g;
    
    let match;
    while ((match = serverNameRegex.exec(nginxConfig)) !== null) {
      const serverNames = match[1].trim().split(/\s+/);
      
      serverNames.forEach(domain => {
        if (domain !== '_' && domain !== 'localhost') {
          domains.push({
            type: 'domain',
            identifier: domain,
            source: 'nginx'
          });
        }
      });
    }
    
    return domains;
  }

  getConflictSeverity(resourceType) {
    const severityMap = {
      'port': 'high',
      'domain': 'high',
      'volume': 'medium',
      'network': 'low'
    };
    
    return severityMap[resourceType] || 'medium';
  }

  generateCoordinationId() {
    return `coord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getPythonRequirements(repository) {
    try {
      const content = await this.github.getFileContent(repository, 'requirements.txt');
      return content;
    } catch (error) {
      return null;
    }
  }

  extractPythonDependencies(requirements) {
    const dependencies = [];
    const lines = requirements.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [name] = trimmed.split(/[>=<]/);
        dependencies.push({
          type: 'python-package',
          source: 'requirements.txt',
          target: name.trim(),
          relationship: 'pip_dependency'
        });
      }
    }
    
    return dependencies;
  }

  async getDockerfile(repository) {
    try {
      const files = ['Dockerfile', 'dockerfile', 'Dockerfile.prod', 'Dockerfile.dev'];
      
      for (const file of files) {
        try {
          const content = await this.github.getFileContent(repository, file);
          if (content) {
            return content;
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  extractDockerfileDependencies(dockerfile) {
    const dependencies = [];
    const lines = dockerfile.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Extract FROM dependencies
      if (trimmed.startsWith('FROM ')) {
        const image = trimmed.split(' ')[1];
        dependencies.push({
          type: 'docker-image',
          source: 'Dockerfile',
          target: image,
          relationship: 'base_image'
        });
      }
      
      // Extract COPY --from dependencies
      if (trimmed.includes('COPY --from=')) {
        const fromMatch = trimmed.match(/--from=([^\s]+)/);
        if (fromMatch) {
          dependencies.push({
            type: 'docker-stage',
            source: 'Dockerfile',
            target: fromMatch[1],
            relationship: 'copy_from'
          });
        }
      }
    }
    
    return dependencies;
  }
}

module.exports = RepositoryDependencyManager;
const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const app = require('../server');
const RepositoryDependencyManager = require('../services/coordination/dependencyManager');
const SharedResourceManager = require('../services/coordination/sharedResourceManager');
const { CoordinationService } = require('../services/coordination');

describe('Cross-Repository Coordination System', () => {
  let coordinationService;
  let dependencyManager;
  let resourceManager;
  let mockServices;

  beforeEach(() => {
    // Mock services
    mockServices = {
      github: {
        getFileContent: sinon.stub(),
        getDirectoryContents: sinon.stub()
      },
      storage: {
        get: sinon.stub(),
        set: sinon.stub()
      }
    };

    dependencyManager = new RepositoryDependencyManager(mockServices);
    resourceManager = new SharedResourceManager(mockServices.storage);
    coordinationService = new CoordinationService(mockServices);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('RepositoryDependencyManager', () => {
    describe('analyzeDependencies', () => {
      it('should analyze dependencies across multiple repositories', async () => {
        const repositories = ['repo1', 'repo2', 'repo3'];
        
        // Mock docker-compose content
        mockServices.github.getFileContent
          .withArgs('repo1', 'docker-compose.yml')
          .resolves(`
            version: '3.8'
            services:
              web:
                image: nginx
                depends_on:
                  - database
                ports:
                  - "8080:80"
              database:
                image: postgres
                volumes:
                  - db_data:/var/lib/postgresql/data
            volumes:
              db_data:
          `);

        mockServices.github.getFileContent
          .withArgs('repo2', 'docker-compose.yml')
          .resolves(`
            version: '3.8'
            services:
              api:
                image: node:16
                depends_on:
                  - redis
                ports:
                  - "3000:3000"
              redis:
                image: redis:alpine
          `);

        mockServices.github.getFileContent
          .withArgs('repo3', 'docker-compose.yml')
          .resolves(`
            version: '3.8'
            services:
              frontend:
                image: react-app
                ports:
                  - "3001:3000"
          `);

        const analysis = await dependencyManager.analyzeDependencies(repositories);

        expect(analysis).to.have.property('directDependencies');
        expect(analysis).to.have.property('circularDependencies');
        expect(analysis).to.have.property('deploymentOrder');
        expect(analysis.directDependencies.size).to.equal(3);
        expect(analysis.circularDependencies).to.be.an('array');
        expect(analysis.deploymentOrder).to.be.an('array');
      });

      it('should detect circular dependencies', async () => {
        const repositories = ['repo1', 'repo2'];
        
        // Create circular dependency
        sinon.stub(dependencyManager, 'extractRepositoryDependencies')
          .withArgs('repo1').resolves({
            infrastructure: [{ type: 'docker-service', target: 'repo2' }],
            services: [],
            configurations: [],
            external: []
          })
          .withArgs('repo2').resolves({
            infrastructure: [{ type: 'docker-service', target: 'repo1' }],
            services: [],
            configurations: [],
            external: []
          });

        const analysis = await dependencyManager.analyzeDependencies(repositories);

        expect(analysis.circularDependencies).to.have.length.greaterThan(0);
      });

      it('should calculate correct deployment order', async () => {
        const repositories = ['repo1', 'repo2', 'repo3'];
        
        // repo3 depends on repo2, repo2 depends on repo1
        sinon.stub(dependencyManager, 'extractRepositoryDependencies')
          .withArgs('repo1').resolves({
            infrastructure: [],
            services: [],
            configurations: [],
            external: []
          })
          .withArgs('repo2').resolves({
            infrastructure: [{ type: 'docker-service', target: 'repo1' }],
            services: [],
            configurations: [],
            external: []
          })
          .withArgs('repo3').resolves({
            infrastructure: [{ type: 'docker-service', target: 'repo2' }],
            services: [],
            configurations: [],
            external: []
          });

        const analysis = await dependencyManager.analyzeDependencies(repositories);

        expect(analysis.deploymentOrder).to.deep.equal(['repo1', 'repo2', 'repo3']);
      });
    });

    describe('coordinateDeployment', () => {
      it('should create deployment coordination plan', async () => {
        const repositories = ['repo1', 'repo2'];
        const options = { allowParallel: true };

        sinon.stub(dependencyManager, 'analyzeDependencies').resolves({
          directDependencies: new Map(),
          circularDependencies: [],
          deploymentOrder: ['repo1', 'repo2']
        });

        sinon.stub(dependencyManager, 'checkResourceConflicts').resolves([]);

        const coordination = await dependencyManager.coordinateDeployment(repositories, options);

        expect(coordination).to.have.property('id');
        expect(coordination).to.have.property('status', 'ready');
        expect(coordination).to.have.property('phases');
        expect(coordination.repositories).to.deep.equal(repositories);
      });

      it('should fail coordination with circular dependencies', async () => {
        const repositories = ['repo1', 'repo2'];

        sinon.stub(dependencyManager, 'analyzeDependencies').resolves({
          circularDependencies: [['repo1', 'repo2', 'repo1']]
        });

        try {
          await dependencyManager.coordinateDeployment(repositories);
          expect.fail('Should have thrown error for circular dependencies');
        } catch (error) {
          expect(error.message).to.include('Circular dependencies detected');
        }
      });

      it('should fail coordination with resource conflicts', async () => {
        const repositories = ['repo1', 'repo2'];

        sinon.stub(dependencyManager, 'analyzeDependencies').resolves({
          circularDependencies: [],
          deploymentOrder: ['repo1', 'repo2']
        });

        sinon.stub(dependencyManager, 'checkResourceConflicts').resolves([
          { resource: 'port:8080', repositories: ['repo1', 'repo2'] }
        ]);

        try {
          await dependencyManager.coordinateDeployment(repositories);
          expect.fail('Should have thrown error for resource conflicts');
        } catch (error) {
          expect(error.message).to.include('Resource conflicts detected');
        }
      });
    });

    describe('checkResourceConflicts', () => {
      it('should detect port conflicts', async () => {
        const repositories = ['repo1', 'repo2'];

        sinon.stub(dependencyManager, 'getRepositoryResources')
          .withArgs('repo1').resolves([
            { type: 'port', identifier: '8080', service: 'web' }
          ])
          .withArgs('repo2').resolves([
            { type: 'port', identifier: '8080', service: 'api' }
          ]);

        const conflicts = await dependencyManager.checkResourceConflicts(repositories);

        expect(conflicts).to.have.length(1);
        expect(conflicts[0].resource).to.equal('port:8080');
        expect(conflicts[0].repositories).to.deep.equal(['repo1', 'repo2']);
      });

      it('should detect domain conflicts', async () => {
        const repositories = ['repo1', 'repo2'];

        sinon.stub(dependencyManager, 'getRepositoryResources')
          .withArgs('repo1').resolves([
            { type: 'domain', identifier: 'example.com', source: 'nginx' }
          ])
          .withArgs('repo2').resolves([
            { type: 'domain', identifier: 'example.com', source: 'nginx' }
          ]);

        const conflicts = await dependencyManager.checkResourceConflicts(repositories);

        expect(conflicts).to.have.length(1);
        expect(conflicts[0].type).to.equal('domain');
      });
    });
  });

  describe('SharedResourceManager', () => {
    describe('registerSharedResource', () => {
      it('should register a new shared resource', async () => {
        const resource = {
          type: 'port',
          identifier: '8080',
          capacity: 1
        };

        const resourceId = await resourceManager.registerSharedResource(resource);

        expect(resourceId).to.be.a('string');
        expect(resourceId).to.include('port:8080');
        expect(resourceManager.resources.has(resourceId)).to.be.true;
      });
    });

    describe('claimResource', () => {
      let resourceId;

      beforeEach(async () => {
        const resource = {
          type: 'port',
          identifier: '8080',
          capacity: 1
        };
        resourceId = await resourceManager.registerSharedResource(resource);
      });

      it('should claim available resource', async () => {
        const repository = 'repo1';
        const operation = { type: 'deploy', exclusive: false };

        const claimId = await resourceManager.claimResource(resourceId, repository, operation);

        expect(claimId).to.be.a('string');
        
        const resource = resourceManager.resources.get(resourceId);
        expect(resource.locks.has(claimId)).to.be.true;
        expect(resource.owners.has(repository)).to.be.true;
      });

      it('should fail to claim resource at capacity', async () => {
        const repository1 = 'repo1';
        const repository2 = 'repo2';
        const operation = { type: 'deploy', exclusive: false };

        // Claim the resource (capacity = 1)
        await resourceManager.claimResource(resourceId, repository1, operation);

        try {
          await resourceManager.claimResource(resourceId, repository2, operation);
          expect.fail('Should have failed due to capacity');
        } catch (error) {
          expect(error.message).to.include('at capacity');
        }
      });

      it('should fail to claim exclusively locked resource', async () => {
        const repository1 = 'repo1';
        const repository2 = 'repo2';
        const exclusiveOperation = { type: 'deploy', exclusive: true };
        const normalOperation = { type: 'read', exclusive: false };

        // Claim exclusively
        await resourceManager.claimResource(resourceId, repository1, exclusiveOperation);

        try {
          await resourceManager.claimResource(resourceId, repository2, normalOperation);
          expect.fail('Should have failed due to exclusive lock');
        } catch (error) {
          expect(error.message).to.include('exclusively locked');
        }
      });
    });

    describe('releaseResource', () => {
      let resourceId;
      let claimId;

      beforeEach(async () => {
        const resource = { type: 'port', identifier: '8080', capacity: 1 };
        resourceId = await resourceManager.registerSharedResource(resource);
        
        const operation = { type: 'deploy', exclusive: false };
        claimId = await resourceManager.claimResource(resourceId, 'repo1', operation);
      });

      it('should release claimed resource', async () => {
        const released = await resourceManager.releaseResource(resourceId, claimId);

        expect(released).to.be.true;
        
        const resource = resourceManager.resources.get(resourceId);
        expect(resource.locks.has(claimId)).to.be.false;
        expect(resource.currentUsage).to.equal(0);
      });

      it('should return false for non-existent claim', async () => {
        const released = await resourceManager.releaseResource(resourceId, 'invalid-claim');

        expect(released).to.be.false;
      });
    });

    describe('coordinateSharedConfiguration', () => {
      it('should identify shared configurations', async () => {
        const repositories = ['repo1', 'repo2'];

        sinon.stub(resourceManager, 'getRepositoryConfigurations')
          .withArgs('repo1').resolves([
            { type: 'nginx', key: 'server_name', value: 'example.com' }
          ])
          .withArgs('repo2').resolves([
            { type: 'nginx', key: 'server_name', value: 'example.com' }
          ]);

        const coordination = await resourceManager.coordinateSharedConfiguration(repositories);

        expect(coordination.sharedConfigs.size).to.be.greaterThan(0);
        expect(coordination.status).to.be.oneOf(['coordinated', 'conflicts_detected']);
      });
    });

    describe('generateResolution', () => {
      it('should generate resolution strategies for nginx conflicts', async () => {
        const conflict = {
          id: 'conflict1',
          type: 'nginx-domain',
          configs: [
            { repository: 'repo1', value: 'example.com' },
            { repository: 'repo2', value: 'example.com' }
          ]
        };

        const resolution = await resourceManager.generateResolution(conflict);

        expect(resolution.strategies).to.be.an('array');
        expect(resolution.strategies.length).to.be.greaterThan(0);
        expect(resolution.recommendedStrategy).to.be.an('object');
        
        const strategy = resolution.strategies.find(s => s.name === 'subdomain-separation');
        expect(strategy).to.exist;
        expect(strategy.automatic).to.be.true;
      });

      it('should generate resolution strategies for port conflicts', async () => {
        const conflict = {
          id: 'conflict1',
          type: 'port-binding',
          configs: [
            { repository: 'repo1', value: '8080:80' },
            { repository: 'repo2', value: '8080:80' }
          ]
        };

        const resolution = await resourceManager.generateResolution(conflict);

        expect(resolution.strategies).to.be.an('array');
        
        const strategy = resolution.strategies.find(s => s.name === 'port-reassignment');
        expect(strategy).to.exist;
        expect(strategy.confidence).to.be.greaterThan(0.9);
      });
    });
  });

  describe('API Endpoints', () => {
    describe('GET /api/coordination/dependencies', () => {
      it('should return dependency analysis', async () => {
        const repositories = 'repo1,repo2,repo3';

        const response = await request(app)
          .get('/api/coordination/dependencies')
          .query({ repositories })
          .expect(200);

        expect(response.body).to.have.property('repositories');
        expect(response.body).to.have.property('directDependencies');
        expect(response.body).to.have.property('deploymentOrder');
        expect(response.body.repositories).to.deep.equal(['repo1', 'repo2', 'repo3']);
      });

      it('should return 400 for missing repositories', async () => {
        await request(app)
          .get('/api/coordination/dependencies')
          .expect(400);
      });
    });

    describe('POST /api/coordination/coordinate-deployment', () => {
      it('should coordinate deployment successfully', async () => {
        const payload = {
          repositories: ['repo1', 'repo2'],
          options: { allowParallel: true }
        };

        const response = await request(app)
          .post('/api/coordination/coordinate-deployment')
          .send(payload)
          .expect(200);

        expect(response.body).to.have.property('coordination');
        expect(response.body).to.have.property('deployment');
        expect(response.body.coordination).to.have.property('id');
        expect(response.body.coordination).to.have.property('status');
      });

      it('should return 400 for invalid payload', async () => {
        const payload = {
          repositories: [] // Empty array should fail validation
        };

        await request(app)
          .post('/api/coordination/coordinate-deployment')
          .send(payload)
          .expect(400);
      });
    });

    describe('GET /api/coordination/resource-conflicts', () => {
      it('should return resource conflicts analysis', async () => {
        const repositories = 'repo1,repo2';

        const response = await request(app)
          .get('/api/coordination/resource-conflicts')
          .query({ repositories })
          .expect(200);

        expect(response.body).to.have.property('conflicts');
        expect(response.body).to.have.property('summary');
        expect(response.body.conflicts).to.be.an('array');
      });
    });

    describe('POST /api/coordination/resolve-conflicts', () => {
      it('should resolve conflicts with dry run', async () => {
        const payload = {
          conflicts: [
            { id: 'conflict1', type: 'nginx-domain' }
          ],
          resolutionStrategy: 'subdomain-separation',
          dryRun: true
        };

        const response = await request(app)
          .post('/api/coordination/resolve-conflicts')
          .send(payload)
          .expect(200);

        expect(response.body).to.have.property('results');
        expect(response.body).to.have.property('summary');
        expect(response.body.summary.dryRun).to.be.true;
      });
    });

    describe('POST /api/coordination/resources/register', () => {
      it('should register new shared resource', async () => {
        const payload = {
          type: 'port',
          identifier: '8080',
          capacity: 1
        };

        const response = await request(app)
          .post('/api/coordination/resources/register')
          .send(payload)
          .expect(201);

        expect(response.body).to.have.property('resourceId');
        expect(response.body).to.have.property('resource');
        expect(response.body.resourceId).to.include('port:8080');
      });
    });

    describe('GET /api/coordination/health', () => {
      it('should return system health status', async () => {
        const response = await request(app)
          .get('/api/coordination/health')
          .expect(200);

        expect(response.body).to.have.property('status', 'healthy');
        expect(response.body).to.have.property('coordination');
        expect(response.body).to.have.property('services');
      });
    });
  });

  describe('CoordinationService Integration', () => {
    it('should initialize all services correctly', () => {
      expect(coordinationService.dependencyManager).to.be.instanceof(RepositoryDependencyManager);
      expect(coordinationService.resourceManager).to.be.instanceof(SharedResourceManager);
    });

    it('should provide comprehensive system health', () => {
      const health = coordinationService.getSystemHealth();

      expect(health).to.have.property('dependencyManager');
      expect(health).to.have.property('resourceManager');
      expect(health).to.have.property('coordination');
      expect(health.dependencyManager.status).to.equal('active');
    });

    it('should handle shutdown gracefully', async () => {
      const saveSpy = sinon.spy(resourceManager, 'saveState');
      
      await coordinationService.shutdown();
      
      expect(saveSpy.calledOnce).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub API failures gracefully', async () => {
      mockServices.github.getFileContent.rejects(new Error('API rate limit exceeded'));

      const repositories = ['repo1'];
      const analysis = await dependencyManager.analyzeDependencies(repositories);

      expect(analysis.directDependencies.get('repo1')).to.have.property('error');
    });

    it('should handle storage failures gracefully', async () => {
      mockServices.storage.set.rejects(new Error('Storage unavailable'));

      const resource = { type: 'port', identifier: '8080' };
      
      // Should not throw, but should log the error
      await resourceManager.registerSharedResource(resource);
      
      expect(resourceManager.resources.size).to.be.greaterThan(0);
    });

    it('should handle invalid Docker Compose files', async () => {
      mockServices.github.getFileContent
        .withArgs('repo1', 'docker-compose.yml')
        .resolves('invalid yaml content: [[[');

      const dependencies = await dependencyManager.extractRepositoryDependencies('repo1');

      expect(dependencies.infrastructure).to.be.an('array');
      expect(dependencies.infrastructure.length).to.equal(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large repository lists efficiently', async () => {
      const repositories = Array.from({ length: 100 }, (_, i) => `repo${i}`);
      
      // Mock minimal dependencies to avoid GitHub API calls
      sinon.stub(dependencyManager, 'extractRepositoryDependencies')
        .resolves({
          infrastructure: [],
          services: [],
          configurations: [],
          external: []
        });

      const startTime = Date.now();
      const analysis = await dependencyManager.analyzeDependencies(repositories);
      const duration = Date.now() - startTime;

      expect(duration).to.be.lessThan(5000); // Should complete within 5 seconds
      expect(analysis.directDependencies.size).to.equal(100);
    });

    it('should handle concurrent resource claims efficiently', async () => {
      const resource = {
        type: 'database',
        identifier: 'postgres',
        capacity: 10
      };

      const resourceId = await resourceManager.registerSharedResource(resource);
      
      const claimPromises = Array.from({ length: 10 }, (_, i) => 
        resourceManager.claimResource(resourceId, `repo${i}`, { type: 'read' })
      );

      const claims = await Promise.all(claimPromises);
      
      expect(claims).to.have.length(10);
      expect(claims.every(claim => typeof claim === 'string')).to.be.true;
    });
  });
});

// Test utilities
const TestUtils = {
  createMockDockerCompose(services = {}) {
    return {
      version: '3.8',
      services
    };
  },

  createMockKubernetesManifest(kind, name, spec = {}) {
    return {
      apiVersion: 'v1',
      kind,
      metadata: { name },
      spec
    };
  },

  createMockConflict(type, repositories) {
    return {
      id: `conflict_${Date.now()}`,
      type,
      configs: repositories.map(repo => ({
        repository: repo,
        value: `${repo}_value`
      }))
    };
  }
};

module.exports = { TestUtils };
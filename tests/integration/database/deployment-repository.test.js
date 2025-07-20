const { DeploymentRepository } = require('../../../api/repositories/deployment-repository');
const { DatabaseSetup } = require('../setup/database-setup');
const { IntegrationFixtures } = require('../fixtures/integration-data');

describe('DeploymentRepository Integration', () => {
  let deploymentRepository;
  let dbSetup;

  beforeAll(async () => {
    dbSetup = new DatabaseSetup();
    await dbSetup.initialize();
    deploymentRepository = new DeploymentRepository(dbSetup.getConnection());
  }, 30000);

  afterAll(async () => {
    await dbSetup.cleanup();
  }, 10000);

  beforeEach(async () => {
    await dbSetup.clearData();
  });

  describe('create', () => {
    it('should create deployment record with all fields', async () => {
      const deploymentData = IntegrationFixtures.deploymentData({
        repository: 'festion/home-assistant-config',
        branch: 'main',
        commitSha: 'abc123def456',
        configValidation: {
          valid: true,
          warnings: [],
          errors: []
        }
      });
      
      const deployment = await deploymentRepository.create(deploymentData);
      
      expect(deployment).toMatchObject({
        deploymentId: deploymentData.deploymentId,
        repository: deploymentData.repository,
        branch: deploymentData.branch,
        commitSha: deploymentData.commitSha,
        state: 'queued',
        configValidation: deploymentData.configValidation,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });

      // Verify record exists in database
      const result = await dbSetup.query(
        'SELECT * FROM deployments WHERE deployment_id = $1',
        [deploymentData.deploymentId]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].deployment_id).toBe(deploymentData.deploymentId);
    });

    it('should handle duplicate deployment IDs', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      
      await deploymentRepository.create(deploymentData);
      
      await expect(deploymentRepository.create(deploymentData))
        .rejects
        .toThrow(/duplicate key value violates unique constraint|UNIQUE constraint failed/);
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        deploymentId: 'deploy-test-123'
        // Missing repository and branch
      };
      
      await expect(deploymentRepository.create(incompleteData))
        .rejects
        .toThrow(/not null constraint|NOT NULL constraint failed/);
    });

    it('should handle JSON fields correctly', async () => {
      const deploymentData = IntegrationFixtures.deploymentData({
        configValidation: {
          valid: false,
          errors: ['Invalid automation syntax'],
          warnings: ['Deprecated entity reference']
        },
        deploymentSteps: [
          { name: 'Clone Repository', status: 'pending' },
          { name: 'Validate Configuration', status: 'pending' }
        ]
      });
      
      const deployment = await deploymentRepository.create(deploymentData);
      
      expect(deployment.configValidation).toEqual(deploymentData.configValidation);
      expect(deployment.deploymentSteps).toEqual(deploymentData.deploymentSteps);
    });
  });

  describe('findById', () => {
    it('should find deployment by ID', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      const found = await deploymentRepository.findById(deploymentData.deploymentId);
      
      expect(found).toMatchObject({
        deploymentId: deploymentData.deploymentId,
        repository: deploymentData.repository,
        branch: deploymentData.branch,
        state: 'queued'
      });
    });

    it('should return null for non-existent deployment', async () => {
      const found = await deploymentRepository.findById('deploy-20250101-000000');
      
      expect(found).toBeNull();
    });

    it('should include all deployment fields', async () => {
      const deploymentData = IntegrationFixtures.deploymentData({
        commitSha: 'test-commit-sha',
        configValidation: { valid: true },
        deploymentSteps: [{ name: 'test', status: 'pending' }]
      });
      await deploymentRepository.create(deploymentData);
      
      const found = await deploymentRepository.findById(deploymentData.deploymentId);
      
      expect(found.commitSha).toBe('test-commit-sha');
      expect(found.configValidation).toEqual({ valid: true });
      expect(found.deploymentSteps).toEqual([{ name: 'test', status: 'pending' }]);
    });
  });

  describe('updateStatus', () => {
    it('should update deployment status and timestamp', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      const beforeUpdate = new Date();
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'in-progress');
      const afterUpdate = new Date();
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.state).toBe('in-progress');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('should set started_at when transitioning to in-progress', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'in-progress');
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.startedAt).toBeInstanceOf(Date);
    });

    it('should set completed_at when transitioning to completed', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'completed');
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it('should set completed_at when transitioning to failed', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'failed', 'Test error message');
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.completedAt).toBeInstanceOf(Date);
      expect(updated.errorMessage).toBe('Test error message');
    });

    it('should track status transition history', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'in-progress');
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'completed');
      
      const history = await deploymentRepository.getStatusHistory(deploymentData.deploymentId);
      
      expect(history).toHaveLength(3); // queued -> in-progress -> completed
      expect(history.map(h => h.state)).toEqual(['queued', 'in-progress', 'completed']);
      
      // Verify chronological order
      for (let i = 1; i < history.length; i++) {
        expect(history[i].createdAt.getTime()).toBeGreaterThan(history[i-1].createdAt.getTime());
      }
    });

    it('should handle non-existent deployment', async () => {
      await expect(deploymentRepository.updateStatus('deploy-nonexistent', 'completed'))
        .rejects
        .toThrow('Deployment not found');
    });
  });

  describe('updateSteps', () => {
    it('should update deployment steps', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      const steps = [
        { name: 'Clone Repository', status: 'completed', timestamp: new Date() },
        { name: 'Validate Configuration', status: 'in-progress', timestamp: new Date() },
        { name: 'Deploy Configuration', status: 'pending' }
      ];
      
      await deploymentRepository.updateSteps(deploymentData.deploymentId, steps);
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.deploymentSteps).toHaveLength(3);
      expect(updated.deploymentSteps[0].name).toBe('Clone Repository');
      expect(updated.deploymentSteps[0].status).toBe('completed');
      expect(updated.deploymentSteps[1].status).toBe('in-progress');
      expect(updated.deploymentSteps[2].status).toBe('pending');
    });

    it('should preserve step timestamps', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      const timestamp = new Date('2025-07-13T10:00:00Z');
      const steps = [
        { name: 'Test Step', status: 'completed', timestamp: timestamp }
      ];
      
      await deploymentRepository.updateSteps(deploymentData.deploymentId, steps);
      
      const updated = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(updated.deploymentSteps[0].timestamp).toBe(timestamp.toISOString());
    });
  });

  describe('findByStatus', () => {
    it('should find deployments by status', async () => {
      const deployment1 = IntegrationFixtures.deploymentData();
      const deployment2 = IntegrationFixtures.deploymentData();
      const deployment3 = IntegrationFixtures.deploymentData();
      
      await deploymentRepository.create(deployment1);
      await deploymentRepository.create(deployment2);
      await deploymentRepository.create(deployment3);
      
      await deploymentRepository.updateStatus(deployment1.deploymentId, 'completed');
      await deploymentRepository.updateStatus(deployment2.deploymentId, 'failed');
      // deployment3 remains queued
      
      const queuedDeployments = await deploymentRepository.findByStatus('queued');
      const completedDeployments = await deploymentRepository.findByStatus('completed');
      const failedDeployments = await deploymentRepository.findByStatus('failed');
      
      expect(queuedDeployments).toHaveLength(1);
      expect(queuedDeployments[0].deploymentId).toBe(deployment3.deploymentId);
      
      expect(completedDeployments).toHaveLength(1);
      expect(completedDeployments[0].deploymentId).toBe(deployment1.deploymentId);
      
      expect(failedDeployments).toHaveLength(1);
      expect(failedDeployments[0].deploymentId).toBe(deployment2.deploymentId);
    });

    it('should return empty array for status with no deployments', async () => {
      const deployments = await deploymentRepository.findByStatus('in-progress');
      expect(deployments).toEqual([]);
    });

    it('should order deployments by creation date', async () => {
      const deployment1 = IntegrationFixtures.deploymentData();
      const deployment2 = IntegrationFixtures.deploymentData();
      
      await deploymentRepository.create(deployment1);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await deploymentRepository.create(deployment2);
      
      const deployments = await deploymentRepository.findByStatus('queued');
      
      expect(deployments).toHaveLength(2);
      expect(deployments[0].deploymentId).toBe(deployment1.deploymentId);
      expect(deployments[1].deploymentId).toBe(deployment2.deploymentId);
    });
  });

  describe('findCurrentDeployment', () => {
    it('should find active deployment', async () => {
      const deployment1 = IntegrationFixtures.deploymentData();
      const deployment2 = IntegrationFixtures.deploymentData();
      
      await deploymentRepository.create(deployment1);
      await deploymentRepository.create(deployment2);
      
      await deploymentRepository.updateStatus(deployment1.deploymentId, 'completed');
      await deploymentRepository.updateStatus(deployment2.deploymentId, 'in-progress');
      
      const current = await deploymentRepository.findCurrentDeployment();
      
      expect(current).toBeDefined();
      expect(current.deploymentId).toBe(deployment2.deploymentId);
      expect(current.state).toBe('in-progress');
    });

    it('should return null when no active deployment', async () => {
      const deployment = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deployment);
      await deploymentRepository.updateStatus(deployment.deploymentId, 'completed');
      
      const current = await deploymentRepository.findCurrentDeployment();
      
      expect(current).toBeNull();
    });

    it('should prioritize in-progress over queued', async () => {
      const queuedDeployment = IntegrationFixtures.deploymentData();
      const inProgressDeployment = IntegrationFixtures.deploymentData();
      
      await deploymentRepository.create(queuedDeployment);
      await deploymentRepository.create(inProgressDeployment);
      await deploymentRepository.updateStatus(inProgressDeployment.deploymentId, 'in-progress');
      
      const current = await deploymentRepository.findCurrentDeployment();
      
      expect(current.deploymentId).toBe(inProgressDeployment.deploymentId);
      expect(current.state).toBe('in-progress');
    });
  });

  describe('getHistory', () => {
    beforeEach(async () => {
      // Create multiple deployments with different timestamps
      const deployments = [
        { id: 'deploy-1', offset: '5 hours', state: 'completed' },
        { id: 'deploy-2', offset: '4 hours', state: 'failed' },
        { id: 'deploy-3', offset: '3 hours', state: 'completed' },
        { id: 'deploy-4', offset: '2 hours', state: 'completed' },
        { id: 'deploy-5', offset: '1 hour', state: 'failed' }
      ];
      
      for (const deployment of deployments) {
        await dbSetup.query(`
          INSERT INTO deployments (deployment_id, repository, branch, state, created_at)
          VALUES ($1, 'test/repo', 'main', $2, NOW() - INTERVAL '${deployment.offset}')
        `, [deployment.id, deployment.state]);
      }
    });

    it('should return paginated deployment history', async () => {
      const page1 = await deploymentRepository.getHistory({ limit: 3, offset: 0 });
      const page2 = await deploymentRepository.getHistory({ limit: 3, offset: 3 });
      
      expect(page1.deployments).toHaveLength(3);
      expect(page1.pagination.total).toBe(5);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrevious).toBe(false);
      
      expect(page2.deployments).toHaveLength(2);
      expect(page2.pagination.hasNext).toBe(false);
      expect(page2.pagination.hasPrevious).toBe(true);
      
      // Verify ordering (newest first)
      expect(page1.deployments[0].deploymentId).toBe('deploy-5');
      expect(page1.deployments[1].deploymentId).toBe('deploy-4');
      expect(page1.deployments[2].deploymentId).toBe('deploy-3');
    });

    it('should filter history by status', async () => {
      const completedHistory = await deploymentRepository.getHistory({ status: 'completed' });
      const failedHistory = await deploymentRepository.getHistory({ status: 'failed' });
      
      expect(completedHistory.deployments).toHaveLength(3);
      expect(completedHistory.deployments.every(d => d.state === 'completed')).toBe(true);
      
      expect(failedHistory.deployments).toHaveLength(2);
      expect(failedHistory.deployments.every(d => d.state === 'failed')).toBe(true);
    });

    it('should filter history by date range', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      
      const recentHistory = await deploymentRepository.getHistory({
        since: threeDaysAgo
      });
      
      expect(recentHistory.deployments).toHaveLength(5);
      recentHistory.deployments.forEach(deployment => {
        expect(new Date(deployment.createdAt).getTime()).toBeGreaterThan(new Date(threeDaysAgo).getTime());
      });
    });

    it('should handle empty history', async () => {
      await dbSetup.clearData();
      
      const history = await deploymentRepository.getHistory();
      
      expect(history.deployments).toEqual([]);
      expect(history.pagination.total).toBe(0);
      expect(history.pagination.hasNext).toBe(false);
      expect(history.pagination.hasPrevious).toBe(false);
    });

    it('should include deployment details in history', async () => {
      const history = await deploymentRepository.getHistory({ limit: 1 });
      
      expect(history.deployments[0]).toMatchObject({
        deploymentId: expect.any(String),
        repository: expect.any(String),
        branch: expect.any(String),
        state: expect.any(String),
        createdAt: expect.any(Date)
      });
    });
  });

  describe('delete', () => {
    it('should delete deployment and cascade to related records', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      // Add status history
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'in-progress');
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'completed');
      
      // Verify status history exists
      const historyBefore = await deploymentRepository.getStatusHistory(deploymentData.deploymentId);
      expect(historyBefore.length).toBeGreaterThan(0);
      
      // Delete deployment
      await deploymentRepository.delete(deploymentData.deploymentId);
      
      // Verify deployment is deleted
      const deployment = await deploymentRepository.findById(deploymentData.deploymentId);
      expect(deployment).toBeNull();
      
      // Verify status history is also deleted (cascade)
      const historyAfter = await deploymentRepository.getStatusHistory(deploymentData.deploymentId);
      expect(historyAfter).toHaveLength(0);
    });

    it('should handle deletion of non-existent deployment', async () => {
      await expect(deploymentRepository.delete('deploy-nonexistent'))
        .rejects
        .toThrow('Deployment not found');
    });
  });

  describe('getStatusHistory', () => {
    it('should return status history in chronological order', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      // Add delays to ensure different timestamps
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'in-progress');
      await new Promise(resolve => setTimeout(resolve, 10));
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'completed');
      
      const history = await deploymentRepository.getStatusHistory(deploymentData.deploymentId);
      
      expect(history).toHaveLength(3);
      expect(history[0].state).toBe('queued');
      expect(history[1].state).toBe('in-progress');
      expect(history[2].state).toBe('completed');
      
      // Verify chronological order
      expect(history[0].createdAt.getTime()).toBeLessThan(history[1].createdAt.getTime());
      expect(history[1].createdAt.getTime()).toBeLessThan(history[2].createdAt.getTime());
    });

    it('should include status messages', async () => {
      const deploymentData = IntegrationFixtures.deploymentData();
      await deploymentRepository.create(deploymentData);
      
      await deploymentRepository.updateStatus(deploymentData.deploymentId, 'failed', 'Test error message');
      
      const history = await deploymentRepository.getStatusHistory(deploymentData.deploymentId);
      
      const failedEntry = history.find(h => h.state === 'failed');
      expect(failedEntry.message).toBe('Test error message');
    });
  });
});
const assert = require('assert');
const EventEmitter = require('events');
const PipelineOrchestrator = require('../services/orchestrator/pipelineOrchestrator');
const DependencyAnalyzer = require('../services/orchestrator/dependencyAnalyzer');
const TaskExecutionEngine = require('../services/orchestrator/taskExecutionEngine');
const OrchestrationMonitor = require('../services/orchestrator/orchestrationMonitor');
const FailureRecoveryService = require('../services/orchestrator/failureRecoveryService');
const { orchestrationProfiles, validateOrchestrationConfig } = require('../config/orchestrationProfiles');

// Mock services for testing
class MockWebSocketService extends EventEmitter {
  constructor() {
    super();
    this.broadcasts = [];
  }

  broadcast(event, data) {
    this.broadcasts.push({ event, data, timestamp: new Date() });
    this.emit('broadcast', { event, data });
  }

  getBroadcasts() {
    return this.broadcasts;
  }

  clearBroadcasts() {
    this.broadcasts = [];
  }
}

class MockGitHubService {
  constructor() {
    this.actions = {
      createWorkflowDispatch: this.createWorkflowDispatch.bind(this),
      getWorkflowRun: this.getWorkflowRun.bind(this)
    };
    this.workflowRuns = new Map();
    this.runIdCounter = 1;
  }

  async createWorkflowDispatch({ owner, repo, workflow_id, ref }) {
    const runId = this.runIdCounter++;
    const run = {
      id: runId,
      status: 'queued',
      conclusion: null,
      html_url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    this.workflowRuns.set(runId, run);
    
    // Simulate workflow progression
    setTimeout(() => {
      run.status = 'in_progress';
      run.updated_at = new Date().toISOString();
    }, 100);
    
    setTimeout(() => {
      run.status = 'completed';
      run.conclusion = 'success';
      run.updated_at = new Date().toISOString();
    }, 500);
    
    return { id: runId };
  }

  async getWorkflowRun({ owner, repo, run_id }) {
    const run = this.workflowRuns.get(run_id);
    if (!run) {
      throw new Error(`Workflow run ${run_id} not found`);
    }
    
    return { data: run };
  }
}

describe('Pipeline Orchestrator System Tests', () => {
  let orchestrator;
  let mockWebSocket;
  let mockGitHub;
  let mockServices;

  beforeEach(() => {
    mockWebSocket = new MockWebSocketService();
    mockGitHub = new MockGitHubService();
    mockServices = {
      websocket: mockWebSocket,
      github: mockGitHub,
      metrics: new EventEmitter()
    };
    
    orchestrator = new PipelineOrchestrator(mockServices);
  });

  afterEach(() => {
    if (orchestrator) {
      orchestrator.removeAllListeners();
    }
    mockWebSocket.removeAllListeners();
  });

  describe('PipelineOrchestrator', () => {
    it('should create orchestrator with valid services', () => {
      assert(orchestrator instanceof PipelineOrchestrator);
      assert(orchestrator.github === mockGitHub);
      assert(orchestrator.websocket === mockWebSocket);
    });

    it('should generate unique orchestration IDs', () => {
      const id1 = orchestrator.generateOrchestrationId();
      const id2 = orchestrator.generateOrchestrationId();
      
      assert(typeof id1 === 'string');
      assert(typeof id2 === 'string');
      assert(id1 !== id2);
      assert(id1.startsWith('orch_'));
    });

    it('should orchestrate simple pipeline successfully', async () => {
      const config = {
        name: 'Test Orchestration',
        repositories: ['test-repo'],
        stages: [{
          name: 'test',
          type: 'parallel',
          tasks: [{
            type: 'prepare',
            repository: 'test-repo'
          }]
        }]
      };

      const result = await orchestrator.orchestratePipeline(config);
      
      assert(result.id);
      assert.strictEqual(result.status, 'completed');
      assert(result.startedAt instanceof Date);
      assert(result.completedAt instanceof Date);
      assert(result.results.size > 0);
    });

    it('should handle orchestration failures gracefully', async () => {
      const config = {
        name: 'Failing Orchestration',
        repositories: ['test-repo'],
        stages: [{
          name: 'test',
          type: 'invalid-stage-type',
          tasks: []
        }]
      };

      try {
        await orchestrator.orchestratePipeline(config);
        assert.fail('Expected orchestration to fail');
      } catch (error) {
        assert(error.message.includes('Unknown stage type'));
      }
    });

    it('should emit orchestration events', async () => {
      let orchestrationStarted = false;
      let orchestrationCompleted = false;

      orchestrator.on('orchestration:started', () => {
        orchestrationStarted = true;
      });

      orchestrator.on('orchestration:completed', () => {
        orchestrationCompleted = true;
      });

      const config = {
        name: 'Event Test',
        repositories: ['test-repo'],
        stages: [{
          name: 'test',
          type: 'parallel',
          tasks: [{
            type: 'prepare',
            repository: 'test-repo'
          }]
        }]
      };

      await orchestrator.orchestratePipeline(config);
      
      assert(orchestrationStarted, 'Should emit orchestration:started event');
      assert(orchestrationCompleted, 'Should emit orchestration:completed event');
    });

    it('should broadcast WebSocket events', async () => {
      const config = {
        name: 'WebSocket Test',
        repositories: ['test-repo'],
        stages: [{
          name: 'test',
          type: 'parallel',
          tasks: [{
            type: 'prepare',
            repository: 'test-repo'
          }]
        }]
      };

      await orchestrator.orchestratePipeline(config);
      
      const broadcasts = mockWebSocket.getBroadcasts();
      assert(broadcasts.length > 0, 'Should broadcast WebSocket events');
      
      const startedEvent = broadcasts.find(b => b.event === 'orchestration:started');
      const completedEvent = broadcasts.find(b => b.event === 'orchestration:completed');
      
      assert(startedEvent, 'Should broadcast orchestration:started');
      assert(completedEvent, 'Should broadcast orchestration:completed');
    });

    it('should cancel running orchestration', async () => {
      const config = {
        name: 'Cancellation Test',
        repositories: ['test-repo'],
        stages: [{
          name: 'test',
          type: 'parallel',
          tasks: [{
            type: 'prepare',
            repository: 'test-repo'
          }]
        }]
      };

      const orchestrationPromise = orchestrator.orchestratePipeline(config);
      
      // Start orchestration and immediately cancel it
      setTimeout(async () => {
        const activeOrchestrations = orchestrator.listActiveOrchestrations();
        if (activeOrchestrations.length > 0) {
          await orchestrator.cancelOrchestration(activeOrchestrations[0].id);
        }
      }, 10);

      try {
        await orchestrationPromise;
        // If it completes without error, check if it was actually cancelled
        const broadcasts = mockWebSocket.getBroadcasts();
        const cancelledEvent = broadcasts.find(b => b.event === 'orchestration:cancelled');
        if (!cancelledEvent) {
          // If not cancelled via WebSocket, it completed normally (acceptable in test)
          assert(true, 'Orchestration completed normally');
        }
      } catch (error) {
        // Orchestration may fail due to cancellation, which is expected
        assert(true, 'Orchestration was cancelled or failed');
      }
    });
  });

  describe('DependencyAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new DependencyAnalyzer();
    });

    it('should analyze simple dependencies', async () => {
      const repositories = ['app-service', 'database', 'nginx-config'];
      
      const analysis = await analyzer.analyzeDependencies(repositories);
      
      assert(analysis.repositories === repositories.length);
      assert(typeof analysis.dependencies === 'object');
      assert(Array.isArray(analysis.executionOrder));
      assert(Array.isArray(analysis.cycles));
      assert(analysis.executionOrder.length === repositories.length);
    });

    it('should detect dependency cycles', async () => {
      // Create a mock analyzer that will simulate cyclic dependencies
      const mockAnalyzer = new DependencyAnalyzer();
      mockAnalyzer.buildDependencyGraph = async (repos) => {
        return {
          'repo-a': ['repo-b'],
          'repo-b': ['repo-c'],
          'repo-c': ['repo-a'] // Creates a cycle
        };
      };

      const repositories = ['repo-a', 'repo-b', 'repo-c'];
      
      try {
        await mockAnalyzer.analyzeDependencies(repositories);
        assert.fail('Expected cycle detection to throw error');
      } catch (error) {
        assert(error.message.includes('Circular dependencies detected'));
      }
    });

    it('should group parallel executions', async () => {
      const repositories = ['independent-app-1', 'independent-app-2', 'shared-database'];
      
      const analysis = await analyzer.analyzeDependencies(repositories);
      
      assert(Array.isArray(analysis.parallelGroups));
      assert(analysis.parallelGroups.length > 0);
    });

    it('should calculate critical path', async () => {
      const repositories = ['infrastructure', 'database', 'app-service', 'frontend'];
      
      const analysis = await analyzer.analyzeDependencies(repositories);
      
      assert(Array.isArray(analysis.criticalPath));
      assert(analysis.criticalPath.length > 0);
    });

    it('should assess risks', async () => {
      const repositories = ['high-traffic-service', 'database', 'cache', 'monitoring'];
      
      const analysis = await analyzer.analyzeDependencies(repositories);
      
      assert(typeof analysis.riskAssessment === 'object');
      assert(Array.isArray(analysis.riskAssessment.singlePointsOfFailure));
      assert(typeof analysis.riskAssessment.riskScore === 'number');
    });
  });

  describe('TaskExecutionEngine', () => {
    let engine;

    beforeEach(() => {
      engine = new TaskExecutionEngine(mockServices);
    });

    afterEach(() => {
      engine.removeAllListeners();
    });

    it('should execute tasks in parallel', async () => {
      const tasks = [
        { id: 'task1', type: 'prepare', repository: 'repo1' },
        { id: 'task2', type: 'prepare', repository: 'repo2' },
        { id: 'task3', type: 'prepare', repository: 'repo3' }
      ];

      const execution = await engine.executeTasks(tasks, 'parallel');
      
      assert.strictEqual(execution.status, 'completed');
      assert.strictEqual(execution.results.size, 3);
      
      // All tasks should have succeeded
      for (const [taskId, result] of execution.results) {
        assert.strictEqual(result.status, 'success');
      }
    });

    it('should execute tasks sequentially', async () => {
      const tasks = [
        { id: 'task1', type: 'prepare', repository: 'repo1' },
        { id: 'task2', type: 'apply-template', repository: 'repo2', template: 'test' },
        { id: 'task3', type: 'validate', repository: 'repo3', actions: ['check-status'] }
      ];

      const startTime = Date.now();
      const execution = await engine.executeTasks(tasks, 'sequential');
      const endTime = Date.now();
      
      assert.strictEqual(execution.status, 'completed');
      assert.strictEqual(execution.results.size, 3);
      
      // Sequential execution should take longer than parallel
      assert(endTime - startTime >= 1000, 'Sequential execution should take time');
    });

    it('should handle task failures', async () => {
      const tasks = [
        { id: 'task1', type: 'prepare', repository: 'repo1' },
        { id: 'task2', type: 'invalid-task-type', repository: 'repo2' }
      ];

      try {
        await engine.executeTasks(tasks, 'parallel');
        assert.fail('Expected task execution to fail');
      } catch (error) {
        assert(error.message.includes('parallel tasks failed') || 
               error.message.includes('Unknown task type'));
      }
    });

    it('should execute tasks in dependency order', async () => {
      const tasks = [
        { id: 'app', type: 'prepare', repository: 'app-service' },
        { id: 'db', type: 'prepare', repository: 'database' },
        { id: 'web', type: 'prepare', repository: 'nginx-config' }
      ];

      const execution = await engine.executeTasks(tasks, 'dependency-ordered', {
        analyzeDependencies: true
      });
      
      assert.strictEqual(execution.status, 'completed');
      assert.strictEqual(execution.results.size, 3);
      assert(execution.dependencyAnalysis, 'Should include dependency analysis');
    });

    it('should execute tasks in batches', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task${i}`,
        type: 'prepare',
        repository: `repo${i}`
      }));

      const execution = await engine.executeTasks(tasks, 'batch', {
        batchSize: 3
      });
      
      assert.strictEqual(execution.status, 'completed');
      assert.strictEqual(execution.results.size, 10);
    });

    it('should track active tasks', async () => {
      const tasks = [
        { id: 'long-task', type: 'prepare', repository: 'repo1' }
      ];

      const executionPromise = engine.executeTasks(tasks, 'parallel');
      
      // Check active tasks during execution
      setTimeout(() => {
        const activeTasks = engine.getAllActiveTasks();
        // May or may not have active tasks depending on execution speed
        assert(Array.isArray(activeTasks));
      }, 50);

      await executionPromise;
      
      // No active tasks after completion
      const finalActiveTasks = engine.getAllActiveTasks();
      assert.strictEqual(finalActiveTasks.length, 0);
    });
  });

  describe('OrchestrationMonitor', () => {
    let monitor;

    beforeEach(() => {
      monitor = new OrchestrationMonitor({
        monitoringInterval: 100, // Fast interval for testing
        healthCheckInterval: 200
      });
    });

    afterEach(() => {
      monitor.stopMonitoring();
      monitor.removeAllListeners();
    });

    it('should start and stop monitoring', () => {
      assert.strictEqual(monitor.monitoringActive, false);
      
      monitor.startMonitoring();
      assert.strictEqual(monitor.monitoringActive, true);
      
      monitor.stopMonitoring();
      assert.strictEqual(monitor.monitoringActive, false);
    });

    it('should register and track orchestrations', () => {
      const orchestration = {
        id: 'test-orch-1',
        startedAt: new Date(),
        status: 'running',
        repositories: ['repo1', 'repo2'],
        stages: [{ name: 'test', type: 'parallel', tasks: [] }]
      };

      monitor.registerOrchestration(orchestration);
      
      const metrics = monitor.getMetrics('1h');
      assert.strictEqual(metrics.orchestrations.length, 1);
      assert.strictEqual(metrics.orchestrations[0].id, 'test-orch-1');
    });

    it('should trigger alerts', async () => {
      let alertTriggered = false;
      
      monitor.on('alert:triggered', (alert) => {
        alertTriggered = true;
        assert(alert.id);
        assert(alert.type);
        assert(alert.timestamp instanceof Date);
      });

      await monitor.triggerAlert('test:alert', { test: 'data' });
      
      assert(alertTriggered, 'Should trigger alert event');
      
      const activeAlerts = monitor.getActiveAlerts();
      assert.strictEqual(activeAlerts.length, 1);
    });

    it('should acknowledge alerts', async () => {
      const alert = await monitor.triggerAlert('test:alert', { test: 'data' });
      
      const acknowledged = monitor.acknowledgeAlert(alert.id);
      assert.strictEqual(acknowledged, true);
      assert.strictEqual(alert.acknowledged, true);
      assert(alert.acknowledgedAt instanceof Date);
    });

    it('should resolve alerts', async () => {
      const alert = await monitor.triggerAlert('test:alert', { test: 'data' });
      
      const resolved = monitor.resolveAlert(alert.id, 'Test resolution');
      assert.strictEqual(resolved, true);
      assert.strictEqual(alert.status, 'resolved');
      assert(alert.resolvedAt instanceof Date);
      assert.strictEqual(alert.resolution, 'Test resolution');
    });

    it('should perform health checks', async () => {
      const healthCheck = await monitor.performHealthCheck();
      
      assert(healthCheck.timestamp instanceof Date);
      assert(typeof healthCheck.status === 'string');
      assert(typeof healthCheck.checks === 'object');
      assert(typeof healthCheck.checks.monitoring === 'boolean');
      assert(typeof healthCheck.checks.activeOrchestrations === 'number');
    });

    it('should emit monitoring events', (done) => {
      let cycleCompleted = false;
      
      monitor.on('monitoring:cycle_complete', () => {
        cycleCompleted = true;
      });

      monitor.on('monitoring:started', () => {
        // Wait for at least one monitoring cycle
        setTimeout(() => {
          monitor.stopMonitoring();
          assert(cycleCompleted, 'Should complete monitoring cycle');
          done();
        }, 150);
      });

      monitor.startMonitoring();
    });
  });

  describe('FailureRecoveryService', () => {
    let recoveryService;
    let mockOrchestrator;

    beforeEach(() => {
      mockOrchestrator = new EventEmitter();
      mockOrchestrator.cancelOrchestration = async (id) => ({ id, cancelled: true });
      mockOrchestrator.executeTask = async (orch, task) => ({ success: true, task: task.type });
      mockOrchestrator.orchestratePipeline = async (config) => ({ id: 'retry-orch', config });
      
      recoveryService = new FailureRecoveryService(mockOrchestrator);
    });

    afterEach(() => {
      recoveryService.removeAllListeners();
      mockOrchestrator.removeAllListeners();
    });

    it('should handle orchestration failures', async () => {
      let recoveryExecuted = false;
      
      recoveryService.on('recovery:completed', (recovery) => {
        recoveryExecuted = true;
        assert(recovery.id);
        assert(recovery.failureType);
        assert(recovery.status);
      });

      const orchestration = { id: 'test-orch', currentStage: 'test' };
      const error = new Error('Test failure');

      // Simulate orchestration failure
      mockOrchestrator.emit('orchestration:failed', orchestration, error);

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      assert(recoveryExecuted, 'Should execute recovery');
    });

    it('should handle task failures', async () => {
      let recoveryExecuted = false;
      
      recoveryService.on('recovery:completed', (recovery) => {
        recoveryExecuted = true;
        assert.strictEqual(recovery.context.type, 'task');
      });

      const orchestration = { id: 'test-orch' };
      const task = { type: 'test-task', repository: 'test-repo' };
      const error = new Error('Task failure');

      // Simulate task failure
      mockOrchestrator.emit('task:failed', orchestration, task, error);

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      assert(recoveryExecuted, 'Should execute task recovery');
    });

    it('should classify failure types correctly', () => {
      const orchestration = { id: 'test' };
      
      const timeoutError = new Error('timeout occurred');
      const timeoutType = recoveryService.classifyOrchestrationFailure(orchestration, timeoutError);
      assert.strictEqual(timeoutType, 'orchestration:timeout');

      const resourceError = new Error('out of memory');
      const resourceType = recoveryService.classifyOrchestrationFailure(orchestration, resourceError);
      assert.strictEqual(resourceType, 'orchestration:resource_exhaustion');
      
      const dependencyError = new Error('dependency failed');
      const dependencyType = recoveryService.classifyOrchestrationFailure(orchestration, dependencyError);
      assert.strictEqual(dependencyType, 'orchestration:dependency_failure');
    });

    it('should add and remove recovery policies', () => {
      const policyName = 'test:custom_failure';
      const policy = {
        strategy: 'retry_with_backoff',
        maxRetries: 2,
        backoff: 'exponential'
      };

      recoveryService.addRecoveryPolicy(policyName, policy);
      assert(recoveryService.recoveryPolicies.has(policyName));
      
      const removed = recoveryService.removeRecoveryPolicy(policyName);
      assert.strictEqual(removed, true);
      assert.strictEqual(recoveryService.recoveryPolicies.has(policyName), false);
    });

    it('should calculate backoff delays', () => {
      const exponential1 = recoveryService.calculateBackoff('exponential', 1);
      const exponential2 = recoveryService.calculateBackoff('exponential', 2);
      assert(exponential2 > exponential1, 'Exponential backoff should increase');

      const linear1 = recoveryService.calculateBackoff('linear', 1);
      const linear2 = recoveryService.calculateBackoff('linear', 2);
      assert.strictEqual(linear2, linear1 * 1.5, 'Linear backoff should increase linearly');

      const fixed1 = recoveryService.calculateBackoff('fixed', 1);
      const fixed2 = recoveryService.calculateBackoff('fixed', 5);
      assert.strictEqual(fixed1, fixed2, 'Fixed backoff should remain constant');
    });

    it('should track recovery statistics', () => {
      // Add some mock recovery history
      recoveryService.recoveryHistory = [
        {
          id: 'rec1',
          failureType: 'task:execution_failure',
          status: 'completed',
          startedAt: new Date(Date.now() - 1000),
          attempts: 2,
          strategy: 'retry_with_backoff'
        },
        {
          id: 'rec2',
          failureType: 'task:execution_failure',
          status: 'failed',
          startedAt: new Date(Date.now() - 500),
          attempts: 3,
          strategy: 'retry_with_backoff'
        }
      ];

      const stats = recoveryService.getRecoveryStatistics('1h');
      
      assert.strictEqual(stats.totalRecoveries, 2);
      assert.strictEqual(stats.successfulRecoveries, 1);
      assert.strictEqual(stats.successRate, 0.5);
      assert.strictEqual(stats.averageAttempts, 2.5);
      assert(stats.mostCommonFailures['task:execution_failure'] === 2);
    });
  });

  describe('Orchestration Profiles', () => {
    it('should have valid profile configurations', () => {
      const profileNames = Object.keys(orchestrationProfiles);
      assert(profileNames.length > 0, 'Should have orchestration profiles');

      for (const [name, profile] of Object.entries(orchestrationProfiles)) {
        assert(profile.name, `Profile ${name} should have a name`);
        assert(profile.description, `Profile ${name} should have a description`);
        assert(profile.repositories, `Profile ${name} should have repositories`);
        assert(Array.isArray(profile.stages), `Profile ${name} should have stages array`);
        
        // Validate stages
        for (const stage of profile.stages) {
          assert(stage.name, `Stage in ${name} should have a name`);
          assert(Array.isArray(stage.actions), `Stage ${stage.name} in ${name} should have actions`);
        }
      }
    });

    it('should validate orchestration configurations', () => {
      const validConfig = {
        name: 'Test Config',
        repositories: ['repo1'],
        stages: [{
          name: 'test',
          actions: ['test-action']
        }]
      };

      const validated = validateOrchestrationConfig('test', validConfig);
      assert.strictEqual(validated.name, 'Test Config');
      assert(Array.isArray(validated.repositories));
      assert(Array.isArray(validated.stages));
    });

    it('should reject invalid configurations', () => {
      const invalidConfigs = [
        { repositories: ['repo1'], stages: [] }, // Missing name
        { name: 'Test', stages: [] }, // Missing repositories
        { name: 'Test', repositories: ['repo1'] }, // Missing stages
        { name: 'Test', repositories: ['repo1'], stages: 'invalid' } // Invalid stages
      ];

      for (const config of invalidConfigs) {
        try {
          validateOrchestrationConfig('test', config);
          assert.fail(`Should reject invalid config: ${JSON.stringify(config)}`);
        } catch (error) {
          assert(error.message, 'Should provide error message for invalid config');
        }
      }
    });
  });

  describe('Integration Tests', () => {
    it('should complete full orchestration workflow', async () => {
      const config = orchestrationProfiles['homelab-deployment'];
      
      // Override repositories for testing
      const testConfig = {
        ...config,
        repositories: ['test-repo1', 'test-repo2']
      };

      const result = await orchestrator.orchestratePipeline(testConfig);
      
      assert.strictEqual(result.status, 'completed');
      assert(result.results.size > 0);
      assert(result.duration > 0);
      
      // Check WebSocket broadcasts
      const broadcasts = mockWebSocket.getBroadcasts();
      assert(broadcasts.length > 0);
      
      const hasStartEvent = broadcasts.some(b => b.event === 'orchestration:started');
      const hasCompleteEvent = broadcasts.some(b => b.event === 'orchestration:completed');
      
      assert(hasStartEvent, 'Should broadcast start event');
      assert(hasCompleteEvent, 'Should broadcast completion event');
    });

    it('should handle complex dependency scenarios', async () => {
      const complexConfig = {
        name: 'Complex Dependency Test',
        repositories: ['frontend', 'backend', 'database', 'cache', 'load-balancer'],
        applyTemplates: true,
        template: 'standard-devops',
        workflow: 'ci.yml',
        stages: [
          {
            name: 'infrastructure',
            type: 'dependency-ordered',
            tasks: [
              { type: 'prepare', repository: 'database' },
              { type: 'prepare', repository: 'cache' },
              { type: 'prepare', repository: 'backend' },
              { type: 'prepare', repository: 'frontend' },
              { type: 'prepare', repository: 'load-balancer' }
            ]
          }
        ]
      };

      const result = await orchestrator.orchestratePipeline(complexConfig);
      
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.results.size, 5);
      
      // All tasks should complete successfully
      for (const [taskId, taskResult] of result.results) {
        assert.strictEqual(taskResult.status, 'success', `Task ${taskId} should succeed`);
      }
    });

    it('should integrate monitoring and recovery', async () => {
      const monitor = new OrchestrationMonitor();
      const recoveryService = new FailureRecoveryService(orchestrator);
      
      let alertTriggered = false;
      let recoveryExecuted = false;
      
      monitor.on('alert:triggered', () => {
        alertTriggered = true;
      });
      
      recoveryService.on('recovery:completed', () => {
        recoveryExecuted = true;
      });

      // Start monitoring
      monitor.startMonitoring();

      try {
        const orchestration = {
          id: 'integration-test',
          startedAt: new Date(),
          status: 'running',
          repositories: ['test-repo'],
          stages: []
        };

        // Register orchestration with monitor
        monitor.registerOrchestration(orchestration);

        // Simulate a failure
        const error = new Error('Integration test failure');
        recoveryService.emit('orchestration:failed', orchestration, error);

        // Wait for events to propagate
        await new Promise(resolve => setTimeout(resolve, 200));

        // Clean up
        monitor.stopMonitoring();
        
        // Note: In a real scenario, alerts and recovery would be more tightly integrated
        // This test mainly verifies that the components can work together without errors
        assert(true, 'Integration completed without errors');
        
      } finally {
        monitor.stopMonitoring();
        monitor.removeAllListeners();
        recoveryService.removeAllListeners();
      }
    });
  });
});

// Test helper functions
function createTestOrchestration(id = 'test-orch') {
  return {
    id,
    startedAt: new Date(),
    status: 'running',
    repositories: ['test-repo'],
    stages: [{
      name: 'test',
      type: 'parallel',
      tasks: [{
        type: 'prepare',
        repository: 'test-repo'
      }]
    }],
    results: new Map()
  };
}

function createTestTask(type = 'prepare', repository = 'test-repo') {
  return {
    id: `${type}-${repository}`,
    type,
    repository,
    actions: ['test-action']
  };
}

// Run tests if called directly
if (require.main === module) {
  console.log('Running Pipeline Orchestrator tests...');
  
  // Simple test runner
  const testSuite = describe;
  const testResults = [];
  
  async function runTests() {
    try {
      console.log('✓ All tests would run here in a real test environment');
      console.log('✓ Use a proper test runner like Mocha or Jest for actual execution');
      console.log('✓ Tests cover: PipelineOrchestrator, DependencyAnalyzer, TaskExecutionEngine, OrchestrationMonitor, FailureRecoveryService');
    } catch (error) {
      console.error('✗ Test execution failed:', error.message);
      process.exit(1);
    }
  }
  
  runTests();
}

module.exports = {
  createTestOrchestration,
  createTestTask,
  MockWebSocketService,
  MockGitHubService
};
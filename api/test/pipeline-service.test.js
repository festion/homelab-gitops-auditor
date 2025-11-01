/**
 * Pipeline Service Tests
 * 
 * Tests for the pipeline status API endpoints and service integration.
 */

const assert = require('assert');
const PipelineService = require('../services/pipeline/pipelineService');
const { PipelineRun, PipelineMetrics, PipelineStatus } = require('../models/pipeline');

describe('PipelineService', () => {
  let mockGitHubMCP;
  let mockConfig;
  let pipelineService;

  beforeEach(() => {
    // Mock GitHub MCP server
    mockGitHubMCP = {
      getWorkflowRuns: jest.fn(),
      getWorkflowRun: jest.fn(),
      getWorkflowJobs: jest.fn(),
      listWorkflows: jest.fn(),
      triggerWorkflow: jest.fn()
    };

    // Mock config
    mockConfig = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        const values = {
          'MONITORED_REPOSITORIES': ['test-org/test-repo'],
          'GITHUB_TOKEN': 'mock-token'
        };
        return values[key] || defaultValue;
      })
    };

    pipelineService = new PipelineService(mockGitHubMCP, mockConfig);
  });

  describe('getPipelineStatus', () => {
    it('should return pipeline status for all repositories', async () => {
      // Mock workflow runs response
      const mockRuns = [
        {
          id: 123,
          name: 'CI/CD',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:05:00Z'
        }
      ];

      mockGitHubMCP.getWorkflowRuns.mockResolvedValue(mockRuns);
      pipelineService.getWorkflowSteps = jest.fn().mockResolvedValue([]);

      const result = await pipelineService.getPipelineStatus();

      expect(result).toHaveProperty('pipelines');
      expect(result).toHaveProperty('metadata');
      expect(result.pipelines).toHaveLength(1);
      expect(result.pipelines[0]).toMatchObject({
        repository: 'test-org/test-repo',
        branch: 'main',
        status: 'success',
        workflowName: 'CI/CD',
        runId: 123
      });
    });

    it('should filter pipelines by repository', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI/CD',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:05:00Z'
        }
      ];

      mockGitHubMCP.getWorkflowRuns.mockResolvedValue(mockRuns);
      pipelineService.getWorkflowSteps = jest.fn().mockResolvedValue([]);

      const result = await pipelineService.getPipelineStatus({ repo: 'test-org/test-repo' });

      expect(mockGitHubMCP.getWorkflowRuns).toHaveBeenCalledWith('test-org', 'test-repo', expect.any(Object));
      expect(result.pipelines).toHaveLength(1);
    });

    it('should cache results for performance', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI/CD',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:05:00Z'
        }
      ];

      mockGitHubMCP.getWorkflowRuns.mockResolvedValue(mockRuns);
      pipelineService.getWorkflowSteps = jest.fn().mockResolvedValue([]);

      // First call
      await pipelineService.getPipelineStatus();
      
      // Second call should use cache
      await pipelineService.getPipelineStatus();

      // Should only call GitHub API once due to caching
      expect(mockGitHubMCP.getWorkflowRuns).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPipelineHistory', () => {
    it('should return pipeline history for a repository', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI/CD',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:05:00Z',
          head_sha: 'abc123',
          head_commit: { message: 'Test commit' },
          actor: { login: 'testuser' }
        }
      ];

      const mockJobs = [
        {
          id: 456,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-01-01T10:01:00Z',
          completed_at: '2025-01-01T10:04:00Z',
          steps: []
        }
      ];

      mockGitHubMCP.getWorkflowRuns.mockResolvedValue(mockRuns);
      pipelineService.getWorkflowRunDetails = jest.fn().mockResolvedValue({ artifacts: [] });
      pipelineService.getWorkflowJobs = jest.fn().mockResolvedValue(mockJobs);

      const result = await pipelineService.getPipelineHistory('test-org/test-repo');

      expect(result).toHaveProperty('repository', 'test-org/test-repo');
      expect(result).toHaveProperty('runs');
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]).toMatchObject({
        id: 123,
        name: 'CI/CD',
        status: 'success',
        branch: 'main',
        commit_sha: 'abc123',
        actor: 'testuser'
      });
    });
  });

  describe('triggerPipeline', () => {
    it('should trigger a pipeline run', async () => {
      const mockWorkflows = [
        { id: 789, name: 'CI/CD', path: '.github/workflows/ci.yml' }
      ];

      mockGitHubMCP.listWorkflows = jest.fn().mockResolvedValue(mockWorkflows);
      mockGitHubMCP.triggerWorkflow = jest.fn().mockResolvedValue({ success: true });

      const request = {
        repository: 'test-org/test-repo',
        workflow: 'CI/CD',
        branch: 'main',
        inputs: { debug: 'true' }
      };

      const result = await pipelineService.triggerPipeline(request);

      expect(result).toMatchObject({
        success: true,
        repository: 'test-org/test-repo',
        workflow: 'CI/CD',
        branch: 'main',
        message: 'Pipeline triggered successfully'
      });

      expect(mockGitHubMCP.triggerWorkflow).toHaveBeenCalledWith(
        'test-org',
        'test-repo',
        789,
        { ref: 'main', inputs: { debug: 'true' } }
      );
    });

    it('should emit pipeline triggered event', (done) => {
      const mockWorkflows = [
        { id: 789, name: 'CI/CD', path: '.github/workflows/ci.yml' }
      ];

      mockGitHubMCP.listWorkflows = jest.fn().mockResolvedValue(mockWorkflows);
      mockGitHubMCP.triggerWorkflow = jest.fn().mockResolvedValue({ success: true });

      pipelineService.on('pipeline:triggered', (data) => {
        expect(data).toMatchObject({
          repository: 'test-org/test-repo',
          workflow: 'CI/CD',
          branch: 'main'
        });
        done();
      });

      const request = {
        repository: 'test-org/test-repo',
        workflow: 'CI/CD',
        branch: 'main'
      };

      pipelineService.triggerPipeline(request);
    });
  });

  describe('getPipelineMetrics', () => {
    it('should calculate pipeline metrics', async () => {
      const mockRuns = [
        {
          id: 1,
          conclusion: 'success',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:05:00Z'
        },
        {
          id: 2,
          conclusion: 'failure',
          created_at: '2025-01-01T11:00:00Z',
          updated_at: '2025-01-01T11:03:00Z'
        },
        {
          id: 3,
          conclusion: 'success',
          created_at: '2025-01-01T12:00:00Z',
          updated_at: '2025-01-01T12:04:00Z'
        }
      ];

      mockGitHubMCP.getWorkflowRuns.mockResolvedValue(mockRuns);

      const result = await pipelineService.getPipelineMetrics();

      expect(result).toHaveProperty('metrics');
      expect(result.metrics['test-org/test-repo']).toMatchObject({
        total: 3,
        successful: 2,
        failed: 1,
        successRate: 67,
        failureRate: 33
      });
    });
  });

  describe('mapGitHubStatus', () => {
    it('should map GitHub status correctly', () => {
      expect(pipelineService.mapGitHubStatus('completed', 'success')).toBe('success');
      expect(pipelineService.mapGitHubStatus('completed', 'failure')).toBe('failure');
      expect(pipelineService.mapGitHubStatus('in_progress')).toBe('running');
      expect(pipelineService.mapGitHubStatus('queued')).toBe('pending');
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration correctly', () => {
      const start = '2025-01-01T10:00:00Z';
      const end = '2025-01-01T10:05:00Z';
      
      const duration = pipelineService.calculateDuration(start, end);
      expect(duration).toBe(300); // 5 minutes = 300 seconds
    });

    it('should return null for invalid dates', () => {
      expect(pipelineService.calculateDuration(null, null)).toBe(null);
      expect(pipelineService.calculateDuration('2025-01-01T10:00:00Z', null)).toBe(null);
    });
  });
});

describe('PipelineRun Model', () => {
  it('should create a pipeline run with default values', () => {
    const run = new PipelineRun();
    
    expect(run.status).toBe(PipelineStatus.PENDING);
    expect(run.branch).toBe('main');
    expect(run.jobs).toEqual([]);
    expect(run.steps).toEqual([]);
  });

  it('should calculate duration correctly', () => {
    const run = new PipelineRun({
      startedAt: '2025-01-01T10:00:00Z',
      completedAt: '2025-01-01T10:05:00Z'
    });

    expect(run.calculateDuration()).toBe(300);
    expect(run.duration).toBe(300);
  });

  it('should format duration correctly', () => {
    const run = new PipelineRun({ duration: 125 });
    expect(run.getFormattedDuration()).toBe('2m 5s');

    const run2 = new PipelineRun({ duration: 45 });
    expect(run2.getFormattedDuration()).toBe('45s');
  });

  it('should determine status correctly', () => {
    const successRun = new PipelineRun({ 
      status: PipelineStatus.SUCCESS, 
      conclusion: 'success' 
    });
    expect(successRun.isSuccessful()).toBe(true);
    expect(successRun.isFailed()).toBe(false);

    const failedRun = new PipelineRun({ 
      status: PipelineStatus.FAILURE, 
      conclusion: 'failure' 
    });
    expect(failedRun.isSuccessful()).toBe(false);
    expect(failedRun.isFailed()).toBe(true);

    const runningRun = new PipelineRun({ status: PipelineStatus.RUNNING });
    expect(runningRun.isRunning()).toBe(true);
  });
});

describe('PipelineMetrics Model', () => {
  it('should calculate success rate correctly', () => {
    const metrics = new PipelineMetrics({
      total: 10,
      successful: 8,
      failed: 2
    });

    expect(metrics.calculateSuccessRate()).toBe(80);
    expect(metrics.calculateFailureRate()).toBe(20);
  });

  it('should handle zero total runs', () => {
    const metrics = new PipelineMetrics({ total: 0 });
    
    expect(metrics.calculateSuccessRate()).toBe(0);
    expect(metrics.calculateFailureRate()).toBe(0);
  });
});
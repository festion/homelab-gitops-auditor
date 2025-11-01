const TestHelpers = require('../helpers/testHelpers');

class GitHubMock {
  constructor() {
    this.repositories = new Map();
    this.workflows = new Map();
    this.workflowRuns = new Map();
    this.rateLimitRemaining = 5000;
    this.rateLimitReset = Date.now() + 3600000; // 1 hour from now
  }

  // Repository methods
  async getRepository(owner, repo) {
    const key = `${owner}/${repo}`;
    if (this.repositories.has(key)) {
      return this.repositories.get(key);
    }
    
    const repository = TestHelpers.createGitHubRepository({
      name: repo,
      full_name: key,
      owner: { login: owner, type: 'User' }
    });
    
    this.repositories.set(key, repository);
    return repository;
  }

  async listRepositories(org) {
    const repos = Array.from(this.repositories.values())
      .filter(repo => repo.owner.login === org);
    
    return {
      data: repos,
      status: 200
    };
  }

  // Workflow methods
  async listWorkflows(owner, repo) {
    const key = `${owner}/${repo}`;
    const workflows = this.workflows.get(key) || [];
    
    return {
      data: {
        workflows: workflows.map(w => ({
          id: w.id,
          name: w.name,
          path: w.path,
          state: w.state,
          created_at: w.created_at,
          updated_at: w.updated_at
        }))
      },
      status: 200
    };
  }

  async triggerWorkflow(owner, repo, workflowId, ref, inputs = {}) {
    this.checkRateLimit();
    
    const runId = Math.floor(Math.random() * 1000000);
    const workflowRun = TestHelpers.createGitHubWorkflowRun({
      id: runId,
      head_branch: ref,
      status: 'queued',
      conclusion: null
    });
    
    const key = `${owner}/${repo}`;
    if (!this.workflowRuns.has(key)) {
      this.workflowRuns.set(key, []);
    }
    
    this.workflowRuns.get(key).push(workflowRun);
    
    // Simulate workflow completion after a delay
    setTimeout(() => {
      workflowRun.status = 'completed';
      workflowRun.conclusion = Math.random() > 0.2 ? 'success' : 'failure';
      workflowRun.updated_at = new Date().toISOString();
    }, 100);
    
    return {
      data: workflowRun,
      status: 200
    };
  }

  async getWorkflowRun(owner, repo, runId) {
    const key = `${owner}/${repo}`;
    const runs = this.workflowRuns.get(key) || [];
    const run = runs.find(r => r.id === runId);
    
    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }
    
    return {
      data: run,
      status: 200
    };
  }

  async listWorkflowRuns(owner, repo, options = {}) {
    const key = `${owner}/${repo}`;
    let runs = this.workflowRuns.get(key) || [];
    
    // Apply filters
    if (options.status) {
      runs = runs.filter(r => r.status === options.status);
    }
    
    if (options.conclusion) {
      runs = runs.filter(r => r.conclusion === options.conclusion);
    }
    
    if (options.branch) {
      runs = runs.filter(r => r.head_branch === options.branch);
    }
    
    // Apply pagination
    const page = options.page || 1;
    const perPage = options.per_page || 30;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    return {
      data: {
        workflow_runs: runs.slice(start, end),
        total_count: runs.length
      },
      status: 200
    };
  }

  // Content methods
  async getContent(owner, repo, path, ref = 'main') {
    // Return mock file content
    const content = Buffer.from(JSON.stringify({
      name: 'Mock CI',
      on: {
        push: { branches: ['main'] },
        pull_request: { branches: ['main'] }
      },
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v3' },
            { uses: 'actions/setup-node@v3' },
            { run: 'npm ci' },
            { run: 'npm test' }
          ]
        }
      }
    }, null, 2)).toString('base64');
    
    return {
      data: {
        name: path,
        path: path,
        content: content,
        encoding: 'base64',
        size: content.length,
        sha: 'mock-sha-' + Math.random().toString(36).substring(7)
      },
      status: 200
    };
  }

  async createOrUpdateFile(owner, repo, path, options) {
    this.checkRateLimit();
    
    return {
      data: {
        content: {
          name: path,
          path: path,
          sha: 'mock-sha-' + Math.random().toString(36).substring(7)
        },
        commit: {
          sha: 'mock-commit-' + Math.random().toString(36).substring(7),
          message: options.message
        }
      },
      status: 201
    };
  }

  // Pull request methods
  async createPullRequest(owner, repo, options) {
    this.checkRateLimit();
    
    const pr = {
      id: Math.floor(Math.random() * 1000000),
      number: Math.floor(Math.random() * 1000),
      title: options.title,
      body: options.body,
      head: { ref: options.head },
      base: { ref: options.base },
      state: 'open',
      html_url: `https://github.com/${owner}/${repo}/pull/${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    return {
      data: pr,
      status: 201
    };
  }

  // Rate limiting
  checkRateLimit() {
    if (this.rateLimitRemaining <= 0) {
      const error = new Error('API rate limit exceeded');
      error.status = 403;
      error.response = {
        status: 403,
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': this.rateLimitReset.toString()
        }
      };
      throw error;
    }
    
    this.rateLimitRemaining--;
  }

  getRateLimit() {
    return {
      data: {
        rate: {
          limit: 5000,
          remaining: this.rateLimitRemaining,
          reset: Math.floor(this.rateLimitReset / 1000)
        }
      },
      status: 200
    };
  }

  // Utility methods
  reset() {
    this.repositories.clear();
    this.workflows.clear();
    this.workflowRuns.clear();
    this.rateLimitRemaining = 5000;
    this.rateLimitReset = Date.now() + 3600000;
  }

  seedTestData() {
    // Add test repositories
    const testRepos = [
      'test-owner/test-repo-1',
      'test-owner/test-repo-2',
      'test-owner/test-repo-3'
    ];
    
    testRepos.forEach(fullName => {
      const [owner, name] = fullName.split('/');
      const repo = TestHelpers.createGitHubRepository({
        name,
        full_name: fullName,
        owner: { login: owner, type: 'User' }
      });
      this.repositories.set(fullName, repo);
    });
    
    // Add test workflows
    testRepos.forEach(fullName => {
      const workflows = [
        {
          id: Math.floor(Math.random() * 1000000),
          name: 'CI',
          path: '.github/workflows/ci.yml',
          state: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: Math.floor(Math.random() * 1000000),
          name: 'Deploy',
          path: '.github/workflows/deploy.yml',
          state: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      
      this.workflows.set(fullName, workflows);
    });
  }
}

// Global mock instance
const githubMock = new GitHubMock();

// Jest mock implementation
const mockGitHubAPI = {
  repos: {
    get: jest.fn(({ owner, repo }) => githubMock.getRepository(owner, repo)),
    listForOrg: jest.fn(({ org }) => githubMock.listRepositories(org)),
    getContent: jest.fn(({ owner, repo, path, ref }) => 
      githubMock.getContent(owner, repo, path, ref)),
    createOrUpdateFileContents: jest.fn(({ owner, repo, path, ...options }) =>
      githubMock.createOrUpdateFile(owner, repo, path, options))
  },
  actions: {
    listRepoWorkflows: jest.fn(({ owner, repo }) => 
      githubMock.listWorkflows(owner, repo)),
    createWorkflowDispatch: jest.fn(({ owner, repo, workflow_id, ref, inputs }) =>
      githubMock.triggerWorkflow(owner, repo, workflow_id, ref, inputs)),
    getWorkflowRun: jest.fn(({ owner, repo, run_id }) =>
      githubMock.getWorkflowRun(owner, repo, run_id)),
    listWorkflowRuns: jest.fn(({ owner, repo, ...options }) =>
      githubMock.listWorkflowRuns(owner, repo, options))
  },
  pulls: {
    create: jest.fn(({ owner, repo, ...options }) =>
      githubMock.createPullRequest(owner, repo, options))
  },
  rateLimit: {
    get: jest.fn(() => githubMock.getRateLimit())
  }
};

module.exports = {
  GitHubMock,
  githubMock,
  mockGitHubAPI,
  setupGitHubMock: () => {
    githubMock.reset();
    githubMock.seedTestData();
    return githubMock;
  },
  resetGitHubMock: () => {
    githubMock.reset();
  }
};
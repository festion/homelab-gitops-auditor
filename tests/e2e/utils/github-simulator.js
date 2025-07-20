const crypto = require('crypto');
const fetch = require('node-fetch');

class GitHubSimulator {
  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3071';
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'test-webhook-secret-123';
  }

  async initialize() {
    console.log('🔧 Initializing GitHub simulator...');
    // Any initialization needed
  }

  generateWebhookSignature(payload) {
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  async sendRepositoryDispatchWebhook(scenario) {
    const payload = this.createPushWebhookPayload(scenario);
    const signature = this.generateWebhookSignature(payload);
    
    console.log(`📡 Sending GitHub webhook for repository: ${scenario.repository || 'festion/home-assistant-config'}`);
    
    const response = await fetch(`${this.baseUrl}/webhooks/github/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Delivery': crypto.randomUUID(),
        'User-Agent': 'GitHub-Hookshot/e2e-test'
      },
      body: JSON.stringify(payload)
    });
    
    return {
      status: response.status,
      body: await response.json()
    };
  }

  async sendPullRequestWebhook(scenario) {
    const payload = this.createPullRequestWebhookPayload(scenario);
    const signature = this.generateWebhookSignature(payload);
    
    console.log(`📡 Sending GitHub PR webhook for repository: ${scenario.repository || 'festion/home-assistant-config'}`);
    
    const response = await fetch(`${this.baseUrl}/webhooks/github/pull-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Delivery': crypto.randomUUID(),
        'User-Agent': 'GitHub-Hookshot/e2e-test'
      },
      body: JSON.stringify(payload)
    });
    
    return {
      status: response.status,
      body: await response.json()
    };
  }

  createPushWebhookPayload(scenario = {}) {
    const commitSha = scenario.commitSha || crypto.randomBytes(20).toString('hex');
    const repository = scenario.repository || 'festion/home-assistant-config';
    const ref = scenario.ref || 'refs/heads/main';
    const author = scenario.author || { name: 'E2E Test User', email: 'e2e-test@example.com' };
    
    return {
      ref: ref,
      before: crypto.randomBytes(20).toString('hex'),
      after: commitSha,
      created: false,
      deleted: false,
      forced: false,
      base_ref: null,
      compare: `https://github.com/${repository}/compare/abc123...${commitSha}`,
      commits: [
        {
          id: commitSha,
          tree_id: crypto.randomBytes(20).toString('hex'),
          distinct: true,
          message: scenario.message || 'Update Home Assistant configuration for E2E test',
          timestamp: new Date().toISOString(),
          url: `https://github.com/${repository}/commit/${commitSha}`,
          author: author,
          committer: author,
          added: scenario.added || ['automations/e2e-test.yaml'],
          removed: scenario.removed || [],
          modified: scenario.modified || ['configuration.yaml']
        }
      ],
      head_commit: {
        id: commitSha,
        tree_id: crypto.randomBytes(20).toString('hex'),
        distinct: true,
        message: scenario.message || 'Update Home Assistant configuration for E2E test',
        timestamp: new Date().toISOString(),
        url: `https://github.com/${repository}/commit/${commitSha}`,
        author: author,
        committer: author,
        added: scenario.added || ['automations/e2e-test.yaml'],
        removed: scenario.removed || [],
        modified: scenario.modified || ['configuration.yaml']
      },
      repository: {
        id: 123456789,
        node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
        name: repository.split('/')[1],
        full_name: repository,
        private: false,
        owner: {
          name: repository.split('/')[0],
          email: `${repository.split('/')[0]}@example.com`,
          login: repository.split('/')[0],
          id: 12345,
          node_id: 'MDQ6VXNlcjEyMzQ1',
          avatar_url: `https://github.com/images/error/${repository.split('/')[0]}_happy.gif`,
          gravatar_id: '',
          url: `https://api.github.com/users/${repository.split('/')[0]}`,
          html_url: `https://github.com/${repository.split('/')[0]}`,
          type: 'User',
          site_admin: false
        },
        html_url: `https://github.com/${repository}`,
        description: 'Home Assistant configuration files for E2E testing',
        fork: false,
        url: `https://github.com/${repository}`,
        created_at: 1609459200,
        updated_at: 1672531200,
        pushed_at: Math.floor(Date.now() / 1000),
        git_url: `git://github.com/${repository}.git`,
        ssh_url: `git@github.com:${repository}.git`,
        clone_url: `https://github.com/${repository}.git`,
        svn_url: `https://github.com/${repository}`,
        size: 1024,
        stargazers_count: 5,
        watchers_count: 5,
        language: 'YAML',
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        has_pages: false,
        forks_count: 1,
        open_issues_count: 0,
        forks: 1,
        open_issues: 0,
        watchers: 5,
        default_branch: 'main'
      },
      pusher: {
        name: repository.split('/')[0],
        email: `${repository.split('/')[0]}@example.com`
      },
      sender: {
        login: repository.split('/')[0],
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: `https://github.com/images/error/${repository.split('/')[0]}_happy.gif`,
        gravatar_id: '',
        url: `https://api.github.com/users/${repository.split('/')[0]}`,
        html_url: `https://github.com/${repository.split('/')[0]}`,
        type: 'User',
        site_admin: false
      }
    };
  }

  createPullRequestWebhookPayload(scenario = {}) {
    const commitSha = scenario.commitSha || crypto.randomBytes(20).toString('hex');
    const repository = scenario.repository || 'festion/home-assistant-config';
    const prNumber = scenario.prNumber || 123;
    const action = scenario.action || 'opened';
    
    return {
      action: action,
      number: prNumber,
      pull_request: {
        url: `https://api.github.com/repos/${repository}/pulls/${prNumber}`,
        id: 987654321,
        node_id: 'MDExOlB1bGxSZXF1ZXN0OTg3NjU0MzIx',
        html_url: `https://github.com/${repository}/pull/${prNumber}`,
        diff_url: `https://github.com/${repository}/pull/${prNumber}.diff`,
        patch_url: `https://github.com/${repository}/pull/${prNumber}.patch`,
        issue_url: `https://api.github.com/repos/${repository}/issues/${prNumber}`,
        number: prNumber,
        state: 'open',
        locked: false,
        title: scenario.title || 'Update automation configuration for E2E test',
        user: {
          login: repository.split('/')[0],
          id: 12345,
          node_id: 'MDQ6VXNlcjEyMzQ1',
          avatar_url: `https://github.com/images/error/${repository.split('/')[0]}_happy.gif`,
          type: 'User'
        },
        body: scenario.body || 'This pull request updates the automation configuration for E2E testing.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        merged_at: null,
        merge_commit_sha: null,
        assignee: null,
        assignees: [],
        requested_reviewers: [],
        requested_teams: [],
        labels: [],
        milestone: null,
        draft: false,
        commits_url: `https://api.github.com/repos/${repository}/pulls/${prNumber}/commits`,
        review_comments_url: `https://api.github.com/repos/${repository}/pulls/${prNumber}/comments`,
        review_comment_url: `https://api.github.com/repos/${repository}/pulls/comments{/number}`,
        comments_url: `https://api.github.com/repos/${repository}/issues/${prNumber}/comments`,
        statuses_url: `https://api.github.com/repos/${repository}/statuses/${commitSha}`,
        head: {
          label: `${repository.split('/')[0]}:feature-e2e-test`,
          ref: 'feature-e2e-test',
          sha: commitSha,
          user: {
            login: repository.split('/')[0],
            id: 12345,
            type: 'User'
          },
          repo: {
            id: 123456789,
            name: repository.split('/')[1],
            full_name: repository,
            owner: {
              login: repository.split('/')[0],
              id: 12345,
              type: 'User'
            },
            private: false,
            default_branch: 'main'
          }
        },
        base: {
          label: `${repository.split('/')[0]}:main`,
          ref: 'main',
          sha: crypto.randomBytes(20).toString('hex'),
          user: {
            login: repository.split('/')[0],
            id: 12345,
            type: 'User'
          },
          repo: {
            id: 123456789,
            name: repository.split('/')[1],
            full_name: repository,
            owner: {
              login: repository.split('/')[0],
              id: 12345,
              type: 'User'
            },
            private: false,
            default_branch: 'main'
          }
        }
      },
      repository: {
        id: 123456789,
        name: repository.split('/')[1],
        full_name: repository,
        owner: {
          login: repository.split('/')[0],
          id: 12345,
          type: 'User'
        },
        private: false,
        default_branch: 'main'
      },
      sender: {
        login: repository.split('/')[0],
        id: 12345,
        type: 'User'
      }
    };
  }

  // Scenario generators for different test cases
  createSuccessfulDeploymentScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Success Test',
        email: 'e2e-success@example.com'
      },
      message: 'Add new automation for successful E2E test',
      added: ['automations/successful-test.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createHomeAssistantFailureScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E HA Failure Test',
        email: 'e2e-ha-failure@example.com'
      },
      message: 'Add invalid Home Assistant configuration that will cause startup failure',
      added: ['automations/invalid-syntax.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createInvalidConfigScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Invalid Config Test',
        email: 'e2e-invalid@example.com'
      },
      message: 'Add configuration with YAML syntax errors',
      added: ['automations/malformed.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createLargeConfigScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Large Config Test',
        email: 'e2e-large@example.com'
      },
      message: 'Deploy large configuration with many automations and entities',
      added: [
        'automations/large-automation-1.yaml',
        'automations/large-automation-2.yaml',
        'automations/large-automation-3.yaml',
        'automations/large-automation-4.yaml',
        'automations/large-automation-5.yaml'
      ],
      modified: ['configuration.yaml', 'scripts.yaml', 'sensors.yaml', 'lights.yaml']
    });
  }

  createRuntimeFailureScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Runtime Failure Test',
        email: 'e2e-runtime-failure@example.com'
      },
      message: 'Add configuration that passes validation but fails at runtime',
      added: ['automations/runtime-failure.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createPartialRollbackFailureScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Partial Rollback Test',
        email: 'e2e-partial-rollback@example.com'
      },
      message: 'Configuration that will cause partial rollback failure',
      added: ['automations/partial-rollback-test.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createSuspiciousConfigScenario() {
    return this.createPushWebhookPayload({
      repository: 'festion/home-assistant-config',
      ref: 'refs/heads/main',
      commitSha: crypto.randomBytes(20).toString('hex'),
      author: {
        name: 'E2E Security Test',
        email: 'e2e-security@example.com'
      },
      message: 'Configuration with potentially suspicious content for security testing',
      added: ['automations/suspicious-content.yaml'],
      modified: ['configuration.yaml']
    });
  }

  createPullRequestScenario(action = 'opened') {
    return {
      action: action,
      repository: 'festion/home-assistant-config',
      prNumber: Math.floor(Math.random() * 1000) + 100,
      title: 'E2E Test: Configuration Update',
      body: 'This PR contains configuration updates for E2E testing.',
      commitSha: crypto.randomBytes(20).toString('hex')
    };
  }

  // Simulate network delays and failures
  async simulateNetworkDelay(minMs = 500, maxMs = 2000) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateNetworkFailure(probability = 0.1) {
    if (Math.random() < probability) {
      throw new Error('Simulated network failure');
    }
  }

  // Webhook validation utilities
  validateWebhookSignature(payload, signature) {
    const expectedSignature = this.generateWebhookSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = { GitHubSimulator };
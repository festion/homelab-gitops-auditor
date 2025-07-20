/**
 * Pipeline Service
 * 
 * Provides pipeline status tracking, GitHub Actions integration,
 * and real-time pipeline monitoring capabilities.
 */

const EventEmitter = require('events');

class PipelineService extends EventEmitter {
    constructor(githubMCP, config) {
        super();
        this.githubMCP = githubMCP;
        this.config = config;
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
        this.retryDelay = 1000; // Initial retry delay
        this.maxRetries = 3;
    }

    /**
     * Get current pipeline status for all repositories
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Pipeline status data
     */
    async getPipelineStatus(options = {}) {
        const { repo, branch, status, limit = 50 } = options;
        
        try {
            // Check cache first
            const cacheKey = `status_${JSON.stringify(options)}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            const repositories = repo ? [repo] : await this.getMonitoredRepositories();
            const pipelines = [];

            for (const repository of repositories) {
                try {
                    const [owner, repoName] = repository.split('/');
                    const workflows = await this.getWorkflowRuns(owner, repoName, {
                        branch,
                        status,
                        per_page: Math.min(limit, 100)
                    });

                    for (const workflow of workflows) {
                        pipelines.push({
                            repository,
                            branch: workflow.head_branch,
                            status: this.mapGitHubStatus(workflow.status, workflow.conclusion),
                            lastRun: workflow.created_at,
                            duration: this.calculateDuration(workflow.created_at, workflow.updated_at),
                            workflowName: workflow.name,
                            runId: workflow.id,
                            conclusion: workflow.conclusion,
                            steps: await this.getWorkflowSteps(owner, repoName, workflow.id)
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching pipeline status for ${repository}:`, error);
                    // Continue with other repositories
                }
            }

            const result = {
                pipelines: pipelines.slice(0, limit),
                metadata: {
                    total: pipelines.length,
                    timestamp: new Date().toISOString()
                }
            };

            // Cache the result
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting pipeline status:', error);
            throw new Error(`Failed to get pipeline status: ${error.message}`);
        }
    }

    /**
     * Get pipeline run history for a specific repository
     * @param {string} repository - Repository in owner/repo format
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Pipeline history
     */
    async getPipelineHistory(repository, options = {}) {
        const { page = 1, per_page = 30, workflow_id, branch } = options;
        
        try {
            const [owner, repo] = repository.split('/');
            
            const runs = await this.getWorkflowRuns(owner, repo, {
                page,
                per_page,
                workflow_id,
                branch
            });

            const history = [];
            for (const run of runs) {
                const details = await this.getWorkflowRunDetails(owner, repo, run.id);
                const jobs = await this.getWorkflowJobs(owner, repo, run.id);
                
                history.push({
                    id: run.id,
                    name: run.name,
                    status: this.mapGitHubStatus(run.status, run.conclusion),
                    conclusion: run.conclusion,
                    created_at: run.created_at,
                    updated_at: run.updated_at,
                    duration: this.calculateDuration(run.created_at, run.updated_at),
                    branch: run.head_branch,
                    commit_sha: run.head_sha,
                    commit_message: run.head_commit?.message || '',
                    actor: run.actor?.login || '',
                    jobs: jobs.map(job => ({
                        id: job.id,
                        name: job.name,
                        status: this.mapGitHubStatus(job.status, job.conclusion),
                        started_at: job.started_at,
                        completed_at: job.completed_at,
                        duration: this.calculateDuration(job.started_at, job.completed_at),
                        steps: job.steps || []
                    })),
                    artifacts: details.artifacts || []
                });
            }

            return {
                repository,
                runs: history,
                metadata: {
                    page,
                    per_page,
                    total: runs.length,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error(`Error getting pipeline history for ${repository}:`, error);
            throw new Error(`Failed to get pipeline history: ${error.message}`);
        }
    }

    /**
     * Trigger a pipeline run
     * @param {Object} request - Trigger request
     * @returns {Promise<Object>} Trigger result
     */
    async triggerPipeline(request) {
        const { repository, workflow, branch = 'main', inputs = {} } = request;
        
        try {
            const [owner, repo] = repository.split('/');
            
            // Get workflow ID if workflow name provided
            let workflowId = workflow;
            if (isNaN(workflow)) {
                const workflows = await this.listWorkflows(owner, repo);
                const workflowObj = workflows.find(w => w.name === workflow || w.path.endsWith(`/${workflow}`));
                if (!workflowObj) {
                    throw new Error(`Workflow '${workflow}' not found`);
                }
                workflowId = workflowObj.id;
            }

            const result = await this.triggerWorkflow(owner, repo, workflowId, {
                ref: branch,
                inputs
            });

            // Emit event for real-time updates
            this.emit('pipeline:triggered', {
                repository,
                workflow,
                branch,
                inputs,
                result
            });

            return {
                success: true,
                repository,
                workflow,
                branch,
                message: 'Pipeline triggered successfully',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`Error triggering pipeline for ${repository}:`, error);
            throw new Error(`Failed to trigger pipeline: ${error.message}`);
        }
    }

    /**
     * Get pipeline metrics and analytics
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Pipeline metrics
     */
    async getPipelineMetrics(options = {}) {
        const { repository, timeRange = '30d', branch } = options;
        
        try {
            const repositories = repository ? [repository] : await this.getMonitoredRepositories();
            const metrics = {};

            for (const repo of repositories) {
                const [owner, repoName] = repo.split('/');
                const since = this.getTimeRangeDate(timeRange);
                
                const runs = await this.getWorkflowRuns(owner, repoName, {
                    created: `>=${since}`,
                    branch,
                    per_page: 100
                });

                const repoMetrics = this.calculateMetrics(runs);
                metrics[repo] = repoMetrics;
            }

            return {
                metrics,
                timeRange,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting pipeline metrics:', error);
            throw new Error(`Failed to get pipeline metrics: ${error.message}`);
        }
    }

    /**
     * GitHub API integration methods
     */
    async getWorkflowRuns(owner, repo, options = {}) {
        if (this.githubMCP) {
            // Use GitHub MCP server
            return await this.githubMCP.getWorkflowRuns(owner, repo, options);
        } else {
            // Fallback to direct API call with exponential backoff
            return await this.makeGitHubAPICall(`repos/${owner}/${repo}/actions/runs`, options);
        }
    }

    async getWorkflowRunDetails(owner, repo, runId) {
        if (this.githubMCP) {
            return await this.githubMCP.getWorkflowRun(owner, repo, runId);
        } else {
            return await this.makeGitHubAPICall(`repos/${owner}/${repo}/actions/runs/${runId}`);
        }
    }

    async getWorkflowJobs(owner, repo, runId) {
        if (this.githubMCP) {
            return await this.githubMCP.getWorkflowJobs(owner, repo, runId);
        } else {
            const response = await this.makeGitHubAPICall(`repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
            return response.jobs || [];
        }
    }

    async listWorkflows(owner, repo) {
        if (this.githubMCP) {
            return await this.githubMCP.listWorkflows(owner, repo);
        } else {
            const response = await this.makeGitHubAPICall(`repos/${owner}/${repo}/actions/workflows`);
            return response.workflows || [];
        }
    }

    async triggerWorkflow(owner, repo, workflowId, data) {
        if (this.githubMCP) {
            return await this.githubMCP.triggerWorkflow(owner, repo, workflowId, data);
        } else {
            return await this.makeGitHubAPICall(
                `repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
                data,
                'POST'
            );
        }
    }

    /**
     * Helper methods
     */
    async getWorkflowSteps(owner, repo, runId) {
        try {
            const jobs = await this.getWorkflowJobs(owner, repo, runId);
            const steps = [];
            
            for (const job of jobs) {
                if (job.steps) {
                    steps.push(...job.steps.map(step => ({
                        ...step,
                        job_name: job.name
                    })));
                }
            }
            
            return steps.slice(0, 10); // Limit steps for performance
        } catch (error) {
            console.error(`Error getting workflow steps for run ${runId}:`, error);
            return [];
        }
    }

    mapGitHubStatus(status, conclusion) {
        if (status === 'completed') {
            switch (conclusion) {
                case 'success': return 'success';
                case 'failure': 
                case 'cancelled':
                case 'timed_out': return 'failure';
                default: return 'failure';
            }
        } else if (status === 'in_progress') {
            return 'running';
        } else if (status === 'queued') {
            return 'pending';
        }
        return 'pending';
    }

    calculateDuration(start, end) {
        if (!start || !end) return null;
        const startTime = new Date(start);
        const endTime = new Date(end);
        return Math.round((endTime - startTime) / 1000); // Duration in seconds
    }

    calculateMetrics(runs) {
        const total = runs.length;
        const successful = runs.filter(r => r.conclusion === 'success').length;
        const failed = runs.filter(r => r.conclusion === 'failure').length;
        const cancelled = runs.filter(r => r.conclusion === 'cancelled').length;
        
        const durations = runs
            .filter(r => r.created_at && r.updated_at)
            .map(r => this.calculateDuration(r.created_at, r.updated_at))
            .filter(d => d !== null);

        return {
            total,
            successful,
            failed,
            cancelled,
            successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
            failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
            averageDuration: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
            medianDuration: this.calculateMedian(durations)
        };
    }

    calculateMedian(arr) {
        if (arr.length === 0) return 0;
        const sorted = arr.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    getTimeRangeDate(timeRange) {
        const now = new Date();
        const match = timeRange.match(/^(\d+)([dhw])$/);
        if (!match) return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

        const [, value, unit] = match;
        const multiplier = { d: 24 * 60 * 60 * 1000, h: 60 * 60 * 1000, w: 7 * 24 * 60 * 60 * 1000 };
        return new Date(now.getTime() - parseInt(value) * multiplier[unit]);
    }

    async getMonitoredRepositories() {
        // Get repositories from config or default list
        const defaultRepos = [
            'homelab-gitops-auditor',
            'home-assistant-config'
        ];
        
        return this.config.get('MONITORED_REPOSITORIES', defaultRepos);
    }

    async makeGitHubAPICall(endpoint, data = {}, method = 'GET') {
        const { fetch } = await import('node-fetch');
        const token = this.config.get('GITHUB_TOKEN');
        
        if (!token) {
            throw new Error('GitHub token not configured');
        }

        const url = `https://api.github.com/${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'homelab-gitops-auditor'
            }
        };

        if (method !== 'GET') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        } else if (Object.keys(data).length > 0) {
            const params = new URLSearchParams(data);
            url += `?${params}`;
        }

        return await this.retryWithBackoff(async () => {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        });
    }

    async retryWithBackoff(fn) {
        let lastError;
        
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt < this.maxRetries - 1) {
                    const delay = this.retryDelay * Math.pow(2, attempt);
                    console.log(`Retrying GitHub API call in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }
}

module.exports = PipelineService;
/**
 * Pipeline Metrics Collector
 * 
 * Collects comprehensive pipeline performance and reliability metrics from
 * GitHub Actions, including execution times, success rates, and resource usage.
 */

const EventEmitter = require('events');
const { PipelineMetrics } = require('../../../models/metrics');

class PipelineCollector extends EventEmitter {
    constructor(config, githubMCP = null, pipelineService = null) {
        super();
        this.config = config;
        this.githubMCP = githubMCP;
        this.pipelineService = pipelineService;
        this.cache = new Map();
        this.cacheTimeout = 180000; // 3 minutes
        this.lookbackHours = 24; // Look back 24 hours for pipeline data
    }

    /**
     * Collect metrics for all pipelines
     */
    async collect() {
        try {
            const repositories = await this.getMonitoredRepositories();
            const metrics = [];

            for (const repository of repositories) {
                try {
                    const pipelineMetrics = await this.collectPipelineMetrics(repository);
                    metrics.push(...pipelineMetrics);
                    
                    this.emit('pipeline:collected', { 
                        repository, 
                        count: pipelineMetrics.length 
                    });
                } catch (error) {
                    console.error(`Error collecting pipeline metrics for ${repository}:`, error);
                    this.emit('pipeline:error', { repository, error });
                }
            }

            this.emit('collection:completed', { count: metrics.length });
            return metrics;
        } catch (error) {
            console.error('Error in pipeline collection:', error);
            this.emit('collection:error', error);
            throw error;
        }
    }

    /**
     * Collect pipeline metrics for a specific repository
     * @param {string} repository - Repository in owner/repo format
     */
    async collectPipelineMetrics(repository) {
        const cacheKey = `pipeline_${repository}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const metrics = [];
        
        try {
            // Get recent pipeline runs
            const runs = await this.getRecentPipelineRuns(repository);
            
            if (runs.length === 0) {
                console.warn(`No recent pipeline runs found for ${repository}`);
                return [];
            }

            // Group runs by workflow/pipeline
            const pipelineGroups = this.groupRunsByPipeline(runs);
            
            for (const [pipelineName, pipelineRuns] of pipelineGroups.entries()) {
                const pipelineMetrics = await this.calculatePipelineMetrics(
                    pipelineName, 
                    repository, 
                    pipelineRuns
                );
                
                if (pipelineMetrics) {
                    metrics.push(...pipelineMetrics.toMetricDataPoints());
                }
            }

            // Cache the result
            this.cache.set(cacheKey, {
                data: metrics,
                timestamp: Date.now()
            });

            return metrics;
        } catch (error) {
            console.error(`Error collecting pipeline metrics for ${repository}:`, error);
            return [];
        }
    }

    /**
     * Get recent pipeline runs for a repository
     */
    async getRecentPipelineRuns(repository) {
        const [owner, repo] = repository.split('/');
        if (!owner || !repo) {
            throw new Error(`Invalid repository format: ${repository}`);
        }

        const since = new Date(Date.now() - this.lookbackHours * 60 * 60 * 1000).toISOString();
        
        try {
            // Use GitHub MCP if available
            if (this.githubMCP) {
                return await this.githubMCP.getWorkflowRuns(owner, repo, {
                    created: `>=${since}`,
                    per_page: 100
                });
            }
            
            // Fallback to pipeline service
            if (this.pipelineService) {
                const history = await this.pipelineService.getPipelineHistory(repository, {
                    per_page: 100
                });
                return history.runs || [];
            }
            
            throw new Error('No GitHub MCP or Pipeline Service available');
        } catch (error) {
            console.error(`Error fetching pipeline runs for ${repository}:`, error);
            return [];
        }
    }

    /**
     * Group pipeline runs by workflow name
     */
    groupRunsByPipeline(runs) {
        const groups = new Map();
        
        for (const run of runs) {
            const pipelineName = run.name || run.workflowName || 'default';
            
            if (!groups.has(pipelineName)) {
                groups.set(pipelineName, []);
            }
            groups.get(pipelineName).push(run);
        }
        
        return groups;
    }

    /**
     * Calculate metrics for a specific pipeline
     */
    async calculatePipelineMetrics(pipelineName, repository, runs) {
        if (runs.length === 0) {
            return null;
        }

        // Calculate performance metrics
        const performance = await this.calculatePerformanceMetrics(runs);
        
        // Calculate reliability metrics
        const reliability = this.calculateReliabilityMetrics(runs);
        
        // Calculate resource metrics
        const resources = await this.calculateResourceMetrics(runs);

        const pipelineMetrics = new PipelineMetrics({
            pipeline: pipelineName,
            repository,
            timestamp: new Date().toISOString(),
            performance,
            reliability,
            resources
        });

        return pipelineMetrics;
    }

    /**
     * Calculate performance metrics from pipeline runs
     */
    async calculatePerformanceMetrics(runs) {
        const performance = {
            duration: 0,
            queueTime: 0,
            stepDurations: {},
            throughput: 0
        };

        const completedRuns = runs.filter(run => 
            run.status === 'completed' && 
            run.created_at && 
            run.updated_at
        );

        if (completedRuns.length === 0) {
            return performance;
        }

        // Calculate average duration
        const durations = completedRuns.map(run => {
            const start = new Date(run.created_at);
            const end = new Date(run.updated_at);
            return Math.round((end - start) / 1000); // Duration in seconds
        }).filter(d => d > 0);

        if (durations.length > 0) {
            performance.duration = Math.round(
                durations.reduce((sum, d) => sum + d, 0) / durations.length
            );
        }

        // Calculate queue time (time between created and started)
        const queueTimes = completedRuns
            .filter(run => run.run_started_at)
            .map(run => {
                const created = new Date(run.created_at);
                const started = new Date(run.run_started_at);
                return Math.round((started - created) / 1000);
            })
            .filter(qt => qt > 0);

        if (queueTimes.length > 0) {
            performance.queueTime = Math.round(
                queueTimes.reduce((sum, qt) => sum + qt, 0) / queueTimes.length
            );
        }

        // Calculate throughput (runs per hour)
        const timeRangeHours = this.lookbackHours;
        performance.throughput = Math.round((runs.length / timeRangeHours) * 100) / 100;

        // Get step durations for the most recent run
        const latestRun = runs[0];
        if (latestRun) {
            performance.stepDurations = await this.getStepDurations(latestRun);
        }

        return performance;
    }

    /**
     * Calculate reliability metrics from pipeline runs
     */
    calculateReliabilityMetrics(runs) {
        const reliability = {
            successRate: 0,
            failureRate: 0,
            flakyTests: [],
            meanTimeToRecovery: 0
        };

        if (runs.length === 0) {
            return reliability;
        }

        // Calculate success and failure rates
        const successfulRuns = runs.filter(run => 
            run.conclusion === 'success' || run.status === 'success'
        ).length;
        
        const failedRuns = runs.filter(run => 
            run.conclusion === 'failure' || run.status === 'failure'
        ).length;

        reliability.successRate = Math.round((successfulRuns / runs.length) * 100);
        reliability.failureRate = Math.round((failedRuns / runs.length) * 100);

        // Detect flaky tests (runs that fail and then succeed quickly)
        reliability.flakyTests = this.detectFlakyTests(runs);

        // Calculate MTTR (Mean Time To Recovery)
        reliability.meanTimeToRecovery = this.calculateMTTR(runs);

        return reliability;
    }

    /**
     * Calculate resource metrics from pipeline runs
     */
    async calculateResourceMetrics(runs) {
        const resources = {
            cpuUsage: 0,
            memoryUsage: 0,
            artifactSize: 0,
            parallelJobs: 0
        };

        if (runs.length === 0) {
            return resources;
        }

        // Estimate resource usage based on duration and complexity
        const avgDuration = runs
            .filter(run => run.created_at && run.updated_at)
            .map(run => {
                const start = new Date(run.created_at);
                const end = new Date(run.updated_at);
                return (end - start) / 1000;
            })
            .reduce((sum, d, _, arr) => sum + d / arr.length, 0);

        // Simple estimation: longer runs use more resources
        resources.cpuUsage = Math.min(100, Math.round(avgDuration / 60 * 10)); // Rough estimate
        resources.memoryUsage = Math.round(avgDuration * 2); // MB estimate

        // Count average parallel jobs
        let totalJobs = 0;
        let runsWithJobs = 0;

        for (const run of runs.slice(0, 5)) { // Check last 5 runs
            try {
                const jobs = await this.getRunJobs(run);
                if (jobs && jobs.length > 0) {
                    totalJobs += jobs.length;
                    runsWithJobs++;
                }
            } catch (error) {
                // Ignore job fetch errors
            }
        }

        if (runsWithJobs > 0) {
            resources.parallelJobs = Math.round(totalJobs / runsWithJobs);
        }

        return resources;
    }

    /**
     * Get step durations for a pipeline run
     */
    async getStepDurations(run) {
        const stepDurations = {};

        try {
            const jobs = await this.getRunJobs(run);
            
            for (const job of jobs || []) {
                if (job.steps) {
                    for (const step of job.steps) {
                        if (step.started_at && step.completed_at) {
                            const start = new Date(step.started_at);
                            const end = new Date(step.completed_at);
                            const duration = Math.round((end - start) / 1000);
                            stepDurations[step.name] = duration;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error getting step durations:', error);
        }

        return stepDurations;
    }

    /**
     * Get jobs for a pipeline run
     */
    async getRunJobs(run) {
        if (!run.id) {
            return [];
        }

        try {
            if (this.githubMCP) {
                const [owner, repo] = run.repository?.split('/') || ['', ''];
                if (owner && repo) {
                    return await this.githubMCP.getWorkflowJobs(owner, repo, run.id);
                }
            }
            
            if (this.pipelineService) {
                // Pipeline service might have jobs in the run data
                return run.jobs || [];
            }
            
            return [];
        } catch (error) {
            console.error(`Error fetching jobs for run ${run.id}:`, error);
            return [];
        }
    }

    /**
     * Detect flaky tests from run patterns
     */
    detectFlakyTests(runs) {
        const flakyTests = [];
        
        // Simple flaky test detection: failure followed by success within 1 hour
        for (let i = 0; i < runs.length - 1; i++) {
            const current = runs[i];
            const next = runs[i + 1];
            
            if (current.conclusion === 'failure' && next.conclusion === 'success') {
                const currentTime = new Date(current.created_at);
                const nextTime = new Date(next.created_at);
                const timeDiff = Math.abs(currentTime - nextTime) / (1000 * 60 * 60); // Hours
                
                if (timeDiff <= 1) {
                    flakyTests.push({
                        workflow: current.name,
                        failedAt: current.created_at,
                        succeededAt: next.created_at,
                        timeDiff: Math.round(timeDiff * 60) // Minutes
                    });
                }
            }
        }
        
        return flakyTests;
    }

    /**
     * Calculate Mean Time To Recovery
     */
    calculateMTTR(runs) {
        const failures = runs.filter(run => run.conclusion === 'failure');
        if (failures.length === 0) return 0;

        let totalRecoveryTime = 0;
        let recoveries = 0;

        for (const failure of failures) {
            // Find the next successful run after this failure
            const failureTime = new Date(failure.created_at);
            const nextSuccess = runs.find(run => 
                run.conclusion === 'success' && 
                new Date(run.created_at) > failureTime
            );

            if (nextSuccess) {
                const recoveryTime = new Date(nextSuccess.created_at) - failureTime;
                totalRecoveryTime += recoveryTime;
                recoveries++;
            }
        }

        return recoveries > 0 ? Math.round(totalRecoveryTime / recoveries / 1000 / 60) : 0; // Minutes
    }

    /**
     * Get list of monitored repositories
     */
    async getMonitoredRepositories() {
        const defaultRepos = [
            'homelab-gitops-auditor',
            'home-assistant-config'
        ];
        
        return this.config.get('MONITORED_REPOSITORIES', defaultRepos);
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get collector statistics
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            lookbackHours: this.lookbackHours,
            hasGitHubMCP: !!this.githubMCP,
            hasPipelineService: !!this.pipelineService
        };
    }
}

module.exports = PipelineCollector;
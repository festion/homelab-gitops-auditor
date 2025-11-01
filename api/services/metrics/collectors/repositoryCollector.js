/**
 * Repository Metrics Collector
 * 
 * Collects comprehensive repository health and activity metrics including
 * git status, file analysis, security scanning, and activity tracking.
 */

const EventEmitter = require('events');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RepositoryMetrics } = require('../../../models/metrics');

class RepositoryCollector extends EventEmitter {
    constructor(config, githubMCP = null) {
        super();
        this.config = config;
        this.githubMCP = githubMCP;
        this.repositoriesPath = config.get('LOCAL_DIR', path.join(__dirname, '../../../../repos'));
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
    }

    /**
     * Collect metrics for all repositories
     */
    async collect() {
        try {
            const repositories = await this.getRepositoryList();
            const metrics = [];

            for (const repo of repositories) {
                try {
                    const repoMetrics = await this.collectRepositoryMetrics(repo);
                    if (repoMetrics) {
                        metrics.push(...repoMetrics.toMetricDataPoints());
                        this.emit('repository:collected', { repository: repo, metrics: repoMetrics });
                    }
                } catch (error) {
                    console.error(`Error collecting metrics for repository ${repo}:`, error);
                    this.emit('repository:error', { repository: repo, error });
                }
            }

            this.emit('collection:completed', { count: metrics.length });
            return metrics;
        } catch (error) {
            console.error('Error in repository collection:', error);
            this.emit('collection:error', error);
            throw error;
        }
    }

    /**
     * Collect metrics for a specific repository
     * @param {string} repository - Repository name
     */
    async collectRepositoryMetrics(repository) {
        const cacheKey = `repo_${repository}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const repoPath = path.join(this.repositoriesPath, repository);
        
        if (!fs.existsSync(repoPath)) {
            console.warn(`Repository path not found: ${repoPath}`);
            return null;
        }

        // Collect all metrics in parallel
        const [
            healthMetrics,
            activityMetrics,
            sizeMetrics,
            securityMetrics
        ] = await Promise.all([
            this.collectHealthMetrics(repository, repoPath),
            this.collectActivityMetrics(repository, repoPath),
            this.collectSizeMetrics(repository, repoPath),
            this.collectSecurityMetrics(repository, repoPath)
        ]);

        const repoMetrics = new RepositoryMetrics({
            repository,
            timestamp: new Date().toISOString(),
            health: healthMetrics,
            activity: activityMetrics,
            size: sizeMetrics,
            security: securityMetrics
        });

        // Calculate overall health score
        repoMetrics.calculateHealthScore();

        // Cache the result
        this.cache.set(cacheKey, {
            data: repoMetrics,
            timestamp: Date.now()
        });

        return repoMetrics;
    }

    /**
     * Collect repository health metrics
     */
    async collectHealthMetrics(repository, repoPath) {
        const health = {
            status: 'unknown',
            uncommittedChanges: 0,
            staleTags: 0,
            missingFiles: 0,
            score: 0
        };

        try {
            // Check git status
            const gitStatus = await this.execCommand('git status --porcelain', repoPath);
            const statusLines = gitStatus.trim().split('\n').filter(line => line.trim());
            health.uncommittedChanges = statusLines.length;

            // Check for stale tags
            const tags = await this.execCommand('git tag -l', repoPath);
            const tagList = tags.trim().split('\n').filter(tag => tag.trim());
            
            // Check if tags are older than 6 months (simplified check)
            let staleCount = 0;
            for (const tag of tagList.slice(0, 10)) { // Check last 10 tags
                try {
                    const tagDate = await this.execCommand(`git log -1 --format=%ct ${tag}`, repoPath);
                    const tagTimestamp = parseInt(tagDate.trim()) * 1000;
                    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
                    
                    if (tagTimestamp < sixMonthsAgo) {
                        staleCount++;
                    }
                } catch (e) {
                    // Ignore tag check errors
                }
            }
            health.staleTags = staleCount;

            // Check for missing critical files
            const criticalFiles = ['.gitignore', 'README.md', 'package.json', 'requirements.txt'];
            let missingCount = 0;
            
            for (const file of criticalFiles) {
                if (!fs.existsSync(path.join(repoPath, file))) {
                    missingCount++;
                }
            }
            health.missingFiles = missingCount;

            // Determine overall status
            if (health.uncommittedChanges === 0 && health.missingFiles === 0) {
                health.status = 'clean';
            } else if (health.uncommittedChanges > 10 || health.missingFiles > 2) {
                health.status = 'error';
            } else {
                health.status = 'dirty';
            }

        } catch (error) {
            console.error(`Error collecting health metrics for ${repository}:`, error);
            health.status = 'error';
        }

        return health;
    }

    /**
     * Collect repository activity metrics
     */
    async collectActivityMetrics(repository, repoPath) {
        const activity = {
            commits24h: 0,
            prsOpen: 0,
            issuesOpen: 0,
            lastActivity: null,
            contributors: 0
        };

        try {
            // Get commits in last 24 hours
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const recentCommits = await this.execCommand(
                `git log --since="${since24h}" --oneline`,
                repoPath
            );
            activity.commits24h = recentCommits.trim().split('\n').filter(line => line.trim()).length;

            // Get last activity date
            const lastCommit = await this.execCommand(
                'git log -1 --format=%cI',
                repoPath
            );
            activity.lastActivity = lastCommit.trim() || null;

            // Count unique contributors (last 100 commits)
            const contributors = await this.execCommand(
                'git log -100 --format="%ae" | sort | uniq',
                repoPath
            );
            activity.contributors = contributors.trim().split('\n').filter(email => email.trim()).length;

            // If GitHub MCP is available, get PR and issue counts
            if (this.githubMCP) {
                const [owner, repo] = repository.split('/');
                if (owner && repo) {
                    try {
                        const prs = await this.githubMCP.getPullRequests(owner, repo, { state: 'open' });
                        activity.prsOpen = prs?.data?.length || 0;

                        const issues = await this.githubMCP.getIssues(owner, repo, { state: 'open' });
                        activity.issuesOpen = issues?.data?.length || 0;
                    } catch (error) {
                        console.warn(`Could not fetch GitHub data for ${repository}:`, error.message);
                    }
                }
            }

        } catch (error) {
            console.error(`Error collecting activity metrics for ${repository}:`, error);
        }

        return activity;
    }

    /**
     * Collect repository size metrics
     */
    async collectSizeMetrics(repository, repoPath) {
        const size = {
            diskUsage: 0,
            fileCount: 0,
            largestFiles: [],
            codeLines: 0
        };

        try {
            // Get disk usage
            const duResult = await this.execCommand('du -sb .', repoPath);
            const diskUsageMatch = duResult.match(/^(\d+)/);
            size.diskUsage = diskUsageMatch ? parseInt(diskUsageMatch[1]) : 0;

            // Count files (excluding .git directory)
            const fileCount = await this.execCommand(
                'find . -type f ! -path "./.git/*" | wc -l',
                repoPath
            );
            size.fileCount = parseInt(fileCount.trim()) || 0;

            // Get largest files (top 5)
            const largestFiles = await this.execCommand(
                'find . -type f ! -path "./.git/*" -exec ls -la {} + | sort -k5 -nr | head -5',
                repoPath
            );
            
            size.largestFiles = largestFiles.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(/\s+/);
                    return {
                        path: parts.slice(8).join(' '),
                        size: parseInt(parts[4]) || 0
                    };
                });

            // Count lines of code (simple approximation)
            const codeExtensions = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php'];
            let totalLines = 0;
            
            for (const ext of codeExtensions) {
                try {
                    const linesResult = await this.execCommand(
                        `find . -name "*.${ext}" ! -path "./.git/*" ! -path "./node_modules/*" -exec wc -l {} + | tail -1`,
                        repoPath
                    );
                    const match = linesResult.match(/(\d+)\s+total/);
                    if (match) {
                        totalLines += parseInt(match[1]);
                    }
                } catch (e) {
                    // Ignore individual extension errors
                }
            }
            size.codeLines = totalLines;

        } catch (error) {
            console.error(`Error collecting size metrics for ${repository}:`, error);
        }

        return size;
    }

    /**
     * Collect repository security metrics
     */
    async collectSecurityMetrics(repository, repoPath) {
        const security = {
            vulnerabilities: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            secretsExposed: 0,
            dependencyIssues: 0
        };

        try {
            // Check for exposed secrets (simple patterns)
            const secretPatterns = [
                'password\\s*=',
                'api[_-]?key\\s*=',
                'secret\\s*=',
                'token\\s*=',
                'BEGIN RSA PRIVATE KEY',
                'BEGIN PRIVATE KEY'
            ];

            for (const pattern of secretPatterns) {
                try {
                    const result = await this.execCommand(
                        `grep -ri "${pattern}" . --exclude-dir=.git --exclude-dir=node_modules | wc -l`,
                        repoPath
                    );
                    const count = parseInt(result.trim()) || 0;
                    security.secretsExposed += count;
                } catch (e) {
                    // Ignore grep errors
                }
            }

            // Check for dependency vulnerabilities (if npm is available)
            if (fs.existsSync(path.join(repoPath, 'package.json'))) {
                try {
                    const auditResult = await this.execCommand('npm audit --json', repoPath);
                    const audit = JSON.parse(auditResult);
                    
                    if (audit.vulnerabilities) {
                        security.vulnerabilities.critical = audit.metadata?.vulnerabilities?.critical || 0;
                        security.vulnerabilities.high = audit.metadata?.vulnerabilities?.high || 0;
                        security.vulnerabilities.medium = audit.metadata?.vulnerabilities?.moderate || 0;
                        security.vulnerabilities.low = audit.metadata?.vulnerabilities?.low || 0;
                    }
                } catch (e) {
                    // npm audit might fail, that's okay
                }
            }

            // Check for Python requirements vulnerabilities (if safety is available)
            if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
                try {
                    const safetyResult = await this.execCommand('safety check --json', repoPath);
                    const safety = JSON.parse(safetyResult);
                    security.dependencyIssues = safety.length || 0;
                } catch (e) {
                    // safety might not be installed
                }
            }

        } catch (error) {
            console.error(`Error collecting security metrics for ${repository}:`, error);
        }

        return security;
    }

    /**
     * Get list of repositories to monitor
     */
    async getRepositoryList() {
        try {
            if (!fs.existsSync(this.repositoriesPath)) {
                console.warn(`Repositories path not found: ${this.repositoriesPath}`);
                return [];
            }

            const entries = fs.readdirSync(this.repositoriesPath, { withFileTypes: true });
            const repositories = entries
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name)
                .filter(name => !name.startsWith('.'));

            return repositories;
        } catch (error) {
            console.error('Error getting repository list:', error);
            return [];
        }
    }

    /**
     * Execute a command in a specific directory
     */
    execCommand(command, cwd) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
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
            repositoriesPath: this.repositoriesPath,
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            hasGitHubMCP: !!this.githubMCP
        };
    }
}

module.exports = RepositoryCollector;
const path = require('path');
const { ConfigManager } = require('../config/utils/config-manager');

/**
 * WebhookProcessor Class
 * 
 * Processes GitHub webhook events and triggers automated deployments.
 * Integrates with the Home Assistant deployment service for CI/CD automation.
 */
class WebhookProcessor {
  constructor() {
    this.configManager = new ConfigManager();
    this.config = null;
    this.deploymentService = null;
  }

  /**
   * Initialize the webhook processor with configuration and services
   */
  async initialize() {
    try {
      this.config = await this.configManager.load(process.env.NODE_ENV || 'production');
      
      // Load deployment service dynamically to avoid circular dependencies
      const { HomeAssistantDeployer } = require('../../scripts/services/home-assistant-deployer');
      this.deploymentService = new HomeAssistantDeployer();
      
      console.log('WebhookProcessor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebhookProcessor:', error);
      throw error;
    }
  }

  /**
   * Process a GitHub webhook event
   * @param {Object} payload - The webhook payload
   * @param {Object} headers - The request headers
   * @returns {Object} Processing result
   */
  async processWebhook(payload, headers) {
    const eventType = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];
    
    console.log(`Processing webhook event: ${eventType} (${delivery})`);
    
    try {
      switch (eventType) {
        case 'repository_dispatch':
          return await this.processRepositoryDispatch(payload);
        case 'push':
          return await this.processPushEvent(payload);
        case 'pull_request':
          return await this.processPullRequestEvent(payload);
        case 'ping':
          return this.processPingEvent(payload);
        default:
          console.log(`Ignoring unsupported event type: ${eventType}`);
          return { 
            message: `Event type ${eventType} is not supported for deployment automation`,
            deploymentId: null 
          };
      }
    } catch (error) {
      console.error(`Error processing ${eventType} event:`, error);
      throw error;
    }
  }

  /**
   * Process repository_dispatch event for automated deployments
   * @param {Object} payload - The repository_dispatch payload
   * @returns {Object} Deployment result
   */
  async processRepositoryDispatch(payload) {
    const { action, repository, client_payload } = payload;
    
    console.log(`Processing repository_dispatch: action=${action}, repository=${repository?.full_name}`);
    
    // Validate repository dispatch event
    if (action !== 'deploy-home-assistant-config') {
      throw new Error(`Unsupported repository dispatch action: ${action}`);
    }
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: this.extractBranchName(client_payload.ref || 'refs/heads/main'),
      commit: client_payload.sha,
      requestedBy: client_payload.author || 'github-webhook',
      trigger: 'github-webhook-repository-dispatch',
      webhookData: {
        action,
        delivery: client_payload.delivery_id,
        sender: payload.sender?.login,
        repository: repository.full_name
      },
      parameters: {
        reason: 'Automated deployment from CI/CD repository dispatch',
        source: 'github-webhook',
        eventType: 'repository_dispatch'
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`Repository dispatch deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: 'Deployment triggered successfully from repository dispatch',
      repository: repository.full_name,
      branch: deploymentParams.branch,
      commit: deploymentParams.commit
    };
  }

  /**
   * Process push event for main branch deployments
   * @param {Object} payload - The push event payload
   * @returns {Object} Deployment result
   */
  async processPushEvent(payload) {
    const { repository, ref, after, pusher, commits } = payload;
    
    console.log(`Processing push event: ref=${ref}, repository=${repository?.full_name}`);
    
    // Only process pushes to main branch
    if (ref !== 'refs/heads/main') {
      return { 
        message: 'Ignoring push to non-main branch', 
        deploymentId: null,
        branch: this.extractBranchName(ref)
      };
    }
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Skip if this is a forced push that removes commits
    if (after === '0000000000000000000000000000000000000000') {
      return { 
        message: 'Ignoring branch deletion or forced push', 
        deploymentId: null 
      };
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: 'main',
      commit: after,
      requestedBy: pusher.name || pusher.email,
      trigger: 'github-webhook-push',
      webhookData: {
        ref,
        before: payload.before,
        after,
        pusher: pusher.name,
        commits: commits.map(c => ({
          id: c.id,
          message: c.message,
          author: c.author.name,
          url: c.url
        }))
      },
      parameters: {
        reason: 'Automated deployment from push to main branch',
        source: 'github-webhook',
        eventType: 'push',
        commitCount: commits.length
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`Push event deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: 'Deployment triggered successfully from push event',
      repository: repository.full_name,
      branch: 'main',
      commit: after,
      commitCount: commits.length
    };
  }

  /**
   * Process pull request event for merged PRs
   * @param {Object} payload - The pull request event payload
   * @returns {Object} Deployment result
   */
  async processPullRequestEvent(payload) {
    const { action, pull_request, repository } = payload;
    
    console.log(`Processing pull request event: action=${action}, number=${pull_request?.number}`);
    
    // Handle documentation validation for opened/updated PRs
    if (['opened', 'synchronize', 'reopened'].includes(action)) {
      return await this.handleDocumentationValidation(payload);
    }
    
    // Handle deployment for merged PRs to main branch
    if (action === 'closed' && pull_request.merged && pull_request.base.ref === 'main') {
      return await this.handleMergedPRDeployment(payload);
    }
    
    return { 
      message: 'PR event processed but no action taken', 
      action,
      merged: pull_request.merged,
      targetBranch: pull_request.base.ref
    };
  }

  async handleDocumentationValidation(payload) {
    const { pull_request, repository } = payload;
    
    try {
      // Initialize documentation quality gate
      const qualityGate = new DocumentationQualityGate();
      
      // Get PR files (this would use GitHub MCP client in real implementation)
      const files = await this.getPullRequestFiles(repository.full_name, pull_request.number);
      
      // Validate documentation
      const validation = await qualityGate.validatePullRequest({
        repository: repository.full_name,
        pullNumber: pull_request.number,
        files: files,
        title: pull_request.title,
        body: pull_request.body
      });

      // Update PR status check
      await this.updatePullRequestStatus({
        repository: repository.full_name,
        sha: pull_request.head.sha,
        state: validation.passed ? 'success' : 'failure',
        context: 'documentation/quality-gate',
        description: `Documentation score: ${validation.score}/100`,
        target_url: null
      });

      // Add comment with feedback if validation failed or has suggestions
      if (!validation.passed || validation.suggestions.length > 0) {
        const feedback = qualityGate.generateDocumentationFeedback(validation);
        await this.addPullRequestComment({
          repository: repository.full_name,
          pullNumber: pull_request.number,
          body: feedback
        });
      }

      return {
        message: 'Documentation validation completed',
        validationPassed: validation.passed,
        score: validation.score,
        issues: validation.issues.length,
        warnings: validation.warnings.length,
        repository: repository.full_name,
        pullNumber: pull_request.number
      };

    } catch (error) {
      console.error('Documentation validation error:', error);
      
      // Update status to error state
      await this.updatePullRequestStatus({
        repository: repository.full_name,
        sha: pull_request.head.sha,
        state: 'error',
        context: 'documentation/quality-gate',
        description: 'Documentation validation failed',
        target_url: null
      });

      throw error;
    }
  }

  async handleMergedPRDeployment(payload) {
    const { pull_request, repository } = payload;
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: 'main',
      commit: pull_request.merge_commit_sha,
      requestedBy: pull_request.user.login,
      trigger: 'github-webhook-pr-merge',
      webhookData: {
        prNumber: pull_request.number,
        prTitle: pull_request.title,
        prUrl: pull_request.html_url,
        author: pull_request.user.login,
        mergedBy: pull_request.merged_by?.login,
        mergedAt: pull_request.merged_at
      },
      parameters: {
        reason: `Automated deployment from PR #${pull_request.number}: ${pull_request.title}`,
        source: 'github-webhook',
        eventType: 'pull_request',
        prNumber: pull_request.number
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`PR merge deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: `Deployment triggered successfully from PR #${pull_request.number} merge`,
      repository: repository.full_name,
      branch: 'main',
      commit: pull_request.merge_commit_sha,
      prNumber: pull_request.number
    };
  }

  // Placeholder methods for GitHub API operations (will use MCP clients)
  async getPullRequestFiles(repository, pullNumber) {
    // This would use GitHub MCP client in real implementation
    console.log(`Getting files for PR #${pullNumber} in ${repository}`);
    return []; // Placeholder
  }

  async updatePullRequestStatus(options) {
    // This would use GitHub MCP client to create/update status check
    console.log('Updating PR status:', options);
  }

  async addPullRequestComment(options) {
    // This would use GitHub MCP client to add comment
    console.log('Adding PR comment:', options);
  }

  /**
   * Process ping event for webhook validation
   * @param {Object} payload - The ping event payload
   * @returns {Object} Ping result
   */
  processPingEvent(payload) {
    console.log('Processing ping event for webhook validation');
    
    return {
      message: 'Webhook is configured and responding correctly',
      deploymentId: null,
      hook_id: payload.hook_id,
      zen: payload.zen
    };
  }

  /**
   * Extract branch name from Git ref
   * @param {string} ref - Git reference (e.g., refs/heads/main)
   * @returns {string} Branch name
   */
  extractBranchName(ref) {
    return ref.replace('refs/heads/', '');
  }

  /**
   * Validate deployment parameters
   * @param {Object} params - Deployment parameters
   * @throws {Error} If parameters are invalid
   */
  validateDeploymentParams(params) {
    if (!params.repository) {
      throw new Error('Repository is required for deployment');
    }
    
    if (!params.commit) {
      throw new Error('Commit SHA is required for deployment');
    }
    
    if (!params.branch) {
      throw new Error('Branch is required for deployment');
    }
    
    // Validate commit SHA format (40-character hex string)
    if (!/^[a-f0-9]{40}$/i.test(params.commit)) {
      throw new Error(`Invalid commit SHA format: ${params.commit}`);
    }
  }

}

/**
 * Documentation Quality Gate System
 * Enforces documentation requirements and quality standards for pull requests
 */
class DocumentationQualityGate {
    constructor(config = {}) {
        this.config = {
            requireDocumentationForCodeChanges: true,
            documentationPaths: ['docs/', 'documentation/', 'wiki/', 'README'],
            documentationExtensions: ['.md', '.rst', '.txt'],
            codeExtensions: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php'],
            qualityThresholds: {
                minDocumentationCoverage: 0.7,
                maxLinksWithoutDescription: 5,
                minReadabilityScore: 60
            },
            exemptPaths: ['test/', 'tests/', '.github/', 'node_modules/'],
            ...config
        };
    }

    async validatePullRequest(prData) {
        const { repository, pullNumber, files, title, body } = prData;
        
        console.log(`Validating documentation for PR #${pullNumber} in ${repository}`);

        const validation = {
            passed: true,
            score: 100,
            issues: [],
            warnings: [],
            suggestions: [],
            metrics: {},
            requiresChanges: false
        };

        try {
            const analysis = this.analyzeFileChanges(files);
            validation.metrics = analysis;

            await this.checkDocumentationCompleteness(analysis, validation);
            await this.checkDocumentationQuality(files, validation);
            await this.checkPRDescription(title, body, validation);

            validation.score = this.calculateQualityScore(validation);
            validation.passed = validation.score >= 70 && validation.issues.length === 0;
            validation.requiresChanges = validation.issues.length > 0;

            console.log(`Documentation validation complete: score=${validation.score}, passed=${validation.passed}`);

        } catch (error) {
            validation.passed = false;
            validation.issues.push(`Validation error: ${error.message}`);
            console.error('Documentation validation error:', error);
        }

        return validation;
    }

    analyzeFileChanges(files) {
        const analysis = {
            totalFiles: files.length,
            codeFiles: [],
            documentationFiles: [],
            testFiles: [],
            configFiles: [],
            exemptFiles: []
        };

        for (const file of files) {
            const filename = file.filename || file.name;
            
            if (this.isExemptFile(filename)) {
                analysis.exemptFiles.push(filename);
            } else if (this.isTestFile(filename)) {
                analysis.testFiles.push(filename);
            } else if (this.isDocumentationFile(filename)) {
                analysis.documentationFiles.push(filename);
            } else if (this.isCodeFile(filename)) {
                analysis.codeFiles.push(filename);
            } else {
                analysis.configFiles.push(filename);
            }
        }

        return analysis;
    }

    async checkDocumentationCompleteness(analysis, validation) {
        const { codeFiles, documentationFiles } = analysis;
        
        if (codeFiles.length > 0 && documentationFiles.length === 0) {
            validation.issues.push('Code changes detected but no documentation updates found');
            validation.suggestions.push('Consider updating relevant documentation for your changes');
        }

        const totalSignificantFiles = codeFiles.length + documentationFiles.length;
        if (totalSignificantFiles > 0) {
            const docCoverage = documentationFiles.length / totalSignificantFiles;
            
            if (docCoverage < this.config.qualityThresholds.minDocumentationCoverage) {
                validation.warnings.push(
                    `Documentation coverage is ${Math.round(docCoverage * 100)}% ` +
                    `(recommended: ${Math.round(this.config.qualityThresholds.minDocumentationCoverage * 100)}%)`
                );
            }
        }

        const requiresAPIDocumentation = codeFiles.some(file => 
            file.includes('api/') || file.includes('service') || file.includes('controller')
        );
        
        if (requiresAPIDocumentation && documentationFiles.length === 0) {
            validation.issues.push('API or service changes detected but no API documentation updates found');
        }
    }

    async checkDocumentationQuality(files, validation) {
        const docFiles = files.filter(f => this.isDocumentationFile(f.filename || f.name));
        
        for (const file of docFiles) {
            const filename = file.filename || file.name;
            
            if (file.patch || file.content) {
                const content = file.content || file.patch;
                const issues = this.analyzeDocumentationContent(content, filename);
                validation.warnings.push(...issues.warnings);
                validation.suggestions.push(...issues.suggestions);
            }
        }
    }

    analyzeDocumentationContent(content, filename) {
        const issues = { warnings: [], suggestions: [] };
        
        if (content.length < 100) {
            issues.warnings.push(`${filename}: Documentation appears to be very brief`);
            issues.suggestions.push(`${filename}: Consider adding more detailed explanations`);
        }

        if (filename.endsWith('.md') && !content.includes('#')) {
            issues.warnings.push(`${filename}: No headings found in markdown file`);
            issues.suggestions.push(`${filename}: Add section headings to improve readability`);
        }

        return issues;
    }

    async checkPRDescription(title, body, validation) {
        if (!title || title.length < 10) {
            validation.warnings.push('Pull request title is very short');
            validation.suggestions.push('Consider a more descriptive pull request title');
        }

        if (!body || body.length < 50) {
            validation.warnings.push('Pull request description is missing or very brief');
            validation.suggestions.push('Add detailed description explaining the changes and their impact');
        }
    }

    calculateQualityScore(validation) {
        let score = 100;
        score -= validation.issues.length * 20;
        score -= validation.warnings.length * 5;
        return Math.max(0, Math.min(100, score));
    }

    generateDocumentationFeedback(validation) {
        let feedback = '## 📚 Documentation Quality Report\n\n';
        
        const statusEmoji = validation.passed ? '✅' : '❌';
        feedback += `${statusEmoji} **Overall Score:** ${validation.score}/100\n\n`;
        
        if (validation.passed) {
            feedback += '🎉 Great job! Your pull request meets our documentation standards.\n\n';
        } else {
            feedback += '⚠️ Your pull request needs attention before it can be merged.\n\n';
        }

        if (validation.metrics) {
            const { codeFiles, documentationFiles, totalFiles } = validation.metrics;
            feedback += '### 📊 Change Analysis\n';
            feedback += `- **Total files changed:** ${totalFiles}\n`;
            feedback += `- **Code files:** ${codeFiles.length}\n`;
            feedback += `- **Documentation files:** ${documentationFiles.length}\n\n`;
        }

        if (validation.issues.length > 0) {
            feedback += '### ❌ Issues (Must be addressed)\n';
            validation.issues.forEach(issue => {
                feedback += `- ${issue}\n`;
            });
            feedback += '\n';
        }

        if (validation.warnings.length > 0) {
            feedback += '### ⚠️ Warnings\n';
            validation.warnings.forEach(warning => {
                feedback += `- ${warning}\n`;
            });
            feedback += '\n';
        }

        if (validation.suggestions.length > 0) {
            feedback += '### 💡 Suggestions\n';
            validation.suggestions.forEach(suggestion => {
                feedback += `- ${suggestion}\n`;
            });
            feedback += '\n';
        }

        feedback += '---\n*This review was generated automatically by the WikiJS Documentation Agent.*';

        return feedback;
    }

    isCodeFile(filename) {
        return this.config.codeExtensions.some(ext => filename.endsWith(ext));
    }

    isDocumentationFile(filename) {
        return this.config.documentationExtensions.some(ext => filename.endsWith(ext)) ||
               this.config.documentationPaths.some(path => filename.includes(path));
    }

    isTestFile(filename) {
        return filename.includes('test') || filename.includes('spec') || filename.includes('__tests__');
    }

    isExemptFile(filename) {
        return this.config.exemptPaths.some(path => filename.includes(path));
    }
}

/**
 * Automated Release Documentation Generator
 * Generates and publishes comprehensive release documentation
 */
class ReleaseDocumentationGenerator {
    constructor(config = {}) {
        this.config = {
            releaseTemplates: {
                changelog: 'templates/changelog.md',
                releaseNotes: 'templates/release-notes.md',
                migrationGuide: 'templates/migration-guide.md',
                apiChanges: 'templates/api-changes.md'
            },
            wikijsSettings: {
                releasesPath: '/releases',
                changelogPath: '/changelog',
                apiDocsPath: '/api'
            },
            notificationChannels: {
                slack: '#releases',
                email: ['releases@company.com'],
                teams: '#product-updates'
            },
            ...config
        };
    }

    /**
     * Generate complete release documentation package
     */
    async generateReleaseDocumentation(releaseInfo) {
        const { tagName, releaseName, releaseBody, repository, publishedAt } = releaseInfo;
        
        console.log(`Generating release documentation for ${tagName}`);

        const documentation = {
            version: tagName,
            name: releaseName,
            repository: repository,
            publishedAt: publishedAt,
            generatedAt: new Date().toISOString(),
            documents: {}
        };

        try {
            // Generate all documentation components in parallel
            const [changelog, releaseNotes, apiChanges, migrationGuide] = await Promise.all([
                this.generateChangelog(releaseInfo),
                this.generateReleaseNotes(releaseInfo),
                this.generateAPIChanges(releaseInfo),
                this.generateMigrationGuide(releaseInfo)
            ]);

            documentation.documents = {
                changelog,
                releaseNotes,
                apiChanges,
                migrationGuide
            };

            // Generate overview document
            documentation.documents.overview = await this.generateReleaseOverview(documentation);

            console.log(`Release documentation generated successfully for ${tagName}`);
            return documentation;

        } catch (error) {
            console.error(`Failed to generate release documentation for ${tagName}:`, error);
            throw error;
        }
    }

    /**
     * Generate changelog from commit history
     */
    async generateChangelog(releaseInfo) {
        const { tagName, repository } = releaseInfo;
        
        console.log(`Generating changelog for ${tagName}`);

        // This would use GitHub MCP client to get commits
        const commits = await this.getCommitsSinceLastRelease(repository, tagName);
        const categorizedCommits = this.categorizeCommits(commits);

        let changelog = `# Changelog\n\n## ${tagName}\n\n`;

        // Add features
        if (categorizedCommits.features.length > 0) {
            changelog += '### ✨ New Features\n\n';
            categorizedCommits.features.forEach(commit => {
                changelog += `- ${commit.message} ([${commit.sha.slice(0, 8)}](${commit.url}))\n`;
            });
            changelog += '\n';
        }

        // Add improvements
        if (categorizedCommits.improvements.length > 0) {
            changelog += '### 🚀 Improvements\n\n';
            categorizedCommits.improvements.forEach(commit => {
                changelog += `- ${commit.message} ([${commit.sha.slice(0, 8)}](${commit.url}))\n`;
            });
            changelog += '\n';
        }

        // Add bug fixes
        if (categorizedCommits.fixes.length > 0) {
            changelog += '### 🐛 Bug Fixes\n\n';
            categorizedCommits.fixes.forEach(commit => {
                changelog += `- ${commit.message} ([${commit.sha.slice(0, 8)}](${commit.url}))\n`;
            });
            changelog += '\n';
        }

        // Add breaking changes
        if (categorizedCommits.breaking.length > 0) {
            changelog += '### ⚠️ Breaking Changes\n\n';
            categorizedCommits.breaking.forEach(commit => {
                changelog += `- ${commit.message} ([${commit.sha.slice(0, 8)}](${commit.url}))\n`;
            });
            changelog += '\n';
        }

        // Add documentation updates
        if (categorizedCommits.docs.length > 0) {
            changelog += '### 📚 Documentation\n\n';
            categorizedCommits.docs.forEach(commit => {
                changelog += `- ${commit.message} ([${commit.sha.slice(0, 8)}](${commit.url}))\n`;
            });
            changelog += '\n';
        }

        return {
            content: changelog,
            format: 'markdown',
            filename: `CHANGELOG-${tagName}.md`,
            path: `${this.config.wikijsSettings.changelogPath}/${tagName}`
        };
    }

    /**
     * Generate comprehensive release notes
     */
    async generateReleaseNotes(releaseInfo) {
        const { tagName, releaseName, releaseBody, repository, publishedAt } = releaseInfo;
        
        console.log(`Generating release notes for ${tagName}`);

        let releaseNotes = `# ${releaseName || tagName} Release Notes\n\n`;
        
        // Add release metadata
        releaseNotes += `**Release Date:** ${new Date(publishedAt).toLocaleDateString()}\n`;
        releaseNotes += `**Version:** ${tagName}\n`;
        releaseNotes += `**Repository:** ${repository}\n\n`;

        // Add release description if provided
        if (releaseBody && releaseBody.trim()) {
            releaseNotes += '## Overview\n\n';
            releaseNotes += `${releaseBody}\n\n`;
        }

        // Add highlights
        const highlights = await this.generateReleaseHighlights(releaseInfo);
        if (highlights.length > 0) {
            releaseNotes += '## 🌟 Highlights\n\n';
            highlights.forEach(highlight => {
                releaseNotes += `- ${highlight}\n`;
            });
            releaseNotes += '\n';
        }

        // Add upgrade instructions
        const upgradeInstructions = await this.generateUpgradeInstructions(releaseInfo);
        if (upgradeInstructions) {
            releaseNotes += '## 🔄 Upgrade Instructions\n\n';
            releaseNotes += `${upgradeInstructions}\n\n`;
        }

        // Add compatibility information
        const compatibility = await this.generateCompatibilityInfo(releaseInfo);
        if (compatibility) {
            releaseNotes += '## 🔗 Compatibility\n\n';
            releaseNotes += `${compatibility}\n\n`;
        }

        // Add links to detailed changelog
        releaseNotes += '## 📋 Detailed Changes\n\n';
        releaseNotes += `For a complete list of changes, see the [changelog](${this.config.wikijsSettings.changelogPath}/${tagName}).\n\n`;

        // Add footer
        releaseNotes += '---\n';
        releaseNotes += `*Release notes generated automatically at ${new Date().toISOString()}*\n`;

        return {
            content: releaseNotes,
            format: 'markdown',
            filename: `release-notes-${tagName}.md`,
            path: `${this.config.wikijsSettings.releasesPath}/${tagName}/notes`
        };
    }

    /**
     * Generate API changes documentation
     */
    async generateAPIChanges(releaseInfo) {
        const { tagName, repository } = releaseInfo;
        
        console.log(`Generating API changes for ${tagName}`);

        // This would analyze API changes between versions
        const apiChanges = await this.analyzeAPIChanges(repository, tagName);

        let content = `# API Changes - ${tagName}\n\n`;

        if (apiChanges.breaking.length > 0) {
            content += '## ⚠️ Breaking Changes\n\n';
            apiChanges.breaking.forEach(change => {
                content += `### ${change.endpoint}\n\n`;
                content += `**Type:** ${change.type}\n\n`;
                content += `**Description:** ${change.description}\n\n`;
                if (change.migration) {
                    content += `**Migration:** ${change.migration}\n\n`;
                }
            });
        }

        if (apiChanges.new.length > 0) {
            content += '## ✨ New Endpoints\n\n';
            apiChanges.new.forEach(change => {
                content += `### ${change.endpoint}\n\n`;
                content += `**Method:** ${change.method}\n\n`;
                content += `**Description:** ${change.description}\n\n`;
                if (change.example) {
                    content += '**Example:**\n\n';
                    content += '```json\n';
                    content += `${change.example}\n`;
                    content += '```\n\n';
                }
            });
        }

        if (apiChanges.deprecated.length > 0) {
            content += '## 🚨 Deprecated\n\n';
            apiChanges.deprecated.forEach(change => {
                content += `### ${change.endpoint}\n\n`;
                content += `**Deprecated in:** ${tagName}\n\n`;
                content += `**Removal planned:** ${change.removalVersion || 'TBD'}\n\n`;
                content += `**Alternative:** ${change.alternative || 'TBD'}\n\n`;
            });
        }

        return {
            content: content,
            format: 'markdown',
            filename: `api-changes-${tagName}.md`,
            path: `${this.config.wikijsSettings.apiDocsPath}/changes/${tagName}`
        };
    }

    /**
     * Generate migration guide
     */
    async generateMigrationGuide(releaseInfo) {
        const { tagName } = releaseInfo;
        
        console.log(`Generating migration guide for ${tagName}`);

        const migrationSteps = await this.identifyMigrationSteps(releaseInfo);

        let content = `# Migration Guide - ${tagName}\n\n`;
        content += `This guide helps you migrate to version ${tagName}.\n\n`;

        if (migrationSteps.length === 0) {
            content += '## ✅ No Migration Required\n\n';
            content += 'This release is fully backward compatible. No migration steps are required.\n\n';
        } else {
            content += '## 🔄 Migration Steps\n\n';
            migrationSteps.forEach((step, index) => {
                content += `### ${index + 1}. ${step.title}\n\n`;
                content += `${step.description}\n\n`;
                
                if (step.code) {
                    content += '```bash\n';
                    content += `${step.code}\n`;
                    content += '```\n\n';
                }

                if (step.warning) {
                    content += `⚠️ **Warning:** ${step.warning}\n\n`;
                }
            });
        }

        return {
            content: content,
            format: 'markdown',
            filename: `migration-${tagName}.md`,
            path: `${this.config.wikijsSettings.releasesPath}/${tagName}/migration`
        };
    }

    /**
     * Generate release overview document
     */
    async generateReleaseOverview(documentation) {
        const { version, name, repository, publishedAt } = documentation;
        
        let content = `# ${name || version} - Release Overview\n\n`;
        content += `**Version:** ${version}\n`;
        content += `**Published:** ${new Date(publishedAt).toLocaleDateString()}\n`;
        content += `**Repository:** ${repository}\n\n`;

        content += '## 📚 Documentation\n\n';
        content += `- [Release Notes](${this.config.wikijsSettings.releasesPath}/${version}/notes)\n`;
        content += `- [Changelog](${this.config.wikijsSettings.changelogPath}/${version})\n`;
        content += `- [API Changes](${this.config.wikijsSettings.apiDocsPath}/changes/${version})\n`;
        content += `- [Migration Guide](${this.config.wikijsSettings.releasesPath}/${version}/migration)\n\n`;

        return {
            content: content,
            format: 'markdown',
            filename: `overview-${version}.md`,
            path: `${this.config.wikijsSettings.releasesPath}/${version}/overview`
        };
    }

    /**
     * Upload release documentation to WikiJS
     */
    async uploadReleaseDocumentation(documentation) {
        const { version, documents } = documentation;
        
        console.log(`Uploading release documentation for ${version} to WikiJS`);

        const uploadResults = [];

        // Upload each document
        for (const [type, document] of Object.entries(documents)) {
            try {
                const result = await this.uploadDocument(document);
                uploadResults.push({ type, status: 'success', path: document.path, result });
                console.log(`✅ Uploaded ${type} for ${version}`);
            } catch (error) {
                uploadResults.push({ type, status: 'failed', error: error.message });
                console.error(`❌ Failed to upload ${type} for ${version}:`, error);
            }
        }

        return uploadResults;
    }

    /**
     * Send release notifications
     */
    async sendReleaseNotifications(documentation) {
        const { version, name, repository } = documentation;
        
        console.log(`Sending release notifications for ${version}`);

        const notifications = [];

        // Slack notification
        if (this.config.notificationChannels.slack) {
            const slackMessage = {
                channel: this.config.notificationChannels.slack,
                text: `🚀 New release published: ${name || version}`,
                attachments: [{
                    color: 'good',
                    fields: [
                        { title: 'Version', value: version, short: true },
                        { title: 'Repository', value: repository, short: true }
                    ],
                    actions: [{
                        type: 'button',
                        text: 'View Release Notes',
                        url: `${this.config.wikijsSettings.releasesPath}/${version}/notes`
                    }]
                }]
            };
            
            notifications.push({ type: 'slack', payload: slackMessage });
        }

        // Email notification
        if (this.config.notificationChannels.email) {
            const emailNotification = {
                to: this.config.notificationChannels.email,
                subject: `New Release: ${name || version}`,
                body: `A new release ${version} has been published for ${repository}.\n\nView the release documentation: ${this.config.wikijsSettings.releasesPath}/${version}`
            };
            
            notifications.push({ type: 'email', payload: emailNotification });
        }

        return notifications;
    }

    // Helper methods (would be implemented with actual API calls)
    async getCommitsSinceLastRelease(repository, tagName) {
        // Placeholder - would use GitHub MCP client
        return [];
    }

    categorizeCommits(commits) {
        return {
            features: commits.filter(c => c.message.toLowerCase().includes('feat')),
            improvements: commits.filter(c => c.message.toLowerCase().includes('improve')),
            fixes: commits.filter(c => c.message.toLowerCase().includes('fix')),
            breaking: commits.filter(c => c.message.toLowerCase().includes('breaking')),
            docs: commits.filter(c => c.message.toLowerCase().includes('docs'))
        };
    }

    async generateReleaseHighlights(releaseInfo) {
        // Generate key highlights for the release
        return [
            'Improved performance and stability',
            'Enhanced user experience',
            'New developer tools and APIs'
        ];
    }

    async generateUpgradeInstructions(releaseInfo) {
        return 'Follow the standard upgrade process. See migration guide for details.';
    }

    async generateCompatibilityInfo(releaseInfo) {
        return 'Compatible with all versions from the current major release line.';
    }

    async analyzeAPIChanges(repository, tagName) {
        // Placeholder - would analyze actual API changes
        return {
            breaking: [],
            new: [],
            deprecated: []
        };
    }

    async identifyMigrationSteps(releaseInfo) {
        // Placeholder - would identify actual migration requirements
        return [];
    }

    async uploadDocument(document) {
        // Placeholder - would use WikiJS MCP client
        console.log(`Uploading document to ${document.path}`);
        return { success: true, path: document.path };
    }
}

/**
 * Comprehensive Notification and Reporting System
 * Manages notifications and generates reports for documentation workflows
 */
class DocumentationNotificationSystem {
    constructor(config = {}) {
        this.config = {
            channels: {
                slack: {
                    webhookUrl: process.env.SLACK_WEBHOOK_URL,
                    channels: {
                        documentation: '#documentation',
                        alerts: '#alerts',
                        releases: '#releases',
                        development: '#development'
                    }
                },
                email: {
                    smtp: {
                        host: process.env.SMTP_HOST,
                        port: process.env.SMTP_PORT,
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    },
                    lists: {
                        documentation: ['docs@company.com'],
                        alerts: ['alerts@company.com'],
                        releases: ['releases@company.com']
                    }
                },
                teams: {
                    webhookUrl: process.env.TEAMS_WEBHOOK_URL
                }
            },
            reporting: {
                schedules: {
                    daily: { hour: 9, minute: 0 },
                    weekly: { day: 1, hour: 9, minute: 0 }, // Monday
                    monthly: { date: 1, hour: 9, minute: 0 }
                },
                retention: {
                    events: 90, // days
                    reports: 365 // days
                }
            },
            templates: {
                prValidation: 'templates/pr-validation-notification.md',
                releasePublished: 'templates/release-notification.md',
                syncCompleted: 'templates/sync-notification.md',
                errorAlert: 'templates/error-alert.md'
            },
            ...config
        };

        this.eventHistory = [];
        this.reportCache = new Map();
    }

    /**
     * Send notification based on event type and context
     */
    async sendNotification(event) {
        const { type, data, priority, channels } = event;
        
        console.log(`Sending ${priority} notification: ${type}`);

        try {
            // Record event for reporting
            this.recordEvent(event);

            // Determine notification channels
            const targetChannels = channels || this.getDefaultChannels(type, priority);

            // Generate notification content
            const content = await this.generateNotificationContent(event);

            // Send to each channel
            const results = await Promise.allSettled(
                targetChannels.map(channel => this.sendToChannel(channel, content, event))
            );

            // Process results
            const notifications = results.map((result, index) => ({
                channel: targetChannels[index],
                status: result.status,
                error: result.reason?.message
            }));

            console.log(`Notification sent to ${notifications.length} channels`);
            return notifications;

        } catch (error) {
            console.error('Failed to send notification:', error);
            throw error;
        }
    }

    /**
     * Generate daily documentation activity report
     */
    async generateDailyReport(date = new Date()) {
        console.log(`Generating daily report for ${date.toDateString()}`);

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const dayEvents = this.eventHistory.filter(event => {
            const eventDate = new Date(event.timestamp);
            return eventDate >= startOfDay && eventDate <= endOfDay;
        });

        const report = {
            date: date.toISOString().split('T')[0],
            summary: {
                totalEvents: dayEvents.length,
                pullRequestsValidated: dayEvents.filter(e => e.type === 'pr_validated').length,
                documentationSyncs: dayEvents.filter(e => e.type === 'documentation_synced').length,
                releasesPublished: dayEvents.filter(e => e.type === 'release_published').length,
                errors: dayEvents.filter(e => e.priority === 'high' && e.type.includes('error')).length
            },
            metrics: {
                averageValidationScore: this.calculateAverageValidationScore(dayEvents),
                syncSuccessRate: this.calculateSyncSuccessRate(dayEvents),
                responseTime: this.calculateAverageResponseTime(dayEvents)
            },
            topIssues: this.identifyTopIssues(dayEvents),
            activities: dayEvents.slice(0, 20) // Latest 20 activities
        };

        // Cache report
        this.reportCache.set(`daily-${report.date}`, report);

        return report;
    }

    /**
     * Generate weekly documentation metrics report
     */
    async generateWeeklyReport(weekStart = new Date()) {
        console.log(`Generating weekly report starting ${weekStart.toDateString()}`);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const weekEvents = this.eventHistory.filter(event => {
            const eventDate = new Date(event.timestamp);
            return eventDate >= weekStart && eventDate <= weekEnd;
        });

        const report = {
            week: `${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`,
            summary: {
                totalEvents: weekEvents.length,
                averageDailyEvents: Math.round(weekEvents.length / 7),
                pullRequestsValidated: weekEvents.filter(e => e.type === 'pr_validated').length,
                documentationUpdates: weekEvents.filter(e => e.type === 'documentation_synced').length,
                qualityImprovements: this.calculateQualityImprovements(weekEvents)
            },
            trends: {
                validationScoresTrend: this.calculateValidationTrend(weekEvents),
                syncVolumeTrend: this.calculateSyncVolumeTrend(weekEvents),
                errorTrend: this.calculateErrorTrend(weekEvents)
            },
            topContributors: this.identifyTopContributors(weekEvents),
            recommendations: this.generateRecommendations(weekEvents)
        };

        // Cache report
        this.reportCache.set(`weekly-${weekStart.toISOString().split('T')[0]}`, report);

        return report;
    }

    /**
     * Send automated dashboard update
     */
    async sendDashboardUpdate(type = 'daily') {
        console.log(`Sending ${type} dashboard update`);

        let report;
        if (type === 'daily') {
            report = await this.generateDailyReport();
        } else if (type === 'weekly') {
            report = await this.generateWeeklyReport();
        } else {
            throw new Error(`Unknown report type: ${type}`);
        }

        // Create dashboard notification
        const dashboardNotification = {
            type: 'dashboard_update',
            data: {
                reportType: type,
                report: report
            },
            priority: 'medium',
            channels: ['slack']
        };

        return await this.sendNotification(dashboardNotification);
    }

    /**
     * Record event for reporting and analytics
     */
    recordEvent(event) {
        const recordedEvent = {
            ...event,
            id: this.generateEventId(),
            timestamp: new Date().toISOString(),
            recorded: true
        };

        this.eventHistory.push(recordedEvent);

        // Cleanup old events based on retention policy
        const retentionDate = new Date();
        retentionDate.setDate(retentionDate.getDate() - this.config.reporting.retention.events);
        
        this.eventHistory = this.eventHistory.filter(e => 
            new Date(e.timestamp) > retentionDate
        );
    }

    /**
     * Generate notification content based on event and template
     */
    async generateNotificationContent(event) {
        const { type, data, priority } = event;

        let content = {
            subject: this.generateSubject(event),
            body: this.generateBody(event),
            attachments: [],
            metadata: {
                type,
                priority,
                timestamp: new Date().toISOString()
            }
        };

        // Add event-specific content
        switch (type) {
            case 'pr_validated':
                content = await this.generatePRValidationContent(event, content);
                break;
            case 'documentation_synced':
                content = await this.generateSyncContent(event, content);
                break;
            case 'release_published':
                content = await this.generateReleaseContent(event, content);
                break;
            case 'error_occurred':
                content = await this.generateErrorContent(event, content);
                break;
            default:
                content = await this.generateGenericContent(event, content);
        }

        return content;
    }

    /**
     * Send notification to specific channel
     */
    async sendToChannel(channel, content, event) {
        switch (channel) {
            case 'slack':
                return await this.sendSlackNotification(content, event);
            case 'email':
                return await this.sendEmailNotification(content, event);
            case 'teams':
                return await this.sendTeamsNotification(content, event);
            default:
                throw new Error(`Unknown notification channel: ${channel}`);
        }
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(content, event) {
        console.log('Sending Slack notification');
        
        const slackPayload = {
            text: content.subject,
            attachments: [{
                color: this.getSlackColor(event.priority),
                fields: [
                    { title: 'Event Type', value: event.type, short: true },
                    { title: 'Priority', value: event.priority, short: true },
                    { title: 'Timestamp', value: new Date().toLocaleString(), short: true }
                ],
                text: content.body
            }]
        };

        // Add event-specific fields
        if (event.data) {
            if (event.data.repository) {
                slackPayload.attachments[0].fields.push({
                    title: 'Repository',
                    value: event.data.repository,
                    short: true
                });
            }
            if (event.data.pullNumber) {
                slackPayload.attachments[0].fields.push({
                    title: 'PR Number',
                    value: `#${event.data.pullNumber}`,
                    short: true
                });
            }
        }

        // Simulate sending to Slack (would use actual webhook in production)
        console.log('Slack payload:', JSON.stringify(slackPayload, null, 2));
        return { success: true, channel: 'slack' };
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(content, event) {
        console.log('Sending email notification');
        
        const emailPayload = {
            subject: content.subject,
            body: content.body,
            to: this.getEmailRecipients(event.type),
            from: 'documentation-system@company.com'
        };

        // Simulate sending email (would use actual SMTP in production)
        console.log('Email payload:', JSON.stringify(emailPayload, null, 2));
        return { success: true, channel: 'email' };
    }

    /**
     * Send Teams notification
     */
    async sendTeamsNotification(content, event) {
        console.log('Sending Teams notification');
        
        const teamsPayload = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: this.getTeamsColor(event.priority),
            summary: content.subject,
            sections: [{
                activityTitle: content.subject,
                activitySubtitle: event.type,
                text: content.body,
                facts: [
                    { name: 'Priority', value: event.priority },
                    { name: 'Timestamp', value: new Date().toLocaleString() }
                ]
            }]
        };

        // Simulate sending to Teams (would use actual webhook in production)
        console.log('Teams payload:', JSON.stringify(teamsPayload, null, 2));
        return { success: true, channel: 'teams' };
    }

    // Helper methods
    getDefaultChannels(type, priority) {
        if (priority === 'high') {
            return ['slack', 'email'];
        } else if (type.includes('release')) {
            return ['slack'];
        } else {
            return ['slack'];
        }
    }

    generateSubject(event) {
        const subjects = {
            pr_validated: `PR Documentation Validation: ${event.data?.repository || 'Unknown'} #${event.data?.pullNumber || '?'}`,
            documentation_synced: `Documentation Synced: ${event.data?.repository || 'Unknown'}`,
            release_published: `New Release Published: ${event.data?.tagName || 'Unknown'}`,
            error_occurred: `Documentation System Error: ${event.data?.error || 'Unknown'}`
        };

        return subjects[event.type] || `Documentation Event: ${event.type}`;
    }

    generateBody(event) {
        const { type, data } = event;
        
        switch (type) {
            case 'pr_validated':
                return `Pull request validation completed with score: ${data?.score || 'N/A'}/100. ${data?.passed ? 'Validation passed.' : 'Validation failed.'}`;
            case 'documentation_synced':
                return `Documentation has been synchronized successfully. ${data?.changesCount || 0} changes processed.`;
            case 'release_published':
                return `Release ${data?.tagName || 'unknown'} has been published with automated documentation generation.`;
            case 'error_occurred':
                return `An error occurred in the documentation system: ${data?.error || 'Unknown error'}`;
            default:
                return `Documentation system event: ${type}`;
        }
    }

    getSlackColor(priority) {
        const colors = {
            high: 'danger',
            medium: 'warning',
            low: 'good'
        };
        return colors[priority] || 'good';
    }

    getTeamsColor(priority) {
        const colors = {
            high: 'FF0000',
            medium: 'FFA500',
            low: '00FF00'
        };
        return colors[priority] || '00FF00';
    }

    getEmailRecipients(eventType) {
        return this.config.channels.email.lists.documentation || [];
    }

    // Analytics helper methods
    calculateAverageValidationScore(events) {
        const validationEvents = events.filter(e => e.type === 'pr_validated' && e.data?.score);
        if (validationEvents.length === 0) return 0;
        
        const totalScore = validationEvents.reduce((sum, e) => sum + e.data.score, 0);
        return Math.round(totalScore / validationEvents.length);
    }

    calculateSyncSuccessRate(events) {
        const syncEvents = events.filter(e => e.type === 'documentation_synced');
        if (syncEvents.length === 0) return 100;
        
        const successfulSyncs = syncEvents.filter(e => e.data?.status === 'success');
        return Math.round((successfulSyncs.length / syncEvents.length) * 100);
    }

    calculateAverageResponseTime(events) {
        // Placeholder - would calculate actual response times
        return 1.2; // seconds
    }

    identifyTopIssues(events) {
        const issues = new Map();
        
        events.filter(e => e.type.includes('error') || e.data?.issues).forEach(event => {
            const issue = event.data?.error || 'Unknown issue';
            issues.set(issue, (issues.get(issue) || 0) + 1);
        });

        return Array.from(issues.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([issue, count]) => ({ issue, count }));
    }

    calculateQualityImprovements(events) {
        // Placeholder - would calculate actual quality improvements
        return 15; // percentage improvement
    }

    calculateValidationTrend(events) {
        // Placeholder - would calculate actual trends
        return 'improving';
    }

    calculateSyncVolumeTrend(events) {
        // Placeholder - would calculate actual trends
        return 'stable';
    }

    calculateErrorTrend(events) {
        // Placeholder - would calculate actual trends
        return 'decreasing';
    }

    identifyTopContributors(events) {
        const contributors = new Map();
        
        events.forEach(event => {
            const contributor = event.data?.author || event.data?.requestedBy || 'Unknown';
            contributors.set(contributor, (contributors.get(contributor) || 0) + 1);
        });

        return Array.from(contributors.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([contributor, count]) => ({ contributor, count }));
    }

    generateRecommendations(events) {
        const recommendations = [];
        
        const avgScore = this.calculateAverageValidationScore(events);
        if (avgScore < 80) {
            recommendations.push('Consider updating documentation standards and providing training');
        }

        const errorRate = events.filter(e => e.type.includes('error')).length / events.length;
        if (errorRate > 0.1) {
            recommendations.push('High error rate detected - review system stability');
        }

        if (recommendations.length === 0) {
            recommendations.push('Documentation system is performing well - continue current practices');
        }

        return recommendations;
    }

    generateEventId() {
        return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event-specific content generators
    async generatePRValidationContent(event, content) {
        if (event.data?.issues?.length > 0) {
            content.body += `\n\nIssues found:\n${event.data.issues.map(issue => `- ${issue}`).join('\n')}`;
        }
        return content;
    }

    async generateSyncContent(event, content) {
        if (event.data?.files) {
            content.body += `\n\nFiles synchronized:\n${event.data.files.slice(0, 5).map(file => `- ${file}`).join('\n')}`;
            if (event.data.files.length > 5) {
                content.body += `\n... and ${event.data.files.length - 5} more files`;
            }
        }
        return content;
    }

    async generateReleaseContent(event, content) {
        if (event.data?.releaseUrl) {
            content.body += `\n\nView release: ${event.data.releaseUrl}`;
        }
        return content;
    }

    async generateErrorContent(event, content) {
        if (event.data?.stackTrace) {
            content.body += `\n\nStack trace:\n${event.data.stackTrace.slice(0, 500)}...`;
        }
        return content;
    }

    async generateGenericContent(event, content) {
        if (event.data) {
            content.body += `\n\nEvent data: ${JSON.stringify(event.data, null, 2)}`;
        }
        return content;
    }
}

module.exports = { 
    WebhookProcessor, 
    DocumentationQualityGate, 
    ReleaseDocumentationGenerator, 
    DocumentationNotificationSystem 
};

module.exports = { WebhookProcessor };
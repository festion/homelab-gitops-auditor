/**
 * Template Compliance Service
 * 
 * Provides comprehensive template compliance tracking, scoring,
 * and management for repositories in the homelab environment.
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const TemplateEngine = require('./templateEngine');
const {
  RepositoryCompliance,
  ComplianceIssue,
  Template,
  TemplateApplication,
  ComplianceSummary,
  ApplicationStatus,
  ComplianceIssueType,
  ComplianceSeverity
} = require('../../models/compliance');

class ComplianceService extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = config;
    this.templateEngine = new TemplateEngine({
      projectRoot: options.projectRoot || process.cwd(),
      verbose: options.verbose || false
    });
    
    // Caching
    this.cache = new Map();
    this.cacheTimeout = options.cacheTimeout || 300000; // 5 minutes default
    
    // In-memory storage for demo (replace with database in production)
    this.complianceData = new Map();
    this.applicationHistory = new Map();
    this.jobQueue = new Map();
    
    // Configuration
    this.enabledTemplates = options.enabledTemplates || ['standard-devops'];
    this.monitoredRepositories = options.monitoredRepositories || [];
  }

  /**
   * Get compliance status for all repositories
   */
  async getComplianceStatus(options = {}) {
    const { repository, template, includeDetails = false } = options;

    try {
      // Check cache first
      const cacheKey = `status_${JSON.stringify(options)}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      let repositories = [];

      if (repository) {
        // Single repository check
        const compliance = await this.checkRepositoryCompliance(repository, template);
        repositories = [compliance];
      } else {
        // Check all monitored repositories
        const repoList = await this.getMonitoredRepositories();
        const templates = template ? [template] : this.enabledTemplates;

        for (const repo of repoList) {
          try {
            const repoCompliance = await this.checkRepositoryCompliance(repo, templates);
            repositories.push(repoCompliance);
          } catch (error) {
            console.error(`Error checking compliance for ${repo}:`, error);
            // Add repository with error status
            repositories.push(new RepositoryCompliance({
              name: repo,
              compliant: false,
              score: 0,
              issues: [new ComplianceIssue({
                type: ComplianceIssueType.INVALID,
                template: 'system',
                file: '',
                severity: ComplianceSeverity.HIGH,
                description: `Failed to check compliance: ${error.message}`,
                recommendation: 'Check repository accessibility and template configuration'
              })],
              lastChecked: new Date().toISOString()
            }));
          }
        }
      }

      // Calculate summary
      const summary = new ComplianceSummary(repositories);

      const result = {
        repositories: repositories.map(repo => 
          includeDetails ? repo.toJSON() : this.simplifyRepositoryData(repo)
        ),
        summary: summary.toJSON(),
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('Error getting compliance status:', error);
      throw new Error(`Failed to get compliance status: ${error.message}`);
    }
  }

  /**
   * Get detailed compliance report for specific repository
   */
  async getRepositoryCompliance(repositoryName, options = {}) {
    const { templates = this.enabledTemplates, includeHistory = false } = options;

    try {
      const compliance = await this.checkRepositoryCompliance(repositoryName, templates);
      
      const result = compliance.toJSON();

      if (includeHistory) {
        result.applicationHistory = await this.getApplicationHistory({
          repository: repositoryName,
          limit: 10
        });
      }

      // Add template recommendations
      result.recommendations = await this.generateRecommendations(compliance);

      return result;

    } catch (error) {
      console.error(`Error getting repository compliance for ${repositoryName}:`, error);
      throw error;
    }
  }

  /**
   * Check compliance for a repository against templates
   */
  async checkRepositoryCompliance(repositoryName, templates = null) {
    const templatesArray = Array.isArray(templates) ? templates : 
                          templates ? [templates] : this.enabledTemplates;

    const repositoryPath = await this.getRepositoryPath(repositoryName);
    const compliance = new RepositoryCompliance({
      name: repositoryName,
      lastChecked: new Date().toISOString()
    });

    const allIssues = [];
    const appliedTemplates = [];
    const missingTemplates = [];
    const templateVersions = {};

    for (const templateName of templatesArray) {
      try {
        const result = await this.templateEngine.checkCompliance(repositoryPath, templateName);
        
        if (result.compliant) {
          appliedTemplates.push(templateName);
          templateVersions[templateName] = result.template.version;
        } else {
          missingTemplates.push(templateName);
          allIssues.push(...result.issues);
        }

        // Check if template is partially applied
        const partiallyApplied = await this.checkPartialApplication(repositoryPath, result.template);
        if (partiallyApplied.isPartial) {
          appliedTemplates.push(`${templateName} (partial)`);
          allIssues.push(...partiallyApplied.issues);
        }

      } catch (error) {
        console.error(`Error checking template ${templateName} for ${repositoryName}:`, error);
        allIssues.push(new ComplianceIssue({
          type: ComplianceIssueType.INVALID,
          template: templateName,
          file: '',
          severity: ComplianceSeverity.HIGH,
          description: `Template check failed: ${error.message}`,
          recommendation: 'Check template availability and configuration'
        }));
      }
    }

    // Set compliance data
    compliance.appliedTemplates = appliedTemplates;
    compliance.missingTemplates = missingTemplates;
    compliance.templateVersions = templateVersions;
    compliance.issues = allIssues;

    // Calculate score
    compliance.calculateScore();

    // Store in cache
    this.complianceData.set(repositoryName, compliance);

    // Emit event for real-time updates
    this.emit('compliance:checked', {
      repository: repositoryName,
      compliant: compliance.compliant,
      score: compliance.score,
      issueCount: compliance.issues.length
    });

    return compliance;
  }

  /**
   * Trigger compliance check for multiple repositories
   */
  async triggerComplianceCheck(options = {}) {
    const { repositories = [], templates = [], priority = 'normal' } = options;

    const jobId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const repoList = repositories.length > 0 ? repositories : await this.getMonitoredRepositories();
    const templateList = templates.length > 0 ? templates : this.enabledTemplates;

    // Create job
    const job = {
      id: jobId,
      type: 'compliance_check',
      status: 'pending',
      repositories: repoList,
      templates: templateList,
      priority,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      progress: {
        total: repoList.length,
        completed: 0,
        failed: 0
      },
      results: []
    };

    this.jobQueue.set(jobId, job);

    // Emit job created event
    this.emit('compliance:job-created', { jobId, job });

    // Process job asynchronously
    setImmediate(() => this.processComplianceJob(jobId));

    return {
      jobId,
      message: 'Compliance check initiated',
      repositories: repoList,
      templates: templateList,
      estimatedDuration: repoList.length * 2, // 2 seconds per repo estimate
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process compliance check job
   */
  async processComplianceJob(jobId) {
    const job = this.jobQueue.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      
      this.emit('compliance:job-started', { jobId, job });

      for (const repository of job.repositories) {
        try {
          const compliance = await this.checkRepositoryCompliance(repository, job.templates);
          
          job.results.push({
            repository,
            success: true,
            compliance: compliance.toJSON()
          });
          
          job.progress.completed++;

        } catch (error) {
          job.results.push({
            repository,
            success: false,
            error: error.message
          });
          
          job.progress.failed++;
        }

        // Emit progress update
        this.emit('compliance:job-progress', { 
          jobId, 
          progress: job.progress,
          repository 
        });
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();

      this.emit('compliance:job-completed', { jobId, job });

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date().toISOString();

      this.emit('compliance:job-failed', { jobId, job, error });
    }
  }

  /**
   * Get available templates
   */
  async getAvailableTemplates() {
    try {
      const templates = await this.templateEngine.listTemplates();
      
      // Add usage statistics
      const templatesWithStats = await Promise.all(templates.map(async (template) => {
        const stats = await this.getTemplateUsageStats(template.id);
        return {
          ...template.toJSON(),
          usage: stats
        };
      }));

      return {
        templates: templatesWithStats,
        total: templatesWithStats.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error getting available templates:', error);
      throw new Error(`Failed to get templates: ${error.message}`);
    }
  }

  /**
   * Get template usage statistics
   */
  async getTemplateUsageStats(templateId) {
    // Count applications in history
    const applications = Array.from(this.applicationHistory.values())
      .filter(app => app.templateName === templateId);

    const successful = applications.filter(app => app.isSuccessful()).length;
    const failed = applications.filter(app => app.isFailed()).length;

    // Count current compliance
    const compliantRepos = Array.from(this.complianceData.values())
      .filter(compliance => compliance.hasTemplate(templateId)).length;

    return {
      totalApplications: applications.length,
      successfulApplications: successful,
      failedApplications: failed,
      successRate: applications.length > 0 ? Math.round((successful / applications.length) * 100) : 0,
      currentlyCompliant: compliantRepos,
      lastUsed: applications.length > 0 ? 
        Math.max(...applications.map(app => new Date(app.appliedAt).getTime())) : null
    };
  }

  /**
   * Get application history
   */
  async getApplicationHistory(options = {}) {
    const { repository, template, limit = 50, offset = 0 } = options;

    let applications = Array.from(this.applicationHistory.values());

    // Apply filters
    if (repository) {
      applications = applications.filter(app => app.repository === repository);
    }

    if (template) {
      applications = applications.filter(app => app.templateName === template);
    }

    // Sort by applied date (newest first)
    applications.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    // Apply pagination
    const paginatedApps = applications.slice(offset, offset + limit);

    return {
      applications: paginatedApps.map(app => app.toJSON()),
      pagination: {
        total: applications.length,
        limit,
        offset,
        hasMore: offset + limit < applications.length
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Apply template to repository
   */
  async applyTemplate(options = {}) {
    const { repository, templates, createPR = false, dryRun = true } = options;

    if (!repository || !templates || templates.length === 0) {
      throw new Error('Repository and templates are required');
    }

    const applicationId = `apply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];

    for (const templateName of templates) {
      try {
        const repositoryPath = await this.getRepositoryPath(repository);
        
        // Create application record
        const application = new TemplateApplication({
          id: applicationId,
          repository,
          templateName,
          appliedAt: new Date().toISOString(),
          appliedBy: 'api',
          status: ApplicationStatus.RUNNING
        });

        this.applicationHistory.set(applicationId, application);

        // Emit application started event
        this.emit('compliance:application-started', {
          applicationId,
          repository,
          templateName,
          dryRun
        });

        const startTime = Date.now();
        
        // Apply template using template engine
        const result = await this.templateEngine.applyTemplate(repositoryPath, templateName, {
          dryRun,
          createPR
        });

        const duration = Math.round((Date.now() - startTime) / 1000);

        if (result.success) {
          application.markCompleted(duration);
          
          // Parse applied files from output (this would need to be enhanced)
          const filesAdded = this.parseAppliedFiles(result.output);
          application.filesAdded = filesAdded;

          this.emit('compliance:application-completed', {
            applicationId,
            repository,
            templateName,
            success: true,
            duration
          });

        } else {
          application.markFailed(result.error || 'Application failed');
          
          this.emit('compliance:application-failed', {
            applicationId,
            repository,
            templateName,
            error: result.error
          });
        }

        results.push({
          template: templateName,
          success: result.success,
          dryRun,
          output: result.output,
          error: result.error,
          duration,
          applicationId
        });

      } catch (error) {
        console.error(`Error applying template ${templateName} to ${repository}:`, error);
        
        results.push({
          template: templateName,
          success: false,
          error: error.message,
          applicationId
        });
      }
    }

    return {
      repository,
      templates,
      results,
      dryRun,
      createPR,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Helper methods
   */
  async getMonitoredRepositories() {
    if (this.monitoredRepositories.length > 0) {
      return this.monitoredRepositories;
    }

    // Get from config or discover locally
    const configRepos = this.config.get('MONITORED_REPOSITORIES', []);
    if (configRepos.length > 0) {
      return configRepos;
    }

    // Default repositories for testing
    return ['homelab-gitops-auditor', 'home-assistant-config'];
  }

  async getRepositoryPath(repositoryName) {
    // In development, look for repos in parent directory
    const isDev = process.env.NODE_ENV !== 'production';
    const baseDir = isDev ? path.resolve(process.cwd(), '..') : '/opt/repos';
    
    return path.join(baseDir, repositoryName);
  }

  async checkPartialApplication(repositoryPath, template) {
    // Check if some template files exist but not all
    const requiredFiles = template.getRequiredFiles();
    const existingFiles = [];
    const missingFiles = [];

    for (const filePath of requiredFiles) {
      const fullPath = path.join(repositoryPath, filePath);
      if (await this.templateEngine.fileExists(fullPath)) {
        existingFiles.push(filePath);
      } else {
        missingFiles.push(filePath);
      }
    }

    const isPartial = existingFiles.length > 0 && missingFiles.length > 0;
    const issues = [];

    if (isPartial) {
      missingFiles.forEach(file => {
        issues.push(new ComplianceIssue({
          type: ComplianceIssueType.MISSING,
          template: template.id,
          file,
          severity: ComplianceSeverity.MEDIUM,
          description: `Template partially applied, missing: ${file}`,
          recommendation: `Complete template application or add missing file: ${file}`
        }));
      });
    }

    return { isPartial, existingFiles, missingFiles, issues };
  }

  async generateRecommendations(compliance) {
    const recommendations = [];

    // High priority issues first
    const highPriorityIssues = compliance.getHighPriorityIssues();
    if (highPriorityIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'fix_critical_issues',
        description: `Address ${highPriorityIssues.length} high-priority compliance issues`,
        issues: highPriorityIssues.map(issue => issue.toJSON())
      });
    }

    // Missing templates
    if (compliance.missingTemplates.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'apply_templates',
        description: `Apply missing templates: ${compliance.missingTemplates.join(', ')}`,
        templates: compliance.missingTemplates
      });
    }

    // Score improvement
    if (compliance.score < 90 && compliance.score > 0) {
      recommendations.push({
        priority: 'low',
        action: 'improve_score',
        description: `Improve compliance score from ${compliance.score}% to 90%+`,
        currentScore: compliance.score,
        targetScore: 90
      });
    }

    return recommendations;
  }

  parseAppliedFiles(output) {
    // Parse template applicator output to extract applied files
    // This is a simplified version - would need to match actual output format
    const files = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Applied:') || line.includes('Created:')) {
        const match = line.match(/(?:Applied|Created):\s*(.+)$/);
        if (match) {
          files.push(match[1].trim());
        }
      }
    }
    
    return files;
  }

  simplifyRepositoryData(repo) {
    return {
      name: repo.name,
      compliant: repo.compliant,
      score: repo.score,
      appliedTemplates: repo.appliedTemplates,
      missingTemplates: repo.missingTemplates,
      lastChecked: repo.lastChecked,
      issueCount: repo.issues.length,
      highPriorityIssues: repo.getHighPriorityIssues().length
    };
  }
}

module.exports = ComplianceService;
/**
 * Bulk Action Service
 * Handles bulk operations on multiple repositories
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class BulkActionService {
  constructor() {
    this.activeActions = new Map(); // Track running actions
  }

  /**
   * Validate bulk action parameters
   */
  async validateBulkAction(action) {
    const { type, repositories, params } = action;

    if (!type || !repositories || !Array.isArray(repositories)) {
      return {
        isValid: false,
        message: 'Invalid action structure',
        errors: ['Type and repositories array are required']
      };
    }

    if (repositories.length === 0) {
      return {
        isValid: false,
        message: 'No repositories selected',
        errors: ['At least one repository must be selected']
      };
    }

    if (repositories.length > 100) {
      return {
        isValid: false,
        message: 'Too many repositories selected',
        errors: ['Maximum 100 repositories can be processed at once']
      };
    }

    // Type-specific validation
    switch (type) {
      case 'apply_templates':
        return this.validateApplyTemplatesAction(params);
      case 'run_audit':
        return this.validateRunAuditAction(params);
      case 'export_data':
        return this.validateExportDataAction(params);
      case 'tag_repositories':
        return this.validateTagRepositoriesAction(params);
      default:
        return {
          isValid: false,
          message: 'Unknown action type',
          errors: [`Action type '${type}' is not supported`]
        };
    }
  }

  validateApplyTemplatesAction(params) {
    if (!params.templates || !Array.isArray(params.templates) || params.templates.length === 0) {
      return {
        isValid: false,
        message: 'No templates specified',
        errors: ['At least one template must be selected']
      };
    }

    const validTemplates = ['basic', 'security', 'ci-cd', 'documentation', 'container'];
    const invalidTemplates = params.templates.filter(t => !validTemplates.includes(t));
    
    if (invalidTemplates.length > 0) {
      return {
        isValid: false,
        message: 'Invalid templates specified',
        errors: [`Unknown templates: ${invalidTemplates.join(', ')}`]
      };
    }

    return { isValid: true };
  }

  validateRunAuditAction(params) {
    const validAuditTypes = ['full', 'security', 'compliance'];
    
    if (params.type && !validAuditTypes.includes(params.type)) {
      return {
        isValid: false,
        message: 'Invalid audit type',
        errors: [`Audit type must be one of: ${validAuditTypes.join(', ')}`]
      };
    }

    return { isValid: true };
  }

  validateExportDataAction(params) {
    const validFormats = ['json', 'csv', 'excel'];
    
    if (params.format && !validFormats.includes(params.format)) {
      return {
        isValid: false,
        message: 'Invalid export format',
        errors: [`Format must be one of: ${validFormats.join(', ')}`]
      };
    }

    return { isValid: true };
  }

  validateTagRepositoriesAction(params) {
    if (!params.operation || !['add', 'remove'].includes(params.operation)) {
      return {
        isValid: false,
        message: 'Invalid operation',
        errors: ['Operation must be either "add" or "remove"']
      };
    }

    if (!params.tags || typeof params.tags !== 'string' || params.tags.trim().length === 0) {
      return {
        isValid: false,
        message: 'No tags specified',
        errors: ['Tags are required']
      };
    }

    const tags = params.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      return {
        isValid: false,
        message: 'No valid tags specified',
        errors: ['At least one valid tag is required']
      };
    }

    return { isValid: true };
  }

  /**
   * Execute bulk action
   */
  async executeBulkAction(actionRequest) {
    const { type, repositories, params, userId, sessionId } = actionRequest;
    const actionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Track the action
    this.activeActions.set(actionId, {
      type,
      repositories,
      params,
      userId,
      sessionId,
      startTime: Date.now(),
      status: 'running'
    });

    try {
      let result;
      
      switch (type) {
        case 'apply_templates':
          result = await this.applyTemplates(repositories, params, actionId);
          break;
        case 'run_audit':
          result = await this.runAudit(repositories, params, actionId);
          break;
        case 'export_data':
          result = await this.exportData(repositories, params, actionId);
          break;
        case 'tag_repositories':
          result = await this.tagRepositories(repositories, params, actionId);
          break;
        default:
          throw new Error(`Unsupported action type: ${type}`);
      }

      // Update action status
      if (this.activeActions.has(actionId)) {
        this.activeActions.get(actionId).status = 'completed';
      }

      // Log the action
      await this.logBulkAction({
        actionId,
        type,
        repositories: repositories.length,
        result,
        userId,
        sessionId
      });

      return result;

    } catch (error) {
      console.error(`Bulk action ${actionId} failed:`, error);
      
      // Update action status
      if (this.activeActions.has(actionId)) {
        this.activeActions.get(actionId).status = 'failed';
      }

      return {
        success: false,
        message: error.message,
        affectedRepositories: [],
        errors: [error.message]
      };
    } finally {
      // Clean up after delay
      setTimeout(() => {
        this.activeActions.delete(actionId);
      }, 60000); // Keep for 1 minute for status queries
    }
  }

  /**
   * Apply templates to repositories
   */
  async applyTemplates(repositories, params, actionId) {
    const { templates, overwrite = false } = params;
    const results = {
      success: true,
      message: `Applied templates to repositories`,
      affectedRepositories: [],
      errors: []
    };

    for (const repoName of repositories) {
      try {
        await this.updateActionProgress(actionId, `Applying templates to ${repoName}`);
        
        const repoResult = await this.applyTemplatesToRepository(repoName, templates, overwrite);
        
        if (repoResult.success) {
          results.affectedRepositories.push(repoName);
        } else {
          results.errors.push(`${repoName}: ${repoResult.error}`);
        }
      } catch (error) {
        results.errors.push(`${repoName}: ${error.message}`);
      }
    }

    if (results.errors.length > 0 && results.affectedRepositories.length === 0) {
      results.success = false;
      results.message = 'Failed to apply templates to any repository';
    } else if (results.errors.length > 0) {
      results.message = `Applied templates to ${results.affectedRepositories.length} repositories with ${results.errors.length} errors`;
    } else {
      results.message = `Successfully applied templates to ${results.affectedRepositories.length} repositories`;
    }

    return results;
  }

  /**
   * Apply templates to a single repository
   */
  async applyTemplatesToRepository(repoName, templates, overwrite) {
    try {
      // This would integrate with the template system
      // For now, simulate the operation
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
      
      return {
        success: true,
        appliedTemplates: templates
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run audit on repositories
   */
  async runAudit(repositories, params, actionId) {
    const { type = 'full', generateReport = true } = params;
    const results = {
      success: true,
      message: `Audit completed`,
      affectedRepositories: [],
      errors: []
    };

    for (const repoName of repositories) {
      try {
        await this.updateActionProgress(actionId, `Auditing ${repoName}`);
        
        const auditResult = await this.auditRepository(repoName, type);
        
        if (auditResult.success) {
          results.affectedRepositories.push(repoName);
        } else {
          results.errors.push(`${repoName}: ${auditResult.error}`);
        }
      } catch (error) {
        results.errors.push(`${repoName}: ${error.message}`);
      }
    }

    if (generateReport && results.affectedRepositories.length > 0) {
      results.reportUrl = await this.generateAuditReport(results.affectedRepositories, type);
    }

    if (results.errors.length > 0 && results.affectedRepositories.length === 0) {
      results.success = false;
      results.message = 'Failed to audit any repository';
    } else if (results.errors.length > 0) {
      results.message = `Audited ${results.affectedRepositories.length} repositories with ${results.errors.length} errors`;
    } else {
      results.message = `Successfully audited ${results.affectedRepositories.length} repositories`;
    }

    return results;
  }

  /**
   * Audit a single repository
   */
  async auditRepository(repoName, auditType) {
    try {
      // This would integrate with the audit system
      // For now, simulate the operation
      
      await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work
      
      return {
        success: true,
        auditType,
        issues: Math.floor(Math.random() * 5) // Random number of issues
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export repository data
   */
  async exportData(repositories, params, actionId) {
    const { format = 'json', includeDetails = true } = params;
    
    try {
      await this.updateActionProgress(actionId, 'Collecting repository data');
      
      // Collect data for selected repositories
      const data = await this.collectRepositoryData(repositories, includeDetails);
      
      await this.updateActionProgress(actionId, `Formatting data as ${format}`);
      
      // Format data according to requested format
      const formattedData = await this.formatExportData(data, format);
      
      return {
        success: true,
        message: `Successfully exported data for ${repositories.length} repositories`,
        affectedRepositories: repositories,
        data: formattedData,
        format
      };
    } catch (error) {
      return {
        success: false,
        message: `Export failed: ${error.message}`,
        affectedRepositories: [],
        errors: [error.message]
      };
    }
  }

  /**
   * Tag repositories
   */
  async tagRepositories(repositories, params, actionId) {
    const { operation, tags: tagString } = params;
    const tags = tagString.split(',').map(t => t.trim()).filter(Boolean);
    
    const results = {
      success: true,
      message: `${operation === 'add' ? 'Added' : 'Removed'} tags`,
      affectedRepositories: [],
      errors: []
    };

    for (const repoName of repositories) {
      try {
        await this.updateActionProgress(actionId, `${operation === 'add' ? 'Adding' : 'Removing'} tags for ${repoName}`);
        
        const tagResult = await this.updateRepositoryTags(repoName, tags, operation);
        
        if (tagResult.success) {
          results.affectedRepositories.push(repoName);
        } else {
          results.errors.push(`${repoName}: ${tagResult.error}`);
        }
      } catch (error) {
        results.errors.push(`${repoName}: ${error.message}`);
      }
    }

    if (results.errors.length > 0 && results.affectedRepositories.length === 0) {
      results.success = false;
      results.message = `Failed to ${operation} tags for any repository`;
    } else if (results.errors.length > 0) {
      results.message = `${operation === 'add' ? 'Added' : 'Removed'} tags for ${results.affectedRepositories.length} repositories with ${results.errors.length} errors`;
    } else {
      results.message = `Successfully ${operation === 'add' ? 'added' : 'removed'} tags for ${results.affectedRepositories.length} repositories`;
    }

    return results;
  }

  /**
   * Update repository tags
   */
  async updateRepositoryTags(repoName, tags, operation) {
    try {
      // This would integrate with the tagging system
      // For now, simulate the operation
      
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
      
      return {
        success: true,
        operation,
        tags
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update action progress
   */
  async updateActionProgress(actionId, message) {
    if (this.activeActions.has(actionId)) {
      this.activeActions.get(actionId).currentMessage = message;
      this.activeActions.get(actionId).lastUpdate = Date.now();
    }
  }

  /**
   * Collect repository data for export
   */
  async collectRepositoryData(repositories, includeDetails) {
    // This would collect comprehensive data about the repositories
    // For now, return mock data structure
    return repositories.map(repoName => ({
      name: repoName,
      status: 'clean', // This would be real data
      compliance: 'compliant',
      lastActivity: new Date().toISOString(),
      // Additional fields based on includeDetails flag
      ...(includeDetails && {
        templates: ['basic', 'ci-cd'],
        tags: ['production'],
        issues: { count: 0, critical: 0 }
      })
    }));
  }

  /**
   * Format export data
   */
  async formatExportData(data, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        // Simple CSV implementation
        if (data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const csvRows = [
          headers.join(','),
          ...data.map(row => 
            headers.map(header => {
              const value = row[header];
              if (Array.isArray(value)) return `"${value.join('; ')}"`;
              if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
              return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',')
          )
        ];
        return csvRows.join('\n');
      
      case 'excel':
        // For Excel, we'd use a library like xlsx
        // For now, return CSV format
        return this.formatExportData(data, 'csv');
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(repositories, auditType) {
    try {
      const reportId = `audit-${Date.now()}`;
      const reportPath = path.join(process.cwd(), 'reports', `${reportId}.json`);
      
      // Ensure reports directory exists
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      
      const report = {
        id: reportId,
        type: auditType,
        repositories,
        generatedAt: new Date().toISOString(),
        summary: {
          totalRepositories: repositories.length,
          // Additional summary data would go here
        }
      };
      
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      return `/api/reports/${reportId}`;
    } catch (error) {
      console.error('Failed to generate audit report:', error);
      return null;
    }
  }

  /**
   * Log bulk action for auditing
   */
  async logBulkAction(actionData) {
    try {
      const logPath = path.join(process.cwd(), 'logs', 'bulk-actions.log');
      const logEntry = {
        timestamp: new Date().toISOString(),
        ...actionData
      };
      
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to log bulk action:', error);
    }
  }

  /**
   * Get action status
   */
  getActionStatus(actionId) {
    return this.activeActions.get(actionId) || null;
  }
}

// Export singleton instance
const bulkActionService = new BulkActionService();

module.exports = {
  validateBulkAction: (action) => bulkActionService.validateBulkAction(action),
  executeBulkAction: (actionRequest) => bulkActionService.executeBulkAction(actionRequest),
  getActionStatus: (actionId) => bulkActionService.getActionStatus(actionId)
};
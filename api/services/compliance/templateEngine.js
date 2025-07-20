/**
 * Template Engine Integration
 * 
 * Provides integration with Phase 1B template-applicator.py and
 * handles template compliance checking logic.
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { Template, ComplianceIssue, ComplianceIssueType, ComplianceSeverity } = require('../../models/compliance');

class TemplateEngine {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.mcpDir = path.join(this.projectRoot, '.mcp');
    this.templatesDir = path.join(this.mcpDir, 'templates');
    this.applicatorScript = path.join(this.mcpDir, 'template-applicator.py');
    this.pythonExecutable = options.pythonExecutable || 'python3';
    this.verbose = options.verbose || false;
  }

  /**
   * List all available templates
   */
  async listTemplates() {
    try {
      const templates = [];
      const templatesExist = await this.fileExists(this.templatesDir);
      
      if (!templatesExist) {
        console.warn(`Templates directory not found: ${this.templatesDir}`);
        return templates;
      }

      const entries = await fs.readdir(this.templatesDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const templatePath = path.join(this.templatesDir, entry.name);
          const configPath = path.join(templatePath, 'template.json');
          
          if (await this.fileExists(configPath)) {
            try {
              const configData = await fs.readFile(configPath, 'utf8');
              const config = JSON.parse(configData);
              
              const template = new Template({
                ...config,
                path: templatePath
              });
              
              templates.push(template);
            } catch (error) {
              console.error(`Error loading template ${entry.name}:`, error.message);
            }
          }
        }
      }

      return templates;
    } catch (error) {
      console.error('Error listing templates:', error);
      throw new Error(`Failed to list templates: ${error.message}`);
    }
  }

  /**
   * Get specific template by ID
   */
  async getTemplate(templateId) {
    const templates = await this.listTemplates();
    return templates.find(template => template.id === templateId);
  }

  /**
   * Get template requirements for compliance checking
   */
  async getTemplateRequirements(templateName) {
    const template = await this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return {
      files: template.getRequiredFiles(),
      directories: template.getRequiredDirectories(),
      compliance: template.compliance,
      scoringWeights: template.getScoringWeights()
    };
  }

  /**
   * Check repository compliance against template
   */
  async checkCompliance(repositoryPath, templateName) {
    try {
      const template = await this.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      const issues = [];
      const repositoryAbsPath = path.resolve(repositoryPath);

      // Check if repository exists
      if (!(await this.fileExists(repositoryAbsPath))) {
        throw new Error(`Repository not found: ${repositoryPath}`);
      }

      // Check required files
      for (const fileConfig of template.files) {
        if (fileConfig.required) {
          const filePath = path.join(repositoryAbsPath, fileConfig.path);
          
          if (!(await this.fileExists(filePath))) {
            issues.push(new ComplianceIssue({
              type: ComplianceIssueType.MISSING,
              template: templateName,
              file: fileConfig.path,
              severity: ComplianceSeverity.HIGH,
              description: `Required file missing: ${fileConfig.path}`,
              recommendation: `Add ${fileConfig.path} file based on template requirements`
            }));
          } else {
            // Check content compliance for existing files
            const contentIssues = await this.checkFileContent(filePath, fileConfig, template);
            issues.push(...contentIssues);
          }
        }
      }

      // Check required directories
      for (const dirConfig of template.directories) {
        if (dirConfig.required) {
          const dirPath = path.join(repositoryAbsPath, dirConfig.path);
          
          if (!(await this.directoryExists(dirPath))) {
            issues.push(new ComplianceIssue({
              type: ComplianceIssueType.MISSING,
              template: templateName,
              file: dirConfig.path,
              severity: ComplianceSeverity.MEDIUM,
              description: `Required directory missing: ${dirConfig.path}`,
              recommendation: `Create directory ${dirConfig.path} as required by template`
            }));
          }
        }
      }

      // Check for template-specific compliance rules
      const customIssues = await this.checkCustomCompliance(repositoryAbsPath, template);
      issues.push(...customIssues);

      return {
        compliant: issues.length === 0,
        issues,
        template: template.toJSON(),
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error checking compliance for ${repositoryPath}:`, error);
      throw error;
    }
  }

  /**
   * Check file content compliance
   */
  async checkFileContent(filePath, fileConfig, template) {
    const issues = [];
    
    try {
      // Check if file is accessible
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return issues;
      }

      // For JSON files, check structure
      if (fileConfig.path.endsWith('.json')) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          JSON.parse(content); // Validate JSON syntax
          
          // Additional JSON-specific checks could go here
          // e.g., checking for required fields in .mcp.json
          
        } catch (jsonError) {
          issues.push(new ComplianceIssue({
            type: ComplianceIssueType.INVALID,
            template: template.id,
            file: fileConfig.path,
            severity: ComplianceSeverity.HIGH,
            description: `Invalid JSON syntax in ${fileConfig.path}`,
            recommendation: 'Fix JSON syntax errors'
          }));
        }
      }

      // Check file modification (compare with template if needed)
      if (fileConfig.type === 'template' && fileConfig.source) {
        const drift = await this.detectTemplateDrift(filePath, fileConfig, template);
        if (drift.isDrifted) {
          issues.push(new ComplianceIssue({
            type: ComplianceIssueType.MODIFIED,
            template: template.id,
            file: fileConfig.path,
            severity: ComplianceSeverity.LOW,
            description: `File has drifted from template: ${fileConfig.path}`,
            recommendation: 'Review changes and update template if needed'
          }));
        }
      }

    } catch (error) {
      console.error(`Error checking file content for ${filePath}:`, error);
    }

    return issues;
  }

  /**
   * Detect template drift (when files diverge from original template)
   */
  async detectTemplateDrift(filePath, fileConfig, template) {
    try {
      // For template files, compare with source template
      if (fileConfig.source) {
        const templateSourcePath = path.join(template.path, fileConfig.source);
        
        if (await this.fileExists(templateSourcePath)) {
          const currentContent = await fs.readFile(filePath, 'utf8');
          const templateContent = await fs.readFile(templateSourcePath, 'utf8');
          
          // Simple content comparison (could be enhanced with more sophisticated diff)
          const isDrifted = currentContent !== templateContent;
          
          return {
            isDrifted,
            currentHash: this.hashContent(currentContent),
            templateHash: this.hashContent(templateContent)
          };
        }
      }

      return { isDrifted: false };
    } catch (error) {
      console.error(`Error detecting template drift for ${filePath}:`, error);
      return { isDrifted: false };
    }
  }

  /**
   * Check custom compliance rules
   */
  async checkCustomCompliance(repositoryPath, template) {
    const issues = [];

    // Check for Git repository
    const gitDir = path.join(repositoryPath, '.git');
    if (template.requirements.git && !(await this.directoryExists(gitDir))) {
      issues.push(new ComplianceIssue({
        type: ComplianceIssueType.MISSING,
        template: template.id,
        file: '.git',
        severity: ComplianceSeverity.HIGH,
        description: 'Repository is not a Git repository',
        recommendation: 'Initialize Git repository with "git init"'
      }));
    }

    // Check for MCP configuration
    if (template.requirements.mcp) {
      const mcpConfig = path.join(repositoryPath, '.mcp.json');
      if (!(await this.fileExists(mcpConfig))) {
        issues.push(new ComplianceIssue({
          type: ComplianceIssueType.MISSING,
          template: template.id,
          file: '.mcp.json',
          severity: ComplianceSeverity.HIGH,
          description: 'MCP configuration file missing',
          recommendation: 'Add .mcp.json configuration file'
        }));
      }
    }

    return issues;
  }

  /**
   * Apply template to repository using Phase 1B applicator
   */
  async applyTemplate(repositoryPath, templateName, options = {}) {
    const { dryRun = true, createPR = false, backupDir = null } = options;

    try {
      const args = [
        this.applicatorScript,
        '--template', templateName,
        '--repository', repositoryPath
      ];

      if (dryRun) {
        args.push('--dry-run');
      }

      if (this.verbose) {
        args.push('--verbose');
      }

      const result = await this.runPythonScript(args);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        dryRun,
        templateName,
        repositoryPath,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error applying template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate compliance score based on issues and template weights
   */
  calculateComplianceScore(issues, template) {
    if (issues.length === 0) {
      return 100;
    }

    const weights = template.getScoringWeights();
    let totalPenalty = 0;
    let maxPenalty = 0;

    // Calculate penalties by category
    const fileIssues = issues.filter(issue => issue.file && !issue.file.includes('/'));
    const dirIssues = issues.filter(issue => issue.file && issue.file.includes('/'));
    const contentIssues = issues.filter(issue => issue.type === ComplianceIssueType.MODIFIED);

    // File penalty
    if (fileIssues.length > 0) {
      const filePenalty = fileIssues.reduce((sum, issue) => sum + issue.getSeverityWeight(), 0);
      totalPenalty += filePenalty * weights.files;
      maxPenalty += fileIssues.length * weights.files;
    }

    // Directory penalty
    if (dirIssues.length > 0) {
      const dirPenalty = dirIssues.reduce((sum, issue) => sum + issue.getSeverityWeight(), 0);
      totalPenalty += dirPenalty * weights.directories;
      maxPenalty += dirIssues.length * weights.directories;
    }

    // Content penalty
    if (contentIssues.length > 0) {
      const contentPenalty = contentIssues.reduce((sum, issue) => sum + issue.getSeverityWeight(), 0);
      totalPenalty += contentPenalty * weights.content;
      maxPenalty += contentIssues.length * weights.content;
    }

    // Calculate final score
    const score = maxPenalty > 0 ? Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100)) : 100;
    return score;
  }

  /**
   * Run Python script with arguments
   */
  async runPythonScript(args, options = {}) {
    return new Promise((resolve, reject) => {
      const { timeout = 30000 } = options;
      
      const process = spawn(this.pythonExecutable, args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutHandle = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Script execution timed out after ${timeout}ms`));
      }, timeout);

      process.on('close', (exitCode) => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Utility functions
   */
  async fileExists(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

module.exports = TemplateEngine;
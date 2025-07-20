/**
 * Template Compliance Service Tests
 * 
 * Tests for the template compliance API endpoints and service integration.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const ComplianceService = require('../services/compliance/complianceService');
const TemplateEngine = require('../services/compliance/templateEngine');
const {
  RepositoryCompliance,
  ComplianceIssue,
  Template,
  TemplateApplication,
  ComplianceIssueType,
  ComplianceSeverity,
  ApplicationStatus
} = require('../models/compliance');

describe('ComplianceService', () => {
  let mockConfig;
  let complianceService;
  let mockTemplateEngine;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        const values = {
          'MONITORED_REPOSITORIES': ['test-repo'],
          'PROJECT_ROOT': process.cwd()
        };
        return values[key] || defaultValue;
      })
    };

    // Mock template engine
    mockTemplateEngine = {
      listTemplates: jest.fn(),
      getTemplate: jest.fn(),
      checkCompliance: jest.fn(),
      applyTemplate: jest.fn()
    };

    complianceService = new ComplianceService(mockConfig, {
      projectRoot: process.cwd(),
      verbose: false
    });
    
    // Replace template engine with mock
    complianceService.templateEngine = mockTemplateEngine;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getComplianceStatus', () => {
    it('should return compliance status for all repositories', async () => {
      // Mock template engine responses
      const mockTemplate = new Template({
        id: 'standard-devops',
        name: 'Standard DevOps Template',
        version: '1.0.0',
        files: [{ path: '.mcp.json', required: true }],
        compliance: { scoring_weights: { files: 0.6, directories: 0.2, content: 0.2 } }
      });

      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: mockTemplate.toJSON(),
        checkedAt: new Date().toISOString()
      });

      const result = await complianceService.getComplianceStatus();

      expect(result).toHaveProperty('repositories');
      expect(result).toHaveProperty('summary');
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]).toMatchObject({
        name: 'test-repo',
        compliant: true,
        score: 100
      });
    });

    it('should handle compliance issues correctly', async () => {
      const mockIssue = new ComplianceIssue({
        type: ComplianceIssueType.MISSING,
        template: 'standard-devops',
        file: '.mcp.json',
        severity: ComplianceSeverity.HIGH,
        description: 'Missing required file'
      });

      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: false,
        issues: [mockIssue],
        template: { id: 'standard-devops', version: '1.0.0' },
        checkedAt: new Date().toISOString()
      });

      const result = await complianceService.getComplianceStatus();

      expect(result.repositories[0]).toMatchObject({
        name: 'test-repo',
        compliant: false,
        score: 0
      });
      expect(result.repositories[0].issues).toHaveLength(1);
    });

    it('should filter by repository when specified', async () => {
      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: { id: 'standard-devops', version: '1.0.0' },
        checkedAt: new Date().toISOString()
      });

      const result = await complianceService.getComplianceStatus({
        repository: 'test-repo'
      });

      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].name).toBe('test-repo');
    });

    it('should cache results for performance', async () => {
      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: { id: 'standard-devops', version: '1.0.0' },
        checkedAt: new Date().toISOString()
      });

      // First call
      await complianceService.getComplianceStatus();
      
      // Second call should use cache
      await complianceService.getComplianceStatus();

      // Should only call template engine once due to caching
      expect(mockTemplateEngine.checkCompliance).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRepositoryCompliance', () => {
    it('should return detailed compliance for specific repository', async () => {
      const mockTemplate = new Template({
        id: 'standard-devops',
        name: 'Standard DevOps Template',
        version: '1.0.0'
      });

      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: mockTemplate.toJSON(),
        checkedAt: new Date().toISOString()
      });

      const result = await complianceService.getRepositoryCompliance('test-repo');

      expect(result).toHaveProperty('name', 'test-repo');
      expect(result).toHaveProperty('compliant', true);
      expect(result).toHaveProperty('score', 100);
      expect(result).toHaveProperty('recommendations');
    });

    it('should include application history when requested', async () => {
      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: { id: 'standard-devops', version: '1.0.0' },
        checkedAt: new Date().toISOString()
      });

      // Add mock application history
      const mockApplication = new TemplateApplication({
        id: 'app-1',
        repository: 'test-repo',
        templateName: 'standard-devops',
        status: ApplicationStatus.SUCCESS
      });
      complianceService.applicationHistory.set('app-1', mockApplication);

      const result = await complianceService.getRepositoryCompliance('test-repo', {
        includeHistory: true
      });

      expect(result).toHaveProperty('applicationHistory');
      expect(result.applicationHistory.applications).toHaveLength(1);
    });
  });

  describe('triggerComplianceCheck', () => {
    it('should create and process compliance check job', async () => {
      const result = await complianceService.triggerComplianceCheck({
        repositories: ['test-repo'],
        templates: ['standard-devops']
      });

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('message');
      expect(result.repositories).toEqual(['test-repo']);
      expect(result.templates).toEqual(['standard-devops']);
      expect(complianceService.jobQueue.has(result.jobId)).toBe(true);
    });

    it('should emit job created event', (done) => {
      complianceService.on('compliance:job-created', (data) => {
        expect(data).toHaveProperty('jobId');
        expect(data).toHaveProperty('job');
        done();
      });

      complianceService.triggerComplianceCheck({
        repositories: ['test-repo']
      });
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return all available templates with usage stats', async () => {
      const mockTemplates = [
        new Template({
          id: 'standard-devops',
          name: 'Standard DevOps Template',
          version: '1.0.0'
        })
      ];

      mockTemplateEngine.listTemplates.mockResolvedValue(mockTemplates);

      const result = await complianceService.getAvailableTemplates();

      expect(result).toHaveProperty('templates');
      expect(result).toHaveProperty('total', 1);
      expect(result.templates[0]).toHaveProperty('usage');
      expect(result.templates[0].usage).toHaveProperty('totalApplications');
    });
  });

  describe('getApplicationHistory', () => {
    it('should return paginated application history', async () => {
      // Add mock application history
      const applications = [
        new TemplateApplication({
          id: 'app-1',
          repository: 'test-repo',
          templateName: 'standard-devops',
          appliedAt: '2025-01-01T10:00:00Z'
        }),
        new TemplateApplication({
          id: 'app-2',
          repository: 'test-repo',
          templateName: 'microservice',
          appliedAt: '2025-01-02T10:00:00Z'
        })
      ];

      applications.forEach(app => {
        complianceService.applicationHistory.set(app.id, app);
      });

      const result = await complianceService.getApplicationHistory({
        limit: 10,
        offset: 0
      });

      expect(result).toHaveProperty('applications');
      expect(result).toHaveProperty('pagination');
      expect(result.applications).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter by repository and template', async () => {
      const applications = [
        new TemplateApplication({
          id: 'app-1',
          repository: 'test-repo',
          templateName: 'standard-devops'
        }),
        new TemplateApplication({
          id: 'app-2',
          repository: 'other-repo',
          templateName: 'standard-devops'
        })
      ];

      applications.forEach(app => {
        complianceService.applicationHistory.set(app.id, app);
      });

      const result = await complianceService.getApplicationHistory({
        repository: 'test-repo'
      });

      expect(result.applications).toHaveLength(1);
      expect(result.applications[0].repository).toBe('test-repo');
    });
  });

  describe('applyTemplate', () => {
    it('should apply template successfully', async () => {
      mockTemplateEngine.applyTemplate.mockResolvedValue({
        success: true,
        output: 'Template applied successfully',
        error: null
      });

      const result = await complianceService.applyTemplate({
        repository: 'test-repo',
        templates: ['standard-devops'],
        dryRun: true
      });

      expect(result).toHaveProperty('repository', 'test-repo');
      expect(result).toHaveProperty('templates', ['standard-devops']);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should handle template application failure', async () => {
      mockTemplateEngine.applyTemplate.mockResolvedValue({
        success: false,
        output: '',
        error: 'Template not found'
      });

      const result = await complianceService.applyTemplate({
        repository: 'test-repo',
        templates: ['invalid-template'],
        dryRun: true
      });

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Template not found');
    });

    it('should emit application events', (done) => {
      mockTemplateEngine.applyTemplate.mockResolvedValue({
        success: true,
        output: 'Success',
        error: null
      });

      complianceService.on('compliance:application-started', (data) => {
        expect(data).toHaveProperty('repository', 'test-repo');
        expect(data).toHaveProperty('templateName', 'standard-devops');
      });

      complianceService.on('compliance:application-completed', (data) => {
        expect(data).toHaveProperty('success', true);
        done();
      });

      complianceService.applyTemplate({
        repository: 'test-repo',
        templates: ['standard-devops'],
        dryRun: true
      });
    });
  });

  describe('processComplianceJob', () => {
    it('should process compliance job successfully', async () => {
      const jobId = 'test-job-1';
      const job = {
        id: jobId,
        type: 'compliance_check',
        status: 'pending',
        repositories: ['test-repo'],
        templates: ['standard-devops'],
        progress: { total: 1, completed: 0, failed: 0 },
        results: []
      };

      complianceService.jobQueue.set(jobId, job);

      mockTemplateEngine.checkCompliance.mockResolvedValue({
        compliant: true,
        issues: [],
        template: { id: 'standard-devops', version: '1.0.0' },
        checkedAt: new Date().toISOString()
      });

      await complianceService.processComplianceJob(jobId);

      const completedJob = complianceService.jobQueue.get(jobId);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.progress.completed).toBe(1);
      expect(completedJob.results).toHaveLength(1);
    });
  });
});

describe('Compliance Models', () => {
  describe('ComplianceIssue', () => {
    it('should create issue with default values', () => {
      const issue = new ComplianceIssue();
      
      expect(issue.type).toBe(ComplianceIssueType.MISSING);
      expect(issue.severity).toBe(ComplianceSeverity.MEDIUM);
      expect(issue.template).toBe('');
      expect(issue.file).toBe('');
    });

    it('should calculate severity weight correctly', () => {
      const highIssue = new ComplianceIssue({ severity: ComplianceSeverity.HIGH });
      const mediumIssue = new ComplianceIssue({ severity: ComplianceSeverity.MEDIUM });
      const lowIssue = new ComplianceIssue({ severity: ComplianceSeverity.LOW });

      expect(highIssue.getSeverityWeight()).toBe(1.0);
      expect(mediumIssue.getSeverityWeight()).toBe(0.6);
      expect(lowIssue.getSeverityWeight()).toBe(0.3);
    });
  });

  describe('RepositoryCompliance', () => {
    it('should calculate compliance score correctly', () => {
      const compliance = new RepositoryCompliance({ name: 'test-repo' });
      
      // No issues = 100% score
      expect(compliance.calculateScore()).toBe(100);
      expect(compliance.compliant).toBe(true);

      // Add high severity issue
      compliance.addIssue(new ComplianceIssue({
        severity: ComplianceSeverity.HIGH
      }));

      expect(compliance.score).toBe(0);
      expect(compliance.compliant).toBe(false);
    });

    it('should manage issues correctly', () => {
      const compliance = new RepositoryCompliance({ name: 'test-repo' });
      
      const issue1 = new ComplianceIssue({
        type: ComplianceIssueType.MISSING,
        file: 'file1.txt',
        severity: ComplianceSeverity.HIGH
      });

      const issue2 = new ComplianceIssue({
        type: ComplianceIssueType.OUTDATED,
        file: 'file2.txt',
        severity: ComplianceSeverity.LOW
      });

      compliance.addIssue(issue1);
      compliance.addIssue(issue2);

      expect(compliance.issues).toHaveLength(2);
      expect(compliance.getHighPriorityIssues()).toHaveLength(1);

      // Remove issues by type
      compliance.removeIssues({ type: ComplianceIssueType.MISSING });
      expect(compliance.issues).toHaveLength(1);
    });

    it('should check template status correctly', () => {
      const compliance = new RepositoryCompliance({
        name: 'test-repo',
        appliedTemplates: ['template1'],
        missingTemplates: ['template2']
      });

      expect(compliance.hasTemplate('template1')).toBe(true);
      expect(compliance.hasTemplate('template3')).toBe(false);
      expect(compliance.isMissingTemplate('template2')).toBe(true);
    });
  });

  describe('Template', () => {
    it('should extract required files and directories', () => {
      const template = new Template({
        id: 'test-template',
        files: [
          { path: 'required.txt', required: true },
          { path: 'optional.txt', required: false }
        ],
        directories: [
          { path: 'required-dir', required: true },
          { path: 'optional-dir', required: false }
        ]
      });

      expect(template.getRequiredFiles()).toEqual(['required.txt']);
      expect(template.getRequiredDirectories()).toEqual(['required-dir']);
    });

    it('should provide default scoring weights', () => {
      const template = new Template({ id: 'test' });
      const weights = template.getScoringWeights();

      expect(weights).toHaveProperty('files', 0.6);
      expect(weights).toHaveProperty('directories', 0.2);
      expect(weights).toHaveProperty('content', 0.2);
    });
  });

  describe('TemplateApplication', () => {
    it('should track application status correctly', () => {
      const application = new TemplateApplication({
        repository: 'test-repo',
        templateName: 'test-template'
      });

      expect(application.status).toBe(ApplicationStatus.PENDING);

      application.markCompleted(300);
      expect(application.isSuccessful()).toBe(true);
      expect(application.duration).toBe(300);

      const failedApp = new TemplateApplication({});
      failedApp.markFailed('Error occurred');
      expect(failedApp.isFailed()).toBe(true);
      expect(failedApp.error).toBe('Error occurred');
    });

    it('should format duration correctly', () => {
      const app1 = new TemplateApplication({ duration: 45 });
      expect(app1.getFormattedDuration()).toBe('45s');

      const app2 = new TemplateApplication({ duration: 125 });
      expect(app2.getFormattedDuration()).toBe('2m 5s');

      const app3 = new TemplateApplication({});
      expect(app3.getFormattedDuration()).toBe('N/A');
    });
  });
});

describe('TemplateEngine', () => {
  let templateEngine;
  let mockProjectRoot;

  beforeEach(() => {
    mockProjectRoot = '/tmp/test-project';
    templateEngine = new TemplateEngine({
      projectRoot: mockProjectRoot,
      verbose: false
    });
  });

  describe('listTemplates', () => {
    it('should return empty array when templates directory does not exist', async () => {
      // Mock file system to return false for templates directory
      templateEngine.fileExists = jest.fn().mockResolvedValue(false);
      
      const templates = await templateEngine.listTemplates();
      expect(templates).toEqual([]);
    });
  });

  describe('checkCompliance', () => {
    it('should detect missing required files', async () => {
      const mockTemplate = new Template({
        id: 'test-template',
        files: [
          { path: 'required.txt', required: true }
        ]
      });

      templateEngine.getTemplate = jest.fn().mockResolvedValue(mockTemplate);
      templateEngine.fileExists = jest.fn().mockResolvedValue(false);
      templateEngine.directoryExists = jest.fn().mockResolvedValue(true);

      const result = await templateEngine.checkCompliance('/test/repo', 'test-template');

      expect(result.compliant).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe(ComplianceIssueType.MISSING);
    });
  });

  describe('utility functions', () => {
    it('should hash content consistently', () => {
      const content1 = 'Hello World';
      const content2 = 'Hello World';
      const content3 = 'Different Content';

      const hash1 = templateEngine.hashContent(content1);
      const hash2 = templateEngine.hashContent(content2);
      const hash3 = templateEngine.hashContent(content3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });
});
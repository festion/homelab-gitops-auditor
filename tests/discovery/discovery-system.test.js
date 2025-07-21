/**
 * Enhanced Discovery System Test Suite
 * 
 * Comprehensive tests for the multi-source document discovery system including:
 * - Multi-source discovery functionality
 * - Enhanced document classification with NLP
 * - Scheduled discovery via cron jobs
 * - Performance optimization and resource management
 * - Configuration management
 * - Health monitoring and error handling
 */

const fs = require('fs').promises;
const path = require('path');
const { describe, beforeAll, beforeEach, afterEach, afterAll, test, expect, jest } = require('@jest/globals');
const EnhancedDiscoveryManager = require('../../api/enhanced-discovery-manager');
const WikiDiscoveryCronManager = require('../../scripts/wiki-discovery-cron');

describe('Enhanced Discovery System', () => {
  let discoveryManager;
  let cronManager;
  let testRootDir;
  let testConfig;

  beforeAll(async () => {
    // Setup test environment
    testRootDir = path.join(__dirname, 'test-data');
    await setupTestEnvironment();
    
    // Initialize test configuration
    testConfig = {
      test: true,
      database: {
        path: path.join(testRootDir, 'test-discovery.db')
      }
    };
  });

  beforeEach(async () => {
    // Initialize fresh discovery manager for each test
    discoveryManager = new EnhancedDiscoveryManager(testConfig, testRootDir);
    await discoveryManager.initialize();

    // Initialize cron manager
    cronManager = new WikiDiscoveryCronManager();
    cronManager.rootDir = testRootDir;
  });

  afterEach(async () => {
    // Clean up after each test
    if (discoveryManager && discoveryManager.db) {
      await new Promise((resolve) => {
        discoveryManager.db.close(resolve);
      });
    }
  });

  afterAll(async () => {
    // Clean up test environment
    await cleanupTestEnvironment();
  });

  describe('Configuration Management', () => {
    test('should load discovery configuration successfully', async () => {
      expect(discoveryManager.discoveryConfig).toBeDefined();
      expect(discoveryManager.discoveryConfig.sources).toBeInstanceOf(Array);
      expect(discoveryManager.discoveryConfig.sources.length).toBeGreaterThan(0);
    });

    test('should validate discovery sources configuration', async () => {
      const sources = discoveryManager.discoveryConfig.sources;
      
      sources.forEach(source => {
        expect(source.id).toBeDefined();
        expect(source.path).toBeDefined();
        expect(source.type).toBeDefined();
        expect(['primary', 'repositories', 'external', 'workspace']).toContain(source.type);
        expect(['high', 'medium', 'low']).toContain(source.priority);
      });
    });

    test('should handle invalid configuration gracefully', async () => {
      const invalidConfig = { sources: [{ invalid: true }] };
      
      expect(() => {
        discoveryManager.discoveryConfig = invalidConfig;
        discoveryManager.validateDiscoveryConfig();
      }).toThrow();
    });
  });

  describe('Multi-Source Discovery', () => {
    test('should discover documents from multiple sources', async () => {
      // Create test documents in multiple locations
      await createTestDocuments();
      
      const result = await discoveryManager.runMultiSourceDiscovery();
      
      expect(result.sourcesProcessed).toBeGreaterThan(0);
      expect(result.documentsDiscovered).toBeGreaterThan(0);
      expect(result.documentsProcessed).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeDefined();
    });

    test('should handle concurrent source processing', async () => {
      const sources = discoveryManager.discoveryConfig.sources.filter(s => s.enabled);
      const maxConcurrent = 2;
      
      const startTime = Date.now();
      const results = await discoveryManager.processSourcesConcurrently(sources, maxConcurrent);
      const processingTime = Date.now() - startTime;
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(sources.length);
      expect(processingTime).toBeLessThan(60000); // Should complete within 1 minute
    });

    test('should apply exclude patterns correctly', async () => {
      const testPaths = [
        'node_modules/package/index.js',
        '.git/config',
        'build/output.js',
        'docs/README.md',
        'src/component.js'
      ];

      const excludedPaths = testPaths.filter(path => 
        discoveryManager.shouldIgnorePathEnhanced(path)
      );

      expect(excludedPaths).toContain('node_modules/package/index.js');
      expect(excludedPaths).toContain('.git/config');
      expect(excludedPaths).toContain('build/output.js');
      expect(excludedPaths).not.toContain('docs/README.md');
    });
  });

  describe('Enhanced Document Classification', () => {
    test('should classify documents using basic pattern matching', () => {
      const testCases = [
        { path: '/path/to/README.md', expected: 'readme' },
        { path: '/docs/api/endpoints.md', expected: 'api' },
        { path: '/guides/tutorial.md', expected: 'guide' },
        { path: '/config/setup.md', expected: 'config' },
        { path: '/CHANGELOG.md', expected: 'changelog' }
      ];

      testCases.forEach(({ path, expected }) => {
        const classification = discoveryManager.classifyDocumentType(path);
        expect(classification).toBe(expected);
      });
    });

    test('should enhance classification with NLP when content is available', async () => {
      const testContent = `
        This is a comprehensive guide that walks through the step-by-step
        process of setting up the application. Follow this tutorial to
        get started quickly with your installation.
      `;

      const classification = await discoveryManager.classifyDocumentTypeEnhanced(
        '/unknown/file.md',
        testContent
      );

      // Should detect as tutorial/guide based on content
      expect(['tutorial', 'guide', 'quickstart']).toContain(classification);
    });

    test('should combine multiple classification methods', () => {
      const basicType = 'docs';
      const nlpType = { type: 'tutorial', confidence: 0.8, method: 'nlp' };
      const contentType = { type: 'guide', confidence: 0.9, method: 'content_pattern' };

      const finalType = discoveryManager.combineClassificationResults(
        basicType, nlpType, contentType
      );

      expect(finalType).toBeDefined();
      expect(typeof finalType).toBe('string');
    });
  });

  describe('Content Analysis', () => {
    test('should analyze document content comprehensively', async () => {
      const testContent = `
        # API Documentation
        
        This document provides comprehensive API documentation.
        
        ## Endpoints
        
        ### GET /users
        Returns a list of users.
        
        \`\`\`javascript
        const response = await fetch('/api/users');
        const users = await response.json();
        \`\`\`
        
        ## Authentication
        
        Use Bearer tokens for authentication.
        
        ![API Diagram](./diagram.png)
        
        | Method | Endpoint | Description |
        |--------|----------|-------------|
        | GET    | /users   | List users  |
      `;

      const analysis = await discoveryManager.contentAnalyzer.analyzeContent(testContent);

      expect(analysis.wordCount).toBeGreaterThan(0);
      expect(analysis.headingCount).toBeGreaterThan(0);
      expect(analysis.codeBlockCount).toBeGreaterThan(0);
      expect(analysis.imageCount).toBeGreaterThan(0);
      expect(analysis.tableCount).toBeGreaterThan(0);
      expect(analysis.keywords).toBeInstanceOf(Array);
      expect(analysis.qualityScore).toBeGreaterThan(0);
    });

    test('should extract keywords from content', async () => {
      const testContent = 'This is a comprehensive guide about API development and authentication mechanisms.';
      
      const keywords = discoveryManager.contentAnalyzer.extractKeywords(testContent);
      
      expect(keywords).toBeInstanceOf(Array);
      expect(keywords.length).toBeGreaterThan(0);
    });

    test('should calculate readability scores', () => {
      const easyContent = 'This is easy. It has short words. All are simple.';
      const hardContent = 'The implementation necessitates comprehensive understanding of multifaceted architectural considerations.';

      const easyScore = discoveryManager.contentAnalyzer.calculateReadabilityScore(easyContent);
      const hardScore = discoveryManager.contentAnalyzer.calculateReadabilityScore(hardContent);

      expect(easyScore).toBeGreaterThan(hardScore);
    });
  });

  describe('Priority Scoring', () => {
    test('should calculate enhanced priority scores', () => {
      const testDoc = {
        sourcePath: '/test/README.md',
        fullPath: '/full/path/test/README.md',
        fileName: 'README.md',
        size: 5000,
        lastModified: new Date()
      };

      const source = {
        type: 'primary',
        weight: 100
      };

      const contentMetadata = {
        qualityScore: 85
      };

      const score = discoveryManager.calculateEnhancedPriorityScore(
        testDoc, 'readme', contentMetadata, source
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should prioritize recent documents higher', () => {
      const recentDoc = {
        size: 5000,
        lastModified: new Date()
      };

      const oldDoc = {
        size: 5000,
        lastModified: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      };

      const source = { type: 'primary', weight: 50 };
      const metadata = { qualityScore: 50 };

      const recentScore = discoveryManager.calculateEnhancedPriorityScore(
        recentDoc, 'docs', metadata, source
      );
      const oldScore = discoveryManager.calculateEnhancedPriorityScore(
        oldDoc, 'docs', metadata, source
      );

      expect(recentScore).toBeGreaterThan(oldScore);
    });
  });

  describe('Performance Optimization', () => {
    test('should handle large file processing efficiently', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB content
      const testFile = path.join(testRootDir, 'large-file.md');
      
      await fs.writeFile(testFile, largeContent);
      
      const startTime = Date.now();
      const content = await discoveryManager.readFileWithSizeLimit(testFile);
      const processingTime = Date.now() - startTime;
      
      expect(content).toBeDefined();
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      await fs.unlink(testFile);
    });

    test('should respect size limits for large files', async () => {
      const veryLargeContent = 'x'.repeat(5 * 1024 * 1024); // 5MB content
      const testFile = path.join(testRootDir, 'very-large-file.md');
      
      await fs.writeFile(testFile, veryLargeContent);
      
      const content = await discoveryManager.readFileWithSizeLimit(testFile);
      
      expect(content.length).toBeLessThan(veryLargeContent.length);
      
      await fs.unlink(testFile);
    });

    test('should deduplicate documents correctly', () => {
      const documents = [
        { fileName: 'test.md', size: 1000 },
        { fileName: 'test.md', size: 1000 }, // Duplicate
        { fileName: 'other.md', size: 2000 },
        { fileName: 'test.md', size: 1500 } // Different size, should keep
      ];

      const unique = discoveryManager.deduplicateDocuments(documents);
      
      expect(unique.length).toBe(3);
    });
  });

  describe('Database Operations', () => {
    test('should store documents with enhanced metadata', async () => {
      const testDoc = {
        sourcePath: '/test/example.md',
        fullPath: '/full/path/test/example.md',
        fileName: 'example.md',
        size: 1000,
        lastModified: new Date(),
        extension: '.md'
      };

      const source = { id: 'test-source', type: 'primary' };
      const contentMetadata = {
        wordCount: 100,
        headingCount: 3,
        qualityScore: 75
      };

      await discoveryManager.storeDocumentEnhanced(
        testDoc, source, 'docs', contentMetadata, 80, 'test content'
      );

      // Verify document was stored
      const storedDoc = await discoveryManager.getQuery(
        'SELECT * FROM wiki_documents WHERE source_path = ?',
        [testDoc.sourcePath]
      );

      expect(storedDoc).toBeDefined();
      expect(storedDoc.document_type).toBe('docs');
      expect(storedDoc.priority_score).toBe(80);
    });

    test('should handle document updates correctly', async () => {
      const testDoc = {
        sourcePath: '/test/updated.md',
        fullPath: '/full/path/test/updated.md',
        fileName: 'updated.md',
        size: 1000,
        lastModified: new Date(),
        extension: '.md'
      };

      const source = { id: 'test-source', type: 'primary' };
      
      // Store initial document
      await discoveryManager.storeDocumentEnhanced(
        testDoc, source, 'docs', {}, 60, 'original content'
      );

      // Update with new content
      await discoveryManager.storeDocumentEnhanced(
        testDoc, source, 'guide', {}, 80, 'updated content'
      );

      const storedDoc = await discoveryManager.getQuery(
        'SELECT * FROM wiki_documents WHERE source_path = ?',
        [testDoc.sourcePath]
      );

      expect(storedDoc.document_type).toBe('guide');
      expect(storedDoc.priority_score).toBe(80);
    });
  });

  describe('Scheduled Discovery (Cron)', () => {
    test('should initialize cron manager correctly', async () => {
      await cronManager.initialize();
      
      expect(cronManager.config).toBeDefined();
      expect(cronManager.config.schedules).toBeInstanceOf(Array);
      expect(cronManager.discoveryManager).toBeDefined();
    });

    test('should validate cron expressions', () => {
      const validExpressions = [
        '0 3 * * *',     // Daily at 3 AM
        '0 * * * *',     // Every hour
        '0 2 * * 0'      // Weekly on Sunday at 2 AM
      ];

      validExpressions.forEach(expr => {
        expect(() => {
          require('node-cron').validate(expr);
        }).not.toThrow();
      });
    });

    test('should check system resources before job execution', async () => {
      await cronManager.initialize();
      
      const resourceCheck = await cronManager.checkSystemResources();
      
      expect(typeof resourceCheck).toBe('boolean');
    });

    test('should handle lock file operations', async () => {
      await cronManager.initialize();
      
      // Initially no lock file should exist
      expect(await cronManager.isJobRunning()).toBe(false);
      
      // Create lock file
      await cronManager.createLockFile('test-job', { id: 'test', name: 'Test Job' });
      
      // Now should detect running job
      expect(await cronManager.isJobRunning()).toBe(true);
      
      // Remove lock file
      await cronManager.removeLockFile();
      
      // Should no longer detect running job
      expect(await cronManager.isJobRunning()).toBe(false);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle missing source directories gracefully', async () => {
      const invalidSource = {
        id: 'invalid-source',
        path: '/non/existent/path',
        type: 'external',
        enabled: true
      };

      await expect(
        discoveryManager.processDiscoverySource(invalidSource)
      ).rejects.toThrow();
    });

    test('should continue processing other sources when one fails', async () => {
      const sources = [
        {
          id: 'valid-source',
          path: testRootDir,
          type: 'primary',
          enabled: true
        },
        {
          id: 'invalid-source',
          path: '/non/existent/path',
          type: 'external',
          enabled: true
        }
      ];

      const results = await discoveryManager.processSourcesConcurrently(sources, 2);
      
      expect(results).toHaveLength(2);
      expect(results.some(r => !r.error)).toBe(true); // At least one should succeed
    });

    test('should handle malformed content gracefully', async () => {
      const malformedContent = '\x00\x01\x02\x03\xFF\xFE\xFD';
      
      const analysis = await discoveryManager.contentAnalyzer.analyzeContent(malformedContent);
      
      expect(analysis).toBeDefined();
      expect(analysis.qualityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health Monitoring', () => {
    test('should track discovery statistics', () => {
      const stats = discoveryManager.getDiscoveryStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalSources).toBeGreaterThanOrEqual(0);
      expect(stats.activeSources).toBeGreaterThanOrEqual(0);
      expect(stats.performanceMetrics).toBeDefined();
    });

    test('should record performance metrics', async () => {
      await discoveryManager.recordMetric('test_metric', 100, 'ms');
      
      const metrics = await discoveryManager.getQuery(
        'SELECT * FROM discovery_metrics WHERE metric_type = ?',
        ['test_metric']
      );
      
      expect(metrics).toBeDefined();
      expect(metrics.metric_value).toBe(100);
      expect(metrics.metric_unit).toBe('ms');
    });
  });

  // Helper functions
  async function setupTestEnvironment() {
    try {
      await fs.mkdir(testRootDir, { recursive: true });
      
      // Create test directories
      const testDirs = [
        path.join(testRootDir, 'config'),
        path.join(testRootDir, 'tmp'),
        path.join(testRootDir, 'logs'),
        path.join(testRootDir, 'test-repos'),
        path.join(testRootDir, 'test-repos', 'repo1'),
        path.join(testRootDir, 'test-repos', 'repo2')
      ];

      for (const dir of testDirs) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Create test configuration
      const testDiscoveryConfig = {
        version: "2.0.0",
        discoveryConfig: {
          sources: [
            {
              id: "test-primary",
              path: path.join(testRootDir, 'test-repos'),
              type: "primary",
              priority: "high",
              weight: 100,
              recursive: true,
              enabled: true
            }
          ],
          excludePatterns: ["node_modules/**", ".git/**"],
          includePatterns: ["*.md", "*.txt"],
          performance: {
            maxConcurrentSources: 2,
            maxFilesPerBatch: 10
          },
          contentAnalysis: {
            enableNLPClassification: true,
            maxContentLength: "1MB"
          },
          priorityScoring: {
            weights: {
              documentType: 0.3,
              lastModified: 0.2,
              fileSize: 0.1,
              repositoryImportance: 0.25,
              contentQuality: 0.15
            },
            documentTypeScores: {
              readme: 95,
              docs: 85,
              api: 80
            },
            sourceLocationScores: {
              primary: 50
            }
          }
        }
      };

      await fs.writeFile(
        path.join(testRootDir, 'config', 'discovery-sources.json'),
        JSON.stringify(testDiscoveryConfig, null, 2)
      );

    } catch (error) {
      console.error('Failed to setup test environment:', error);
      throw error;
    }
  }

  async function createTestDocuments() {
    const testDocs = [
      {
        path: path.join(testRootDir, 'test-repos', 'repo1', 'README.md'),
        content: '# Repo 1\n\nThis is the main repository documentation.'
      },
      {
        path: path.join(testRootDir, 'test-repos', 'repo1', 'docs', 'api.md'),
        content: '# API Documentation\n\nThis document describes the API endpoints.'
      },
      {
        path: path.join(testRootDir, 'test-repos', 'repo2', 'guide.md'),
        content: '# User Guide\n\nStep by step tutorial for users.'
      }
    ];

    for (const doc of testDocs) {
      await fs.mkdir(path.dirname(doc.path), { recursive: true });
      await fs.writeFile(doc.path, doc.content);
    }
  }

  async function cleanupTestEnvironment() {
    try {
      await fs.rm(testRootDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup test environment:', error);
    }
  }
});
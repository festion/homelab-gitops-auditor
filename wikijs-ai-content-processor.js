/**
 * WikiJS AI-Enhanced Content Processing Pipeline
 * Integrates with MCP servers for content enhancement and validation
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Import MCP clients
const { SerenaMCPClient } = require('./mcp-integrations/serena-mcp-client.js');
const { CodeLinterMCPClient } = require('./mcp-integrations/code-linter-mcp-client.js');

/**
 * Content Processing Pipeline Configuration
 */
const DEFAULT_CONFIG = {
  enhancement: {
    enabled: true,
    serenaPrompts: {
      grammar: "Improve grammar, clarity, and technical writing quality while preserving accuracy",
      structure: "Optimize document structure, headings, and organization for better readability",
      linking: "Add relevant cross-references and internal links where appropriate",
      summary: "Generate concise summaries for documents over 1000 words"
    },
    aiProvider: 'serena-mcp'
  },
  validation: {
    enabled: true,
    linting: true,
    linkChecking: true,
    imageValidation: true,
    styleGuideEnforcement: true
  },
  qualityThresholds: {
    minScore: 7.0,
    requireTOC: 1000, // words
    maxProcessingTime: 30000 // ms
  },
  processing: {
    parallelJobs: 3,
    retryAttempts: 2,
    backoffMultiplier: 1.5,
    timeoutMs: 45000
  },
  output: {
    preserveOriginal: true,
    generateReport: true,
    trackMetrics: true
  }
};

/**
 * Main Content Processor Class
 */
class WikiJSContentProcessor {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.processingQueue = [];
    this.metrics = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      averageProcessingTime: 0,
      qualityImprovements: []
    };
    
    // Initialize MCP clients
    this.serenaMCP = new SerenaMCPClient(config.serenaConfig || {});
    this.codeLinterMCP = new CodeLinterMCPClient(config.codeLinterConfig || {});
  }

  /**
   * Initialize the content processor
   */
  async initialize() {
    console.log('[INFO] Initializing WikiJS AI Content Processor');
    
    // Initialize MCP clients
    await this.serenaMCP.initialize();
    await this.codeLinterMCP.initialize();
    
    // Test MCP server connections
    await this.testMCPConnections();
    
    // Create working directories
    await this.setupWorkingDirectories();
    
    console.log('[INFO] Content processor initialized successfully');
  }

  /**
   * Test connections to required MCP servers
   */
  async testMCPConnections() {
    console.log('[INFO] Testing MCP server connections...');
    
    const connections = await Promise.allSettled([
      this.serenaMCP.testConnection(),
      this.codeLinterMCP.testConnection()
    ]);

    const serenaConnected = connections[0].status === 'fulfilled' && connections[0].value;
    const linterConnected = connections[1].status === 'fulfilled' && connections[1].value;

    console.log(`[INFO] Serena MCP server: ${serenaConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    console.log(`[INFO] Code-Linter MCP server: ${linterConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    
    if (!serenaConnected && this.config.enhancement.enabled) {
      console.warn('[WARN] Serena MCP server unavailable - content enhancement will be limited');
    }
    
    if (!linterConnected && this.config.validation.enabled) {
      console.warn('[WARN] Code-Linter MCP server unavailable - validation will be limited');
    }
  }

  /**
   * Setup working directories for processing
   */
  async setupWorkingDirectories() {
    const dirs = [
      '/tmp/wikijs-processor',
      '/tmp/wikijs-processor/staging',
      '/tmp/wikijs-processor/enhanced',
      '/tmp/wikijs-processor/validated',
      '/tmp/wikijs-processor/reports'
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Process a single document through the enhancement pipeline
   */
  async processDocument(filePath, options = {}) {
    const processingId = this.generateProcessingId();
    const startTime = Date.now();
    
    console.log(`[INFO] Processing document: ${filePath} (ID: ${processingId})`);

    try {
      // Stage 1: Content Analysis and Classification
      const analysisResult = await this.analyzeContent(filePath, processingId);
      
      // Stage 2: AI Enhancement via Serena MCP
      let enhancedContent = analysisResult.content;
      if (this.config.enhancement.enabled) {
        enhancedContent = await this.enhanceContent(analysisResult, processingId);
      }

      // Stage 3: Validation via Code-linter MCP
      const validationResult = await this.validateContent(enhancedContent, processingId);

      // Stage 4: Link Resolution and Cross-referencing
      const linkedContent = await this.processLinks(validationResult.content, processingId);

      // Stage 5: Image and Asset Processing
      const finalContent = await this.processAssets(linkedContent, processingId);

      // Stage 6: Quality Assurance Check
      const qualityScore = await this.calculateQualityScore(finalContent, analysisResult);

      // Generate processing report
      const report = await this.generateProcessingReport({
        processingId,
        originalPath: filePath,
        analysisResult,
        validationResult,
        qualityScore,
        processingTime: Date.now() - startTime,
        enhancementsMade: this.extractEnhancementsSummary(analysisResult.content, finalContent)
      });

      // Update metrics
      this.updateMetrics(report);

      console.log(`[INFO] Document processing completed: ${processingId} (Score: ${qualityScore})`);

      return {
        success: true,
        processingId,
        content: finalContent,
        report,
        qualityScore
      };

    } catch (error) {
      console.error(`[ERROR] Document processing failed: ${processingId} - ${error.message}`);
      this.metrics.errorCount++;
      
      return {
        success: false,
        processingId,
        error: error.message,
        originalContent: await fs.readFile(filePath, 'utf8')
      };
    }
  }

  /**
   * Analyze content and classify document type
   */
  async analyzeContent(filePath, processingId) {
    console.log(`[INFO] Analyzing content: ${processingId}`);
    
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await this.calculateContentStats(content);
    
    const analysis = {
      content,
      filePath,
      wordCount: stats.wordCount,
      readingTime: Math.ceil(stats.wordCount / 200), // minutes
      complexity: stats.complexity,
      documentType: this.classifyDocumentType(content),
      headings: this.extractHeadings(content),
      codeBlocks: this.extractCodeBlocks(content),
      links: this.extractLinks(content),
      images: this.extractImages(content),
      needsTOC: stats.wordCount >= this.config.qualityThresholds.requireTOC
    };

    // Save analysis for reporting
    await fs.writeFile(
      `/tmp/wikijs-processor/staging/${processingId}_analysis.json`,
      JSON.stringify(analysis, null, 2)
    );

    return analysis;
  }

  /**
   * Enhance content using Serena MCP server
   */
  async enhanceContent(analysisResult, processingId) {
    console.log(`[INFO] Enhancing content with AI: ${processingId}`);
    
    if (!this.serenaMCP.isConnected) {
      console.warn(`[WARN] Serena MCP not connected - skipping AI enhancement`);
      return analysisResult.content;
    }

    try {
      // Use comprehensive enhancement method from Serena MCP client
      const enhancementOptions = {
        processingId,
        enhanceGrammar: !!this.config.enhancement.serenaPrompts.grammar,
        optimizeStructure: !!this.config.enhancement.serenaPrompts.structure,
        enhanceLinking: !!this.config.enhancement.serenaPrompts.linking,
        generateSummary: analysisResult.wordCount >= 500
      };

      const enhancementResult = await this.serenaMCP.enhanceContent(
        analysisResult.content, 
        enhancementOptions
      );

      if (enhancementResult.success) {
        let enhancedContent = enhancementResult.enhancedContent;
        
        // Generate table of contents if needed
        if (analysisResult.needsTOC) {
          enhancedContent = await this.generateTableOfContents(enhancedContent);
          enhancementResult.processingSteps.push({
            step: 'toc',
            success: true,
            changes: 1
          });
        }

        // Save enhanced content
        await fs.writeFile(
          `/tmp/wikijs-processor/enhanced/${processingId}_enhanced.md`,
          enhancedContent
        );

        const completedSteps = enhancementResult.processingSteps
          .filter(step => step.success)
          .map(step => step.step);

        console.log(`[INFO] Content enhanced with: ${completedSteps.join(', ')}`);
        return enhancedContent;
      } else {
        console.warn(`[WARN] Content enhancement failed: ${enhancementResult.error}`);
        return analysisResult.content;
      }

    } catch (error) {
      console.error(`[ERROR] Content enhancement failed: ${error.message}`);
      return analysisResult.content;
    }
  }

  /**
   * Validate content using Code-linter MCP server
   */
  async validateContent(content, processingId) {
    console.log(`[INFO] Validating content: ${processingId}`);
    
    if (!this.codeLinterMCP.isConnected) {
      console.warn(`[WARN] Code-Linter MCP not connected - performing basic validation`);
      return await this.performBasicValidation(content, processingId);
    }

    try {
      // Use comprehensive validation method from Code-Linter MCP client
      const validationResult = await this.codeLinterMCP.validateMarkdown(content, processingId);
      
      const validation = {
        content,
        isValid: validationResult.success,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions,
        linksValidated: validationResult.linksChecked || 0,
        brokenLinks: validationResult.brokenLinks || [],
        styleViolations: validationResult.styleViolations || [],
        spellingErrors: validationResult.spellingErrors || [],
        imageIssues: validationResult.imageIssues || [],
        metrics: validationResult.metrics || {}
      };

      // Save validation report
      await fs.writeFile(
        `/tmp/wikijs-processor/validated/${processingId}_validation.json`,
        JSON.stringify(validation, null, 2)
      );

      console.log(`[INFO] Content validation completed: ${processingId} (${validation.metrics.totalIssues || 0} issues found)`);
      return validation;

    } catch (error) {
      console.error(`[ERROR] Content validation failed: ${error.message}`);
      return {
        content,
        isValid: false,
        errors: [error.message],
        warnings: [],
        suggestions: [],
        error: error.message
      };
    }
  }

  /**
   * Process and resolve links in content
   */
  async processLinks(content, processingId) {
    console.log(`[INFO] Processing links: ${processingId}`);
    
    // Extract all links from content
    const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    const links = [];
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        fullMatch: match[0]
      });
    }

    // Validate and enhance links
    let processedContent = content;
    for (const link of links) {
      try {
        const processedLink = await this.processLink(link);
        if (processedLink.updated) {
          processedContent = processedContent.replace(
            link.fullMatch,
            processedLink.newFormat
          );
        }
      } catch (error) {
        console.warn(`[WARN] Link processing failed for ${link.url}: ${error.message}`);
      }
    }

    return processedContent;
  }

  /**
   * Process images and other assets
   */
  async processAssets(content, processingId) {
    console.log(`[INFO] Processing assets: ${processingId}`);
    
    // Extract image references
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;

    while ((match = imagePattern.exec(content)) !== null) {
      images.push({
        alt: match[1],
        src: match[2],
        fullMatch: match[0]
      });
    }

    // Validate image assets
    let processedContent = content;
    for (const image of images) {
      try {
        const imageExists = await this.validateImageAsset(image.src);
        if (!imageExists) {
          console.warn(`[WARN] Image not found: ${image.src}`);
          // Could implement image optimization or replacement here
        }
      } catch (error) {
        console.warn(`[WARN] Image validation failed: ${error.message}`);
      }
    }

    return processedContent;
  }

  /**
   * Calculate quality score for processed content
   */
  async calculateQualityScore(content, originalAnalysis) {
    const metrics = {
      readability: this.calculateReadabilityScore(content),
      structure: this.calculateStructureScore(content),
      linkQuality: this.calculateLinkQuality(content),
      contentDepth: this.calculateContentDepth(content, originalAnalysis),
      technicalAccuracy: this.calculateTechnicalAccuracy(content)
    };

    const weights = {
      readability: 0.25,
      structure: 0.25,
      linkQuality: 0.15,
      contentDepth: 0.20,
      technicalAccuracy: 0.15
    };

    let totalScore = 0;
    for (const [metric, score] of Object.entries(metrics)) {
      totalScore += score * weights[metric];
    }

    return {
      overall: Math.round(totalScore * 10) / 10,
      breakdown: metrics
    };
  }

  /**
   * Generate comprehensive processing report
   */
  async generateProcessingReport(data) {
    const report = {
      processingId: data.processingId,
      timestamp: new Date().toISOString(),
      originalFile: data.originalPath,
      processingTime: data.processingTime,
      qualityScore: data.qualityScore,
      documentAnalysis: {
        wordCount: data.analysisResult.wordCount,
        documentType: data.analysisResult.documentType,
        complexity: data.analysisResult.complexity,
        readingTime: data.analysisResult.readingTime
      },
      enhancementsSummary: data.enhancementsMade,
      validationResults: {
        isValid: data.validationResult.isValid,
        errorCount: data.validationResult.errors.length,
        warningCount: data.validationResult.warnings.length,
        brokenLinks: data.validationResult.brokenLinks.length
      },
      recommendations: this.generateRecommendations(data)
    };

    // Save detailed report
    await fs.writeFile(
      `/tmp/wikijs-processor/reports/${data.processingId}_report.json`,
      JSON.stringify(report, null, 2)
    );

    return report;
  }

  /**
   * Upload processed content to WikiJS
   */
  async uploadToWikiJS(processedContent, targetPath, metadata = {}) {
    console.log(`[INFO] Uploading to WikiJS: ${targetPath}`);
    
    try {
      // Call WikiJS MCP server for upload
      const uploadResult = await this.callWikiJSMCP('upload', {
        content: processedContent,
        path: targetPath,
        metadata: {
          ...metadata,
          processedBy: 'AI Content Processor',
          processedAt: new Date().toISOString()
        }
      });

      return uploadResult;
      
    } catch (error) {
      console.error(`[ERROR] WikiJS upload failed: ${error.message}`);
      throw error;
    }
  }

  // Utility Methods

  /**
   * Execute shell command with timeout
   */
  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 10000;
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timeout: ${command}`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Perform basic validation when Code-Linter MCP is not available
   */
  async performBasicValidation(content, processingId) {
    console.log(`[INFO] Performing basic validation: ${processingId}`);
    
    const validation = {
      content,
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      linksValidated: 0,
      brokenLinks: [],
      styleViolations: [],
      spellingErrors: [],
      imageIssues: [],
      metrics: { totalIssues: 0, criticalIssues: 0 }
    };

    try {
      // Basic markdown structure check
      const lines = content.split('\n');
      let inCodeBlock = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        
        // Check for code block boundaries
        if (line.startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          continue;
        }
        
        // Skip validation inside code blocks
        if (inCodeBlock) continue;
        
        // Check for common issues
        if (line.match(/\s+$/)) {
          validation.warnings.push({
            line: lineNum,
            message: 'Line has trailing whitespace',
            type: 'formatting'
          });
        }
        
        if (line.match(/^#{7,}/)) {
          validation.errors.push({
            line: lineNum,
            message: 'Invalid heading level (max 6)',
            type: 'structure'
          });
        }
      }

      // Update metrics
      validation.metrics.totalIssues = validation.errors.length + validation.warnings.length;
      validation.metrics.criticalIssues = validation.errors.length;
      validation.isValid = validation.errors.length === 0;

      // Save basic validation report
      await fs.writeFile(
        `/tmp/wikijs-processor/validated/${processingId}_validation.json`,
        JSON.stringify(validation, null, 2)
      );

      return validation;

    } catch (error) {
      console.error(`[ERROR] Basic validation failed: ${error.message}`);
      return {
        ...validation,
        isValid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Call WikiJS MCP server
   */
  async callWikiJSMCP(action, data) {
    console.log(`[INFO] Calling WikiJS MCP for action: ${action}`);
    
    try {
      // Execute WikiJS MCP wrapper
      const result = await this.executeCommand('/home/dev/workspace/wikijs-mcp-wrapper.sh', [
        '--action', action,
        '--data', JSON.stringify(data)
      ]);

      return {
        success: result.code === 0,
        result: result.stdout,
        error: result.stderr
      };

    } catch (error) {
      console.error(`[ERROR] WikiJS MCP call failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods for content analysis
  
  generateProcessingId() {
    return crypto.randomBytes(8).toString('hex');
  }

  async calculateContentStats(content) {
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const paragraphs = content.split(/\n\s*\n/).length;
    
    return {
      wordCount: words,
      sentenceCount: sentences,
      paragraphCount: paragraphs,
      complexity: sentences > 0 ? words / sentences : 0
    };
  }

  classifyDocumentType(content) {
    if (content.includes('```')) return 'technical';
    if (content.includes('## Installation') || content.includes('## Setup')) return 'guide';
    if (content.includes('# API') || content.includes('## Endpoints')) return 'api';
    return 'general';
  }

  extractHeadings(content) {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let match;
    
    while ((match = headingPattern.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return headings;
  }

  extractCodeBlocks(content) {
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    
    while ((match = codeBlockPattern.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return blocks;
  }

  extractLinks(content) {
    const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    const links = [];
    let match;
    
    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return links;
  }

  extractImages(content) {
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;
    
    while ((match = imagePattern.exec(content)) !== null) {
      images.push({
        alt: match[1],
        src: match[2],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return images;
  }

  async generateTableOfContents(content) {
    const headings = this.extractHeadings(content);
    if (headings.length < 3) return content;

    let toc = '\n## Table of Contents\n\n';
    for (const heading of headings) {
      if (heading.level <= 3) { // Only include H1-H3 in TOC
        const indent = '  '.repeat(heading.level - 1);
        const link = heading.text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        toc += `${indent}- [${heading.text}](#${link})\n`;
      }
    }
    toc += '\n';

    // Insert TOC after the first heading
    const firstHeadingIndex = content.search(/^#\s+/m);
    if (firstHeadingIndex !== -1) {
      const nextLineIndex = content.indexOf('\n', firstHeadingIndex);
      return content.slice(0, nextLineIndex) + toc + content.slice(nextLineIndex);
    }

    return toc + content;
  }

  async processLink(link) {
    // Check if link is internal or external
    if (link.url.startsWith('http')) {
      // External link - could validate accessibility
      return { updated: false };
    } else if (link.url.startsWith('/')) {
      // Internal WikiJS link - could enhance with page metadata
      return { updated: false };
    } else {
      // Relative link - could resolve to absolute path
      return { updated: false };
    }
  }

  async validateImageAsset(imagePath) {
    try {
      // Check if image exists in expected locations
      const possiblePaths = [
        path.resolve(imagePath),
        path.resolve('/home/dev/workspace/assets', imagePath),
        path.resolve('/home/dev/workspace', imagePath)
      ];

      for (const filePath of possiblePaths) {
        try {
          await fs.access(filePath);
          return true;
        } catch (e) {
          // Continue checking other paths
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  // Quality scoring methods
  calculateReadabilityScore(content) {
    // Simplified readability scoring (could use Flesch-Kincaid)
    const stats = this.calculateContentStats(content);
    const avgSentenceLength = stats.wordCount / stats.sentenceCount;
    
    if (avgSentenceLength <= 15) return 9;
    if (avgSentenceLength <= 20) return 7;
    if (avgSentenceLength <= 25) return 5;
    return 3;
  }

  calculateStructureScore(content) {
    const headings = this.extractHeadings(content);
    const hasTitle = headings.length > 0 && headings[0].level === 1;
    const hasSubheadings = headings.filter(h => h.level === 2).length > 0;
    const hasParagraphs = content.split('\n\n').length > 3;
    
    let score = 0;
    if (hasTitle) score += 3;
    if (hasSubheadings) score += 3;
    if (hasParagraphs) score += 2;
    if (headings.length >= 3) score += 2;
    
    return Math.min(score, 10);
  }

  calculateLinkQuality(content) {
    const links = this.extractLinks(content);
    if (links.length === 0) return 8; // No broken links possible
    
    // In real implementation, would validate each link
    return 8; // Placeholder score
  }

  calculateContentDepth(content, originalAnalysis) {
    const codeBlocks = this.extractCodeBlocks(content);
    const images = this.extractImages(content);
    const wordCount = originalAnalysis.wordCount;
    
    let score = 5; // Base score
    if (wordCount > 500) score += 1;
    if (wordCount > 1500) score += 1;
    if (codeBlocks.length > 0) score += 1;
    if (images.length > 0) score += 1;
    if (originalAnalysis.needsTOC) score += 1;
    
    return Math.min(score, 10);
  }

  calculateTechnicalAccuracy(content) {
    // Placeholder for technical accuracy scoring
    // Could integrate with spell checkers, technical glossaries, etc.
    return 8;
  }

  extractEnhancementsSummary(original, enhanced) {
    return {
      lengthChange: enhanced.length - original.length,
      structuralChanges: 0, // Would calculate actual changes
      linkAdditions: 0,
      grammarFixes: 0
    };
  }

  generateRecommendations(data) {
    const recommendations = [];
    
    if (data.qualityScore.overall < 7) {
      recommendations.push('Consider additional manual review for quality improvement');
    }
    
    if (data.validationResult.brokenLinks.length > 0) {
      recommendations.push('Fix broken links before publishing');
    }
    
    if (data.analysisResult.wordCount < 200) {
      recommendations.push('Consider expanding content for better SEO and user value');
    }
    
    return recommendations;
  }

  updateMetrics(report) {
    this.metrics.totalProcessed++;
    if (report.qualityScore.overall >= this.config.qualityThresholds.minScore) {
      this.metrics.successCount++;
    }
    
    // Update average processing time
    const currentAvg = this.metrics.averageProcessingTime;
    const newAvg = (currentAvg * (this.metrics.totalProcessed - 1) + report.processingTime) / this.metrics.totalProcessed;
    this.metrics.averageProcessingTime = Math.round(newAvg);
    
    this.metrics.qualityImprovements.push({
      processingId: report.processingId,
      score: report.qualityScore.overall,
      improvements: report.enhancementsSummary
    });
  }

  /**
   * Get current processing metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalProcessed > 0 ? 
        (this.metrics.successCount / this.metrics.totalProcessed * 100).toFixed(2) + '%' : '0%',
      mcpStatus: {
        serenaConnected: this.serenaMCP.isConnected,
        linterConnected: this.codeLinterMCP.isConnected
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('[INFO] Cleaning up content processor resources...');
    
    await Promise.allSettled([
      this.serenaMCP.cleanup(),
      this.codeLinterMCP.cleanup()
    ]);

    console.log('[INFO] Content processor cleanup completed');
  }
}

module.exports = { WikiJSContentProcessor, DEFAULT_CONFIG };
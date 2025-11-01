/**
 * Code-Linter MCP Client Integration
 * Provides content validation and linting capabilities through MCP protocol
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class CodeLinterMCPClient {
  constructor(config = {}) {
    this.config = {
      wrapperScript: config.wrapperScript || '/home/dev/workspace/code-linter-wrapper.sh',
      timeout: config.timeout || 15000,
      maxRetries: config.maxRetries || 2,
      tempDir: config.tempDir || '/tmp/code-linter-mcp',
      validationRules: {
        markdown: true,
        linkChecking: true,
        imageValidation: true,
        spellCheck: true,
        styleGuide: true
      },
      ...config
    };
    this.isConnected = false;
    this.connectionTested = false;
    this.supportedLanguages = ['markdown', 'javascript', 'typescript', 'python', 'json', 'yaml'];
  }

  /**
   * Initialize connection to Code-Linter MCP server
   */
  async initialize() {
    console.log('[INFO] Initializing Code-Linter MCP client...');
    
    // Create temp directory
    await fs.mkdir(this.config.tempDir, { recursive: true });
    
    // Test connection
    await this.testConnection();
    
    console.log('[INFO] Code-Linter MCP client initialized successfully');
  }

  /**
   * Test connection to Code-Linter MCP server
   */
  async testConnection() {
    if (this.connectionTested) {
      return this.isConnected;
    }

    try {
      console.log('[INFO] Testing Code-Linter MCP server connection...');
      
      // Create a simple test file
      const testFile = path.join(this.config.tempDir, 'test.md');
      await fs.writeFile(testFile, '# Test Document\n\nThis is a test.');
      
      // Test basic linting functionality
      const testResult = await this.lintFile(testFile, 'markdown');
      
      this.isConnected = testResult.success !== false;
      this.connectionTested = true;
      
      // Cleanup test file
      await fs.unlink(testFile).catch(() => {});
      
      if (this.isConnected) {
        console.log('[INFO] Code-Linter MCP server connection: OK');
      } else {
        console.warn('[WARN] Code-Linter MCP server connection: FAILED');
      }
      
      return this.isConnected;
      
    } catch (error) {
      console.warn(`[WARN] Code-Linter MCP connection test failed: ${error.message}`);
      this.isConnected = false;
      this.connectionTested = true;
      return false;
    }
  }

  /**
   * Validate markdown content
   */
  async validateMarkdown(content, processingId) {
    console.log(`[INFO] Validating markdown content: ${processingId}`);
    
    try {
      // Write content to temporary file
      const tempFile = path.join(this.config.tempDir, `${processingId}_validation.md`);
      await fs.writeFile(tempFile, content);

      // Perform comprehensive validation
      const results = await Promise.all([
        this.lintFile(tempFile, 'markdown'),
        this.checkLinks(content, processingId),
        this.validateImages(content, processingId),
        this.checkSpelling(content, processingId),
        this.enforceStyleGuide(content, processingId)
      ]);

      // Cleanup temp file
      await fs.unlink(tempFile).catch(() => {});

      // Combine all validation results
      const combinedResult = {
        success: true,
        errors: [],
        warnings: [],
        suggestions: [],
        linksChecked: 0,
        brokenLinks: [],
        styleViolations: [],
        spellingErrors: [],
        imageIssues: [],
        metrics: {
          totalIssues: 0,
          criticalIssues: 0,
          processingTime: 0
        }
      };

      // Process each validation result
      results.forEach((result, index) => {
        if (result.errors) combinedResult.errors.push(...result.errors);
        if (result.warnings) combinedResult.warnings.push(...result.warnings);
        if (result.suggestions) combinedResult.suggestions.push(...result.suggestions);
        
        // Merge specific result types
        if (index === 1 && result.linksChecked) { // Link checking
          combinedResult.linksChecked = result.linksChecked;
          combinedResult.brokenLinks = result.brokenLinks || [];
        }
        if (index === 2 && result.imageIssues) { // Image validation
          combinedResult.imageIssues = result.imageIssues;
        }
        if (index === 3 && result.spellingErrors) { // Spell checking
          combinedResult.spellingErrors = result.spellingErrors;
        }
        if (index === 4 && result.styleViolations) { // Style guide
          combinedResult.styleViolations = result.styleViolations;
        }
      });

      // Calculate metrics
      combinedResult.metrics.totalIssues = 
        combinedResult.errors.length + 
        combinedResult.warnings.length + 
        combinedResult.brokenLinks.length + 
        combinedResult.styleViolations.length + 
        combinedResult.spellingErrors.length;

      combinedResult.metrics.criticalIssues = 
        combinedResult.errors.length + 
        combinedResult.brokenLinks.length;

      combinedResult.success = combinedResult.metrics.criticalIssues === 0;

      console.log(`[INFO] Markdown validation completed: ${processingId} (${combinedResult.metrics.totalIssues} issues found)`);
      
      return combinedResult;

    } catch (error) {
      console.error(`[ERROR] Markdown validation failed: ${error.message}`);
      return {
        success: false,
        errors: [error.message],
        warnings: [],
        suggestions: [],
        linksChecked: 0,
        brokenLinks: [],
        styleViolations: [],
        error: error.message
      };
    }
  }

  /**
   * Lint file using Code-Linter MCP server
   */
  async lintFile(filePath, language = 'markdown') {
    try {
      console.log(`[DEBUG] Linting file: ${filePath} (${language})`);
      
      const result = await this.callMCPMethod('lint_file', {
        file_path: filePath,
        language: language,
        rules: this.config.validationRules
      });

      return {
        success: result.success !== false,
        errors: result.errors || [],
        warnings: result.warnings || [],
        suggestions: result.suggestions || [],
        fixable: result.fixable || [],
        stats: result.stats || {}
      };

    } catch (error) {
      console.error(`[ERROR] File linting failed: ${error.message}`);
      return {
        success: false,
        errors: [error.message],
        warnings: [],
        suggestions: []
      };
    }
  }

  /**
   * Check links in content
   */
  async checkLinks(content, processingId) {
    try {
      console.log(`[DEBUG] Checking links: ${processingId}`);
      
      // Extract all links from content
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

      if (links.length === 0) {
        return {
          success: true,
          linksChecked: 0,
          brokenLinks: [],
          warnings: []
        };
      }

      // Check each link
      const brokenLinks = [];
      const warnings = [];
      
      for (const link of links) {
        try {
          const isValid = await this.validateLink(link.url);
          if (!isValid) {
            brokenLinks.push({
              ...link,
              reason: 'Link not accessible or not found'
            });
          }
        } catch (error) {
          warnings.push({
            line: link.line,
            message: `Could not validate link: ${link.url} - ${error.message}`,
            url: link.url
          });
        }
      }

      return {
        success: brokenLinks.length === 0,
        linksChecked: links.length,
        brokenLinks,
        warnings
      };

    } catch (error) {
      console.error(`[ERROR] Link checking failed: ${error.message}`);
      return {
        success: false,
        linksChecked: 0,
        brokenLinks: [],
        warnings: [{ message: `Link checking failed: ${error.message}` }]
      };
    }
  }

  /**
   * Validate images in content
   */
  async validateImages(content, processingId) {
    try {
      console.log(`[DEBUG] Validating images: ${processingId}`);
      
      // Extract all image references
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

      if (images.length === 0) {
        return {
          success: true,
          imageIssues: [],
          warnings: []
        };
      }

      const imageIssues = [];
      const warnings = [];

      for (const image of images) {
        // Check if image file exists
        const imageExists = await this.validateImagePath(image.src);
        
        if (!imageExists) {
          imageIssues.push({
            ...image,
            issue: 'Image file not found',
            severity: 'error'
          });
        }

        // Check alt text
        if (!image.alt || image.alt.trim().length === 0) {
          warnings.push({
            line: image.line,
            message: `Image missing alt text: ${image.src}`,
            severity: 'warning'
          });
        }
      }

      return {
        success: imageIssues.length === 0,
        imageIssues,
        warnings,
        imagesChecked: images.length
      };

    } catch (error) {
      console.error(`[ERROR] Image validation failed: ${error.message}`);
      return {
        success: false,
        imageIssues: [{ issue: `Image validation failed: ${error.message}`, severity: 'error' }],
        warnings: []
      };
    }
  }

  /**
   * Check spelling in content
   */
  async checkSpelling(content, processingId) {
    try {
      console.log(`[DEBUG] Checking spelling: ${processingId}`);
      
      // Simple spell checking implementation
      // In a real implementation, this would use a proper spell checker
      const spellingErrors = [];
      const commonMisspellings = {
        'teh': 'the',
        'seperate': 'separate',
        'occured': 'occurred',
        'recieve': 'receive',
        'definately': 'definitely'
      };

      const words = content.toLowerCase().match(/\b[a-z]+\b/g) || [];
      const lines = content.split('\n');

      words.forEach(word => {
        if (commonMisspellings[word]) {
          // Find line number
          let lineNum = 1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(word)) {
              lineNum = i + 1;
              break;
            }
          }

          spellingErrors.push({
            word,
            suggestion: commonMisspellings[word],
            line: lineNum,
            severity: 'warning'
          });
        }
      });

      return {
        success: spellingErrors.length === 0,
        spellingErrors,
        wordsChecked: words.length
      };

    } catch (error) {
      console.error(`[ERROR] Spell checking failed: ${error.message}`);
      return {
        success: false,
        spellingErrors: [{ error: `Spell checking failed: ${error.message}` }],
        wordsChecked: 0
      };
    }
  }

  /**
   * Enforce style guide rules
   */
  async enforceStyleGuide(content, processingId) {
    try {
      console.log(`[DEBUG] Enforcing style guide: ${processingId}`);
      
      const styleViolations = [];
      const lines = content.split('\n');

      // Check various style guide rules
      lines.forEach((line, index) => {
        const lineNum = index + 1;

        // Rule: Headers should have consistent spacing
        if (line.match(/^#+\s/)) {
          const headerLevel = line.match(/^#+/)[0].length;
          if (headerLevel > 1 && !line.match(/^#+\s+\S/)) {
            styleViolations.push({
              line: lineNum,
              rule: 'header-spacing',
              message: 'Headers should have proper spacing after #',
              severity: 'warning'
            });
          }
        }

        // Rule: No trailing whitespace
        if (line.match(/\s+$/)) {
          styleViolations.push({
            line: lineNum,
            rule: 'trailing-whitespace',
            message: 'Line has trailing whitespace',
            severity: 'warning'
          });
        }

        // Rule: Line length (soft limit)
        if (line.length > 120 && !line.match(/^\s*\|/) && !line.match(/^```/)) {
          styleViolations.push({
            line: lineNum,
            rule: 'line-length',
            message: `Line too long (${line.length} characters, limit: 120)`,
            severity: 'info'
          });
        }

        // Rule: Consistent list formatting
        if (line.match(/^\s*[-*+]\s/)) {
          if (!line.match(/^\s*[-*+]\s+\S/)) {
            styleViolations.push({
              line: lineNum,
              rule: 'list-formatting',
              message: 'List items should have proper spacing',
              severity: 'warning'
            });
          }
        }
      });

      // Check for consistent heading hierarchy
      const headings = content.match(/^#+\s+.+$/gm) || [];
      let lastLevel = 0;
      
      headings.forEach(heading => {
        const level = heading.match(/^#+/)[0].length;
        if (level > lastLevel + 1) {
          const lineNum = content.split('\n').findIndex(line => line === heading) + 1;
          styleViolations.push({
            line: lineNum,
            rule: 'heading-hierarchy',
            message: `Heading level jump from ${lastLevel} to ${level} - consider intermediate levels`,
            severity: 'info'
          });
        }
        lastLevel = level;
      });

      return {
        success: styleViolations.filter(v => v.severity === 'error').length === 0,
        styleViolations,
        rulesChecked: ['header-spacing', 'trailing-whitespace', 'line-length', 'list-formatting', 'heading-hierarchy']
      };

    } catch (error) {
      console.error(`[ERROR] Style guide enforcement failed: ${error.message}`);
      return {
        success: false,
        styleViolations: [{ error: `Style guide check failed: ${error.message}` }],
        rulesChecked: []
      };
    }
  }

  /**
   * Validate a single link
   */
  async validateLink(url) {
    try {
      // Skip validation for certain URL types
      if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('javascript:')) {
        return true;
      }

      // For HTTP/HTTPS URLs, we would normally make a HEAD request
      if (url.startsWith('http')) {
        // Simplified validation - in real implementation would use HTTP client
        return true; // Assume valid for now
      }

      // For local files, check if they exist
      if (!url.startsWith('http')) {
        const possiblePaths = [
          path.resolve(url),
          path.resolve('/home/dev/workspace', url),
          path.resolve('/home/dev/workspace/docs', url)
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
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Validate image path
   */
  async validateImagePath(imagePath) {
    try {
      const possiblePaths = [
        path.resolve(imagePath),
        path.resolve('/home/dev/workspace', imagePath),
        path.resolve('/home/dev/workspace/assets', imagePath),
        path.resolve('/home/dev/workspace/docs/images', imagePath)
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

  /**
   * Call MCP method with error handling and retries
   */
  async callMCPMethod(method, params, retryCount = 0) {
    try {
      console.log(`[DEBUG] Calling Code-Linter MCP method: ${method}`);
      
      // Create temporary input file
      const inputFile = path.join(this.config.tempDir, `input_${Date.now()}_${retryCount}.json`);
      const outputFile = path.join(this.config.tempDir, `output_${Date.now()}_${retryCount}.json`);
      
      const mcpRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params
      };

      await fs.writeFile(inputFile, JSON.stringify(mcpRequest, null, 2));

      // Execute MCP call through wrapper script
      const result = await this.executeCommand(this.config.wrapperScript, [
        '--input', inputFile,
        '--output', outputFile,
        '--method', method
      ]);

      // Read result
      let response;
      try {
        const outputContent = await fs.readFile(outputFile, 'utf8');
        response = JSON.parse(outputContent);
      } catch (parseError) {
        // If JSON parsing fails, create a basic response
        response = {
          result: {
            success: result.code === 0,
            errors: result.code !== 0 ? [result.stderr || 'Unknown error'] : [],
            warnings: [],
            suggestions: []
          }
        };
      }

      // Cleanup temp files
      try {
        await fs.unlink(inputFile);
        await fs.unlink(outputFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return response.result || response;

    } catch (error) {
      if (retryCount < this.config.maxRetries) {
        console.warn(`[WARN] MCP call failed, retrying (${retryCount + 1}/${this.config.maxRetries}): ${error.message}`);
        await this.delay(1000 * (retryCount + 1)); // Exponential backoff
        return this.callMCPMethod(method, params, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Execute shell command with timeout
   */
  async executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      child.on('error', (error) => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });
    });
  }

  /**
   * Utility methods
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      connectionTested: this.connectionTested,
      supportedLanguages: this.supportedLanguages,
      config: {
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        validationRules: this.config.validationRules
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('[INFO] Cleaning up Code-Linter MCP client resources...');
    
    try {
      // Clean up temp directory
      const files = await fs.readdir(this.config.tempDir);
      for (const file of files) {
        if (file.startsWith('input_') || file.startsWith('output_') || file.endsWith('_validation.md')) {
          await fs.unlink(path.join(this.config.tempDir, file));
        }
      }
    } catch (error) {
      console.warn(`[WARN] Cleanup failed: ${error.message}`);
    }
  }
}

module.exports = { CodeLinterMCPClient };
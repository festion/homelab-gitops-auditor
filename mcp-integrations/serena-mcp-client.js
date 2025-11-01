/**
 * Serena MCP Client Integration
 * Provides content enhancement capabilities through MCP protocol
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class SerenaMCPClient {
  constructor(config = {}) {
    this.config = {
      wrapperScript: config.wrapperScript || '/home/dev/workspace/serena-enhanced-wrapper.sh',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 2,
      tempDir: config.tempDir || '/tmp/serena-mcp',
      ...config
    };
    this.isConnected = false;
    this.connectionTested = false;
  }

  /**
   * Initialize connection to Serena MCP server
   */
  async initialize() {
    console.log('[INFO] Initializing Serena MCP client...');
    
    // Create temp directory
    await fs.mkdir(this.config.tempDir, { recursive: true });
    
    // Test connection
    await this.testConnection();
    
    console.log('[INFO] Serena MCP client initialized successfully');
  }

  /**
   * Test connection to Serena MCP server
   */
  async testConnection() {
    if (this.connectionTested) {
      return this.isConnected;
    }

    try {
      console.log('[INFO] Testing Serena MCP server connection...');
      
      // Simple test to see if the server responds
      const testResult = await this.callMCPMethod('check_onboarding_performed', {});
      
      this.isConnected = testResult.success;
      this.connectionTested = true;
      
      if (this.isConnected) {
        console.log('[INFO] Serena MCP server connection: OK');
      } else {
        console.warn('[WARN] Serena MCP server connection: FAILED');
      }
      
      return this.isConnected;
      
    } catch (error) {
      console.warn(`[WARN] Serena MCP connection test failed: ${error.message}`);
      this.isConnected = false;
      this.connectionTested = true;
      return false;
    }
  }

  /**
   * Enhance content for grammar and clarity
   */
  async enhanceGrammarAndClarity(content, processingId) {
    console.log(`[INFO] Enhancing grammar and clarity: ${processingId}`);
    
    try {
      const prompt = `Please review and improve the following content for grammar, clarity, and technical writing quality while preserving all technical accuracy and meaning:

${content}

Focus on:
- Grammar and spelling corrections
- Clarity improvements
- Better word choices
- Sentence structure optimization
- Technical writing best practices

Return the improved content without explanatory text.`;

      const result = await this.callMCPMethod('think_about_collected_information', {
        content,
        prompt,
        processingId
      });

      return {
        enhanced: result.enhancedContent || content,
        improvements: result.improvements || [],
        suggestions: result.suggestions || [],
        processingTime: result.processingTime || 0
      };

    } catch (error) {
      console.error(`[ERROR] Grammar enhancement failed: ${error.message}`);
      return {
        enhanced: content,
        improvements: [],
        suggestions: [],
        error: error.message
      };
    }
  }

  /**
   * Optimize document structure and organization
   */
  async optimizeStructure(content, processingId) {
    console.log(`[INFO] Optimizing document structure: ${processingId}`);
    
    try {
      const prompt = `Please review and optimize the structure and organization of this document:

${content}

Focus on:
- Logical flow and organization
- Heading hierarchy and consistency
- Paragraph structure
- Section organization
- Information architecture
- Reader navigation

Return the restructured content without explanatory text.`;

      const result = await this.callMCPMethod('think_about_task_adherence', {
        content,
        prompt,
        processingId
      });

      return {
        enhanced: result.enhancedContent || content,
        structuralChanges: result.structuralChanges || [],
        improvements: result.improvements || [],
        processingTime: result.processingTime || 0
      };

    } catch (error) {
      console.error(`[ERROR] Structure optimization failed: ${error.message}`);
      return {
        enhanced: content,
        structuralChanges: [],
        improvements: [],
        error: error.message
      };
    }
  }

  /**
   * Add relevant cross-references and internal links
   */
  async enhanceLinking(content, processingId) {
    console.log(`[INFO] Enhancing internal linking: ${processingId}`);
    
    try {
      const prompt = `Please review this content and add relevant cross-references and internal links where appropriate:

${content}

Focus on:
- Adding internal links to related sections
- Cross-referencing related concepts
- Improving navigation between sections
- Adding appropriate anchor links
- Maintaining link consistency

Return the content with enhanced linking without explanatory text.`;

      const result = await this.callMCPMethod('find_referencing_symbols', {
        content,
        prompt,
        processingId
      });

      return {
        enhanced: result.enhancedContent || content,
        linksAdded: result.linksAdded || [],
        crossReferences: result.crossReferences || [],
        processingTime: result.processingTime || 0
      };

    } catch (error) {
      console.error(`[ERROR] Linking enhancement failed: ${error.message}`);
      return {
        enhanced: content,
        linksAdded: [],
        crossReferences: [],
        error: error.message
      };
    }
  }

  /**
   * Generate content summary
   */
  async generateSummary(content, processingId, maxWords = 150) {
    console.log(`[INFO] Generating content summary: ${processingId}`);
    
    try {
      const prompt = `Please create a concise summary of the following content in no more than ${maxWords} words:

${content}

Focus on:
- Key points and main concepts
- Important technical details
- Actionable information
- Essential takeaways

Return only the summary without additional text.`;

      const result = await this.callMCPMethod('summarize_changes', {
        content,
        prompt,
        maxWords,
        processingId
      });

      return {
        summary: result.summary || '',
        keyPoints: result.keyPoints || [],
        wordCount: result.wordCount || 0,
        processingTime: result.processingTime || 0
      };

    } catch (error) {
      console.error(`[ERROR] Summary generation failed: ${error.message}`);
      return {
        summary: '',
        keyPoints: [],
        wordCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Comprehensive content enhancement
   */
  async enhanceContent(content, options = {}) {
    const processingId = options.processingId || this.generateId();
    const enhancements = {
      grammar: options.enhanceGrammar !== false,
      structure: options.optimizeStructure !== false,
      linking: options.enhanceLinking !== false,
      summary: options.generateSummary !== false
    };

    console.log(`[INFO] Starting comprehensive content enhancement: ${processingId}`);
    
    let enhancedContent = content;
    const results = {
      originalLength: content.length,
      improvements: [],
      warnings: [],
      processingSteps: []
    };

    try {
      // Step 1: Grammar and clarity
      if (enhancements.grammar) {
        const grammarResult = await this.enhanceGrammarAndClarity(enhancedContent, processingId);
        if (!grammarResult.error) {
          enhancedContent = grammarResult.enhanced;
          results.improvements.push(...grammarResult.improvements);
          results.processingSteps.push({
            step: 'grammar',
            success: true,
            changes: grammarResult.improvements.length
          });
        } else {
          results.warnings.push(`Grammar enhancement failed: ${grammarResult.error}`);
        }
      }

      // Step 2: Structure optimization
      if (enhancements.structure) {
        const structureResult = await this.optimizeStructure(enhancedContent, processingId);
        if (!structureResult.error) {
          enhancedContent = structureResult.enhanced;
          results.improvements.push(...structureResult.improvements);
          results.processingSteps.push({
            step: 'structure',
            success: true,
            changes: structureResult.structuralChanges.length
          });
        } else {
          results.warnings.push(`Structure optimization failed: ${structureResult.error}`);
        }
      }

      // Step 3: Link enhancement
      if (enhancements.linking) {
        const linkingResult = await this.enhanceLinking(enhancedContent, processingId);
        if (!linkingResult.error) {
          enhancedContent = linkingResult.enhanced;
          results.improvements.push(...linkingResult.linksAdded);
          results.processingSteps.push({
            step: 'linking',
            success: true,
            changes: linkingResult.linksAdded.length
          });
        } else {
          results.warnings.push(`Link enhancement failed: ${linkingResult.error}`);
        }
      }

      // Step 4: Summary generation
      if (enhancements.summary) {
        const summaryResult = await this.generateSummary(content, processingId);
        if (!summaryResult.error && summaryResult.summary) {
          results.summary = summaryResult.summary;
          results.keyPoints = summaryResult.keyPoints;
          results.processingSteps.push({
            step: 'summary',
            success: true,
            wordCount: summaryResult.wordCount
          });
        } else {
          results.warnings.push(`Summary generation failed: ${summaryResult.error || 'No summary generated'}`);
        }
      }

      results.enhancedContent = enhancedContent;
      results.finalLength = enhancedContent.length;
      results.lengthChange = results.finalLength - results.originalLength;
      results.success = true;

      console.log(`[INFO] Content enhancement completed: ${processingId} (${results.improvements.length} improvements)`);
      return results;

    } catch (error) {
      console.error(`[ERROR] Content enhancement failed: ${error.message}`);
      return {
        ...results,
        enhancedContent: content,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Call MCP method with error handling and retries
   */
  async callMCPMethod(method, params, retryCount = 0) {
    try {
      console.log(`[DEBUG] Calling Serena MCP method: ${method}`);
      
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
        // If JSON parsing fails, treat stdout as the result
        response = {
          result: {
            success: result.code === 0,
            enhancedContent: result.stdout,
            processingTime: 1000
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
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });
    });
  }

  /**
   * Utility methods
   */
  generateId() {
    return `serena_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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
      config: {
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        wrapperScript: this.config.wrapperScript
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('[INFO] Cleaning up Serena MCP client resources...');
    
    try {
      // Clean up temp directory
      const files = await fs.readdir(this.config.tempDir);
      for (const file of files) {
        if (file.startsWith('input_') || file.startsWith('output_')) {
          await fs.unlink(path.join(this.config.tempDir, file));
        }
      }
    } catch (error) {
      console.warn(`[WARN] Cleanup failed: ${error.message}`);
    }
  }
}

module.exports = { SerenaMCPClient };
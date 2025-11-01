#!/usr/bin/env node
/**
 * WikiJS AI Content Processor CLI
 * Command-line interface for the content processing pipeline
 */

const fs = require('fs').promises;
const path = require('path');
const { WikiJSContentProcessor, DEFAULT_CONFIG } = require('./wikijs-ai-content-processor.js');

class ContentProcessorCLI {
  constructor() {
    this.processor = null;
    this.configFile = '/home/dev/workspace/content-processor-config.json';
  }

  /**
   * Parse command line arguments
   */
  parseArgs(args) {
    const options = {
      command: 'help',
      input: null,
      output: null,
      config: this.configFile,
      upload: false,
      wikiPath: null,
      batch: false,
      verbose: false
    };

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case 'process':
        case 'batch':
        case 'test':
        case 'status':
        case 'metrics':
        case 'config':
          options.command = arg;
          break;
        case '-i':
        case '--input':
          options.input = args[++i];
          break;
        case '-o':
        case '--output':
          options.output = args[++i];
          break;
        case '-c':
        case '--config':
          options.config = args[++i];
          break;
        case '-u':
        case '--upload':
          options.upload = true;
          break;
        case '-w':
        case '--wiki-path':
          options.wikiPath = args[++i];
          break;
        case '-v':
        case '--verbose':
          options.verbose = true;
          break;
        case '-h':
        case '--help':
          options.command = 'help';
          break;
        default:
          if (!options.input && !arg.startsWith('-')) {
            options.input = arg;
          }
      }
    }

    return options;
  }

  /**
   * Load configuration from file
   */
  async loadConfig(configPath) {
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[INFO] Config file not found, creating default: ${configPath}`);
        await this.saveConfig(configPath, DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(configPath, config) {
    const configJson = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, configJson);
  }

  /**
   * Initialize processor with configuration
   */
  async initializeProcessor(config) {
    this.processor = new WikiJSContentProcessor(config);
    await this.processor.initialize();
  }

  /**
   * Process a single file
   */
  async processFile(inputPath, outputPath, options = {}) {
    console.log(`[INFO] Processing file: ${inputPath}`);
    
    const result = await this.processor.processDocument(inputPath, options);
    
    if (result.success) {
      // Save processed content
      if (outputPath) {
        await fs.writeFile(outputPath, result.content);
        console.log(`[INFO] Processed content saved to: ${outputPath}`);
      }
      
      // Upload to WikiJS if requested
      if (options.upload && options.wikiPath) {
        try {
          const uploadResult = await this.processor.uploadToWikiJS(
            result.content,
            options.wikiPath,
            {
              title: path.basename(inputPath, '.md'),
              processingReport: result.report
            }
          );
          
          if (uploadResult.success) {
            console.log(`[INFO] Content uploaded to WikiJS: ${options.wikiPath}`);
          } else {
            console.error(`[ERROR] WikiJS upload failed: ${uploadResult.error}`);
          }
        } catch (uploadError) {
          console.error(`[ERROR] WikiJS upload failed: ${uploadError.message}`);
        }
      }
      
      // Display processing report
      this.displayReport(result.report);
      
    } else {
      console.error(`[ERROR] Processing failed: ${result.error}`);
      return 1;
    }
    
    return 0;
  }

  /**
   * Process multiple files in batch
   */
  async processBatch(inputPattern, options = {}) {
    console.log(`[INFO] Processing batch: ${inputPattern}`);
    
    const { glob } = require('glob');
    const files = await glob(inputPattern);
    
    if (files.length === 0) {
      console.log(`[WARN] No files found matching pattern: ${inputPattern}`);
      return 0;
    }
    
    console.log(`[INFO] Found ${files.length} files to process`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        const outputPath = options.output ? 
          path.join(options.output, path.basename(file)) : 
          null;
          
        const wikiPath = options.wikiPath ?
          `${options.wikiPath}/${path.basename(file, '.md')}` :
          null;
        
        const result = await this.processFile(file, outputPath, {
          ...options,
          wikiPath
        });
        
        if (result === 0) {
          successCount++;
        } else {
          errorCount++;
        }
        
        results.push({
          file,
          success: result === 0
        });
        
      } catch (error) {
        console.error(`[ERROR] Failed to process ${file}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`[INFO] Batch processing completed: ${successCount} successful, ${errorCount} failed`);
    return errorCount === 0 ? 0 : 1;
  }

  /**
   * Test MCP connections and system status
   */
  async testSystem() {
    console.log('[INFO] Testing WikiJS Content Processor system...');
    
    try {
      await this.processor.testMCPConnections();
      
      const status = this.processor.getMetrics();
      console.log('\n=== System Status ===');
      console.log(`Serena MCP: ${status.mcpStatus.serenaConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
      console.log(`Code-Linter MCP: ${status.mcpStatus.linterConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
      
      // Test processing with a simple document
      const testContent = '# Test Document\n\nThis is a test document for validation.';
      const testFile = '/tmp/test-document.md';
      await fs.writeFile(testFile, testContent);
      
      console.log('\n=== Processing Test ===');
      const result = await this.processor.processDocument(testFile);
      
      if (result.success) {
        console.log('[INFO] Test processing: SUCCESS');
        console.log(`Quality Score: ${result.qualityScore.overall}/10`);
      } else {
        console.log('[ERROR] Test processing: FAILED');
      }
      
      // Cleanup test file
      await fs.unlink(testFile).catch(() => {});
      
      return result.success ? 0 : 1;
      
    } catch (error) {
      console.error(`[ERROR] System test failed: ${error.message}`);
      return 1;
    }
  }

  /**
   * Display processing metrics
   */
  async showMetrics() {
    const metrics = this.processor.getMetrics();
    
    console.log('\n=== Processing Metrics ===');
    console.log(`Total Processed: ${metrics.totalProcessed}`);
    console.log(`Success Rate: ${metrics.successRate}`);
    console.log(`Average Processing Time: ${metrics.averageProcessingTime}ms`);
    console.log(`Error Count: ${metrics.errorCount}`);
    
    console.log('\n=== MCP Status ===');
    console.log(`Serena MCP: ${metrics.mcpStatus.serenaConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`Code-Linter MCP: ${metrics.mcpStatus.linterConnected ? 'Connected' : 'Disconnected'}`);
    
    if (metrics.qualityImprovements.length > 0) {
      console.log('\n=== Recent Quality Improvements ===');
      metrics.qualityImprovements.slice(-5).forEach(improvement => {
        console.log(`${improvement.processingId}: Score ${improvement.score}/10`);
      });
    }
    
    return 0;
  }

  /**
   * Display processing report
   */
  displayReport(report) {
    console.log('\n=== Processing Report ===');
    console.log(`Processing ID: ${report.processingId}`);
    console.log(`Quality Score: ${report.qualityScore.overall}/10`);
    console.log(`Processing Time: ${report.processingTime}ms`);
    console.log(`Word Count: ${report.documentAnalysis.wordCount}`);
    console.log(`Document Type: ${report.documentAnalysis.documentType}`);
    
    if (report.validationResults.errorCount > 0) {
      console.log(`\n⚠️  Validation Errors: ${report.validationResults.errorCount}`);
    }
    
    if (report.validationResults.warningCount > 0) {
      console.log(`⚠️  Validation Warnings: ${report.validationResults.warningCount}`);
    }
    
    if (report.validationResults.brokenLinks > 0) {
      console.log(`🔗 Broken Links: ${report.validationResults.brokenLinks}`);
    }
    
    if (report.recommendations && report.recommendations.length > 0) {
      console.log('\n=== Recommendations ===');
      report.recommendations.forEach(rec => {
        console.log(`• ${rec}`);
      });
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
WikiJS AI Content Processor CLI

USAGE:
  node wikijs-content-processor-cli.js <command> [options]

COMMANDS:
  process <file>     Process a single markdown file
  batch <pattern>    Process multiple files matching pattern
  test              Test system and MCP connections
  status            Show processor status
  metrics           Display processing metrics
  config            Show current configuration
  help              Show this help message

OPTIONS:
  -i, --input <file>       Input file or pattern
  -o, --output <path>      Output directory or file
  -c, --config <file>      Configuration file path
  -u, --upload             Upload to WikiJS after processing
  -w, --wiki-path <path>   WikiJS target path for upload
  -v, --verbose            Verbose output
  -h, --help               Show help

EXAMPLES:
  # Process a single file
  node wikijs-content-processor-cli.js process document.md

  # Process and upload to WikiJS
  node wikijs-content-processor-cli.js process document.md -u -w /docs/document

  # Batch process all markdown files
  node wikijs-content-processor-cli.js batch "*.md" -o ./processed/

  # Test system
  node wikijs-content-processor-cli.js test

  # Show metrics
  node wikijs-content-processor-cli.js metrics
`);
    return 0;
  }

  /**
   * Main entry point
   */
  async run(args) {
    const options = this.parseArgs(args);
    
    try {
      // Load configuration
      const config = await this.loadConfig(options.config);
      
      // Initialize processor for most commands
      if (options.command !== 'help') {
        await this.initializeProcessor(config);
      }
      
      let exitCode = 0;
      
      switch (options.command) {
        case 'process':
          if (!options.input) {
            console.error('[ERROR] Input file required for process command');
            exitCode = 1;
          } else {
            exitCode = await this.processFile(options.input, options.output, {
              upload: options.upload,
              wikiPath: options.wikiPath,
              verbose: options.verbose
            });
          }
          break;
          
        case 'batch':
          if (!options.input) {
            console.error('[ERROR] Input pattern required for batch command');
            exitCode = 1;
          } else {
            exitCode = await this.processBatch(options.input, {
              output: options.output,
              upload: options.upload,
              wikiPath: options.wikiPath,
              verbose: options.verbose
            });
          }
          break;
          
        case 'test':
          exitCode = await this.testSystem();
          break;
          
        case 'status':
        case 'metrics':
          exitCode = await this.showMetrics();
          break;
          
        case 'config':
          console.log(JSON.stringify(config, null, 2));
          break;
          
        case 'help':
        default:
          exitCode = this.showHelp();
          break;
      }
      
      // Cleanup
      if (this.processor) {
        await this.processor.cleanup();
      }
      
      return exitCode;
      
    } catch (error) {
      console.error(`[ERROR] ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      return 1;
    }
  }
}

// Main execution
if (require.main === module) {
  const cli = new ContentProcessorCLI();
  cli.run(process.argv).then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error(`[FATAL] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ContentProcessorCLI };
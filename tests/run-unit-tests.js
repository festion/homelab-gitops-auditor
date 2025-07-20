#!/usr/bin/env node

/**
 * Unit Test Runner Script
 * Runs comprehensive unit tests for the homelab-gitops-auditor project
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class UnitTestRunner {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.testConfig = path.resolve(__dirname, 'jest.unit.config.js');
    this.coverageThreshold = 95;
    this.maxWorkers = process.env.CI ? 2 : '50%';
    
    this.testSuites = {
      deployment: 'tests/unit/deployment/**/*.test.js',
      mcp: 'tests/unit/mcp/**/*.test.js',
      'health-checks': 'tests/unit/health-checks/**/*.test.js',
      backup: 'tests/unit/backup/**/*.test.js',
      security: 'tests/unit/security/**/*.test.js',
      utils: 'tests/unit/utils/**/*.test.js',
      all: 'tests/unit/**/*.test.js'
    };
  }

  async run(options = {}) {
    console.log('🧪 Starting Unit Test Suite for homelab-gitops-auditor');
    console.log('=' + '='.repeat(60));
    
    try {
      // Validate test environment
      await this.validateEnvironment();
      
      // Run tests
      const suite = options.suite || 'all';
      const results = await this.runTestSuite(suite, options);
      
      // Generate reports
      if (options.coverage) {
        await this.generateCoverageReport();
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Unit tests completed successfully!');
      console.log(`📊 Coverage: ${results.coverage}%`);
      console.log(`🎯 Tests: ${results.passed}/${results.total} passed`);
      
      return results;
      
    } catch (error) {
      console.error('\n❌ Unit tests failed!');
      console.error(error.message);
      process.exit(1);
    }
  }

  async validateEnvironment() {
    console.log('🔍 Validating test environment...');
    
    // Check if Jest config exists
    if (!fs.existsSync(this.testConfig)) {
      throw new Error(`Jest config not found: ${this.testConfig}`);
    }
    
    // Check if test directories exist
    const testDir = path.resolve(this.projectRoot, 'tests/unit');
    if (!fs.existsSync(testDir)) {
      throw new Error(`Test directory not found: ${testDir}`);
    }
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
    
    console.log('✅ Environment validation passed');
  }

  async runTestSuite(suiteName, options = {}) {
    const testPattern = this.testSuites[suiteName];
    if (!testPattern) {
      throw new Error(`Unknown test suite: ${suiteName}. Available: ${Object.keys(this.testSuites).join(', ')}`);
    }

    console.log(`\n📋 Running test suite: ${suiteName}`);
    console.log(`🎯 Pattern: ${testPattern}`);
    
    const jestArgs = this.buildJestArgs(testPattern, options);
    
    return new Promise((resolve, reject) => {
      const jest = spawn('npx', ['jest', ...jestArgs], {
        cwd: this.projectRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          FORCE_COLOR: '1'
        }
      });

      let testResults = {
        passed: 0,
        total: 0,
        coverage: 0
      };

      jest.on('close', (code) => {
        if (code === 0) {
          resolve(testResults);
        } else {
          reject(new Error(`Jest exited with code ${code}`));
        }
      });

      jest.on('error', (error) => {
        reject(new Error(`Failed to run Jest: ${error.message}`));
      });
    });
  }

  buildJestArgs(testPattern, options) {
    const args = [
      '--config', this.testConfig,
      '--maxWorkers', this.maxWorkers
    ];

    // Add test pattern matching
    if (testPattern && testPattern !== 'tests/unit/**/*.test.js') {
      args.push('--testPathPatterns', testPattern);
    }

    if (options.coverage) {
      args.push('--coverage');
      args.push('--coverageThreshold', JSON.stringify({
        global: {
          branches: this.coverageThreshold,
          functions: this.coverageThreshold,
          lines: this.coverageThreshold,
          statements: this.coverageThreshold
        }
      }));
    }

    if (options.watch) {
      args.push('--watch');
    }

    if (options.watchAll) {
      args.push('--watchAll');
    }

    if (options.bail) {
      args.push('--bail');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    if (options.silent) {
      args.push('--silent');
    }

    if (options.updateSnapshots) {
      args.push('--updateSnapshot');
    }

    if (options.detectOpenHandles) {
      args.push('--detectOpenHandles');
    }

    if (options.forceExit) {
      args.push('--forceExit');
    }

    return args;
  }

  async generateCoverageReport() {
    console.log('\n📊 Generating coverage report...');
    
    const coverageDir = path.resolve(this.projectRoot, 'tests/coverage/unit');
    const reportPath = path.resolve(coverageDir, 'index.html');
    
    if (fs.existsSync(reportPath)) {
      console.log(`📈 Coverage report generated: ${reportPath}`);
      console.log(`🌐 Open in browser: file://${reportPath}`);
    }
  }

  printUsage() {
    console.log(`
🧪 Unit Test Runner for homelab-gitops-auditor

Usage: node tests/run-unit-tests.js [options]

Test Suites:
  --suite <name>     Run specific test suite (default: all)
                     Available: ${Object.keys(this.testSuites).join(', ')}

Options:
  --coverage         Generate coverage report (default: false)
  --watch            Watch mode for development
  --bail             Stop after first test failure
  --verbose          Verbose output
  --silent           Minimal output
  --update-snapshots Update Jest snapshots
  --detect-handles   Detect open handles
  --force-exit       Force exit after tests

Examples:
  node tests/run-unit-tests.js --suite deployment --coverage
  node tests/run-unit-tests.js --suite mcp --watch
  node tests/run-unit-tests.js --coverage --bail
  node tests/run-unit-tests.js --suite health-checks --verbose
`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--suite':
        options.suite = args[++i];
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--watch-all':
        options.watchAll = true;
        break;
      case '--bail':
        options.bail = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--update-snapshots':
        options.updateSnapshots = true;
        break;
      case '--detect-handles':
        options.detectOpenHandles = true;
        break;
      case '--force-exit':
        options.forceExit = true;
        break;
      case '--help':
      case '-h':
        new UnitTestRunner().printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`⚠️  Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const runner = new UnitTestRunner();
  
  runner.run(options).catch((error) => {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  });
}

module.exports = UnitTestRunner;
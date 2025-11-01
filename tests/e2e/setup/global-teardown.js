const fs = require('fs').promises;
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Starting E2E Test Global Teardown...');
  
  try {
    // Get global test environment
    const testEnv = global.__E2E_TEST_ENV__;
    const monitoring = global.__MONITORING_UTILS__;
    
    // Generate final test report
    if (monitoring) {
      console.log('📊 Generating final test metrics report...');
      try {
        await monitoring.saveMetricsReport('global-e2e-session');
        console.log('✅ Final metrics report saved');
      } catch (error) {
        console.warn('⚠️  Failed to save final metrics report:', error.message);
      }
    }
    
    // Cleanup test environment
    if (testEnv) {
      console.log('🔧 Cleaning up test environment...');
      try {
        await testEnv.cleanup();
        console.log('✅ Test environment cleaned up');
      } catch (error) {
        console.error('❌ Failed to cleanup test environment:', error.message);
      }
    }
    
    // Archive test results
    console.log('📦 Archiving test results...');
    await archiveTestResults();
    
    // Generate summary report
    console.log('📝 Generating test summary...');
    await generateTestSummary();
    
    // Cleanup global references
    delete global.__E2E_TEST_ENV__;
    delete global.__GITHUB_SIMULATOR__;
    delete global.__MONITORING_UTILS__;
    delete global.__BASELINE_DEPLOYMENT_ID__;
    
    console.log('✅ E2E Test Global Teardown completed successfully');
    
  } catch (error) {
    console.error('❌ E2E Test Global Teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}

async function archiveTestResults() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = path.join(process.cwd(), 'test-results', 'archives', timestamp);
    
    await fs.mkdir(archiveDir, { recursive: true });
    
    // Copy current test results to archive
    const resultsDirs = ['screenshots', 'logs', 'metrics', 'artifacts', 'reports'];
    
    for (const dir of resultsDirs) {
      const sourceDir = path.join(process.cwd(), 'test-results', dir);
      const targetDir = path.join(archiveDir, dir);
      
      try {
        await fs.mkdir(targetDir, { recursive: true });
        
        // Copy files from source to target
        const files = await fs.readdir(sourceDir).catch(() => []);
        for (const file of files) {
          const sourcePath = path.join(sourceDir, file);
          const targetPath = path.join(targetDir, file);
          
          try {
            await fs.copyFile(sourcePath, targetPath);
          } catch (error) {
            console.warn(`Failed to copy ${file}:`, error.message);
          }
        }
      } catch (error) {
        console.warn(`Failed to archive ${dir}:`, error.message);
      }
    }
    
    console.log(`✅ Test results archived to: ${archiveDir}`);
    
  } catch (error) {
    console.warn('⚠️  Failed to archive test results:', error.message);
  }
}

async function generateTestSummary() {
  try {
    const summaryData = {
      timestamp: new Date().toISOString(),
      duration: null,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      services: {
        api: 'http://localhost:3000',
        dashboard: 'http://localhost:8080',
        mcp: 'http://localhost:8081',
        homeassistant: 'http://localhost:8123'
      },
      testResults: await collectTestResults(),
      artifacts: await collectArtifacts()
    };
    
    // Calculate duration if setup timestamp is available
    try {
      const setupFile = path.join(process.cwd(), 'test-results', 'setup-complete.json');
      const setupData = JSON.parse(await fs.readFile(setupFile, 'utf8'));
      const setupTime = new Date(setupData.timestamp).getTime();
      const endTime = new Date().getTime();
      summaryData.duration = endTime - setupTime;
    } catch (error) {
      // Duration calculation failed, continue without it
    }
    
    // Save summary as JSON
    const summaryPath = path.join(process.cwd(), 'test-results', 'e2e-test-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2));
    
    // Generate human-readable summary
    const readableSummary = generateReadableSummary(summaryData);
    const readablePath = path.join(process.cwd(), 'test-results', 'E2E-TEST-SUMMARY.md');
    await fs.writeFile(readablePath, readableSummary);
    
    console.log('✅ Test summary generated');
    
  } catch (error) {
    console.warn('⚠️  Failed to generate test summary:', error.message);
  }
}

async function collectTestResults() {
  const results = {
    totalFiles: 0,
    screenshots: 0,
    logFiles: 0,
    metricFiles: 0,
    reportFiles: 0
  };
  
  try {
    const resultsDirs = {
      screenshots: 'screenshots',
      logFiles: 'logs',
      metricFiles: 'metrics',
      reportFiles: 'reports'
    };
    
    for (const [key, dir] of Object.entries(resultsDirs)) {
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'test-results', dir));
        results[key] = files.length;
        results.totalFiles += files.length;
      } catch (error) {
        results[key] = 0;
      }
    }
    
  } catch (error) {
    console.warn('Failed to collect test results:', error.message);
  }
  
  return results;
}

async function collectArtifacts() {
  const artifacts = [];
  
  try {
    const artifactsDir = path.join(process.cwd(), 'test-results', 'artifacts');
    const files = await fs.readdir(artifactsDir).catch(() => []);
    
    for (const file of files) {
      const filePath = path.join(artifactsDir, file);
      try {
        const stats = await fs.stat(filePath);
        artifacts.push({
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      } catch (error) {
        // Skip files that can't be stat'd
      }
    }
    
  } catch (error) {
    console.warn('Failed to collect artifacts:', error.message);
  }
  
  return artifacts;
}

function generateReadableSummary(summaryData) {
  const duration = summaryData.duration ? 
    `${Math.round(summaryData.duration / 1000)} seconds` : 
    'Unknown';
    
  return `# E2E Test Summary

## Test Session Information
- **Date**: ${new Date(summaryData.timestamp).toLocaleString()}
- **Duration**: ${duration}
- **Node Version**: ${summaryData.environment.node}
- **Platform**: ${summaryData.environment.platform} (${summaryData.environment.arch})

## Services Tested
- **API Server**: ${summaryData.services.api}
- **Dashboard**: ${summaryData.services.dashboard}
- **MCP Server**: ${summaryData.services.mcp}
- **Home Assistant**: ${summaryData.services.homeassistant}

## Test Results
- **Total Files Generated**: ${summaryData.testResults.totalFiles}
- **Screenshots**: ${summaryData.testResults.screenshots}
- **Log Files**: ${summaryData.testResults.logFiles}
- **Metric Files**: ${summaryData.testResults.metricFiles}
- **Report Files**: ${summaryData.testResults.reportFiles}

## Test Artifacts
${summaryData.artifacts.length > 0 ? 
  summaryData.artifacts.map(artifact => 
    `- **${artifact.name}** (${(artifact.size / 1024).toFixed(1)} KB) - Modified: ${new Date(artifact.modified).toLocaleString()}`
  ).join('\n') : 
  'No artifacts generated'
}

## Test Coverage Areas
- ✅ Complete deployment workflows
- ✅ Rollback scenarios and failure handling
- ✅ Dashboard integration and UI testing
- ✅ Security workflows and validation
- ✅ Performance and reliability testing

## Notes
This summary was automatically generated at the end of the E2E test session.
For detailed test results, check the individual report files in the test-results directory.
`;
}

module.exports = {
  globalTeardown
};
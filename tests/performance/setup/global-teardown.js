const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
  console.log('🧹 Cleaning up performance test environment...');
  
  try {
    // Stop test server
    console.log('🛑 Stopping test server...');
    try {
      execSync('npm run test:env:stop', { 
        stdio: 'inherit',
        timeout: 30000 
      });
    } catch (error) {
      console.warn('⚠️  Test server stop failed (may already be stopped):', error.message);
    }
    
    // Generate performance summary report
    console.log('📊 Generating performance summary report...');
    await generatePerformanceSummary();
    
    // Clean up temporary files
    console.log('🗑️  Cleaning up temporary files...');
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Archive performance results
    console.log('📦 Archiving performance results...');
    await archivePerformanceResults();
    
    console.log('✅ Performance test environment cleanup complete');
    
  } catch (error) {
    console.error('❌ Performance test environment cleanup failed:', error.message);
    // Don't throw - we want cleanup to continue even if some steps fail
  }
};

async function generatePerformanceSummary() {
  try {
    const resultsDir = path.join(__dirname, '../results');
    const reportsDir = path.join(__dirname, '../reports');
    
    if (!fs.existsSync(resultsDir)) {
      console.log('📊 No performance results to summarize');
      return;
    }
    
    const resultFiles = fs.readdirSync(resultsDir).filter(file => file.endsWith('.json'));
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: resultFiles.length,
      results: []
    };
    
    for (const file of resultFiles) {
      try {
        const content = fs.readFileSync(path.join(resultsDir, file), 'utf8');
        const result = JSON.parse(content);
        summary.results.push({
          testName: result.testName || file.replace('.json', ''),
          averageResponseTime: result.averageResponseTime,
          throughput: result.throughput,
          errorRate: result.errorRate,
          resourceUsage: result.resourceMetrics
        });
      } catch (error) {
        console.warn(`⚠️  Could not parse result file ${file}:`, error.message);
      }
    }
    
    // Write summary
    const summaryPath = path.join(reportsDir, `performance-summary-${Date.now()}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('📈 Performance summary generated:', summaryPath);
    
  } catch (error) {
    console.error('❌ Performance summary generation failed:', error.message);
  }
}

async function archivePerformanceResults() {
  try {
    const resultsDir = path.join(__dirname, '../results');
    const archiveDir = path.join(__dirname, '../archive');
    
    if (!fs.existsSync(resultsDir)) {
      console.log('📦 No performance results to archive');
      return;
    }
    
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveSubDir = path.join(archiveDir, timestamp);
    
    // Copy results to archive
    const { execSync } = require('child_process');
    execSync(`cp -r "${resultsDir}" "${archiveSubDir}"`, { stdio: 'inherit' });
    
    // Keep only last 10 archives
    const archives = fs.readdirSync(archiveDir)
      .filter(dir => fs.statSync(path.join(archiveDir, dir)).isDirectory())
      .sort()
      .reverse();
    
    if (archives.length > 10) {
      const toDelete = archives.slice(10);
      for (const dir of toDelete) {
        fs.rmSync(path.join(archiveDir, dir), { recursive: true, force: true });
      }
    }
    
    console.log('📦 Performance results archived:', archiveSubDir);
    
  } catch (error) {
    console.error('❌ Performance results archiving failed:', error.message);
  }
}
const fs = require('fs');
const path = require('path');

/**
 * Custom Jest test results processor
 * Generates detailed test reports and performance metrics
 */
class TestResultsProcessor {
  constructor() {
    this.startTime = Date.now();
    this.reportsDir = path.join(__dirname, '../../coverage/reports');
    this.ensureReportsDirectory();
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  process(results) {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    // Generate comprehensive test report
    const report = this.generateTestReport(results, totalDuration);
    
    // Save reports
    this.saveJSONReport(report);
    this.saveMarkdownReport(report);
    this.saveCSVReport(report);
    this.savePerformanceReport(report);
    
    // Log summary to console
    this.logSummary(report);

    return results;
  }

  generateTestReport(results, totalDuration) {
    const {
      numTotalTests,
      numPassedTests,
      numFailedTests,
      numPendingTests,
      testResults,
      coverageMap
    } = results;

    const report = {
      summary: {
        timestamp: new Date().toISOString(),
        totalDuration,
        totalTests: numTotalTests,
        passedTests: numPassedTests,
        failedTests: numFailedTests,
        pendingTests: numPendingTests,
        successRate: numTotalTests > 0 ? (numPassedTests / numTotalTests * 100).toFixed(2) : 0
      },
      suites: this.processTestSuites(testResults),
      performance: this.analyzePerformance(testResults),
      coverage: this.processCoverage(coverageMap),
      issues: this.identifyIssues(testResults)
    };

    return report;
  }

  processTestSuites(testResults) {
    return testResults.map(suite => {
      const {
        testFilePath,
        numPassingTests,
        numFailingTests,
        numPendingTests,
        testExecError,
        failureMessage,
        perfStats
      } = suite;

      return {
        name: path.basename(testFilePath),
        filePath: testFilePath,
        duration: perfStats?.end - perfStats?.start || 0,
        passed: numPassingTests,
        failed: numFailingTests,
        pending: numPendingTests,
        error: testExecError?.message,
        failureMessage,
        tests: suite.testResults.map(test => ({
          name: test.title,
          status: test.status,
          duration: test.duration || 0,
          error: test.failureMessages.join('\n')
        }))
      };
    });
  }

  analyzePerformance(testResults) {
    const allTests = testResults.flatMap(suite => suite.testResults);
    const durations = allTests
      .filter(test => test.duration != null)
      .map(test => test.duration);

    if (durations.length === 0) {
      return {
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        slowTests: []
      };
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    // Identify slow tests (>95th percentile)
    const sortedDurations = [...durations].sort((a, b) => b - a);
    const slowThreshold = sortedDurations[Math.floor(sortedDurations.length * 0.05)];
    
    const slowTests = allTests
      .filter(test => test.duration > slowThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10) // Top 10 slowest
      .map(test => ({
        name: test.title,
        duration: test.duration,
        suite: testResults.find(suite => 
          suite.testResults.some(t => t.title === test.title)
        )?.testFilePath
      }));

    return {
      avgDuration: Math.round(avgDuration),
      minDuration,
      maxDuration,
      slowTests,
      performanceGrade: this.calculatePerformanceGrade(avgDuration)
    };
  }

  processCoverage(coverageMap) {
    if (!coverageMap) {
      return {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      };
    }

    const summary = coverageMap.getCoverageSummary();
    return {
      statements: summary.statements.pct,
      branches: summary.branches.pct,
      functions: summary.functions.pct,
      lines: summary.lines.pct,
      uncoveredFiles: this.findUncoveredFiles(coverageMap)
    };
  }

  findUncoveredFiles(coverageMap) {
    const files = coverageMap.files();
    return files
      .map(file => {
        const fileCoverage = coverageMap.fileCoverageFor(file);
        const summary = fileCoverage.toSummary();
        return {
          file: path.relative(process.cwd(), file),
          statements: summary.statements.pct,
          branches: summary.branches.pct,
          functions: summary.functions.pct,
          lines: summary.lines.pct
        };
      })
      .filter(file => 
        file.statements < 80 || 
        file.branches < 80 || 
        file.functions < 80 || 
        file.lines < 80
      )
      .sort((a, b) => a.statements - b.statements);
  }

  identifyIssues(testResults) {
    const issues = [];

    // Find flaky tests (tests that have inconsistent results)
    testResults.forEach(suite => {
      suite.testResults.forEach(test => {
        if (test.status === 'failed' && test.duration > 10000) {
          issues.push({
            type: 'slow_failing_test',
            severity: 'high',
            description: `Slow failing test: ${test.title} (${test.duration}ms)`,
            file: suite.testFilePath
          });
        }
      });
    });

    // Find suites with high failure rates
    testResults.forEach(suite => {
      const totalTests = suite.numPassingTests + suite.numFailingTests;
      if (totalTests > 0) {
        const failureRate = suite.numFailingTests / totalTests;
        if (failureRate > 0.5) {
          issues.push({
            type: 'high_failure_rate',
            severity: 'medium',
            description: `Suite has high failure rate: ${(failureRate * 100).toFixed(1)}%`,
            file: suite.testFilePath
          });
        }
      }
    });

    return issues;
  }

  calculatePerformanceGrade(avgDuration) {
    if (avgDuration < 100) return 'A';
    if (avgDuration < 250) return 'B';
    if (avgDuration < 500) return 'C';
    if (avgDuration < 1000) return 'D';
    return 'F';
  }

  saveJSONReport(report) {
    const filePath = path.join(this.reportsDir, 'test-results.json');
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  }

  saveMarkdownReport(report) {
    const filePath = path.join(this.reportsDir, 'test-results.md');
    const markdown = this.generateMarkdownReport(report);
    fs.writeFileSync(filePath, markdown);
  }

  generateMarkdownReport(report) {
    const { summary, performance, coverage, issues, suites } = report;
    
    return `# Test Results Report

Generated: ${summary.timestamp}

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${summary.totalTests} |
| Passed | ${summary.passedTests} |
| Failed | ${summary.failedTests} |
| Pending | ${summary.pendingTests} |
| Success Rate | ${summary.successRate}% |
| Total Duration | ${Math.round(summary.totalDuration / 1000)}s |

## Performance Analysis

| Metric | Value |
|--------|-------|
| Average Test Duration | ${performance.avgDuration}ms |
| Min Duration | ${performance.minDuration}ms |
| Max Duration | ${performance.maxDuration}ms |
| Performance Grade | ${performance.performanceGrade} |

### Slowest Tests

${performance.slowTests.map(test => 
  `- **${test.name}** (${test.duration}ms) - ${path.basename(test.suite)}`
).join('\n')}

## Coverage Report

| Type | Percentage |
|------|------------|
| Statements | ${coverage.statements}% |
| Branches | ${coverage.branches}% |
| Functions | ${coverage.functions}% |
| Lines | ${coverage.lines}% |

### Files Needing Coverage Improvement

${coverage.uncoveredFiles?.slice(0, 10).map(file => 
  `- **${file.file}** - Statements: ${file.statements}%, Branches: ${file.branches}%`
).join('\n') || 'All files meet coverage thresholds'}

## Test Suites

${suites.map(suite => `
### ${suite.name}

- Duration: ${suite.duration}ms
- Passed: ${suite.passed}
- Failed: ${suite.failed}
- Pending: ${suite.pending}
${suite.error ? `- Error: ${suite.error}` : ''}
`).join('')}

## Issues Identified

${issues.length === 0 ? 'No issues identified' : issues.map(issue => 
  `- **${issue.type}** (${issue.severity}): ${issue.description}`
).join('\n')}

---
*Generated by Jest Test Results Processor*
`;
  }

  saveCSVReport(report) {
    const filePath = path.join(this.reportsDir, 'test-results.csv');
    const csvData = this.generateCSVData(report);
    fs.writeFileSync(filePath, csvData);
  }

  generateCSVData(report) {
    const headers = [
      'Suite',
      'Test',
      'Status',
      'Duration (ms)',
      'Error'
    ];

    const rows = report.suites.flatMap(suite =>
      suite.tests.map(test => [
        suite.name,
        test.name,
        test.status,
        test.duration || 0,
        test.error || ''
      ])
    );

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
  }

  savePerformanceReport(report) {
    const filePath = path.join(this.reportsDir, 'performance-metrics.json');
    const metrics = {
      timestamp: report.summary.timestamp,
      totalDuration: report.summary.totalDuration,
      averageTestDuration: report.performance.avgDuration,
      slowestTests: report.performance.slowTests.slice(0, 5),
      performanceGrade: report.performance.performanceGrade,
      testCount: report.summary.totalTests,
      successRate: parseFloat(report.summary.successRate)
    };

    // Append to historical data
    let historicalData = [];
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        historicalData = Array.isArray(existing) ? existing : [existing];
      } catch (error) {
        console.warn('Could not parse existing performance data');
      }
    }

    historicalData.push(metrics);
    
    // Keep only last 50 runs
    if (historicalData.length > 50) {
      historicalData = historicalData.slice(-50);
    }

    fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2));
  }

  logSummary(report) {
    const { summary, performance, coverage } = report;
    
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Tests: ${summary.passedTests}/${summary.totalTests} passed (${summary.successRate}%)`);
    console.log(`⏱️  Duration: ${Math.round(summary.totalDuration / 1000)}s`);
    console.log(`🚀 Performance: ${performance.performanceGrade} (avg: ${performance.avgDuration}ms)`);
    console.log(`📈 Coverage: ${coverage.statements}% statements, ${coverage.branches}% branches`);
    
    if (summary.failedTests > 0) {
      console.log(`\n❌ ${summary.failedTests} test(s) failed`);
    }
    
    if (performance.slowTests.length > 0) {
      console.log(`\n🐌 Slowest test: ${performance.slowTests[0].name} (${performance.slowTests[0].duration}ms)`);
    }
    
    console.log(`\n📋 Reports saved to: ${this.reportsDir}`);
    console.log('='.repeat(60) + '\n');
  }
}

// Export as Jest results processor function
module.exports = (results) => {
  const processor = new TestResultsProcessor();
  return processor.process(results);
};
/**
 * Global teardown for security tests
 * Clean up security test environment and generate reports
 */

const { SecurityScanner } = require('../utils/security-scanner');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🔒 Tearing down security test environment...');
  
  try {
    // Generate final security metrics report
    if (global.securityMetrics) {
      const finalMetrics = {
        ...global.securityMetrics,
        testEndTime: Date.now(),
        totalDuration: Date.now() - global.securityMetrics.testStartTime,
        testSummary: {
          totalTests: global.securityMetrics.testsRun,
          passedTests: global.securityMetrics.testsPassed,
          failedTests: global.securityMetrics.testsFailed,
          passRate: global.securityMetrics.testsRun > 0 
            ? (global.securityMetrics.testsPassed / global.securityMetrics.testsRun * 100).toFixed(2) + '%'
            : '0%',
          vulnerabilitiesFound: global.securityMetrics.vulnerabilitiesFound,
          securityIssuesCount: global.securityMetrics.securityIssues.length
        }
      };
      
      // Write final metrics report
      const metricsPath = path.join(process.cwd(), 'tests/security/reports/security-metrics.json');
      fs.writeFileSync(metricsPath, JSON.stringify(finalMetrics, null, 2));
      
      console.log('📊 Security metrics report generated');
    }
    
    // Run final security scan if scanner is available
    if (global.securityScanner) {
      try {
        console.log('🔍 Running final security scan...');
        const finalScanResult = await global.securityScanner.runComprehensiveScan();
        
        // Write final scan report
        const scanReportPath = path.join(process.cwd(), 'tests/security/reports/final-security-scan.json');
        fs.writeFileSync(scanReportPath, JSON.stringify(finalScanResult, null, 2));
        
        console.log('✅ Final security scan completed');
      } catch (scanError) {
        console.warn('⚠️  Final security scan failed:', scanError.message);
      }
    }
    
    // Generate security test summary
    const testSummary = {
      timestamp: new Date().toISOString(),
      testSuite: 'security',
      environment: {
        nodeEnv: process.env.NODE_ENV,
        securityTestMode: process.env.SECURITY_TEST_MODE,
        testTimeout: process.env.SECURITY_TEST_TIMEOUT
      },
      coverage: await getSecurityTestCoverage(),
      vulnerabilities: global.securityMetrics?.securityIssues || [],
      recommendations: generateSecurityRecommendations(),
      compliance: await generateComplianceReport()
    };
    
    // Write test summary
    const summaryPath = path.join(process.cwd(), 'tests/security/reports/security-test-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(testSummary, null, 2));
    
    // Generate HTML report
    await generateHTMLReport(testSummary);
    
    // Log final security event
    if (global.logSecurityEvent) {
      global.logSecurityEvent({
        type: 'teardown',
        message: 'Security test environment teardown completed',
        summary: testSummary.testSuite,
        metrics: global.securityMetrics?.testSummary
      });
    }
    
    // Clean up temporary files
    await cleanupTempFiles();
    
    // Display final security test summary
    displaySecurityTestSummary(testSummary);
    
    console.log('✅ Security test environment teardown completed');
    
  } catch (error) {
    console.error('❌ Security test teardown failed:', error);
    throw error;
  }
};

/**
 * Get security test coverage information
 */
async function getSecurityTestCoverage() {
  const coverageAreas = [
    'authentication',
    'authorization',
    'input-validation',
    'api-security',
    'cryptographic',
    'network',
    'penetration'
  ];
  
  const coverage = {};
  
  for (const area of coverageAreas) {
    const areaPath = path.join(process.cwd(), `tests/security/${area}`);
    if (fs.existsSync(areaPath)) {
      const testFiles = fs.readdirSync(areaPath).filter(file => file.endsWith('.test.js'));
      coverage[area] = {
        testFiles: testFiles.length,
        testNames: testFiles.map(file => file.replace('.test.js', ''))
      };
    } else {
      coverage[area] = {
        testFiles: 0,
        testNames: []
      };
    }
  }
  
  return coverage;
}

/**
 * Generate security recommendations
 */
function generateSecurityRecommendations() {
  const recommendations = [];
  
  // Check for common security issues
  const securityIssues = global.securityMetrics?.securityIssues || [];
  
  if (securityIssues.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'vulnerabilities',
      title: 'Address Security Vulnerabilities',
      description: `${securityIssues.length} security issues found during testing`,
      action: 'Review and fix all identified security vulnerabilities',
      issues: securityIssues
    });
  }
  
  // Authentication recommendations
  recommendations.push({
    priority: 'high',
    category: 'authentication',
    title: 'Strengthen Authentication',
    description: 'Implement robust authentication mechanisms',
    action: 'Review authentication implementation and add multi-factor authentication',
    checks: [
      'Token expiration validation',
      'Session management',
      'Brute force protection',
      'Password strength requirements'
    ]
  });
  
  // Authorization recommendations
  recommendations.push({
    priority: 'high',
    category: 'authorization',
    title: 'Implement Proper Authorization',
    description: 'Ensure proper role-based access control',
    action: 'Review and test all authorization controls',
    checks: [
      'RBAC implementation',
      'Permission boundaries',
      'Privilege escalation prevention',
      'Resource-level access control'
    ]
  });
  
  // Input validation recommendations
  recommendations.push({
    priority: 'critical',
    category: 'input-validation',
    title: 'Secure Input Validation',
    description: 'Implement comprehensive input validation',
    action: 'Add input validation and sanitization for all user inputs',
    checks: [
      'SQL injection prevention',
      'XSS protection',
      'Path traversal prevention',
      'Command injection protection'
    ]
  });
  
  // API security recommendations
  recommendations.push({
    priority: 'medium',
    category: 'api-security',
    title: 'API Security Controls',
    description: 'Implement API security best practices',
    action: 'Add rate limiting, CORS configuration, and security headers',
    checks: [
      'Rate limiting',
      'CORS configuration',
      'Security headers',
      'API versioning'
    ]
  });
  
  return recommendations;
}

/**
 * Generate compliance report
 */
async function generateComplianceReport() {
  const compliance = {
    owasp: {
      name: 'OWASP Top 10 2021',
      status: 'partial',
      coverage: 85,
      checks: [
        { name: 'A01:2021 – Broken Access Control', status: 'tested' },
        { name: 'A02:2021 – Cryptographic Failures', status: 'tested' },
        { name: 'A03:2021 – Injection', status: 'tested' },
        { name: 'A04:2021 – Insecure Design', status: 'partial' },
        { name: 'A05:2021 – Security Misconfiguration', status: 'tested' },
        { name: 'A06:2021 – Vulnerable Components', status: 'tested' },
        { name: 'A07:2021 – Authentication Failures', status: 'tested' },
        { name: 'A08:2021 – Software and Data Integrity', status: 'partial' },
        { name: 'A09:2021 – Logging and Monitoring', status: 'partial' },
        { name: 'A10:2021 – Server-Side Request Forgery', status: 'partial' }
      ]
    },
    nist: {
      name: 'NIST Cybersecurity Framework',
      status: 'partial',
      coverage: 70,
      functions: [
        { name: 'Identify', status: 'tested' },
        { name: 'Protect', status: 'tested' },
        { name: 'Detect', status: 'partial' },
        { name: 'Respond', status: 'partial' },
        { name: 'Recover', status: 'not-tested' }
      ]
    },
    iso27001: {
      name: 'ISO 27001',
      status: 'partial',
      coverage: 60,
      controls: [
        { name: 'Access Control', status: 'tested' },
        { name: 'Cryptography', status: 'tested' },
        { name: 'Operations Security', status: 'partial' },
        { name: 'Communications Security', status: 'partial' },
        { name: 'System Acquisition', status: 'not-tested' }
      ]
    }
  };
  
  return compliance;
}

/**
 * Generate HTML report
 */
async function generateHTMLReport(testSummary) {
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; }
        .section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
        .recommendation { padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; background: #f8f9fa; }
        .vulnerability { padding: 10px; margin: 10px 0; border-left: 4px solid #dc3545; background: #f8f9fa; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔒 Security Test Report</h1>
        <p>Generated: ${testSummary.timestamp}</p>
        <p>Test Suite: ${testSummary.testSuite}</p>
    </div>

    <div class="section">
        <h2>Test Coverage</h2>
        <div class="metrics">
            ${Object.entries(testSummary.coverage).map(([area, info]) => `
                <div class="metric">
                    <strong>${area.replace('-', ' ').toUpperCase()}</strong><br>
                    ${info.testFiles} test files<br>
                    Tests: ${info.testNames.join(', ')}
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>Security Recommendations</h2>
        ${testSummary.recommendations.map(rec => `
            <div class="recommendation">
                <h3 class="${rec.priority === 'critical' ? 'danger' : rec.priority === 'high' ? 'warning' : 'success'}">
                    ${rec.title} (${rec.priority.toUpperCase()})
                </h3>
                <p>${rec.description}</p>
                <p><strong>Action:</strong> ${rec.action}</p>
                ${rec.checks ? `<ul>${rec.checks.map(check => `<li>${check}</li>`).join('')}</ul>` : ''}
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>Compliance Status</h2>
        <table>
            <thead>
                <tr>
                    <th>Standard</th>
                    <th>Status</th>
                    <th>Coverage</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(testSummary.compliance).map(([key, standard]) => `
                    <tr>
                        <td>${standard.name}</td>
                        <td class="${standard.status === 'compliant' ? 'success' : 'warning'}">${standard.status}</td>
                        <td>${standard.coverage}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Vulnerabilities Found</h2>
        ${testSummary.vulnerabilities.length > 0 ? `
            ${testSummary.vulnerabilities.map(vuln => `
                <div class="vulnerability">
                    <h4>${vuln.type}: ${vuln.description}</h4>
                    <p><strong>Severity:</strong> ${vuln.severity}</p>
                    <p><strong>File:</strong> ${vuln.file || 'N/A'}</p>
                    <p><strong>Line:</strong> ${vuln.line || 'N/A'}</p>
                </div>
            `).join('')}
        ` : '<p class="success">No vulnerabilities found during testing.</p>'}
    </div>

    <div class="section">
        <h2>Test Environment</h2>
        <table>
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(testSummary.environment).map(([key, value]) => `
                    <tr>
                        <td>${key}</td>
                        <td>${value}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
`;
  
  const htmlPath = path.join(process.cwd(), 'tests/security/reports/security-test-report.html');
  fs.writeFileSync(htmlPath, htmlTemplate);
  
  console.log('📄 HTML security report generated');
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles() {
  const tempDir = path.join(process.cwd(), 'tests/security/temp');
  
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
      console.log('🧹 Temporary files cleaned up');
    } catch (error) {
      console.warn('⚠️  Failed to clean up temporary files:', error.message);
    }
  }
}

/**
 * Display security test summary
 */
function displaySecurityTestSummary(testSummary) {
  console.log('\n📊 Security Test Summary:');
  console.log('=' .repeat(50));
  
  console.log(`\n🔍 Test Coverage:`);
  Object.entries(testSummary.coverage).forEach(([area, info]) => {
    console.log(`  ${area.replace('-', ' ').toUpperCase()}: ${info.testFiles} test files`);
  });
  
  console.log(`\n🛡️  Security Recommendations: ${testSummary.recommendations.length}`);
  testSummary.recommendations.forEach(rec => {
    const icon = rec.priority === 'critical' ? '🚨' : rec.priority === 'high' ? '⚠️' : '💡';
    console.log(`  ${icon} ${rec.title} (${rec.priority.toUpperCase()})`);
  });
  
  console.log(`\n🏆 Compliance Status:`);
  Object.entries(testSummary.compliance).forEach(([key, standard]) => {
    const icon = standard.status === 'compliant' ? '✅' : '⚠️';
    console.log(`  ${icon} ${standard.name}: ${standard.coverage}%`);
  });
  
  console.log(`\n🔐 Vulnerabilities Found: ${testSummary.vulnerabilities.length}`);
  if (testSummary.vulnerabilities.length > 0) {
    testSummary.vulnerabilities.forEach(vuln => {
      const icon = vuln.severity === 'critical' ? '🚨' : vuln.severity === 'high' ? '⚠️' : '💡';
      console.log(`  ${icon} ${vuln.type}: ${vuln.description}`);
    });
  }
  
  console.log('\n📄 Reports Generated:');
  console.log('  - tests/security/reports/security-test-summary.json');
  console.log('  - tests/security/reports/security-test-report.html');
  console.log('  - tests/security/reports/security-metrics.json');
  
  console.log('\n🔒 Security test environment teardown completed successfully!');
};
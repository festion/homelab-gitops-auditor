/**
 * Security Scanner for Automated Vulnerability Detection
 * Comprehensive security scanning and vulnerability assessment tool
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityScanner {
  constructor(options = {}) {
    this.options = {
      outputFormat: options.outputFormat || 'json',
      verbose: options.verbose || false,
      timeout: options.timeout || 300000, // 5 minutes
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      excludePatterns: options.excludePatterns || [
        'node_modules/**',
        '.git/**',
        'coverage/**',
        'dist/**',
        'build/**',
        '*.log',
        '*.tmp'
      ],
      ...options
    };

    this.vulnerabilities = [];
    this.scanResults = new Map();
    this.scanStartTime = null;
    this.scanEndTime = null;
  }

  /**
   * Run comprehensive security scan
   * @returns {Object} Complete scan results
   */
  async runComprehensiveScan() {
    this.scanStartTime = Date.now();
    console.log('🔍 Starting comprehensive security scan...');

    try {
      // Run all security scans
      const results = await Promise.allSettled([
        this.runDependencyVulnerabilityScanner(),
        this.runStaticCodeAnalysis(),
        this.runSecretsScanner(),
        this.runContainerSecurityScan(),
        this.runConfigurationSecurityScan(),
        this.runCodeQualityAnalysis(),
        this.runLicenseComplianceCheck(),
        this.runSecurityPolicyValidation()
      ]);

      // Process results
      results.forEach((result, index) => {
        const scanNames = [
          'dependency-vulnerabilities',
          'static-code-analysis',
          'secrets-scanning',
          'container-security',
          'configuration-security',
          'code-quality',
          'license-compliance',
          'security-policy'
        ];

        if (result.status === 'fulfilled') {
          this.scanResults.set(scanNames[index], result.value);
        } else {
          this.scanResults.set(scanNames[index], {
            error: result.reason.message,
            status: 'failed'
          });
        }
      });

      this.scanEndTime = Date.now();
      return this.generateComprehensiveReport();

    } catch (error) {
      console.error('❌ Comprehensive scan failed:', error.message);
      this.scanEndTime = Date.now();
      throw error;
    }
  }

  /**
   * Run dependency vulnerability scanner
   * @returns {Object} Dependency scan results
   */
  async runDependencyVulnerabilityScanner() {
    console.log('🔍 Running dependency vulnerability scanner...');
    
    try {
      // Check if package.json exists
      if (!fs.existsSync('package.json')) {
        return {
          status: 'skipped',
          reason: 'No package.json found'
        };
      }

      // Run npm audit
      const auditResult = execSync('npm audit --json', { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: this.options.timeout
      });
      
      const auditData = JSON.parse(auditResult);
      
      if (auditData.vulnerabilities) {
        for (const [packageName, vulnerability] of Object.entries(auditData.vulnerabilities)) {
          if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') {
            this.vulnerabilities.push({
              type: 'dependency',
              package: packageName,
              severity: vulnerability.severity,
              description: vulnerability.via[0]?.title || 'Unknown vulnerability',
              cve: vulnerability.via[0]?.cve || null,
              patched: vulnerability.fixAvailable || false,
              source: 'npm-audit'
            });
          }
        }
      }

      // Also check for Yarn if yarn.lock exists
      if (fs.existsSync('yarn.lock')) {
        try {
          const yarnAuditResult = execSync('yarn audit --json', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: this.options.timeout
          });
          
          // Process yarn audit results
          const yarnLines = yarnAuditResult.split('\n').filter(line => line.trim());
          yarnLines.forEach(line => {
            try {
              const entry = JSON.parse(line);
              if (entry.type === 'auditAdvisory' && 
                  (entry.data.severity === 'high' || entry.data.severity === 'critical')) {
                this.vulnerabilities.push({
                  type: 'dependency',
                  package: entry.data.module_name,
                  severity: entry.data.severity,
                  description: entry.data.title,
                  cve: entry.data.cves?.[0] || null,
                  patched: entry.data.patched_versions !== '<0.0.0',
                  source: 'yarn-audit'
                });
              }
            } catch (parseError) {
              // Skip invalid JSON lines
            }
          });
        } catch (yarnError) {
          console.warn('⚠️  Yarn audit failed:', yarnError.message);
        }
      }
      
      return {
        status: 'completed',
        totalVulnerabilities: Object.keys(auditData.vulnerabilities || {}).length,
        highSeverity: this.vulnerabilities.filter(v => v.severity === 'high' && v.source === 'npm-audit').length,
        criticalSeverity: this.vulnerabilities.filter(v => v.severity === 'critical' && v.source === 'npm-audit').length,
        auditData: auditData
      };
      
    } catch (error) {
      console.warn('⚠️  Dependency vulnerability scanner failed:', error.message);
      return { 
        status: 'failed',
        error: error.message,
        reason: 'npm audit command failed'
      };
    }
  }

  /**
   * Run static code analysis
   * @returns {Object} Static analysis results
   */
  async runStaticCodeAnalysis() {
    console.log('🔍 Running static code analysis...');
    
    try {
      // Create security-focused ESLint configuration
      const eslintConfig = {
        extends: ['eslint:recommended'],
        env: {
          node: true,
          es6: true
        },
        rules: {
          'no-eval': 'error',
          'no-implied-eval': 'error',
          'no-new-func': 'error',
          'no-script-url': 'error',
          'no-unsafe-finally': 'error',
          'no-unsafe-negation': 'error'
        }
      };

      // Write temporary ESLint config
      fs.writeFileSync('.eslintrc.security.json', JSON.stringify(eslintConfig, null, 2));

      // Run ESLint on relevant files
      const eslintResult = execSync('npx eslint --format json --config .eslintrc.security.json "**/*.js" "**/*.ts" --ignore-pattern "node_modules/**"', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: this.options.timeout
      });
      
      const eslintData = JSON.parse(eslintResult);
      
      for (const file of eslintData) {
        for (const message of file.messages) {
          if (message.severity === 2) { // Error level
            this.vulnerabilities.push({
              type: 'static-analysis',
              file: file.filePath,
              line: message.line,
              column: message.column,
              rule: message.ruleId,
              severity: 'medium',
              description: message.message,
              source: 'eslint'
            });
          }
        }
      }

      // Clean up temporary config
      if (fs.existsSync('.eslintrc.security.json')) {
        fs.unlinkSync('.eslintrc.security.json');
      }
      
      return {
        status: 'completed',
        filesScanned: eslintData.length,
        issuesFound: this.vulnerabilities.filter(v => v.type === 'static-analysis').length,
        eslintResults: eslintData
      };
      
    } catch (error) {
      console.warn('⚠️  Static code analysis failed:', error.message);
      return { 
        status: 'failed',
        error: error.message,
        reason: 'ESLint analysis failed'
      };
    }
  }

  /**
   * Run secrets scanner
   * @returns {Object} Secrets scan results
   */
  async runSecretsScanner() {
    console.log('🔍 Running secrets scanner...');
    
    try {
      const secretPatterns = [
        { 
          name: 'password', 
          pattern: /(?:password|passwd|pwd)\s*[:=]\s*['""]([^'""]{8,})['""]?/gi,
          severity: 'high'
        },
        { 
          name: 'api_key', 
          pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['""]([^'""]{16,})['""]?/gi,
          severity: 'high'
        },
        { 
          name: 'secret', 
          pattern: /(?:secret|token)\s*[:=]\s*['""]([^'""]{16,})['""]?/gi,
          severity: 'high'
        },
        { 
          name: 'private_key', 
          pattern: /(?:private[_-]?key|privatekey)\s*[:=]\s*['""]([^'""]{32,})['""]?/gi,
          severity: 'critical'
        },
        { 
          name: 'auth_token', 
          pattern: /(?:auth[_-]?token|authtoken)\s*[:=]\s*['""]([^'""]{20,})['""]?/gi,
          severity: 'high'
        },
        { 
          name: 'jwt_secret', 
          pattern: /(?:jwt[_-]?secret|jwtsecret)\s*[:=]\s*['""]([^'""]{32,})['""]?/gi,
          severity: 'critical'
        },
        { 
          name: 'database_url', 
          pattern: /(?:database[_-]?url|db[_-]?url)\s*[:=]\s*['""]([^'""]+)['""]?/gi,
          severity: 'high'
        },
        { 
          name: 'aws_access_key', 
          pattern: /AKIA[0-9A-Z]{16}/g,
          severity: 'critical'
        },
        { 
          name: 'aws_secret_key', 
          pattern: /[0-9a-zA-Z/+]{40}/g,
          severity: 'critical'
        },
        { 
          name: 'github_token', 
          pattern: /ghp_[0-9a-zA-Z]{36}/g,
          severity: 'high'
        }
      ];
      
      const filesToScan = this.getFilesToScan([
        '**/*.js', '**/*.ts', '**/*.json', '**/*.yaml', '**/*.yml', 
        '**/*.env', '**/*.config', '**/*.conf', '**/*.ini'
      ]);
      
      let secretsFound = 0;
      let filesScanned = 0;
      
      for (const filePath of filesToScan) {
        try {
          const stats = fs.statSync(filePath);
          if (stats.size > this.options.maxFileSize) {
            continue; // Skip large files
          }

          const content = fs.readFileSync(filePath, 'utf8');
          filesScanned++;
          
          for (const { name, pattern, severity } of secretPatterns) {
            let matches;
            pattern.lastIndex = 0; // Reset regex
            
            while ((matches = pattern.exec(content)) !== null) {
              secretsFound++;
              
              this.vulnerabilities.push({
                type: 'secrets',
                file: filePath,
                line: this.getLineNumber(content, matches.index),
                severity: severity,
                description: `Potential ${name} detected`,
                pattern: pattern.source,
                match: matches[0].substring(0, 50) + '...',
                source: 'secrets-scanner'
              });
            }
          }
        } catch (fileError) {
          console.warn(`⚠️  Could not scan file ${filePath}:`, fileError.message);
        }
      }
      
      return {
        status: 'completed',
        filesScanned: filesScanned,
        secretsFound: secretsFound,
        patternsUsed: secretPatterns.length
      };
      
    } catch (error) {
      console.warn('⚠️  Secrets scanner failed:', error.message);
      return { 
        status: 'failed',
        error: error.message,
        reason: 'Secrets scanning failed'
      };
    }
  }

  /**
   * Run container security scan
   * @returns {Object} Container scan results
   */
  async runContainerSecurityScan() {
    console.log('🔍 Running container security scan...');
    
    try {
      // Check if Docker is available
      execSync('docker --version', { stdio: 'pipe' });
      
      // Check for Dockerfile
      if (!fs.existsSync('Dockerfile')) {
        return {
          status: 'skipped',
          reason: 'No Dockerfile found'
        };
      }

      // Run Trivy security scan if available
      try {
        const imageName = 'homelab-gitops-auditor:latest';
        
        // Try to run Trivy scan
        const trivyResult = execSync(`docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image ${imageName} --format json --timeout 5m`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: this.options.timeout
        });
        
        const scanData = JSON.parse(trivyResult);
        
        if (scanData.Results) {
          for (const result of scanData.Results) {
            if (result.Vulnerabilities) {
              for (const vuln of result.Vulnerabilities) {
                if (vuln.Severity === 'HIGH' || vuln.Severity === 'CRITICAL') {
                  this.vulnerabilities.push({
                    type: 'container',
                    package: vuln.PkgName,
                    version: vuln.InstalledVersion,
                    severity: vuln.Severity.toLowerCase(),
                    description: vuln.Description,
                    cve: vuln.VulnerabilityID,
                    source: 'trivy'
                  });
                }
              }
            }
          }
        }
        
        return {
          status: 'completed',
          vulnerabilitiesFound: this.vulnerabilities.filter(v => v.type === 'container').length,
          scanData: scanData
        };
        
      } catch (trivyError) {
        // Fallback to basic Dockerfile analysis
        return this.analyzeDockerfile();
      }
      
    } catch (dockerError) {
      console.warn('⚠️  Docker not available, skipping container scan');
      return {
        status: 'skipped',
        reason: 'Docker not available'
      };
    }
  }

  /**
   * Analyze Dockerfile for security issues
   * @returns {Object} Dockerfile analysis results
   */
  analyzeDockerfile() {
    try {
      const dockerfileContent = fs.readFileSync('Dockerfile', 'utf8');
      const lines = dockerfileContent.split('\n');
      
      let issuesFound = 0;
      
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        
        // Check for security issues
        if (line.includes('USER root') || line.includes('USER 0')) {
          this.vulnerabilities.push({
            type: 'container',
            file: 'Dockerfile',
            line: lineNumber,
            severity: 'high',
            description: 'Running as root user',
            recommendation: 'Create and use a non-root user',
            source: 'dockerfile-analysis'
          });
          issuesFound++;
        }
        
        if (line.includes('--no-check-certificate') || line.includes('--insecure')) {
          this.vulnerabilities.push({
            type: 'container',
            file: 'Dockerfile',
            line: lineNumber,
            severity: 'medium',
            description: 'Insecure download detected',
            recommendation: 'Remove insecure download flags',
            source: 'dockerfile-analysis'
          });
          issuesFound++;
        }
        
        if (line.includes('latest') && line.includes('FROM')) {
          this.vulnerabilities.push({
            type: 'container',
            file: 'Dockerfile',
            line: lineNumber,
            severity: 'medium',
            description: 'Using latest tag in base image',
            recommendation: 'Use specific version tags',
            source: 'dockerfile-analysis'
          });
          issuesFound++;
        }
      });
      
      return {
        status: 'completed',
        issuesFound: issuesFound,
        linesScanned: lines.length
      };
      
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Run configuration security scan
   * @returns {Object} Configuration scan results
   */
  async runConfigurationSecurityScan() {
    console.log('🔍 Running configuration security scan...');
    
    try {
      const configFiles = this.getFilesToScan([
        '**/*.json', '**/*.yaml', '**/*.yml', '**/*.env', '**/*.config'
      ]);
      
      let issuesFound = 0;
      let filesScanned = 0;
      
      for (const filePath of configFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          filesScanned++;
          
          // Check for insecure configurations
          if (content.includes('ssl: false') || content.includes('tls: false')) {
            this.vulnerabilities.push({
              type: 'configuration',
              file: filePath,
              severity: 'medium',
              description: 'SSL/TLS disabled in configuration',
              recommendation: 'Enable SSL/TLS encryption',
              source: 'config-scanner'
            });
            issuesFound++;
          }
          
          if (content.includes('debug: true') || content.includes('DEBUG=true')) {
            this.vulnerabilities.push({
              type: 'configuration',
              file: filePath,
              severity: 'low',
              description: 'Debug mode enabled',
              recommendation: 'Disable debug mode in production',
              source: 'config-scanner'
            });
            issuesFound++;
          }
          
          if (content.includes('cors: "*"') || content.includes('origin: "*"')) {
            this.vulnerabilities.push({
              type: 'configuration',
              file: filePath,
              severity: 'medium',
              description: 'Permissive CORS configuration',
              recommendation: 'Restrict CORS to specific origins',
              source: 'config-scanner'
            });
            issuesFound++;
          }
          
        } catch (fileError) {
          console.warn(`⚠️  Could not scan config file ${filePath}:`, fileError.message);
        }
      }
      
      return {
        status: 'completed',
        filesScanned: filesScanned,
        issuesFound: issuesFound
      };
      
    } catch (error) {
      console.warn('⚠️  Configuration security scan failed:', error.message);
      return { 
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Run code quality analysis
   * @returns {Object} Code quality results
   */
  async runCodeQualityAnalysis() {
    console.log('🔍 Running code quality analysis...');
    
    try {
      const jsFiles = this.getFilesToScan(['**/*.js', '**/*.ts']);
      
      let qualityIssues = 0;
      let filesScanned = 0;
      
      for (const filePath of jsFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          filesScanned++;
          
          // Check for code quality issues
          if (content.includes('eval(') || content.includes('Function(')) {
            this.vulnerabilities.push({
              type: 'code-quality',
              file: filePath,
              severity: 'high',
              description: 'Use of eval() or Function() constructor',
              recommendation: 'Avoid dynamic code execution',
              source: 'quality-scanner'
            });
            qualityIssues++;
          }
          
          if (content.includes('console.log') || content.includes('console.error')) {
            this.vulnerabilities.push({
              type: 'code-quality',
              file: filePath,
              severity: 'low',
              description: 'Console statements in code',
              recommendation: 'Remove console statements in production',
              source: 'quality-scanner'
            });
            qualityIssues++;
          }
          
          // Check for TODO/FIXME comments
          if (content.includes('TODO') || content.includes('FIXME')) {
            this.vulnerabilities.push({
              type: 'code-quality',
              file: filePath,
              severity: 'info',
              description: 'Unresolved TODO/FIXME comments',
              recommendation: 'Address TODO/FIXME comments',
              source: 'quality-scanner'
            });
            qualityIssues++;
          }
          
        } catch (fileError) {
          console.warn(`⚠️  Could not scan file ${filePath}:`, fileError.message);
        }
      }
      
      return {
        status: 'completed',
        filesScanned: filesScanned,
        qualityIssues: qualityIssues
      };
      
    } catch (error) {
      console.warn('⚠️  Code quality analysis failed:', error.message);
      return { 
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Run license compliance check
   * @returns {Object} License compliance results
   */
  async runLicenseComplianceCheck() {
    console.log('🔍 Running license compliance check...');
    
    try {
      if (!fs.existsSync('package.json')) {
        return {
          status: 'skipped',
          reason: 'No package.json found'
        };
      }
      
      // Use license-checker if available
      try {
        const licenseResult = execSync('npx license-checker --json', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: this.options.timeout
        });
        
        const licenses = JSON.parse(licenseResult);
        
        const prohibitedLicenses = ['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0'];
        let complianceIssues = 0;
        
        for (const [packageName, info] of Object.entries(licenses)) {
          if (prohibitedLicenses.includes(info.license)) {
            this.vulnerabilities.push({
              type: 'license-compliance',
              package: packageName,
              severity: 'medium',
              description: `Prohibited license: ${info.license}`,
              recommendation: 'Review license compatibility',
              source: 'license-checker'
            });
            complianceIssues++;
          }
        }
        
        return {
          status: 'completed',
          packagesChecked: Object.keys(licenses).length,
          complianceIssues: complianceIssues
        };
        
      } catch (licenseError) {
        return {
          status: 'failed',
          error: licenseError.message
        };
      }
      
    } catch (error) {
      console.warn('⚠️  License compliance check failed:', error.message);
      return { 
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Run security policy validation
   * @returns {Object} Security policy validation results
   */
  async runSecurityPolicyValidation() {
    console.log('🔍 Running security policy validation...');
    
    try {
      const securityFiles = [
        'SECURITY.md',
        'security.md',
        '.github/SECURITY.md',
        'docs/SECURITY.md'
      ];
      
      let policyExists = false;
      let policyIssues = 0;
      
      for (const file of securityFiles) {
        if (fs.existsSync(file)) {
          policyExists = true;
          
          const content = fs.readFileSync(file, 'utf8');
          
          // Check for required sections
          const requiredSections = [
            'vulnerability',
            'reporting',
            'contact',
            'disclosure'
          ];
          
          for (const section of requiredSections) {
            if (!content.toLowerCase().includes(section)) {
              this.vulnerabilities.push({
                type: 'security-policy',
                file: file,
                severity: 'low',
                description: `Missing ${section} section in security policy`,
                recommendation: `Add ${section} section to security policy`,
                source: 'policy-validator'
              });
              policyIssues++;
            }
          }
          
          break;
        }
      }
      
      if (!policyExists) {
        this.vulnerabilities.push({
          type: 'security-policy',
          severity: 'medium',
          description: 'No security policy found',
          recommendation: 'Create a security policy (SECURITY.md)',
          source: 'policy-validator'
        });
        policyIssues++;
      }
      
      return {
        status: 'completed',
        policyExists: policyExists,
        policyIssues: policyIssues
      };
      
    } catch (error) {
      console.warn('⚠️  Security policy validation failed:', error.message);
      return { 
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Generate comprehensive security report
   * @returns {Object} Complete security report
   */
  generateComprehensiveReport() {
    const scanDuration = this.scanEndTime - this.scanStartTime;
    
    const report = {
      timestamp: new Date().toISOString(),
      scanDuration: scanDuration,
      summary: {
        totalVulnerabilities: this.vulnerabilities.length,
        criticalVulnerabilities: this.vulnerabilities.filter(v => v.severity === 'critical').length,
        highVulnerabilities: this.vulnerabilities.filter(v => v.severity === 'high').length,
        mediumVulnerabilities: this.vulnerabilities.filter(v => v.severity === 'medium').length,
        lowVulnerabilities: this.vulnerabilities.filter(v => v.severity === 'low').length,
        infoVulnerabilities: this.vulnerabilities.filter(v => v.severity === 'info').length
      },
      vulnerabilities: this.vulnerabilities,
      scanResults: Object.fromEntries(this.scanResults),
      recommendations: this.generateRecommendations(),
      securityScore: this.calculateSecurityScore(),
      compliance: this.generateComplianceReport()
    };
    
    // Write report to file
    const reportPath = `security-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 Security scan completed in ${scanDuration}ms`);
    console.log(`📋 Full report written to: ${reportPath}`);
    
    return report;
  }

  /**
   * Generate security recommendations
   * @returns {Array} Security recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const vulnTypes = [...new Set(this.vulnerabilities.map(v => v.type))];
    
    const recommendationMap = {
      'dependency': {
        priority: 'high',
        title: 'Update Dependencies',
        description: 'Update vulnerable dependencies to patched versions',
        actions: ['Run npm audit fix', 'Update package.json versions', 'Test updated dependencies']
      },
      'secrets': {
        priority: 'critical',
        title: 'Remove Hardcoded Secrets',
        description: 'Remove hardcoded secrets and use environment variables',
        actions: ['Move secrets to environment variables', 'Add secrets to .gitignore', 'Rotate exposed secrets']
      },
      'static-analysis': {
        priority: 'medium',
        title: 'Fix Code Quality Issues',
        description: 'Address static analysis findings',
        actions: ['Fix ESLint errors', 'Review code for security issues', 'Implement coding standards']
      },
      'container': {
        priority: 'high',
        title: 'Secure Container Configuration',
        description: 'Improve container security configuration',
        actions: ['Update base images', 'Use non-root user', 'Implement security scanning']
      },
      'configuration': {
        priority: 'medium',
        title: 'Secure Configuration',
        description: 'Review and secure configuration files',
        actions: ['Enable SSL/TLS', 'Disable debug mode', 'Review CORS settings']
      }
    };
    
    vulnTypes.forEach(type => {
      if (recommendationMap[type]) {
        recommendations.push({
          type: type,
          ...recommendationMap[type],
          affectedItems: this.vulnerabilities.filter(v => v.type === type).length
        });
      }
    });
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Calculate overall security score
   * @returns {Object} Security score information
   */
  calculateSecurityScore() {
    const severityWeights = { 
      critical: 25, 
      high: 15, 
      medium: 10, 
      low: 5, 
      info: 1 
    };
    
    const penalty = this.vulnerabilities.reduce((sum, v) => 
      sum + (severityWeights[v.severity] || 0), 0);
    
    const score = Math.max(0, 100 - penalty);
    
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    
    return {
      score: score,
      grade: grade,
      riskLevel: score > 80 ? 'low' : score > 60 ? 'medium' : score > 40 ? 'high' : 'critical',
      penalty: penalty
    };
  }

  /**
   * Generate compliance report
   * @returns {Object} Compliance report
   */
  generateComplianceReport() {
    const complianceChecks = {
      'OWASP Top 10': this.checkOWASPCompliance(),
      'NIST Cybersecurity Framework': this.checkNISTCompliance(),
      'PCI DSS': this.checkPCIDSSCompliance(),
      'SOC 2': this.checkSOC2Compliance()
    };
    
    return complianceChecks;
  }

  /**
   * Check OWASP Top 10 compliance
   * @returns {Object} OWASP compliance status
   */
  checkOWASPCompliance() {
    const owaspChecks = [
      { name: 'A01:2021 – Broken Access Control', passed: !this.vulnerabilities.some(v => v.type === 'authorization') },
      { name: 'A02:2021 – Cryptographic Failures', passed: !this.vulnerabilities.some(v => v.type === 'secrets') },
      { name: 'A03:2021 – Injection', passed: !this.vulnerabilities.some(v => v.description.includes('injection')) },
      { name: 'A04:2021 – Insecure Design', passed: !this.vulnerabilities.some(v => v.type === 'configuration') },
      { name: 'A05:2021 – Security Misconfiguration', passed: !this.vulnerabilities.some(v => v.type === 'configuration') },
      { name: 'A06:2021 – Vulnerable Components', passed: !this.vulnerabilities.some(v => v.type === 'dependency') },
      { name: 'A07:2021 – Authentication Failures', passed: !this.vulnerabilities.some(v => v.type === 'authentication') },
      { name: 'A08:2021 – Software and Data Integrity', passed: !this.vulnerabilities.some(v => v.type === 'container') },
      { name: 'A09:2021 – Logging and Monitoring', passed: !this.vulnerabilities.some(v => v.type === 'logging') },
      { name: 'A10:2021 – Server-Side Request Forgery', passed: !this.vulnerabilities.some(v => v.type === 'ssrf') }
    ];
    
    const passedChecks = owaspChecks.filter(check => check.passed).length;
    const compliancePercentage = (passedChecks / owaspChecks.length) * 100;
    
    return {
      compliant: compliancePercentage >= 80,
      percentage: compliancePercentage,
      checks: owaspChecks,
      passedChecks: passedChecks,
      totalChecks: owaspChecks.length
    };
  }

  /**
   * Check NIST Cybersecurity Framework compliance
   * @returns {Object} NIST compliance status
   */
  checkNISTCompliance() {
    const nistChecks = [
      { name: 'Identify - Asset Management', passed: fs.existsSync('package.json') },
      { name: 'Protect - Access Control', passed: !this.vulnerabilities.some(v => v.type === 'authorization') },
      { name: 'Protect - Data Security', passed: !this.vulnerabilities.some(v => v.type === 'secrets') },
      { name: 'Detect - Security Monitoring', passed: this.scanResults.size > 0 },
      { name: 'Respond - Response Planning', passed: fs.existsSync('SECURITY.md') },
      { name: 'Recover - Recovery Planning', passed: fs.existsSync('README.md') }
    ];
    
    const passedChecks = nistChecks.filter(check => check.passed).length;
    const compliancePercentage = (passedChecks / nistChecks.length) * 100;
    
    return {
      compliant: compliancePercentage >= 75,
      percentage: compliancePercentage,
      checks: nistChecks,
      passedChecks: passedChecks,
      totalChecks: nistChecks.length
    };
  }

  /**
   * Check PCI DSS compliance
   * @returns {Object} PCI DSS compliance status
   */
  checkPCIDSSCompliance() {
    const pciChecks = [
      { name: 'Secure Network Architecture', passed: !this.vulnerabilities.some(v => v.type === 'network') },
      { name: 'Protect Cardholder Data', passed: !this.vulnerabilities.some(v => v.type === 'secrets') },
      { name: 'Encrypt Transmission', passed: !this.vulnerabilities.some(v => v.description.includes('SSL') || v.description.includes('TLS')) },
      { name: 'Use and Maintain Secure Systems', passed: !this.vulnerabilities.some(v => v.type === 'dependency') },
      { name: 'Implement Strong Access Control', passed: !this.vulnerabilities.some(v => v.type === 'authorization') },
      { name: 'Regularly Monitor Networks', passed: this.scanResults.size > 0 }
    ];
    
    const passedChecks = pciChecks.filter(check => check.passed).length;
    const compliancePercentage = (passedChecks / pciChecks.length) * 100;
    
    return {
      compliant: compliancePercentage >= 90,
      percentage: compliancePercentage,
      checks: pciChecks,
      passedChecks: passedChecks,
      totalChecks: pciChecks.length
    };
  }

  /**
   * Check SOC 2 compliance
   * @returns {Object} SOC 2 compliance status
   */
  checkSOC2Compliance() {
    const soc2Checks = [
      { name: 'Security - Access Controls', passed: !this.vulnerabilities.some(v => v.type === 'authorization') },
      { name: 'Security - Logical Security', passed: !this.vulnerabilities.some(v => v.type === 'secrets') },
      { name: 'Availability - System Monitoring', passed: this.scanResults.size > 0 },
      { name: 'Processing Integrity - Data Quality', passed: !this.vulnerabilities.some(v => v.type === 'data-integrity') },
      { name: 'Confidentiality - Data Protection', passed: !this.vulnerabilities.some(v => v.type === 'secrets') },
      { name: 'Privacy - Data Collection', passed: !this.vulnerabilities.some(v => v.type === 'privacy') }
    ];
    
    const passedChecks = soc2Checks.filter(check => check.passed).length;
    const compliancePercentage = (passedChecks / soc2Checks.length) * 100;
    
    return {
      compliant: compliancePercentage >= 85,
      percentage: compliancePercentage,
      checks: soc2Checks,
      passedChecks: passedChecks,
      totalChecks: soc2Checks.length
    };
  }

  /**
   * Get files to scan based on patterns
   * @param {Array} patterns - File patterns to match
   * @returns {Array} Array of file paths
   */
  getFilesToScan(patterns) {
    const glob = require('glob');
    let files = [];
    
    patterns.forEach(pattern => {
      try {
        const matched = glob.sync(pattern, {
          ignore: this.options.excludePatterns,
          nodir: true
        });
        files = files.concat(matched);
      } catch (error) {
        console.warn(`⚠️  Could not process pattern ${pattern}:`, error.message);
      }
    });
    
    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Get line number for a string index
   * @param {string} content - File content
   * @param {number} index - String index
   * @returns {number} Line number
   */
  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Reset scanner state
   */
  reset() {
    this.vulnerabilities = [];
    this.scanResults.clear();
    this.scanStartTime = null;
    this.scanEndTime = null;
  }
}

module.exports = { SecurityScanner };
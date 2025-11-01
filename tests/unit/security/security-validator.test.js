/**
 * Unit tests for Security Validator
 * Tests security validation, authentication, and authorization functionality
 */

const fs = require('fs').promises;
const crypto = require('crypto');

// Mock security validator implementation
class SecurityValidator {
  constructor(config = {}) {
    this.config = {
      maxTokenAge: config.maxTokenAge || 3600000, // 1 hour
      minPasswordLength: config.minPasswordLength || 12,
      requireMFA: config.requireMFA || false,
      allowedOrigins: config.allowedOrigins || ['localhost'],
      secretsPatterns: config.secretsPatterns || [
        /password:\s*[^!]/i,
        /token:\s*[^!]/i,
        /api[_-]?key:\s*[^!]/i,
        /secret:\s*[^!]/i
      ],
      ...config
    };
  }

  validateSecrets(content) {
    const violations = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      this.config.secretsPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          violations.push({
            line: index + 1,
            content: line.trim(),
            pattern: pattern.toString(),
            severity: 'high',
            type: 'hardcoded_secret'
          });
        }
      });

      // Check for insecure protocols
      if (line.includes('http://') && !line.includes('localhost') && !line.includes('127.0.0.1')) {
        violations.push({
          line: index + 1,
          content: line.trim(),
          severity: 'medium',
          type: 'insecure_protocol',
          message: 'HTTP protocol detected, should use HTTPS'
        });
      }

      // Check for weak encryption
      if (line.includes('md5') || line.includes('sha1')) {
        violations.push({
          line: index + 1,
          content: line.trim(),
          severity: 'medium',
          type: 'weak_encryption',
          message: 'Weak encryption algorithm detected'
        });
      }
    });

    return {
      valid: violations.length === 0,
      violations,
      score: this.calculateSecurityScore(violations)
    };
  }

  calculateSecurityScore(violations) {
    const severityWeights = { high: 10, medium: 5, low: 1 };
    const penalty = violations.reduce((sum, v) => sum + (severityWeights[v.severity] || 1), 0);
    return Math.max(0, 100 - penalty);
  }

  validateToken(token) {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }

    // Check token format
    if (typeof token !== 'string' || token.length < 32) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Check if token appears to be a test token
    if (token.includes('test') || token.includes('demo') || token.includes('example')) {
      return {
        valid: true,
        warning: 'Test token detected - not suitable for production',
        isTestToken: true
      };
    }

    // Check token entropy
    const entropy = this.calculateEntropy(token);
    if (entropy < 4.0) {
      return { valid: false, error: 'Token has insufficient entropy' };
    }

    return { valid: true, entropy };
  }

  calculateEntropy(str) {
    const chars = {};
    for (let char of str) {
      chars[char] = (chars[char] || 0) + 1;
    }

    const len = str.length;
    return Object.values(chars).reduce((entropy, count) => {
      const p = count / len;
      return entropy - p * Math.log2(p);
    }, 0);
  }

  validateCORS(origin, allowedOrigins = this.config.allowedOrigins) {
    if (!origin) {
      return { valid: false, error: 'Origin header is required' };
    }

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        return origin.endsWith(domain);
      }
      return origin === allowed || origin.endsWith('://' + allowed);
    });

    return {
      valid: isAllowed,
      origin,
      allowedOrigins,
      error: isAllowed ? null : 'Origin not allowed'
    };
  }

  validateWebhookSignature(payload, signature, secret) {
    if (!signature) {
      return { valid: false, error: 'Signature is required' };
    }

    if (!signature.startsWith('sha256=')) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return {
      valid: isValid,
      algorithm: 'sha256',
      error: isValid ? null : 'Invalid signature'
    };
  }

  validatePassword(password) {
    const issues = [];

    if (!password) {
      return { valid: false, error: 'Password is required' };
    }

    if (password.length < this.config.minPasswordLength) {
      issues.push(`Password must be at least ${this.config.minPasswordLength} characters`);
    }

    if (!/[A-Z]/.test(password)) {
      issues.push('Password must contain uppercase letters');
    }

    if (!/[a-z]/.test(password)) {
      issues.push('Password must contain lowercase letters');
    }

    if (!/\d/.test(password)) {
      issues.push('Password must contain numbers');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      issues.push('Password must contain special characters');
    }

    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
      issues.push('Password must not contain repeated characters');
    }

    if (/123|abc|qwe|asd|zxc/i.test(password)) {
      issues.push('Password must not contain common sequences');
    }

    return {
      valid: issues.length === 0,
      issues,
      strength: this.calculatePasswordStrength(password)
    };
  }

  calculatePasswordStrength(password) {
    let score = 0;

    // Length bonus
    score += Math.min(password.length * 2, 25);

    // Character variety bonus
    if (/[a-z]/.test(password)) score += 5;
    if (/[A-Z]/.test(password)) score += 5;
    if (/\d/.test(password)) score += 5;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 10;

    // Entropy bonus
    const entropy = this.calculateEntropy(password);
    score += Math.min(entropy * 2, 20);

    return Math.min(score, 100);
  }

  validateRateLimit(requests, windowMs, maxRequests) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Filter requests within the time window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    return {
      valid: recentRequests.length < maxRequests,
      currentRequests: recentRequests.length,
      maxRequests,
      windowMs,
      resetTime: windowStart + windowMs
    };
  }

  validateFileAccess(filePath, allowedPaths = []) {
    // Prevent path traversal attacks
    if (filePath.includes('..') || filePath.includes('~')) {
      return { valid: false, error: 'Path traversal detected' };
    }

    // Check against allowed paths
    const isAllowed = allowedPaths.some(allowed => {
      return filePath.startsWith(allowed);
    });

    return {
      valid: isAllowed,
      filePath,
      allowedPaths,
      error: isAllowed ? null : 'File access not allowed'
    };
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove or escape potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  validateInputSanitization(input) {
    const original = input;
    const sanitized = this.sanitizeInput(input);
    
    return {
      original,
      sanitized,
      modified: original !== sanitized,
      safe: !/<script|javascript:|on\w+\s*=/i.test(sanitized)
    };
  }
}

describe('SecurityValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('secrets validation', () => {
    it('should detect hardcoded secrets', () => {
      const content = `
homeassistant:
  name: Home
mqtt:
  username: user
  password: hardcoded123
  token: abc123def456
api_key: secret_key_here
`;

      const result = validator.validateSecrets(content);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(3);
      expect(result.violations.some(v => v.type === 'hardcoded_secret')).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('should pass validation for properly configured secrets', () => {
      const content = `
homeassistant:
  name: Home
mqtt:
  username: user
  password: !secret mqtt_password
  token: !secret mqtt_token
api_key: !secret api_key
`;

      const result = validator.validateSecrets(content);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should detect insecure protocols', () => {
      const content = `
http:
  base_url: http://example.com
  internal_url: http://localhost:8123
`;

      const result = validator.validateSecrets(content);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'insecure_protocol')).toBe(true);
      expect(result.violations.some(v => v.content.includes('localhost'))).toBe(false);
    });

    it('should detect weak encryption algorithms', () => {
      const content = `
encryption:
  algorithm: md5
  hash: sha1
`;

      const result = validator.validateSecrets(content);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'weak_encryption')).toBe(true);
    });
  });

  describe('token validation', () => {
    it('should validate strong tokens', () => {
      const strongToken = 'abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz';
      
      const result = validator.validateToken(strongToken);

      expect(result.valid).toBe(true);
      expect(result.entropy).toBeGreaterThan(3.0);
    });

    it('should reject missing tokens', () => {
      const result = validator.validateToken(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token is required');
    });

    it('should reject short tokens', () => {
      const result = validator.validateToken('short');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });

    it('should detect test tokens', () => {
      const result = validator.validateToken('test-token-for-development-purposes-only');

      expect(result.valid).toBe(true);
      expect(result.warning).toContain('Test token detected');
      expect(result.isTestToken).toBe(true);
    });

    it('should reject tokens with low entropy', () => {
      const lowEntropyToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      
      const result = validator.validateToken(lowEntropyToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('insufficient entropy');
    });
  });

  describe('CORS validation', () => {
    it('should validate allowed origins', () => {
      const result = validator.validateCORS('http://localhost:3000', ['localhost', 'example.com']);

      expect(result.valid).toBe(true);
      expect(result.origin).toBe('http://localhost:3000');
    });

    it('should reject disallowed origins', () => {
      const result = validator.validateCORS('http://malicious.com', ['localhost', 'example.com']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Origin not allowed');
    });

    it('should handle wildcard origins', () => {
      const result = validator.validateCORS('http://malicious.com', ['*']);

      expect(result.valid).toBe(true);
    });

    it('should handle subdomain wildcards', () => {
      const result = validator.validateCORS('http://api.example.com', ['*.example.com']);

      expect(result.valid).toBe(true);
    });

    it('should require origin header', () => {
      const result = validator.validateCORS(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Origin header is required');
    });
  });

  describe('webhook signature validation', () => {
    it('should validate correct webhook signatures', () => {
      const payload = { test: 'data' };
      const secret = 'webhook-secret';
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const result = validator.validateWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(true);
      expect(result.algorithm).toBe('sha256');
    });

    it('should reject invalid signatures', () => {
      const payload = { test: 'data' };
      const secret = 'webhook-secret';
      const invalidSignature = 'sha256=invalid';

      const result = validator.validateWebhookSignature(payload, invalidSignature, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should require signature', () => {
      const result = validator.validateWebhookSignature({}, null, 'secret');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature is required');
    });

    it('should require proper signature format', () => {
      const result = validator.validateWebhookSignature({}, 'invalid-format', 'secret');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature format');
    });
  });

  describe('password validation', () => {
    it('should validate strong passwords', () => {
      const strongPassword = 'MyStr0ng!P@ssw0rd123';
      
      const result = validator.validatePassword(strongPassword);

      expect(result.valid).toBe(true);
      expect(result.strength).toBeGreaterThan(80);
    });

    it('should reject weak passwords', () => {
      const weakPassword = 'password';
      
      const result = validator.validatePassword(weakPassword);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.strength).toBeLessThan(50);
    });

    it('should enforce minimum length', () => {
      const shortPassword = 'Sh0rt!';
      
      const result = validator.validatePassword(shortPassword);

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('at least'))).toBe(true);
    });

    it('should require character variety', () => {
      const result = validator.validatePassword('alllowercase123');

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('uppercase'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('special'))).toBe(true);
    });

    it('should detect common patterns', () => {
      const result = validator.validatePassword('Password123abc');

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('common sequences'))).toBe(true);
    });

    it('should detect repeated characters', () => {
      const result = validator.validatePassword('Passsssword123!');

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('repeated characters'))).toBe(true);
    });
  });

  describe('rate limiting validation', () => {
    it('should pass rate limit when under threshold', () => {
      const now = Date.now();
      const requests = [now - 1000, now - 2000, now - 3000]; // 3 requests in last minute
      
      const result = validator.validateRateLimit(requests, 60000, 10);

      expect(result.valid).toBe(true);
      expect(result.currentRequests).toBe(3);
      expect(result.maxRequests).toBe(10);
    });

    it('should fail rate limit when over threshold', () => {
      const now = Date.now();
      const requests = Array(15).fill(null).map((_, i) => now - (i * 1000)); // 15 requests in last minute
      
      const result = validator.validateRateLimit(requests, 60000, 10);

      expect(result.valid).toBe(false);
      expect(result.currentRequests).toBe(15);
      expect(result.maxRequests).toBe(10);
    });

    it('should ignore old requests outside window', () => {
      const now = Date.now();
      const requests = [
        now - 1000,     // Recent
        now - 30000,    // Recent
        now - 120000,   // Too old (outside 60s window)
        now - 180000    // Too old
      ];
      
      const result = validator.validateRateLimit(requests, 60000, 10);

      expect(result.valid).toBe(true);
      expect(result.currentRequests).toBe(2); // Only recent requests counted
    });
  });

  describe('file access validation', () => {
    it('should allow access to permitted paths', () => {
      const result = validator.validateFileAccess('/config/automation.yaml', ['/config', '/templates']);

      expect(result.valid).toBe(true);
    });

    it('should deny access to unpermitted paths', () => {
      const result = validator.validateFileAccess('/etc/passwd', ['/config', '/templates']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('File access not allowed');
    });

    it('should detect path traversal attempts', () => {
      const result = validator.validateFileAccess('/config/../etc/passwd', ['/config']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Path traversal detected');
    });

    it('should detect home directory access attempts', () => {
      const result = validator.validateFileAccess('/config/~/secrets', ['/config']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Path traversal detected');
    });
  });

  describe('input sanitization', () => {
    it('should sanitize potentially dangerous input', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      
      const result = validator.validateInputSanitization(maliciousInput);

      expect(result.modified).toBe(true);
      expect(result.safe).toBe(true);
      expect(result.sanitized).not.toContain('<script>');
    });

    it('should remove javascript protocols', () => {
      const input = 'javascript:alert("xss")';
      
      const result = validator.validateInputSanitization(input);

      expect(result.modified).toBe(true);
      expect(result.sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'onclick="malicious()"';
      
      const result = validator.validateInputSanitization(input);

      expect(result.modified).toBe(true);
      expect(result.sanitized).not.toContain('onclick=');
    });

    it('should pass clean input unchanged', () => {
      const cleanInput = 'This is safe input';
      
      const result = validator.validateInputSanitization(cleanInput);

      expect(result.modified).toBe(false);
      expect(result.safe).toBe(true);
      expect(result.sanitized).toBe(cleanInput);
    });
  });

  describe('security scoring', () => {
    it('should calculate security scores correctly', () => {
      const violations = [
        { severity: 'high' },
        { severity: 'medium' },
        { severity: 'low' }
      ];

      const score = validator.calculateSecurityScore(violations);

      expect(score).toBe(84); // 100 - (10 + 5 + 1)
    });

    it('should not go below zero', () => {
      const manyViolations = Array(20).fill({ severity: 'high' });

      const score = validator.calculateSecurityScore(manyViolations);

      expect(score).toBe(0);
    });
  });

  describe('entropy calculation', () => {
    it('should calculate entropy for diverse strings', () => {
      const diverseString = 'AbCdEf123!@#';
      
      const entropy = validator.calculateEntropy(diverseString);

      expect(entropy).toBeGreaterThan(3.0);
    });

    it('should calculate low entropy for repetitive strings', () => {
      const repetitiveString = 'aaaaaaaaaa';
      
      const entropy = validator.calculateEntropy(repetitiveString);

      expect(entropy).toBeLessThan(1.0);
    });
  });
});
const validator = require('validator');
const { body, param, query, validationResult } = require('express-validator');
const { AuditLogger } = require('../utils/audit-logger');
const { Logger } = require('../utils/logger');

/**
 * Enhanced Input Validation Middleware
 * Provides comprehensive request validation with security protections
 */
class ValidationMiddleware {
  constructor() {
    this.logger = new Logger('ValidationMiddleware');
  }

  /**
   * Request validation middleware
   */
  validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const validationErrors = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      }));

      AuditLogger.logSecurityEvent({
        type: 'validation-failure',
        endpoint: req.path,
        method: req.method,
        errors: validationErrors,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.auth?.userId || null
      });

      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validationErrors,
          timestamp: new Date().toISOString()
        }
      });
    }

    next();
  };

  /**
   * Deployment validation rules
   */
  validateDeploymentRequest() {
    return [
      body('repository')
        .isString()
        .matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)
        .withMessage('Repository must be in format owner/repo')
        .isLength({ max: 100 })
        .withMessage('Repository name too long'),
      
      body('branch')
        .isString()
        .matches(/^[a-zA-Z0-9/_.-]+$/)
        .withMessage('Branch name contains invalid characters')
        .isLength({ max: 50 })
        .withMessage('Branch name too long'),
      
      body('commit')
        .optional()
        .isString()
        .matches(/^[a-f0-9]{7,40}$/)
        .withMessage('Commit hash must be valid SHA'),
      
      body('reason')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Reason must be less than 500 characters')
        .custom(this.sanitizeText),
      
      body('skipHealthCheck')
        .optional()
        .isBoolean()
        .withMessage('skipHealthCheck must be boolean'),
      
      body('createBackup')
        .optional()
        .isBoolean()
        .withMessage('createBackup must be boolean'),
      
      body('environment')
        .optional()
        .isString()
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Environment name contains invalid characters')
        .isLength({ max: 20 })
        .withMessage('Environment name too long'),
      
      this.validateRequest
    ];
  }

  /**
   * Rollback validation rules
   */
  validateRollbackRequest() {
    return [
      body('deploymentId')
        .isString()
        .matches(/^[a-zA-Z0-9-]+$/)
        .withMessage('Invalid deployment ID format')
        .isLength({ max: 50 })
        .withMessage('Deployment ID too long'),
      
      body('reason')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Reason must be less than 500 characters')
        .custom(this.sanitizeText),
      
      body('skipValidation')
        .optional()
        .isBoolean()
        .withMessage('skipValidation must be boolean'),
      
      this.validateRequest
    ];
  }

  /**
   * Webhook validation rules
   */
  validateWebhookRequest() {
    return [
      body('repository.name')
        .isString()
        .matches(/^[a-zA-Z0-9._-]+$/)
        .withMessage('Invalid repository name format'),
      
      body('repository.full_name')
        .isString()
        .matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)
        .withMessage('Invalid repository full name format'),
      
      body('ref')
        .optional()
        .isString()
        .matches(/^refs\/[a-zA-Z0-9/_.-]+$/)
        .withMessage('Invalid Git reference format'),
      
      body('head_commit.id')
        .optional()
        .isString()
        .matches(/^[a-f0-9]{40}$/)
        .withMessage('Invalid commit hash'),
      
      this.validateRequest
    ];
  }

  /**
   * User management validation rules
   */
  validateUserRequest() {
    return [
      body('username')
        .isString()
        .matches(/^[a-zA-Z0-9._-]+$/)
        .withMessage('Username contains invalid characters')
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be 3-30 characters'),
      
      body('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
      
      body('password')
        .optional()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase, lowercase, number and special character'),
      
      body('role')
        .optional()
        .isString()
        .isIn(['admin', 'operator', 'viewer'])
        .withMessage('Invalid role'),
      
      this.validateRequest
    ];
  }

  /**
   * API key validation rules
   */
  validateApiKeyRequest() {
    return [
      body('name')
        .isString()
        .matches(/^[a-zA-Z0-9 ._-]+$/)
        .withMessage('API key name contains invalid characters')
        .isLength({ min: 3, max: 50 })
        .withMessage('API key name must be 3-50 characters'),
      
      body('permissions')
        .isArray()
        .withMessage('Permissions must be an array')
        .custom((permissions) => {
          const validPermissions = [
            'deployment:read', 'deployment:write', 'deployment:rollback',
            'webhook:receive', 'monitoring:read', 'audit:read'
          ];
          
          return permissions.every(perm => validPermissions.includes(perm));
        })
        .withMessage('Invalid permissions specified'),
      
      body('expiresIn')
        .optional()
        .isString()
        .matches(/^\d+[smhdwy]$/)
        .withMessage('Invalid expiration format (use format like: 30d, 6m, 1y)'),
      
      this.validateRequest
    ];
  }

  /**
   * Path traversal prevention
   */
  sanitizePath(path) {
    if (typeof path !== 'string') return path;
    
    // Remove dangerous characters and sequences
    const sanitized = path
      .replace(/\.\./g, '')
      .replace(/[<>:"|?*\0]/g, '')
      .replace(/\\/g, '/')
      .trim();
    
    // Normalize path
    const normalized = require('path').normalize(sanitized);
    
    // Ensure path doesn't escape allowed directories
    if (normalized.startsWith('../') || normalized.includes('/../')) {
      throw new Error('Path traversal attempt detected');
    }
    
    // Limit path length
    if (normalized.length > 255) {
      throw new Error('Path too long');
    }
    
    return normalized;
  }

  /**
   * SQL injection prevention
   */
  sanitizeSQL(input) {
    if (typeof input !== 'string') return input;
    
    // Basic SQL injection prevention
    const dangerous = [
      'DROP', 'DELETE', 'INSERT', 'UPDATE', 'UNION', 'SELECT',
      'CREATE', 'ALTER', 'EXEC', 'EXECUTE',
      '--', ';', '/*', '*/', 'xp_', 'sp_'
    ];
    
    const upperInput = input.toUpperCase();
    
    for (const keyword of dangerous) {
      if (upperInput.includes(keyword)) {
        throw new Error('Potentially dangerous SQL content detected');
      }
    }
    
    return input;
  }

  /**
   * XSS prevention
   */
  sanitizeHTML(input) {
    if (typeof input !== 'string') return input;
    
    return validator.escape(input);
  }

  /**
   * Command injection prevention
   */
  sanitizeCommand(input) {
    if (typeof input !== 'string') return input;
    
    // Remove dangerous shell characters
    const dangerous = ['|', '&', ';', '`', '\\', '<', '>', '(', ')', '{', '}', '[', ']', '$', '!'];
    
    for (const char of dangerous) {
      if (input.includes(char)) {
        throw new Error('Potentially dangerous command content detected');
      }
    }
    
    // Limit command length
    if (input.length > 100) {
      throw new Error('Command too long');
    }
    
    return input;
  }

  /**
   * Text sanitization for user input
   */
  sanitizeText = (value) => {
    if (typeof value !== 'string') return true;
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+=/gi,
      /data:text\/html/gi
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) {
        throw new Error('Potentially dangerous content detected');
      }
    }
    
    return true;
  };

  /**
   * JSON schema validation
   */
  validateJSONSchema(schema) {
    return (req, res, next) => {
      try {
        const Ajv = require('ajv');
        const ajv = new Ajv();
        const validate = ajv.compile(schema);
        
        const valid = validate(req.body);
        
        if (!valid) {
          const errors = validate.errors.map(error => ({
            field: error.instancePath || error.dataPath,
            message: error.message,
            value: error.data
          }));
          
          return res.status(400).json({
            status: 'error',
            error: {
              code: 'SCHEMA_VALIDATION_ERROR',
              message: 'Request does not match required schema',
              details: errors,
              timestamp: new Date().toISOString()
            }
          });
        }
        
        next();
      } catch (error) {
        this.logger.error('Schema validation error:', error);
        
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'SCHEMA_VALIDATION_ERROR',
            message: 'Schema validation failed',
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  }

  /**
   * File upload validation
   */
  validateFileUpload(options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'text/plain'],
      maxFiles = 1
    } = options;
    
    return (req, res, next) => {
      if (!req.files || Object.keys(req.files).length === 0) {
        return next();
      }
      
      const files = Array.isArray(req.files) ? req.files : Object.values(req.files);
      
      if (files.length > maxFiles) {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'TOO_MANY_FILES',
            message: `Maximum ${maxFiles} files allowed`,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          return res.status(413).json({
            status: 'error',
            error: {
              code: 'FILE_TOO_LARGE',
              message: `File size exceeds ${maxSize} bytes`,
              timestamp: new Date().toISOString()
            }
          });
        }
        
        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            status: 'error',
            error: {
              code: 'INVALID_FILE_TYPE',
              message: `File type ${file.mimetype} not allowed`,
              allowedTypes: allowedTypes,
              timestamp: new Date().toISOString()
            }
          });
        }
        
        // Check for suspicious file names
        if (this.hasSuspiciousFileName(file.name)) {
          AuditLogger.logSecurityEvent({
            type: 'suspicious-file-upload',
            fileName: file.name,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.auth?.userId || null
          });
          
          return res.status(400).json({
            status: 'error',
            error: {
              code: 'SUSPICIOUS_FILE_NAME',
              message: 'File name contains suspicious patterns',
              timestamp: new Date().toISOString()
            }
          });
        }
      }
      
      next();
    };
  }

  /**
   * Check for suspicious file names
   */
  hasSuspiciousFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') return true;
    
    const suspiciousPatterns = [
      /\.\./,
      /^\./, // Hidden files
      /\.(exe|bat|cmd|scr|vbs|js|jar|com|pif)$/i,
      /[<>:"|?*\0]/,
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i // Windows reserved names
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Input sanitization middleware
   */
  sanitizeInput() {
    return (req, res, next) => {
      try {
        // Sanitize query parameters
        if (req.query) {
          req.query = this.sanitizeObject(req.query);
        }

        // Sanitize body parameters
        if (req.body) {
          req.body = this.sanitizeObject(req.body);
        }

        // Sanitize URL parameters
        if (req.params) {
          req.params = this.sanitizeObject(req.params);
        }

        next();
      } catch (error) {
        this.logger.error('Input sanitization error:', error);
        
        AuditLogger.logSecurityEvent({
          type: 'input-sanitization-error',
          error: error.message,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path
        });
        
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'INPUT_SANITIZATION_ERROR',
            message: 'Invalid input detected',
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  }

  /**
   * Recursively sanitize an object
   */
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? this.sanitizeString(obj) : obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeString(key);
      sanitized[sanitizedKey] = this.sanitizeObject(value);
    }
    
    return sanitized;
  }

  /**
   * Sanitize string input
   */
  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    // Remove null bytes
    str = str.replace(/\0/g, '');
    
    // Limit string length
    if (str.length > 10000) {
      throw new Error('String too long');
    }
    
    return str.trim();
  }

  /**
   * Request size limiting middleware
   */
  limitRequestSize(maxSize = 1024 * 1024) { // 1MB default
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxSize) {
        AuditLogger.logSecurityEvent({
          type: 'request-size-exceeded',
          contentLength: contentLength,
          maxSize: maxSize,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path
        });
        
        return res.status(413).json({
          status: 'error',
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body exceeds maximum allowed size of ${maxSize} bytes`,
            maxSize: maxSize,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      next();
    };
  }
}

// Create singleton instance
const validationMiddleware = new ValidationMiddleware();

module.exports = {
  validateRequest: validationMiddleware.validateRequest,
  validateDeploymentRequest: validationMiddleware.validateDeploymentRequest.bind(validationMiddleware),
  validateRollbackRequest: validationMiddleware.validateRollbackRequest.bind(validationMiddleware),
  validateWebhookRequest: validationMiddleware.validateWebhookRequest.bind(validationMiddleware),
  validateUserRequest: validationMiddleware.validateUserRequest.bind(validationMiddleware),
  validateApiKeyRequest: validationMiddleware.validateApiKeyRequest.bind(validationMiddleware),
  validateJSONSchema: validationMiddleware.validateJSONSchema.bind(validationMiddleware),
  validateFileUpload: validationMiddleware.validateFileUpload.bind(validationMiddleware),
  sanitizeInput: validationMiddleware.sanitizeInput.bind(validationMiddleware),
  limitRequestSize: validationMiddleware.limitRequestSize.bind(validationMiddleware),
  sanitizePath: validationMiddleware.sanitizePath,
  sanitizeSQL: validationMiddleware.sanitizeSQL,
  sanitizeHTML: validationMiddleware.sanitizeHTML,
  sanitizeCommand: validationMiddleware.sanitizeCommand,
  ValidationMiddleware
};
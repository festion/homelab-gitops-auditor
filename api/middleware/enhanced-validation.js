const validator = require('validator');
const xss = require('xss');
const path = require('path');
const { auditLogger } = require('../utils/auditLogger');

class EnhancedValidationMiddleware {
  constructor() {
    // XSS filter configuration
    this.xssOptions = {
      whiteList: {
        // Allow only safe HTML tags and attributes
        p: [],
        br: [],
        strong: [],
        em: [],
        u: [],
        code: [],
        pre: [],
        span: ['class'],
        div: ['class']
      },
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
      allowCommentTag: false
    };

    // SQL injection patterns
    this.sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /('|\'|;|\||<|>)/gi,
      /(\/\*.*?\*\/)/gi,
      /(-{2,})/gi
    ];

    // Command injection patterns
    this.commandInjectionPatterns = [
      /[;&|`$(){}[\]]/g,
      /\b(cat|ls|ps|pwd|id|whoami|uname|netstat|ping|wget|curl|nc|ncat|telnet|ssh|scp|rsync)\b/gi,
      /\|\s*(cat|ls|ps|pwd|id|whoami|uname|netstat|ping|wget|curl|nc|ncat|telnet|ssh|scp|rsync)/gi
    ];

    // Path traversal patterns
    this.pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.\\/g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /\.\.%2f/gi,
      /\.\.%5c/gi
    ];

    // File upload restrictions
    this.allowedFileTypes = [
      '.txt', '.json', '.yaml', '.yml', '.md', '.log',
      '.jpg', '.jpeg', '.png', '.gif', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx'
    ];

    this.maxFileSize = 10 * 1024 * 1024; // 10MB
  }

  // Main validation middleware
  validateInput = (options = {}) => {
    return async (req, res, next) => {
      try {
        const validationResult = {
          isValid: true,
          errors: [],
          sanitized: {}
        };

        // Validate and sanitize request body
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyValidation = await this.validateObject(req.body, options.bodyRules || {});
          if (!bodyValidation.isValid) {
            validationResult.isValid = false;
            validationResult.errors.push(...bodyValidation.errors);
          }
          validationResult.sanitized.body = bodyValidation.sanitized;
        }

        // Validate and sanitize query parameters
        if (req.query && Object.keys(req.query).length > 0) {
          const queryValidation = await this.validateObject(req.query, options.queryRules || {});
          if (!queryValidation.isValid) {
            validationResult.isValid = false;
            validationResult.errors.push(...queryValidation.errors);
          }
          validationResult.sanitized.query = queryValidation.sanitized;
        }

        // Validate and sanitize path parameters
        if (req.params && Object.keys(req.params).length > 0) {
          const paramsValidation = await this.validateObject(req.params, options.paramRules || {});
          if (!paramsValidation.isValid) {
            validationResult.isValid = false;
            validationResult.errors.push(...paramsValidation.errors);
          }
          validationResult.sanitized.params = paramsValidation.sanitized;
        }

        // Log security violations
        if (!validationResult.isValid) {
          await auditLogger.log('validation_failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            errors: validationResult.errors,
            originalData: {
              body: req.body,
              query: req.query,
              params: req.params
            }
          });

          return res.status(400).json({
            error: 'Validation failed',
            message: 'Invalid or malicious input detected',
            errors: options.showDetails ? validationResult.errors : ['Invalid input detected']
          });
        }

        // Replace original data with sanitized versions
        if (validationResult.sanitized.body) {
          req.body = validationResult.sanitized.body;
        }
        if (validationResult.sanitized.query) {
          req.query = validationResult.sanitized.query;
        }
        if (validationResult.sanitized.params) {
          req.params = validationResult.sanitized.params;
        }

        next();
      } catch (error) {
        await auditLogger.log('validation_error', {
          ip: req.ip,
          endpoint: req.path,
          error: error.message
        });

        return res.status(500).json({
          error: 'Validation error',
          message: 'Internal validation error occurred'
        });
      }
    };
  };

  // Validate object against rules
  async validateObject(obj, rules) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: {}
    };

    for (const [key, value] of Object.entries(obj)) {
      const rule = rules[key] || { type: 'string', required: false };
      const fieldValidation = await this.validateField(key, value, rule);

      if (!fieldValidation.isValid) {
        result.isValid = false;
        result.errors.push(...fieldValidation.errors);
      }

      result.sanitized[key] = fieldValidation.sanitized;
    }

    return result;
  }

  // Validate individual field
  async validateField(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    // Check if field is required
    if (rule.required && (value === undefined || value === null || value === '')) {
      result.isValid = false;
      result.errors.push(`${fieldName} is required`);
      return result;
    }

    // Skip validation if value is empty and not required
    if (!rule.required && (value === undefined || value === null || value === '')) {
      result.sanitized = value;
      return result;
    }

    // Type validation and sanitization
    switch (rule.type) {
      case 'string':
        const stringValidation = await this.validateString(fieldName, value, rule);
        result.isValid = stringValidation.isValid;
        result.errors = stringValidation.errors;
        result.sanitized = stringValidation.sanitized;
        break;

      case 'number':
        const numberValidation = this.validateNumber(fieldName, value, rule);
        result.isValid = numberValidation.isValid;
        result.errors = numberValidation.errors;
        result.sanitized = numberValidation.sanitized;
        break;

      case 'email':
        const emailValidation = this.validateEmail(fieldName, value, rule);
        result.isValid = emailValidation.isValid;
        result.errors = emailValidation.errors;
        result.sanitized = emailValidation.sanitized;
        break;

      case 'url':
        const urlValidation = this.validateUrl(fieldName, value, rule);
        result.isValid = urlValidation.isValid;
        result.errors = urlValidation.errors;
        result.sanitized = urlValidation.sanitized;
        break;

      case 'path':
        const pathValidation = await this.validatePath(fieldName, value, rule);
        result.isValid = pathValidation.isValid;
        result.errors = pathValidation.errors;
        result.sanitized = pathValidation.sanitized;
        break;

      case 'array':
        const arrayValidation = await this.validateArray(fieldName, value, rule);
        result.isValid = arrayValidation.isValid;
        result.errors = arrayValidation.errors;
        result.sanitized = arrayValidation.sanitized;
        break;

      case 'object':
        if (typeof value === 'object' && value !== null) {
          result.sanitized = await this.sanitizeObject(value);
        } else {
          result.isValid = false;
          result.errors.push(`${fieldName} must be an object`);
        }
        break;

      default:
        result.sanitized = await this.sanitizeString(value);
    }

    return result;
  }

  // String validation and sanitization
  async validateString(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    if (typeof value !== 'string') {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a string`);
      return result;
    }

    // Length validation
    if (rule.minLength && value.length < rule.minLength) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be no more than ${rule.maxLength} characters long`);
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} format is invalid`);
    }

    // Security validations
    if (await this.containsSqlInjection(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} contains potentially malicious SQL patterns`);
    }

    if (await this.containsCommandInjection(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} contains potentially malicious command patterns`);
    }

    if (await this.containsPathTraversal(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} contains path traversal patterns`);
    }

    // Sanitize the string
    result.sanitized = await this.sanitizeString(value);

    return result;
  }

  // Number validation
  validateNumber(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    const numValue = Number(value);

    if (isNaN(numValue)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a valid number`);
      return result;
    }

    if (rule.min !== undefined && numValue < rule.min) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && numValue > rule.max) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be no more than ${rule.max}`);
    }

    if (rule.integer && !Number.isInteger(numValue)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be an integer`);
    }

    result.sanitized = numValue;
    return result;
  }

  // Email validation
  validateEmail(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    if (typeof value !== 'string' || !validator.isEmail(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a valid email address`);
      return result;
    }

    result.sanitized = validator.normalizeEmail(value) || value;
    return result;
  }

  // URL validation
  validateUrl(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    if (typeof value !== 'string' || !validator.isURL(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a valid URL`);
      return result;
    }

    // Additional security check for malicious URLs
    const sanitizedUrl = value.replace(/[<>"']/g, '');
    result.sanitized = sanitizedUrl;

    return result;
  }

  // Path validation
  async validatePath(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    if (typeof value !== 'string') {
      result.isValid = false;
      result.errors.push(`${fieldName} must be a string`);
      return result;
    }

    // Check for path traversal
    if (await this.containsPathTraversal(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} contains invalid path characters`);
      return result;
    }

    // Normalize and validate path
    try {
      const normalizedPath = path.normalize(value);
      
      // Ensure path doesn't escape intended directory
      if (rule.basePath && !normalizedPath.startsWith(rule.basePath)) {
        result.isValid = false;
        result.errors.push(`${fieldName} must be within allowed directory`);
        return result;
      }

      result.sanitized = normalizedPath;
    } catch (error) {
      result.isValid = false;
      result.errors.push(`${fieldName} is not a valid path`);
    }

    return result;
  }

  // Array validation
  async validateArray(fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      sanitized: value
    };

    if (!Array.isArray(value)) {
      result.isValid = false;
      result.errors.push(`${fieldName} must be an array`);
      return result;
    }

    if (rule.minItems && value.length < rule.minItems) {
      result.isValid = false;
      result.errors.push(`${fieldName} must have at least ${rule.minItems} items`);
    }

    if (rule.maxItems && value.length > rule.maxItems) {
      result.isValid = false;
      result.errors.push(`${fieldName} must have no more than ${rule.maxItems} items`);
    }

    // Validate each item if itemRule is specified
    if (rule.itemRule) {
      const sanitizedArray = [];
      for (let i = 0; i < value.length; i++) {
        const itemValidation = await this.validateField(`${fieldName}[${i}]`, value[i], rule.itemRule);
        if (!itemValidation.isValid) {
          result.isValid = false;
          result.errors.push(...itemValidation.errors);
        }
        sanitizedArray.push(itemValidation.sanitized);
      }
      result.sanitized = sanitizedArray;
    } else {
      // Just sanitize strings in the array
      result.sanitized = await Promise.all(
        value.map(item => typeof item === 'string' ? this.sanitizeString(item) : item)
      );
    }

    return result;
  }

  // Security check methods
  async containsSqlInjection(value) {
    if (typeof value !== 'string') return false;
    
    return this.sqlInjectionPatterns.some(pattern => pattern.test(value));
  }

  async containsCommandInjection(value) {
    if (typeof value !== 'string') return false;
    
    return this.commandInjectionPatterns.some(pattern => pattern.test(value));
  }

  async containsPathTraversal(value) {
    if (typeof value !== 'string') return false;
    
    return this.pathTraversalPatterns.some(pattern => pattern.test(value));
  }

  // Sanitization methods
  async sanitizeString(value) {
    if (typeof value !== 'string') return value;
    
    // Remove XSS threats
    let sanitized = xss(value, this.xssOptions);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');
    
    return sanitized;
  }

  async sanitizeObject(obj) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = await this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = await this.sanitizeObject(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = await Promise.all(
          value.map(item => typeof item === 'string' ? this.sanitizeString(item) : item)
        );
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // File upload validation
  validateFileUpload = (options = {}) => {
    return async (req, res, next) => {
      try {
        if (!req.file && !req.files) {
          return next();
        }

        const files = req.files ? Object.values(req.files).flat() : [req.file];

        for (const file of files) {
          // Check file size
          if (file.size > (options.maxSize || this.maxFileSize)) {
            await auditLogger.log('file_upload_rejected', {
              reason: 'size_exceeded',
              filename: file.originalname,
              size: file.size,
              maxSize: options.maxSize || this.maxFileSize,
              ip: req.ip
            });

            return res.status(400).json({
              error: 'File too large',
              message: `File size exceeds maximum allowed size of ${(options.maxSize || this.maxFileSize) / (1024 * 1024)}MB`
            });
          }

          // Check file type
          const fileExt = path.extname(file.originalname).toLowerCase();
          const allowedTypes = options.allowedTypes || this.allowedFileTypes;

          if (!allowedTypes.includes(fileExt)) {
            await auditLogger.log('file_upload_rejected', {
              reason: 'invalid_type',
              filename: file.originalname,
              extension: fileExt,
              allowedTypes,
              ip: req.ip
            });

            return res.status(400).json({
              error: 'Invalid file type',
              message: `File type ${fileExt} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
            });
          }

          // Sanitize filename
          file.originalname = this.sanitizeFilename(file.originalname);
        }

        next();
      } catch (error) {
        await auditLogger.log('file_validation_error', {
          error: error.message,
          ip: req.ip
        });

        return res.status(500).json({
          error: 'File validation error',
          message: 'Error occurred during file validation'
        });
      }
    };
  };

  sanitizeFilename(filename) {
    // Remove path separators and dangerous characters
    let sanitized = filename.replace(/[\/\\:*?"<>|]/g, '');
    
    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^\.+|\.+$/g, '').trim();
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      sanitized = name.substring(0, 255 - ext.length) + ext;
    }
    
    return sanitized || 'file';
  }
}

module.exports = new EnhancedValidationMiddleware();
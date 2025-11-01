const Joi = require('joi');

class Validator {
  constructor(config = {}) {
    this.config = config;
    this.schemas = this.buildSchemas();
  }

  buildSchemas() {
    return {
      deploymentRequest: Joi.object({
        repository: Joi.string()
          .pattern(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
          .optional()
          .messages({
            'string.pattern.base': 'Repository must be in format "owner/repo"'
          }),
        
        branch: Joi.string()
          .pattern(/^[a-zA-Z0-9_.\/-]+$/)
          .optional()
          .messages({
            'string.pattern.base': 'Branch name contains invalid characters'
          }),
        
        priority: Joi.string()
          .valid('low', 'normal', 'high', 'urgent')
          .optional()
          .default('normal'),
        
        dryRun: Joi.boolean()
          .optional()
          .default(false),
        
        requestedBy: Joi.string()
          .min(1)
          .max(100)
          .optional(),
        
        parameters: Joi.object()
          .optional()
          .default({}),
        
        environment: Joi.string()
          .valid('development', 'staging', 'production')
          .optional()
          .default('production')
      }),

      rollbackRequest: Joi.object({
        deploymentId: Joi.string()
          .guid({ version: 'uuidv4' })
          .required()
          .messages({
            'any.required': 'Deployment ID is required',
            'string.guid': 'Deployment ID must be a valid UUID'
          }),
        
        reason: Joi.string()
          .min(1)
          .max(500)
          .optional(),
        
        requestedBy: Joi.string()
          .min(1)
          .max(100)
          .optional()
      }),

      webhookPayload: Joi.object({
        action: Joi.string().required(),
        repository: Joi.object({
          full_name: Joi.string().required(),
          name: Joi.string().required(),
          owner: Joi.object({
            login: Joi.string().required()
          }).required()
        }).required(),
        sender: Joi.object({
          login: Joi.string().required()
        }).required()
      }).unknown(true),

      queueParameters: Joi.object({
        page: Joi.number()
          .integer()
          .min(1)
          .optional()
          .default(1),
        
        limit: Joi.number()
          .integer()
          .min(1)
          .max(100)
          .optional()
          .default(20),
        
        status: Joi.string()
          .valid('queued', 'in-progress', 'completed', 'failed', 'rolled-back')
          .optional()
      }),

      historyParameters: Joi.object({
        page: Joi.number()
          .integer()
          .min(1)
          .optional()
          .default(1),
        
        limit: Joi.number()
          .integer()
          .min(1)
          .max(100)
          .optional()
          .default(20),
        
        status: Joi.string()
          .valid('queued', 'in-progress', 'completed', 'failed', 'rolled-back')
          .optional(),
        
        repository: Joi.string()
          .pattern(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
          .optional(),
        
        startDate: Joi.date()
          .iso()
          .optional(),
        
        endDate: Joi.date()
          .iso()
          .min(Joi.ref('startDate'))
          .optional()
      }),

      logsParameters: Joi.object({
        deploymentId: Joi.string()
          .guid({ version: 'uuidv4' })
          .required(),
        
        lines: Joi.number()
          .integer()
          .min(1)
          .max(1000)
          .optional()
          .default(100),
        
        level: Joi.string()
          .valid('error', 'warn', 'info', 'debug')
          .optional(),
        
        type: Joi.string()
          .valid('stdout', 'stderr', 'system')
          .optional()
      }),

      configurationUpdate: Joi.object({
        deployment: Joi.object({
          repository: Joi.string()
            .pattern(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
            .optional(),
          
          targetServer: Joi.string()
            .ip()
            .optional(),
          
          deploymentPath: Joi.string()
            .pattern(/^\/[a-zA-Z0-9_.\/-]*$/)
            .optional(),
          
          backupRetention: Joi.number()
            .integer()
            .min(1)
            .max(365)
            .optional(),
          
          healthCheckEndpoint: Joi.string()
            .uri()
            .optional(),
          
          deploymentTimeout: Joi.number()
            .integer()
            .min(30)
            .max(3600)
            .optional()
        }).optional(),

        api: Joi.object({
          port: Joi.number()
            .integer()
            .min(1000)
            .max(65535)
            .optional(),
          
          host: Joi.string()
            .hostname()
            .optional(),
          
          corsOrigins: Joi.array()
            .items(Joi.string().uri())
            .optional()
        }).optional(),

        webhook: Joi.object({
          secret: Joi.string()
            .min(10)
            .optional(),
          
          allowedEvents: Joi.array()
            .items(Joi.string().valid('repository_dispatch', 'push', 'pull_request', 'release'))
            .optional()
        }).optional()
      })
    };
  }

  async validateDeploymentRequest(data) {
    try {
      const validated = await this.schemas.deploymentRequest.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
      
      // Additional business logic validation
      await this.validateDeploymentBusinessRules(validated);
      
      return validated;
      
    } catch (error) {
      if (error.isJoi) {
        const validationError = new Error('Validation failed');
        validationError.name = 'ValidationError';
        validationError.details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        throw validationError;
      }
      throw error;
    }
  }

  async validateRollbackRequest(data) {
    try {
      const validated = await this.schemas.rollbackRequest.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
      
      return validated;
      
    } catch (error) {
      if (error.isJoi) {
        const validationError = new Error('Validation failed');
        validationError.name = 'ValidationError';
        validationError.details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        throw validationError;
      }
      throw error;
    }
  }

  async validateWebhookPayload(data) {
    try {
      const validated = await this.schemas.webhookPayload.validateAsync(data, {
        abortEarly: false,
        allowUnknown: true
      });
      
      return validated;
      
    } catch (error) {
      if (error.isJoi) {
        const validationError = new Error('Webhook validation failed');
        validationError.name = 'ValidationError';
        validationError.details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        throw validationError;
      }
      throw error;
    }
  }

  async validateQueueParameters(data) {
    try {
      return await this.schemas.queueParameters.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
    } catch (error) {
      throw this.formatJoiError(error);
    }
  }

  async validateHistoryParameters(data) {
    try {
      return await this.schemas.historyParameters.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
    } catch (error) {
      throw this.formatJoiError(error);
    }
  }

  async validateLogsParameters(data) {
    try {
      return await this.schemas.logsParameters.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
    } catch (error) {
      throw this.formatJoiError(error);
    }
  }

  async validateConfigurationUpdate(data) {
    try {
      return await this.schemas.configurationUpdate.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
    } catch (error) {
      throw this.formatJoiError(error);
    }
  }

  async validateDeploymentBusinessRules(deployment) {
    const errors = [];
    
    // Check repository allowlist
    if (deployment.repository) {
      const allowedRepositories = this.config.deployment?.allowedRepositories || [
        'festion/home-assistant-config',
        'homelab-gitops-auditor/home-assistant-config'
      ];
      
      if (!allowedRepositories.includes(deployment.repository)) {
        errors.push({
          field: 'repository',
          message: `Repository ${deployment.repository} is not in the allowed list`,
          allowedRepositories
        });
      }
    }
    
    // Check branch allowlist
    if (deployment.branch) {
      const allowedBranches = this.config.deployment?.allowedBranches || ['main', 'master', 'production'];
      
      if (!allowedBranches.includes(deployment.branch)) {
        errors.push({
          field: 'branch',
          message: `Branch ${deployment.branch} is not in the allowed list`,
          allowedBranches
        });
      }
    }
    
    // Check environment-specific rules
    if (deployment.environment === 'production') {
      if (deployment.dryRun !== false) {
        // Production deployments should not be dry runs unless explicitly requested
      }
    }
    
    if (errors.length > 0) {
      const businessError = new Error('Business rule validation failed');
      businessError.name = 'BusinessValidationError';
      businessError.details = errors;
      throw businessError;
    }
  }

  validateGitHubSignature(signature, payload, secret) {
    if (!signature) {
      throw new Error('No signature provided');
    }
    
    if (!signature.startsWith('sha256=')) {
      throw new Error('Invalid signature format');
    }
    
    if (!secret) {
      throw new Error('Webhook secret not configured');
    }
    
    return true;
  }

  validateDeploymentId(deploymentId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!deploymentId) {
      throw new Error('Deployment ID is required');
    }
    
    if (!uuidRegex.test(deploymentId)) {
      throw new Error('Deployment ID must be a valid UUID v4');
    }
    
    return true;
  }

  validateFileOperation(operation, filePath, content = null) {
    const allowedOperations = ['create', 'update', 'delete', 'backup'];
    
    if (!allowedOperations.includes(operation)) {
      throw new Error(`Invalid file operation: ${operation}. Allowed: ${allowedOperations.join(', ')}`);
    }
    
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required and must be a string');
    }
    
    // Path traversal protection
    if (filePath.includes('..') || filePath.includes('//')) {
      throw new Error('Invalid file path: contains path traversal sequences');
    }
    
    // Ensure path is within allowed directories
    const allowedPaths = ['/config', '/backup'];
    const isAllowed = allowedPaths.some(allowed => filePath.startsWith(allowed));
    
    if (!isAllowed) {
      throw new Error(`File path must start with one of: ${allowedPaths.join(', ')}`);
    }
    
    // Content validation for create/update operations
    if (['create', 'update'].includes(operation)) {
      if (content === null || content === undefined) {
        throw new Error(`Content is required for ${operation} operation`);
      }
      
      if (typeof content !== 'string') {
        throw new Error('Content must be a string');
      }
      
      // Check content size (max 10MB)
      if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) {
        throw new Error('Content size exceeds maximum limit (10MB)');
      }
    }
    
    return true;
  }

  validateIPAddress(ip) {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (!ip) {
      throw new Error('IP address is required');
    }
    
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.').map(Number);
      const isValid = parts.every(part => part >= 0 && part <= 255);
      
      if (!isValid) {
        throw new Error('Invalid IPv4 address');
      }
      
      return 'ipv4';
    }
    
    if (ipv6Regex.test(ip)) {
      return 'ipv6';
    }
    
    throw new Error('Invalid IP address format');
  }

  validatePort(port) {
    if (!port) {
      throw new Error('Port is required');
    }
    
    const portNum = parseInt(port, 10);
    
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error('Port must be a number between 1 and 65535');
    }
    
    // Check for well-known ports that should be avoided
    const restrictedPorts = [22, 25, 53, 80, 110, 143, 443, 993, 995];
    
    if (restrictedPorts.includes(portNum)) {
      throw new Error(`Port ${portNum} is restricted`);
    }
    
    return portNum;
  }

  sanitizeInput(input, type = 'string') {
    if (input === null || input === undefined) {
      return input;
    }
    
    switch (type) {
      case 'string':
        return String(input).trim();
      
      case 'filename':
        return String(input)
          .replace(/[^a-zA-Z0-9._-]/g, '')
          .trim();
      
      case 'path':
        return String(input)
          .replace(/\/+/g, '/')
          .replace(/\.\./g, '')
          .trim();
      
      case 'identifier':
        return String(input)
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .trim();
      
      default:
        return input;
    }
  }

  formatJoiError(error) {
    if (error.isJoi) {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      return validationError;
    }
    return error;
  }

  getValidationSchema(schemaName) {
    return this.schemas[schemaName];
  }

  addCustomSchema(name, schema) {
    if (!schema || typeof schema.validateAsync !== 'function') {
      throw new Error('Schema must be a valid Joi schema');
    }
    
    this.schemas[name] = schema;
  }

  getSchemaNames() {
    return Object.keys(this.schemas);
  }
}

module.exports = Validator;
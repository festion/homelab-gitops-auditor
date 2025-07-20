/**
 * Validation Middleware
 * Provides request validation for search and bulk action endpoints
 */

/**
 * Validate search query parameters
 */
function validateSearchQuery(req, res, next) {
  const errors = [];

  // Validate limit
  if (req.query.limit && isNaN(parseInt(req.query.limit))) {
    errors.push('Limit must be a number');
  } else if (req.query.limit && parseInt(req.query.limit) > 1000) {
    errors.push('Limit cannot exceed 1000');
  }

  // Validate offset
  if (req.query.offset && isNaN(parseInt(req.query.offset))) {
    errors.push('Offset must be a number');
  } else if (req.query.offset && parseInt(req.query.offset) < 0) {
    errors.push('Offset cannot be negative');
  }

  // Validate sort direction
  if (req.query.sort_direction && !['asc', 'desc'].includes(req.query.sort_direction)) {
    errors.push('Sort direction must be "asc" or "desc"');
  }

  // Validate boolean parameters
  const booleanParams = ['fuzzy', 'highlight', 'include_facets', 'uncommitted_changes', 'stale_tags'];
  for (const param of booleanParams) {
    if (req.query[param] && !['true', 'false'].includes(req.query[param])) {
      errors.push(`${param} must be "true" or "false"`);
    }
  }

  // Validate last activity days
  if (req.query.last_activity_days) {
    const days = parseInt(req.query.last_activity_days);
    if (isNaN(days) || days < 1 || days > 365) {
      errors.push('Last activity days must be between 1 and 365');
    }
  }

  // Validate status values
  if (req.query.status) {
    const validStatuses = ['clean', 'dirty', 'missing', 'extra'];
    const statuses = req.query.status.split(',').map(s => s.trim());
    const invalidStatuses = statuses.filter(s => !validStatuses.includes(s));
    if (invalidStatuses.length > 0) {
      errors.push(`Invalid status values: ${invalidStatuses.join(', ')}`);
    }
  }

  // Validate compliance values
  if (req.query.compliance) {
    const validCompliance = ['compliant', 'non-compliant'];
    const compliance = req.query.compliance.split(',').map(c => c.trim());
    const invalidCompliance = compliance.filter(c => !validCompliance.includes(c));
    if (invalidCompliance.length > 0) {
      errors.push(`Invalid compliance values: ${invalidCompliance.join(', ')}`);
    }
  }

  // Validate pipeline status values
  if (req.query.pipeline_status) {
    const validPipelineStatuses = ['success', 'failure', 'pending', 'running'];
    const pipelineStatuses = req.query.pipeline_status.split(',').map(p => p.trim());
    const invalidPipelineStatuses = pipelineStatuses.filter(p => !validPipelineStatuses.includes(p));
    if (invalidPipelineStatuses.length > 0) {
      errors.push(`Invalid pipeline status values: ${invalidPipelineStatuses.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid query parameters',
      errors
    });
  }

  next();
}

/**
 * Validate bulk action parameters
 */
function validateBulkActionParams(req, res, next) {
  const errors = [];
  const { type, repositories, params } = req.body;

  // Validate required fields
  if (!type) {
    errors.push('Action type is required');
  }

  if (!repositories) {
    errors.push('Repositories array is required');
  } else if (!Array.isArray(repositories)) {
    errors.push('Repositories must be an array');
  } else if (repositories.length === 0) {
    errors.push('At least one repository must be specified');
  } else if (repositories.length > 100) {
    errors.push('Cannot process more than 100 repositories at once');
  }

  // Validate repository names
  if (Array.isArray(repositories)) {
    repositories.forEach((repo, index) => {
      if (typeof repo !== 'string' || repo.trim().length === 0) {
        errors.push(`Repository at index ${index} must be a non-empty string`);
      }
    });
  }

  // Validate action type
  const validActionTypes = ['apply_templates', 'run_audit', 'export_data', 'tag_repositories'];
  if (type && !validActionTypes.includes(type)) {
    errors.push(`Invalid action type. Must be one of: ${validActionTypes.join(', ')}`);
  }

  // Type-specific validation
  if (type === 'apply_templates') {
    if (!params || !params.templates || !Array.isArray(params.templates)) {
      errors.push('Templates array is required for apply_templates action');
    } else if (params.templates.length === 0) {
      errors.push('At least one template must be specified');
    }
  }

  if (type === 'run_audit') {
    if (params && params.type) {
      const validAuditTypes = ['full', 'security', 'compliance'];
      if (!validAuditTypes.includes(params.type)) {
        errors.push(`Invalid audit type. Must be one of: ${validAuditTypes.join(', ')}`);
      }
    }
  }

  if (type === 'export_data') {
    if (params && params.format) {
      const validFormats = ['json', 'csv', 'excel'];
      if (!validFormats.includes(params.format)) {
        errors.push(`Invalid export format. Must be one of: ${validFormats.join(', ')}`);
      }
    }
  }

  if (type === 'tag_repositories') {
    if (!params || !params.operation) {
      errors.push('Operation is required for tag_repositories action');
    } else if (!['add', 'remove'].includes(params.operation)) {
      errors.push('Operation must be either "add" or "remove"');
    }

    if (!params || !params.tags || typeof params.tags !== 'string' || params.tags.trim().length === 0) {
      errors.push('Tags string is required for tag_repositories action');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid bulk action parameters',
      errors
    });
  }

  next();
}

/**
 * Validate saved view parameters
 */
function validateSavedViewParams(req, res, next) {
  const errors = [];
  const { name, criteria, isDefault } = req.body;

  // Validate name
  if (!name) {
    errors.push('View name is required');
  } else if (typeof name !== 'string') {
    errors.push('View name must be a string');
  } else if (name.trim().length === 0) {
    errors.push('View name cannot be empty');
  } else if (name.length > 100) {
    errors.push('View name cannot exceed 100 characters');
  }

  // Validate criteria
  if (!criteria) {
    errors.push('Search criteria is required');
  } else if (typeof criteria !== 'object') {
    errors.push('Search criteria must be an object');
  } else {
    // Validate criteria structure
    if (criteria.query !== undefined && typeof criteria.query !== 'string') {
      errors.push('Search query must be a string');
    }

    if (criteria.filters !== undefined && typeof criteria.filters !== 'object') {
      errors.push('Filters must be an object');
    }

    if (criteria.sort !== undefined) {
      if (typeof criteria.sort !== 'object') {
        errors.push('Sort must be an object');
      } else {
        if (criteria.sort.field && typeof criteria.sort.field !== 'string') {
          errors.push('Sort field must be a string');
        }
        if (criteria.sort.direction && !['asc', 'desc'].includes(criteria.sort.direction)) {
          errors.push('Sort direction must be "asc" or "desc"');
        }
      }
    }
  }

  // Validate isDefault
  if (isDefault !== undefined && typeof isDefault !== 'boolean') {
    errors.push('isDefault must be a boolean');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid saved view parameters',
      errors
    });
  }

  next();
}

/**
 * Validate pagination parameters
 */
function validatePagination(req, res, next) {
  const errors = [];

  if (req.query.page) {
    const page = parseInt(req.query.page);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive integer');
    } else if (page > 10000) {
      errors.push('Page cannot exceed 10000');
    }
  }

  if (req.query.limit) {
    const limit = parseInt(req.query.limit);
    if (isNaN(limit) || limit < 1) {
      errors.push('Limit must be a positive integer');
    } else if (limit > 1000) {
      errors.push('Limit cannot exceed 1000');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid pagination parameters',
      errors
    });
  }

  next();
}

/**
 * Sanitize input to prevent XSS and injection attacks
 */
function sanitizeInput(req, res, next) {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    // Remove script tags and other dangerous HTML
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize body parameters
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  next();
}

module.exports = {
  validateSearchQuery,
  validateBulkActionParams,
  validateSavedViewParams,
  validatePagination,
  sanitizeInput
};
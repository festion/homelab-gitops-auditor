const { logger } = require('./logger');

class WebhookError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class GitHubAPIError extends Error {
  constructor(message, statusCode, response = null, context = {}) {
    super(message);
    this.name = 'GitHubAPIError';
    this.statusCode = statusCode;
    this.response = response;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class ValidationError extends Error {
  constructor(message, field, value, context = {}) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class ConfigurationError extends Error {
  constructor(message, configKey, context = {}) {
    super(message);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter = null, context = {}) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class TimeoutError extends Error {
  constructor(message, timeout, context = {}) {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = timeout;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class ErrorHandler {
  constructor(loggerInstance = logger) {
    this.logger = loggerInstance;
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {},
      errorsByComponent: {},
      recentErrors: [],
      startTime: new Date().toISOString()
    };
  }

  /**
   * Handle webhook processing errors
   */
  async handleWebhookError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'webhook_processing',
      component: 'webhook-handler'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'webhook-handler');

    // Determine if error is retryable
    const isRetryable = this.isRetryableError(error);
    
    return {
      error: {
        message: error.message,
        code: error.code || 'WEBHOOK_ERROR',
        retryable: isRetryable,
        context: enhancedContext
      },
      shouldRetry: isRetryable
    };
  }

  /**
   * Handle GitHub API errors
   */
  async handleGitHubAPIError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'github_api',
      component: 'github-service'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'github-service');

    // Determine retry strategy based on status code
    let retryStrategy = null;
    if (error.statusCode) {
      retryStrategy = this.getGitHubRetryStrategy(error.statusCode);
    }

    return {
      error: {
        message: error.message,
        statusCode: error.statusCode,
        code: error.code || 'GITHUB_API_ERROR',
        retryable: retryStrategy?.retryable || false,
        retryAfter: retryStrategy?.retryAfter,
        context: enhancedContext
      },
      retryStrategy
    };
  }

  /**
   * Handle validation errors
   */
  async handleValidationError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'validation',
      component: 'validation'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'validation');

    return {
      error: {
        message: error.message,
        field: error.field,
        value: error.value,
        code: 'VALIDATION_ERROR',
        retryable: false,
        context: enhancedContext
      },
      shouldRetry: false
    };
  }

  /**
   * Handle configuration errors
   */
  async handleConfigurationError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'configuration',
      component: 'configuration'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'configuration');

    return {
      error: {
        message: error.message,
        configKey: error.configKey,
        code: 'CONFIGURATION_ERROR',
        retryable: false,
        context: enhancedContext
      },
      shouldRetry: false
    };
  }

  /**
   * Handle rate limit errors
   */
  async handleRateLimitError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'rate_limit',
      component: 'rate-limiter'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'rate-limiter');

    return {
      error: {
        message: error.message,
        code: 'RATE_LIMIT_ERROR',
        retryable: true,
        retryAfter: error.retryAfter,
        context: enhancedContext
      },
      shouldRetry: true,
      retryAfter: error.retryAfter || 60000 // Default 1 minute
    };
  }

  /**
   * Handle timeout errors
   */
  async handleTimeoutError(error, context = {}) {
    const enhancedContext = {
      ...context,
      errorType: 'timeout',
      component: 'timeout-handler'
    };

    await this.logError(error, enhancedContext);
    this.updateErrorStats(error, 'timeout-handler');

    return {
      error: {
        message: error.message,
        timeout: error.timeout,
        code: 'TIMEOUT_ERROR',
        retryable: true,
        context: enhancedContext
      },
      shouldRetry: true
    };
  }

  /**
   * Generic error handler
   */
  async handleError(error, context = {}) {
    // Route to specific handlers based on error type
    if (error instanceof WebhookError) {
      return this.handleWebhookError(error, context);
    } else if (error instanceof GitHubAPIError) {
      return this.handleGitHubAPIError(error, context);
    } else if (error instanceof ValidationError) {
      return this.handleValidationError(error, context);
    } else if (error instanceof ConfigurationError) {
      return this.handleConfigurationError(error, context);
    } else if (error instanceof RateLimitError) {
      return this.handleRateLimitError(error, context);
    } else if (error instanceof TimeoutError) {
      return this.handleTimeoutError(error, context);
    } else {
      // Generic error handling
      const enhancedContext = {
        ...context,
        errorType: 'generic',
        component: 'unknown'
      };

      await this.logError(error, enhancedContext);
      this.updateErrorStats(error, 'unknown');

      return {
        error: {
          message: error.message,
          code: 'GENERIC_ERROR',
          retryable: false,
          context: enhancedContext
        },
        shouldRetry: false
      };
    }
  }

  /**
   * Log error with appropriate level and context
   */
  async logError(error, context = {}) {
    const errorContext = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      errorTimestamp: error.timestamp,
      ...context
    };

    // Log at appropriate level based on error type
    if (error instanceof ValidationError || error instanceof ConfigurationError) {
      await this.logger.warn(`${error.name}: ${error.message}`, errorContext);
    } else if (error instanceof RateLimitError) {
      await this.logger.warn(`Rate limit exceeded: ${error.message}`, errorContext);
    } else {
      await this.logger.error(`Error occurred: ${error.message}`, errorContext);
    }
  }

  /**
   * Update error statistics
   */
  updateErrorStats(error, component) {
    this.errorStats.totalErrors++;
    
    // Update error type stats
    const errorType = error.constructor.name;
    this.errorStats.errorsByType[errorType] = (this.errorStats.errorsByType[errorType] || 0) + 1;
    
    // Update component stats
    this.errorStats.errorsByComponent[component] = (this.errorStats.errorsByComponent[component] || 0) + 1;
    
    // Add to recent errors (keep last 100)
    this.errorStats.recentErrors.unshift({
      type: errorType,
      message: error.message,
      component,
      timestamp: new Date().toISOString()
    });
    
    if (this.errorStats.recentErrors.length > 100) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(0, 100);
    }
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error) {
    // Network-related errors are typically retryable
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED') {
      return true;
    }

    // Rate limits are retryable
    if (error instanceof RateLimitError) {
      return true;
    }

    // Timeouts are retryable
    if (error instanceof TimeoutError) {
      return true;
    }

    // GitHub API 5xx errors are retryable
    if (error instanceof GitHubAPIError && error.statusCode >= 500) {
      return true;
    }

    // Validation and configuration errors are not retryable
    if (error instanceof ValidationError || error instanceof ConfigurationError) {
      return false;
    }

    // Default to not retryable for unknown errors
    return false;
  }

  /**
   * Get GitHub API retry strategy based on status code
   */
  getGitHubRetryStrategy(statusCode) {
    switch (statusCode) {
      case 403:
        // Rate limit exceeded
        return {
          retryable: true,
          retryAfter: 3600000, // 1 hour
          backoffType: 'fixed'
        };
      case 429:
        // Too many requests
        return {
          retryable: true,
          retryAfter: 60000, // 1 minute
          backoffType: 'exponential'
        };
      case 500:
      case 502:
      case 503:
      case 504:
        // Server errors
        return {
          retryable: true,
          retryAfter: 5000, // 5 seconds
          backoffType: 'exponential'
        };
      case 404:
        // Not found - usually not retryable
        return {
          retryable: false
        };
      case 401:
        // Unauthorized - not retryable
        return {
          retryable: false
        };
      default:
        return {
          retryable: false
        };
    }
  }

  /**
   * Create Express.js error handling middleware
   */
  createExpressErrorHandler() {
    return async (error, req, res, next) => {
      const context = {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        requestId: req.id || req.headers['x-request-id']
      };

      const handledError = await this.handleError(error, context);

      // Determine appropriate HTTP status code
      let statusCode = 500;
      if (error instanceof ValidationError) {
        statusCode = 400;
      } else if (error instanceof GitHubAPIError) {
        statusCode = error.statusCode || 500;
      } else if (error instanceof RateLimitError) {
        statusCode = 429;
      } else if (error instanceof ConfigurationError) {
        statusCode = 500;
      } else if (error instanceof TimeoutError) {
        statusCode = 504;
      }

      res.status(statusCode).json({
        error: {
          message: handledError.error.message,
          code: handledError.error.code,
          timestamp: new Date().toISOString(),
          requestId: context.requestId
        }
      });
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      ...this.errorStats,
      uptime: Date.now() - new Date(this.errorStats.startTime).getTime(),
      errorRate: this.errorStats.totalErrors > 0 ? 
        (this.errorStats.totalErrors / (Date.now() - new Date(this.errorStats.startTime).getTime()) * 1000 * 60).toFixed(2) : 0
    };
  }

  /**
   * Reset error statistics
   */
  resetErrorStats() {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {},
      errorsByComponent: {},
      recentErrors: [],
      startTime: new Date().toISOString()
    };
  }

  /**
   * Get error health status
   */
  getHealthStatus() {
    const stats = this.getErrorStats();
    const recentErrorCount = this.errorStats.recentErrors.filter(e => 
      Date.now() - new Date(e.timestamp).getTime() < 300000 // Last 5 minutes
    ).length;

    let status = 'healthy';
    let message = 'Error handling is operating normally';

    if (recentErrorCount > 50) {
      status = 'critical';
      message = `High error rate: ${recentErrorCount} errors in last 5 minutes`;
    } else if (recentErrorCount > 20) {
      status = 'warning';
      message = `Elevated error rate: ${recentErrorCount} errors in last 5 minutes`;
    }

    return {
      status,
      message,
      metrics: {
        totalErrors: stats.totalErrors,
        recentErrors: recentErrorCount,
        errorRate: stats.errorRate,
        uptime: stats.uptime
      }
    };
  }
}

// Create default error handler instance
const defaultErrorHandler = new ErrorHandler();

// Utility functions for creating specific errors
function createWebhookError(message, code, context = {}) {
  return new WebhookError(message, code, context);
}

function createGitHubAPIError(message, statusCode, response = null, context = {}) {
  return new GitHubAPIError(message, statusCode, response, context);
}

function createValidationError(message, field, value, context = {}) {
  return new ValidationError(message, field, value, context);
}

function createConfigurationError(message, configKey, context = {}) {
  return new ConfigurationError(message, configKey, context);
}

function createRateLimitError(message, retryAfter = null, context = {}) {
  return new RateLimitError(message, retryAfter, context);
}

function createTimeoutError(message, timeout, context = {}) {
  return new TimeoutError(message, timeout, context);
}

module.exports = {
  ErrorHandler,
  WebhookError,
  GitHubAPIError,
  ValidationError,
  ConfigurationError,
  RateLimitError,
  TimeoutError,
  errorHandler: defaultErrorHandler,
  createWebhookError,
  createGitHubAPIError,
  createValidationError,
  createConfigurationError,
  createRateLimitError,
  createTimeoutError
};
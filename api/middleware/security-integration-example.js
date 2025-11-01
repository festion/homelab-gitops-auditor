/**
 * Security Integration Example
 * 
 * This file demonstrates how to integrate all the security middleware
 * into an Express.js application for comprehensive protection.
 */

const express = require('express');
const { authenticate, authenticateOptional } = require('./auth');
const { requirePermission, requireRole, requireAdmin } = require('./authorization');
const { 
  validateDeploymentRequest, 
  validateRollbackRequest,
  validateWebhookRequest,
  sanitizeInput,
  limitRequestSize
} = require('./enhanced-input-validation');
const {
  getProductionMiddleware,
  getDevelopmentMiddleware,
  getAuthRateLimit,
  getSensitiveRateLimit,
  getErrorHandler
} = require('./enhanced-security-headers');

const app = express();

// ==========================================
// Basic Express Setup
// ==========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// Security Middleware Stack
// ==========================================

// Apply environment-specific security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(getProductionMiddleware());
} else {
  app.use(getDevelopmentMiddleware());
}

// Global input sanitization
app.use(sanitizeInput());

// ==========================================
// Authentication Routes
// ==========================================

// Login endpoint with strict rate limiting
app.post('/api/auth/login', 
  getAuthRateLimit(),
  validateUserCredentials(),
  async (req, res) => {
    try {
      // Login logic here
      res.json({ 
        status: 'success', 
        token: 'jwt-token',
        user: { id: 1, username: 'user' }
      });
    } catch (error) {
      res.status(401).json({ 
        status: 'error', 
        error: { code: 'LOGIN_FAILED', message: 'Invalid credentials' }
      });
    }
  }
);

// Token refresh endpoint
app.post('/api/auth/refresh',
  authenticate,
  async (req, res) => {
    try {
      // Token refresh logic here
      res.json({ 
        status: 'success', 
        token: 'new-jwt-token' 
      });
    } catch (error) {
      res.status(401).json({ 
        status: 'error', 
        error: { code: 'REFRESH_FAILED', message: 'Token refresh failed' }
      });
    }
  }
);

// ==========================================
// Deployment Routes with Security
// ==========================================

// Get deployment status (read-only, relaxed security)
app.get('/api/deployments/:repository/status',
  authenticateOptional,
  requirePermission('deployment:read'),
  async (req, res) => {
    try {
      // Get deployment status logic
      res.json({ 
        status: 'success', 
        deployment: { status: 'running' }
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'STATUS_ERROR', message: 'Failed to get status' }
      });
    }
  }
);

// Deploy endpoint (write operation, strict security)
app.post('/api/deployments/:repository/deploy',
  getSensitiveRateLimit(),
  limitRequestSize(1024 * 1024), // 1MB limit for deployment requests
  authenticate,
  requirePermission('deployment:write'),
  validateDeploymentRequest(),
  async (req, res) => {
    try {
      // Deployment logic here
      res.json({ 
        status: 'success', 
        deploymentId: 'deploy-123',
        message: 'Deployment started'
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'DEPLOYMENT_ERROR', message: 'Deployment failed' }
      });
    }
  }
);

// Rollback endpoint (sensitive operation, maximum security)
app.post('/api/deployments/:repository/rollback',
  getSensitiveRateLimit(),
  authenticate,
  requirePermission('deployment:rollback'),
  validateRollbackRequest(),
  async (req, res) => {
    try {
      // Rollback logic here
      res.json({ 
        status: 'success', 
        message: 'Rollback completed'
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'ROLLBACK_ERROR', message: 'Rollback failed' }
      });
    }
  }
);

// ==========================================
// Webhook Routes with API Key Security
// ==========================================

// GitHub webhook endpoint
app.post('/api/webhooks/github',
  limitRequestSize(5 * 1024 * 1024), // 5MB limit for webhooks
  authenticateApiKey,
  requirePermission('webhook:receive'),
  validateWebhookRequest(),
  async (req, res) => {
    try {
      // Webhook processing logic here
      res.json({ 
        status: 'success', 
        message: 'Webhook processed'
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'WEBHOOK_ERROR', message: 'Webhook processing failed' }
      });
    }
  }
);

// ==========================================
// Admin Routes with Maximum Security
// ==========================================

// User management (admin only)
app.get('/api/admin/users',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      // Get users logic
      res.json({ 
        status: 'success', 
        users: [] 
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'USERS_ERROR', message: 'Failed to get users' }
      });
    }
  }
);

// Create user (admin only, strict validation)
app.post('/api/admin/users',
  getSensitiveRateLimit(),
  authenticate,
  requireAdmin(),
  validateUserRequest(),
  async (req, res) => {
    try {
      // Create user logic
      res.json({ 
        status: 'success', 
        user: { id: 1, username: req.body.username }
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'USER_CREATE_ERROR', message: 'Failed to create user' }
      });
    }
  }
);

// System configuration (admin only)
app.put('/api/admin/config',
  getSensitiveRateLimit(),
  authenticate,
  requireAdmin(),
  requirePermission('system:admin'),
  async (req, res) => {
    try {
      // Update config logic
      res.json({ 
        status: 'success', 
        message: 'Configuration updated'
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'CONFIG_ERROR', message: 'Failed to update configuration' }
      });
    }
  }
);

// ==========================================
// Monitoring and Health Check Routes
// ==========================================

// Health check (public, no authentication required)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'success', 
    health: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint (authentication required)
app.get('/api/metrics',
  authenticate,
  requirePermission('monitoring:read'),
  async (req, res) => {
    try {
      // Metrics logic
      res.json({ 
        status: 'success', 
        metrics: {} 
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: { code: 'METRICS_ERROR', message: 'Failed to get metrics' }
      });
    }
  }
);

// ==========================================
// Error Handling Middleware
// ==========================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    }
  });
});

// Global error handler (must be last)
app.use(getErrorHandler());

// ==========================================
// Helper Functions
// ==========================================

function validateUserCredentials() {
  return [
    body('username')
      .isString()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('Invalid username format'),
    
    body('password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    
    validateRequest
  ];
}

// ==========================================
// Security Best Practices Demonstrated
// ==========================================

/*
1. **Authentication & Authorization**:
   - JWT token authentication for users
   - API key authentication for webhooks
   - Role-based access control (RBAC)
   - Permission-based authorization

2. **Input Validation**:
   - Comprehensive request validation
   - Path traversal prevention
   - SQL injection prevention
   - XSS protection
   - Command injection prevention

3. **Rate Limiting**:
   - General API rate limiting
   - Strict rate limiting for authentication
   - Sensitive operation rate limiting
   - IP-based tracking

4. **Security Headers**:
   - Helmet.js for security headers
   - CORS configuration
   - Content Security Policy
   - HSTS headers

5. **Request Protection**:
   - Request size limiting
   - Input sanitization
   - IP filtering (whitelist/blacklist)
   - Suspicious activity detection

6. **Audit Logging**:
   - Authentication event logging
   - Authorization event logging
   - Security event logging
   - Performance monitoring

7. **Error Handling**:
   - Secure error responses
   - No internal information exposure
   - Consistent error format
   - Request tracking

8. **Environment-Specific Security**:
   - Production security stack
   - Development security relaxation
   - Configuration-based security
*/

module.exports = app;
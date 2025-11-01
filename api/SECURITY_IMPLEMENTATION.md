# Security and Authentication Implementation

## Overview

This document describes the comprehensive security and authentication system implemented for the homelab-gitops-auditor automated deployment feature. The implementation provides multiple layers of security including authentication, authorization, input validation, and comprehensive audit logging.

## Components

### 1. Authentication Middleware (`auth.js`)

**Features:**
- JWT token-based authentication with configurable expiration
- API key authentication for webhooks and external services
- Token refresh mechanism
- Multi-factor authentication support
- Rate limiting for authentication attempts
- Comprehensive audit logging

**Usage:**
```javascript
const { authenticate, authenticateJWT, authenticateApiKey } = require('./middleware/auth');

// Require any authentication (JWT or API key)
app.use('/api/protected', authenticate);

// Require specifically JWT authentication
app.use('/api/user', authenticateJWT);

// Require specifically API key authentication
app.use('/api/webhooks', authenticateApiKey);
```

### 2. Authorization Middleware (`authorization.js`)

**Features:**
- Role-Based Access Control (RBAC)
- Permission-based authorization
- Resource-level access control
- Hierarchical permission system
- Custom authorization functions

**Roles:**
- `admin`: Full system access
- `operator`: Deployment operations
- `viewer`: Read-only access
- `webhook`: Webhook-specific permissions

**Permissions:**
- `deployment:read` - View deployment status
- `deployment:write` - Trigger deployments
- `deployment:rollback` - Rollback deployments
- `deployment:admin` - Full deployment management
- `system:admin` - System administration
- `webhook:receive` - Receive webhook events

**Usage:**
```javascript
const { requirePermission, requireRole, requireAdmin } = require('./middleware/authorization');

// Require specific permissions
app.post('/api/deploy', requirePermission('deployment:write'));

// Require specific roles
app.get('/api/admin/users', requireRole('admin'));

// Admin-only endpoints
app.delete('/api/admin/*', requireAdmin());
```

### 3. Input Validation Middleware (`enhanced-input-validation.js`)

**Features:**
- Comprehensive request validation using express-validator
- Path traversal prevention
- SQL injection prevention
- XSS protection
- Command injection prevention
- File upload validation
- JSON schema validation

**Usage:**
```javascript
const { 
  validateDeploymentRequest, 
  validateRollbackRequest,
  sanitizeInput 
} = require('./middleware/enhanced-input-validation');

// Global input sanitization
app.use(sanitizeInput());

// Specific endpoint validation
app.post('/api/deploy', validateDeploymentRequest());
app.post('/api/rollback', validateRollbackRequest());
```

### 4. Security Headers Middleware (`enhanced-security-headers.js`)

**Features:**
- Comprehensive security headers using Helmet.js
- CORS configuration with origin validation
- Multiple rate limiting strategies
- IP filtering (whitelist/blacklist)
- Request size limiting
- Suspicious activity detection
- Performance monitoring

**Usage:**
```javascript
const { 
  getProductionMiddleware, 
  getAuthRateLimit,
  getSensitiveRateLimit 
} = require('./middleware/enhanced-security-headers');

// Apply comprehensive security for production
app.use(getProductionMiddleware());

// Specific rate limiting
app.post('/api/auth/login', getAuthRateLimit());
app.post('/api/admin/*', getSensitiveRateLimit());
```

### 5. Audit Logger (`utils/audit-logger.js`)

**Features:**
- Authentication event logging
- Authorization event logging
- Security event logging
- Performance metrics logging
- File-based persistent logging with rotation
- Structured JSON logging

**Usage:**
```javascript
const { AuditLogger } = require('../utils/audit-logger');

// Log authentication events
AuditLogger.logAuthenticationEvent({
  type: 'jwt-auth-success',
  userId: user.id,
  username: user.username,
  ipAddress: req.ip,
  endpoint: req.path
});

// Log security events
AuditLogger.logSecurityEvent({
  type: 'rate-limit-exceeded',
  ipAddress: req.ip,
  endpoint: req.path
});
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters-long
JWT_EXPIRES_IN=24h

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
AUTH_RATE_LIMIT_MAX=5

# Logging
LOG_LEVEL=info
AUDIT_LOG_DIRECTORY=/var/log/homelab-gitops-auditor
```

### Security Configuration File

See `config/security-config-example.json` for a complete configuration example including:
- JWT settings
- API key definitions
- CORS origins
- Rate limiting rules
- IP filtering
- Audit logging settings

## Security Best Practices Implemented

### 1. Authentication Security
- Strong JWT secrets (minimum 32 characters)
- Token expiration and refresh mechanism
- API key-based authentication for services
- Rate limiting on authentication endpoints
- MFA support for enhanced security

### 2. Authorization Security
- Principle of least privilege
- Role-based access control
- Permission hierarchies
- Resource-level access control
- Audit logging for all authorization decisions

### 3. Input Security
- Comprehensive input validation
- Sanitization of all user inputs
- Protection against injection attacks
- File upload security
- Request size limiting

### 4. Network Security
- CORS configuration with origin validation
- Security headers (CSP, HSTS, etc.)
- IP filtering capabilities
- Rate limiting with multiple strategies
- Request/response monitoring

### 5. Operational Security
- Comprehensive audit logging
- Security event monitoring
- Performance tracking
- Error handling without information disclosure
- Environment-specific configurations

## Integration Example

See `middleware/security-integration-example.js` for a complete example of how to integrate all security middleware into an Express.js application.

## Testing

### Authentication Testing
```bash
# Test JWT authentication
curl -X GET http://localhost:3071/api/deployments/home-assistant-config/status \
  -H "Authorization: Bearer <jwt-token>"

# Test API key authentication
curl -X POST http://localhost:3071/api/webhooks/github \
  -H "X-API-Key: <api-key>" \
  -H "Content-Type: application/json"
```

### Authorization Testing
```bash
# Test permission-based authorization
curl -X POST http://localhost:3071/api/deployments/home-assistant-config/deploy \
  -H "Authorization: Bearer <operator-token>" \
  -H "Content-Type: application/json" \
  -d '{"repository": "user/repo", "branch": "main"}'

# Test admin-only endpoints
curl -X GET http://localhost:3071/api/admin/users \
  -H "Authorization: Bearer <admin-token>"
```

### Rate Limiting Testing
```bash
# Test general rate limiting
for i in {1..1010}; do 
  curl -X GET http://localhost:3071/api/health
done

# Test authentication rate limiting
for i in {1..10}; do 
  curl -X POST http://localhost:3071/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}'
done
```

### Input Validation Testing
```bash
# Test input validation
curl -X POST http://localhost:3071/api/deployments/home-assistant-config/deploy \
  -H "Content-Type: application/json" \
  -d '{"repository": "invalid-repo-format"}'

# Test XSS protection
curl -X POST http://localhost:3071/api/deployments/home-assistant-config/deploy \
  -H "Content-Type: application/json" \
  -d '{"reason": "<script>alert(1)</script>"}'
```

## Monitoring and Alerting

### Security Metrics
- Authentication success/failure rates
- Authorization decision tracking
- Rate limiting trigger frequency
- Suspicious activity detection
- Input validation failure rates

### Log Analysis
- Monitor authentication patterns
- Track authorization violations
- Analyze security event trends
- Performance impact assessment
- Incident response preparation

## Maintenance

### Regular Tasks
1. **API Key Rotation**: Regularly rotate API keys
2. **JWT Secret Rotation**: Periodically update JWT secrets
3. **Log Rotation**: Ensure audit logs are properly rotated
4. **Security Updates**: Keep dependencies updated
5. **Configuration Review**: Regular security configuration audits

### Monitoring
1. **Failed Authentication Attempts**: Monitor for brute force attacks
2. **Rate Limiting Triggers**: Identify potential DoS attempts
3. **Authorization Violations**: Track unauthorized access attempts
4. **Input Validation Failures**: Monitor for injection attempts
5. **Performance Impact**: Ensure security doesn't degrade performance

## Compliance

This implementation provides the foundation for meeting various compliance requirements:
- **SOC 2**: Authentication, authorization, and audit logging
- **ISO 27001**: Information security management
- **GDPR**: Data protection and privacy controls
- **NIST**: Cybersecurity framework alignment

## Support

For issues or questions regarding the security implementation:
1. Check the audit logs for security events
2. Review the configuration files for proper settings
3. Verify environment variables are correctly set
4. Test individual security components in isolation
5. Consult the integration example for proper usage patterns
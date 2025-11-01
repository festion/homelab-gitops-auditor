# Authentication and Authorization System

## Overview

The homelab-gitops-auditor API now includes a comprehensive authentication and authorization system supporting JWT tokens, API keys, and role-based access control (RBAC).

## Features

- **JWT Authentication**: Secure token-based authentication for user sessions
- **API Key Authentication**: Long-lived keys for service-to-service communication
- **Role-Based Access Control**: Admin, Operator, and Viewer roles with specific permissions
- **Session Management**: Automatic session cleanup and concurrent session limits
- **Security Headers**: Comprehensive security middleware with Helmet, CORS, and rate limiting
- **Audit Logging**: All authentication events are logged for security monitoring

## Quick Start

### 1. Default Admin Account

On first startup, a default admin account is created:
- **Username**: `admin`
- **Password**: `admin123` (or `DEFAULT_ADMIN_PASSWORD` env var)
- **Email**: `admin@homelab.local`

⚠️ **Important**: Change the default password after first login!

### 2. Login and Get Token

```bash
curl -X POST http://localhost:3070/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@homelab.local",
    "role": "admin",
    "permissions": ["*:*"]
  },
  "expiresAt": "2024-01-02T12:00:00.000Z"
}
```

### 3. Use Token for API Calls

```bash
curl -X POST http://localhost:3070/api/v2/pipelines/trigger \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-repo",
    "workflow": "deploy.yml"
  }'
```

### 4. Create API Key

```bash
curl -X POST http://localhost:3070/api/v2/auth/api-keys \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "permissions": [
      "pipelines:trigger",
      "pipelines:read",
      "templates:apply"
    ],
    "expiresIn": "90d"
  }'
```

### 5. Use API Key

```bash
curl -X POST http://localhost:3070/api/v2/pipelines/trigger \
  -H "X-API-Key: hga_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-repo",
    "workflow": "deploy.yml"
  }'
```

## Authentication Methods

### JWT Tokens
- **Usage**: User authentication for web applications
- **Header**: `Authorization: Bearer <token>`
- **Expiry**: 24 hours (configurable with `JWT_EXPIRES_IN`)
- **Contains**: User ID, username, email, role, permissions

### API Keys
- **Usage**: Service-to-service authentication, CI/CD systems
- **Header**: `X-API-Key: <key>`
- **Format**: `hga_<32-char-hex>`
- **Expiry**: Configurable (default: no expiry)
- **Permissions**: Granular, per-key permissions

## User Roles and Permissions

### Admin (`admin`)
- **Permissions**: `*:*` (all permissions)
- **Can do**: Everything including user management, system configuration

### Operator (`operator`)
- **Permissions**:
  - `repositories:read`, `repositories:write`
  - `pipelines:read`, `pipelines:trigger`, `pipelines:cancel`
  - `templates:read`, `templates:apply`, `templates:create`
  - `metrics:read`
  - `webhooks:read`
- **Can do**: Daily operations, trigger deployments, manage templates

### Viewer (`viewer`)
- **Permissions**:
  - `repositories:read`
  - `pipelines:read`
  - `templates:read`
  - `metrics:read`
- **Can do**: View-only access to all resources

## API Endpoints

### Authentication Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/v2/auth/login` | POST | No | Login with username/password |
| `/api/v2/auth/logout` | POST | Yes | Logout current session |
| `/api/v2/auth/me` | GET | Yes | Get current user info |
| `/api/v2/auth/change-password` | POST | Yes | Change password |

### API Key Management

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/v2/auth/api-keys` | POST | Yes (Admin) | Create new API key |
| `/api/v2/auth/api-keys` | GET | Yes | List user's API keys |
| `/api/v2/auth/api-keys/:id` | DELETE | Yes | Revoke API key |

### Protected Resource Examples

| Endpoint | Method | Required Permission | Description |
|----------|--------|-------------------|-------------|
| `/api/v2/pipelines/trigger` | POST | `pipelines:trigger` | Trigger pipeline |
| `/api/v2/templates/apply` | POST | `templates:apply` | Apply template |
| `/api/v2/compliance/check` | POST | `templates:apply` | Run compliance check |

## Security Features

### Rate Limiting
- **Authentication endpoints**: 5 attempts per 15 minutes per IP
- **General API**: 1000 requests per 15 minutes per IP
- **Sensitive operations**: 10 requests per 10 minutes per IP

### Security Headers
- **Helmet.js**: Comprehensive security headers
- **CORS**: Configurable origin restrictions
- **CSP**: Content Security Policy
- **HSTS**: HTTP Strict Transport Security

### Session Management
- **Concurrent sessions**: Max 5 per user (configurable)
- **Session timeout**: 24 hours (configurable)
- **Automatic cleanup**: Expired sessions cleaned hourly

## Environment Variables

```bash
# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
DEFAULT_ADMIN_PASSWORD=admin123

# Session Management
MAX_CONCURRENT_SESSIONS=5
SESSION_TIMEOUT=24h

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
NODE_ENV=production
```

## Database Schema

The authentication system uses SQLite with the following tables:

### users
- `id` (UUID, Primary Key)
- `username` (Unique)
- `email` (Unique)
- `password_hash`
- `role`
- `permissions` (JSON)
- `created_at`
- `last_login`

### api_keys
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key)
- `name`
- `key_hash` (Unique)
- `permissions` (JSON)
- `last_used`
- `expires_at`
- `created_at`

### sessions
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key)
- `token_hash` (Unique)
- `expires_at`
- `created_at`

### auth_audit_log
- `id` (UUID, Primary Key)
- `user_id`
- `username`
- `action`
- `resource`
- `success` (Boolean)
- `ip_address`
- `user_agent`
- `details` (JSON)
- `created_at`

## Error Responses

### Authentication Errors
```json
{
  "error": "Access denied",
  "message": "No authorization header provided"
}
```

### Authorization Errors
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required: pipelines:trigger"
}
```

### Rate Limiting
```json
{
  "error": "Too many requests",
  "message": "Too many authentication attempts. Please try again later.",
  "retryAfter": 900
}
```

## Testing

Run authentication tests:
```bash
cd api
npm test test/auth.test.js
```

## Security Best Practices

1. **Change default credentials** immediately after deployment
2. **Use strong JWT secrets** (64+ characters, random)
3. **Enable HTTPS** in production
4. **Rotate API keys** regularly
5. **Monitor authentication logs** for suspicious activity
6. **Use least privilege** principle for API keys
7. **Set appropriate CORS origins** for your environment

## Migration from Unauthenticated API

Existing API endpoints remain accessible but are now protected:

1. **Phase 1**: Add `authenticateOptional` to maintain backward compatibility
2. **Phase 2**: Switch to required authentication
3. **Update clients** to include authentication headers

Example migration:
```javascript
// Before
fetch('/api/v2/pipelines')

// After
fetch('/api/v2/pipelines', {
  headers: {
    'Authorization': 'Bearer ' + token
    // OR
    'X-API-Key': apiKey
  }
})
```

## Troubleshooting

### Common Issues

1. **"Invalid token" errors**
   - Check token expiration
   - Verify JWT_SECRET is consistent
   - Ensure proper Authorization header format

2. **"Insufficient permissions" errors**
   - Check user role and permissions
   - Verify required permission for endpoint
   - Use admin account for testing

3. **Rate limiting**
   - Wait for rate limit window to reset
   - Check IP address if behind proxy
   - Consider implementing authentication retry logic

4. **Database connection errors**
   - Check database file permissions
   - Ensure data directory exists
   - Review database initialization logs

### Debug Mode

Set `NODE_ENV=development` for:
- More detailed error messages
- Relaxed rate limiting
- Additional logging
- Development CORS settings
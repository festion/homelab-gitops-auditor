# Infisical Integration Guide

## Overview

The homelab-gitops-auditor now integrates with Infisical for secure secrets management. This allows centralized storage and management of sensitive credentials like API tokens, passwords, and configuration values.

## Setup

### 1. Infisical Server

Your Infisical server is deployed at:
- **URL**: https://infisical.internal.lakehouse.wtf
- **Organization**: homelab
- **Project**: homelab-gitops

### 2. Configure Environment Variables

Create a `.env` file in the `api/` directory (or set environment variables):

```bash
# Required for Infisical integration
INFISICAL_TOKEN=st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4.6e4f82a64138dda74e5176e7bccaef5b.54c8b6d1931e1049be586370fe32b3ef
INFISICAL_SITE_URL=https://infisical.internal.lakehouse.wtf
INFISICAL_ENVIRONMENT=dev
```

**Note**: The service token should be kept secure and never committed to Git!

### 3. Initialize Infisical in Your Application

The Infisical manager is automatically initialized when you import it:

```javascript
const infisicalManager = require('./config/infisical');

// Initialize on application startup
await infisicalManager.initialize();

// Get secrets
const githubToken = await infisicalManager.getSecret('GITHUB_TOKEN', 'dev', 'GITHUB_TOKEN');
const wikijsToken = await infisicalManager.getSecret('WIKIJS_TOKEN', 'dev', 'WIKIJS_TOKEN');
```

### 4. Add Secrets to Infisical

Using the Infisical web interface at https://infisical.internal.lakehouse.wtf:

1. Navigate to your `homelab-gitops` project
2. Select the environment (Development/Production)
3. Click **"Add Secret"**
4. Enter:
   - **Key**: Secret name (e.g., `GITHUB_TOKEN`)
   - **Value**: Secret value
   - **Comment**: Optional description

## Secrets to Migrate

The following secrets should be stored in Infisical:

### GitHub Integration
- `GITHUB_TOKEN` - Personal access token for GitHub API
- `GITHUB_WEBHOOK_SECRET` - Secret for validating GitHub webhooks

### WikiJS Integration
- `WIKIJS_URL` - WikiJS instance URL
- `WIKIJS_TOKEN` - WikiJS API token

### Authentication
- `JWT_SECRET` - Secret for signing JWT tokens
- `DEFAULT_ADMIN_PASSWORD` - Default admin password (change after first login)

### Email Notifications
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `EMAIL_FROM` - Sender email address

### AdGuard Integration
- `ADGUARD_URL` - AdGuard Home URL
- `ADGUARD_USERNAME` - AdGuard admin username
- `ADGUARD_PASSWORD` - AdGuard admin password

## Usage Examples

### Basic Secret Retrieval

```javascript
const infisicalManager = require('./config/infisical');

// Single secret with fallback
const githubToken = await infisicalManager.getSecret(
  'GITHUB_TOKEN',      // Secret name in Infisical
  'dev',               // Environment
  'GITHUB_TOKEN'       // Fallback environment variable
);

if (!githubToken) {
  console.error('GitHub token not found!');
}
```

### Multiple Secrets at Once

```javascript
const secrets = await infisicalManager.getSecrets([
  { name: 'GITHUB_TOKEN', envVar: 'GITHUB_TOKEN' },
  { name: 'WIKIJS_TOKEN', envVar: 'WIKIJS_TOKEN' },
  { name: 'JWT_SECRET', envVar: 'JWT_SECRET' }
], 'dev');

console.log('GitHub Token:', secrets.GITHUB_TOKEN);
console.log('WikiJS Token:', secrets.WIKIJS_TOKEN);
```

### Setting Secrets Programmatically

```javascript
// Useful for initial setup or migration
await infisicalManager.setSecret('NEW_SECRET', 'secret-value', 'dev');
```

## Features

### Automatic Fallback

If Infisical is unavailable or a secret isn't found, the system automatically falls back to environment variables. This ensures the application continues working even if Infisical has issues.

### Caching

Secrets are cached for 5 minutes to reduce API calls and improve performance. The cache is automatically cleared when secrets are updated.

### Multi-Environment Support

The same codebase can work across different environments (dev, staging, prod) by simply changing the `INFISICAL_ENVIRONMENT` variable.

## Migration Guide

### Step 1: Add Secrets to Infisical

Log into Infisical and add all your secrets to the `homelab-gitops` project in the appropriate environment.

### Step 2: Update Application Code

Replace hardcoded secrets or direct `process.env` calls with Infisical manager:

**Before:**
```javascript
const githubToken = process.env.GITHUB_TOKEN;
```

**After:**
```javascript
const githubToken = await infisicalManager.getSecret('GITHUB_TOKEN', 'dev', 'GITHUB_TOKEN');
```

### Step 3: Test

1. Set `INFISICAL_TOKEN` in your environment
2. Remove secrets from `.env` file (but keep them as fallbacks temporarily)
3. Start the application and verify it connects to Infisical
4. Check logs for: `✅ Infisical connected successfully`
5. Verify all functionality works with Infisical-sourced secrets

### Step 4: Deploy

Once tested:
1. Deploy the updated code
2. Set `INFISICAL_TOKEN` in your production environment
3. Remove hardcoded secrets from deployment configuration
4. Monitor logs to ensure Infisical integration is working

## Troubleshooting

### Infisical Not Connecting

```
⚠️  INFISICAL_TOKEN not set - secrets management disabled
```

**Solution**: Set the `INFISICAL_TOKEN` environment variable.

### Secret Not Found

```
⚠️  Secret "SECRET_NAME" not found in Infisical or environment variables
```

**Solutions**:
1. Verify the secret exists in Infisical for the correct environment
2. Check the secret name is spelled correctly
3. Ensure fallback environment variable is set if needed

### SSL/Certificate Issues

If you see SSL errors connecting to Infisical:

```javascript
// For self-signed certificates in development only
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

**Warning**: Never use this in production!

## Security Best Practices

1. **Never commit** the service token to Git
2. **Rotate tokens** periodically (recommend every 90 days)
3. **Use different tokens** for different environments
4. **Limit token permissions** to only what's needed (read-only if possible)
5. **Monitor access** through Infisical audit logs
6. **Backup secrets** regularly outside of Infisical
7. **Use environment-specific** secrets (don't share prod secrets with dev)

## Service Token Management

### Current Token

- **Token**: `st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4...`
- **Created**: 2025-11-14
- **Environment**: Development
- **Permissions**: Read/Write
- **Expiration**: Never

### Rotating the Token

1. In Infisical, create a new service token
2. Update `INFISICAL_TOKEN` in your deployment
3. Restart the application
4. Verify connectivity: check logs for `✅ Infisical connected successfully`
5. Delete the old token from Infisical

## API Reference

### `initialize()`

Initialize the Infisical client. Called automatically on first use.

```javascript
await infisicalManager.initialize();
```

### `getSecret(secretName, environment, fallbackEnvVar)`

Get a single secret with optional fallback.

**Parameters**:
- `secretName` (string): Name of the secret in Infisical
- `environment` (string): Environment (dev, staging, prod) - default: 'dev'
- `fallbackEnvVar` (string|null): Environment variable name for fallback - default: null

**Returns**: `Promise<string|null>` - Secret value or null

### `getSecrets(secrets, environment)`

Get multiple secrets at once.

**Parameters**:
- `secrets` (Array): Array of `{name, envVar}` objects
- `environment` (string): Environment - default: 'dev'

**Returns**: `Promise<Object>` - Object with secret names as keys

### `setSecret(secretName, secretValue, environment)`

Create or update a secret in Infisical.

**Parameters**:
- `secretName` (string): Name of the secret
- `secretValue` (string): Value to set
- `environment` (string): Environment - default: 'dev'

**Returns**: `Promise<boolean>` - Success status

### `clearCache()`

Clear the in-memory secrets cache.

```javascript
infisicalManager.clearCache();
```

## Future Enhancements

- [ ] Add support for Infisical Machine Identities (more secure than service tokens)
- [ ] Implement automatic secret rotation
- [ ] Add secrets validation on application startup
- [ ] Create CLI tool for bulk secret migration
- [ ] Add integration tests for Infisical connectivity
- [ ] Support for secret versioning and rollback
- [ ] Webhook notifications for secret changes

## Support

For issues or questions:
1. Check Infisical logs: `ssh root@192.168.1.29 "tail -f /var/log/infisical-core/infisical-core/current"`
2. Check application logs for Infisical errors
3. Verify network connectivity to Infisical server
4. Review Infisical documentation: https://infisical.com/docs

---

**Last Updated**: 2025-11-14
**Infisical Version**: Community Edition (Latest)
**Integration Status**: ✅ Complete and Ready for Use

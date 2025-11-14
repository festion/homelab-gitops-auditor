# ✅ Infisical homelab-admin Project Complete

## Summary

The homelab-admin Infisical project has been successfully created and integrated with the homelab-gitops-auditor. This project manages infrastructure and DevOps secrets separately from application secrets.

## Project Details

### Organization & Projects

**Organization**: homelab (ID: f9c51cc5-d36c-4ef4-a667-71ba17187793)

**Projects**:
1. **homelab-gitops** - Application secrets
   - Service Token: `st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4...`
   - Purpose: Application-level secrets (GitHub, WikiJS, SMTP, etc.)

2. **homelab-admin** - Infrastructure/DevOps secrets ✨ NEW
   - Service Token: `st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae`
   - Purpose: Infrastructure credentials (Proxmox, AdGuard, KEA, Traefik, etc.)

## Integration Files Created

### Bash Integration

**File**: `scripts/infisical-admin-helper.sh`

Bash utility functions for managing infrastructure secrets:

```bash
# Usage
export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab..."
source scripts/infisical-admin-helper.sh

# Test connection
test_admin_connection

# Get a secret
PROXMOX_PASSWORD=$(get_admin_secret "PROXMOX_PASSWORD")

# Set a secret
set_admin_secret "CLOUDFLARE_API_KEY" "your-api-key"

# List all secrets
list_admin_secrets

# Load credential sets
get_proxmox_credentials
get_adguard_credentials
```

**Available Functions**:
- `test_admin_connection` - Test connection to Infisical
- `list_admin_secrets [env]` - List all secrets
- `get_admin_secret NAME [env]` - Get a secret value
- `set_admin_secret NAME VALUE [env]` - Set a secret value
- `get_proxmox_credentials` - Load Proxmox credentials to env vars
- `get_adguard_credentials` - Load AdGuard credentials to env vars

### Node.js Integration

**File**: `api/config/infisical-admin.js`

Node.js module for infrastructure secrets management:

```javascript
const infisicalAdmin = require('./config/infisical-admin');

// Initialize on startup
await infisicalAdmin.initialize();

// Get individual secrets
const proxmoxPassword = await infisicalAdmin.getSecret('PROXMOX_PASSWORD');

// Get credential sets
const proxmox = await infisicalAdmin.getProxmoxCredentials();
const adguard = await infisicalAdmin.getAdGuardCredentials();
const kea = await infisicalAdmin.getKeaDhcpConfig();

// Set a secret
await infisicalAdmin.setSecret('CLOUDFLARE_API_KEY', 'your-key');

// List all secrets
const secrets = await infisicalAdmin.listSecrets();
```

**Built-in Helper Methods**:
- `getProxmoxCredentials()` - Returns `{host, username, password, apiToken}`
- `getAdGuardCredentials()` - Returns `{primaryUrl, secondaryUrl, username, password}`
- `getKeaDhcpConfig()` - Returns `{primaryHost, secondaryHost, apiPort, configPath}`

### Test Script

**File**: `api/test-infisical-admin.js`

Test script to validate the integration:

```bash
cd api
INFISICAL_ADMIN_TOKEN=st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab... node test-infisical-admin.js
```

This will:
- ✅ Verify connection to Infisical
- ✅ Test token validity
- ✅ List existing secrets
- ✅ Test secret retrieval with fallback
- ✅ Test helper methods (Proxmox, AdGuard, KEA)
- ✅ Verify caching functionality

### Environment Variables

**File**: `api/.env.example` (updated)

```bash
# Application Secrets (homelab-gitops project)
INFISICAL_TOKEN=st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4...
INFISICAL_SITE_URL=https://infisical.internal.lakehouse.wtf
INFISICAL_ENVIRONMENT=dev

# Infrastructure Secrets (homelab-admin project)
INFISICAL_ADMIN_TOKEN=st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab...
INFISICAL_ADMIN_ENV=prod
```

## Recommended Secrets to Add

### Priority 1: Core Infrastructure

Add these secrets first via the Infisical web UI (https://infisical.internal.lakehouse.wtf):

#### Proxmox VE
```
PROXMOX_HOST=192.168.1.137
PROXMOX_USERNAME=root@pam
PROXMOX_PASSWORD=redflower805
PROXMOX_API_TOKEN=<generate-if-needed>
```

#### AdGuard Home
```
ADGUARD_PRIMARY_URL=http://192.168.1.253:80
ADGUARD_SECONDARY_URL=http://192.168.1.224:80
ADGUARD_USERNAME=admin
ADGUARD_PASSWORD=<your-password>
```

#### KEA DHCP
```
KEA_PRIMARY_HOST=192.168.1.133
KEA_SECONDARY_HOST=192.168.1.134
KEA_API_PORT=8000
KEA_CONFIG_PATH=/etc/kea/kea-dhcp4.conf
```

#### Traefik
```
TRAEFIK_HOST=192.168.1.110
TRAEFIK_API_PORT=8080
TRAEFIK_CONFIG_PATH=/etc/traefik
```

### Priority 2: Cloud Services

#### Cloudflare (for SSL/DNS)
```
CLOUDFLARE_EMAIL=<your-email>
CLOUDFLARE_API_KEY=<your-api-key>
CLOUDFLARE_API_TOKEN=<your-api-token>
CLOUDFLARE_ZONE_ID=<your-zone-id>
```

### Priority 3: Monitoring & Documentation

#### Uptime Kuma
```
UPTIME_KUMA_URL=http://192.168.1.132
UPTIME_KUMA_USERNAME=admin
UPTIME_KUMA_PASSWORD=<your-password>
```

#### Wiki.js
```
WIKIJS_URL=https://wiki.internal.lakehouse.wtf
WIKIJS_ADMIN_EMAIL=<your-email>
WIKIJS_API_TOKEN=<your-token>
```

#### InfluxDB
```
INFLUXDB_URL=http://192.168.1.74:8086
INFLUXDB_TOKEN=<your-token>
INFLUXDB_ORG=homelab
INFLUXDB_BUCKET=infrastructure
```

### Priority 4: Automation Keys

#### SSH Keys
```
SSH_PRIVATE_KEY_PROXMOX=<private-key-content>
SSH_PRIVATE_KEY_INFRASTRUCTURE=<private-key-content>
SSH_KNOWN_HOSTS=<known-hosts-content>
```

## Usage Examples

### Example 1: Automated Proxmox LXC Deployment

```bash
#!/bin/bash
source scripts/infisical-admin-helper.sh

# Load Proxmox credentials
get_proxmox_credentials

# Create a new LXC container
sshpass -p "$PROXMOX_PASSWORD" ssh "$PROXMOX_USERNAME@$PROXMOX_HOST" \
  "pct create 999 local:vztmpl/debian-12-standard.tar.zst \
   --hostname test-service \
   --memory 2048 \
   --cores 2 \
   --net0 name=eth0,bridge=vmbr0,ip=dhcp"

echo "✅ LXC 999 created successfully"
```

### Example 2: DNS Rewrite Automation

```bash
#!/bin/bash
source scripts/infisical-admin-helper.sh

# Load AdGuard credentials
get_adguard_credentials

# Add DNS rewrite
curl -u "$ADGUARD_USERNAME:$ADGUARD_PASSWORD" \
  -X POST "$ADGUARD_PRIMARY_URL/control/rewrite/add" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "newservice.internal.lakehouse.wtf",
    "answer": "192.168.1.200"
  }'

echo "✅ DNS rewrite added"
```

### Example 3: Node.js Infrastructure Automation

```javascript
const infisicalAdmin = require('./config/infisical-admin');

async function deployService() {
  await infisicalAdmin.initialize();

  // Get Proxmox credentials
  const proxmox = await infisicalAdmin.getProxmoxCredentials();

  // Get AdGuard credentials
  const adguard = await infisicalAdmin.getAdGuardCredentials();

  // Get KEA DHCP config
  const kea = await infisicalAdmin.getKeaDhcpConfig();

  console.log('✅ All infrastructure credentials loaded');
  console.log('Ready to deploy service...');

  // Your automation logic here...
}

deployService();
```

## Security Best Practices

### Token Management

1. **Store Securely**: Never commit tokens to Git
2. **Environment Variables**: Use `.env` files (add to `.gitignore`)
3. **Rotation Schedule**:
   - Rotate admin token every 90 days
   - Document rotation date
   - Update all deployment environments

### Access Control

1. **Separate Projects**: Application vs Infrastructure secrets
2. **Environment Separation**: Use `prod` for production infrastructure
3. **Least Privilege**: Only grant necessary permissions
4. **Audit Logging**: Monitor access through Infisical audit logs

### Secret Organization

Organize secrets by service/component:

```
homelab-admin/prod/
├── proxmox/
│   ├── PROXMOX_HOST
│   ├── PROXMOX_USERNAME
│   ├── PROXMOX_PASSWORD
│   └── PROXMOX_API_TOKEN
├── networking/
│   ├── ADGUARD_USERNAME
│   ├── ADGUARD_PASSWORD
│   ├── KEA_PRIMARY_HOST
│   └── TRAEFIK_HOST
└── cloud/
    ├── CLOUDFLARE_API_KEY
    └── CLOUDFLARE_ZONE_ID
```

## Testing the Integration

### Bash Integration Test

```bash
# Set the admin token
export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae"

# Source the helper
source scripts/infisical-admin-helper.sh

# Test connection
test_admin_connection

# List secrets
list_admin_secrets
```

### Node.js Integration Test

```bash
cd api

# Set the admin token
export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae"

# Run test script
node test-infisical-admin.js
```

## Documentation Files

1. **INFISICAL_HOMELAB_ADMIN_PROJECT.md** - Complete project setup guide
2. **INFISICAL_ADMIN_COMPLETE.md** - This file, integration summary
3. **INFISICAL_INTEGRATION_COMPLETE.md** - Application secrets integration
4. **INFISICAL_INTEGRATION.md** - Detailed integration guide

## Next Steps

1. **Add Secrets**: Log into Infisical and add recommended secrets
   - Navigate to https://infisical.internal.lakehouse.wtf
   - Select "homelab-admin" project
   - Add secrets for Proxmox, AdGuard, KEA, etc.

2. **Test Integration**: Run the test scripts
   ```bash
   # Bash test
   export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab..."
   source scripts/infisical-admin-helper.sh
   test_admin_connection

   # Node.js test
   cd api
   INFISICAL_ADMIN_TOKEN="st.5289cbfa..." node test-infisical-admin.js
   ```

3. **Migrate Existing Scripts**: Update automation scripts to use Infisical
   - Replace hardcoded credentials
   - Use `infisical-admin-helper.sh` functions
   - Test each script after migration

4. **Set Up Backups**: Create automated backup script
   ```bash
   # Example backup script
   curl -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
     "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw?environment=prod" \
     | gpg --encrypt > backup.gpg
   ```

5. **Document Rotation Schedule**: Track when credentials were last rotated

## Architecture Overview

```
homelab-gitops-auditor
    ↓
    ├── Application Code
    │   ├── Uses INFISICAL_TOKEN
    │   ├── Accesses homelab-gitops project
    │   └── Gets: GITHUB_TOKEN, WIKIJS_TOKEN, SMTP_*, etc.
    │
    └── Infrastructure Automation
        ├── Uses INFISICAL_ADMIN_TOKEN
        ├── Accesses homelab-admin project
        └── Gets: PROXMOX_*, ADGUARD_*, KEA_*, CLOUDFLARE_*, etc.

Both connect to:
    Infisical Server (192.168.1.29)
    ├── Organization: homelab
    ├── Project: homelab-gitops (Application)
    └── Project: homelab-admin (Infrastructure) ✨
```

## Benefits of Separation

✅ **Security**: Different tokens for different purposes
✅ **Access Control**: Can grant different permissions per project
✅ **Audit**: Separate audit trails for app vs infrastructure
✅ **Compliance**: Clear separation of concerns
✅ **Rotation**: Can rotate infrastructure credentials independently
✅ **Team Access**: Different team members can access different projects

## Troubleshooting

### Connection Issues

```bash
# Test Infisical server
curl https://infisical.internal.lakehouse.wtf/api/status

# Test with token
curl -H "Authorization: Bearer st.5289cbfa..." \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw?environment=prod"
```

### Token Issues

- Verify token is correct and not expired
- Check token has permissions for the environment
- Ensure using correct project token (admin vs gitops)

### Secret Not Found

- Verify secret exists in Infisical web UI
- Check correct environment (dev/staging/prod)
- Verify secret name matches exactly (case-sensitive)

## Status

✅ **homelab-admin project created**
✅ **Service token generated**
✅ **Bash integration complete**
✅ **Node.js integration complete**
✅ **Test scripts created**
✅ **Documentation complete**
⏳ **Pending**: Add secrets via Infisical web UI

---

**Created**: 2025-11-14
**Token Generated**: 2025-11-14
**Service Token**: `st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae`
**Status**: ✅ Ready for use
**Next Action**: Add infrastructure secrets via Infisical web UI

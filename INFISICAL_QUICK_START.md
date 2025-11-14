# Infisical Quick Start Guide

## Overview

Your homelab now has two Infisical projects for managing secrets:

1. **homelab-gitops** - Application secrets (GitHub, WikiJS, SMTP, etc.)
2. **homelab-admin** - Infrastructure secrets (Proxmox, AdGuard, KEA, etc.)

## Access

**Infisical Web UI**: https://infisical.internal.lakehouse.wtf
**Login**: homelab@admin.local
**Organization**: homelab

## Service Tokens

### Application Secrets (homelab-gitops)
```bash
export INFISICAL_TOKEN="st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4.6e4f82a64138dda74e5176e7bccaef5b.54c8b6d1931e1049be586370fe32b3ef"
```

### Infrastructure Secrets (homelab-admin)
```bash
export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae"
```

## Quick Commands

### Bash (Infrastructure Automation)

```bash
# Load helper functions
source scripts/infisical-admin-helper.sh

# Test connection
test_admin_connection

# List secrets
list_admin_secrets

# Get a secret
PASSWORD=$(get_admin_secret "PROXMOX_PASSWORD")

# Set a secret
set_admin_secret "CLOUDFLARE_API_KEY" "your-key"

# Load credential sets
get_proxmox_credentials    # Sets PROXMOX_HOST, PROXMOX_USERNAME, PROXMOX_PASSWORD
get_adguard_credentials    # Sets ADGUARD_* variables
```

### Node.js (Application Code)

```javascript
// Application secrets
const infisicalManager = require('./config/infisical');
await infisicalManager.initialize();
const githubToken = await infisicalManager.getSecret('GITHUB_TOKEN');

// Infrastructure secrets
const infisicalAdmin = require('./config/infisical-admin');
await infisicalAdmin.initialize();
const proxmox = await infisicalAdmin.getProxmoxCredentials();
```

### Direct API Access

```bash
# Get a secret
curl -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw/PROXMOX_PASSWORD?environment=prod"

# List all secrets
curl -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw?environment=prod"

# Set a secret
curl -X POST \
  -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"secretName":"TEST","secretValue":"value","environment":"prod","type":"shared"}' \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw/TEST"
```

## Priority Secrets to Add

### Step 1: Core Infrastructure (Add First)

Log into Infisical → homelab-admin project → Add these secrets:

```
PROXMOX_HOST=192.168.1.137
PROXMOX_USERNAME=root@pam
PROXMOX_PASSWORD=redflower805

ADGUARD_USERNAME=admin
ADGUARD_PASSWORD=<your-password>

KEA_PRIMARY_HOST=192.168.1.133
KEA_SECONDARY_HOST=192.168.1.134
```

### Step 2: Cloud Services

```
CLOUDFLARE_API_KEY=<your-key>
CLOUDFLARE_API_TOKEN=<your-token>
CLOUDFLARE_ZONE_ID=<your-zone-id>
```

### Step 3: Application Secrets

Switch to homelab-gitops project:

```
GITHUB_TOKEN=<your-token>
WIKIJS_TOKEN=<your-token>
SMTP_HOST=<smtp-server>
SMTP_PASSWORD=<password>
```

## Testing

### Test Infrastructure Integration

```bash
# Bash test
export INFISICAL_ADMIN_TOKEN="st.5289cbfa..."
source scripts/infisical-admin-helper.sh
test_admin_connection
list_admin_secrets

# Node.js test
cd api
INFISICAL_ADMIN_TOKEN="st.5289cbfa..." node test-infisical-admin.js
```

### Test Application Integration

```bash
cd api
INFISICAL_TOKEN="st.650cfc13..." node test-infisical.js
```

## Common Tasks

### Add a New Secret

1. **Via Web UI** (Recommended):
   - Log in to https://infisical.internal.lakehouse.wtf
   - Select project (homelab-gitops or homelab-admin)
   - Click "Add Secret"
   - Enter name and value

2. **Via Bash**:
   ```bash
   source scripts/infisical-admin-helper.sh
   set_admin_secret "SECRET_NAME" "secret-value"
   ```

3. **Via Node.js**:
   ```javascript
   await infisicalAdmin.setSecret('SECRET_NAME', 'secret-value');
   ```

### Use Secrets in Scripts

**Bash Script Example**:
```bash
#!/bin/bash
source scripts/infisical-admin-helper.sh

# Get Proxmox password
PROXMOX_PASSWORD=$(get_admin_secret "PROXMOX_PASSWORD")

# Use it
sshpass -p "$PROXMOX_PASSWORD" ssh root@192.168.1.137 "pct list"
```

**Node.js Script Example**:
```javascript
const infisicalAdmin = require('./config/infisical-admin');

async function main() {
  await infisicalAdmin.initialize();

  const proxmox = await infisicalAdmin.getProxmoxCredentials();

  // Use credentials
  console.log(`Connecting to ${proxmox.host} as ${proxmox.username}`);
}
```

### Backup Secrets

```bash
# Backup all secrets (encrypted)
curl -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw?environment=prod" \
  | gpg --encrypt --recipient admin@homelab.local > backup-$(date +%Y%m%d).gpg
```

## Security Checklist

- [ ] Service tokens stored in `.env` files (not committed to Git)
- [ ] `.env` added to `.gitignore`
- [ ] Tokens rotated every 90 days
- [ ] Production secrets only in `prod` environment
- [ ] Development/testing uses `dev` environment
- [ ] Regular backups of critical secrets
- [ ] Audit logs reviewed monthly

## Troubleshooting

### "Failed to connect to Infisical"
```bash
# Test server
curl https://infisical.internal.lakehouse.wtf/api/status

# Check DNS
nslookup infisical.internal.lakehouse.wtf
```

### "Secret not found"
- Verify secret exists in web UI
- Check environment (dev/staging/prod)
- Verify secret name (case-sensitive)

### "Invalid token"
- Verify token not expired
- Check using correct token (gitops vs admin)
- Regenerate token if needed

## Documentation

- **INFISICAL_ADMIN_COMPLETE.md** - Complete homelab-admin setup
- **INFISICAL_INTEGRATION_COMPLETE.md** - Complete homelab-gitops setup
- **INFISICAL_HOMELAB_ADMIN_PROJECT.md** - Admin project detailed guide
- **INFISICAL_INTEGRATION.md** - Application integration guide

## Quick Reference

| What | Use This |
|------|----------|
| Infrastructure automation | `INFISICAL_ADMIN_TOKEN` + `scripts/infisical-admin-helper.sh` |
| Application code | `INFISICAL_TOKEN` + `api/config/infisical.js` |
| Add secrets | Infisical Web UI (recommended) |
| Test integration | `test-infisical-admin.js` or bash helper |
| List secrets | `list_admin_secrets` or Web UI |
| Backup secrets | `curl` + `gpg` |

---

**Created**: 2025-11-14
**Infisical URL**: https://infisical.internal.lakehouse.wtf
**Status**: ✅ Ready to use

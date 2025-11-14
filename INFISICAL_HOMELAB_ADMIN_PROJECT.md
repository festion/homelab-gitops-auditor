# Infisical homelab-admin Project Setup

## Overview

This document guides you through creating a second Infisical project called `homelab-admin` for DevOps administration secrets, separate from the application secrets in `homelab-gitops`.

## Why Separate Projects?

Separating administrative/DevOps secrets from application secrets provides:

✅ **Better Security**: Different access controls for infrastructure vs application
✅ **Clear Separation**: Infrastructure credentials isolated from app credentials
✅ **Access Control**: Different team members can have access to different projects
✅ **Audit Trails**: Separate audit logs for administrative actions
✅ **Compliance**: Easier to demonstrate proper credential segregation

## Project Structure

```
Organization: homelab
├── Project: homelab-gitops (Application Secrets)
│   ├── GITHUB_TOKEN
│   ├── WIKIJS_TOKEN
│   ├── SMTP_* credentials
│   └── Application API keys
│
└── Project: homelab-admin (DevOps/Infrastructure Secrets)
    ├── PROXMOX_* credentials
    ├── ADGUARD_* credentials
    ├── KEA_DHCP credentials
    ├── TRAEFIK_* credentials
    ├── SSH_PRIVATE_KEYS
    ├── CLOUDFLARE_* credentials
    └── Infrastructure API tokens
```

## Creating the homelab-admin Project

### Option 1: Via Web UI (Recommended)

1. **Log in to Infisical**: https://infisical.internal.lakehouse.wtf

2. **Navigate to Organization**:
   - Click on "homelab" organization in the sidebar

3. **Create New Project**:
   - Click "+ New Project" button
   - Fill in details:
     - **Project Name**: `homelab-admin`
     - **Description**: "DevOps and infrastructure administration secrets"
     - **Environment**: Use default (Development, Staging, Production)
   - Click "Create Project"

4. **Configure Environments**:
   The project will have these environments by default:
   - **Development** (`dev`) - For testing infrastructure changes
   - **Staging** (`staging`) - For staging environment credentials
   - **Production** (`prod`) - For production infrastructure credentials

### Option 2: Via API

If you have an organization-level API token:

```bash
curl -X POST https://infisical.internal.lakehouse.wtf/api/v2/workspace \
  -H "Authorization: Bearer <your-org-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "homelab-admin",
    "projectDescription": "DevOps and infrastructure administration secrets",
    "shouldCreateDefaultEnvs": true
  }'
```

## Recommended Secrets for homelab-admin

### Proxmox VE
```
PROXMOX_HOST=192.168.1.137
PROXMOX_USERNAME=root@pam
PROXMOX_PASSWORD=<your-password>
PROXMOX_API_TOKEN=<your-api-token>
```

### AdGuard Home
```
ADGUARD_PRIMARY_URL=http://192.168.1.253:80
ADGUARD_SECONDARY_URL=http://192.168.1.224:80
ADGUARD_USERNAME=admin
ADGUARD_PASSWORD=<your-password>
```

### KEA DHCP
```
KEA_PRIMARY_HOST=192.168.1.133
KEA_SECONDARY_HOST=192.168.1.134
KEA_API_PORT=8000
KEA_CONFIG_PATH=/etc/kea/kea-dhcp4.conf
```

### Traefik
```
TRAEFIK_HOST=192.168.1.110
TRAEFIK_API_PORT=8080
TRAEFIK_CONFIG_PATH=/etc/traefik
```

### Cloudflare (for SSL/DNS)
```
CLOUDFLARE_EMAIL=<your-email>
CLOUDFLARE_API_KEY=<your-api-key>
CLOUDFLARE_API_TOKEN=<your-api-token>
CLOUDFLARE_ZONE_ID=<your-zone-id>
```

### SSH Keys (for automation)
```
SSH_PRIVATE_KEY_PROXMOX=<private-key-content>
SSH_PRIVATE_KEY_INFRASTRUCTURE=<private-key-content>
SSH_KNOWN_HOSTS=<known-hosts-content>
```

### NetBox (if deployed)
```
NETBOX_URL=http://192.168.1.138
NETBOX_API_TOKEN=<your-token>
```

### Uptime Kuma
```
UPTIME_KUMA_URL=http://192.168.1.132
UPTIME_KUMA_USERNAME=admin
UPTIME_KUMA_PASSWORD=<your-password>
```

### Wiki.js
```
WIKIJS_URL=https://wiki.internal.lakehouse.wtf
WIKIJS_ADMIN_EMAIL=<your-email>
WIKIJS_API_TOKEN=<your-token>
```

### InfluxDB (if used for metrics)
```
INFLUXDB_URL=http://192.168.1.74:8086
INFLUXDB_TOKEN=<your-token>
INFLUXDB_ORG=homelab
INFLUXDB_BUCKET=infrastructure
```

## Generate Service Token

After creating the project:

1. **Navigate to Project Settings**:
   - Click on `homelab-admin` project
   - Click "Project Settings" (gear icon)

2. **Go to Service Tokens**:
   - Click "Service Tokens" tab
   - Click "Create service token"

3. **Configure Token**:
   - **Name**: `devops-automation`
   - **Environment**: Production (or select multiple)
   - **Secret Path**: `/`
   - **Permissions**: Read & Write
   - **Expiration**: Never (or set appropriate expiration)

4. **Save the Token**:
   ```
   INFISICAL_ADMIN_TOKEN=st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab.a48aac557989f1cbd84c483db1af65b7.ad2d8162797542dbb25a7ab8fc64f6ae
   ```

   ✅ **Token Generated**: 2025-11-14
   ⚠️ **Keep Secure**: Never commit to Git, rotate every 90 days

## Using homelab-admin Secrets

### In Automation Scripts

```bash
#!/bin/bash

# Set Infisical token for admin project
export INFISICAL_TOKEN="st.your-admin-token-here"
export INFISICAL_PROJECT_ID="homelab-admin-project-id"

# Fetch secrets
PROXMOX_PASSWORD=$(curl -s -H "Authorization: Bearer $INFISICAL_TOKEN" \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw/PROXMOX_PASSWORD?environment=prod" \
  | jq -r '.secret.secretValue')

# Use in automation
ssh root@$PROXMOX_HOST "pct list"
```

### In Node.js Scripts

```javascript
const axios = require('axios');

const INFISICAL_ADMIN_TOKEN = process.env.INFISICAL_ADMIN_TOKEN;
const INFISICAL_URL = 'https://infisical.internal.lakehouse.wtf';

async function getAdminSecret(secretName, environment = 'prod') {
  const response = await axios.get(
    `${INFISICAL_URL}/api/v3/secrets/raw/${secretName}`,
    {
      headers: {
        'Authorization': `Bearer ${INFISICAL_ADMIN_TOKEN}`
      },
      params: { environment }
    }
  );
  return response.data.secret.secretValue;
}

// Usage
const proxmoxPassword = await getAdminSecret('PROXMOX_PASSWORD');
const adguardPassword = await getAdminSecret('ADGUARD_PASSWORD');
```

### In Python Scripts

```python
import os
import requests

INFISICAL_ADMIN_TOKEN = os.environ['INFISICAL_ADMIN_TOKEN']
INFISICAL_URL = 'https://infisical.internal.lakehouse.wtf'

def get_admin_secret(secret_name, environment='prod'):
    response = requests.get(
        f'{INFISICAL_URL}/api/v3/secrets/raw/{secret_name}',
        headers={'Authorization': f'Bearer {INFISICAL_ADMIN_TOKEN}'},
        params={'environment': environment}
    )
    return response.json()['secret']['secretValue']

# Usage
proxmox_password = get_admin_secret('PROXMOX_PASSWORD')
adguard_password = get_admin_secret('ADGUARD_PASSWORD')
```

## Access Control

### Recommended Roles

1. **Admin Users** (You):
   - Full access to both `homelab-gitops` and `homelab-admin`
   - Can create/read/update/delete secrets
   - Can manage project settings

2. **Application Developers**:
   - Read/Write access to `homelab-gitops`
   - No access to `homelab-admin`

3. **DevOps/Infrastructure**:
   - Read/Write access to `homelab-admin`
   - Read-only access to `homelab-gitops` (if needed)

4. **CI/CD Pipelines**:
   - Service token for `homelab-gitops` (application deployment)
   - Service token for `homelab-admin` (infrastructure automation)

## Security Best Practices

### Token Management

1. **Separate Tokens**:
   - Different service tokens for different purposes
   - Never reuse tokens across projects

2. **Environment Separation**:
   - Use `dev` environment for testing
   - Use `prod` environment for live infrastructure
   - Never mix development and production credentials

3. **Rotation Schedule**:
   - Rotate admin tokens every 90 days
   - Rotate critical infrastructure credentials every 30 days
   - Update service tokens after any security incident

4. **Access Auditing**:
   - Regularly review Infisical audit logs
   - Monitor for unusual access patterns
   - Alert on failed authentication attempts

### Secret Organization

```
homelab-admin/
├── prod/
│   ├── /proxmox/
│   │   ├── PROXMOX_HOST
│   │   ├── PROXMOX_PASSWORD
│   │   └── PROXMOX_API_TOKEN
│   ├── /networking/
│   │   ├── ADGUARD_PASSWORD
│   │   ├── KEA_DHCP_CONFIG
│   │   └── TRAEFIK_CONFIG
│   └── /cloud/
│       ├── CLOUDFLARE_API_KEY
│       └── CLOUDFLARE_ZONE_ID
├── staging/
│   └── (staging credentials)
└── dev/
    └── (development credentials)
```

## Migration Checklist

After creating the project, migrate existing credentials:

- [ ] Proxmox credentials from scripts
- [ ] AdGuard admin passwords
- [ ] SSH private keys from ~/.ssh/
- [ ] Cloudflare API tokens
- [ ] Traefik configuration secrets
- [ ] Database passwords for infrastructure services
- [ ] API tokens for monitoring tools
- [ ] Backup encryption keys

## Integration Examples

### Proxmox Automation

```bash
#!/bin/bash
# Automated LXC deployment using Infisical

INFISICAL_TOKEN="$INFISICAL_ADMIN_TOKEN"

# Fetch credentials
PROXMOX_HOST=$(get_secret PROXMOX_HOST)
PROXMOX_PASSWORD=$(get_secret PROXMOX_PASSWORD)

# Deploy LXC
sshpass -p "$PROXMOX_PASSWORD" ssh root@$PROXMOX_HOST \
  "pct create 108 local:vztmpl/debian-12-standard.tar.zst --hostname newservice"
```

### DNS Update Automation

```javascript
const adguardPassword = await getAdminSecret('ADGUARD_PASSWORD');

await axios.post(
  'http://192.168.1.253:80/control/rewrite/add',
  { domain: 'newservice.internal.lakehouse.wtf', answer: '192.168.1.150' },
  { auth: { username: 'admin', password: adguardPassword } }
);
```

## Backup Strategy

### Regular Backups

```bash
#!/bin/bash
# Backup all secrets from homelab-admin

BACKUP_DIR="/secure/backups/infisical"
DATE=$(date +%Y%m%d)

# Export secrets (requires admin access)
curl -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
  "https://infisical.internal.lakehouse.wtf/api/v3/secrets/raw?environment=prod" \
  > "$BACKUP_DIR/homelab-admin-prod-$DATE.json"

# Encrypt backup
gpg --encrypt --recipient admin@homelab.local \
  "$BACKUP_DIR/homelab-admin-prod-$DATE.json"

# Remove unencrypted copy
rm "$BACKUP_DIR/homelab-admin-prod-$DATE.json"
```

## Documentation

Keep track of what secrets are stored where:

| Secret Name | Purpose | Rotation Schedule | Last Rotated |
|-------------|---------|-------------------|--------------|
| PROXMOX_PASSWORD | Proxmox VE admin | Every 90 days | 2025-11-14 |
| ADGUARD_PASSWORD | AdGuard admin | Every 90 days | 2025-11-14 |
| CLOUDFLARE_API_KEY | DNS/SSL automation | Every 90 days | 2025-11-14 |
| SSH_PRIVATE_KEY | Infrastructure automation | Every 180 days | 2025-11-14 |

---

**Created**: 2025-11-14
**Purpose**: DevOps and infrastructure administration secrets
**Access Level**: Restricted to infrastructure administrators
**Service Token**: To be generated after project creation

# Homepage Secrets - Add to Infisical

## Project: homelab-gitops
## Environment: prod

These secrets should be added to the **homelab-gitops** project in Infisical.

## How to Add

1. Log in to Infisical: https://infisical.internal.lakehouse.wtf
2. Select the **homelab-gitops** project
3. Ensure you're in the **Production** environment
4. Click **"Add Secret"** for each entry below
5. Copy the **Key** and **Value** from below

---

## Application Configuration

### NODE_ENV
```
Key: NODE_ENV
Value: production
Comment: Node.js environment setting
```

### PORT
```
Key: PORT
Value: 3000
Comment: Homepage application port
```

### HOMEPAGE_ALLOWED_HOSTS
```
Key: HOMEPAGE_ALLOWED_HOSTS
Value: homepage.internal.lakehouse.wtf,192.168.1.45,localhost
Comment: Allowed hosts for Homepage application
```

---

## Integration Credentials

### Proxmox VE

#### HOMEPAGE_VAR_PROXMOX_USER
```
Key: HOMEPAGE_VAR_PROXMOX_USER
Value: api@pve!homepage
Comment: Proxmox API user for Homepage
```

#### HOMEPAGE_VAR_PROXMOX_TOKEN
```
Key: HOMEPAGE_VAR_PROXMOX_TOKEN
Value: b82507b4-bd40-4dca-964d-bed948507af5
Comment: Proxmox API token for Homepage
```

---

### Home Assistant

#### HOMEPAGE_VAR_HASS_TOKEN
```
Key: HOMEPAGE_VAR_HASS_TOKEN
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI5YTAyYzMxZTNkYjM0YmQxYTQ2YzNlMmJhZDExMjI3NCIsImlhdCI6MTc0NzUwODk4OSwiZXhwIjoyMDYyODY4OTg5fQ.BwOQMlSgBOi7kb2IwgSIK4KCRDe2mI-sJL496NUwHkE
Comment: Home Assistant Long-Lived Access Token
```

---

### AdGuard Home

#### HOMEPAGE_VAR_ADGUARD_USER
```
Key: HOMEPAGE_VAR_ADGUARD_USER
Value: admin
Comment: AdGuard Home username
```

#### HOMEPAGE_VAR_ADGUARD_PASS
```
Key: HOMEPAGE_VAR_ADGUARD_PASS
Value: your-password
Comment: AdGuard Home password (UPDATE THIS!)
```

---

### TrueNAS

#### HOMEPAGE_VAR_TRUENAS_KEY
```
Key: HOMEPAGE_VAR_TRUENAS_KEY
Value: 2-pAgetpXlM3uqD0zg0EVuCZUIsxZisLcQ4kjB8a4zKFsRyKTM8kmwg9hgpeN5BYn5
Comment: TrueNAS API key
```

---

### Grafana

#### HOMEPAGE_VAR_GRAFANA_USER
```
Key: HOMEPAGE_VAR_GRAFANA_USER
Value: admin
Comment: Grafana username
```

#### HOMEPAGE_VAR_GRAFANA_PASS
```
Key: HOMEPAGE_VAR_GRAFANA_PASS
Value: redflower805
Comment: Grafana password
```

---

### Omada Controller

#### HOMEPAGE_VAR_OMADA_USER
```
Key: HOMEPAGE_VAR_OMADA_USER
Value: admin
Comment: Omada Controller username
```

#### HOMEPAGE_VAR_OMADA_PASS
```
Key: HOMEPAGE_VAR_OMADA_PASS
Value: admin
Comment: Omada Controller password
```

---

### InfluxDB

#### HOMEPAGE_VAR_INFLUX_USER
```
Key: HOMEPAGE_VAR_INFLUX_USER
Value: admin
Comment: InfluxDB username
```

#### HOMEPAGE_VAR_INFLUX_PASS
```
Key: HOMEPAGE_VAR_INFLUX_PASS
Value: redflower805
Comment: InfluxDB password
```

---

## Quick Copy-Paste Format (for bulk import if supported)

If Infisical supports JSON import, use this:

```json
{
  "NODE_ENV": "production",
  "PORT": "3000",
  "HOMEPAGE_ALLOWED_HOSTS": "homepage.internal.lakehouse.wtf,192.168.1.45,localhost",
  "HOMEPAGE_VAR_PROXMOX_USER": "api@pve!homepage",
  "HOMEPAGE_VAR_PROXMOX_TOKEN": "b82507b4-bd40-4dca-964d-bed948507af5",
  "HOMEPAGE_VAR_HASS_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI5YTAyYzMxZTNkYjM0YmQxYTQ2YzNlMmJhZDExMjI3NCIsImlhdCI6MTc0NzUwODk4OSwiZXhwIjoyMDYyODY4OTg5fQ.BwOQMlSgBOi7kb2IwgSIK4KCRDe2mI-sJL496NUwHkE",
  "HOMEPAGE_VAR_ADGUARD_USER": "admin",
  "HOMEPAGE_VAR_ADGUARD_PASS": "your-password",
  "HOMEPAGE_VAR_TRUENAS_KEY": "2-pAgetpXlM3uqD0zg0EVuCZUIsxZisLcQ4kjB8a4zKFsRyKTM8kmwg9hgpeN5BYn5",
  "HOMEPAGE_VAR_GRAFANA_USER": "admin",
  "HOMEPAGE_VAR_GRAFANA_PASS": "redflower805",
  "HOMEPAGE_VAR_OMADA_USER": "admin",
  "HOMEPAGE_VAR_OMADA_PASS": "admin",
  "HOMEPAGE_VAR_INFLUX_USER": "admin",
  "HOMEPAGE_VAR_INFLUX_PASS": "redflower805"
}
```

---

## ENV File Format (for reference)

```bash
NODE_ENV=production
PORT=3000
HOMEPAGE_ALLOWED_HOSTS=homepage.internal.lakehouse.wtf,192.168.1.45,localhost
HOMEPAGE_VAR_PROXMOX_USER=api@pve!homepage
HOMEPAGE_VAR_PROXMOX_TOKEN=b82507b4-bd40-4dca-964d-bed948507af5
HOMEPAGE_VAR_HASS_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI5YTAyYzMxZTNkYjM0YmQxYTQ2YzNlMmJhZDExMjI3NCIsImlhdCI6MTc0NzUwODk4OSwiZXhwIjoyMDYyODY4OTg5fQ.BwOQMlSgBOi7kb2IwgSIK4KCRDe2mI-sJL496NUwHkE
HOMEPAGE_VAR_ADGUARD_USER=admin
HOMEPAGE_VAR_ADGUARD_PASS=your-password
HOMEPAGE_VAR_TRUENAS_KEY=2-pAgetpXlM3uqD0zg0EVuCZUIsxZisLcQ4kjB8a4zKFsRyKTM8kmwg9hgpeN5BYn5
HOMEPAGE_VAR_GRAFANA_USER=admin
HOMEPAGE_VAR_GRAFANA_PASS=redflower805
HOMEPAGE_VAR_OMADA_USER=admin
HOMEPAGE_VAR_OMADA_PASS=admin
HOMEPAGE_VAR_INFLUX_USER=admin
HOMEPAGE_VAR_INFLUX_PASS=redflower805
```

---

## After Adding Secrets

Once all secrets are added to Infisical:

1. **Update Homepage Configuration**:
   - Modify Homepage to use Infisical for fetching credentials
   - Use the `infisicalManager` module from this project

2. **Remove Hardcoded Credentials**:
   - Update systemd service file to remove Environment= lines
   - Add only `INFISICAL_TOKEN` environment variable

3. **Test Integration**:
   ```bash
   cd api
   INFISICAL_TOKEN=st.650cfc13... node test-infisical.js
   ```

4. **Verify Homepage Still Works**:
   - Check all integrations (Proxmox, Home Assistant, AdGuard, etc.)
   - Verify widgets display correctly

---

## Security Notes

⚠️ **IMPORTANT**:
- The `HOMEPAGE_VAR_ADGUARD_PASS` value is listed as "your-password" - update this with the actual password!
- After adding to Infisical, remove any .env files or systemd service files containing these credentials
- Rotate the Proxmox API token and Home Assistant token periodically
- Consider using separate API tokens for each integration rather than admin credentials

---

**Created**: 2025-11-14
**Project**: homelab-gitops
**Environment**: prod
**Total Secrets**: 15

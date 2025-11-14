# Homepage Secrets - Corrections Required

## Issue

Homepage is showing "no server available" errors because the Proxmox credentials in Infisical don't match what the old systemd service was using.

## Credentials Mismatch

### What Was in Old Service File

```bash
HOMEPAGE_VAR_PROXMOX_USER=apiro@pam!homepage
HOMEPAGE_VAR_PROXMOX_PASS=218e9b95-c9b2-4dca-863d-24e56c2ae823
```

### What Was Added to Infisical

```bash
HOMEPAGE_VAR_PROXMOX_USER=api@pve!homepage  ❌ WRONG USERNAME
HOMEPAGE_VAR_PROXMOX_TOKEN=b82507b4-bd40-4dca-964d-bed948507af5  ❌ WRONG VARIABLE NAME
```

## Required Fixes in Infisical

Log in to https://infisical.internal.lakehouse.wtf → homelab-gitops project → Production environment

### 1. Fix Proxmox Username

**Secret**: `HOMEPAGE_VAR_PROXMOX_USER`
**Current Value**: `api@pve!homepage`
**Correct Value**: `apiro@pam!homepage`

**Action**: Edit the secret and change the value to `apiro@pam!homepage`

### 2. Add Proxmox Password

**Secret Name**: `HOMEPAGE_VAR_PROXMOX_PASS` (new secret)
**Value**: `218e9b95-c9b2-4dca-863d-24e56c2ae823`

**Action**: Create a new secret with this name and value

### 3. Optional: Remove Wrong Secret

**Secret**: `HOMEPAGE_VAR_PROXMOX_TOKEN`
**Action**: This secret is not needed (wrong name), you can delete it or leave it

## After Making Changes

Restart Homepage to reload the corrected secrets:

```bash
ssh root@192.168.1.137 "pct exec 150 -- systemctl restart homepage"
```

Then verify the secrets loaded correctly:

```bash
ssh root@192.168.1.137 "pct exec 150 -- journalctl -u homepage -n 30 --no-pager | grep -E '(✅|⚠️)'"
```

You should see:
```
  ✅ HOMEPAGE_VAR_PROXMOX_USER
  ✅ HOMEPAGE_VAR_PROXMOX_PASS
```

## Verify Homepage Works

After the restart, check that the Proxmox widget shows data:

1. Open http://192.168.1.45:2000
2. Check the "Proxmox (Main)" widget under Infrastructure
3. It should now show node status instead of "no server available"

## Summary of All Secrets

For reference, here are ALL the secrets Homepage needs:

```
NODE_ENV=production
PORT=3000
HOMEPAGE_ALLOWED_HOSTS=homepage.internal.lakehouse.wtf,192.168.1.45,localhost

# Proxmox (CORRECTED)
HOMEPAGE_VAR_PROXMOX_USER=apiro@pam!homepage
HOMEPAGE_VAR_PROXMOX_PASS=218e9b95-c9b2-4dca-863d-24e56c2ae823

# Other integrations (these should be correct)
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

**Issue**: Proxmox credentials mismatch
**Fix Required**: Update 2 secrets in Infisical
**Impact**: Proxmox widget showing "no server available"
**Resolution**: Fix secrets + restart Homepage service

# Traefik Native Installation Guide

**Installation Method**: Native binary in LXC container
**Target Container**: LXC 110 (192.168.1.110)
**Traefik Version**: v3.0+
**Operating System**: Debian 12 (bookworm)

---

## Architecture Decision

**Why Native Installation?**

The Traefik deployment uses **native binary installation** in an LXC container rather than Docker for the following reasons:

✅ **Simpler architecture** - Single isolation layer (LXC only)
✅ **Lower resource overhead** - No Docker daemon consuming memory/CPU
✅ **Easier management** - Direct systemd integration
✅ **Consistent with existing setup** - Matches Caddy deployment pattern (LXC 107)
✅ **Fewer failure points** - Less complexity to debug

**Architecture Comparison**:
```
❌ Original (Over-engineered):  Proxmox → LXC → Docker → Traefik
✅ Simplified (Native):          Proxmox → LXC → Traefik
```

---

## Prerequisites

Before installation, ensure:

1. ✅ **LXC 110 Container Created**:
   - Hostname: traefik
   - IP: 192.168.1.110/24
   - OS: Debian 12
   - Resources: 2 CPU, 2 GB RAM, 8 GB disk

2. ✅ **Directory Structure Created**:
   ```
   /etc/traefik/              # Configuration directory
   /etc/traefik/dynamic/      # Dynamic configuration
   /etc/traefik/certs/        # Certificate storage
   /etc/traefik/acme.json     # Let's Encrypt storage (600)
   /var/log/traefik/          # Log files
   /var/lib/traefik/          # Persistent data
   ```

3. ✅ **Network Connectivity**:
   - Container can reach internet (for downloading Traefik)
   - Container can reach backend services
   - Ports 80/443 available

4. ✅ **Traefik Configurations Generated**:
   ```bash
   python3 scripts/caddy-to-traefik.py \
     --caddyfile config/caddy-backup/Caddyfile.backup \
     --output-dir infrastructure/traefik/config
   ```

---

## Installation Steps

### Step 1: Download Traefik Binary

Connect to LXC 110 and download the latest Traefik v3 binary:

```bash
# SSH to Proxmox host
ssh root@192.168.1.137

# Enter container
pct exec 110 -- bash

# Download Traefik (check https://github.com/traefik/traefik/releases for latest)
cd /tmp
wget https://github.com/traefik/traefik/releases/download/v3.0.0/traefik_v3.0.0_linux_amd64.tar.gz

# Verify download (optional but recommended)
sha256sum traefik_v3.0.0_linux_amd64.tar.gz
# Compare with checksum from GitHub releases page

# Extract archive
tar xzf traefik_v3.0.0_linux_amd64.tar.gz

# Install binary to system path
mv traefik /usr/local/bin/
chmod +x /usr/local/bin/traefik

# Verify installation
traefik version
# Should output: Version: 3.0.0
```

**Alternative: Latest Version Auto-Download**:
```bash
# Get latest version automatically
TRAEFIK_VERSION=$(curl -s https://api.github.com/repos/traefik/traefik/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')

cd /tmp
wget "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz"
tar xzf "traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz"
mv traefik /usr/local/bin/
chmod +x /usr/local/bin/traefik
traefik version
```

### Step 2: Deploy Configuration Files

Copy generated Traefik configurations to the container:

**From your workstation**:
```bash
# Copy static configuration
scp infrastructure/traefik/config/traefik.yml \
  root@192.168.1.137:/tmp/traefik.yml

# Copy dynamic configurations
scp infrastructure/traefik/config/dynamic/routers.yml \
  root@192.168.1.137:/tmp/routers.yml

scp infrastructure/traefik/config/dynamic/services.yml \
  root@192.168.1.137:/tmp/services.yml

scp infrastructure/traefik/config/dynamic/middlewares.yml \
  root@192.168.1.137:/tmp/middlewares.yml
```

**On Proxmox host**:
```bash
# Move files into LXC container
pct push 110 /tmp/traefik.yml /etc/traefik/traefik.yml
pct push 110 /tmp/routers.yml /etc/traefik/dynamic/routers.yml
pct push 110 /tmp/services.yml /etc/traefik/dynamic/services.yml
pct push 110 /tmp/middlewares.yml /etc/traefik/dynamic/middlewares.yml

# Set proper permissions
pct exec 110 -- chmod 644 /etc/traefik/traefik.yml
pct exec 110 -- chmod 644 /etc/traefik/dynamic/*.yml
pct exec 110 -- chmod 600 /etc/traefik/acme.json
```

### Step 3: Configure Environment Variables

Create environment file with Cloudflare API credentials:

```bash
# Inside LXC 110
cat > /etc/traefik/environment << 'EOF'
# Cloudflare API Token for DNS-01 ACME challenge
CF_DNS_API_TOKEN=your_actual_cloudflare_api_token_here
EOF

# Secure the environment file
chmod 600 /etc/traefik/environment
```

**Get Cloudflare API Token**:
1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use template: **Edit Zone DNS**
4. Permissions:
   - Zone → DNS → Edit
   - Zone → Zone → Read
5. Zone Resources:
   - Include → Specific zone → lakehouse.wtf
6. Create token and copy to environment file

### Step 4: Install Systemd Service

Copy systemd service file to container:

**From your workstation**:
```bash
# Copy service file to Proxmox
scp infrastructure/traefik/systemd/traefik.service \
  root@192.168.1.137:/tmp/traefik.service
```

**On Proxmox host**:
```bash
# Install service file
pct push 110 /tmp/traefik.service /etc/systemd/system/traefik.service

# Set proper permissions
pct exec 110 -- chmod 644 /etc/systemd/system/traefik.service

# Reload systemd
pct exec 110 -- systemctl daemon-reload

# Enable service (start on boot)
pct exec 110 -- systemctl enable traefik

# Check service status (should be inactive/dead initially)
pct exec 110 -- systemctl status traefik
```

### Step 5: Validate Configuration

Before starting Traefik, validate the configuration:

```bash
# Inside LXC 110
# Test configuration syntax
traefik --configFile=/etc/traefik/traefik.yml --configTest

# Should output: Configuration loaded successfully
```

If configuration validation fails:
- Check YAML syntax (indentation, colons, quotes)
- Review file paths in traefik.yml
- Verify all referenced files exist

### Step 6: Start Traefik Service

Start the Traefik service:

```bash
# Start service
systemctl start traefik

# Check status
systemctl status traefik
# Should show: active (running)

# Check logs
tail -f /var/log/traefik/traefik.log

# Alternative: journalctl
journalctl -u traefik -f
```

**Expected log output**:
```
time="..." level=info msg="Configuration loaded from file: /etc/traefik/traefik.yml"
time="..." level=info msg="Traefik version 3.0.0 built on ..."
time="..." level=info msg="Starting provider *file.Provider"
time="..." level=info msg="Starting provider *acme.Provider"
time="..." level=info msg="Starting provider *traefik.Provider"
```

### Step 7: Verify Traefik is Running

Check that Traefik is listening on expected ports:

```bash
# Check listening ports
ss -tlnp | grep traefik
# Should show:
# 0.0.0.0:80   (web entrypoint)
# 0.0.0.0:443  (websecure entrypoint)
# 0.0.0.0:8080 (metrics/dashboard)

# Check process
ps aux | grep traefik

# Test metrics endpoint
curl -s http://localhost:8080/metrics | head -20
# Should return Prometheus metrics

# Test dashboard (from browser)
# http://192.168.1.110:8080/dashboard/
```

---

## Post-Installation Configuration

### Enable Dashboard Access

The dashboard is exposed on port 8080 by default. For security, it should only be accessible from internal network.

**Option 1: IP Whitelist** (already configured in static config):
```yaml
# In traefik.yml
api:
  dashboard: true
  insecure: false  # Requires authentication/IP whitelist
```

**Option 2: Basic Authentication** (add to traefik.yml):
```yaml
api:
  dashboard: true
  insecure: false

http:
  routers:
    dashboard:
      rule: Host(`traefik.internal.lakehouse.wtf`) && (PathPrefix(`/api`) || PathPrefix(`/dashboard`))
      service: api@internal
      middlewares:
        - auth
      entryPoints:
        - websecure
      tls:
        certResolver: cloudflare

  middlewares:
    auth:
      basicAuth:
        users:
          - "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/"  # admin:changeme
```

Generate password hash:
```bash
htpasswd -nb admin yourpassword
```

### Configure Log Rotation

Set up logrotate to prevent log files from filling disk:

```bash
# Create logrotate configuration
cat > /etc/logrotate.d/traefik << 'EOF'
/var/log/traefik/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0644 root root
    postrotate
        systemctl reload traefik > /dev/null 2>&1 || true
    endscript
}
EOF
```

Test logrotate:
```bash
logrotate -d /etc/logrotate.d/traefik
```

### Monitor Resource Usage

Check Traefik resource consumption:

```bash
# Memory usage
ps aux | grep traefik | awk '{print $6/1024 " MB"}'

# CPU usage
top -b -n 1 | grep traefik

# Systemd resource report
systemctl status traefik | grep -A 5 "Memory:"
```

---

## Service Management

### Common Operations

```bash
# Start service
systemctl start traefik

# Stop service
systemctl stop traefik

# Restart service
systemctl restart traefik

# Reload configuration (no downtime)
systemctl reload traefik

# View status
systemctl status traefik

# Enable on boot
systemctl enable traefik

# Disable on boot
systemctl disable traefik

# View logs (live)
journalctl -u traefik -f

# View logs (last 100 lines)
journalctl -u traefik -n 100

# View logs (since boot)
journalctl -u traefik -b

# View logs (last hour)
journalctl -u traefik --since "1 hour ago"
```

### Configuration Reload

Traefik watches the dynamic configuration directory automatically. Changes to files in `/etc/traefik/dynamic/` are picked up without restart.

**Static configuration changes** (traefik.yml) require restart:
```bash
# Edit static configuration
vim /etc/traefik/traefik.yml

# Validate configuration
traefik --configFile=/etc/traefik/traefik.yml --configTest

# Restart service
systemctl restart traefik
```

**Dynamic configuration changes** (routers, services, middlewares) are auto-reloaded:
```bash
# Edit dynamic configuration
vim /etc/traefik/dynamic/routers.yml

# Watch logs to confirm reload
journalctl -u traefik -f
# Should see: "Configuration reloaded"
```

### Certificate Management

Let's Encrypt certificates are stored in `/etc/traefik/acme.json`:

```bash
# View certificate status
cat /etc/traefik/acme.json | jq '.cloudflare.Certificates'

# Check certificate expiration
openssl s_client -connect homeassistant.internal.lakehouse.wtf:443 -servername homeassistant.internal.lakehouse.wtf < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Force certificate renewal (if needed)
# Delete acme.json and restart Traefik
rm /etc/traefik/acme.json
touch /etc/traefik/acme.json
chmod 600 /etc/traefik/acme.json
systemctl restart traefik
```

---

## Troubleshooting

### Service Won't Start

**Check systemd status**:
```bash
systemctl status traefik -l
```

**Common issues**:

1. **Binary not found**:
   ```bash
   # Verify binary exists
   ls -la /usr/local/bin/traefik
   # If missing, reinstall
   ```

2. **Configuration error**:
   ```bash
   # Test configuration
   traefik --configFile=/etc/traefik/traefik.yml --configTest
   ```

3. **Permission denied**:
   ```bash
   # Check file permissions
   ls -la /etc/traefik/traefik.yml
   ls -la /etc/traefik/acme.json  # Must be 600
   ls -la /var/log/traefik/
   ```

4. **Port already in use**:
   ```bash
   # Check what's using port 80/443
   ss -tlnp | grep ':80\|:443'
   # If Caddy is still running, that's expected during migration
   ```

### Configuration Not Loading

**Check file paths**:
```bash
# Verify all files exist
ls -la /etc/traefik/traefik.yml
ls -la /etc/traefik/dynamic/*.yml

# Check for YAML syntax errors
yamllint /etc/traefik/traefik.yml
# Or use: https://www.yamllint.com/
```

**Watch Traefik logs**:
```bash
journalctl -u traefik -f

# Look for errors like:
# "error loading configuration"
# "file not found"
# "invalid syntax"
```

### Certificates Not Generating

**Check Cloudflare API token**:
```bash
# Verify environment file exists and has token
cat /etc/traefik/environment

# Test Cloudflare API access
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"

# Should return: {"result":{"status":"active"}}
```

**Check ACME logs**:
```bash
journalctl -u traefik | grep -i acme

# Common issues:
# - Invalid API token
# - DNS propagation timeout
# - Rate limit reached (5 failures per hour)
```

**Force certificate regeneration**:
```bash
# Stop Traefik
systemctl stop traefik

# Backup and remove acme.json
cp /etc/traefik/acme.json /etc/traefik/acme.json.backup
rm /etc/traefik/acme.json
touch /etc/traefik/acme.json
chmod 600 /etc/traefik/acme.json

# Start Traefik and watch logs
systemctl start traefik
journalctl -u traefik -f
```

### High Memory/CPU Usage

**Check resource consumption**:
```bash
# Memory
ps -o pid,user,%mem,command ax | grep traefik

# CPU
top -b -n 1 | grep traefik

# Systemd cgroup stats
systemctl status traefik
```

**Reduce logging verbosity** (in traefik.yml):
```yaml
log:
  level: INFO  # Change from DEBUG to INFO or WARN
```

**Optimize dynamic configuration**:
- Reduce number of health checks
- Increase health check intervals
- Disable unused entrypoints

---

## Updating Traefik

### Update Binary

```bash
# Check current version
traefik version

# Download new version
cd /tmp
TRAEFIK_VERSION="3.1.0"  # Update to desired version
wget "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz"

# Verify checksum (from GitHub releases page)
sha256sum "traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz"

# Extract and install
tar xzf "traefik_v${TRAEFIK_VERSION}_linux_amd64.tar.gz"

# Stop service
systemctl stop traefik

# Backup old binary
cp /usr/local/bin/traefik /usr/local/bin/traefik.backup

# Install new binary
mv traefik /usr/local/bin/
chmod +x /usr/local/bin/traefik

# Verify new version
traefik version

# Test configuration with new version
traefik --configFile=/etc/traefik/traefik.yml --configTest

# Start service
systemctl start traefik

# Verify service is running
systemctl status traefik
journalctl -u traefik -f
```

**Rollback if issues occur**:
```bash
systemctl stop traefik
mv /usr/local/bin/traefik.backup /usr/local/bin/traefik
systemctl start traefik
```

---

## Migration from Docker (If Needed)

If you previously installed Traefik with Docker and need to migrate to native:

```bash
# Stop Docker container
docker stop traefik
docker rm traefik

# Optionally remove Docker entirely
apt remove -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
apt autoremove -y

# Follow native installation steps above
# Configurations in /etc/traefik/ can be reused as-is
```

---

## Performance Comparison

**Native vs Docker Resource Usage**:

| Metric | Native | Docker | Savings |
|--------|--------|--------|---------|
| **Base Memory** | ~50-80 MB | ~150-200 MB | 70-120 MB |
| **Disk Space** | ~50 MB | ~450 MB | 400 MB |
| **Startup Time** | ~1-2 sec | ~3-5 sec | 2-3 sec |
| **Process Overhead** | 1 process | 3+ processes | Simpler |

**LXC Container Disk Usage**:
- Before Docker removal: ~1,330 MB
- After Docker removal: ~938 MB
- **Space freed: 392 MB**

---

## Security Considerations

### File Permissions

```bash
# Traefik binary (world-readable, executable)
-rwxr-xr-x /usr/local/bin/traefik

# Configuration files (readable by root only)
-rw-r--r-- /etc/traefik/traefik.yml
-rw-r--r-- /etc/traefik/dynamic/*.yml

# ACME certificate storage (root only, no group/other access)
-rw------- /etc/traefik/acme.json

# Environment file (credentials - root only)
-rw------- /etc/traefik/environment

# Log directory (root only)
drwxr-xr-x /var/log/traefik/
```

### Systemd Security Features

The systemd service includes security hardening:
```ini
NoNewPrivileges=true      # Prevent privilege escalation
PrivateTmp=true           # Isolated /tmp directory
ProtectSystem=strict      # Read-only root filesystem
ProtectHome=true          # Hide /home directories
ReadWritePaths=...        # Only specific paths writable
```

### Network Security

- Dashboard exposed only on 192.168.1.110:8080 (not public)
- Metrics endpoint requires internal network access
- All TLS certificates managed automatically
- HTTP → HTTPS redirect enforced

---

## Backup and Restore

### Backup Configuration

```bash
# Create backup archive
tar -czf /root/traefik-backup-$(date +%Y%m%d).tar.gz \
  /etc/traefik/ \
  /etc/systemd/system/traefik.service \
  /usr/local/bin/traefik

# Backup to external storage
scp /root/traefik-backup-*.tar.gz user@backup-server:/backups/
```

### Restore Configuration

```bash
# Extract backup
cd /
tar -xzf /root/traefik-backup-20251023.tar.gz

# Reload systemd
systemctl daemon-reload

# Start service
systemctl start traefik
```

### LXC Container Snapshot

```bash
# On Proxmox host
# Create snapshot before major changes
pct snapshot 110 before-traefik-update

# List snapshots
pct listsnapshot 110

# Restore snapshot if needed
pct rollback 110 before-traefik-update
```

---

## References

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Traefik GitHub Releases](https://github.com/traefik/traefik/releases)
- [Systemd Service Management](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Cloudflare API Documentation](https://developers.cloudflare.com/api/)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Installation Method**: Native binary in LXC
**Status**: ✅ Ready for Deployment

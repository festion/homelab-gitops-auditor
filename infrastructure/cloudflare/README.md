# Cloudflare Tunnel Configuration

## Overview

This document describes the Cloudflare Tunnel setup for the homelab, which enables secure remote access via Cloudflare Zero Trust (formerly Cloudflare Access and WARP).

## Current Architecture

```
Internet (Cloudflare Edge)
    ↓
Cloudflare Tunnel (927a334b-f404-44d6-82b8-95366738efe7)
    ↓
LXC 102 (cloudflared) @ 192.168.1.102
    ↓
Traefik (LXC 110) @ 192.168.1.110:80
    ↓
Internal Services (*.internal.lakehouse.wtf)
```

## Deployment Details

### Cloudflared Tunnel (LXC 102)

**Container:** LXC 102 on Proxmox host 192.168.1.137
**Service:** cloudflared.service (systemd)
**Tunnel ID:** 927a334b-f404-44d6-82b8-95366738efe7
**Account:** 32a26bf8c9151367d438168652ec0fde

#### Configuration

Location: `/etc/cloudflared/config.yml`

```yaml
tunnel: 927a334b-f404-44d6-82b8-95366738efe7
credentials-file: /root/.cloudflared/927a334b-f404-44d6-82b8-95366738efe7.json

ingress:
  # Route all *.lakehouse.wtf traffic to Traefik
  - hostname: "*.lakehouse.wtf"
    service: http://192.168.1.110:80
  # Catch-all rule (required)
  - service: http_status:404
```

**Features Enabled:**
- WARP routing enabled (for Cloudflare Zero Trust client access)
- Routes all `*.lakehouse.wtf` domains to Traefik
- 4 active tunnel connections to Cloudflare edge (DFW region)

#### Service Status

```bash
# Check tunnel status
ssh root@192.168.1.137 "pct exec 102 -- systemctl status cloudflared"

# View tunnel logs
ssh root@192.168.1.137 "pct exec 102 -- journalctl -u cloudflared -f"

# Restart tunnel
ssh root@192.168.1.137 "pct exec 102 -- systemctl restart cloudflared"
```

### Traefik Integration (LXC 110)

**Container:** LXC 110 on Proxmox host 192.168.1.137
**Service:** traefik.service (Traefik v3)
**Address:** 192.168.1.110:80 (HTTP), 192.168.1.110:443 (HTTPS)

#### Cloudflare-Specific Configuration

**Plugin:** `traefik-real-ip` (for proper client IP detection)

Location: `/etc/traefik/traefik.yml`

```yaml
experimental:
  plugins:
    traefik-real-ip:
      moduleName: github.com/soulteary/traefik-real-ip
      version: v1.2.0
```

**Middleware:** `cloudflare-real-ip`

Location: `/etc/traefik/dynamic/middlewares.yml`

```yaml
http:
  middlewares:
    cloudflare-real-ip:
      plugin:
        traefik-real-ip:
          excludednets:
            - 192.168.1.0/24
          cloudflare: true
```

This middleware:
- Detects real client IPs from Cloudflare headers
- Excludes internal network (192.168.1.0/24) from Cloudflare processing
- Properly handles `CF-Connecting-IP` and `X-Forwarded-For` headers

## Current Status

### Internal Services Only

Currently, **no public services are exposed**. All services use:
- Domain pattern: `*.internal.lakehouse.wtf`
- Internal access only (192.168.1.0/24 whitelist)
- TLS certificates via Cloudflare DNS challenge

### WARP Client Access

When you're not on the local network, you can access internal services using:
1. **Cloudflare WARP client** (Zero Trust mode)
2. Connect to your Cloudflare account
3. Access services at `*.internal.lakehouse.wtf` as if you were local

## Future: Adding Public Services

To expose services publicly through the Cloudflare Tunnel:

### Step 1: Update Cloudflared Configuration

Edit `/etc/cloudflared/config.yml` in LXC 102:

```yaml
tunnel: 927a334b-f404-44d6-82b8-95366738efe7
credentials-file: /root/.cloudflared/927a334b-f404-44d6-82b8-95366738efe7.json

ingress:
  # Public service example
  - hostname: "public-app.lakehouse.wtf"
    service: http://192.168.1.110:80
  
  # All other *.lakehouse.wtf traffic to Traefik
  - hostname: "*.lakehouse.wtf"
    service: http://192.168.1.110:80
  
  # Catch-all rule (required)
  - service: http_status:404
```

**Note:** More specific rules must come **before** wildcard rules.

Restart cloudflared:
```bash
ssh root@192.168.1.137 "pct exec 102 -- systemctl restart cloudflared"
```

### Step 2: Create Traefik Router

Create a new router in `/etc/traefik/dynamic/routers.yml` (LXC 110):

```yaml
http:
  routers:
    public-app-router:
      rule: Host(`public-app.lakehouse.wtf`)
      service: public-app-service
      entryPoints:
        - websecure
      middlewares:
        - cloudflare-real-ip  # Important for proper IP detection
        - secure-headers
      tls:
        certResolver: cloudflare
        domains:
          - main: "*.lakehouse.wtf"
```

### Step 3: Define Service Backend

In `/etc/traefik/dynamic/services.yml` (LXC 110):

```yaml
http:
  services:
    public-app-service:
      loadBalancer:
        servers:
          - url: "http://BACKEND_IP:PORT"
```

### Step 4: Configure Cloudflare DNS

1. Go to Cloudflare Dashboard → DNS
2. Add CNAME record:
   - Name: `public-app` (or `*` for wildcard)
   - Target: `927a334b-f404-44d6-82b8-95366738efe7.cfargotunnel.com`
   - Proxy status: Proxied (orange cloud)

### Step 5: (Optional) Add Zero Trust Policies

For authenticated access, configure in Cloudflare Zero Trust dashboard:

1. Access → Applications → Add an application
2. Select "Self-hosted"
3. Application domain: `public-app.lakehouse.wtf`
4. Configure authentication policies:
   - Email domain restrictions
   - Country restrictions
   - Device posture checks
   - etc.

## Security Considerations

### Current Setup (Internal Only)

- All services protected by `internal-whitelist` middleware (192.168.1.0/24)
- SSL/TLS certificates from Cloudflare DNS challenge
- No public exposure

### For Public Services

When exposing services publicly:

1. **Always use `cloudflare-real-ip` middleware** to get actual client IPs
2. **Add rate limiting** middleware to prevent abuse
3. **Consider Zero Trust policies** for authentication
4. **Enable HTTPS only** (automatic via Traefik config)
5. **Review security headers** in `secure-headers` middleware
6. **Monitor access logs** in Traefik

### Recommended Middlewares for Public Services

```yaml
http:
  middlewares:
    public-rate-limit:
      rateLimit:
        average: 100
        burst: 50
        period: 1m
    
    public-auth:
      basicAuth:
        users:
          - "user:$apr1$..."  # Use htpasswd to generate
```

Then apply to router:
```yaml
middlewares:
  - cloudflare-real-ip
  - public-rate-limit
  - secure-headers
```

## Troubleshooting

### Check Tunnel Status

```bash
# Tunnel service status
ssh root@192.168.1.137 "pct exec 102 -- systemctl status cloudflared"

# View active connections
ssh root@192.168.1.137 "pct exec 102 -- journalctl -u cloudflared | grep Registered"
```

Expected: 4 registered tunnel connections

### Check Traefik Configuration

```bash
# Test configuration
ssh root@192.168.1.137 "pct exec 110 -- traefik healthcheck"

# View router status
curl -s http://192.168.1.110:8080/api/http/routers | jq
```

### Common Issues

**Issue:** Service not accessible through tunnel
- Verify DNS CNAME points to tunnel domain
- Check ingress rules order in cloudflared config
- Ensure Traefik router matches hostname exactly

**Issue:** Client IP shows as Cloudflare IP
- Add `cloudflare-real-ip` middleware to router
- Verify plugin is installed in Traefik

**Issue:** Certificate errors
- Check Cloudflare DNS API token in Traefik
- Verify DNS challenge is working: `ls -la /etc/traefik/acme.json`

## Maintenance

### Update Cloudflared

```bash
ssh root@192.168.1.137 "pct exec 102 -- bash -c '
  wget -O /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb
  systemctl restart cloudflared
  rm /tmp/cloudflared.deb
'"
```

### Rotate Tunnel Credentials

1. Create new tunnel in Cloudflare dashboard
2. Update config.yml with new tunnel ID and credentials
3. Update DNS records
4. Restart cloudflared service
5. Delete old tunnel after verification

## References

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
- [Traefik Real IP Plugin](https://github.com/soulteary/traefik-real-ip)
- Homelab Documentation: `docs/traefik/README.md`

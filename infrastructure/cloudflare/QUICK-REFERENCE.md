# Cloudflare Tunnel Quick Reference

## Current Setup

**Cloudflared:** LXC 102 @ 192.168.1.102  
**Traefik:** LXC 110 @ 192.168.1.110  
**Tunnel ID:** `927a334b-f404-44d6-82b8-95366738efe7`  
**Domain:** `*.lakehouse.wtf`  

## Quick Commands

### Check Status
```bash
# Cloudflared status
ssh root@192.168.1.137 "pct exec 102 -- systemctl status cloudflared"

# Traefik status  
ssh root@192.168.1.137 "pct exec 110 -- systemctl status traefik"
```

### View Logs
```bash
# Cloudflared logs
ssh root@192.168.1.137 "pct exec 102 -- journalctl -u cloudflared -f"

# Traefik access logs
ssh root@192.168.1.137 "pct exec 110 -- tail -f /var/log/traefik/access.log"

# Traefik error logs
ssh root@192.168.1.137 "pct exec 110 -- tail -f /var/log/traefik/traefik.log"
```

### Restart Services
```bash
# Restart cloudflared (after config changes)
ssh root@192.168.1.137 "pct exec 102 -- systemctl restart cloudflared"

# Reload Traefik (usually not needed - file provider auto-reloads)
ssh root@192.168.1.137 "pct exec 110 -- systemctl reload traefik"
```

### Edit Configurations
```bash
# Edit cloudflared config
ssh root@192.168.1.137 "pct exec 102 -- nano /etc/cloudflared/config.yml"

# Edit Traefik routers
ssh root@192.168.1.137 "pct exec 110 -- nano /etc/traefik/dynamic/routers.yml"

# Edit Traefik services
ssh root@192.168.1.137 "pct exec 110 -- nano /etc/traefik/dynamic/services.yml"

# Edit Traefik middlewares
ssh root@192.168.1.137 "pct exec 110 -- nano /etc/traefik/dynamic/middlewares.yml"
```

## Adding a Public Service (5 Steps)

### 1. Update Cloudflared Config
```bash
ssh root@192.168.1.137 "pct exec 102 -- nano /etc/cloudflared/config.yml"
```

Add **before** the wildcard rule:
```yaml
- hostname: "myapp.lakehouse.wtf"
  service: http://192.168.1.110:80
```

Restart:
```bash
ssh root@192.168.1.137 "pct exec 102 -- systemctl restart cloudflared"
```

### 2. Add Traefik Router
```bash
ssh root@192.168.1.137 "pct exec 110 -- nano /etc/traefik/dynamic/routers.yml"
```

Add to `http.routers:`:
```yaml
myapp-router:
  rule: Host(`myapp.lakehouse.wtf`)
  service: myapp-service
  entryPoints:
    - websecure
  middlewares:
    - cloudflare-real-ip  # REQUIRED
    - secure-headers
  tls:
    certResolver: cloudflare
```

### 3. Add Traefik Service
```bash
ssh root@192.168.1.137 "pct exec 110 -- nano /etc/traefik/dynamic/services.yml"
```

Add to `http.services:`:
```yaml
myapp-service:
  loadBalancer:
    servers:
      - url: "http://BACKEND_IP:PORT"
```

### 4. Add DNS Record

Go to Cloudflare Dashboard → DNS → Add Record:
- **Type:** CNAME
- **Name:** myapp
- **Target:** `927a334b-f404-44d6-82b8-95366738efe7.cfargotunnel.com`
- **Proxy:** ON (orange cloud)

### 5. Test

```bash
# From external network
curl -I https://myapp.lakehouse.wtf

# Check Traefik logs
ssh root@192.168.1.137 "pct exec 110 -- grep myapp /var/log/traefik/access.log"
```

## Remote Access (WARP Client)

### For Accessing Internal Services When Away

1. **Install WARP Client:**
   - [Desktop/Mobile Downloads](https://one.one.one.one/)
   
2. **Configure for Zero Trust:**
   - Open WARP client
   - Settings → Preferences
   - Switch to "Zero Trust" mode
   - Enter your Cloudflare team name
   - Login with your Cloudflare account

3. **Connect:**
   - Turn on WARP
   - Access `https://homeassistant.internal.lakehouse.wtf` as if local

## Important File Locations

### LXC 102 (Cloudflared)
- Config: `/etc/cloudflared/config.yml`
- Credentials: `/root/.cloudflared/927a334b-f404-44d6-82b8-95366738efe7.json`
- Service: `/etc/systemd/system/cloudflared.service`

### LXC 110 (Traefik)
- Main config: `/etc/traefik/traefik.yml`
- Routers: `/etc/traefik/dynamic/routers.yml`
- Services: `/etc/traefik/dynamic/services.yml`
- Middlewares: `/etc/traefik/dynamic/middlewares.yml`
- Certificates: `/etc/traefik/acme.json`
- Access logs: `/var/log/traefik/access.log`
- Error logs: `/var/log/traefik/traefik.log`

## Troubleshooting

### Service Not Accessible

1. **Check DNS:**
   ```bash
   dig myapp.lakehouse.wtf
   ```
   Should show Cloudflare IPs

2. **Check Cloudflared:**
   ```bash
   ssh root@192.168.1.137 "pct exec 102 -- journalctl -u cloudflared -n 50 | grep myapp"
   ```

3. **Check Traefik:**
   ```bash
   ssh root@192.168.1.137 "pct exec 110 -- grep myapp /var/log/traefik/traefik.log"
   ```

4. **Test Backend:**
   ```bash
   ssh root@192.168.1.137 "pct exec 110 -- curl http://BACKEND_IP:PORT"
   ```

### Wrong Client IP in Logs

Add `cloudflare-real-ip` middleware to router:
```yaml
middlewares:
  - cloudflare-real-ip
  - secure-headers
```

### 502 Bad Gateway

1. Check backend is running
2. Verify backend URL in services.yml
3. Test connectivity from Traefik to backend

## Security Checklist

When going public with a service:

- [ ] `cloudflare-real-ip` middleware applied
- [ ] `secure-headers` middleware applied
- [ ] Rate limiting configured (if needed)
- [ ] Backend service hardened
- [ ] Zero Trust policy configured (if sensitive)
- [ ] Access logs monitored
- [ ] Cloudflare WAF enabled (if needed)

## Documentation

- **Architecture & Setup:** `infrastructure/cloudflare/README.md`
- **Template with Examples:** `infrastructure/cloudflare/public-service-template.yml`
- **Validation Report:** `infrastructure/cloudflare/SETUP-VALIDATION.md`
- **This Guide:** `infrastructure/cloudflare/QUICK-REFERENCE.md`

## Support Links

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Traefik Real IP Plugin](https://github.com/soulteary/traefik-real-ip)

# Cloudflare WARP + Tunnel Setup - Complete Configuration

## Status: ✅ WORKING

**Date Completed:** 2025-10-24

## Architecture Overview

```
Mobile Device (WARP) → Cloudflare Zero Trust → Tunnel (LXC 102) → Traefik (LXC 110) → Internal Services
```

## Configuration Details

### Cloudflare DNS
- **Domain:** lakehouse.wtf
- **CNAME:** `*.internal` → `927a334b-f404-44d6-82b8-95366738efe7.cfargotunnel.com`
- **Proxy Status:** Proxied (orange cloud)
- **SSL/TLS Mode:** Flexible

### Cloudflare Tunnel (LXC 102 @ 192.168.1.100)
- **Tunnel ID:** 927a334b-f404-44d6-82b8-95366738efe7
- **Config:** `/etc/cloudflared/config.yml`
```yaml
tunnel: 927a334b-f404-44d6-82b8-95366738efe7
credentials-file: /root/.cloudflared/927a334b-f404-44d6-82b8-95366738efe7.json

ingress:
  - hostname: "*.lakehouse.wtf"
    service: http://192.168.1.110:80
  - service: http_status:404
```
- **WARP Routing:** Enabled
- **CIDR Route:** 192.168.1.0/24 (Private Network routing)

### Cloudflare Zero Trust
- **Organization:** lakehousehomelab.cloudflareaccess.com
- **WARP Mode:** Zero Trust (enrolled)
- **Split Tunnels:** Exclude mode (routes all traffic except exclusions)
- **Gateway HTTP Policy:** "Do Not Inspect" for `*.internal.lakehouse.wtf`

### Traefik (LXC 110 @ 192.168.1.110)
- **Entry Points:** HTTP (80), HTTPS (443)
- **Cert Resolver:** Cloudflare DNS challenge
- **Dynamic Config:** `/etc/traefik/dynamic/routers.yml`
- **All internal services:** `*.internal.lakehouse.wtf`

## WARP Client Setup (Mobile)

### Initial Enrollment
1. Install Cloudflare WARP app
2. Use enrollment token from Zero Trust dashboard
3. Verify enrollment: Should show "lakehousehomelab" organization

### Accessing Internal Services
From anywhere with WARP connected:
- https://adguard.internal.lakehouse.wtf
- https://birdnet.internal.lakehouse.wtf
- https://homeassistant.internal.lakehouse.wtf
- https://wiki.internal.lakehouse.wtf
- https://proxmox.internal.lakehouse.wtf
- All other configured internal services

## Key Troubleshooting Points

### Issue: WARP not routing traffic
**Solution:** Ensure WARP is enrolled in Zero Trust (shows org name, not just "Connected")

### Issue: Certificate errors on internal domains
**Solution:** Gateway HTTP policy "Do Not Inspect" for `*.internal.lakehouse.wtf`

### Issue: Timeout accessing services
**Solution:** Verify CIDR route (192.168.1.0/24) is configured in tunnel

### Issue: DNS_PROBE_FINISHED_NXDOMAIN
**Solution:** Verify CNAME `*.internal` → tunnel domain exists and is proxied

## Maintenance Commands

### Check Tunnel Status
```bash
ssh root@192.168.1.100 "systemctl status cloudflared"
ssh root@192.168.1.100 "journalctl -u cloudflared -f"
```

### Restart Tunnel
```bash
ssh root@192.168.1.100 "systemctl restart cloudflared"
```

### Check Traefik Status
```bash
ssh root@192.168.1.137 "pct exec 110 -- systemctl status traefik"
```

### View Enrolled Devices
Cloudflare Zero Trust → My Team → Devices

## SSH Access (Bonus Configuration)

**LXC 102 (Cloudflared):**
- IP: 192.168.1.100
- SSH: `ssh root@192.168.1.100`
- Auth: SSH key (id_ed25519)
- PubkeyAuthentication: Enabled

## Security Notes

- Internal services are NOT publicly accessible
- Access requires WARP client enrolled in Zero Trust
- TLS inspection disabled for internal domains (privacy)
- All traffic encrypted: Phone → Cloudflare → Tunnel → Traefik
- No inbound ports opened on firewall

## Future Enhancements

- Add Cloudflare Access policies for specific services
- Implement device posture checks
- Configure Gateway DNS filtering
- Add email domain restrictions for enrollment
- Set up Gateway audit logs

## References

- Tunnel Config: `infrastructure/cloudflare/README.md`
- Traefik Config: `infrastructure/traefik/config/`
- Zero Trust Dashboard: https://one.dash.cloudflare.com/

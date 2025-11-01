# Traefik LXC Container Setup

**Container ID**: 110
**Hostname**: traefik
**IP Address**: 192.168.1.110/24
**Gateway**: 192.168.1.1
**Proxmox Host**: proxmox (192.168.1.137)
**Created**: 2025-10-23
**Deployment Method**: Native binary (systemd-managed)
**Status**: ✅ Ready for Traefik Deployment

**Architecture Note**: Originally configured with Docker, but simplified to native binary installation for lower resource overhead and consistency with Caddy deployment pattern. Docker was removed to free ~400 MB disk space.

---

## Container Specifications

### Hardware Resources

| Resource | Allocated | Notes |
|----------|-----------|-------|
| **CPU Cores** | 2 | Sufficient for reverse proxy workload |
| **Memory** | 2048 MB (2 GB) | 4x more than Caddy (512 MB) for Docker overhead |
| **Swap** | 1024 MB (1 GB) | Emergency buffer |
| **Disk** | 8 GB | LVM thin provisioned on local-lvm |
| **Network** | vmbr0 | Bridged to main network |

### Container Configuration

```
arch: amd64
cores: 2
features: nesting=1             # Required for Docker in LXC
hostname: traefik
memory: 2048
net0: name=eth0,bridge=vmbr0,gw=192.168.1.1,ip=192.168.1.110/24,type=veth
onboot: 1                       # Auto-start on Proxmox boot
ostype: debian
rootfs: local-lvm:vm-110-disk-1,size=8G
swap: 1024
unprivileged: 1                 # Security: Unprivileged container
```

### Network Configuration

- **Interface**: eth0
- **IP**: 192.168.1.110/24 (static)
- **Gateway**: 192.168.1.1
- **MAC**: BC:24:11:FC:E3:E4
- **DNS**: Inherited from Proxmox host

---

## Software Installation

### Operating System

- **Distribution**: Debian GNU/Linux 12 (bookworm)
- **Template**: debian-12-standard_12.7-1_amd64.tar.zst
- **Architecture**: amd64
- **Init System**: systemd

### Installed Packages

**Prerequisites**:
- curl (7.88.1-10+deb12u14)
- ca-certificates (20230311+deb12u1)
- wget (for downloading Traefik binary)

**Traefik Installation**:
- Traefik v3.0+ (native binary)
- Installed to: `/usr/local/bin/traefik`
- Service managed by: systemd

**Note**: Docker was initially considered but removed in favor of native installation for simplicity and lower resource overhead.

---

## Directory Structure

```
/etc/traefik/
├── traefik.yml              # Static configuration (to be created)
├── dynamic/                 # Dynamic configuration directory
│   ├── routers.yml         # HTTP routers (to be created)
│   ├── services.yml        # Backend services (to be created)
│   └── middlewares.yml     # Middleware chains (to be created)
├── certs/                   # Certificate storage directory
└── acme.json               # Let's Encrypt certificate storage (mode 600)

/var/log/traefik/            # Log files directory
├── traefik.log             # Main application log (to be created)
└── access.log              # HTTP access log (to be created)

/var/lib/traefik/            # Persistent data directory
```

### Directory Permissions

```bash
/etc/traefik/                # drwxr-xr-x root:root
/etc/traefik/dynamic/        # drwxr-xr-x root:root
/etc/traefik/certs/          # drwxr-xr-x root:root
/etc/traefik/acme.json       # -rw------- root:root (600)
/var/log/traefik/            # drwxr-xr-x root:root
/var/lib/traefik/            # drwxr-xr-x root:root
```

---

## Access and Authentication

### Root Access

- **Username**: root
- **Password**: Set (use password manager)
- **SSH**: Available via Proxmox `pct exec` or direct SSH to 192.168.1.110

### Direct SSH Access

```bash
# From Proxmox host
pct exec 110 -- bash

# Direct SSH (once SSH keys configured)
ssh root@192.168.1.110
```

---

## Resource Monitoring

### Container Status

```bash
# From Proxmox host
pct status 110              # Check if running
pct config 110              # View configuration
pct df 110                  # Check disk usage
```

### Inside Container

```bash
# CPU and memory
free -h
top

# Disk usage
df -h

# Traefik status
systemctl status traefik

# Traefik process
ps aux | grep traefik

# Logs
tail -f /var/log/traefik/traefik.log
tail -f /var/log/traefik/access.log
journalctl -u traefik -f
```

---

## Maintenance

### Start/Stop/Restart

```bash
# From Proxmox host (192.168.1.137)
pct start 110
pct stop 110
pct restart 110
```

### Backup

```bash
# Create snapshot
pct snapshot 110 before-traefik-deployment

# Create backup
vzdump 110 --mode stop --storage local
```

### Updates

```bash
# Inside container
apt update
apt upgrade -y

# Docker updates
apt upgrade docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

---

## Security Considerations

### Container Isolation

- ✅ **Unprivileged**: Container runs as unprivileged (UID/GID mapping)
- ✅ **Nesting Enabled**: Required for Docker, but increases attack surface
- ✅ **Network Isolation**: Container on same network as other services
- ⚠️ **Auto-start**: Container starts automatically on Proxmox boot

### Best Practices

1. **Keep Separate**: Don't run other services in this container
2. **Regular Updates**: Keep Debian and Docker updated
3. **Log Monitoring**: Monitor /var/log/traefik/ for anomalies
4. **Firewall Rules**: Limit access to ports 80/443 only
5. **Backup Schedule**: Regular snapshots before changes

---

## Deployment Readiness Checklist

### Pre-Deployment

- [x] Container created with ID 110
- [x] Static IP configured (192.168.1.110)
- [x] Directory structure created
- [x] ACME storage file created and secured
- [ ] Traefik binary installed
- [ ] Traefik configuration files deployed
- [ ] Systemd service file installed
- [ ] Environment variables configured
- [ ] Cloudflare API token set

### Post-Deployment

- [ ] Traefik service running (systemctl status traefik)
- [ ] Dashboard accessible (http://192.168.1.110:8080/dashboard/)
- [ ] Prometheus metrics accessible (http://192.168.1.110:8080/metrics)
- [ ] Logs being written (/var/log/traefik/)
- [ ] ACME certificate generation successful
- [ ] Test service routing working

---

## Troubleshooting

### Common Issues

**Container won't start**:
```bash
pct start 110 --verbose
journalctl -u pve-container@110
```

**Traefik service not working**:
```bash
pct exec 110 -- systemctl status traefik
pct exec 110 -- systemctl restart traefik
pct exec 110 -- journalctl -u traefik -n 50
```

**Network connectivity issues**:
```bash
pct exec 110 -- ping -c 3 8.8.8.8
pct exec 110 -- ip addr show
pct exec 110 -- ip route show
```

**Disk space issues**:
```bash
pct df 110
pct exec 110 -- df -h
pct exec 110 -- apt clean
pct exec 110 -- journalctl --vacuum-time=7d
```

---

## Next Steps

1. **Generate Traefik Configurations**:
   ```bash
   cd /home/dev/workspace/homelab-gitops-auditor
   python3 scripts/caddy-to-traefik.py \
     --caddyfile config/caddy-backup/Caddyfile.backup \
     --output-dir infrastructure/traefik/config
   ```

2. **Install Traefik Binary**:
   ```bash
   # Download and install Traefik v3.0+
   # See docs/traefik/NATIVE-INSTALLATION.md for detailed steps
   ```

3. **Deploy Configurations to Container**:
   ```bash
   # Copy generated configs to container
   # See Phase 2 deployment guide
   ```

4. **Set Up Monitoring**:
   - Configure Prometheus scraping
   - Deploy Grafana dashboard
   - Set up log aggregation

---

## References

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Docker in LXC](https://pve.proxmox.com/wiki/Linux_Container#_nested_docker)
- [Proxmox Container Management](https://pve.proxmox.com/wiki/Linux_Container)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Maintainer**: Migration Team

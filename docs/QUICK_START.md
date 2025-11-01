# GitOps Auditor - Quick Start Guide

## One-Line Install/Upgrade (Proxmox VE)

### Prerequisites
- Proxmox VE 7.0 or later
- Root access to Proxmox host
- Internet connectivity

### Installation or Upgrade

1. **SSH into your Proxmox host**
2. **Run the one-line installer:**
   ```bash
   bash -c "$(wget -qLO - https://raw.githubusercontent.com/festion/homelab-gitops-auditor/main/install.sh)"
   ```

3. **The script will automatically:**
   - **For new users**: Guide you through fresh installation
   - **For existing users**: Detect installation and offer upgrade option

4. **Follow the interactive prompts:**
   - Choose Default (recommended) or Advanced installation
   - Configure container resources if needed
   - Set your GitHub username and Git repository path

5. **Access your dashboard:**
   - The installer will display the final URL
   - Example: `http://192.168.1.123`

### Upgrade Process

If you have an existing installation, the script will:
- ✅ **Detect existing container** with GitOps Auditor
- ✅ **Show current and latest versions**
- ✅ **Backup your configuration** automatically
- ✅ **Update code and dependencies** safely
- ✅ **Restore your settings** after upgrade
- ✅ **Restart services** automatically

### What Gets Installed

The one-line installer creates:
- **LXC Container** (Ubuntu 22.04) with GitOps Auditor
- **Nginx Web Server** serving the dashboard
- **Node.js API Server** for repository operations  
- **Systemd Services** for automatic startup
- **Daily Cron Job** for automated audits

### Default Configuration

| Setting | Default Value |
|---------|---------------|
| Container ID | 123 |
| Hostname | gitops-audit |
| Memory | 2048 MB |
| CPU Cores | 2 |
| Disk | 8 GB |
| Network | DHCP |

### Post-Installation

1. **Configure Repository Settings:**
   ```bash
   pct exec 123 -- /opt/gitops/scripts/config/config-manager.sh interactive
   ```

2. **Run First Audit:**
   ```bash
   pct exec 123 -- /opt/gitops/scripts/comprehensive_audit.sh
   ```

3. **View Dashboard:**
   - Open browser to `http://CONTAINER_IP`
   - Review repository status and mismatches

### Container Management

```bash
# Start container
pct start 123

# Stop container  
pct stop 123

# Enter container shell
pct enter 123

# View container status
pct status 123

# Restart services
pct exec 123 -- systemctl restart gitops-audit-api nginx
```

### Troubleshooting

#### Container Won't Start
```bash
# Check container status
pct status 123

# View container logs
pct exec 123 -- journalctl -u gitops-audit-api -f
```

#### Dashboard Not Loading
```bash
# Check Nginx status
pct exec 123 -- systemctl status nginx

# Check API status  
pct exec 123 -- systemctl status gitops-audit-api

# Test API endpoint
curl http://CONTAINER_IP:3070/audit
```

#### Configuration Issues
```bash
# View current configuration
pct exec 123 -- /opt/gitops/scripts/config/config-manager.sh show

# Validate configuration
pct exec 123 -- /opt/gitops/scripts/config/config-manager.sh validate

# Reconfigure interactively
pct exec 123 -- /opt/gitops/scripts/config/config-manager.sh interactive
```

### Manual Installation Alternative

For non-Proxmox environments, see the [full installation guide](../README.md).

### Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/festion/homelab-gitops-auditor/issues)
- **Documentation**: [Complete configuration guide](CONFIGURATION.md)
- **Container Shell**: `pct enter 123` for direct access

---

*This installer is inspired by the excellent [Proxmox Community Helper Scripts](https://community-scripts.github.io/ProxmoxVE/)*
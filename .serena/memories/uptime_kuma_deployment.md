# Uptime Kuma Deployment

## Container Details
- **VMID**: 132
- **Hostname**: uptime-kuma
- **IP Address**: 192.168.1.132
- **Port**: 3001
- **Access URL**: http://192.168.1.132:3001
- **Resources**: 512MB RAM, 1 CPU core, 8GB storage
- **Location**: Proxmox host 192.168.1.137, TrueNas_NVMe storage

## Installation Details
- **Node.js Version**: 20.19.5
- **npm Version**: 10.8.2
- **Uptime Kuma Version**: 2.0.1
- **Installation Path**: /opt/uptime-kuma
- **Data Directory**: /opt/uptime-kuma/data
- **Service**: systemd (uptime-kuma.service)
- **Auto-start**: Enabled

## Initial Setup
1. Navigate to http://192.168.1.132:3001
2. Create admin account (first-time setup)
3. Configure notification channels
4. Add monitors for your services

## Home Assistant Integration

### Method 1: REST Sensor (Recommended for Status)
Add to your Home Assistant configuration.yaml:

```yaml
sensor:
  - platform: rest
    name: "Service Name Status"
    resource: "http://192.168.1.132:3001/api/badge/1/status"
    value_template: "{{ value_json.status }}"
    json_attributes:
      - uptime
      - ping
    scan_interval: 60
```

### Method 2: Webhook Notifications (Real-time)
1. In Uptime Kuma, go to Settings → Notifications
2. Add "Home Assistant" notification type
3. Configure webhook URL: `http://homeassistant.local:8123/api/webhook/uptime_kuma_alert`
4. In Home Assistant, create webhook automation:

```yaml
automation:
  - alias: "Uptime Kuma Alert"
    trigger:
      - platform: webhook
        webhook_id: uptime_kuma_alert
    action:
      - service: notify.notify
        data:
          title: "{{ trigger.json.monitor.name }}"
          message: "Status: {{ trigger.json.heartbeat.status }}"
```

### Method 3: MQTT Integration (Most Flexible)
1. In Uptime Kuma, add MQTT notification
2. Configure MQTT broker: 192.168.1.124:1883
3. Topic: `homeassistant/uptime_kuma/status`
4. In Home Assistant:

```yaml
mqtt:
  sensor:
    - name: "Uptime Kuma Status"
      state_topic: "homeassistant/uptime_kuma/status"
      value_template: "{{ value_json.status }}"
```

## Supported Notification Channels (90+)
- Email (SMTP)
- Discord
- Telegram
- Slack
- Microsoft Teams
- Pushover
- Gotify
- Ntfy
- Webhook (generic HTTP)
- Home Assistant
- MQTT
- And 80+ more...

## Management Commands

### Service Control
```bash
# Via Proxmox host
ssh root@192.168.1.137 "pct exec 132 -- systemctl status uptime-kuma"
ssh root@192.168.1.137 "pct exec 132 -- systemctl restart uptime-kuma"
ssh root@192.168.1.137 "pct exec 132 -- systemctl stop uptime-kuma"

# View logs
ssh root@192.168.1.137 "pct exec 132 -- journalctl -u uptime-kuma -f"
```

### Backup Data Directory
```bash
ssh root@192.168.1.137 "pct exec 132 -- tar -czf /tmp/uptime-kuma-backup.tar.gz /opt/uptime-kuma/data"
ssh root@192.168.1.137 "pct exec 132 -- cat /tmp/uptime-kuma-backup.tar.gz" > uptime-kuma-backup.tar.gz
```

### Update Uptime Kuma
```bash
ssh root@192.168.1.137 "pct exec 132 -- bash -c 'cd /opt/uptime-kuma && git pull && npm run setup && systemctl restart uptime-kuma'"
```

## Monitoring Recommendations

### Critical Services to Monitor
1. **Home Assistant**: http://192.168.1.80:8123
2. **MQTT Broker**: tcp://192.168.1.124:1883
3. **AdGuard DNS**: dns://192.168.1.250
4. **Infisical**: https://192.168.1.127
5. **TrueNAS**: https://192.168.1.98
6. **Proxmox Hosts**: 
   - https://192.168.1.137:8006
   - https://192.168.1.125:8006
   - https://192.168.1.126:8006

### Monitor Types Available
- HTTP/HTTPS (with keyword matching)
- TCP Port
- Ping/ICMP
- DNS
- Docker Container
- Database (MySQL, PostgreSQL, MongoDB, Redis)
- MQTT
- Certificate Expiry
- JSON Query
- And many more...

## Performance Notes
- Current memory usage: ~105MB
- CPU usage: Minimal (<1% typical)
- Database: SQLite (lightweight)
- Check interval: Configurable (default 60s)

## Security Notes
- No authentication required for setup (first-time only)
- After initial setup, all access requires login
- Consider setting up reverse proxy with SSL for external access
- Default port 3001 is not exposed externally

## Troubleshooting

### Service Not Starting
```bash
ssh root@192.168.1.137 "pct exec 132 -- journalctl -u uptime-kuma -n 50"
```

### Check Port Binding
```bash
ssh root@192.168.1.137 "pct exec 132 -- ss -tlnp | grep 3001"
```

### Reset to Default
```bash
ssh root@192.168.1.137 "pct exec 132 -- rm -rf /opt/uptime-kuma/data"
ssh root@192.168.1.137 "pct exec 132 -- systemctl restart uptime-kuma"
```

# Current Caddy Configuration Inventory

**Date:** 2025-10-23  
**Caddy Version:** v2.10.2  
**Caddy Server:** 192.168.1.154 (LXC)  
**Configuration File:** `/etc/caddy/Caddyfile`  
**Total Services:** 17

## Executive Summary

- **Domain:** `*.internal.lakehouse.wtf` (wildcard certificate)
- **Certificate Provider:** Let's Encrypt via Cloudflare DNS-01 challenge
- **Logging:** JSON format access logs to `/var/log/caddy/access.log`
- **Service Distribution:**
  - Simple HTTP reverse proxies: 11 services
  - HTTPS backends (TLS skip verify): 4 services  
  - Custom headers: 2 services
  - Special configurations: 2 services

## Global Configuration

```caddyfile
{
    email admin@lakehouse.wtf
    acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}
```

**TLS Configuration:**
- Wildcard certificate for `*.internal.lakehouse.wtf`
- DNS-01 challenge via Cloudflare API
- Auto-renewal enabled
- Credentials stored in: `/etc/caddy/cloudflare_token`

**Logging:**
- Format: JSON
- Output: `/var/log/caddy/access.log`
- Enabled for all services

## Service Inventory

### 1. AdGuard Home
**Hostname:** `adguard.internal.lakehouse.wtf`  
**Backend:** `192.168.1.253:80`  
**Type:** HTTP  
**Purpose:** DNS server and ad blocker  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@adguard host adguard.internal.lakehouse.wtf
handle @adguard {
    reverse_proxy 192.168.1.253:80
}
```

---

### 2. BirdNET
**Hostname:** `birdnet.internal.lakehouse.wtf`  
**Backend:** `192.168.1.80:8080`  
**Type:** HTTP  
**Purpose:** Bird detection and analysis  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@birdnet host birdnet.internal.lakehouse.wtf
handle @birdnet {
    reverse_proxy 192.168.1.80:8080
}
```

---

### 3. Home Assistant ⚠️ CRITICAL
**Hostname:** `homeassistant.internal.lakehouse.wtf`  
**Backend:** `192.168.1.155:8123`  
**Type:** HTTP (WebSocket support required)  
**Purpose:** Home automation platform  
**Complexity:** High (WebSocket, long-lived connections, integrations)  
**Special Notes:** 
- Uses WebSockets extensively for real-time updates
- Mobile app connectivity critical
- Integrations with many other services
- Alexa integration dependency

```caddyfile
@homeassistant host homeassistant.internal.lakehouse.wtf
handle @homeassistant {
    reverse_proxy 192.168.1.155:8123
}
```

**Migration Risk:** HIGH - Critical service with WebSocket requirements

---

### 4. InfluxDB
**Hostname:** `influx.internal.lakehouse.wtf`  
**Backend:** `192.168.1.56:8086`  
**Type:** HTTP  
**Purpose:** Time-series database  
**Complexity:** Medium (data storage, query performance critical)

```caddyfile
@influx host influx.internal.lakehouse.wtf
handle @influx {
    reverse_proxy 192.168.1.56:8086
}
```

---

### 5. MySpeed
**Hostname:** `myspeed.internal.lakehouse.wtf`  
**Backend:** `192.168.1.152:5216`  
**Type:** HTTP  
**Purpose:** Internet speed testing  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@myspeed host myspeed.internal.lakehouse.wtf
handle @myspeed {
    reverse_proxy 192.168.1.152:5216
}
```

---

### 6. Omada Controller
**Hostname:** `omada.internal.lakehouse.wtf`  
**Backend:** `https://192.168.1.47:8043` (HTTPS)  
**Type:** HTTPS backend  
**Purpose:** TP-Link network controller  
**Complexity:** Medium (HTTPS backend, TLS skip verify)

```caddyfile
@omada host omada.internal.lakehouse.wtf
handle @omada {
    reverse_proxy https://192.168.1.47:8043 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**Special Configuration:** TLS verification disabled for self-signed backend certificate

---

### 7. Pairdrop
**Hostname:** `pairdrop.internal.lakehouse.wtf`  
**Backend:** `192.168.1.97:3000`  
**Type:** HTTP  
**Purpose:** Local file sharing (AirDrop-like)  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@pairdrop host pairdrop.internal.lakehouse.wtf
handle @pairdrop {
    reverse_proxy 192.168.1.97:3000
}
```

---

### 8. Proxmox VE (Primary)
**Hostname:** `proxmox.internal.lakehouse.wtf`  
**Backend:** `https://192.168.1.137:8006` (HTTPS)  
**Type:** HTTPS backend  
**Purpose:** Virtualization platform  
**Complexity:** Medium (HTTPS backend, TLS skip verify, WebSocket for noVNC)

```caddyfile
@proxmox host proxmox.internal.lakehouse.wtf
handle @proxmox {
    reverse_proxy https://192.168.1.137:8006 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**Special Configuration:** TLS verification disabled for self-signed backend certificate  
**Special Notes:** noVNC console uses WebSocket connections

---

### 9. Proxmox VE (Secondary)
**Hostname:** `proxmox2.internal.lakehouse.wtf`  
**Backend:** `https://192.168.1.125:8006` (HTTPS)  
**Type:** HTTPS backend  
**Purpose:** Virtualization platform (secondary node)  
**Complexity:** Medium (HTTPS backend, TLS skip verify, WebSocket for noVNC)

```caddyfile
@proxmox2 host proxmox2.internal.lakehouse.wtf
handle @proxmox2 {
    reverse_proxy https://192.168.1.125:8006 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**Special Configuration:** TLS verification disabled for self-signed backend certificate  
**Special Notes:** noVNC console uses WebSocket connections

---

### 10. Uptime Kuma (Pulse)
**Hostname:** `pulse.internal.lakehouse.wtf`  
**Backend:** `192.168.1.122:7655`  
**Type:** HTTP (WebSocket support required)  
**Purpose:** Uptime monitoring and status page  
**Complexity:** Medium (WebSocket for real-time updates)

```caddyfile
@pulse host pulse.internal.lakehouse.wtf
handle @pulse {
    reverse_proxy 192.168.1.122:7655
}
```

**Special Notes:** Uses WebSocket for real-time status updates

---

### 11. WatchYourLAN
**Hostname:** `watchyourlan.internal.lakehouse.wtf`  
**Backend:** `192.168.1.195:8840`  
**Type:** HTTP  
**Purpose:** Network device monitoring  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@watchyourlan host watchyourlan.internal.lakehouse.wtf
handle @watchyourlan {
    reverse_proxy 192.168.1.195:8840
}
```

---

### 12. Wiki.js
**Hostname:** `wiki.internal.lakehouse.wtf`  
**Backend:** `192.168.1.135:3000`  
**Type:** HTTP  
**Purpose:** Documentation wiki  
**Complexity:** Low (simple reverse proxy)

```caddyfile
@wiki host wiki.internal.lakehouse.wtf
handle @wiki {
    reverse_proxy 192.168.1.135:3000
}
```

---

### 13. ESPHome
**Hostname:** `esphome.internal.lakehouse.wtf`  
**Backend:** `192.168.1.169:6052`  
**Type:** HTTP  
**Purpose:** ESP device firmware management  
**Complexity:** Medium (custom headers required)

```caddyfile
@esphome host esphome.internal.lakehouse.wtf
handle @esphome {
    reverse_proxy 192.168.1.169:6052 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

**Special Configuration:** Custom headers required for proper operation  
**Headers:**
- `Host`: Set to upstream host:port
- `X-Real-IP`: Client's real IP
- `X-Forwarded-For`: Client's IP
- `X-Forwarded-Proto`: Request scheme (http/https)

---

### 14. Zigbee2MQTT ⚠️ CRITICAL
**Hostname:** `z2m.internal.lakehouse.wtf`  
**Backend:** `192.168.1.228:8099`  
**Type:** HTTP (WebSocket support required)  
**Purpose:** Zigbee device bridge to MQTT  
**Complexity:** High (WebSocket, critical for home automation)

```caddyfile
@z2m host z2m.internal.lakehouse.wtf
handle @z2m {
    reverse_proxy 192.168.1.228:8099
}
```

**Special Notes:** 
- Uses WebSocket for real-time device updates
- Critical dependency for Home Assistant automations
- Controls many smart home devices

**Migration Risk:** HIGH - Critical infrastructure with WebSocket requirements

---

### 15. Z-Wave JS UI ⚠️ CRITICAL
**Hostname:** `zwave-js-ui.internal.lakehouse.wtf`  
**Backend:** `https://192.168.1.141:8091` (HTTPS)  
**Type:** HTTPS backend  
**Purpose:** Z-Wave device controller  
**Complexity:** High (HTTPS backend, WebSocket, critical for home automation)

```caddyfile
@zwave-js-ui host zwave-js-ui.internal.lakehouse.wtf
handle @zwave-js-ui {
    reverse_proxy https://192.168.1.141:8091 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**Special Configuration:** TLS verification disabled for self-signed backend certificate  
**Special Notes:**
- Uses WebSocket for real-time device control
- Critical dependency for Home Assistant
- Controls Z-Wave smart home devices

**Migration Risk:** HIGH - Critical infrastructure with HTTPS backend and WebSocket

---

### 16. NetBox
**Hostname:** `netbox.internal.lakehouse.wtf`  
**Backend:** `192.168.1.138:80`  
**Type:** HTTP  
**Purpose:** IPAM and DCIM platform  
**Complexity:** Medium (custom header manipulation)

```caddyfile
@netbox host netbox.internal.lakehouse.wtf
handle @netbox {
    reverse_proxy 192.168.1.138 {
        header_up -X-Forwarded-Host
    }
}
```

**Special Configuration:** Removes `X-Forwarded-Host` header  
**Reason:** NetBox may be sensitive to this header for URL generation

---

### 17. Caddy Admin API
**Hostname:** `caddy.internal.lakehouse.wtf`  
**Backend:** `localhost:2019`  
**Type:** HTTP (Local)  
**Purpose:** Caddy admin API and config management  
**Complexity:** Low (local API proxy)

```caddyfile
@caddy host caddy.internal.lakehouse.wtf
handle @caddy {
    # Caddy Admin API - provides REST API and config management
    reverse_proxy localhost:2019
}
```

**Special Notes:** Provides access to Caddy's admin API for configuration management

---

## Summary by Category

### By Service Type

| Category | Count | Services |
|----------|-------|----------|
| **Home Automation** | 4 | Home Assistant, Zigbee2MQTT, Z-Wave JS UI, ESPHome |
| **Infrastructure** | 4 | Proxmox, Proxmox2, AdGuard, Caddy Admin |
| **Monitoring** | 3 | Pulse (Uptime Kuma), WatchYourLAN, InfluxDB |
| **Network Management** | 2 | Omada, NetBox |
| **Utilities** | 2 | Pairdrop, MySpeed |
| **Content/Data** | 2 | Wiki.js, BirdNET |

### By Backend Protocol

| Protocol | Count | Services |
|----------|-------|----------|
| **HTTP** | 13 | Most services |
| **HTTPS (TLS skip verify)** | 4 | Omada, Proxmox, Proxmox2, Z-Wave JS UI |

### By Complexity Level

| Complexity | Count | Services |
|------------|-------|----------|
| **Low** | 7 | AdGuard, BirdNET, MySpeed, Pairdrop, WatchYourLAN, Wiki.js, Caddy Admin |
| **Medium** | 7 | InfluxDB, Omada, Proxmox, Proxmox2, Pulse, ESPHome, NetBox |
| **High** | 3 | Home Assistant, Zigbee2MQTT, Z-Wave JS UI |

### Critical Services (Migration Priority: LAST)

1. **Home Assistant** - Central home automation hub
2. **Zigbee2MQTT** - Zigbee device bridge
3. **Z-Wave JS UI** - Z-Wave device controller

All three are interdependent and critical for home automation functionality.

## Middleware Requirements Summary

### Standard Middleware (All Services)
- ✅ TLS termination (wildcard cert)
- ✅ Access logging (JSON format)

### Custom Headers Required

**ESPHome:**
- `Host` header manipulation
- `X-Real-IP` forwarding
- `X-Forwarded-For` forwarding
- `X-Forwarded-Proto` forwarding

**NetBox:**
- Remove `X-Forwarded-Host` header

### TLS Backend Support

**Services requiring HTTPS backend proxying:**
- Omada Controller
- Proxmox VE (Primary)
- Proxmox VE (Secondary)
- Z-Wave JS UI

All four require `tls_insecure_skip_verify` due to self-signed certificates.

### WebSocket Support Required

**Services using WebSocket:**
- Home Assistant (extensive WebSocket usage)
- Pulse/Uptime Kuma (real-time updates)
- Zigbee2MQTT (device updates)
- Z-Wave JS UI (device control)
- Proxmox (noVNC console)

## Performance Characteristics

### Expected Traffic Patterns

**High Traffic:**
- Home Assistant (constant device polling, automation triggers)
- Zigbee2MQTT (device state updates)
- Z-Wave JS UI (device state updates)

**Medium Traffic:**
- Wiki.js (documentation access)
- Proxmox (periodic admin access)
- AdGuard (DNS queries via web UI)

**Low Traffic:**
- Pairdrop (occasional file sharing)
- MySpeed (periodic speed tests)
- BirdNET (periodic bird detection)
- WatchYourLAN (periodic network scans)

### Long-Lived Connections

**Services with long-lived connections:**
- Home Assistant (WebSocket connections from mobile apps, browsers)
- Zigbee2MQTT (WebSocket for UI)
- Z-Wave JS UI (WebSocket for UI)
- Pulse (WebSocket for status updates)
- Proxmox (noVNC WebSocket for console sessions)

## Migration Considerations

### Low-Risk Services (Migrate First - Batch 1)
1. Pairdrop
2. WatchYourLAN
3. MySpeed
4. BirdNET
5. Wiki.js
6. Caddy Admin

### Medium-Risk Services (Migrate Second - Batch 2-3)
1. InfluxDB
2. AdGuard
3. ESPHome (custom headers)
4. NetBox (header manipulation)
5. Omada (HTTPS backend)
6. Proxmox/Proxmox2 (HTTPS backend + WebSocket)
7. Pulse (WebSocket)

### High-Risk Services (Migrate Last - Batch 4-5)
1. Zigbee2MQTT (critical, WebSocket)
2. Z-Wave JS UI (critical, HTTPS + WebSocket)
3. Home Assistant (critical, extensive WebSocket, many integrations)

**Migration Order Rationale:**
- Test migration process on low-risk services first
- Gain experience with WebSocket handling before critical services
- Migrate critical home automation stack together in final batch
- Ensure rollback capability is tested before touching critical services

## Technical Debt & Observations

### TLS Backend Configuration
**Issue:** 4 services use `tls_insecure_skip_verify`  
**Impact:** Security risk (MITM vulnerability)  
**Recommendation:** 
- Generate internal CA certificate
- Sign backend certificates with internal CA
- Configure Traefik to trust internal CA
- Remove TLS verification skip

### Header Manipulation
**Issue:** Manual header manipulation for ESPHome and NetBox  
**Impact:** Complexity in migration  
**Recommendation:** Document exact header requirements and test thoroughly

### WebSocket Handling
**Issue:** 5 services require WebSocket support  
**Impact:** Must verify Traefik WebSocket configuration  
**Recommendation:** Test WebSocket functionality early in migration process

### No Authentication Layer
**Issue:** No authentication at reverse proxy level  
**Impact:** Services rely on own authentication  
**Recommendation:** Consider adding authentication middleware in Traefik for extra security

## Next Steps

1. ✅ **Export Caddy Configuration** - COMPLETE
2. ✅ **Inventory All Services** - COMPLETE (this document)
3. ⏭️ **Analyze Service Complexity** - Create detailed complexity ratings
4. ⏭️ **Document Middleware Requirements** - Create Traefik middleware configs
5. ⏭️ **Identify Technical Blockers** - Research Traefik capabilities for special cases
6. ⏭️ **Capture Performance Baselines** - Collect metrics from current setup
7. ⏭️ **Create Translation Script** - Automate Caddy → Traefik config conversion

---

**Document Created:** 2025-10-23  
**Created By:** Phase 1 Discovery Process  
**Status:** Complete  
**Next Document:** SERVICE-COMPLEXITY-ANALYSIS.md

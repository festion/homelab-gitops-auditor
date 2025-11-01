# Middleware Requirements Matrix

**Date:** 2025-10-23  
**Phase:** Discovery (Phase 1.1.4)  
**Purpose:** Map Caddy directives to Traefik middleware configurations

## Overview

This document provides a comprehensive mapping of middleware requirements from the current Caddy setup to Traefik configurations. Each middleware type includes:
- Caddy equivalent
- Services using it
- Traefik configuration
- Priority and complexity

## Middleware Summary Table

| Middleware Type | Services Count | Complexity | Priority | Status |
|----------------|----------------|------------|----------|--------|
| **Secure Headers** | 17 (all) | Low | HIGH | Ready to implement |
| **WebSocket Support** | 5 | Low | HIGH | Built-in (no config) |
| **IP Whitelisting** | 1 (recommended for more) | Low | MEDIUM | Ready to implement |
| **Custom Request Headers** | 1 (ESPHome) | Low | MEDIUM | Ready to implement |
| **Header Removal** | 1 (NetBox) | Low | LOW | Ready to implement |
| **Extended Timeouts** | 1 (InfluxDB) | Low | LOW | Ready to implement |
| **~~TLS Skip Verify~~** | ~~4~~ 0 | ~~Medium~~ | ~~MEDIUM~~ | **NOT NEEDED - Using Let's Encrypt** |

## Global Middleware (All Services)

### 1. Secure Headers

**Applies To:** All 17 services  
**Purpose:** Security headers for HTTPS  
**Caddy Equivalent:** Automatic HTTPS with security headers  
**Priority:** HIGH  
**Complexity:** Low

**Traefik Configuration:**

```yaml
# infrastructure/traefik/config/dynamic/middlewares.yml

http:
  middlewares:
    secure-headers:
      headers:
        # Force HTTPS
        sslRedirect: true
        
        # HSTS Configuration
        stsSeconds: 31536000  # 1 year
        stsIncludeSubdomains: true
        stsPreload: true
        
        # Security Headers
        contentTypeNosniff: true
        browserXssFilter: true
        frameDeny: true
        referrerPolicy: "strict-origin-when-cross-origin"
        
        # Permissions Policy (formerly Feature-Policy)
        permissionsPolicy: "geolocation=(), microphone=(), camera=()"
        
        # Content Security Policy (adjust per service if needed)
        customFrameOptionsValue: "SAMEORIGIN"
```

**Usage:** Apply to all HTTP routers

```yaml
http:
  routers:
    example-service:
      rule: "Host(`example.internal.lakehouse.wtf`)"
      middlewares:
        - secure-headers
      # ... rest of config
```

---

## Service-Specific Middleware

### 2. IP Whitelisting (Internal Network Only)

**Current Usage:** None explicitly configured in Caddy  
**Recommended For:** AdGuard, Proxmox, Proxmox2, and other admin interfaces  
**Priority:** MEDIUM  
**Complexity:** Low

**Purpose:** Restrict access to internal network only

**Traefik Configuration:**

```yaml
# infrastructure/traefik/config/dynamic/middlewares.yml

http:
  middlewares:
    internal-whitelist:
      ipWhiteList:
        sourceRange:
          - "192.168.1.0/24"      # Internal network
          - "10.0.0.0/8"          # If using additional internal ranges
          # - "172.16.0.0/12"     # Add if needed
```

**Recommended Services:**
- AdGuard Home (admin interface)
- Proxmox VE (both nodes)
- Caddy Admin API
- NetBox (IPAM admin)
- ESPHome (firmware management)

**Usage:**

```yaml
http:
  routers:
    adguard:
      rule: "Host(`adguard.internal.lakehouse.wtf`)"
      middlewares:
        - internal-whitelist
        - secure-headers
```

---

### 3. Custom Request Headers (ESPHome)

**Applies To:** ESPHome (192.168.1.169:6052)  
**Purpose:** Forward proxy headers required by ESPHome backend  
**Caddy Current Config:**
```caddyfile
header_up Host {upstream_hostport}
header_up X-Real-IP {remote_host}
header_up X-Forwarded-For {remote_host}
header_up X-Forwarded-Proto {scheme}
```

**Priority:** MEDIUM  
**Complexity:** Low

**Traefik Configuration:**

```yaml
# infrastructure/traefik/config/dynamic/middlewares.yml

http:
  middlewares:
    esphome-headers:
      headers:
        customRequestHeaders:
          # X-Real-IP and X-Forwarded-For are set by Traefik by default
          # X-Forwarded-Proto is set by Traefik by default
          # Host header is passed through by default
          # This middleware may not be needed - test without first
          
          # If needed, explicit configuration:
          X-Real-IP: ""  # Empty value uses client IP
          X-Forwarded-For: ""  # Empty value uses client IP
          X-Forwarded-Proto: ""  # Empty value uses scheme
```

**Note:** Traefik automatically adds `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Real-IP` headers by default. Test ESPHome without custom middleware first. Only add if explicitly required.

**Usage:**

```yaml
http:
  routers:
    esphome:
      rule: "Host(`esphome.internal.lakehouse.wtf`)"
      middlewares:
        - esphome-headers  # Only if needed after testing
        - secure-headers
      service: esphome
  
  services:
    esphome:
      loadBalancer:
        servers:
          - url: "http://192.168.1.169:6052"
        passHostHeader: true  # Ensure Host header is passed
```

---

### 4. Header Removal (NetBox)

**Applies To:** NetBox (192.168.1.138:80)  
**Purpose:** Remove X-Forwarded-Host header for proper URL generation  
**Caddy Current Config:**
```caddyfile
header_up -X-Forwarded-Host
```

**Priority:** LOW  
**Complexity:** Low

**Traefik Configuration:**

```yaml
# infrastructure/traefik/config/dynamic/middlewares.yml

http:
  middlewares:
    netbox-headers:
      headers:
        customRequestHeaders:
          X-Forwarded-Host: ""  # Remove the header (empty string removes it)
```

**Usage:**

```yaml
http:
  routers:
    netbox:
      rule: "Host(`netbox.internal.lakehouse.wtf`)"
      middlewares:
        - netbox-headers
        - secure-headers
```

---

### 5. Extended Timeouts (InfluxDB)

**Applies To:** InfluxDB (192.168.1.56:8086)  
**Purpose:** Allow longer query execution times  
**Caddy Current Config:** None (using defaults)  
**Priority:** LOW  
**Complexity:** Low

**Traefik Configuration:**

Extended timeouts are configured at the service level, not middleware:

```yaml
http:
  services:
    influxdb:
      loadBalancer:
        servers:
          - url: "http://192.168.1.56:8086"
        
        # Health check
        healthCheck:
          path: /health
          interval: 30s
          timeout: 5s
        
        # Response timeouts
        responseForwarding:
          flushInterval: 1s
```

**Global timeout configuration (in traefik.yml):**

```yaml
# infrastructure/traefik/config/traefik.yml

# Forwarding timeouts
serversTransport:
  forwardingTimeouts:
    dialTimeout: 30s
    responseHeaderTimeout: 60s  # Increased for long queries
    idleConnTimeout: 90s
```

---

### 6. WebSocket Support

**Applies To:** 5 services (Pulse, Proxmox, Proxmox2, Zigbee2MQTT, Z-Wave JS UI, Home Assistant)  
**Purpose:** Enable WebSocket connections  
**Priority:** HIGH  
**Complexity:** Low (built-in to Traefik)

**Traefik Configuration:**

**NO MIDDLEWARE NEEDED** - Traefik automatically handles WebSocket connections by detecting the `Upgrade` header.

**Standard router configuration works:**

```yaml
http:
  routers:
    homeassistant:
      rule: "Host(`homeassistant.internal.lakehouse.wtf`)"
      middlewares:
        - secure-headers
      service: homeassistant
  
  services:
    homeassistant:
      loadBalancer:
        servers:
          - url: "http://192.168.1.155:8123"
```

**What Traefik does automatically:**
1. Detects `Upgrade: websocket` header in client request
2. Upgrades connection to WebSocket
3. Maintains bidirectional communication
4. Handles connection closure properly

**Testing Required:** Verify WebSocket functionality for each service:
- Pulse: Real-time status updates
- Proxmox/Proxmox2: noVNC console
- Zigbee2MQTT: Device updates UI
- Z-Wave JS UI: Device control UI
- Home Assistant: Lovelace UI, mobile apps

---

### 7. ~~TLS Backend with Skip Verify~~ (NOT NEEDED)

**Previous Requirement:** 4 services  
**Current Status:** **REPLACED WITH LET'S ENCRYPT CERTIFICATES**  
**Priority:** N/A  
**Complexity:** N/A

**Services Previously Requiring This:**
- ~~Omada Controller~~
- ~~Proxmox VE Primary~~
- ~~Proxmox VE Secondary~~
- ~~Z-Wave JS UI~~

**Action Taken:** All backends will have Let's Encrypt certificates installed before migration.

**New Configuration:** Standard HTTP reverse proxy (no special TLS configuration needed)

```yaml
# Standard configuration - no TLS skip verify needed
http:
  services:
    proxmox:
      loadBalancer:
        servers:
          - url: "https://192.168.1.137:8006"  # Still HTTPS, but with valid cert
        
        # Optional: Custom CA if using internal CA instead
        # serversTransport: internal-ca-transport

# If using internal CA instead of Let's Encrypt:
serversTransports:
  internal-ca-transport:
    rootCAs:
      - /path/to/internal-ca.crt
```

---

## Middleware Chaining

### Standard Chain (Most Services)

```yaml
http:
  middlewares:
    standard-chain:
      chain:
        middlewares:
          - secure-headers
```

### Internal Admin Chain

```yaml
http:
  middlewares:
    internal-admin-chain:
      chain:
        middlewares:
          - internal-whitelist
          - secure-headers
```

### Custom Service Chains

**ESPHome Chain:**
```yaml
http:
  middlewares:
    esphome-chain:
      chain:
        middlewares:
          - esphome-headers  # If needed after testing
          - internal-whitelist  # Recommended
          - secure-headers
```

**NetBox Chain:**
```yaml
http:
  middlewares:
    netbox-chain:
      chain:
        middlewares:
          - netbox-headers
          - internal-whitelist  # Recommended
          - secure-headers
```

---

## Complete Middleware Configuration File

```yaml
# infrastructure/traefik/config/dynamic/middlewares.yml

http:
  middlewares:
    # ============================================
    # Global Middleware
    # ============================================
    
    secure-headers:
      headers:
        sslRedirect: true
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        contentTypeNosniff: true
        browserXssFilter: true
        frameDeny: true
        referrerPolicy: "strict-origin-when-cross-origin"
        permissionsPolicy: "geolocation=(), microphone=(), camera=()"
        customFrameOptionsValue: "SAMEORIGIN"
    
    # ============================================
    # Network Security
    # ============================================
    
    internal-whitelist:
      ipWhiteList:
        sourceRange:
          - "192.168.1.0/24"
          # Add additional ranges if needed
    
    # ============================================
    # Service-Specific Middleware
    # ============================================
    
    # ESPHome - Custom headers (test without first)
    esphome-headers:
      headers:
        customRequestHeaders:
          X-Real-IP: ""
          X-Forwarded-For: ""
          X-Forwarded-Proto: ""
    
    # NetBox - Remove X-Forwarded-Host
    netbox-headers:
      headers:
        customRequestHeaders:
          X-Forwarded-Host: ""
    
    # ============================================
    # Middleware Chains
    # ============================================
    
    standard-chain:
      chain:
        middlewares:
          - secure-headers
    
    internal-admin-chain:
      chain:
        middlewares:
          - internal-whitelist
          - secure-headers
    
    esphome-chain:
      chain:
        middlewares:
          - esphome-headers
          - internal-whitelist
          - secure-headers
    
    netbox-chain:
      chain:
        middlewares:
          - netbox-headers
          - internal-whitelist
          - secure-headers
```

---

## Middleware Application Matrix

| Service | Middleware Chain | Rationale |
|---------|-----------------|-----------|
| **Low-Complexity Services** |
| Pairdrop | `standard-chain` | Public-facing file sharing |
| WatchYourLAN | `internal-admin-chain` | Admin interface |
| MySpeed | `standard-chain` | Speed testing utility |
| BirdNET | `standard-chain` | Bird detection |
| Wiki.js | `standard-chain` | Documentation |
| Caddy Admin | `internal-admin-chain` | Admin API |
| **Medium-Complexity Services** |
| InfluxDB | `internal-admin-chain` | Database admin |
| AdGuard Home | `internal-admin-chain` | DNS admin interface |
| Pulse | `internal-admin-chain` | Monitoring dashboard |
| NetBox | `netbox-chain` | IPAM admin (custom headers) |
| ESPHome | `esphome-chain` | IoT firmware (custom headers) |
| Omada | `internal-admin-chain` | Network controller |
| Proxmox | `internal-admin-chain` | Virtualization admin |
| Proxmox2 | `internal-admin-chain` | Virtualization admin |
| **High-Complexity Services** |
| Zigbee2MQTT | `internal-admin-chain` | Zigbee admin interface |
| Z-Wave JS UI | `internal-admin-chain` | Z-Wave admin interface |
| Home Assistant | `standard-chain` | Home automation (needs external access) |

**Note:** Home Assistant uses `standard-chain` (not `internal-admin-chain`) because it needs to be accessible from:
- Mobile apps (outside local network via Cloudflare Tunnel)
- Alexa/Google integrations
- External webhooks

---

## Caddy → Traefik Middleware Translation Guide

### Common Caddy Directives

| Caddy Directive | Traefik Equivalent | Notes |
|----------------|-------------------|-------|
| `header_up Host {upstream_hostport}` | Default behavior or `passHostHeader: true` | Traefik passes Host header by default |
| `header_up X-Real-IP {remote_host}` | Automatic | Traefik adds this by default |
| `header_up X-Forwarded-For {remote_host}` | Automatic | Traefik adds this by default |
| `header_up X-Forwarded-Proto {scheme}` | Automatic | Traefik adds this by default |
| `header_up -HeaderName` | `customRequestHeaders: { HeaderName: "" }` | Empty string removes header |
| `@matcher host hostname` | `rule: "Host(`hostname`)"` | Router rule |
| `tls_insecure_skip_verify` | ~~`insecureSkipVerify: true`~~ **NOT NEEDED** | Using Let's Encrypt instead |
| Automatic HTTPS | TLS configuration in router | Traefik handles automatically |
| WebSocket handling | Built-in | Automatic upgrade detection |

---

## Testing Requirements by Middleware

### Secure Headers Testing
- [ ] HTTPS redirect working
- [ ] HSTS header present (check with browser dev tools)
- [ ] Security headers present
- [ ] No mixed content warnings

### IP Whitelisting Testing
- [ ] Access allowed from internal network (192.168.1.x)
- [ ] Access blocked from external networks
- [ ] Correct HTTP 403 Forbidden response

### Custom Headers Testing
**ESPHome:**
- [ ] Firmware upload works
- [ ] Device management works
- [ ] Home Assistant integration works

**NetBox:**
- [ ] URL generation correct
- [ ] Links work properly
- [ ] API functionality preserved

### WebSocket Testing
**For each WebSocket service:**
- [ ] Initial connection succeeds
- [ ] Bidirectional communication works
- [ ] Connection stays alive (long-running test)
- [ ] Reconnection works after disconnect
- [ ] No timeout issues

---

## Next Steps

1. ✅ Middleware requirements documented
2. ⏭️ **Create middleware configuration file** (infrastructure/traefik/config/dynamic/middlewares.yml)
3. ⏭️ **Identify technical blockers** (Task 1.1.5)
4. ⏭️ **Capture performance baselines** (Task 1.1.6)
5. ⏭️ **Let's Encrypt certificate replacement plan**

---

**Document Created:** 2025-10-23  
**Created By:** Phase 1.1.4 Discovery Process  
**Status:** Complete  
**Key Finding:** Let's Encrypt replacement eliminates need for TLS skip verify middleware  
**Next Document:** DISCOVERED-BLOCKERS.md

# Service Migration Matrix

**Last Updated:** 2025-10-23  
**Status:** Discovery Phase  
**Total Services:** 17

## Overview

This matrix tracks all services being migrated from Caddy to Traefik, including complexity ratings, migration batches, and status.

## Migration Batch Definitions

| Batch | Risk Level | Description | Migration Window | Service Count |
|-------|------------|-------------|------------------|---------------|
| 1 | Low | Non-critical, simple configurations | Business hours | 6 |
| 2 | Low-Medium | Monitoring and utility services | Business hours | 4 |
| 3 | Medium | Services with special configuration | Off-hours recommended | 4 |
| 4 | Medium-High | Infrastructure services with WebSocket | Off-hours required | 2 |
| 5 | High | Critical home automation services | Dedicated window required | 3 |

## Service Inventory Matrix

| Service Name | Current Host | Backend | Config Complexity | Middleware Needs | Migration Batch | Risk Level | Special Considerations | Status |
|--------------|--------------|---------|-------------------|------------------|-----------------|------------|----------------------|--------|
| **Batch 1: Low-Risk Services** |
| Pairdrop | pairdrop.internal.lakehouse.wtf | 192.168.1.97:3000 | Low | Secure headers only | 1 | Low | File sharing, WebRTC | Pending |
| WatchYourLAN | watchyourlan.internal.lakehouse.wtf | 192.168.1.195:8840 | Low | Secure headers only | 1 | Low | Network monitoring | Pending |
| MySpeed | myspeed.internal.lakehouse.wtf | 192.168.1.152:5216 | Low | Secure headers only | 1 | Low | Speed test tool | Pending |
| BirdNET | birdnet.internal.lakehouse.wtf | 192.168.1.80:8080 | Low | Secure headers only | 1 | Low | Bird detection | Pending |
| Wiki.js | wiki.internal.lakehouse.wtf | 192.168.1.135:3000 | Low | Secure headers only | 1 | Low | Documentation | Pending |
| Caddy Admin | caddy.internal.lakehouse.wtf | localhost:2019 | Low | Secure headers, localhost only | 1 | Low | Caddy API (can be removed after migration) | Pending |
| **Batch 2: Monitoring & Utility Services** |
| InfluxDB | influx.internal.lakehouse.wtf | 192.168.1.56:8086 | Medium | Secure headers, timeouts | 2 | Low-Medium | Time-series DB, query performance critical | Pending |
| AdGuard Home | adguard.internal.lakehouse.wtf | 192.168.1.253:80 | Medium | Secure headers, IP whitelist | 2 | Medium | DNS infrastructure dependency | Pending |
| Pulse (Uptime Kuma) | pulse.internal.lakehouse.wtf | 192.168.1.122:7655 | Medium | WebSocket support | 2 | Low-Medium | WebSocket for real-time updates | Pending |
| NetBox | netbox.internal.lakehouse.wtf | 192.168.1.138:80 | Medium | Custom headers (-X-Forwarded-Host) | 2 | Low-Medium | IPAM/DCIM platform | Pending |
| **Batch 3: Services with Special Configuration** |
| ESPHome | esphome.internal.lakehouse.wtf | 192.168.1.169:6052 | Medium | Custom headers (Host, X-Real-IP, X-Forwarded-*) | 3 | Medium | IoT firmware management, custom headers required | Pending |
| Omada Controller | omada.internal.lakehouse.wtf | https://192.168.1.47:8043 | Medium | HTTPS backend, TLS skip verify | 3 | Medium | Network controller, self-signed cert | Pending |
| Proxmox VE | proxmox.internal.lakehouse.wtf | https://192.168.1.137:8006 | Medium | HTTPS backend, TLS skip verify, WebSocket | 3 | Medium-High | Virtualization, noVNC WebSocket | Pending |
| Proxmox VE 2 | proxmox2.internal.lakehouse.wtf | https://192.168.1.125:8006 | Medium | HTTPS backend, TLS skip verify, WebSocket | 3 | Medium-High | Virtualization, noVNC WebSocket | Pending |
| **Batch 4: Infrastructure Services (NOT USED - moved to Batch 5)** |
| **Batch 5: Critical Home Automation Services** |
| Zigbee2MQTT | z2m.internal.lakehouse.wtf | 192.168.1.228:8099 | High | WebSocket support | 5 | High | Zigbee bridge, WebSocket, critical HA dependency | Pending |
| Z-Wave JS UI | zwave-js-ui.internal.lakehouse.wtf | https://192.168.1.141:8091 | High | HTTPS backend, TLS skip verify, WebSocket | 5 | High | Z-Wave controller, critical HA dependency | Pending |
| Home Assistant | homeassistant.internal.lakehouse.wtf | 192.168.1.155:8123 | High | WebSocket support, long-lived connections | 5 | High | Central automation hub, extensive WebSocket, mobile apps, Alexa | Pending |

## Statistics

**By Batch:**
- Batch 1 (Low risk): 6 services
- Batch 2 (Low-Medium risk): 4 services
- Batch 3 (Medium risk): 4 services
- Batch 4 (Medium-High risk): 0 services
- Batch 5 (High risk): 3 services

**By Complexity:**
- Low complexity: 6 services
- Medium complexity: 8 services
- High complexity: 3 services

**By Protocol:**
- HTTP backends: 13 services
- HTTPS backends (TLS skip verify): 4 services

**By Special Requirements:**
- WebSocket support: 5 services (Pulse, Proxmox, Proxmox2, Zigbee2MQTT, Z-Wave JS UI, Home Assistant)
- Custom headers: 2 services (ESPHome, NetBox)
- HTTPS backend: 4 services (Omada, Proxmox, Proxmox2, Z-Wave JS UI)
- Critical for home automation: 3 services (Home Assistant, Zigbee2MQTT, Z-Wave JS UI)

**By Status:**
- Not Started: 17 services
- Planning: 0 services
- Ready: 0 services
- In Progress: 0 services
- Complete: 0 services
- Failed/Blocked: 0 services

## Detailed Service Profiles

### High-Complexity Services Requiring Detailed Migration Plans

The following services require detailed migration plans (to be created after Checkpoint 1):

#### 1. Home Assistant (CRITICAL)
- **Backend:** 192.168.1.155:8123
- **Complexity:** HIGH - WebSocket, long-lived connections, mobile apps, integrations
- **Risk:** CRITICAL - Central automation hub
- **Dependencies:** Zigbee2MQTT, Z-Wave JS UI, AdGuard, InfluxDB, ESPHome
- **Migration Window:** Weekend, low-usage period
- **Acceptable Downtime:** 0 (must test thoroughly in parallel operation)
- **Special Testing Required:**
  - WebSocket functionality (mobile apps, browser)
  - Automation triggers
  - Alexa integration
  - Zigbee/Z-Wave device control
  - Lovelace UI rendering

#### 2. Zigbee2MQTT (CRITICAL)
- **Backend:** 192.168.1.228:8099
- **Complexity:** HIGH - WebSocket, real-time device updates
- **Risk:** HIGH - Critical for smart home device control
- **Dependencies:** Home Assistant
- **Migration Window:** Weekend, coordinate with Home Assistant migration
- **Acceptable Downtime:** < 5 minutes
- **Special Testing Required:**
  - WebSocket for UI
  - Device state updates
  - Pairing/unpairing devices
  - MQTT message flow

#### 3. Z-Wave JS UI (CRITICAL)
- **Backend:** https://192.168.1.141:8091
- **Complexity:** HIGH - HTTPS backend + WebSocket + critical infrastructure
- **Risk:** HIGH - Critical for Z-Wave device control
- **Dependencies:** Home Assistant
- **Migration Window:** Weekend, coordinate with Home Assistant migration
- **Acceptable Downtime:** < 5 minutes
- **Special Testing Required:**
  - HTTPS backend connectivity
  - TLS verification (or skip)
  - WebSocket for UI
  - Device control functionality
  - Secure node management

## Middleware Usage Summary

| Middleware Type | Services Using | Complexity | Priority | Traefik Implementation |
|----------------|----------------|------------|----------|----------------------|
| **Secure Headers (HSTS, CSP, etc.)** | All 17 services | Low | High | `headers` middleware |
| **WebSocket Support** | 5 services | Medium | High | Built-in (upgrade headers) |
| **HTTPS Backend** | 4 services | Medium | High | `serversTransport` with TLS config |
| **TLS Skip Verify** | 4 services | Low | Medium | `serversTransport.insecureSkipVerify` |
| **Custom Header Injection** | 1 service (ESPHome) | Medium | Medium | `headers` middleware (header_up) |
| **Header Removal** | 1 service (NetBox) | Low | Low | `headers` middleware (header_down) |
| **IP Whitelisting** | 1 service (AdGuard) | Low | Medium | `ipWhiteList` middleware |
| **Timeout Configuration** | 1 service (InfluxDB) | Low | Low | `forwardingTimeouts` |

## Migration Schedule (Tentative)

### Phase 4.2: Service-by-Service Migration

**Batch 1: Low Risk Services**
- Estimated duration: 2-4 hours
- Services: Pairdrop, WatchYourLAN, MySpeed, BirdNET, Wiki.js, Caddy Admin
- Parallel migration possible for these services
- No special migration window required

**Batch 2: Monitoring Services**
- Estimated duration: 2-4 hours
- Services: InfluxDB, AdGuard, Pulse, NetBox
- Sequential migration recommended
- Business hours acceptable

**Batch 3: Special Configuration Services**
- Estimated duration: 3-6 hours
- Services: ESPHome, Omada, Proxmox, Proxmox2
- Sequential migration required
- Off-hours recommended (for Proxmox)

**Batch 5: Critical Home Automation Services**
- Estimated duration: 4-8 hours (including extensive testing)
- Services: Zigbee2MQTT, Z-Wave JS UI, Home Assistant
- All three must be migrated together
- Dedicated migration window: Weekend, low-usage period
- Extensive testing period required (24-48 hours monitoring)

## Critical Dependencies

### Home Assistant Dependencies
- **Zigbee2MQTT** - Zigbee device control
- **Z-Wave JS UI** - Z-Wave device control
- **AdGuard Home** - DNS resolution
- **InfluxDB** - Historical data storage
- **ESPHome** - ESP device management

**Impact:** Home Assistant migration must be coordinated with all dependencies operational

### Infrastructure Dependencies
- **AdGuard Home** - DNS infrastructure for entire network
- **Proxmox** - Virtualization infrastructure (can affect other services if issues occur)

## Known Issues & Blockers

### 1. WebSocket Support Validation
**Status:** Needs validation  
**Impact:** 5 services (HIGH, MEDIUM-HIGH, MEDIUM)  
**Action:** Test WebSocket handling in Traefik during Phase 2  
**Owner:** TBD

### 2. HTTPS Backend with Self-Signed Certificates
**Status:** Known, solution exists  
**Impact:** 4 services (MEDIUM)  
**Solution:** Configure `serversTransport` with `insecureSkipVerify: true` OR implement internal CA  
**Action:** Decide on approach during Checkpoint 1  
**Owner:** TBD

### 3. Custom Header Requirements
**Status:** Known, solution exists  
**Impact:** 2 services (MEDIUM, LOW-MEDIUM)  
**Solution:** Configure `headers` middleware for each service  
**Action:** Create middleware configurations during Phase 2.2  
**Owner:** TBD

### 4. Performance Baseline Missing
**Status:** Pending Task 1.1.6  
**Impact:** Cannot validate no degradation  
**Action:** Capture baselines before proceeding  
**Owner:** TBD

## Testing Requirements by Service

### Standard Tests (All Services)
- [ ] HTTP/HTTPS connectivity
- [ ] Correct status codes
- [ ] Headers properly set
- [ ] TLS certificate valid
- [ ] No errors in logs

### WebSocket Tests (5 Services)
- [ ] WebSocket upgrade successful
- [ ] Bidirectional communication working
- [ ] Long-lived connections stable
- [ ] No timeout issues

### HTTPS Backend Tests (4 Services)
- [ ] Backend TLS handshake successful
- [ ] Certificate validation (or skip) working
- [ ] No TLS errors in logs

### Custom Header Tests (2 Services)
- [ ] Required headers present
- [ ] Unwanted headers removed
- [ ] Application functionality validated

## Next Steps

1. ✅ Complete service inventory
2. ⏭️ Analyze complexity for each service (Task 1.1.3)
3. ⏭️ Document middleware requirements (Task 1.1.4)
4. ⏭️ Identify technical blockers (Task 1.1.5)
5. ⏭️ Capture performance baselines (Task 1.1.6)
6. ⏭️ Checkpoint 1: Review and create detailed plans for high-complexity services

---

**Document Owner:** Migration Team  
**Last Updated:** 2025-10-23 during Phase 1 Discovery  
**Review Frequency:** Daily during migration execution  
**Next Review:** After Task 1.1.3 (Complexity Analysis) complete

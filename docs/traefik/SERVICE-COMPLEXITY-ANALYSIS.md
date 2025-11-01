# Service Complexity Analysis

**Date:** 2025-10-23  
**Phase:** Discovery (Phase 1.1.3)  
**Total Services:** 17

## Complexity Rating Methodology

### Rating Criteria

**Low Complexity:**
- Simple HTTP reverse proxy
- Single backend
- No custom middleware
- Standard TLS termination
- No special protocols (WebSocket, gRPC, etc.)
- Low traffic
- Non-critical service

**Medium Complexity:**
- Multiple backends OR
- Custom headers required OR
- HTTPS backend OR
- Authentication required OR
- Medium-high traffic OR
- Moderate criticality OR
- Some special protocol support

**High Complexity:**
- WebSocket/SSE required AND critical service OR
- Complex middleware chain OR
- Multiple special requirements OR
- High criticality with dependencies OR
- Integration with multiple services OR
- Real-time requirements

## Complexity Ratings by Service

### Low Complexity (6 Services)

#### 1. Pairdrop
**Rating:** LOW  
**Justification:**
- Simple HTTP reverse proxy
- Single backend (192.168.1.97:3000)
- No custom middleware beyond standard headers
- Non-critical utility service
- Low traffic
- WebRTC handled client-side

**Migration Effort:** 1-2 hours (including testing)  
**Traefik Configuration:** Standard HTTP router + service

---

#### 2. WatchYourLAN
**Rating:** LOW  
**Justification:**
- Simple HTTP reverse proxy
- Single backend (192.168.1.195:8840)
- No custom middleware
- Non-critical monitoring tool
- Low traffic

**Migration Effort:** 1 hour  
**Traefik Configuration:** Standard HTTP router + service

---

#### 3. MySpeed
**Rating:** LOW  
**Justification:**
- Simple HTTP reverse proxy
- Single backend (192.168.1.152:5216)
- No custom middleware
- Non-critical utility
- Low traffic

**Migration Effort:** 1 hour  
**Traefik Configuration:** Standard HTTP router + service

---

#### 4. BirdNET
**Rating:** LOW  
**Justification:**
- Simple HTTP reverse proxy
- Single backend (192.168.1.80:8080)
- No custom middleware
- Non-critical utility
- Low traffic

**Migration Effort:** 1 hour  
**Traefik Configuration:** Standard HTTP router + service

---

#### 5. Wiki.js
**Rating:** LOW  
**Justification:**
- Simple HTTP reverse proxy
- Single backend (192.168.1.135:3000)
- No custom middleware
- Documentation platform
- Medium-low traffic

**Migration Effort:** 1-2 hours  
**Traefik Configuration:** Standard HTTP router + service

---

#### 6. Caddy Admin API
**Rating:** LOW  
**Justification:**
- Simple local HTTP proxy
- Localhost backend (localhost:2019)
- Can be removed after migration complete
- Internal use only

**Migration Effort:** 1 hour (or skip - will be decommissioned)  
**Traefik Configuration:** Standard HTTP router + service (or remove)

---

### Medium Complexity (8 Services)

#### 7. InfluxDB
**Rating:** MEDIUM  
**Justification:**
- Simple HTTP reverse proxy BUT
- Time-series database with performance requirements
- Query performance critical for dashboards
- Timeout configuration may be needed
- Moderate traffic from Home Assistant and other data sources
- Data integrity critical

**Complexity Factors:**
- Performance sensitivity
- Timeout configuration
- Moderate criticality

**Migration Effort:** 2-3 hours  
**Traefik Configuration:** HTTP router + service + timeout middleware  
**Special Testing:** Query performance, timeout handling

---

#### 8. AdGuard Home
**Rating:** MEDIUM  
**Justification:**
- HTTP reverse proxy BUT
- DNS infrastructure component
- Should be IP whitelisted (internal network only)
- Moderate criticality (DNS web UI)
- DNS service itself not proxied

**Complexity Factors:**
- Infrastructure component
- IP whitelisting recommended
- Moderate criticality

**Migration Effort:** 2 hours  
**Traefik Configuration:** HTTP router + service + IP whitelist middleware  
**Special Testing:** Access control, admin functionality

---

#### 9. Pulse (Uptime Kuma)
**Rating:** MEDIUM  
**Justification:**
- HTTP reverse proxy BUT
- WebSocket support required for real-time updates
- Monitoring dashboard functionality
- Low-medium traffic
- Non-critical but useful

**Complexity Factors:**
- WebSocket support required
- Real-time updates

**Migration Effort:** 2-3 hours (WebSocket testing)  
**Traefik Configuration:** HTTP router + service (WebSocket built-in)  
**Special Testing:** WebSocket connection, real-time status updates

---

#### 10. NetBox
**Rating:** MEDIUM  
**Justification:**
- HTTP reverse proxy BUT
- Custom header manipulation required (remove X-Forwarded-Host)
- IPAM/DCIM platform
- Moderate traffic
- Important for infrastructure documentation

**Complexity Factors:**
- Custom header removal
- Special configuration requirement

**Migration Effort:** 2-3 hours  
**Traefik Configuration:** HTTP router + service + custom headers middleware  
**Special Testing:** URL generation, link functionality

---

#### 11. ESPHome
**Rating:** MEDIUM  
**Justification:**
- HTTP reverse proxy BUT
- Multiple custom headers required (Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)
- IoT firmware management
- Integration with Home Assistant
- Moderate criticality

**Complexity Factors:**
- Multiple custom headers
- HA integration dependency
- Firmware upload functionality

**Migration Effort:** 2-3 hours  
**Traefik Configuration:** HTTP router + service + custom headers middleware  
**Special Testing:** Firmware upload, HA integration, header forwarding

---

#### 12. Omada Controller
**Rating:** MEDIUM  
**Justification:**
- HTTPS backend with self-signed certificate (TO BE REPLACED)
- Network infrastructure controller
- Moderate traffic
- Moderate criticality

**Complexity Factors:**
- ~~HTTPS backend (current: TLS skip verify)~~ **WILL BE REPLACED WITH LET'S ENCRYPT**
- Network infrastructure component

**Migration Effort:** 2-3 hours (with Let's Encrypt cert replacement)  
**Pre-Migration Required:** Replace self-signed cert with Let's Encrypt  
**Traefik Configuration:** HTTP router + service (standard after cert replacement)  
**Special Testing:** Controller functionality, network device management

---

#### 13. Proxmox VE (Primary)
**Rating:** MEDIUM-HIGH  
**Justification:**
- HTTPS backend with self-signed certificate (TO BE REPLACED)
- WebSocket support required (noVNC console)
- Virtualization infrastructure
- Moderate-high traffic
- High criticality (infrastructure)

**Complexity Factors:**
- ~~HTTPS backend (current: TLS skip verify)~~ **WILL BE REPLACED WITH LET'S ENCRYPT**
- WebSocket for noVNC console
- Infrastructure criticality

**Migration Effort:** 3-4 hours (with Let's Encrypt cert replacement)  
**Pre-Migration Required:** Replace self-signed cert with Let's Encrypt  
**Traefik Configuration:** HTTP router + service (WebSocket built-in after cert replacement)  
**Special Testing:** VM console (noVNC), WebSocket, management interface

---

#### 14. Proxmox VE 2 (Secondary)
**Rating:** MEDIUM-HIGH  
**Justification:**
- Same as Proxmox VE Primary
- Secondary virtualization node

**Complexity Factors:**
- ~~HTTPS backend (current: TLS skip verify)~~ **WILL BE REPLACED WITH LET'S ENCRYPT**
- WebSocket for noVNC console
- Infrastructure criticality

**Migration Effort:** 3-4 hours (with Let's Encrypt cert replacement)  
**Pre-Migration Required:** Replace self-signed cert with Let's Encrypt  
**Traefik Configuration:** HTTP router + service (WebSocket built-in after cert replacement)  
**Special Testing:** VM console (noVNC), WebSocket, management interface

---

### High Complexity (3 Services)

#### 15. Zigbee2MQTT
**Rating:** HIGH  
**Justification:**
- HTTP reverse proxy BUT
- WebSocket support CRITICAL for real-time device updates
- Central Zigbee device bridge
- HIGH criticality - controls smart home devices
- Integration with Home Assistant
- Real-time requirements
- Many devices depend on this service

**Complexity Factors:**
- WebSocket critical for functionality
- Real-time device state updates
- HIGH criticality (home automation)
- Home Assistant dependency
- Controls physical devices (lights, sensors, switches)

**Migration Effort:** 4-6 hours (extensive testing required)  
**Migration Window:** Weekend, coordinate with Home Assistant  
**Traefik Configuration:** HTTP router + service (WebSocket built-in)  
**Special Testing:**
- WebSocket connection stability
- Device state updates
- Pairing/unpairing functionality
- MQTT message flow
- Home Assistant integration
- Device control (lights, switches, sensors)
- Frontend UI functionality

**Rollback Readiness:** CRITICAL - Must have instant rollback capability

---

#### 16. Z-Wave JS UI
**Rating:** HIGH  
**Justification:**
- HTTPS backend with self-signed certificate (TO BE REPLACED)
- WebSocket support CRITICAL for device control
- Z-Wave device controller
- HIGH criticality - controls smart home devices
- Integration with Home Assistant
- Secure node management
- Many devices depend on this service

**Complexity Factors:**
- ~~HTTPS backend (current: TLS skip verify)~~ **WILL BE REPLACED WITH LET'S ENCRYPT**
- WebSocket critical for functionality
- HIGH criticality (home automation)
- Home Assistant dependency
- Controls physical devices (locks, sensors, switches)
- Security-sensitive (Z-Wave secure nodes)

**Migration Effort:** 4-6 hours (extensive testing required)  
**Migration Window:** Weekend, coordinate with Home Assistant and Zigbee2MQTT  
**Pre-Migration Required:** Replace self-signed cert with Let's Encrypt  
**Traefik Configuration:** HTTP router + service (WebSocket built-in after cert replacement)  
**Special Testing:**
- HTTPS backend connectivity (post Let's Encrypt)
- WebSocket connection stability
- Device control functionality
- Secure node operations
- Home Assistant integration
- Frontend UI functionality
- Node interview process
- Firmware updates

**Rollback Readiness:** CRITICAL - Must have instant rollback capability

---

#### 17. Home Assistant
**Rating:** HIGH (MOST COMPLEX)  
**Justification:**
- HTTP reverse proxy BUT
- EXTENSIVE WebSocket usage (critical)
- Long-lived connections
- Central home automation hub
- HIGHEST criticality
- Integrations with ALL other home automation services
- Mobile app connectivity
- Alexa integration
- Lovelace UI with real-time updates
- Automation engine
- Controls ALL smart home devices indirectly

**Complexity Factors:**
- Extensive WebSocket usage (browsers, mobile apps)
- Long-lived persistent connections
- HIGHEST criticality
- Multiple service dependencies (Zigbee2MQTT, Z-Wave JS UI, ESPHome, InfluxDB, AdGuard)
- External integrations (Alexa, Google, mobile apps)
- Real-time automation engine
- Database access requirements
- Complex authentication flows

**Migration Effort:** 6-8 hours (extensive testing and monitoring)  
**Migration Window:** Weekend, low-usage period, all dependencies migrated first  
**Traefik Configuration:** HTTP router + service (WebSocket built-in) + extended timeouts  
**Special Testing:**
- WebSocket connections from browsers
- Mobile app connectivity (iOS/Android)
- Lovelace UI rendering and updates
- Automation trigger testing
- Device state updates
- Integration with Zigbee2MQTT
- Integration with Z-Wave JS UI
- Integration with ESPHome
- Alexa voice commands
- Google Assistant integration
- Historical data from InfluxDB
- Persistent notifications
- Script execution
- Scene activation
- Long-running automations
- Recorder database writes

**Monitoring Period:** 24-48 hours after migration  
**Rollback Readiness:** CRITICAL - Must have instant rollback capability

---

## Complexity Distribution

### Summary Statistics

| Complexity | Count | Percentage | Migration Effort (Total) |
|------------|-------|------------|-------------------------|
| Low | 6 | 35% | 6-9 hours |
| Medium | 8 | 47% | 18-26 hours |
| High | 3 | 18% | 14-20 hours |
| **Total** | **17** | **100%** | **38-55 hours** |

### Critical Path Services (Highest Complexity + Criticality)

1. **Home Assistant** - Most complex, highest criticality
2. **Z-Wave JS UI** - High complexity, high criticality
3. **Zigbee2MQTT** - High complexity, high criticality
4. **Proxmox VE (both nodes)** - Medium-high complexity, infrastructure critical

## Special Requirement Analysis

### WebSocket Support (5 Services)

| Service | Criticality | WebSocket Use Case | Testing Priority |
|---------|-------------|-------------------|------------------|
| Pulse (Uptime Kuma) | Low-Medium | Real-time status updates | Low |
| Proxmox VE | Medium-High | noVNC console | High |
| Proxmox VE 2 | Medium-High | noVNC console | High |
| Zigbee2MQTT | **HIGH** | Device control and updates | **CRITICAL** |
| Z-Wave JS UI | **HIGH** | Device control and updates | **CRITICAL** |
| Home Assistant | **HIGHEST** | UI updates, mobile apps, automation | **CRITICAL** |

**Traefik WebSocket Support:** Built-in, automatic upgrade header handling  
**Testing Required:** Extensive testing with critical services before migration

---

### HTTPS Backend Services (4 Services - ALL TO BE REPLACED)

| Service | Current Backend | Action Required | Priority |
|---------|----------------|-----------------|----------|
| Omada Controller | https://192.168.1.47:8043 | **Replace self-signed cert with Let's Encrypt** | Medium |
| Proxmox VE | https://192.168.1.137:8006 | **Replace self-signed cert with Let's Encrypt** | High |
| Proxmox VE 2 | https://192.168.1.125:8006 | **Replace self-signed cert with Let's Encrypt** | High |
| Z-Wave JS UI | https://192.168.1.141:8091 | **Replace self-signed cert with Let's Encrypt** | **CRITICAL** |

**Action Item:** Replace all self-signed certificates with Let's Encrypt BEFORE Phase 2  
**Benefit:** Eliminates need for TLS skip verify, improves security, simplifies Traefik config  
**Impact:** Changes MEDIUM complexity to LOW complexity for these services

---

### Custom Header Requirements (2 Services)

| Service | Headers Required | Purpose | Traefik Implementation |
|---------|------------------|---------|----------------------|
| ESPHome | Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto | Backend application requirement | `headers` middleware |
| NetBox | Remove X-Forwarded-Host | Application URL generation | `headers` middleware (customRequestHeaders) |

---

## Complexity Trends & Patterns

### By Service Category

| Category | Avg Complexity | Highest Risk Service |
|----------|---------------|---------------------|
| Home Automation | **HIGH** | Home Assistant |
| Infrastructure | Medium-High | Proxmox VE |
| Monitoring | Medium | Pulse (WebSocket) |
| Utilities | Low | All low complexity |
| Network Management | Medium | Omada |

### Migration Risk Factors

**Factors Increasing Complexity:**
1. ✅ WebSocket requirement (5 services)
2. ✅ ~~HTTPS backend with self-signed cert (4 services)~~ **WILL BE RESOLVED**
3. ✅ Custom header manipulation (2 services)
4. ✅ High criticality (3 services)
5. ✅ External integrations (Home Assistant)
6. ✅ Real-time requirements (3 services)
7. ✅ Service dependencies (Home Assistant ecosystem)

**Factors Decreasing Complexity:**
1. ✅ Simple HTTP reverse proxy (most services)
2. ✅ Low traffic (most services)
3. ✅ Non-critical services (most services)
4. ✅ **Let's Encrypt cert replacement** (will simplify 4 services)

## Migration Strategy Recommendations

### Based on Complexity Analysis

**Phase 1: Low Complexity Services (Batch 1)**
- Services: 6 low-complexity services
- Purpose: Learn migration process, validate Traefik configuration
- Risk: Very Low
- Rollback: Easy

**Phase 2: Medium Complexity Non-Critical (Batch 2)**
- Services: InfluxDB, AdGuard, Pulse, NetBox
- Purpose: Test WebSocket, custom headers, IP whitelisting
- Risk: Low-Medium
- Rollback: Moderate

**Phase 3: Medium Complexity Infrastructure (Batch 3)**
- Services: ESPHome, Omada, Proxmox, Proxmox2
- Purpose: Test ~~HTTPS backends~~ (post Let's Encrypt replacement), infrastructure services
- **Pre-requisite:** Let's Encrypt certificates installed on all HTTPS backends
- Risk: Medium
- Rollback: Important (infrastructure)

**Phase 4: High Complexity Critical (Batch 5)**
- Services: Zigbee2MQTT, Z-Wave JS UI, Home Assistant
- Purpose: Migrate critical home automation stack
- **Pre-requisite:** 
  - All other services migrated successfully
  - Let's Encrypt certificate installed on Z-Wave JS UI
  - Extensive testing plan prepared
  - Rollback procedure tested
- Risk: HIGH
- Rollback: CRITICAL capability required

## Pre-Migration Action Items

### CRITICAL: Let's Encrypt Certificate Replacement

**Before Phase 2 Begins:**

1. **Omada Controller** (192.168.1.47)
   - Install Let's Encrypt certificate
   - Configure to use standard HTTPS (port 8043 or change to 443)
   - Test HTTPS access without TLS skip verify
   - Validate controller functionality

2. **Proxmox VE Primary** (192.168.1.137)
   - Install Let's Encrypt certificate for proxmox.internal.lakehouse.wtf
   - Configure Proxmox to use new certificate
   - Test HTTPS access without TLS skip verify
   - Test noVNC console functionality

3. **Proxmox VE Secondary** (192.168.1.125)
   - Install Let's Encrypt certificate for proxmox2.internal.lakehouse.wtf
   - Configure Proxmox to use new certificate
   - Test HTTPS access without TLS skip verify
   - Test noVNC console functionality

4. **Z-Wave JS UI** (192.168.1.141)
   - Install Let's Encrypt certificate for zwave-js-ui.internal.lakehouse.wtf
   - Configure Z-Wave JS UI to use new certificate
   - Test HTTPS access without TLS skip verify
   - Test WebSocket functionality
   - Validate Home Assistant integration still works

**Timeline:** Complete before starting Phase 2 (Traefik Deployment)  
**Owner:** TBD  
**Priority:** HIGH - Blocking for migration

---

## Complexity-Based Testing Requirements

### Low Complexity Testing
- [ ] Basic HTTP connectivity
- [ ] TLS termination working
- [ ] No errors in logs
- [ ] 5-minute stability test

### Medium Complexity Testing
- [ ] All Low tests PLUS
- [ ] Middleware functioning (headers, IP whitelist, etc.)
- [ ] Backend protocol handling (~~HTTPS~~ post Let's Encrypt)
- [ ] WebSocket connections (if applicable)
- [ ] 15-minute stability test
- [ ] Basic functionality validation

### High Complexity Testing
- [ ] All Medium tests PLUS
- [ ] Extensive WebSocket testing (connection stability, reconnection)
- [ ] Integration testing with dependent services
- [ ] Mobile app connectivity testing
- [ ] External integration testing (Alexa, etc.)
- [ ] Long-running connection testing (24 hours)
- [ ] Performance validation (no degradation)
- [ ] Automation trigger testing
- [ ] User acceptance testing
- [ ] 48-hour monitoring period

---

## Next Steps

1. ✅ Complexity analysis complete
2. ⏭️ **Document middleware requirements (Task 1.1.4)**
3. ⏭️ **Identify technical blockers (Task 1.1.5)**
4. ⏭️ **Capture performance baselines (Task 1.1.6)**
5. ⏭️ **CREATE ACTION PLAN: Let's Encrypt certificate replacement**
6. ⏭️ **Checkpoint 1: Review findings and plan detailed migrations**

---

**Document Created:** 2025-10-23  
**Created By:** Phase 1.1.3 Discovery Process  
**Status:** Complete  
**Impact:** Let's Encrypt replacement will reduce 4 services from MEDIUM to LOW-MEDIUM complexity  
**Next Document:** MIDDLEWARE-REQUIREMENTS-MATRIX.md

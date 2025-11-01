# Technical Blockers - Traefik Migration

**Document Created**: 2025-10-23
**Phase**: Discovery (Phase 1)
**Status**: Active Discovery

## Executive Summary

This document tracks all technical blockers, constraints, and dependencies discovered during the Traefik migration discovery phase. All blockers have been categorized by severity and include mitigation strategies.

## Blocker Status Overview

| Category | Total | Resolved | Active | Mitigation Planned |
|----------|-------|----------|--------|-------------------|
| Critical | 1     | 1        | 0      | N/A               |
| High     | 0     | 0        | 0      | 0                 |
| Medium   | 3     | 0        | 3      | 3                 |
| Low      | 2     | 0        | 2      | 2                 |
| **TOTAL**| **6** | **1**    | **5**  | **5**             |

---

## CRITICAL BLOCKERS

### ✅ BLOCKER-001: Self-Signed Certificates (RESOLVED)

**Status**: ✅ RESOLVED (2025-10-23)
**Severity**: Critical
**Category**: Security / Configuration

**Description**:
Four backend services were using self-signed certificates requiring TLS verification skip in Caddy:
- Omada Controller (192.168.1.47:8043)
- Proxmox VE Primary (192.168.1.137:8006)
- Proxmox VE Secondary (192.168.1.125:8006)
- Z-Wave JS UI (192.168.1.141:8091)

**Impact**:
- Security risk with TLS skip verify
- Would require complex Traefik middleware configuration
- Increased complexity in service migration

**Resolution**:
All 4 services now use valid Let's Encrypt wildcard certificate (*.internal.lakehouse.wtf):
- Certificate source: Caddy's existing Let's Encrypt certificate
- Expiration: December 6, 2025
- Issuer: Let's Encrypt (E7)
- SSL Verification: All services pass with "Verify return code: 0 (ok)"

**Implementation Details**:
- **Proxmox servers**: Installed to `/etc/pve/local/pveproxy-ssl.{pem,key}`, restarted pveproxy service
- **Z-Wave JS UI**: Installed to `/opt/zwave_store/{cert,key}.pem`, restarted zwave-js-ui service
- **Omada Controller**: Converted PEM to Java keystore, updated `/opt/tplink/EAPController/data/keystore/eap.keystore`, restarted tpeap service

**Verification**: All services tested with openssl s_client and confirmed valid SSL/TLS

---

## MEDIUM SEVERITY BLOCKERS

### BLOCKER-002: WebSocket Support Requirements

**Status**: 🔄 ACTIVE - Mitigation Identified
**Severity**: Medium
**Category**: Protocol Support

**Description**:
Five services require WebSocket support for proper functionality:
1. Home Assistant (homeassistant.internal.lakehouse.wtf) - Critical for real-time updates
2. Zigbee2MQTT (z2m.internal.lakehouse.wtf) - Required for device communication
3. Z-Wave JS UI (zwave-js-ui.internal.lakehouse.wtf) - Control panel real-time updates
4. Pulse (pulse.internal.lakehouse.wtf) - Live data streaming
5. Proxmox VE (proxmox/proxmox2.internal.lakehouse.wtf) - Console access

**Impact**:
- Services will not function correctly without WebSocket support
- User experience degradation (no real-time updates)
- Potential service failures

**Mitigation**:
✅ **NO ACTION REQUIRED** - Traefik has built-in WebSocket support:
- Traefik automatically detects `Upgrade: websocket` header
- No special middleware configuration needed
- Enabled by default in all Traefik versions

**Action Items**:
- [ ] Document WebSocket testing procedure for Phase 2
- [ ] Add WebSocket verification to migration checklist

**Priority**: Medium (resolved by Traefik default behavior)

---

### BLOCKER-003: Custom Header Requirements

**Status**: 🔄 ACTIVE - Mitigation Implemented
**Severity**: Medium
**Category**: HTTP Headers

**Description**:
Two services require custom header configurations:

**ESPHome (esphome.internal.lakehouse.wtf)**:
- Requires upstream host forwarding
- Needs real IP preservation
- Custom forwarding headers for WebSocket support

**NetBox (netbox.internal.lakehouse.wtf)**:
- Requires X-Forwarded-Host header removal
- Prevents header injection issues

**Current Caddy Configuration**:
```caddyfile
# ESPHome
@esphome host esphome.internal.lakehouse.wtf
handle @esphome {
    reverse_proxy 192.168.1.169:6052 {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}

# NetBox
@netbox host netbox.internal.lakehouse.wtf
handle @netbox {
    reverse_proxy 192.168.1.138 {
        header_up -X-Forwarded-Host
    }
}
```

**Impact**:
- ESPHome may not work without proper headers
- NetBox may have security/routing issues

**Mitigation**:
✅ **Middleware Configuration Created** - `infrastructure/traefik/config/dynamic/middlewares.yml`:

```yaml
esphome-headers:
  headers:
    customRequestHeaders:
      X-Real-IP: ""  # Traefik adds automatically
      X-Forwarded-For: ""  # Traefik adds automatically
      X-Forwarded-Proto: ""  # Traefik adds automatically

netbox-headers:
  headers:
    customRequestHeaders:
      X-Forwarded-Host: ""  # Remove this header
```

**Action Items**:
- [ ] Test ESPHome functionality after migration
- [ ] Verify NetBox routing works correctly
- [ ] Document any edge cases discovered

**Priority**: Medium (solution ready, testing required)

---

### BLOCKER-004: Service Downtime During Migration

**Status**: 🔄 ACTIVE - Mitigation Planned
**Severity**: Medium
**Category**: Availability

**Description**:
Migration from Caddy to Traefik will require service cutover, potentially causing downtime for critical services (Home Assistant, Zigbee2MQTT, Z-Wave JS UI).

**Impact**:
- Brief service interruptions during DNS/routing changes
- Potential smart home automation failures
- User-facing downtime

**Mitigation Strategy**:
1. **Parallel Operation**:
   - Run Traefik on port 8080 alongside Caddy (port 80/443)
   - Test all services through Traefik before cutover
   - Validate functionality before switching DNS

2. **Batch Migration Approach**:
   - Batch 1: Low-risk services (Pairdrop, WatchYourLAN, MySpeed, BirdNET, Wiki.js, Caddy Admin)
   - Batch 5: Critical services last (Home Assistant, Zigbee2MQTT, Z-Wave JS UI)
   - Allow rollback between batches

3. **Rapid Rollback Plan**:
   - Keep Caddy service ready to restart
   - Document exact rollback steps
   - Test rollback procedure in advance

**Action Items**:
- [ ] Create detailed cutover procedure (Phase 2)
- [ ] Document rollback steps with exact commands
- [ ] Test parallel operation in Phase 2
- [ ] Schedule migration during low-usage window

**Priority**: Medium (critical planning required)

---

## LOW SEVERITY BLOCKERS

### BLOCKER-005: Certificate Auto-Renewal

**Status**: 🔄 ACTIVE - Monitoring Required
**Severity**: Low
**Category**: Certificate Management

**Description**:
The Let's Encrypt wildcard certificate (*.internal.lakehouse.wtf) currently managed by Caddy expires on **December 6, 2025**. After Caddy decommissioning, certificate renewal mechanism must be transferred.

**Current State**:
- Certificate source: Caddy automatic ACME renewal
- Location: `/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/wildcard_.internal.lakehouse.wtf/`
- Renewal: Automatic via Caddy

**Impact**:
- Certificate expiration would break all 4 HTTPS backend services
- Manual renewal process error-prone
- Potential outage if not addressed

**Mitigation Options**:

**Option 1: Traefik Certificate Management (RECOMMENDED)**
```yaml
# infrastructure/traefik/config/traefik.yml
certificatesResolvers:
  cloudflare:
    acme:
      email: admin@lakehouse.wtf
      storage: /etc/traefik/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

**Option 2: Standalone Certbot + Cron**
- Install certbot with Cloudflare DNS plugin
- Configure cron job for renewal
- Script to deploy certificates to services

**Option 3: Keep Caddy Running for ACME Only**
- Minimal Caddy config for certificate generation only
- Export certificates for other services
- Retain Cloudflare API token configuration

**Action Items**:
- [ ] Decision: Select certificate management approach (Checkpoint 1)
- [ ] Implement chosen solution in Phase 2
- [ ] Test certificate renewal before Caddy decommission
- [ ] Document renewal process
- [ ] Set up monitoring/alerts for certificate expiration

**Priority**: Low (not blocking migration, but must be addressed by December 2025)

---

### BLOCKER-006: Monitoring and Observability Gap

**Status**: 🔄 ACTIVE - Implementation Pending
**Severity**: Low
**Category**: Monitoring

**Description**:
Currently no metrics collection or monitoring for reverse proxy layer. Traefik migration presents opportunity to implement comprehensive monitoring.

**Current State**:
- Caddy: No metrics collection configured
- No alerting on proxy failures
- No visibility into request patterns or errors

**Impact**:
- Difficult to diagnose issues
- No proactive problem detection
- Performance optimization limited

**Mitigation Plan**:
Phase 1 includes monitoring setup tasks:
- Task 1.3.1: Research Traefik Metrics (Prometheus integration)
- Task 1.3.2: Create Prometheus Configuration
- Task 1.3.3: Select/Create Grafana Dashboard

**Traefik Metrics Capabilities**:
- Built-in Prometheus exporter
- Metrics include: request rate, error rate, latency, active connections
- Per-service and per-router granularity

**Action Items**:
- [ ] Research Traefik metrics (Task 1.3.1)
- [ ] Configure Prometheus scraping (Task 1.3.2)
- [ ] Deploy Grafana dashboard (Task 1.3.3)
- [ ] Set up alerting rules for critical services
- [ ] Document monitoring access and procedures

**Priority**: Low (nice-to-have, not blocking migration)

---

## Dependencies and Constraints

### External Dependencies

1. **Cloudflare DNS**:
   - Required for: DNS-01 ACME challenges
   - API Token: Available (from Caddy configuration)
   - Zone ID: b5c9bffbdfd71858018cf0c1f5251d04
   - Domain: lakehouse.wtf

2. **Let's Encrypt**:
   - Certificate authority for SSL/TLS
   - Rate limits: 50 certificates per week per domain
   - Current certificate valid until 2025-12-06

3. **Proxmox Cluster**:
   - Primary: 192.168.1.137 (proxmox)
   - Secondary: 192.168.1.125 (proxmox2)
   - Traefik will run on LXC 110 on primary node

### Infrastructure Constraints

1. **LXC Container 110**:
   - Host: Proxmox primary (192.168.1.137)
   - Not yet created
   - Will host Traefik + Docker

2. **Network Configuration**:
   - All services on 192.168.1.0/24 network
   - Internal DNS: *.internal.lakehouse.wtf
   - External access via Cloudflare Tunnel (future)

3. **Port Allocations**:
   - Port 80/443: Currently used by Caddy
   - Port 8080: Available for Traefik during parallel operation
   - Final state: Traefik on 80/443, Caddy decommissioned

---

## Blocker Timeline

### Resolved
- ✅ **2025-10-23**: BLOCKER-001 (Self-Signed Certificates) - All services using Let's Encrypt

### Active - Phase 1
- 🔄 BLOCKER-002 (WebSocket) - Mitigation identified, testing in Phase 2
- 🔄 BLOCKER-003 (Custom Headers) - Middleware ready, testing in Phase 2
- 🔄 BLOCKER-004 (Downtime) - Migration strategy defined, execution in Phase 2

### Active - Future Phases
- 🔄 BLOCKER-005 (Certificate Renewal) - Decision at Checkpoint 1, implementation in Phase 2
- 🔄 BLOCKER-006 (Monitoring) - Implementation in Phase 1 (Tasks 1.3.1-1.3.3)

---

## Risk Assessment

### Migration Risk Level: **MEDIUM**

**Factors Increasing Risk**:
- 17 services to migrate
- 3 critical smart home services (Home Assistant, Zigbee2MQTT, Z-Wave JS UI)
- WebSocket dependencies
- Custom header requirements

**Factors Reducing Risk**:
- ✅ Self-signed certificate blocker resolved
- ✅ Traefik has native WebSocket support
- ✅ Middleware configurations prepared
- ✅ Parallel operation strategy defined
- ✅ Batch migration approach minimizes blast radius

### Recommended Mitigation Actions

**Before Checkpoint 1**:
1. ✅ Complete Phase 1 discovery tasks
2. Create detailed service-specific migration plans
3. Document rollback procedures
4. Test Traefik configuration in LXC 110

**Before Phase 2**:
1. Decide certificate management approach
2. Validate middleware configurations
3. Test parallel operation
4. Confirm monitoring setup

**Before Phase 3**:
1. Complete Batch 1-4 migrations
2. Validate all non-critical services
3. Prepare detailed cutover plan for critical services

---

## Document Maintenance

**Last Updated**: 2025-10-23
**Next Review**: Checkpoint 1 (after Phase 1 complete)
**Owner**: Migration Team

**Change Log**:
- 2025-10-23: Initial document created
- 2025-10-23: BLOCKER-001 resolved (Let's Encrypt certificates installed)

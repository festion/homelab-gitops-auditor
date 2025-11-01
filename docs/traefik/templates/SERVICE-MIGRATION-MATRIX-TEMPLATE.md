# Service Migration Matrix

**Last Updated:** [Date]  
**Status:** [Discovery/Planning/In Progress/Complete]  
**Total Services:** [Number]

## Overview

This matrix provides a comprehensive view of all services being migrated from Caddy to Traefik, including complexity ratings, migration batches, and special requirements.

## Migration Batch Definitions

| Batch | Risk Level | Description | Migration Window |
|-------|------------|-------------|------------------|
| 1 | Low | Non-critical, simple configurations | Business hours |
| 2 | Low-Medium | Monitoring and logging services | Business hours |
| 3 | Medium | Development and support services | Off-hours recommended |
| 4 | Medium-High | Infrastructure services | Off-hours required |
| 5 | High | Critical production services | Dedicated window required |

## Complexity Rating Guide

| Rating | Description | Indicators |
|--------|-------------|------------|
| **Low** | Simple HTTP proxy | Single backend, no middleware, standard TLS |
| **Medium** | Standard configuration | Multiple backends OR custom headers OR basic auth |
| **High** | Complex requirements | WebSockets, SSE, custom middleware, complex auth, path rewriting |

## Service Inventory Matrix

| Service Name | Current Host | Backend | Config Complexity | Middleware Needs | Migration Batch | Risk Level | Special Considerations | Owner | Status |
|--------------|--------------|---------|-------------------|------------------|-----------------|------------|----------------------|-------|--------|
| **Critical Services** |
| Home Assistant | hass.internal.lakehouse.wtf | 192.168.1.x:8123 | High | IP whitelist, WebSocket, headers | 5 | High | WebSocket support, long-lived connections, integrations | [Name] | Pending |
| AdGuard Home | adguard.internal.lakehouse.wtf | 192.168.1.x:3000 | Medium | IP whitelist, headers | 4 | Medium-High | DNS infrastructure dependency | [Name] | Pending |
| **Infrastructure Services** |
| Prometheus | prometheus.internal.lakehouse.wtf | 192.168.1.x:9090 | Medium | IP whitelist, headers | 2 | Low-Medium | Metrics collection | [Name] | Pending |
| Grafana | grafana.internal.lakehouse.wtf | 192.168.1.x:3001 | Medium | Headers, auth | 2 | Low-Medium | Dashboard access | [Name] | Pending |
| **Development Services** |
| GitOps Dashboard | gitops.internal.lakehouse.wtf | 192.168.1.x:8080 | Low | IP whitelist | 3 | Low | Development only | [Name] | Pending |
| **Support Services** |
| Pairdrop | pairdrop.internal.lakehouse.wtf | 192.168.1.x:3002 | Low | None | 1 | Low | File sharing | [Name] | Pending |
| WatchYourLAN | watchyourlan.internal.lakehouse.wtf | 192.168.1.x:8840 | Low | IP whitelist | 1 | Low | Network monitoring | [Name] | Pending |
| **Other Services** |
| [Service Name] | [Hostname] | [Backend] | [Low/Med/High] | [List] | [1-5] | [Low/Med/High] | [Notes] | [Name] | Pending |

## Detailed Service Profiles

### Template for High-Complexity Services

#### Service: [Service Name]

**Basic Information:**
- Current hostname: `[hostname]`
- Backend: `[IP:PORT]`
- Service type: [Web app/API/WebSocket/Other]
- Business criticality: [Critical/High/Medium/Low]

**Current Caddy Configuration:**
```caddyfile
[Paste relevant Caddy config]
```

**Complexity Analysis:**
- Config complexity: [Low/Medium/High]
- Middleware requirements:
  - [ ] IP whitelisting
  - [ ] Custom headers
  - [ ] Authentication (type: ___)
  - [ ] Rate limiting
  - [ ] CORS
  - [ ] Path rewriting
  - [ ] WebSocket support
  - [ ] SSE support
  - [ ] Other: ___

**Special Requirements:**
- Protocol support: [HTTP/HTTPS/WebSocket/gRPC/Other]
- Long-lived connections: [Yes/No]
- File uploads: [Yes/No, max size: ___]
- Custom headers required: [List]
- Backend health check: [Endpoint: ___, Interval: ___]

**Dependencies:**
- Upstream services: [List]
- Downstream services: [List]
- External integrations: [List]
- DNS dependencies: [List]

**Migration Details:**
- Migration batch: [1-5]
- Risk level: [Low/Medium/High]
- Estimated complexity: [Hours to configure and test]
- Recommended migration window: [Business hours/Off-hours/Weekend/Specific time]
- Acceptable downtime: [0/5min/15min/30min/N/A]

**Testing Requirements:**
- [ ] Backend connectivity test
- [ ] SSL/TLS validation
- [ ] Authentication test
- [ ] Load/performance test
- [ ] Integration test with [dependent service]
- [ ] User acceptance test
- [ ] Monitoring validation
- [ ] Other: ___

**Rollback Plan:**
- Rollback trigger: [Specific conditions]
- Rollback procedure: [Steps]
- Rollback time estimate: [< X minutes]
- Validation after rollback: [Steps]

**Migration Plan Reference:**
- Detailed plan: [Link to docs/traefik/migrations/[service].md]
- Owner: [Name]
- Status: [Not Started/Planning/Ready/In Progress/Complete]

**Notes:**
[Any additional information]

---

## Migration Statistics

**By Batch:**
- Batch 1 (Low risk): ___ services
- Batch 2 (Low-Medium risk): ___ services
- Batch 3 (Medium risk): ___ services
- Batch 4 (Medium-High risk): ___ services
- Batch 5 (High risk): ___ services

**By Complexity:**
- Low complexity: ___ services
- Medium complexity: ___ services
- High complexity: ___ services

**By Status:**
- Not Started: ___ services
- Planning: ___ services
- Ready: ___ services
- In Progress: ___ services
- Complete: ___ services
- Failed/Blocked: ___ services

## Middleware Usage Summary

| Middleware | Services Using | Complexity | Priority |
|------------|----------------|------------|----------|
| IP Whitelisting | ___ | Low | High |
| Secure Headers | ___ | Low | High |
| Basic Auth | ___ | Low | Medium |
| OAuth/OIDC | ___ | High | Medium |
| Rate Limiting | ___ | Medium | Medium |
| CORS | ___ | Low | Low |
| WebSocket | ___ | Medium | High |
| Path Rewriting | ___ | Medium | Low |

## Migration Schedule

### Phase 4.2: Service-by-Service Migration

**Batch 1: Low Risk Services**
- Start: [Date/Time]
- Services: [List from matrix]
- Expected duration: [Hours/Days]
- Status: [Not Started/In Progress/Complete]

**Batch 2: Monitoring Services**
- Start: [Date/Time]
- Services: [List from matrix]
- Expected duration: [Hours/Days]
- Status: [Not Started/In Progress/Complete]

**Batch 3: Development Services**
- Start: [Date/Time]
- Services: [List from matrix]
- Expected duration: [Hours/Days]
- Status: [Not Started/In Progress/Complete]

**Batch 4: Infrastructure Services**
- Start: [Date/Time]
- Services: [List from matrix]
- Expected duration: [Hours/Days]
- Status: [Not Started/In Progress/Complete]

**Batch 5: Critical Services**
- Start: [Date/Time]
- Services: [List from matrix]
- Expected duration: [Hours/Days]
- Status: [Not Started/In Progress/Complete]

## Issues & Blockers

| Service | Issue | Impact | Resolution | Owner | Status |
|---------|-------|--------|------------|-------|--------|
| [Service] | [Description] | [High/Med/Low] | [Plan] | [Name] | [Open/In Progress/Resolved] |

## Lessons Learned

| Date | Service | Lesson | Action Taken |
|------|---------|--------|--------------|
| [Date] | [Service] | [What we learned] | [How we adjusted] |

---

**Matrix maintained by:** [Name]  
**Review frequency:** [Daily/Weekly during migration]  
**Last review:** [Date]

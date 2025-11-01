# Caddy → Traefik Migration with Cloudflare Tunnel Integration

**Status:** Planning  
**Last Updated:** 2025-10-23  
**Project:** homelab-gitops-auditor integration

## Overview

Migrate from Caddy to Traefik as the reverse proxy solution while implementing Cloudflare Tunnel for Zero Trust access to internal services. This work will be integrated into the homelab-gitops-auditor project to maintain GitOps principles and infrastructure-as-code.

**Key Objectives:**
- Zero-downtime migration from Caddy to Traefik
- Implement Cloudflare Tunnel for secure external access
- Maintain GitOps workflow and configuration management
- Enhance monitoring and observability
- Improve service onboarding process

## Planning Process Structure

This migration uses a **checkpoint-based planning approach** rather than rigid time estimates:

```
Phase 0: Initial Planning (COMPLETE)
  └─> Overall strategy, structure, success criteria defined

Phase 1: Discovery & Assessment (CURRENT)
  ├─> Execute discovery tasks
  └─> Deliverables feed into Checkpoint 1

📋 CHECKPOINT 1: Discovery Review & Detailed Planning
  ├─> Review service inventory findings
  ├─> Create service-specific migration plans
  ├─> Validate/adjust Phase 2-5 plans
  ├─> Identify blockers and plan mitigation
  └─> GO/NO-GO decision for proceeding

Phase 2-5: Execution Phases
  └─> Detailed plans refined after Checkpoint 1

📋 CHECKPOINT 2: Pre-Migration Validation
📋 CHECKPOINT 3: Mid-Migration Review (optional)
```

**Key Principle:** Don't proceed past Discovery until all unknowns are resolved and service-specific plans exist for complex migrations.

## Project Integration Points

### Directory Structure in homelab-gitops-auditor

```
homelab-gitops-auditor/
├── infrastructure/
│   ├── traefik/
│   │   ├── config/
│   │   │   ├── traefik.yml              # Static configuration
│   │   │   ├── dynamic/                 # Dynamic config directory
│   │   │   │   ├── middlewares.yml      # Auth, rate limiting, etc.
│   │   │   │   └── routes/              # Service route definitions
│   │   │   └── tls/                     # Certificate storage
│   │   ├── lxc-setup.sh                 # LXC container creation script
│   │   ├── docker-compose.yml           # Traefik + Cloudflared
│   │   └── README.md                    # Traefik-specific documentation
│   ├── cloudflare/
│   │   ├── tunnel-config.yml            # Cloudflare Tunnel configuration
│   │   ├── setup-tunnel.sh              # Initial tunnel setup
│   │   └── service-mappings.yml         # Service → tunnel mappings
│   └── monitoring/
│       ├── prometheus-traefik.yml       # Traefik metrics scrape config
│       ├── grafana-dashboard.json       # Traefik monitoring dashboard
│       └── alerts.yml                   # Alert rules
├── scripts/
│   ├── migrate-caddy-to-traefik.sh     # Migration automation
│   ├── validate-traefik-config.sh      # Pre-deployment validation
│   └── rollback-to-caddy.sh            # Emergency rollback
└── docs/traefik/
    ├── MIGRATION-PLAN.md                # This document
    ├── CLOUDFLARE-TUNNEL-SETUP.md       # Tunnel setup guide
    ├── DISCOVERY-PHASE.md               # Phase 1 execution plan
    ├── migrations/                      # Service-specific migration plans
    ├── templates/                       # Reusable templates
    └── checkpoints/                     # Checkpoint planning sessions
```

## Phase 1: Preparation & Discovery

**Goal:** Understand current state, set up infrastructure, prepare for detailed planning.

**Expected Duration:** Process-driven, not time-bound  
**Milestone:** All discovery deliverables complete → Triggers Checkpoint 1

### 1.1 Current State Assessment

**Objective:** Complete inventory and analysis of existing Caddy setup.

**Tasks:**
- Document all Caddy configuration and routes
- Inventory all services currently behind Caddy
- Map service hostnames to backend services (IP:PORT)
- Document current TLS/SSL certificate setup (Let's Encrypt, internal CA)
- Identify middleware requirements (auth, rate limiting, headers, IP whitelisting)
- Analyze special configurations (WebSockets, SSE, long-lived connections)
- Extract performance baselines from current setup
- Document dependencies between services
- Identify critical vs. non-critical services

**Deliverables:**
1. `docs/traefik/CURRENT-CADDY-INVENTORY.md` - Complete service mapping
2. `config/caddy-export.json` - Exported Caddy configuration
3. `docs/traefik/SERVICE-COMPLEXITY-ANALYSIS.md` - Service complexity ratings
4. `docs/traefik/MIDDLEWARE-REQUIREMENTS-MATRIX.md` - Middleware mapping
5. `docs/traefik/DISCOVERED-BLOCKERS.md` - Technical blockers and concerns
6. `scripts/caddy-to-traefik-mapper.sh` - Automated config translation script

**Success Criteria:**
- ✅ Every service documented with backend details
- ✅ Every middleware requirement identified
- ✅ Special cases flagged for detailed planning
- ✅ Performance baseline captured
- ✅ No unknown services or configurations

### 1.2 Traefik LXC Container Setup

**Objective:** Prepare infrastructure for Traefik deployment.

**Infrastructure Specifications:**
- **Container ID:** 110 (nginx-proxy-manager is 105)
- **OS:** Debian 12 (bookworm)
- **Resources:** 2 CPU cores, 2GB RAM, 8GB storage
- **Network:** Same network as other infrastructure services (vmbr0)
- **Hostname:** traefik.internal.lakehouse.wtf
- **Additional:** Docker support enabled

**Installation Steps:**
```bash
# Create LXC container
pct create 110 local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst \
  --hostname traefik \
  --cores 2 --memory 2048 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --storage local-lvm --rootfs 8

# Install Docker in LXC
bash infrastructure/traefik/lxc-setup.sh
```

**Deliverables:**
1. `infrastructure/traefik/lxc-setup.sh` - Automated LXC setup script
2. Container 110 operational with Docker installed
3. Network connectivity validated
4. Resource monitoring configured

**Success Criteria:**
- ✅ Container created and running
- ✅ Docker operational
- ✅ Network accessible from internal network
- ✅ Resources properly allocated
- ✅ Documented in infrastructure inventory

### 1.3 Monitoring Integration Preparation

**Objective:** Prepare monitoring infrastructure for Traefik.

**Tasks:**
- Research Traefik metrics endpoints and formats
- Design Prometheus scrape job configuration
- Identify/select Grafana dashboard for Traefik
- Define alerting rules (service down, high latency, cert expiry, error rates)
- Plan integration with existing monitoring stack
- Define baseline metrics to track

**Deliverables:**
1. `infrastructure/monitoring/prometheus-traefik.yml` - Scrape configuration
2. `infrastructure/monitoring/grafana-dashboard.json` - Dashboard config
3. `infrastructure/monitoring/alerts.yml` - Alert rules
4. `docs/traefik/MONITORING-INTEGRATION.md` - Integration guide

**Success Criteria:**
- ✅ Monitoring configuration ready for deployment
- ✅ Alert rules defined and validated
- ✅ Dashboard tested with mock data
- ✅ Integration plan documented

---

## Checkpoint 1: Discovery Review & Detailed Planning

**Trigger:** Phase 1 deliverables complete  
**Participants:** Project owner, infrastructure team  
**Duration:** 2-4 hours

### Checkpoint 1 Objectives

1. **Review Discovery Findings**
   - Present complete service inventory
   - Review complexity analysis
   - Discuss discovered blockers
   - Validate middleware requirements

2. **Create Service-Specific Migration Plans**
   - For each high-risk/complex service, create detailed migration plan
   - Define testing procedures
   - Identify migration windows
   - Plan rollback procedures

3. **Validate/Adjust Phases 2-5**
   - Confirm Traefik can handle all use cases
   - Adjust parallel operation strategy
   - Refine migration batches based on dependencies
   - Update timeline estimates (if needed)

4. **GO/NO-GO Decisions**
   - Is Traefik suitable for all discovered use cases?
   - Can we achieve zero-downtime migration?
   - Are Cloudflare Tunnel limitations acceptable?
   - Proceed with phased migration or big-bang cutover?
   - Which services require dedicated migration windows?

### Checkpoint 1 Deliverables

See [Checkpoint 1 Template](checkpoints/CHECKPOINT-1-TEMPLATE.md) for detailed format.

1. **Enhanced Service Migration Matrix** (`docs/traefik/SERVICE-MIGRATION-MATRIX.md`)
2. **Service-Specific Migration Plans** (`docs/traefik/migrations/*.md`)
3. **Updated Phase 2-5 Plans** (this document, updated)
4. **Risk Register Update** (`docs/traefik/RISK-REGISTER.md`)
5. **Decision Log** (`docs/traefik/checkpoints/checkpoint-1-decisions.md`)

### Checkpoint 1 Exit Criteria

- ✅ All services have migration complexity rating
- ✅ High-risk services have detailed migration plans
- ✅ All blockers have mitigation plans
- ✅ Phase 2-5 plans validated and adjusted
- ✅ GO decision made to proceed
- ✅ Team aligned on approach

**⚠️ DO NOT PROCEED TO PHASE 2 UNTIL ALL EXIT CRITERIA MET**

---

## Phase 2: Traefik Deployment

**Status:** Detailed planning pending Checkpoint 1 completion

**Goal:** Deploy and validate Traefik in parallel with Caddy.

### 2.1 Base Traefik Configuration

**Static Configuration** (`infrastructure/traefik/config/traefik.yml`):

```yaml
# Entrypoints
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
    http:
      tls: {}
  metrics:
    address: ":8082"

# API & Dashboard
api:
  dashboard: true
  insecure: false  # Dashboard behind auth

# Providers
providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true

# Metrics for Prometheus
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true

# Logging
log:
  level: INFO
  filePath: /var/log/traefik/traefik.log

accessLog:
  filePath: /var/log/traefik/access.log
  fields:
    defaultMode: keep
    headers:
      defaultMode: keep
```

**Docker Compose** (`infrastructure/traefik/docker-compose.yml`):

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8082:8082"  # Metrics
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/etc/traefik:ro
      - ./logs:/var/log/traefik
      - ./tls:/tls
    environment:
      - CF_API_EMAIL=${CF_API_EMAIL}
      - CF_API_KEY=${CF_API_KEY}
    networks:
      - proxy

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CF_TUNNEL_TOKEN}
    networks:
      - proxy

networks:
  proxy:
    name: traefik_proxy
    external: true
```

**Deliverables:**
- Complete Traefik configuration files
- Docker Compose deployment
- Traefik operational in test mode
- Health checks validated

### 2.2 Service Migration Templates

**Dynamic Configuration Template** (`infrastructure/traefik/config/dynamic/routes/template.yml`):

```yaml
http:
  routers:
    SERVICE_NAME:
      rule: "Host(`SERVICE_NAME.internal.lakehouse.wtf`)"
      entryPoints:
        - websecure
      service: SERVICE_NAME
      middlewares:
        - internal-whitelist
        - secure-headers
      tls: {}

  services:
    SERVICE_NAME:
      loadBalancer:
        servers:
          - url: "http://BACKEND_IP:PORT"

  middlewares:
    internal-whitelist:
      ipWhiteList:
        sourceRange:
          - "192.168.1.0/24"
    
    secure-headers:
      headers:
        sslRedirect: true
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
```

**Tasks:**
- Create route configurations for each service
- Set up middleware for common requirements
- Configure TLS certificates (Let's Encrypt or internal CA)
- Implement health checks

**Deliverables:**
- Service route configurations in `infrastructure/traefik/config/dynamic/routes/`
- Middleware configurations
- Migration script to auto-generate configs from Caddy

---

## Phase 3: Cloudflare Tunnel Setup

**Status:** Detailed planning pending Checkpoint 1 completion

### 3.1 Tunnel Creation

**Tasks:**
- Create Cloudflare Tunnel via dashboard or CLI
- Generate tunnel credentials
- Configure tunnel for lakehouse.wtf domain
- Set up Zero Trust policies

**Commands:**
```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create homelab-lakehouse

# Get tunnel token for docker-compose
cloudflared tunnel token homelab-lakehouse
```

**Deliverables:**
- Cloudflare Tunnel operational
- Tunnel credentials securely stored
- `infrastructure/cloudflare/tunnel-config.yml`

### 3.2 Zero Trust Access Policies

**Configuration:**
- Access Application for internal services
- Service Auth for service-to-service communication
- Identity Provider integration (email, GitHub, etc.)
- Access Policies based on email domain or specific users

**Example Services:**
- Home Assistant: `hass.lakehouse.wtf` → `http://traefik/hass`
- GitOps Dashboard: `gitops.lakehouse.wtf` → `http://traefik/gitops`
- Grafana: `grafana.lakehouse.wtf` → `http://traefik/grafana`

**Deliverables:**
- Zero Trust policies configured
- Access applications created for key services
- Documentation of access flow

### 3.3 DNS Configuration

**Tasks:**
- Create CNAME records for public services: `*.lakehouse.wtf` → `TUNNEL_ID.cfargotunnel.com`
- Maintain internal DNS records in AdGuard for `*.internal.lakehouse.wtf`
- Integrate with existing AdGuard DNS rewrite automation

**Deliverables:**
- DNS records configured
- Updated AdGuard integration script
- Documentation in `docs/traefik/DNS-ARCHITECTURE.md`

---

## Phase 4: Migration Execution

**Status:** Detailed planning pending Checkpoint 1 completion

### 4.1 Parallel Operation

**Strategy:**
- Run Traefik alongside Caddy on different ports initially
- Test each service migration before switching DNS
- Maintain Caddy as fallback during migration

**Port Allocation:**
- **Caddy:** Keeps 80/443 during migration
- **Traefik:** Use 8080/8443 for testing
- **Swap:** After validation, swap port assignments

**Tasks:**
- Deploy Traefik on alternate ports
- Configure test routes for critical services
- Validate service accessibility through Traefik
- Test Cloudflare Tunnel connectivity

**Deliverables:**
- Parallel operation successful
- All services accessible via both proxies
- Test results documented

### 4.2 Service-by-Service Migration

**Migration Order (lowest to highest risk):**
1. Non-critical services (Pairdrop, WatchYourLAN)
2. Monitoring services (Grafana, Prometheus)
3. Development services (GitOps Dashboard)
4. Infrastructure services (AdGuard Home)
5. Home automation (Home Assistant, Zigbee2MQTT) - **LAST**

**Per-Service Checklist:**
- [ ] Create Traefik route configuration
- [ ] Test backend connectivity
- [ ] Validate SSL/TLS
- [ ] Check authentication/middleware
- [ ] Monitor metrics and logs
- [ ] Update DNS if using Cloudflare Tunnel
- [ ] Mark Caddy route for deprecation
- [ ] Document lessons learned

**Deliverables:**
- All services migrated to Traefik
- Migration log with timestamps and issues
- Performance comparison report

### 4.3 Cutover & Decommission

**Tasks:**
- Swap Traefik to ports 80/443
- Move Caddy to alternate ports (or stop)
- Monitor for 48 hours
- Remove Caddy configuration if successful
- Update documentation

**Rollback Criteria:**
- Any critical service unavailable > 5 minutes
- Performance degradation > 30%
- TLS/Certificate issues
- Authentication failures

**Deliverables:**
- Caddy fully decommissioned or archived
- Traefik production-ready on 80/443
- Rollback script tested and documented

---

## Phase 5: Optimization & Documentation

**Status:** Detailed planning pending Checkpoint 1 completion

### 5.1 Performance Tuning

**Tasks:**
- Optimize Traefik resource limits
- Tune connection pooling and timeouts
- Implement caching where appropriate
- Configure rate limiting for public services
- Review and optimize middleware chains

**Metrics to Track:**
- Request latency (p50, p95, p99)
- Requests per second
- Error rates
- Certificate renewal status
- Backend health check status

**Deliverables:**
- Tuned configuration
- Baseline performance metrics
- Optimization recommendations

### 5.2 GitOps Integration

**Tasks:**
- Add Traefik config validation to CI/CD
- Create GitOps Auditor template for Traefik services
- Implement automated configuration deployment
- Set up configuration drift detection

**Integration Points:**
- Audit scripts check Traefik config validity
- Template engine standardizes service routes
- Automated deployment via GitOps Auditor

**Deliverables:**
- GitOps workflow for Traefik config changes
- CI/CD validation pipeline
- Template library for common service patterns

### 5.3 Documentation

**Documentation Deliverables:**
1. `TRAEFIK-MIGRATION.md` - Complete migration guide
2. `CLOUDFLARE-TUNNEL-SETUP.md` - Tunnel configuration guide
3. `TRAEFIK-OPERATIONS.md` - Day-to-day operations guide
4. `SERVICE-ONBOARDING.md` - How to add new services
5. `TROUBLESHOOTING.md` - Common issues and solutions
6. `ARCHITECTURE.md` - Updated architecture diagrams

**Include:**
- Configuration examples
- Common middleware patterns
- Monitoring and alerting guides
- Emergency procedures
- Performance baselines

---

## Risk Management

### Identified Risks

| Risk ID | Description | Impact | Likelihood | Mitigation | Status |
|---------|-------------|--------|------------|------------|--------|
| R-001 | Service downtime during migration | High | Medium | Parallel operation, phased migration | Planned |
| R-002 | Certificate renewal issues | High | Low | Test thoroughly in staging, monitor expiry | Planned |
| R-003 | Performance degradation | Medium | Medium | Monitor metrics, rollback ready | Planned |
| R-004 | DNS propagation delays | Low | Medium | Use low TTLs during migration | Planned |
| R-005 | Cloudflare Tunnel connectivity | Medium | Low | Test failover scenarios | Planned |
| R-006 | Configuration complexity | Medium | High | Use templates, automation scripts | Planned |

**Note:** Risk register will be updated during Checkpoint 1 with discovered risks.

### Rollback Plan

**Rollback Triggers:**
- Any critical service unavailable > 5 minutes
- Performance degradation > 30%
- TLS/Certificate issues
- Authentication failures
- Multiple service failures

**Rollback Procedure:**
1. Execute `scripts/rollback-to-caddy.sh`
2. Swap ports (Caddy → 80/443, Traefik → 8080/8443)
3. Update DNS records to point to Caddy
4. Notify stakeholders
5. Document rollback reason
6. Plan remediation

**Rollback Preparation:**
- Keep Caddy configuration intact for 30 days
- Document rollback procedures
- Test rollback in non-production environment
- Maintain automated rollback script: `scripts/rollback-to-caddy.sh`

---

## Success Criteria

**Migration Success:**
- ✅ All services accessible via Traefik
- ✅ SSL/TLS working for all endpoints
- ✅ Cloudflare Tunnel providing Zero Trust access
- ✅ Metrics integrated with Prometheus/Grafana
- ✅ No degradation in service performance
- ✅ Zero unplanned downtime
- ✅ Complete documentation
- ✅ GitOps workflow operational

**Process Success:**
- ✅ All checkpoints completed with documented decisions
- ✅ Service-specific plans created for complex migrations
- ✅ Rollback procedures tested and validated
- ✅ Team trained on new infrastructure
- ✅ Monitoring and alerting operational

---

## Milestone Summary

```
Milestone 1: Discovery Complete
  ✓ All services inventoried
  ✓ All Caddy configs analyzed
  ✓ Migration complexity assessed
  ✓ Blockers identified and planned
  → Triggers: Checkpoint 1 Planning Session

Milestone 2: Traefik Validated
  ✓ Base configuration working
  ✓ Test services migrated successfully
  ✓ Monitoring integrated
  ✓ Parallel operation proven
  → Triggers: Checkpoint 2 Planning Session

Milestone 3: Low-Risk Services Migrated
  ✓ Batch 1-2 services completed
  ✓ Migration process validated
  ✓ Templates refined
  → Triggers: Checkpoint 3 (optional)

Milestone 4: All Services Migrated
  ✓ All services on Traefik
  ✓ Caddy decommissioned
  ✓ 48-hour stability window passed
  → Triggers: Phase 5 Optimization

Milestone 5: Project Complete
  ✓ Performance optimized
  ✓ Documentation complete
  ✓ GitOps integration operational
  ✓ Team handoff complete
```

---

## Next Steps

1. **Execute Phase 1: Discovery** - See [DISCOVERY-PHASE.md](DISCOVERY-PHASE.md)
2. **Schedule Checkpoint 1** - After Phase 1 completion
3. **Refine Phases 2-5** - Based on Checkpoint 1 decisions

**Current Status:** Phase 1 execution planning in progress

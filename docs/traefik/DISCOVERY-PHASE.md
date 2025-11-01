# Phase 1: Discovery & Assessment - Execution Plan

**Phase Status:** Ready to Execute  
**Expected Completion:** When all deliverables are complete  
**Next Milestone:** Checkpoint 1 Planning Session  
**Owner:** [To be assigned]

## Phase 1 Overview

**Goal:** Complete comprehensive discovery of current Caddy setup, prepare infrastructure, and gather all information needed for detailed migration planning.

**Success Criteria:**
- ✅ Complete inventory of all services and configurations
- ✅ Traefik LXC container operational and ready
- ✅ Monitoring integration prepared
- ✅ All complexity and blockers documented
- ✅ Team ready for Checkpoint 1 planning session

**Critical Path Items:**
1. Caddy configuration export and analysis
2. Service inventory and complexity assessment
3. Middleware requirements identification
4. Blocker identification and documentation

## Task Breakdown

### 1.1 Current State Assessment

#### Task 1.1.1: Export Caddy Configuration
**Owner:** [Name]  
**Estimated Effort:** 1-2 hours  
**Prerequisites:** SSH access to Caddy server

**Steps:**
1. **Locate Caddy configuration**
   ```bash
   # Find Caddyfile location
   caddy version
   caddy environ  # Shows config file path
   
   # Common locations:
   # /etc/caddy/Caddyfile
   # /etc/caddy/conf.d/
   # ~/Caddyfile
   ```

2. **Export complete configuration**
   ```bash
   # Export Caddyfile
   cp /etc/caddy/Caddyfile ~/caddy-export/Caddyfile.backup
   
   # If using multiple files, export directory
   tar -czf ~/caddy-export/caddy-config-$(date +%Y%m%d).tar.gz /etc/caddy/
   
   # Export JSON API config (if using admin API)
   curl http://localhost:2019/config/ | jq > ~/caddy-export/caddy-config.json
   ```

3. **Save to repository**
   ```bash
   # In homelab-gitops-auditor
   mkdir -p config/caddy-backup
   cp ~/caddy-export/* config/caddy-backup/
   ```

**Deliverables:**
- [ ] `config/caddy-backup/Caddyfile.backup` - Original Caddyfile
- [ ] `config/caddy-backup/caddy-config.json` - JSON export (if applicable)
- [ ] `config/caddy-backup/caddy-config-YYYYMMDD.tar.gz` - Complete config archive

**Validation:**
- [ ] Configuration files readable and complete
- [ ] All include files captured
- [ ] No sensitive data exposed (API keys, passwords)

---

#### Task 1.1.2: Inventory All Services
**Owner:** [Name]  
**Estimated Effort:** 2-4 hours  
**Prerequisites:** Caddy configuration exported, access to infrastructure

**Steps:**

1. **Parse Caddyfile for service entries**
   ```bash
   # Extract all hostnames
   grep -E "^[a-z0-9\-\.]+\.[a-z]+" /etc/caddy/Caddyfile | sort | uniq
   
   # Extract proxy backends
   grep -E "reverse_proxy|proxy" /etc/caddy/Caddyfile
   ```

2. **Create initial service list**
   - Create spreadsheet or table
   - For each hostname in Caddyfile:
     - Service name
     - Hostname
     - Backend IP:PORT
     - TLS configuration
     - Basic middleware notes

3. **Verify each service**
   ```bash
   # Test service accessibility
   curl -I https://[hostname]
   
   # Check backend connectivity
   curl -I http://[backend-ip]:[port]
   ```

4. **Document service dependencies**
   - Identify service relationships
   - Map integration points
   - Note critical vs non-critical services

5. **Populate service matrix template**
   - Copy `templates/SERVICE-MIGRATION-MATRIX-TEMPLATE.md`
   - Fill in discovered services
   - Initial complexity ratings (will refine in next steps)

**Deliverables:**
- [ ] `docs/traefik/SERVICE-MIGRATION-MATRIX.md` - Populated matrix (initial version)
- [ ] `docs/traefik/CURRENT-CADDY-INVENTORY.md` - Detailed inventory document

**Validation:**
- [ ] All services from Caddyfile captured
- [ ] Backend connectivity verified for each service
- [ ] No orphaned or unknown services
- [ ] Service count matches expectation

---

#### Task 1.1.3: Analyze Service Complexity
**Owner:** [Name]  
**Estimated Effort:** 3-5 hours  
**Prerequisites:** Service inventory complete

**Steps:**

1. **For each service, analyze Caddy configuration:**
   
   **Low Complexity Indicators:**
   - Simple `reverse_proxy [backend]`
   - No custom headers or middleware
   - Standard TLS (automatic HTTPS)
   - Single backend
   - No authentication

   **Medium Complexity Indicators:**
   - Custom headers
   - Multiple backends (load balancing)
   - Basic authentication
   - Custom TLS configuration
   - Path-based routing
   - Request/response manipulation

   **High Complexity Indicators:**
   - WebSocket handling (`upgrade` headers)
   - Server-Sent Events (SSE)
   - Complex path rewriting
   - Custom middleware/plugins
   - Advanced authentication (OAuth, OIDC)
   - gRPC proxying
   - Circuit breakers or retry logic
   - Custom Caddy modules

2. **Document complexity for each service:**
   ```markdown
   ### Service: home-assistant
   
   **Complexity: HIGH**
   
   **Caddy Configuration:**
   ```caddyfile
   hass.internal.lakehouse.wtf {
     reverse_proxy 192.168.1.10:8123 {
       header_up X-Forwarded-For {remote_host}
       header_up X-Forwarded-Proto {scheme}
     }
   }
   ```
   
   **Complexity Factors:**
   - WebSocket support required (Home Assistant uses WebSockets extensively)
   - Long-lived connections
   - Custom headers required
   - Critical service (high risk)
   
   **Special Considerations:**
   - Must test WebSocket functionality
   - Integrations depend on stable connection
   - Mobile app connectivity critical
   ```

3. **Rate each service:**
   - Update SERVICE-MIGRATION-MATRIX.md with complexity ratings
   - Flag high-complexity services for detailed migration plans
   - Identify services that can be batched together

4. **Create complexity summary:**
   ```markdown
   ## Complexity Summary
   
   **Low Complexity (Simple HTTP Proxy):** X services
   - [List services]
   
   **Medium Complexity (Custom Configuration):** Y services
   - [List services]
   
   **High Complexity (Advanced Features):** Z services
   - [List services]
   
   **Require Detailed Migration Plans:**
   - [List high-complexity services]
   ```

**Deliverables:**
- [ ] `docs/traefik/SERVICE-COMPLEXITY-ANALYSIS.md` - Detailed analysis
- [ ] Updated `SERVICE-MIGRATION-MATRIX.md` - With complexity ratings
- [ ] List of services needing detailed migration plans

**Validation:**
- [ ] Every service has complexity rating
- [ ] High-complexity services have detailed analysis
- [ ] Complexity factors documented
- [ ] Special considerations noted

---

#### Task 1.1.4: Document Middleware Requirements
**Owner:** [Name]  
**Estimated Effort:** 2-3 hours  
**Prerequisites:** Service inventory and complexity analysis complete

**Steps:**

1. **Extract middleware patterns from Caddyfile:**
   
   **Common Caddy → Traefik Middleware Mappings:**
   
   | Caddy Directive | Traefik Middleware | Complexity |
   |-----------------|-------------------|------------|
   | `header` | `headers` | Low |
   | `@internal { remote_ip ...}` | `ipWhiteList` | Low |
   | `basicauth` | `basicAuth` | Low |
   | `ratelimit` | `rateLimit` | Medium |
   | `rewrite` | `stripPrefix`, `replacePath` | Medium |
   | `@websocket` | (built-in) | Medium |

2. **Create middleware inventory:**
   ```markdown
   ## Middleware Requirements Matrix
   
   | Middleware Type | Services Using | Traefik Equivalent | Priority | Notes |
   |----------------|----------------|-------------------|----------|-------|
   | IP Whitelisting | 12 services | ipWhiteList | High | Internal network only |
   | Secure Headers | All services | headers | High | HSTS, CSP, etc. |
   | Basic Auth | 3 services | basicAuth | Medium | Admin interfaces |
   | Rate Limiting | 2 services | rateLimit | Low | Public-facing only |
   | WebSocket | 1 service (HA) | Built-in | High | Critical functionality |
   ```

3. **Document specific middleware needs:**
   - For each middleware type, document:
     - Current Caddy configuration
     - Required Traefik configuration
     - Services that use it
     - Testing requirements

4. **Create common middleware templates:**
   ```yaml
   # Example: Internal network whitelist
   http:
     middlewares:
       internal-whitelist:
         ipWhiteList:
           sourceRange:
             - "192.168.1.0/24"
             - "10.0.0.0/8"
   
   # Example: Secure headers
       secure-headers:
         headers:
           sslRedirect: true
           stsSeconds: 31536000
           stsIncludeSubdomains: true
           stsPreload: true
           contentTypeNosniff: true
           browserXssFilter: true
           referrerPolicy: "strict-origin-when-cross-origin"
   ```

**Deliverables:**
- [ ] `docs/traefik/MIDDLEWARE-REQUIREMENTS-MATRIX.md` - Complete middleware mapping
- [ ] `infrastructure/traefik/config/dynamic/middlewares.yml` - Template file
- [ ] Documentation of Caddy → Traefik middleware translation

**Validation:**
- [ ] All middleware types identified
- [ ] Traefik equivalents confirmed
- [ ] Templates created for common patterns
- [ ] No unsupported middleware

---

#### Task 1.1.5: Identify Technical Blockers
**Owner:** [Name]  
**Estimated Effort:** 2-3 hours  
**Prerequisites:** All discovery tasks above complete

**Steps:**

1. **Review for potential blockers:**
   
   **Categories to check:**
   - [ ] **Protocol support:** Does Traefik support all protocols used? (HTTP/2, gRPC, WebSocket, etc.)
   - [ ] **Middleware gaps:** Any Caddy features without Traefik equivalent?
   - [ ] **Certificate management:** Can we migrate cert setup cleanly?
   - [ ] **Plugin/module dependencies:** Any custom Caddy modules that need replacement?
   - [ ] **Performance requirements:** Any latency-sensitive services?
   - [ ] **Integration points:** External systems that depend on specific Caddy behavior?

2. **Document each blocker:**
   ```markdown
   ## Blocker: [Title]
   
   **Category:** [Protocol/Middleware/Certificate/Integration/Performance/Other]
   **Severity:** [Critical/High/Medium/Low]
   **Affects:** [List of services]
   
   **Description:**
   [Detailed description of the blocker]
   
   **Impact if not resolved:**
   [What happens if we don't address this]
   
   **Proposed Resolution:**
   - Option 1: [Description, pros/cons]
   - Option 2: [Description, pros/cons]
   - Recommended: [Which option and why]
   
   **Owner:** [Name]
   **Target Resolution:** [Phase 1/Phase 2/Before Checkpoint 1]
   
   **Status:** [Identified/Investigating/Resolved]
   ```

3. **Categorize blockers:**
   - **Critical:** Migration cannot proceed without resolution
   - **High:** Significantly impacts migration approach
   - **Medium:** Requires workaround or adjustment
   - **Low:** Nice to resolve but not blocking

4. **Create resolution plan for critical blockers:**
   - Research solutions
   - Identify alternatives
   - Document decision criteria
   - Assign owners for resolution

**Deliverables:**
- [ ] `docs/traefik/DISCOVERED-BLOCKERS.md` - Complete blocker documentation
- [ ] Resolution plan for critical and high-severity blockers
- [ ] Updated risk register with blocker-related risks

**Validation:**
- [ ] All potential blockers documented
- [ ] Critical blockers have resolution plans
- [ ] No unknown technical issues remain
- [ ] Team aware of challenges ahead

---

#### Task 1.1.6: Capture Performance Baselines
**Owner:** [Name]  
**Estimated Effort:** 2-3 hours  
**Prerequisites:** Monitoring tools available

**Steps:**

1. **Collect current Caddy metrics:**
   ```bash
   # If Caddy metrics enabled
   curl http://localhost:2019/metrics
   
   # Or from Prometheus
   # Request latency (P50, P95, P99)
   # Requests per second
   # Error rates
   # Active connections
   ```

2. **Document baseline for key services:**
   ```markdown
   ## Performance Baselines
   
   ### Home Assistant
   - P50 latency: XXms
   - P95 latency: XXms
   - P99 latency: XXms
   - Avg requests/sec: XX
   - Error rate: X.XX%
   - Peak concurrent connections: XX
   
   ### Grafana
   [Same metrics]
   ```

3. **Identify performance-critical services:**
   - Services with latency requirements
   - Services with high traffic
   - Services with real-time requirements

4. **Define acceptance criteria:**
   ```markdown
   ## Post-Migration Performance Acceptance
   
   - No more than 10% increase in P95 latency
   - Error rate remains below 0.1%
   - No degradation in concurrent connection handling
   - WebSocket connections remain stable
   ```

**Deliverables:**
- [ ] `docs/traefik/PERFORMANCE-BASELINES.md` - Current performance data
- [ ] Performance acceptance criteria documented
- [ ] Performance-critical services identified

**Validation:**
- [ ] Baseline metrics captured for all critical services
- [ ] Acceptance criteria defined and agreed upon
- [ ] Monitoring approach for comparison ready

---

#### Task 1.1.7: Create Configuration Translation Script
**Owner:** [Name]  
**Estimated Effort:** 4-6 hours  
**Prerequisites:** Service inventory and middleware analysis complete

**Steps:**

1. **Design script architecture:**
   ```bash
   scripts/caddy-to-traefik-mapper.sh
   ├── Parse Caddyfile
   ├── Extract service blocks
   ├── Map middleware directives
   ├── Generate Traefik YAML
   └── Validate output
   ```

2. **Implement basic translation:**
   ```bash
   #!/bin/bash
   # caddy-to-traefik-mapper.sh
   
   # Parse Caddyfile service blocks
   # Generate Traefik dynamic configuration
   # Handle common patterns automatically
   # Flag complex configs for manual review
   ```

3. **Test with sample services:**
   - Run on simple services first
   - Validate generated Traefik config
   - Refine translation rules
   - Add handling for edge cases

4. **Document translation patterns:**
   ```markdown
   ## Caddy → Traefik Translation Patterns
   
   ### Simple Reverse Proxy
   **Caddy:**
   ```caddyfile
   example.com {
     reverse_proxy localhost:8080
   }
   ```
   
   **Traefik:**
   ```yaml
   http:
     routers:
       example:
         rule: "Host(`example.com`)"
         service: example
     services:
       example:
         loadBalancer:
           servers:
             - url: "http://localhost:8080"
   ```
   ```

**Deliverables:**
- [ ] `scripts/caddy-to-traefik-mapper.sh` - Translation script
- [ ] `docs/traefik/TRANSLATION-PATTERNS.md` - Pattern documentation
- [ ] Sample generated Traefik configs for testing

**Validation:**
- [ ] Script runs without errors
- [ ] Generated configs are syntactically valid
- [ ] Manual review process defined for complex services
- [ ] Script documented and usable

---

### 1.2 Traefik LXC Container Setup

#### Task 1.2.1: Create LXC Container
**Owner:** [Name]  
**Estimated Effort:** 1-2 hours  
**Prerequisites:** Proxmox access, Debian template available

**Steps:**

1. **Verify Proxmox environment:**
   ```bash
   # SSH to Proxmox host
   ssh root@proxmox
   
   # Check available templates
   pveam available | grep debian
   
   # Download Debian 12 template if not present
   pveam download local debian-12-standard_12.0-1_amd64.tar.zst
   
   # Verify container ID 110 is available
   pct list | grep 110
   ```

2. **Create LXC container:**
   ```bash
   pct create 110 local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst \
     --hostname traefik \
     --cores 2 \
     --memory 2048 \
     --swap 512 \
     --storage local-lvm \
     --rootfs 8 \
     --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=1 \
     --features nesting=1 \
     --unprivileged 1 \
     --onboot 1
   
   # Start container
   pct start 110
   
   # Get IP address
   pct exec 110 -- ip addr show eth0
   ```

3. **Configure static IP (optional):**
   ```bash
   # If static IP desired
   pct set 110 --net0 name=eth0,bridge=vmbr0,ip=192.168.1.110/24,gw=192.168.1.1
   pct reboot 110
   ```

4. **Initial container setup:**
   ```bash
   # Enter container
   pct enter 110
   
   # Update system
   apt update && apt upgrade -y
   
   # Install essential packages
   apt install -y \
     curl \
     wget \
     git \
     vim \
     htop \
     net-tools \
     ca-certificates \
     gnupg \
     lsb-release
   
   exit
   ```

**Deliverables:**
- [ ] LXC container 110 created and running
- [ ] Network connectivity verified
- [ ] Container accessible via SSH (if configured)

**Validation:**
- [ ] `pct status 110` shows running
- [ ] Container has network connectivity
- [ ] Can access container: `pct enter 110`

---

#### Task 1.2.2: Install Docker in LXC
**Owner:** [Name]  
**Estimated Effort:** 1-2 hours  
**Prerequisites:** LXC container created

**Steps:**

1. **Create setup script:**
   ```bash
   # Create infrastructure/traefik/lxc-setup.sh
   cat > infrastructure/traefik/lxc-setup.sh << 'EOF'
   #!/bin/bash
   # Traefik LXC Container Setup Script
   
   set -e
   
   echo "==> Installing Docker..."
   
   # Add Docker GPG key
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   
   # Add Docker repository
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
     $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
     tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   
   # Enable and start Docker
   systemctl enable docker
   systemctl start docker
   
   # Verify installation
   docker --version
   docker compose version
   
   echo "==> Docker installation complete!"
   
   # Create directory structure
   mkdir -p /opt/traefik/{config/dynamic/routes,logs,tls}
   
   echo "==> Directory structure created at /opt/traefik"
   
   # Test Docker
   docker run --rm hello-world
   
   echo "==> Setup complete! Container ready for Traefik deployment."
   EOF
   
   chmod +x infrastructure/traefik/lxc-setup.sh
   ```

2. **Run setup script:**
   ```bash
   # Copy script to container
   pct push 110 infrastructure/traefik/lxc-setup.sh /root/setup.sh
   
   # Execute setup
   pct exec 110 -- bash /root/setup.sh
   ```

3. **Verify Docker installation:**
   ```bash
   # Check Docker status
   pct exec 110 -- systemctl status docker
   
   # Check Docker version
   pct exec 110 -- docker --version
   pct exec 110 -- docker compose version
   
   # List running containers
   pct exec 110 -- docker ps
   ```

**Deliverables:**
- [ ] `infrastructure/traefik/lxc-setup.sh` - Automated setup script
- [ ] Docker installed and running in container 110
- [ ] Directory structure created: `/opt/traefik/`

**Validation:**
- [ ] Docker service running
- [ ] `docker run hello-world` succeeds
- [ ] Docker Compose available
- [ ] Directory structure exists

---

#### Task 1.2.3: Configure Container Resources
**Owner:** [Name]  
**Estimated Effort:** 30 minutes  
**Prerequisites:** Container operational

**Steps:**

1. **Validate resource allocation:**
   ```bash
   # Check current resources
   pct config 110 | grep -E "(cores|memory|swap|rootfs)"
   
   # Inside container, verify
   pct exec 110 -- free -h
   pct exec 110 -- df -h
   pct exec 110 -- nproc
   ```

2. **Adjust if needed:**
   ```bash
   # Increase resources if testing shows need
   pct set 110 --cores 2 --memory 2048
   pct reboot 110
   ```

3. **Configure auto-start:**
   ```bash
   # Ensure container starts on boot
   pct set 110 --onboot 1
   ```

4. **Document configuration:**
   ```markdown
   ## Container 110 (Traefik) Specifications
   
   - **ID:** 110
   - **Hostname:** traefik
   - **OS:** Debian 12 (bookworm)
   - **CPU:** 2 cores
   - **Memory:** 2048 MB
   - **Swap:** 512 MB
   - **Storage:** 8 GB (local-lvm)
   - **Network:** vmbr0, DHCP (or static: 192.168.1.110)
   - **Features:** nesting=1 (for Docker)
   - **Auto-start:** Yes
   ```

**Deliverables:**
- [ ] Resource allocation validated and optimized
- [ ] Auto-start configured
- [ ] Configuration documented

**Validation:**
- [ ] Resources appropriate for workload
- [ ] Container starts on Proxmox boot
- [ ] Performance acceptable

---

### 1.3 Monitoring Integration Preparation

#### Task 1.3.1: Research Traefik Metrics
**Owner:** [Name]  
**Estimated Effort:** 2-3 hours  
**Prerequisites:** None

**Steps:**

1. **Review Traefik metrics documentation:**
   - Prometheus metrics format
   - Available metric types
   - Metric labels
   - Configuration requirements

2. **Identify key metrics to track:**
   ```markdown
   ## Key Traefik Metrics
   
   ### Request Metrics
   - `traefik_service_requests_total` - Total requests per service
   - `traefik_service_request_duration_seconds` - Request latency
   - `traefik_service_requests_bytes_total` - Request size
   - `traefik_service_responses_bytes_total` - Response size
   
   ### Entrypoint Metrics
   - `traefik_entrypoint_requests_total` - Requests per entrypoint
   - `traefik_entrypoint_request_duration_seconds` - Entrypoint latency
   - `traefik_entrypoint_open_connections` - Active connections
   
   ### Backend Health
   - `traefik_service_server_up` - Backend server status
   
   ### TLS Metrics
   - `traefik_tls_certs_not_after` - Certificate expiry timestamp
   ```

3. **Define dashboard requirements:**
   - Request rate overview
   - Latency distribution (P50, P95, P99)
   - Error rate tracking
   - Service health status
   - Certificate expiry warnings
   - Backend connectivity

**Deliverables:**
- [ ] `docs/traefik/METRICS-REFERENCE.md` - Metrics documentation
- [ ] List of key metrics to track
- [ ] Dashboard requirements defined

**Validation:**
- [ ] Metrics aligned with performance baselines
- [ ] All critical aspects covered
- [ ] Team understands metrics

---

#### Task 1.3.2: Create Prometheus Configuration
**Owner:** [Name]  
**Estimated Effort:** 1-2 hours  
**Prerequisites:** Metrics research complete

**Steps:**

1. **Create Prometheus scrape configuration:**
   ```yaml
   # infrastructure/monitoring/prometheus-traefik.yml
   
   scrape_configs:
     - job_name: 'traefik'
       static_configs:
         - targets:
           - '192.168.1.110:8082'  # Adjust to actual Traefik metrics endpoint
       metrics_path: '/metrics'
       scrape_interval: 15s
       scrape_timeout: 10s
       
       relabel_configs:
         - source_labels: [__address__]
           target_label: instance
           replacement: 'traefik'
   ```

2. **Define alert rules:**
   ```yaml
   # infrastructure/monitoring/alerts.yml
   
   groups:
     - name: traefik
       interval: 30s
       rules:
         # Service down alert
         - alert: TraefikServiceDown
           expr: traefik_service_server_up == 0
           for: 2m
           labels:
             severity: critical
           annotations:
             summary: "Traefik backend {{ $labels.service }} is down"
             description: "Service {{ $labels.service }} has been unreachable for more than 2 minutes."
         
         # High latency alert
         - alert: TraefikHighLatency
           expr: histogram_quantile(0.95, traefik_service_request_duration_seconds_bucket) > 1
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: "High latency on {{ $labels.service }}"
             description: "P95 latency for {{ $labels.service }} is {{ $value }}s"
         
         # Certificate expiry alert
         - alert: TraefikCertificateExpiringSoon
           expr: (traefik_tls_certs_not_after - time()) / 86400 < 30
           for: 1h
           labels:
             severity: warning
           annotations:
             summary: "TLS certificate expiring soon"
             description: "Certificate for {{ $labels.cn }} expires in {{ $value }} days"
         
         # High error rate
         - alert: TraefikHighErrorRate
           expr: rate(traefik_service_requests_total{code=~"5.."}[5m]) > 0.05
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: "High error rate on {{ $labels.service }}"
             description: "Service {{ $labels.service }} has error rate of {{ $value }}"
   ```

**Deliverables:**
- [ ] `infrastructure/monitoring/prometheus-traefik.yml` - Scrape config
- [ ] `infrastructure/monitoring/alerts.yml` - Alert rules
- [ ] Integration instructions for existing Prometheus

**Validation:**
- [ ] Configuration syntax valid
- [ ] Alert rules tested
- [ ] Ready to deploy when Traefik goes live

---

#### Task 1.3.3: Select/Create Grafana Dashboard
**Owner:** [Name]  
**Estimated Effort:** 2-3 hours  
**Prerequisites:** Metrics and alerts defined

**Steps:**

1. **Research existing dashboards:**
   - Search Grafana.com for Traefik dashboards
   - Evaluate options:
     - [Traefik Official Dashboard](https://grafana.com/grafana/dashboards/)
     - Community dashboards
     - Custom requirements

2. **Select or create dashboard:**
   
   **Option A: Use existing dashboard**
   - Download JSON from Grafana.com
   - Customize for environment
   - Test with mock data

   **Option B: Create custom dashboard**
   - Design layout based on requirements
   - Create panels for key metrics
   - Add alerts and annotations

3. **Dashboard panels to include:**
   ```markdown
   ## Traefik Dashboard Layout
   
   ### Row 1: Overview
   - Total requests/sec (gauge)
   - Active services (stat)
   - Backend health (stat panel)
   - Certificate status (stat)
   
   ### Row 2: Traffic
   - Requests per service (graph)
   - Request rate by entrypoint (graph)
   - Traffic volume (graph)
   
   ### Row 3: Performance
   - Request latency P50/P95/P99 (graph)
   - Latency heatmap (heatmap)
   - Error rate (graph)
   
   ### Row 4: Backend Health
   - Backend server status (table)
   - Connection pool status (graph)
   - Health check failures (graph)
   
   ### Row 5: TLS/Certificates
   - Certificate expiry timeline (graph)
   - TLS version distribution (pie chart)
   ```

4. **Export dashboard JSON:**
   ```bash
   # Save to infrastructure/monitoring/grafana-dashboard.json
   ```

**Deliverables:**
- [ ] `infrastructure/monitoring/grafana-dashboard.json` - Dashboard config
- [ ] `docs/traefik/MONITORING-INTEGRATION.md` - Integration guide
- [ ] Screenshots/documentation of dashboard panels

**Validation:**
- [ ] Dashboard imports successfully
- [ ] All panels display correctly (with mock/test data)
- [ ] Alerts linked properly
- [ ] Dashboard meets requirements

---

## Phase 1 Deliverables Checklist

### Documentation Deliverables
- [ ] `docs/traefik/CURRENT-CADDY-INVENTORY.md`
- [ ] `docs/traefik/SERVICE-MIGRATION-MATRIX.md`
- [ ] `docs/traefik/SERVICE-COMPLEXITY-ANALYSIS.md`
- [ ] `docs/traefik/MIDDLEWARE-REQUIREMENTS-MATRIX.md`
- [ ] `docs/traefik/DISCOVERED-BLOCKERS.md`
- [ ] `docs/traefik/PERFORMANCE-BASELINES.md`
- [ ] `docs/traefik/TRANSLATION-PATTERNS.md`
- [ ] `docs/traefik/METRICS-REFERENCE.md`
- [ ] `docs/traefik/MONITORING-INTEGRATION.md`

### Configuration Deliverables
- [ ] `config/caddy-backup/*` - Caddy configuration backup
- [ ] `infrastructure/traefik/lxc-setup.sh` - LXC setup script
- [ ] `infrastructure/traefik/config/dynamic/middlewares.yml` - Middleware templates
- [ ] `infrastructure/monitoring/prometheus-traefik.yml` - Prometheus config
- [ ] `infrastructure/monitoring/alerts.yml` - Alert rules
- [ ] `infrastructure/monitoring/grafana-dashboard.json` - Dashboard

### Script Deliverables
- [ ] `scripts/caddy-to-traefik-mapper.sh` - Config translation script

### Infrastructure Deliverables
- [ ] LXC Container 110 operational with Docker
- [ ] Directory structure at `/opt/traefik/` ready
- [ ] Network connectivity verified

## Phase 1 Validation & Acceptance

### Technical Validation
- [ ] All services from Caddy inventoried
- [ ] Every service has complexity rating
- [ ] All middleware requirements identified
- [ ] Critical blockers have resolution plans
- [ ] Performance baselines captured
- [ ] Traefik LXC container operational
- [ ] Monitoring configuration ready

### Process Validation
- [ ] All discovery tasks completed
- [ ] All deliverables created and reviewed
- [ ] High-complexity services flagged for detailed planning
- [ ] Team aware of challenges and blockers
- [ ] Risk register updated with discoveries

### Readiness for Checkpoint 1
- [ ] Service migration matrix populated
- [ ] Sufficient information for detailed planning
- [ ] Team prepared to make GO/NO-GO decisions
- [ ] All critical questions can be answered

## Checkpoint 1 Preparation

**When Phase 1 is complete:**

1. **Schedule Checkpoint 1 meeting**
   - Invite: Project owner, infrastructure team, stakeholders
   - Duration: 2-4 hours
   - Prepare presentation of findings

2. **Prepare materials:**
   - Review all Phase 1 deliverables
   - Summarize key findings
   - Prepare recommendations
   - Create decision slides

3. **Distribute pre-read materials:**
   - Send deliverables 2-3 days before meeting
   - Highlight key findings and blockers
   - Include preliminary recommendations

4. **Set meeting agenda:**
   - Use `checkpoints/CHECKPOINT-1-TEMPLATE.md` as agenda
   - Allocate time for each section
   - Prepare for questions and discussion

## Phase 1 Exit Criteria

**Phase 1 is complete when:**

- ✅ All deliverables created and validated
- ✅ All critical blockers have resolution plans
- ✅ Traefik infrastructure ready for deployment
- ✅ Team aligned and ready for Checkpoint 1
- ✅ Sufficient confidence to proceed with detailed planning

**DO NOT schedule Checkpoint 1 until ALL exit criteria are met.**

---

## Getting Started

**To begin Phase 1 execution:**

1. Assign owners to each task
2. Set up project tracking (use homelab-gitops-auditor project management)
3. Begin with Task 1.1.1 (Export Caddy Configuration)
4. Work through tasks systematically
5. Update this document as you progress
6. Schedule regular check-ins to track progress

**Recommended Schedule:**
- Daily standups during active discovery
- Weekly review of progress
- Blockers escalated immediately
- Checkpoint 1 scheduled when 100% complete

---

**Document Owner:** [Name]  
**Last Updated:** [Date]  
**Next Update:** [Weekly during Phase 1]

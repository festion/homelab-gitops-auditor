# Service Migration Plan: [Service Name]

**Service:** [Service Name]  
**Current Hostname:** [hostname.internal.lakehouse.wtf]  
**Complexity:** [Low/Medium/High]  
**Risk Level:** [Low/Medium/High]  
**Migration Batch:** [1-5]  
**Owner:** [Name]  
**Status:** [Planning/Ready/In Progress/Complete/Blocked]

## Service Overview

**Purpose:** [What this service does]  
**Business Criticality:** [Critical/High/Medium/Low]  
**Users:** [Who uses this service]  
**Dependencies:**
- Upstream: [Services this depends on]
- Downstream: [Services that depend on this]

## Current Configuration

### Caddy Configuration
```caddyfile
[Paste current Caddyfile block for this service]
```

### Backend Details
- **Backend URL:** `http://[IP]:[PORT]`
- **Backend Type:** [Web app/API/Static site/Other]
- **Health Check Endpoint:** [/health or /api/status or N/A]
- **Protocol:** [HTTP/HTTPS/WebSocket/gRPC/Mixed]

### Current Middleware
- [ ] IP Whitelisting
- [ ] Custom Headers
- [ ] Authentication (Type: ___)
- [ ] Rate Limiting
- [ ] CORS
- [ ] Path Rewriting
- [ ] Other: ___

### TLS Configuration
- **Certificate Type:** [Let's Encrypt/Internal CA/Self-signed]
- **Certificate Location:** [Auto/File path]
- **Custom TLS Settings:** [Yes/No - if yes, describe]

## Complexity Analysis

### Factors Contributing to Complexity

**[Low/Medium/High] Complexity because:**
- [List specific reasons for complexity rating]
- [E.g., "WebSocket support required"]
- [E.g., "Complex path rewriting rules"]
- [E.g., "Multiple backends with load balancing"]

### Special Requirements
- [ ] WebSocket support
- [ ] Server-Sent Events (SSE)
- [ ] Long-lived connections
- [ ] Large file uploads (Max size: ___)
- [ ] Streaming responses
- [ ] gRPC proxying
- [ ] Custom headers required: [List]
- [ ] Backend connection pooling
- [ ] Circuit breaker needed
- [ ] Other: ___

## Traefik Configuration

### Router Configuration
```yaml
# infrastructure/traefik/config/dynamic/routes/[service-name].yml

http:
  routers:
    [service-name]:
      rule: "Host(`[hostname]`)"
      entryPoints:
        - websecure
      service: [service-name]
      middlewares:
        - [list-middlewares]
      tls: {}
```

### Service Configuration
```yaml
  services:
    [service-name]:
      loadBalancer:
        servers:
          - url: "http://[backend-ip]:[port]"
        healthCheck:
          path: /health
          interval: 30s
          timeout: 5s
```

### Middleware Configuration
```yaml
  middlewares:
    [service-middleware]:
      [middleware-config]
```

### Special Configuration Notes
[Any special Traefik configuration needed for this service]

## Migration Plan

### Pre-Migration Checklist
- [ ] Backup current configuration
- [ ] Document current behavior/functionality
- [ ] Create Traefik configuration files
- [ ] Validate Traefik configuration syntax
- [ ] Test backend connectivity from Traefik container
- [ ] Prepare rollback procedure
- [ ] Notify users of planned migration (if applicable)

### Migration Window
- **Preferred Window:** [Day of week, time]
- **Acceptable Downtime:** [0 min / 5 min / 15 min / 30 min / Other]
- **Estimated Migration Duration:** [X hours/minutes]
- **Blackout Dates:** [Times when migration cannot occur]

### Migration Steps

#### Step 1: Deploy Traefik Configuration
```bash
# Copy configuration to Traefik container
scp infrastructure/traefik/config/dynamic/routes/[service-name].yml \
    traefik:/opt/traefik/config/dynamic/routes/

# Verify configuration loaded
docker exec traefik cat /etc/traefik/dynamic/routes/[service-name].yml

# Check Traefik logs for config errors
docker logs traefik | grep -i error
```

**Validation:**
- [ ] Configuration file deployed
- [ ] No syntax errors in Traefik logs
- [ ] Service appears in Traefik dashboard

#### Step 2: Test via Traefik (Parallel Operation)
```bash
# Test connectivity through Traefik alternate port
curl -I https://[hostname]:8443

# Or add hosts file entry for testing
echo "[traefik-ip] [hostname]" >> /etc/hosts
curl -I https://[hostname]

# Verify backend connectivity
curl -I http://[backend-ip]:[port]
```

**Validation:**
- [ ] Service accessible via Traefik
- [ ] Headers correct
- [ ] Authentication working (if applicable)
- [ ] Backend responding correctly

#### Step 3: Functional Testing
**Test Cases:**
1. [Test case 1 - describe expected behavior]
2. [Test case 2 - describe expected behavior]
3. [Test case 3 - describe expected behavior]
4. [Additional test cases specific to this service]

**For WebSocket services:**
```bash
# Test WebSocket connection
wscat -c wss://[hostname]/api/websocket
# Verify bidirectional communication
```

**For authentication:**
```bash
# Test authentication flow
curl -u user:pass https://[hostname]/protected
# Or test OAuth/OIDC flow manually
```

**Validation:**
- [ ] All test cases pass
- [ ] No errors in Traefik logs
- [ ] No errors in backend logs
- [ ] Performance acceptable

#### Step 4: Cutover (DNS/Port Swap)
**Option A: Port Swap (if running parallel)**
```bash
# Stop both proxies
docker stop caddy traefik

# Reconfigure ports
# Edit docker-compose.yml
# Caddy: 80/443 → 8080/8443
# Traefik: 8080/8443 → 80/443

# Start Traefik first
docker start traefik

# Verify services accessible
curl -I https://[hostname]

# Start Caddy on alternate ports (fallback)
docker start caddy
```

**Option B: DNS Change (if using Cloudflare Tunnel)**
```bash
# Update DNS record
# [hostname] → [traefik-tunnel-endpoint]

# Wait for propagation (monitor)
while ! host [hostname] | grep [traefik-ip]; do
  echo "Waiting for DNS propagation..."
  sleep 30
done
```

**Validation:**
- [ ] Service accessible on standard ports
- [ ] DNS resolving correctly (if applicable)
- [ ] No connection errors

#### Step 5: Post-Migration Validation
**Immediate (< 5 min):**
- [ ] Service responds to requests
- [ ] Authentication working
- [ ] No errors in logs
- [ ] Metrics being collected

**Short-term (15-30 min):**
- [ ] End-to-end functionality verified
- [ ] Integration with dependent services working
- [ ] User-facing functionality validated
- [ ] Performance within acceptable range

**Extended (1-4 hours):**
- [ ] No recurring errors
- [ ] Metrics stable
- [ ] No user complaints
- [ ] Automated processes functioning

#### Step 6: Cleanup
```bash
# Remove Caddy configuration for this service (after stability period)
# Keep for [X days] as fallback

# Update documentation
# Mark service as migrated in SERVICE-MIGRATION-MATRIX.md
```

## Testing Requirements

### Functional Tests
1. **Basic Connectivity**
   - [ ] Service responds to HTTP/HTTPS requests
   - [ ] Correct status codes returned
   - [ ] Headers properly set

2. **Service-Specific Functionality**
   - [ ] [Specific test 1]
   - [ ] [Specific test 2]
   - [ ] [Specific test 3]

3. **Integration Tests**
   - [ ] Integrations with [upstream service] working
   - [ ] Integrations with [downstream service] working
   - [ ] External integrations functioning

4. **Authentication/Authorization**
   - [ ] Authorized users can access
   - [ ] Unauthorized users blocked
   - [ ] Middleware applied correctly

5. **Performance Tests**
   - [ ] Latency within acceptable range (< [X]ms P95)
   - [ ] No connection timeouts
   - [ ] Handles expected load

### Load Testing (if applicable)
```bash
# Example load test command
ab -n 1000 -c 10 https://[hostname]/
# Or
wrk -t4 -c100 -d30s https://[hostname]/
```

**Acceptance Criteria:**
- Request rate: [X requests/sec]
- P95 latency: < [X]ms
- Error rate: < [X]%

## Monitoring & Validation

### Metrics to Watch
```promql
# Request rate
rate(traefik_service_requests_total{service="[service-name]"}[5m])

# Latency
histogram_quantile(0.95, 
  rate(traefik_service_request_duration_seconds_bucket{service="[service-name]"}[5m])
)

# Error rate
rate(traefik_service_requests_total{service="[service-name]",code=~"5.."}[5m])

# Backend health
traefik_service_server_up{service="[service-name]"}
```

### Monitoring Period
- **Immediate:** 0-5 minutes (critical monitoring)
- **Short-term:** 5-30 minutes (active monitoring)
- **Extended:** 30 min - 24 hours (periodic checks)
- **Stability:** 24-48 hours (normal monitoring)

### Success Criteria
- [ ] Zero errors for 15 minutes
- [ ] Latency within baseline ± 10%
- [ ] All functionality validated
- [ ] No user reports of issues
- [ ] Monitoring data healthy

## Rollback Plan

### Rollback Triggers
**Automatic Rollback if:**
- Service unavailable > [5] minutes
- Error rate > [X]%
- Latency increase > [30]%
- Critical functionality broken

**Manual Rollback if:**
- User-facing issues reported
- Data integrity concerns
- Performance unacceptable
- Unexpected behavior discovered

### Rollback Procedure

#### Option 1: Quick Rollback (Parallel Operation)
```bash
# If Caddy still running on alternate ports
# Swap ports back

# Stop Traefik
docker stop traefik

# Reconfigure Caddy to standard ports
docker stop caddy
# Edit docker-compose.yml (restore 80/443)
docker start caddy

# Verify service accessible
curl -I https://[hostname]
```

**Time Estimate:** < 5 minutes

#### Option 2: Full Rollback
```bash
# Run rollback script
bash scripts/rollback-to-caddy.sh [service-name]

# Or manual:
# 1. Stop Traefik
# 2. Restore Caddy configuration
# 3. Restart Caddy
# 4. Verify connectivity
# 5. Update DNS if needed
```

**Time Estimate:** < 15 minutes

### Post-Rollback Actions
- [ ] Verify service functionality
- [ ] Document rollback reason
- [ ] Analyze root cause
- [ ] Update migration plan
- [ ] Communicate status to stakeholders
- [ ] Plan remediation/retry

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | [H/M/L] | [H/M/L] | [Mitigation strategy] |
| [Risk 2] | [H/M/L] | [H/M/L] | [Mitigation strategy] |
| [Risk 3] | [H/M/L] | [H/M/L] | [Mitigation strategy] |

## Dependencies & Coordination

### Services to Notify
- [ ] [Dependent Service 1] - Reason: [Why]
- [ ] [Dependent Service 2] - Reason: [Why]

### External Systems
- [ ] [External System 1] - Impact: [Description]
- [ ] [External System 2] - Impact: [Description]

### Team Coordination
- [ ] Notify on-call team
- [ ] Update status page (if applicable)
- [ ] Communication plan ready

## Lessons Learned

**Post-Migration (to be filled after migration):**

### What Went Well
- [Item 1]
- [Item 2]

### What Could Be Improved
- [Item 1]
- [Item 2]

### Recommendations for Future Migrations
- [Item 1]
- [Item 2]

### Template/Process Updates Needed
- [Item 1]
- [Item 2]

## Sign-Off

**Pre-Migration Review:**
- [ ] Configuration reviewed and approved
- [ ] Test plan validated
- [ ] Rollback plan tested
- [ ] Stakeholders notified

**Reviewed by:** [Name] - [Date]  
**Approved by:** [Name] - [Date]

**Post-Migration Sign-Off:**
- [ ] Migration successful
- [ ] Validation complete
- [ ] Monitoring healthy
- [ ] Documentation updated

**Completed by:** [Name] - [Date]  
**Verified by:** [Name] - [Date]

---

**Template Version:** 1.0  
**Last Updated:** [Date]

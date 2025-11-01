# Traefik Monitoring Infrastructure

**Purpose**: Complete monitoring solution for Traefik v3 reverse proxy
**Components**: Prometheus scraping, alerting rules, and Grafana dashboard
**Created**: 2025-10-23 (Phase 1 - Discovery)

---

## Directory Contents

```
monitoring/
├── README.md                           # This file - monitoring overview
├── prometheus-traefik.yml              # Prometheus scrape configuration
├── prometheus-rules.yml                # Prometheus alerting rules
├── grafana-dashboard.json              # Grafana dashboard definition
└── GRAFANA-DASHBOARD-SETUP.md          # Dashboard installation guide
```

---

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Traefik (192.168.1.110)                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Metrics Endpoint: http://192.168.1.110:8080/metrics   │   │
│  │                                                         │   │
│  │  Exposed Metrics:                                      │   │
│  │  - traefik_service_requests_total                      │   │
│  │  - traefik_service_request_duration_seconds_bucket     │   │
│  │  - traefik_service_server_up                           │   │
│  │  - traefik_tls_certs_not_after                         │   │
│  │  - traefik_config_last_reload_successful               │   │
│  │  - And 50+ more metrics...                             │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Scrape every 15s
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                             │                                 │
│                     Prometheus Server                         │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Scrape Config: prometheus-traefik.yml                │   │
│  │  - Job: traefik                                       │   │
│  │  - Target: 192.168.1.110:8080                         │   │
│  │  - Interval: 15s                                      │   │
│  │  - Metric relabeling for service categorization       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Alerting Rules: prometheus-rules.yml                 │   │
│  │                                                        │   │
│  │  Critical Alerts:                                     │   │
│  │  - TraefikDown (1m)                                   │   │
│  │  - TraefikBackendDown (2m)                            │   │
│  │  - TraefikHighErrorRate (5m, >5%)                     │   │
│  │  - TraefikCriticalHomeAssistantDown (1m)              │   │
│  │                                                        │   │
│  │  Warning Alerts:                                      │   │
│  │  - TraefikHighLatency (10m, p95 >1s)                  │   │
│  │  - TraefikCertificateExpiringSoon (<14 days)          │   │
│  │  - TraefikConfigurationReloadFailed (5m)              │   │
│  │  - TraefikHighConnectionCount (15m, >500)             │   │
│  │                                                        │   │
│  │  Recording Rules:                                     │   │
│  │  - traefik:service:request_rate                       │   │
│  │  - traefik:service:error_rate                         │   │
│  │  - traefik:service:p50_latency                        │   │
│  │  - traefik:service:p95_latency                        │   │
│  │  - traefik:service:p99_latency                        │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                              ▲
                              │ Query metrics
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                             │                                 │
│                      Grafana Dashboard                        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Dashboard: Traefik Homelab Monitoring                │   │
│  │  UID: traefik-homelab                                 │   │
│  │  File: grafana-dashboard.json                         │   │
│  │                                                        │   │
│  │  6 Panel Rows:                                        │   │
│  │  1. Overview (request rate, errors, latency)          │   │
│  │  2. Traffic (per-service, by status code)             │   │
│  │  3. Performance (latency percentiles, error rates)    │   │
│  │  4. Backend Health (server status table)              │   │
│  │  5. TLS Certificates (expiration tracking)            │   │
│  │  6. System Metrics (connections, config status)       │   │
│  │                                                        │   │
│  │  Features:                                            │   │
│  │  - Auto-refresh every 30s                             │   │
│  │  - Color-coded thresholds                             │   │
│  │  - Searchable/filterable panels                       │   │
│  │  - Mobile-friendly responsive design                  │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

1. **Prometheus Server** running and accessible
2. **Grafana** instance with admin access
3. **Traefik v3** deployed with metrics enabled

### Installation Steps

#### Step 1: Deploy Prometheus Scrape Configuration

Add Traefik scrape job to your Prometheus configuration:

```bash
# Option A: Merge with existing prometheus.yml
cat monitoring/prometheus-traefik.yml >> /etc/prometheus/prometheus.yml

# Option B: Include as separate file
# Add to prometheus.yml:
#   scrape_configs:
#     - <<: *traefik_scrape_config
# Then copy:
cp infrastructure/traefik/monitoring/prometheus-traefik.yml \
   /etc/prometheus/conf.d/traefik.yml
```

Restart Prometheus:
```bash
systemctl restart prometheus
# Or for Docker:
docker restart prometheus
```

Verify target is being scraped:
```bash
# Check Prometheus targets page
curl -s http://prometheus:9090/api/v1/targets | \
  jq '.data.activeTargets[] | select(.job=="traefik")'

# Should show "health": "up"
```

#### Step 2: Deploy Prometheus Alerting Rules

Add alerting rules to Prometheus:

```bash
# Copy alerting rules
cp infrastructure/traefik/monitoring/prometheus-rules.yml \
   /etc/prometheus/rules/traefik-alerts.yml

# Add rule file to prometheus.yml
# rule_files:
#   - '/etc/prometheus/rules/traefik-alerts.yml'
```

Restart Prometheus:
```bash
systemctl restart prometheus
```

Verify rules loaded:
```bash
# Check Prometheus rules page
curl -s http://prometheus:9090/api/v1/rules | \
  jq '.data.groups[] | select(.name | contains("traefik"))'
```

#### Step 3: Import Grafana Dashboard

**Via Grafana UI** (recommended for initial setup):

1. Open Grafana: `http://grafana.internal.lakehouse.wtf:3000`
2. Navigate: **☰ Menu** → **Dashboards** → **New** → **Import**
3. Upload: `infrastructure/traefik/monitoring/grafana-dashboard.json`
4. Select Prometheus data source
5. Click **Import**

**Via Grafana API** (for automation):

```bash
GRAFANA_URL="http://grafana.internal.lakehouse.wtf:3000"
GRAFANA_API_KEY="your-api-key"

curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @infrastructure/traefik/monitoring/grafana-dashboard.json
```

**Detailed instructions**: See `GRAFANA-DASHBOARD-SETUP.md`

#### Step 4: Verify Monitoring

1. **Check Prometheus Metrics**:
   ```bash
   # Query test metrics
   curl -s 'http://prometheus:9090/api/v1/query?query=up{job="traefik"}' | \
     jq '.data.result[0].value'

   # Should return: ["<timestamp>", "1"]
   ```

2. **View Grafana Dashboard**:
   ```
   Open: http://grafana:3000/d/traefik-homelab
   Verify: All panels showing data
   ```

3. **Test Alerting** (optional):
   ```bash
   # Stop Traefik temporarily to trigger alert
   docker stop traefik

   # Wait 1 minute, then check Prometheus alerts:
   curl -s http://prometheus:9090/api/v1/alerts | \
     jq '.data.alerts[] | select(.labels.alertname=="TraefikDown")'

   # Restart Traefik
   docker start traefik
   ```

---

## File Details

### prometheus-traefik.yml

**Purpose**: Prometheus scrape configuration for Traefik metrics endpoint

**Key Features**:
- Scrapes `http://192.168.1.110:8080/metrics` every 15 seconds
- Adds custom labels: `environment=homelab`, `role=reverse-proxy`
- Normalizes service names (removes `-service` suffix)
- Categorizes services by type (smart-home, infrastructure, documentation, monitoring)

**Installation Path**:
- LXC: `/etc/prometheus/prometheus.yml` (merge scrape_configs section)
- Docker: Mount as `/etc/prometheus/conf.d/traefik.yml`

**Usage**:
```bash
# Validate configuration
promtool check config /etc/prometheus/prometheus.yml

# Reload Prometheus without restart
curl -X POST http://prometheus:9090/-/reload
```

### prometheus-rules.yml

**Purpose**: Comprehensive alerting and recording rules for Traefik monitoring

**Alert Severity Levels**:
- **Critical**: Immediate action required (page/SMS/call)
  - Traefik down, backends down, high error rate
- **Warning**: Investigate within hours
  - High latency, cert expiring, config reload failed
- **Info**: For awareness/logging
  - Certificate renewed, backend recovered

**Recording Rules**: Pre-computed metrics for faster dashboard queries
- Request rates per service
- Error rates per service
- Latency percentiles (p50, p95, p99)

**Installation Path**: `/etc/prometheus/rules/traefik-alerts.yml`

**Usage**:
```bash
# Validate rules
promtool check rules /etc/prometheus/rules/traefik-alerts.yml

# Test alert expression
promtool query instant http://prometheus:9090 \
  'up{job="traefik"} == 0'
```

### grafana-dashboard.json

**Purpose**: Production-ready Grafana dashboard for Traefik monitoring

**Dashboard Specifications**:
- **UID**: `traefik-homelab`
- **Panels**: 13 panels across 6 rows
- **Refresh**: 30 seconds (configurable)
- **Time Range**: Last 1 hour (default)
- **Variables**: DS_PROMETHEUS (Prometheus data source selector)

**Panel Highlights**:
1. **Gauges**: Real-time status indicators with color-coded thresholds
2. **Time Series**: Trend visualization for traffic and performance
3. **Tables**: Detailed backend and certificate status
4. **Stats**: Configuration state and reload status

**Installation**: See `GRAFANA-DASHBOARD-SETUP.md` for detailed instructions

### GRAFANA-DASHBOARD-SETUP.md

**Purpose**: Comprehensive guide for installing and configuring the Grafana dashboard

**Contents**:
- Installation methods (UI, API, provisioning)
- Data source configuration
- Panel customization
- Troubleshooting guide
- Alert integration
- Performance optimization tips

---

## Monitoring Capabilities

### Metrics Collected

| Metric Category | Examples | Use Case |
|----------------|----------|----------|
| **Request Metrics** | `traefik_service_requests_total` | Track traffic volume per service |
| **Latency Metrics** | `traefik_service_request_duration_seconds_bucket` | Measure response times (p50, p95, p99) |
| **Error Metrics** | Filtered by `code=~"5.."` | Identify failing services |
| **Backend Health** | `traefik_service_server_up` | Monitor backend availability |
| **TLS Certificates** | `traefik_tls_certs_not_after` | Track certificate expiration |
| **Configuration** | `traefik_config_last_reload_successful` | Detect config issues |
| **Connections** | `traefik_entrypoint_open_connections` | Monitor load and capacity |

### Alert Coverage

**Service Availability**:
- ✅ Traefik proxy down (1 minute)
- ✅ Individual backend down (2 minutes)
- ✅ Critical services down (Home Assistant - 1 minute)

**Application Performance**:
- ✅ High error rate (>5% for 5 minutes)
- ✅ Moderate error rate (>1% for 10 minutes)
- ✅ High latency (p95 >1s for 10 minutes)

**Security & Certificates**:
- ✅ Certificate expiring soon (<14 days)
- ✅ Certificate renewed (info alert)

**System Health**:
- ✅ Configuration reload failed (5 minutes)
- ✅ High connection count (>500 for 15 minutes)

**Smart Home Specific**:
- ✅ Smart home services degraded (homeassistant, z2m, zwave-js-ui)

---

## Maintenance

### Updating Configurations

**Prometheus Scrape Config**:
```bash
# Edit configuration
vim infrastructure/traefik/monitoring/prometheus-traefik.yml

# Deploy to Prometheus
cp infrastructure/traefik/monitoring/prometheus-traefik.yml \
   /etc/prometheus/conf.d/traefik.yml

# Reload Prometheus
systemctl reload prometheus
# Or: curl -X POST http://prometheus:9090/-/reload
```

**Alert Rules**:
```bash
# Edit rules
vim infrastructure/traefik/monitoring/prometheus-rules.yml

# Validate rules
promtool check rules infrastructure/traefik/monitoring/prometheus-rules.yml

# Deploy rules
cp infrastructure/traefik/monitoring/prometheus-rules.yml \
   /etc/prometheus/rules/traefik-alerts.yml

# Reload Prometheus
systemctl reload prometheus
```

**Grafana Dashboard**:
```bash
# Update dashboard in Grafana UI, then export JSON:
# Dashboard → Share → Export → Save to file

# Save to repository
mv ~/Downloads/dashboard.json \
   infrastructure/traefik/monitoring/grafana-dashboard.json

# Commit changes
git add infrastructure/traefik/monitoring/grafana-dashboard.json
git commit -m "feat: update Traefik dashboard panels"
```

### Backup and Restore

**Backup All Monitoring Configs**:
```bash
# Create backup archive
tar -czf traefik-monitoring-backup-$(date +%Y%m%d).tar.gz \
  infrastructure/traefik/monitoring/

# Store in safe location
mv traefik-monitoring-backup-*.tar.gz ~/backups/
```

**Restore from Backup**:
```bash
# Extract backup
tar -xzf traefik-monitoring-backup-20251023.tar.gz

# Redeploy configurations
bash scripts/deploy-monitoring.sh
```

---

## Performance Considerations

### Metric Cardinality

**Estimated Time Series** (17 services):
- Request metrics: ~340 series (17 services × ~20 metrics)
- Entry points: ~150 series
- System metrics: ~50 series
- **Total**: ~500-800 unique time series

**Storage Requirements** (15s scrape interval, 30 day retention):
```
Daily samples: (86400 / 15) × 800 = 4,608,000
Storage per sample: ~2 bytes (compressed)
Daily storage: ~9 MB
Monthly storage (30 days): ~270 MB
```

**Prometheus Configuration**:
```yaml
storage:
  tsdb:
    retention.time: 30d
    retention.size: 10GB
```

### Query Optimization

**Use Recording Rules** for frequently-queried metrics:
```promql
# Instead of:
histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service))

# Use pre-computed:
traefik:service:p95_latency
```

**Reduce Query Load**:
- Use appropriate time ranges (don't query 30 days for real-time view)
- Limit panel refresh rates for infrequently changing data
- Use min_step parameter to reduce data points

---

## Troubleshooting

### Common Issues

**1. Prometheus not scraping Traefik**

Check targets page:
```bash
curl -s http://prometheus:9090/api/v1/targets | \
  jq '.data.activeTargets[] | select(.job=="traefik")'
```

If target is down:
- Verify Traefik metrics endpoint: `curl http://192.168.1.110:8080/metrics`
- Check firewall: `telnet 192.168.1.110 8080`
- Review Prometheus logs: `journalctl -u prometheus -f`

**2. Alerts not firing**

Verify rules loaded:
```bash
curl -s http://prometheus:9090/api/v1/rules | \
  jq '.data.groups[] | select(.name | contains("traefik"))'
```

Test alert expression manually:
```bash
promtool query instant http://prometheus:9090 \
  'traefik_service_server_up == 0'
```

**3. Grafana dashboard shows "No Data"**

Check data source connection:
- Grafana → Connections → Data sources → Prometheus
- Click "Save & test"
- Should show: "Data source is working"

Verify metrics exist:
```bash
curl -s 'http://prometheus:9090/api/v1/query?query=traefik_service_requests_total' | \
  jq '.data.result | length'

# Should return: > 0
```

**4. Certificate metrics missing**

Normal if Traefik hasn't generated certificates yet. Metrics will appear after:
- Traefik starts with ACME configured
- First certificate is generated via Let's Encrypt
- Usually within 5-10 minutes of first service access

---

## Future Enhancements

### Planned Improvements

1. **Log Aggregation** (Post-Migration):
   - Integrate Loki for Traefik access logs
   - Add log panels to Grafana dashboard
   - Correlate metrics with log events

2. **Distributed Tracing** (Future):
   - Configure Traefik with Tempo/Jaeger
   - Add trace panels to dashboard
   - End-to-end request tracing

3. **Alerting Expansion**:
   - Add Slack/Discord webhook notifications
   - Implement PagerDuty integration for critical alerts
   - Create alert runbooks

4. **Dashboard Enhancements**:
   - Add service dependency graph
   - Create drill-down dashboards per service
   - Implement dark mode optimizations

---

## Related Documentation

- **Research**: `../../docs/traefik/TRAEFIK-METRICS-RESEARCH.md`
- **LXC Setup**: `../../docs/traefik/LXC-CONTAINER-SETUP.md`
- **Migration Plan**: `../../docs/traefik/MIGRATION-PLAN.md`

---

## References

- [Traefik Prometheus Metrics](https://doc.traefik.io/traefik/observability/metrics/prometheus/)
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/overview/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [PromQL Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Phase**: Phase 1 - Discovery
**Status**: ✅ Ready for Deployment

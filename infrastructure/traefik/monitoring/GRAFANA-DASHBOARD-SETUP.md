# Grafana Dashboard Setup for Traefik Monitoring

**Dashboard Name**: Traefik Homelab Monitoring
**Dashboard UID**: `traefik-homelab`
**Target Grafana Version**: 10.0+
**Created**: 2025-10-23

---

## Dashboard Overview

This Grafana dashboard provides comprehensive monitoring for Traefik v3 reverse proxy in a homelab environment. It visualizes key metrics including request rates, error rates, latency percentiles, backend health, and TLS certificate status.

### Dashboard Panels

The dashboard is organized into 6 sections:

1. **Overview Row**:
   - Total Request Rate (gauge)
   - 5xx Error Rate (gauge with thresholds)
   - p95 Latency (gauge)
   - Backends Down Count (gauge)

2. **Traffic Row**:
   - Request Rate by Service (time series)
   - Requests by HTTP Status Code (stacked area chart)

3. **Performance Row**:
   - Latency Percentiles by Service (p50 and p95, time series)
   - Error Rate by Service (time series)

4. **Backend Health Row**:
   - Backend Server Status (table with color-coded status)

5. **TLS Certificates Row**:
   - Certificate Expiration (table with days until expiry, color-coded)

6. **System Metrics Row**:
   - Open Connections (HTTPS entrypoint, time series)
   - Configuration Objects (routers, services, middlewares counts)
   - Last Config Reload Status (stat panel)

---

## Prerequisites

### Required Components

1. **Grafana Instance**:
   - Version 10.0 or higher
   - Running and accessible via web browser
   - Admin or Editor permissions required

2. **Prometheus Data Source**:
   - Prometheus server configured and scraping Traefik metrics
   - Prometheus accessible from Grafana
   - Scrape configuration deployed (see `prometheus-traefik.yml`)

3. **Traefik Instance**:
   - Traefik v3 with Prometheus metrics enabled
   - Metrics endpoint accessible at `http://192.168.1.110:8080/metrics`
   - Static configuration includes metrics section

---

## Installation Methods

### Method 1: Import via Grafana UI (Recommended)

1. **Access Grafana**:
   ```
   Open browser: http://<grafana-server>:3000
   Login with admin credentials
   ```

2. **Navigate to Dashboards**:
   - Click **☰ Menu** (hamburger menu) → **Dashboards**
   - Click **New** → **Import**

3. **Upload Dashboard JSON**:
   - Click **Upload JSON file**
   - Select: `infrastructure/traefik/monitoring/grafana-dashboard.json`
   - Or paste the JSON content directly into the text area

4. **Configure Dashboard**:
   - **Name**: Traefik Homelab Monitoring (default)
   - **Folder**: Select folder or leave in General
   - **UID**: `traefik-homelab` (auto-filled)
   - **Datasource**: Select your Prometheus data source from dropdown

5. **Import Dashboard**:
   - Click **Import** button
   - Dashboard will open automatically

### Method 2: Import via Grafana API

```bash
# Set variables
GRAFANA_URL="http://grafana.internal.lakehouse.wtf"
GRAFANA_API_KEY="your-api-key-here"
DASHBOARD_FILE="infrastructure/traefik/monitoring/grafana-dashboard.json"

# Import dashboard
curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$DASHBOARD_FILE"
```

### Method 3: Provisioning (GitOps Approach)

1. **Create Provisioning Directory**:
   ```bash
   mkdir -p /etc/grafana/provisioning/dashboards
   mkdir -p /var/lib/grafana/dashboards
   ```

2. **Copy Dashboard JSON**:
   ```bash
   cp infrastructure/traefik/monitoring/grafana-dashboard.json \
      /var/lib/grafana/dashboards/traefik-homelab.json
   ```

3. **Create Provisioning Configuration**:
   ```yaml
   # /etc/grafana/provisioning/dashboards/traefik.yml
   apiVersion: 1

   providers:
     - name: 'Traefik Monitoring'
       orgId: 1
       folder: 'Homelab'
       type: file
       disableDeletion: false
       updateIntervalSeconds: 10
       allowUiUpdates: true
       options:
         path: /var/lib/grafana/dashboards
         foldersFromFilesStructure: false
   ```

4. **Restart Grafana**:
   ```bash
   systemctl restart grafana-server
   ```

---

## Prometheus Data Source Configuration

### Add Prometheus Data Source

If not already configured:

1. **Navigate to Data Sources**:
   - Click **☰ Menu** → **Connections** → **Data sources**
   - Click **Add data source**
   - Select **Prometheus**

2. **Configure Prometheus**:
   ```yaml
   Name: Prometheus
   URL: http://prometheus.internal.lakehouse.wtf:9090
   Access: Server (default)
   Scrape interval: 15s
   ```

3. **Test Connection**:
   - Click **Save & test**
   - Should show: "Data source is working"

### Verify Traefik Metrics

Before importing dashboard, verify metrics are being scraped:

1. **Check Prometheus Targets**:
   ```
   Open: http://prometheus.internal.lakehouse.wtf:9090/targets
   Verify: "traefik" job is UP (green)
   ```

2. **Query Test Metrics**:
   ```
   Open: http://prometheus.internal.lakehouse.wtf:9090/graph
   Query: traefik_service_requests_total
   Verify: Returns data
   ```

---

## Dashboard Configuration

### Panel Customization

After import, you can customize panels to fit your environment:

**Adjust Gauge Thresholds**:
```yaml
5xx Error Rate Gauge:
  - Green: 0-1%
  - Yellow: 1-5%
  - Red: >5%

p95 Latency Gauge:
  - Green: <500ms
  - Yellow: 500-1000ms
  - Red: >1000ms
```

**Modify Time Ranges**:
- Default: Last 1 hour
- Adjust via time picker (top right)
- Available presets: 5m, 15m, 1h, 6h, 24h, 7d, 30d

**Change Refresh Rate**:
- Default: 30 seconds
- Options: 5s, 10s, 30s, 1m, 5m, Off

### Variable Configuration

The dashboard includes one variable:

**DS_PROMETHEUS**:
- Type: Datasource
- Query: prometheus
- Purpose: Allows switching between multiple Prometheus instances
- Auto-selected: Yes

To add more variables (e.g., service filter):

1. Click **⚙️ Settings** (gear icon)
2. Navigate to **Variables** tab
3. Click **Add variable**
4. Configure:
   ```yaml
   Name: service
   Type: Query
   Data source: Prometheus
   Query: label_values(traefik_service_requests_total, service)
   Multi-value: Yes
   Include All option: Yes
   ```
5. Add `{service=~"$service"}` to panel queries

---

## Troubleshooting

### Dashboard Shows "No Data"

**Cause 1: Prometheus data source not configured**
```bash
# Solution: Add Prometheus data source in Grafana
Settings → Data sources → Add data source → Prometheus
```

**Cause 2: Traefik metrics not being scraped**
```bash
# Verify Prometheus is scraping Traefik
curl http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | select(.job=="traefik")'

# Should return:
{
  "health": "up",
  "lastScrape": "...",
  "scrapeUrl": "http://192.168.1.110:8080/metrics"
}
```

**Cause 3: Traefik metrics endpoint not accessible**
```bash
# Test Traefik metrics endpoint
curl http://192.168.1.110:8080/metrics | head -20

# Should return Prometheus metrics:
# HELP traefik_service_requests_total ...
# TYPE traefik_service_requests_total counter
traefik_service_requests_total{...} 1234
```

### Panels Show Error "Template variables could not be initialized"

**Solution**: Edit dashboard settings and ensure DS_PROMETHEUS variable points to valid Prometheus datasource:

1. Dashboard Settings → Variables
2. Edit `DS_PROMETHEUS`
3. Verify query returns datasource
4. Save dashboard

### Certificate Expiration Panel Empty

**Cause**: No TLS certificates configured yet

**Solution**: Wait for Traefik to generate Let's Encrypt certificates after deployment. Panel will populate automatically once `traefik_tls_certs_not_after` metric becomes available.

### Backend Health Table Shows No Backends

**Cause**: No services configured in Traefik dynamic configuration

**Solution**: Deploy Traefik dynamic configuration with service definitions. The `traefik_service_server_up` metric will appear once backends are configured.

---

## Dashboard Maintenance

### Updating the Dashboard

**Via UI**:
1. Edit dashboard panels as needed
2. Click **💾 Save dashboard** (disk icon)
3. Add change description
4. Click **Save**

**Via JSON Export**:
1. Click **⚙️ Settings** → **JSON Model**
2. Copy updated JSON
3. Save to: `infrastructure/traefik/monitoring/grafana-dashboard.json`
4. Commit to Git

### Version Control

The dashboard JSON is stored in Git for version control:

```bash
# Track changes
git add infrastructure/traefik/monitoring/grafana-dashboard.json
git commit -m "feat: update Traefik dashboard panels"

# Restore previous version if needed
git checkout HEAD~1 infrastructure/traefik/monitoring/grafana-dashboard.json
```

### Backup Dashboard

Export dashboard for backup:

```bash
# Via API
curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "http://grafana:3000/api/dashboards/uid/traefik-homelab" \
  | jq '.dashboard' > traefik-dashboard-backup.json

# Via UI
Dashboard → Share → Export → Save to file
```

---

## Alert Integration

### Link Prometheus Alerts to Dashboard

The dashboard works seamlessly with Prometheus alerting rules defined in `prometheus-rules.yml`:

1. **View Active Alerts**:
   - Alerts appear in Grafana **Alerting** menu
   - Linked to specific dashboard panels

2. **Add Alert Annotations**:
   ```yaml
   # In prometheus-rules.yml annotations
   annotations:
     dashboard_url: "http://grafana:3000/d/traefik-homelab"
     panel_url: "http://grafana:3000/d/traefik-homelab?viewPanel=<panel_id>"
   ```

3. **Configure Alert Notifications**:
   - Grafana → Alerting → Contact points
   - Add email, Slack, Discord, etc.
   - Link to Prometheus alert rules

---

## Performance Optimization

### Query Optimization

For large deployments with many services, optimize queries:

**Use Recording Rules**:
```yaml
# Already defined in prometheus-rules.yml
- record: traefik:service:request_rate
  expr: sum(rate(traefik_service_requests_total[5m])) by (service)

- record: traefik:service:p95_latency
  expr: histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service))
```

**Update Dashboard to Use Recording Rules**:
```yaml
# Change panel query from:
sum(rate(traefik_service_requests_total[5m])) by (service)

# To:
traefik:service:request_rate
```

### Dashboard Performance

**Reduce Data Points**:
- Decrease time range for detailed views
- Increase scrape interval for long-term trends
- Use min_step parameter in queries

**Limit Panel Count**:
- Collapse unused rows
- Use panel links to separate dashboards for deep-dives

---

## Advanced Features

### Add Logs Panel (Loki Integration)

If using Loki for log aggregation:

1. **Add Loki Data Source** in Grafana
2. **Create New Panel**:
   ```yaml
   Title: Traefik Logs
   Visualization: Logs
   Data source: Loki
   Query: {job="traefik"} |= ""
   ```

### Add Traces Panel (Tempo Integration)

For distributed tracing:

1. **Configure Traefik with Tempo** (future enhancement)
2. **Add Tempo Data Source** in Grafana
3. **Link traces to metrics panels**

### Multi-Cluster Support

To monitor multiple Traefik instances:

1. **Add Cluster Variable**:
   ```yaml
   Name: cluster
   Type: Custom
   Values: cluster1,cluster2,cluster3
   ```

2. **Update Prometheus Scrape Config**:
   ```yaml
   static_configs:
     - targets: ['traefik1:8080']
       labels:
         cluster: 'cluster1'
     - targets: ['traefik2:8080']
       labels:
         cluster: 'cluster2'
   ```

3. **Filter Panels by Cluster**:
   ```promql
   sum(rate(traefik_service_requests_total{cluster="$cluster"}[5m])) by (service)
   ```

---

## References

- [Grafana Dashboard Documentation](https://grafana.com/docs/grafana/latest/dashboards/)
- [Prometheus Query Functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)
- [Traefik Metrics Documentation](https://doc.traefik.io/traefik/observability/metrics/prometheus/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Maintainer**: Migration Team
**Next Review**: After Traefik deployment

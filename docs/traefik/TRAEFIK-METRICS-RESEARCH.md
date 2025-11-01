# Traefik Metrics and Monitoring Research

**Research Date**: 2025-10-23
**Traefik Version**: v3.0+
**Purpose**: Document Traefik's monitoring capabilities for Phase 1 discovery

---

## Executive Summary

Traefik v3 includes built-in Prometheus metrics exporter providing comprehensive observability for reverse proxy operations. This research documents available metrics, configuration requirements, and recommended monitoring approach for the homelab migration.

**Key Findings**:
- ✅ Built-in Prometheus metrics (no additional exporters needed)
- ✅ Per-service, per-router, and per-entrypoint metrics
- ✅ Request rates, error rates, and latency histograms
- ✅ Backend health and connection pool metrics
- ✅ TLS certificate information and expiration tracking

---

## Traefik Metrics Architecture

### Metrics Endpoint

**Default Endpoint**: `http://<traefik>:8080/metrics`
**Format**: Prometheus text exposition format
**Authentication**: Can be secured via basic auth middleware
**Update Interval**: Real-time (updated on each request)

### Metrics Categories

| Category | Description | Cardinality |
|----------|-------------|-------------|
| **Request Metrics** | HTTP request rates, durations, sizes | High (per service/router) |
| **Service Metrics** | Backend health, connection pools | Medium (per service) |
| **Entry Point Metrics** | Traffic by entry point (http/https) | Low (per entry point) |
| **TLS Metrics** | Certificate status, handshake times | Medium (per certificate) |
| **Config Metrics** | Last reload time, configuration version | Very low |

---

## Core Prometheus Metrics

### Request Metrics

```prometheus
# Total HTTP requests
traefik_service_requests_total{
  code="200",
  method="GET",
  protocol="http",
  service="homeassistant-service"
}

# Request duration histogram (seconds)
traefik_service_request_duration_seconds_bucket{
  code="200",
  le="0.1",                    # Latency bucket (100ms)
  service="homeassistant-service"
}

# Request size histogram (bytes)
traefik_service_requests_bytes_total{
  code="200",
  method="GET",
  protocol="http",
  service="homeassistant-service"
}

# Response size histogram (bytes)
traefik_service_responses_bytes_total{
  code="200",
  method="GET",
  protocol="http",
  service="homeassistant-service"
}
```

### Service Backend Metrics

```prometheus
# Backend server UP/DOWN status
traefik_service_server_up{
  service="homeassistant-service",
  url="http://192.168.1.155:8123"
} # 1 = up, 0 = down

# Open connections to backend
traefik_service_open_connections{
  service="homeassistant-service"
}

# Retries attempted
traefik_service_retries_total{
  service="homeassistant-service"
}
```

### Entry Point Metrics

```prometheus
# Requests by entry point
traefik_entrypoint_requests_total{
  code="200",
  entrypoint="websecure",
  method="GET",
  protocol="http"
}

# Request duration by entry point
traefik_entrypoint_request_duration_seconds_bucket{
  code="200",
  entrypoint="websecure",
  le="0.1"
}

# Open connections per entry point
traefik_entrypoint_open_connections{
  entrypoint="websecure",
  method="GET",
  protocol="http"
}
```

### TLS Metrics

```prometheus
# TLS certificate expiration (Unix timestamp)
traefik_tls_certs_not_after{
  cn="*.internal.lakehouse.wtf",
  sans="*.internal.lakehouse.wtf"
}

# Certificate auto-renew failures (if using ACME)
traefik_tls_certs_renew_error{
  cn="*.internal.lakehouse.wtf"
}
```

### Configuration Metrics

```prometheus
# Last configuration reload timestamp
traefik_config_last_reload_success

# Last configuration reload status (1 = success, 0 = failure)
traefik_config_last_reload_successful

# Current number of configured routers/services/middlewares
traefik_config_http_routers_total
traefik_config_http_services_total
traefik_config_http_middlewares_total
```

---

## Traefik Configuration for Prometheus

### Static Configuration (traefik.yml)

```yaml
metrics:
  prometheus:
    # Enable Prometheus metrics
    addEntryPointsLabels: true      # Include entrypoint labels
    addRoutersLabels: true           # Include router labels
    addServicesLabels: true          # Include service labels

    # Optional: Custom buckets for latency histogram
    buckets:
      - 0.005    # 5ms
      - 0.01     # 10ms
      - 0.025    # 25ms
      - 0.05     # 50ms
      - 0.1      # 100ms
      - 0.25     # 250ms
      - 0.5      # 500ms
      - 1.0      # 1s
      - 2.5      # 2.5s
      - 5.0      # 5s
      - 10.0     # 10s

    # Optional: Expose on specific port/path
    entryPoint: metrics            # Expose on 'metrics' entrypoint
    manualRouting: false           # Auto-expose on /metrics

# Define dedicated metrics entrypoint (optional)
entryPoints:
  metrics:
    address: ":8080"               # Internal metrics endpoint
```

### Securing Metrics Endpoint

```yaml
# Option 1: IP whitelist via middleware
http:
  routers:
    metrics:
      rule: PathPrefix(`/metrics`)
      service: prometheus@internal
      middlewares:
        - metrics-whitelist
      entryPoints:
        - metrics

  middlewares:
    metrics-whitelist:
      ipWhiteList:
        sourceRange:
          - "192.168.1.0/24"       # Local network only
          - "192.168.1.100"         # Prometheus server

# Option 2: Basic authentication
http:
  middlewares:
    metrics-auth:
      basicAuth:
        users:
          - "prometheus:$apr1$..." # htpasswd generated hash
```

---

## Useful Metric Queries for Homelab

### Request Rate

```promql
# Total requests per second
sum(rate(traefik_service_requests_total[5m]))

# Requests per second by service
sum(rate(traefik_service_requests_total[5m])) by (service)

# Requests per second by HTTP status code
sum(rate(traefik_service_requests_total[5m])) by (code)
```

### Error Rate

```promql
# 5xx error rate (%)
100 * (
  sum(rate(traefik_service_requests_total{code=~"5.."}[5m]))
  /
  sum(rate(traefik_service_requests_total[5m]))
)

# Error rate per service
sum(rate(traefik_service_requests_total{code=~"5.."}[5m])) by (service)
```

### Latency

```promql
# p50 latency (median)
histogram_quantile(0.50,
  sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service)
)

# p95 latency
histogram_quantile(0.95,
  sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service)
)

# p99 latency
histogram_quantile(0.99,
  sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service)
)
```

### Backend Health

```promql
# Unhealthy services (0 = down, 1 = up)
traefik_service_server_up == 0

# Count of healthy backends per service
sum(traefik_service_server_up) by (service)
```

### Traffic Volume

```promql
# Bytes received per second
sum(rate(traefik_service_requests_bytes_total[5m]))

# Bytes sent per second
sum(rate(traefik_service_responses_bytes_total[5m]))

# Total bandwidth (in/out)
sum(rate(traefik_service_requests_bytes_total[5m]))
+ sum(rate(traefik_service_responses_bytes_total[5m]))
```

### Certificate Expiration

```promql
# Days until certificate expiration
(traefik_tls_certs_not_after - time()) / 86400

# Certificates expiring in < 30 days
(traefik_tls_certs_not_after - time()) / 86400 < 30
```

---

## Recommended Alerts

### Critical Alerts

```yaml
groups:
  - name: traefik_critical
    interval: 30s
    rules:
      - alert: TraefikDown
        expr: up{job="traefik"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Traefik is down"
          description: "Traefik has been down for more than 1 minute"

      - alert: TraefikHighErrorRate
        expr: |
          100 * (
            sum(rate(traefik_service_requests_total{code=~"5.."}[5m]))
            /
            sum(rate(traefik_service_requests_total[5m]))
          ) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate (>5%)"
          description: "{{ $value | printf \"%.2f\" }}% of requests are failing"

      - alert: TraefikBackendDown
        expr: traefik_service_server_up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Backend {{ $labels.service }} is down"
          description: "Backend for {{ $labels.service }} has been down for 2+ minutes"
```

### Warning Alerts

```yaml
      - alert: TraefikHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le, service)
          ) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High p95 latency (>1s) on {{ $labels.service }}"
          description: "p95 latency is {{ $value | printf \"%.2f\" }}s"

      - alert: TraefikCertExpiringSoon
        expr: (traefik_tls_certs_not_after - time()) / 86400 < 14
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "TLS certificate expiring soon"
          description: "Certificate {{ $labels.cn }} expires in {{ $value | printf \"%.0f\" }} days"

      - alert: TraefikConfigReloadFailed
        expr: traefik_config_last_reload_successful == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Traefik configuration reload failed"
          description: "Last configuration reload failed"
```

---

## Grafana Dashboard Components

### Recommended Dashboard Panels

**1. Overview Row**:
- Total request rate (single stat)
- Error rate percentage (gauge)
- p95 latency (single stat)
- Active connections (single stat)

**2. Traffic Row**:
- Request rate over time (graph)
- Requests by HTTP status code (stacked graph)
- Bandwidth in/out (graph)

**3. Performance Row**:
- Latency percentiles (p50, p95, p99) over time (graph)
- Request duration heatmap
- Slow requests (table of highest latency)

**4. Services Row**:
- Request rate by service (stacked graph)
- Backend health status (stat/gauge grid)
- Top services by traffic (table)
- Service error rates (graph)

**5. TLS/Security Row**:
- Certificate expiration countdown (gauge grid)
- TLS handshake time (graph)
- HTTP vs HTTPS traffic ratio (pie chart)

**6. System Row**:
- Entry point traffic (graph)
- Configuration reload events (graph)
- Active middlewares (stat)

---

## Integration with Existing Monitoring

### Prometheus Configuration

```yaml
# /etc/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'traefik'
    static_configs:
      - targets: ['192.168.1.110:8080']
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: /metrics

    # Optional: Relabeling for better organization
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'traefik'
      - target_label: environment
        replacement: 'homelab'
```

### Service Discovery (Advanced)

```yaml
# If using Docker service discovery
scrape_configs:
  - job_name: 'traefik'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        filters:
          - name: name
            values: ['traefik']
    relabel_configs:
      - source_labels: [__meta_docker_container_name]
        target_label: container
```

---

## Metric Retention and Storage

### Storage Requirements

**Estimated Metrics Count**: ~500-800 unique time series
- 17 services × ~20 metrics each = ~340 series
- Entry points, routers, middlewares = ~150 series
- System/config metrics = ~50 series
- Buffer for growth = ~100 series

**Storage Calculation** (15s scrape interval, 30 day retention):
```
Samples per day = (86400 / 15) * 800 = 4,608,000
Storage per sample ≈ 2 bytes (compressed)
Daily storage ≈ 9 MB
Monthly storage (30 days) ≈ 270 MB
```

### Retention Policy

```yaml
# Prometheus configuration
storage:
  tsdb:
    retention.time: 30d        # Keep 30 days of metrics
    retention.size: 10GB       # Or max 10GB (whichever comes first)
```

---

## Comparison with Caddy Metrics

| Feature | Caddy | Traefik | Advantage |
|---------|-------|---------|-----------|
| **Built-in Prometheus** | ✅ Yes | ✅ Yes | Tie |
| **Per-service metrics** | ❌ Limited | ✅ Full | Traefik |
| **Latency histograms** | ❌ No | ✅ Yes | Traefik |
| **Backend health** | ✅ Yes | ✅ Yes | Tie |
| **Error rate tracking** | ❌ Limited | ✅ Yes | Traefik |
| **TLS cert expiry** | ❌ No | ✅ Yes | Traefik |
| **Request body/response size** | ❌ No | ✅ Yes | Traefik |
| **Retry metrics** | ❌ No | ✅ Yes | Traefik |

**Winner**: Traefik (significantly better observability)

---

## Recommendations

### Minimum Viable Monitoring

For Phase 2 deployment:
1. ✅ Enable Prometheus metrics with default buckets
2. ✅ Configure Prometheus scraping every 15s
3. ✅ Deploy basic Grafana dashboard (traffic, errors, latency)
4. ✅ Set up critical alerts (Traefik down, backends down)

### Enhanced Monitoring (Post-Migration)

After migration stabilizes:
1. Tune histogram buckets based on observed latency
2. Add detailed per-service dashboards
3. Implement full alert suite (critical + warning + info)
4. Set up log aggregation (Loki integration)
5. Add distributed tracing (Jaeger/Tempo)

### Performance Impact

**Metrics Collection Overhead**:
- CPU: < 1% additional
- Memory: ~20-50 MB for metrics storage
- Network: ~1-2 KB/s for Prometheus scraping
- **Total Impact**: Negligible (< 2% resource overhead)

---

## Next Steps

1. **Task 1.3.2**: Create Prometheus scrape configuration
2. **Task 1.3.3**: Select/create Grafana dashboard template
3. **Phase 2**: Deploy Traefik with metrics enabled
4. **Phase 2**: Validate metrics collection
5. **Phase 3**: Set up alerting rules

---

## References

- [Traefik Prometheus Metrics](https://doc.traefik.io/traefik/observability/metrics/prometheus/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Next Review**: After Traefik deployment

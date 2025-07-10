#!/bin/bash
set -euo pipefail

# ------------------------------------------------------------------
# Phase 2 Monitoring and Alerting Setup Script
# ------------------------------------------------------------------

# Configuration
MONITORING_DIR="/opt/gitops/monitoring"
LOGS_DIR="/opt/gitops/logs"
SETUP_LOG="$LOGS_DIR/monitoring-setup-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$SETUP_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$SETUP_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$SETUP_LOG"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$SETUP_LOG"
}

# Create directories
mkdir -p "$MONITORING_DIR" "$LOGS_DIR"

log "📊 Setting up Phase 2 monitoring and alerting..."

# Create Prometheus metrics configuration
log "📈 Creating Prometheus metrics configuration..."
cat > "$MONITORING_DIR/prometheus-phase2.yml" << EOF
# Phase 2 Prometheus Configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "phase2-alerts.yml"

scrape_configs:
  - job_name: 'gitops-audit-api'
    static_configs:
      - targets: ['localhost:3070']
    metrics_path: '/api/v2/metrics/prometheus'
    scrape_interval: 30s
    
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
    scrape_interval: 30s
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
    scrape_interval: 30s
    
  - job_name: 'nginx'
    static_configs:
      - targets: ['localhost:9113']
    scrape_interval: 30s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

EOF

# Create Phase 2 alerting rules
log "🚨 Creating Phase 2 alerting rules..."
cat > "$MONITORING_DIR/phase2-alerts.yml" << EOF
groups:
  - name: gitops-audit-phase2
    rules:
      # API Health Alerts
      - alert: APIServiceDown
        expr: up{job="gitops-audit-api"} == 0
        for: 1m
        labels:
          severity: critical
          component: api
        annotations:
          summary: "GitOps Audit API is down"
          description: "The GitOps Audit API service has been down for more than 1 minute."
          
      - alert: APIHighResponseTime
        expr: http_request_duration_seconds{quantile="0.95"} > 2
        for: 5m
        labels:
          severity: warning
          component: api
        annotations:
          summary: "High API response time"
          description: "95th percentile response time is {{ \$value }}s for more than 5 minutes."
          
      - alert: APIHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
          component: api
        annotations:
          summary: "High API error rate"
          description: "API error rate is {{ \$value | humanizePercentage }} for more than 2 minutes."

      # Pipeline Management Alerts
      - alert: PipelineFailureRate
        expr: rate(pipeline_runs_total{status="failed"}[10m]) / rate(pipeline_runs_total[10m]) > 0.2
        for: 5m
        labels:
          severity: warning
          component: pipeline
        annotations:
          summary: "High pipeline failure rate"
          description: "Pipeline failure rate is {{ \$value | humanizePercentage }} for repository {{ \$labels.repository }}."
          
      - alert: PipelineStalledRuns
        expr: pipeline_runs_running_duration_seconds > 3600
        for: 5m
        labels:
          severity: warning
          component: pipeline
        annotations:
          summary: "Pipeline run stalled"
          description: "Pipeline run {{ \$labels.run_id }} has been running for more than 1 hour."

      # Compliance Alerts
      - alert: ComplianceScoreDropped
        expr: avg_over_time(compliance_score[1h]) < 70
        for: 10m
        labels:
          severity: critical
          component: compliance
        annotations:
          summary: "Repository compliance score dropped"
          description: "Average compliance score for {{ \$labels.repository }} is {{ \$value }} (below 70%)."
          
      - alert: ComplianceCheckFailed
        expr: compliance_check_failures_total > 5
        for: 5m
        labels:
          severity: warning
          component: compliance
        annotations:
          summary: "Multiple compliance check failures"
          description: "{{ \$value }} compliance checks have failed for {{ \$labels.repository }}."

      # WebSocket Alerts
      - alert: WebSocketHighConnections
        expr: websocket_connections_active > 100
        for: 2m
        labels:
          severity: warning
          component: websocket
        annotations:
          summary: "High number of WebSocket connections"
          description: "{{ \$value }} active WebSocket connections detected."
          
      - alert: WebSocketConnectionFailures
        expr: rate(websocket_connection_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
          component: websocket
        annotations:
          summary: "High WebSocket connection failure rate"
          description: "WebSocket connection failure rate is {{ \$value }} per second."

      # Database Alerts
      - alert: DatabaseConnectionPoolExhausted
        expr: db_connections_active / db_connections_max > 0.8
        for: 2m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "Database connection pool is {{ \$value | humanizePercentage }} full."
          
      - alert: DatabaseSlowQueries
        expr: pg_stat_activity_max_tx_duration > 300
        for: 5m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Slow database queries detected"
          description: "Maximum transaction duration is {{ \$value }}s."

      # Orchestration Alerts
      - alert: OrchestrationJobsBacklog
        expr: orchestration_jobs_pending > 50
        for: 5m
        labels:
          severity: warning
          component: orchestration
        annotations:
          summary: "High number of pending orchestration jobs"
          description: "{{ \$value }} orchestration jobs are pending execution."
          
      - alert: OrchestrationJobFailures
        expr: rate(orchestration_jobs_failed_total[10m]) > 0.1
        for: 5m
        labels:
          severity: warning
          component: orchestration
        annotations:
          summary: "High orchestration job failure rate"
          description: "Orchestration job failure rate is {{ \$value }} per second."

      # System Resource Alerts
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.8
        for: 5m
        labels:
          severity: warning
          component: system
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ \$value | humanizePercentage }} for more than 5 minutes."
          
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
          component: system
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ \$value }}% for more than 10 minutes."
          
      - alert: LowDiskSpace
        expr: (node_filesystem_free_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: critical
          component: system
        annotations:
          summary: "Low disk space"
          description: "Disk space is {{ \$value | humanizePercentage }} free on {{ \$labels.mountpoint }}."

      # Phase 2 Feature Alerts
      - alert: RealTimeUpdatesDown
        expr: realtime_updates_active == 0
        for: 2m
        labels:
          severity: warning
          component: realtime
        annotations:
          summary: "Real-time updates service is down"
          description: "Real-time updates service is not active."
          
      - alert: MetricsCollectionDown
        expr: rate(metrics_collected_total[5m]) == 0
        for: 5m
        labels:
          severity: warning
          component: metrics
        annotations:
          summary: "Metrics collection stopped"
          description: "No metrics have been collected for more than 5 minutes."

EOF

# Create Grafana dashboard configuration
log "📊 Creating Grafana dashboard configuration..."
cat > "$MONITORING_DIR/grafana-phase2-dashboard.json" << EOF
{
  "dashboard": {
    "id": null,
    "title": "GitOps Audit - Phase 2 Dashboard",
    "tags": ["gitops", "phase2"],
    "timezone": "browser",
    "refresh": "30s",
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "API Health",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"gitops-audit-api\"}",
            "legendFormat": "API Status"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              {
                "options": {
                  "0": {"text": "Down", "color": "red"},
                  "1": {"text": "Up", "color": "green"}
                },
                "type": "value"
              }
            ]
          }
        },
        "gridPos": {"h": 4, "w": 6, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "Requests/sec"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 6, "y": 0}
      },
      {
        "id": 3,
        "title": "Pipeline Status",
        "type": "stat",
        "targets": [
          {
            "expr": "pipeline_runs_total",
            "legendFormat": "Total Runs"
          },
          {
            "expr": "pipeline_runs_total{status=\"success\"}",
            "legendFormat": "Successful"
          },
          {
            "expr": "pipeline_runs_total{status=\"failed\"}",
            "legendFormat": "Failed"
          }
        ],
        "gridPos": {"h": 4, "w": 6, "x": 18, "y": 0}
      },
      {
        "id": 4,
        "title": "Compliance Score",
        "type": "gauge",
        "targets": [
          {
            "expr": "avg(compliance_score)",
            "legendFormat": "Average Score"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "min": 0,
            "max": 100,
            "thresholds": {
              "steps": [
                {"color": "red", "value": 0},
                {"color": "yellow", "value": 50},
                {"color": "green", "value": 80}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 0, "y": 4}
      },
      {
        "id": 5,
        "title": "WebSocket Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "websocket_connections_active",
            "legendFormat": "Active Connections"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 6, "y": 8}
      },
      {
        "id": 6,
        "title": "Database Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_activity_count",
            "legendFormat": "Active Connections"
          },
          {
            "expr": "rate(pg_stat_database_xact_commit[5m])",
            "legendFormat": "Commits/sec"
          }
        ],
        "gridPos": {"h": 8, "w": 6, "x": 18, "y": 4}
      },
      {
        "id": 7,
        "title": "Orchestration Jobs",
        "type": "stat",
        "targets": [
          {
            "expr": "orchestration_jobs_pending",
            "legendFormat": "Pending"
          },
          {
            "expr": "orchestration_jobs_running",
            "legendFormat": "Running"
          },
          {
            "expr": "rate(orchestration_jobs_completed_total[5m])",
            "legendFormat": "Completed/sec"
          }
        ],
        "gridPos": {"h": 4, "w": 12, "x": 0, "y": 12}
      },
      {
        "id": 8,
        "title": "System Resources",
        "type": "graph",
        "targets": [
          {
            "expr": "(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100",
            "legendFormat": "Memory %"
          },
          {
            "expr": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "CPU %"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 12}
      }
    ]
  }
}
EOF

# Create monitoring script
log "📈 Creating monitoring script..."
cat > "$MONITORING_DIR/monitor-phase2.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

# Phase 2 Monitoring Script
# Collects metrics and checks system health

METRICS_DIR="/opt/gitops/monitoring/metrics"
LOG_FILE="/opt/gitops/logs/monitoring.log"

mkdir -p "$METRICS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

collect_api_metrics() {
    local timestamp=$(date +%s)
    
    # API health check
    if curl -sf http://localhost:3070/api/v2/health > /dev/null; then
        echo "api_health{status=\"up\"} 1 $timestamp" >> "$METRICS_DIR/api.prom"
    else
        echo "api_health{status=\"down\"} 0 $timestamp" >> "$METRICS_DIR/api.prom"
    fi
    
    # Request counts
    local total_requests=$(curl -s http://localhost:3070/api/v2/metrics/requests | jq -r '.total' 2>/dev/null || echo 0)
    echo "http_requests_total $total_requests $timestamp" >> "$METRICS_DIR/api.prom"
    
    # Response times
    local avg_response_time=$(curl -s http://localhost:3070/api/v2/metrics/response-time | jq -r '.average' 2>/dev/null || echo 0)
    echo "http_request_duration_seconds $avg_response_time $timestamp" >> "$METRICS_DIR/api.prom"
}

collect_pipeline_metrics() {
    local timestamp=$(date +%s)
    
    # Pipeline statistics
    local total_runs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs;" 2>/dev/null | tr -d ' ' || echo 0)
    local successful_runs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs WHERE conclusion = 'success';" 2>/dev/null | tr -d ' ' || echo 0)
    local failed_runs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs WHERE conclusion = 'failure';" 2>/dev/null | tr -d ' ' || echo 0)
    local running_runs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs WHERE status = 'in_progress';" 2>/dev/null | tr -d ' ' || echo 0)
    
    echo "pipeline_runs_total{status=\"total\"} $total_runs $timestamp" >> "$METRICS_DIR/pipeline.prom"
    echo "pipeline_runs_total{status=\"success\"} $successful_runs $timestamp" >> "$METRICS_DIR/pipeline.prom"
    echo "pipeline_runs_total{status=\"failed\"} $failed_runs $timestamp" >> "$METRICS_DIR/pipeline.prom"
    echo "pipeline_runs_total{status=\"running\"} $running_runs $timestamp" >> "$METRICS_DIR/pipeline.prom"
}

collect_compliance_metrics() {
    local timestamp=$(date +%s)
    
    # Compliance statistics
    local avg_score=$(psql -d gitops_audit -t -c "SELECT COALESCE(AVG(score), 0) FROM template_compliance;" 2>/dev/null | tr -d ' ' || echo 0)
    local compliant_repos=$(psql -d gitops_audit -t -c "SELECT COUNT(DISTINCT repository) FROM template_compliance WHERE compliant = true;" 2>/dev/null | tr -d ' ' || echo 0)
    local non_compliant_repos=$(psql -d gitops_audit -t -c "SELECT COUNT(DISTINCT repository) FROM template_compliance WHERE compliant = false;" 2>/dev/null | tr -d ' ' || echo 0)
    
    echo "compliance_score $avg_score $timestamp" >> "$METRICS_DIR/compliance.prom"
    echo "compliant_repositories $compliant_repos $timestamp" >> "$METRICS_DIR/compliance.prom"
    echo "non_compliant_repositories $non_compliant_repos $timestamp" >> "$METRICS_DIR/compliance.prom"
}

collect_websocket_metrics() {
    local timestamp=$(date +%s)
    
    # WebSocket statistics
    local active_connections=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM websocket_sessions WHERE disconnected_at IS NULL;" 2>/dev/null | tr -d ' ' || echo 0)
    local total_sessions=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM websocket_sessions;" 2>/dev/null | tr -d ' ' || echo 0)
    
    echo "websocket_connections_active $active_connections $timestamp" >> "$METRICS_DIR/websocket.prom"
    echo "websocket_sessions_total $total_sessions $timestamp" >> "$METRICS_DIR/websocket.prom"
}

collect_orchestration_metrics() {
    local timestamp=$(date +%s)
    
    # Orchestration statistics
    local pending_jobs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM orchestration_jobs WHERE status = 'pending';" 2>/dev/null | tr -d ' ' || echo 0)
    local running_jobs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM orchestration_jobs WHERE status = 'running';" 2>/dev/null | tr -d ' ' || echo 0)
    local completed_jobs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM orchestration_jobs WHERE status = 'completed';" 2>/dev/null | tr -d ' ' || echo 0)
    local failed_jobs=$(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM orchestration_jobs WHERE status = 'failed';" 2>/dev/null | tr -d ' ' || echo 0)
    
    echo "orchestration_jobs_pending $pending_jobs $timestamp" >> "$METRICS_DIR/orchestration.prom"
    echo "orchestration_jobs_running $running_jobs $timestamp" >> "$METRICS_DIR/orchestration.prom"
    echo "orchestration_jobs_completed_total $completed_jobs $timestamp" >> "$METRICS_DIR/orchestration.prom"
    echo "orchestration_jobs_failed_total $failed_jobs $timestamp" >> "$METRICS_DIR/orchestration.prom"
}

# Health check function
health_check() {
    log "Running Phase 2 health check..."
    
    local issues=0
    
    # Check API health
    if ! curl -sf http://localhost:3070/api/v2/health > /dev/null; then
        log "WARNING: API health check failed"
        issues=$((issues + 1))
    fi
    
    # Check database connectivity
    if ! psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1; then
        log "WARNING: Database connectivity check failed"
        issues=$((issues + 1))
    fi
    
    # Check service status
    if ! systemctl is-active --quiet gitops-audit-api; then
        log "WARNING: API service is not active"
        issues=$((issues + 1))
    fi
    
    # Check disk space
    local disk_usage=$(df /opt/gitops | tail -1 | awk '{print $5}' | sed 's/%//')
    if (( disk_usage > 80 )); then
        log "WARNING: Disk usage is ${disk_usage}% (>80%)"
        issues=$((issues + 1))
    fi
    
    # Check memory usage
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if (( memory_usage > 80 )); then
        log "WARNING: Memory usage is ${memory_usage}% (>80%)"
        issues=$((issues + 1))
    fi
    
    if (( issues == 0 )); then
        log "Health check passed - no issues detected"
    else
        log "Health check completed with $issues issues detected"
    fi
    
    return $issues
}

# Main execution
case "${1:-monitor}" in
    "monitor")
        log "Collecting Phase 2 metrics..."
        collect_api_metrics
        collect_pipeline_metrics
        collect_compliance_metrics
        collect_websocket_metrics
        collect_orchestration_metrics
        log "Metrics collection completed"
        ;;
    "health")
        health_check
        ;;
    "all")
        collect_api_metrics
        collect_pipeline_metrics
        collect_compliance_metrics
        collect_websocket_metrics
        collect_orchestration_metrics
        health_check
        ;;
    *)
        echo "Usage: $0 [monitor|health|all]"
        exit 1
        ;;
esac
EOF

chmod +x "$MONITORING_DIR/monitor-phase2.sh"

# Create alerting script
log "🚨 Creating alerting script..."
cat > "$MONITORING_DIR/alert-phase2.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

# Phase 2 Alerting Script
# Sends alerts for critical issues

ALERT_LOG="/opt/gitops/logs/alerts.log"
ALERT_RECIPIENTS="${ALERT_EMAIL:-admin@example.com}"

log_alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "$ALERT_LOG"
}

send_alert() {
    local severity="$1"
    local component="$2"
    local message="$3"
    
    log_alert "[$severity] $component: $message"
    
    # Send email if mail command is available
    if command -v mail &> /dev/null; then
        echo "GitOps Audit Phase 2 Alert

Severity: $severity
Component: $component
Message: $message
Time: $(date)
Host: $(hostname)

Please investigate immediately.
" | mail -s "GitOps Audit Alert - $severity" "$ALERT_RECIPIENTS"
    fi
    
    # Log to system journal
    logger -t gitops-audit-alert "[$severity] $component: $message"
}

check_api_health() {
    if ! curl -sf http://localhost:3070/api/v2/health > /dev/null; then
        send_alert "CRITICAL" "API" "API health check failed - service may be down"
        return 1
    fi
    return 0
}

check_database_health() {
    if ! psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1; then
        send_alert "CRITICAL" "DATABASE" "Database connectivity failed"
        return 1
    fi
    return 0
}

check_service_status() {
    if ! systemctl is-active --quiet gitops-audit-api; then
        send_alert "CRITICAL" "SERVICE" "GitOps Audit API service is not running"
        return 1
    fi
    return 0
}

check_disk_space() {
    local disk_usage=$(df /opt/gitops | tail -1 | awk '{print $5}' | sed 's/%//')
    if (( disk_usage > 90 )); then
        send_alert "CRITICAL" "DISK" "Disk usage is ${disk_usage}% (>90%)"
        return 1
    elif (( disk_usage > 80 )); then
        send_alert "WARNING" "DISK" "Disk usage is ${disk_usage}% (>80%)"
        return 1
    fi
    return 0
}

check_memory_usage() {
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if (( memory_usage > 90 )); then
        send_alert "CRITICAL" "MEMORY" "Memory usage is ${memory_usage}% (>90%)"
        return 1
    elif (( memory_usage > 80 )); then
        send_alert "WARNING" "MEMORY" "Memory usage is ${memory_usage}% (>80%)"
        return 1
    fi
    return 0
}

check_pipeline_failures() {
    local recent_failures=$(psql -d gitops_audit -t -c "
        SELECT COUNT(*) FROM pipeline_runs 
        WHERE conclusion = 'failure' 
        AND started_at > NOW() - INTERVAL '1 hour'
    " 2>/dev/null | tr -d ' ' || echo 0)
    
    if (( recent_failures > 5 )); then
        send_alert "WARNING" "PIPELINE" "$recent_failures pipeline failures in the last hour"
        return 1
    fi
    return 0
}

check_compliance_scores() {
    local low_score_repos=$(psql -d gitops_audit -t -c "
        SELECT COUNT(DISTINCT repository) FROM template_compliance 
        WHERE score < 50 AND checked_at > NOW() - INTERVAL '24 hours'
    " 2>/dev/null | tr -d ' ' || echo 0)
    
    if (( low_score_repos > 0 )); then
        send_alert "WARNING" "COMPLIANCE" "$low_score_repos repositories have compliance scores below 50%"
        return 1
    fi
    return 0
}

# Run all checks
check_api_health
check_database_health
check_service_status
check_disk_space
check_memory_usage
check_pipeline_failures
check_compliance_scores
EOF

chmod +x "$MONITORING_DIR/alert-phase2.sh"

# Create cron job for monitoring
log "⏰ Setting up monitoring cron jobs..."
cat > "$MONITORING_DIR/phase2-cron.txt" << EOF
# Phase 2 Monitoring Cron Jobs

# Collect metrics every 5 minutes
*/5 * * * * /opt/gitops/monitoring/monitor-phase2.sh monitor

# Run health checks every 10 minutes
*/10 * * * * /opt/gitops/monitoring/monitor-phase2.sh health

# Run alerting checks every 5 minutes
*/5 * * * * /opt/gitops/monitoring/alert-phase2.sh

# Full monitoring run every hour
0 * * * * /opt/gitops/monitoring/monitor-phase2.sh all

# Clean up old metric files daily
0 0 * * * find /opt/gitops/monitoring/metrics -name "*.prom" -mtime +7 -delete

EOF

# Install cron jobs
if command -v crontab &> /dev/null; then
    crontab "$MONITORING_DIR/phase2-cron.txt"
    success "Monitoring cron jobs installed"
else
    warn "crontab not available, manual cron job setup required"
fi

# Create systemd service for monitoring
log "⚙️ Creating monitoring systemd service..."
cat > /etc/systemd/system/gitops-monitoring.service << EOF
[Unit]
Description=GitOps Audit Phase 2 Monitoring
After=gitops-audit-api.service

[Service]
Type=oneshot
ExecStart=/opt/gitops/monitoring/monitor-phase2.sh all
User=gitops
Group=gitops

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/gitops-monitoring.timer << EOF
[Unit]
Description=GitOps Audit Phase 2 Monitoring Timer
Requires=gitops-monitoring.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable gitops-monitoring.timer
systemctl start gitops-monitoring.timer

# Create monitoring dashboard script
log "📊 Creating monitoring dashboard script..."
cat > "$MONITORING_DIR/dashboard.sh" << 'EOF'
#!/bin/bash

# Simple monitoring dashboard for terminal
clear
echo "==============================================="
echo "    GitOps Audit - Phase 2 Monitoring"
echo "==============================================="
echo "Last Updated: $(date)"
echo "==============================================="

# API Status
echo "🔌 API Status:"
if curl -sf http://localhost:3070/api/v2/health > /dev/null; then
    echo "  ✅ API is healthy"
else
    echo "  ❌ API is down"
fi

# Service Status
echo ""
echo "⚙️  Service Status:"
echo "  API: $(systemctl is-active gitops-audit-api)"
echo "  Nginx: $(systemctl is-active nginx)"

# Database Status
echo ""
echo "🗄️  Database Status:"
if psql -d gitops_audit -c "SELECT 1;" > /dev/null 2>&1; then
    echo "  ✅ Database is connected"
    
    # Table counts
    echo "  📊 Record Counts:"
    echo "    Pipeline Runs: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs;" 2>/dev/null | tr -d ' ' || echo 'N/A')"
    echo "    Compliance Checks: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM template_compliance;" 2>/dev/null | tr -d ' ' || echo 'N/A')"
    echo "    WebSocket Sessions: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM websocket_sessions;" 2>/dev/null | tr -d ' ' || echo 'N/A')"
    echo "    Orchestration Jobs: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM orchestration_jobs;" 2>/dev/null | tr -d ' ' || echo 'N/A')"
else
    echo "  ❌ Database connection failed"
fi

# System Resources
echo ""
echo "💻 System Resources:"
echo "  Memory: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100.0}')"
echo "  Disk: $(df /opt/gitops | tail -1 | awk '{print $5}')"

# Recent Activity
echo ""
echo "📈 Recent Activity (Last Hour):"
echo "  Pipeline Runs: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM pipeline_runs WHERE started_at > NOW() - INTERVAL '1 hour';" 2>/dev/null | tr -d ' ' || echo 'N/A')"
echo "  Compliance Checks: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM template_compliance WHERE checked_at > NOW() - INTERVAL '1 hour';" 2>/dev/null | tr -d ' ' || echo 'N/A')"
echo "  Metrics Collected: $(psql -d gitops_audit -t -c "SELECT COUNT(*) FROM metrics WHERE timestamp > NOW() - INTERVAL '1 hour';" 2>/dev/null | tr -d ' ' || echo 'N/A')"

echo ""
echo "==============================================="
echo "Press Ctrl+C to exit, or wait 30s for refresh..."
EOF

chmod +x "$MONITORING_DIR/dashboard.sh"

# Create monitoring configuration file
log "📝 Creating monitoring configuration..."
cat > "$MONITORING_DIR/config.yml" << EOF
# Phase 2 Monitoring Configuration

monitoring:
  enabled: true
  interval: 300  # 5 minutes
  retention_days: 30

metrics:
  api:
    enabled: true
    endpoints:
      - "/api/v2/health"
      - "/api/v2/metrics/overview"
    thresholds:
      response_time: 2000  # ms
      error_rate: 0.05     # 5%
      
  pipeline:
    enabled: true
    thresholds:
      failure_rate: 0.2    # 20%
      stall_duration: 3600 # 1 hour
      
  compliance:
    enabled: true
    thresholds:
      min_score: 70        # 70%
      max_failures: 5
      
  websocket:
    enabled: true
    thresholds:
      max_connections: 100
      failure_rate: 0.1    # 10%
      
  orchestration:
    enabled: true
    thresholds:
      max_pending: 50
      failure_rate: 0.1    # 10%

alerting:
  enabled: true
  email:
    enabled: false
    recipients: []
  log:
    enabled: true
    file: "/opt/gitops/logs/alerts.log"
  journal:
    enabled: true

cleanup:
  enabled: true
  metrics_retention: 7     # days
  logs_retention: 30       # days
  sessions_retention: 7    # days

EOF

success "📊 Phase 2 monitoring and alerting setup completed!"
log "📋 Setup log: $SETUP_LOG"

echo ""
echo "🎯 Monitoring Setup Summary:"
echo "✅ Prometheus configuration created"
echo "✅ Alerting rules configured"
echo "✅ Grafana dashboard prepared"
echo "✅ Monitoring scripts installed"
echo "✅ Cron jobs configured"
echo "✅ Systemd services created"
echo ""
echo "📊 Monitoring Components:"
echo "  Configuration: $MONITORING_DIR/"
echo "  Logs: $LOGS_DIR/"
echo "  Metrics: $MONITORING_DIR/metrics/"
echo "  Dashboard: $MONITORING_DIR/dashboard.sh"
echo ""
echo "🔍 Quick Commands:"
echo "  Monitor Status: $MONITORING_DIR/monitor-phase2.sh health"
echo "  View Dashboard: $MONITORING_DIR/dashboard.sh"
echo "  Check Alerts: tail -f $LOGS_DIR/alerts.log"
echo ""
echo "📋 Next Steps:"
echo "  1. Configure Prometheus to use phase2 config"
echo "  2. Import Grafana dashboard"
echo "  3. Set up alert email notifications"
echo "  4. Test monitoring and alerting"
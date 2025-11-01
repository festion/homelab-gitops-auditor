#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# TrueNAS Container 48-Hour Stability Monitor - Fixed Version
# Version: 3.1 - Homelab GitOps Auditor Integration
# Purpose: Enhanced monitoring of containers migrated to TrueNAS storage
# Duration: 48-hour intensive monitoring with stability analysis
# ------------------------------------------------------------------

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

### CONFIGURATION ###
PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"

# Monitoring duration and intervals
MONITORING_DURATION_HOURS=48
MONITORING_INTERVAL_MINUTES=5
TOTAL_SAMPLES=$((MONITORING_DURATION_HOURS * 60 / MONITORING_INTERVAL_MINUTES))

# TrueNAS migrated containers to monitor
declare -A TRUENAS_CONTAINERS=(
    [1250]="adguard:networking:high:125"
    [1300]="wikijs-integration:integration:medium:130"
    [1400]="netbox-agent:monitoring:medium:140"
    [2000]="github-runner:cicd:medium:200"
)

# Output files
MONITORING_DIR="/home/dev/workspace/homelab-gitops-auditor/output/truenas_stability"
STABILITY_LOG="$MONITORING_DIR/stability_$(date +%Y%m%d_%H%M%S).log"
STABILITY_JSON="$MONITORING_DIR/TrueNASStabilityReport_$(date +%Y%m%d_%H%M%S).json"
METRICS_CSV="$MONITORING_DIR/truenas_metrics_$(date +%Y%m%d_%H%M%S).csv"
CURRENT_STATUS_JSON="$MONITORING_DIR/current_truenas_status.json"

### FUNCTIONS ###

setup_monitoring_environment() {
    echo "🔧 Setting up TrueNAS stability monitoring environment..." | tee -a "$STABILITY_LOG"
    
    # Create monitoring directory
    mkdir -p "$MONITORING_DIR"
    
    # Initialize CSV file with headers
    cat > "$METRICS_CSV" << EOF
timestamp,container_id,name,status,cpu_percent,memory_percent,memory_used_mb,memory_max_mb,uptime_hours,storage_type,health_status
EOF
    
    echo "📁 Monitoring directory: $MONITORING_DIR" | tee -a "$STABILITY_LOG"
    echo "📊 Metrics CSV: $METRICS_CSV" | tee -a "$STABILITY_LOG"
    echo "📈 Stability report: $STABILITY_JSON" | tee -a "$STABILITY_LOG"
    echo "" | tee -a "$STABILITY_LOG"
}

get_container_metrics_simple() {
    local container_id="$1"
    local name="$2"
    local type="$3"
    local priority="$4"
    local original_id="$5"
    
    echo "    📡 Fetching data for CT $container_id ($name)..." | tee -a "$STABILITY_LOG"
    
    # Get status and config with simplified curl approach
    local status_data=""
    local config_data=""
    
    # Get container status with proper timeout parameters
    status_data=$(curl --connect-timeout 5 --max-time 10 --retry 2 --retry-delay 1 \
        -s -k -H "Authorization: $PROXMOX_TOKEN" \
        "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/$container_id/status/current" \
        2>/dev/null || echo '{"error": "timeout"}')
    
    # Get container config with proper timeout parameters
    config_data=$(curl --connect-timeout 5 --max-time 10 --retry 2 --retry-delay 1 \
        -s -k -H "Authorization: $PROXMOX_TOKEN" \
        "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/$container_id/config" \
        2>/dev/null || echo '{"error": "timeout"}')
    
    # Process with simple Python script that avoids complex string interpolation
    echo "$status_data" > "/tmp/status_$container_id.json"
    echo "$config_data" > "/tmp/config_$container_id.json"
    
    local metrics=$(python3 << EOF
import json
from datetime import datetime

try:
    # Read the temp files
    with open('/tmp/status_$container_id.json', 'r') as f:
        status_response = json.load(f)
    with open('/tmp/config_$container_id.json', 'r') as f:
        config_response = json.load(f)
    
    # Check for errors
    if 'error' in status_response or 'error' in config_response:
        raise Exception("API call failed")
    
    if 'data' not in status_response or 'data' not in config_response:
        raise Exception("Invalid response structure")
        
    status_data = status_response['data']
    config_data = config_response['data']
    
    # Calculate metrics safely
    memory_used = status_data.get('mem', 0)
    memory_max = max(status_data.get('maxmem', 1), 1)  # Avoid division by zero
    memory_percent = round((memory_used / memory_max) * 100, 2)
    cpu_percent = round(status_data.get('cpu', 0) * 100, 2)
    uptime_hours = round(status_data.get('uptime', 0) / 3600, 2)
    
    # Determine health status
    health = 'healthy'
    container_status = status_data.get('status', 'unknown')
    if container_status != 'running':
        health = 'critical'
    elif memory_percent >= 90 or cpu_percent >= 90:
        health = 'critical'
    elif memory_percent >= 75 or cpu_percent >= 70:
        health = 'warning'
    elif uptime_hours < 1:
        health = 'unstable'
    
    # Extract storage type
    rootfs = config_data.get('rootfs', '')
    storage_type = 'TrueNas_NVMe' if 'TrueNas_NVMe' in str(rootfs) else 'unknown'
    
    # Create result
    result = {
        'container_id': $container_id,
        'name': '$name',
        'type': '$type', 
        'priority': '$priority',
        'original_id': $original_id,
        'status': container_status,
        'cpu_percent': cpu_percent,
        'memory_percent': memory_percent,
        'memory_used_mb': round(memory_used / (1024*1024), 2) if memory_used > 0 else 0,
        'memory_max_mb': round(memory_max / (1024*1024), 2) if memory_max > 0 else 0,
        'uptime_hours': uptime_hours,
        'storage_type': storage_type,
        'health_status': health,
        'timestamp': datetime.now().isoformat()
    }
    
    print(json.dumps(result))

except Exception as e:
    error_result = {
        'container_id': $container_id,
        'name': '$name',
        'error': str(e)[:100],
        'health_status': 'error',
        'timestamp': datetime.now().isoformat()
    }
    print(json.dumps(error_result))
EOF
)
    
    # Cleanup temp files
    rm -f "/tmp/status_$container_id.json" "/tmp/config_$container_id.json" 2>/dev/null || true
    
    echo "$metrics"
}

collect_stability_sample() {
    local sample_number="$1"
    local total_samples="$2"
    
    echo "📊 Collecting stability sample $sample_number/$total_samples at $(date)" | tee -a "$STABILITY_LOG"
    
    local healthy_count=0
    local warning_count=0
    local critical_count=0
    local error_count=0
    local unstable_count=0
    
    for container_id in "${!TRUENAS_CONTAINERS[@]}"; do
        container_info="${TRUENAS_CONTAINERS[$container_id]}"
        IFS=':' read -r name type priority original_id <<< "$container_info"
        
        echo "  🔍 Monitoring CT $container_id ($name)..." | tee -a "$STABILITY_LOG"
        
        # Get metrics
        local container_data=$(get_container_metrics_simple "$container_id" "$name" "$type" "$priority" "$original_id")
        
        # Parse health status with safer approach
        local health_status="error"
        local csv_data="error,error,error,error,error,error,error,error,error,error,error"
        
        if [ -n "$container_data" ]; then
            # Extract health status
            health_status=$(echo "$container_data" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(data.get('health_status', 'error'))
except:
    print('error')" 2>/dev/null || echo "error")
            
            # Extract CSV data
            csv_data=$(echo "$container_data" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(f\"{data.get('timestamp')},{data.get('container_id')},{data.get('name')},{data.get('status')},{data.get('cpu_percent')},{data.get('memory_percent')},{data.get('memory_used_mb')},{data.get('memory_max_mb')},{data.get('uptime_hours')},{data.get('storage_type')},{data.get('health_status')}\")
except:
    print('error,error,error,error,error,error,error,error,error,error,error')" 2>/dev/null || echo "error,error,error,error,error,error,error,error,error,error,error")
        fi
        
        # Append to CSV
        echo "$csv_data" >> "$METRICS_CSV"
        
        # Count health statuses
        case "$health_status" in
            "healthy") ((healthy_count++)) ;;
            "warning") ((warning_count++)) ;;
            "critical") ((critical_count++)) ;;
            "unstable") ((unstable_count++)) ;;
            *) ((error_count++)) ;;
        esac
        
        echo "    📈 Status: $health_status" | tee -a "$STABILITY_LOG"
        
        # Brief pause between containers
        sleep 1
    done
    
    # Update current status JSON
    cat > "$CURRENT_STATUS_JSON" << EOF
{
  "timestamp": "$(date --iso-8601=seconds)",
  "sample_number": $sample_number,
  "total_samples": $total_samples,
  "progress_percent": $((sample_number * 100 / total_samples)),
  "summary": {
    "total_containers": ${#TRUENAS_CONTAINERS[@]},
    "healthy": $healthy_count,
    "warning": $warning_count,
    "critical": $critical_count,
    "unstable": $unstable_count,
    "errors": $error_count,
    "overall_health": "$([ $critical_count -eq 0 ] && [ $error_count -eq 0 ] && echo "stable" || echo "needs_attention")"
  },
  "monitoring_status": "$([ $sample_number -eq $total_samples ] && echo "completed" || echo "in_progress")"
}
EOF
    
    echo "  📊 Sample summary: ✅$healthy_count ⚠️$warning_count 🚨$critical_count 🔄$unstable_count ❌$error_count" | tee -a "$STABILITY_LOG"
    echo "" | tee -a "$STABILITY_LOG"
    
    return $((critical_count + error_count))
}

analyze_stability_results() {
    echo "🔬 Analyzing stability data from: $METRICS_CSV" | tee -a "$STABILITY_LOG"
    
    # Simple analysis using basic bash tools
    local total_samples=$(tail -n +2 "$METRICS_CSV" | wc -l)
    local healthy_samples=$(tail -n +2 "$METRICS_CSV" | grep -c ",healthy$" || echo "0")
    local error_samples=$(tail -n +2 "$METRICS_CSV" | grep -c ",error$" || echo "0")
    
    local stability_score=0
    if [ $total_samples -gt 0 ]; then
        stability_score=$(( (healthy_samples * 100) / total_samples ))
    fi
    
    cat > "$STABILITY_JSON" << EOF
{
  "analysis_timestamp": "$(date --iso-8601=seconds)",
  "monitoring_summary": {
    "total_samples": $total_samples,
    "healthy_samples": $healthy_samples,
    "error_samples": $error_samples,
    "stability_score": $stability_score
  },
  "overall_assessment": {
    "stability_score": $stability_score,
    "migration_success": $([ $stability_score -ge 85 ] && echo "true" || echo "false"),
    "truenas_performance": "$([ $stability_score -ge 90 ] && echo "excellent" || [ $stability_score -ge 80 ] && echo "good" || echo "needs_attention")"
  }
}
EOF
    
    echo "📊 Analysis complete - Stability Score: $stability_score%" | tee -a "$STABILITY_LOG"
    echo "📈 Full analysis saved to: $STABILITY_JSON" | tee -a "$STABILITY_LOG"
}

run_48hour_monitoring() {
    echo "🏥 Starting 48-Hour TrueNAS Container Stability Monitoring" | tee -a "$STABILITY_LOG"
    echo "==============================================" | tee -a "$STABILITY_LOG"
    echo "📊 Containers: ${#TRUENAS_CONTAINERS[@]}" | tee -a "$STABILITY_LOG"
    echo "⏰ Duration: $MONITORING_DURATION_HOURS hours" | tee -a "$STABILITY_LOG"
    echo "🔄 Interval: $MONITORING_INTERVAL_MINUTES minutes" | tee -a "$STABILITY_LOG"
    echo "📈 Total samples: $TOTAL_SAMPLES" | tee -a "$STABILITY_LOG"
    echo "🕐 Start time: $(date)" | tee -a "$STABILITY_LOG"
    echo "🕐 End time: $(date -d "+$MONITORING_DURATION_HOURS hours")" | tee -a "$STABILITY_LOG"
    echo "" | tee -a "$STABILITY_LOG"
    
    for ((sample=1; sample<=TOTAL_SAMPLES; sample++)); do
        collect_stability_sample "$sample" "$TOTAL_SAMPLES"
        
        # Don't sleep after the last sample
        if [ $sample -lt $TOTAL_SAMPLES ]; then
            echo "💤 Waiting $MONITORING_INTERVAL_MINUTES minutes until next sample..." | tee -a "$STABILITY_LOG"
            sleep $((MONITORING_INTERVAL_MINUTES * 60))
        fi
    done
    
    echo "🏁 48-hour monitoring completed!" | tee -a "$STABILITY_LOG"
    analyze_stability_results
}

### MAIN EXECUTION ###

# Check for required token
if [ -z "$PROXMOX_TOKEN" ]; then
    echo "❌ PROXMOX_TOKEN not set. Please configure authentication."
    exit 1
fi

# Check command line options
case "${1:-}" in
    "start"|"")
        setup_monitoring_environment
        run_48hour_monitoring
        ;;
    "status")
        if [ -f "$CURRENT_STATUS_JSON" ]; then
            echo "📊 Current TrueNAS Stability Monitoring Status:"
            cat "$CURRENT_STATUS_JSON"
        else
            echo "❌ No monitoring session in progress."
            exit 1
        fi
        ;;
    "sample")
        setup_monitoring_environment
        collect_stability_sample "1" "1"
        ;;
    "analyze")
        if [ -f "$METRICS_CSV" ]; then
            analyze_stability_results
        else
            echo "❌ No metrics data found to analyze."
            exit 1
        fi
        ;;
    *)
        echo "TrueNAS Container 48-Hour Stability Monitor"
        echo "Usage: $0 [start|status|sample|analyze]"
        echo "  start   - Begin 48-hour monitoring (default)"
        echo "  status  - Show current monitoring status"
        echo "  sample  - Collect single sample for testing"
        echo "  analyze - Analyze existing monitoring data"
        exit 1
        ;;
esac
#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# TrueNAS Container 48-Hour Stability Monitor - Simplified Version
# Version: 2.0 - Homelab GitOps Auditor Integration
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
    
    # Use the direct Python approach we know works
    local metrics=$(PROXMOX_URL="$PROXMOX_URL" PROXMOX_TOKEN="$PROXMOX_TOKEN" PROXMOX_NODE="$PROXMOX_NODE" python3 -c "
import asyncio
import httpx
import json
import os
from datetime import datetime

async def get_container_data():
    client = httpx.AsyncClient(
        base_url=os.environ['PROXMOX_URL'] + '/api2/json',
        headers={'Authorization': os.environ['PROXMOX_TOKEN']},
        verify=False,
        timeout=10.0
    )
    
    try:
        # Get container status and config
        status_response = await client.get(f'/nodes/{os.environ[\"PROXMOX_NODE\"]}/lxc/$container_id/status/current')
        config_response = await client.get(f'/nodes/{os.environ[\"PROXMOX_NODE\"]}/lxc/$container_id/config')
        
        if status_response.status_code == 200 and config_response.status_code == 200:
            status_data = status_response.json()['data']
            config_data = config_response.json()['data']
            
            # Calculate metrics
            memory_used = status_data.get('mem', 0)
            memory_max = status_data.get('maxmem', 1)
            memory_percent = round((memory_used / memory_max) * 100, 2) if memory_max > 0 else 0
            cpu_percent = round(status_data.get('cpu', 0) * 100, 2)
            uptime_hours = round(status_data.get('uptime', 0) / 3600, 2)
            
            # Determine health status
            health = 'healthy'
            if status_data.get('status') != 'running':
                health = 'critical'
            elif memory_percent >= 90 or cpu_percent >= 90:
                health = 'critical'
            elif memory_percent >= 75 or cpu_percent >= 70:
                health = 'warning'
            elif uptime_hours < 1:
                health = 'unstable'
            
            # Extract storage type
            rootfs = config_data.get('rootfs', '')
            storage_type = 'TrueNas_NVMe' if 'TrueNas_NVMe' in rootfs else 'unknown'
            
            result = {
                'container_id': $container_id,
                'name': '$name',
                'type': '$type',
                'priority': '$priority',
                'original_id': $original_id,
                'status': status_data.get('status', 'unknown'),
                'cpu_percent': cpu_percent,
                'memory_percent': memory_percent,
                'memory_used_mb': round(memory_used / (1024*1024), 2),
                'memory_max_mb': round(memory_max / (1024*1024), 2),
                'uptime_hours': uptime_hours,
                'storage_type': storage_type,
                'health_status': health,
                'timestamp': datetime.now().isoformat()
            }
            
            print(json.dumps(result))
        else:
            error_result = {
                'container_id': $container_id,
                'name': '$name',
                'error': f'API error: {status_response.status_code}/{config_response.status_code}',
                'health_status': 'error',
                'timestamp': datetime.now().isoformat()
            }
            print(json.dumps(error_result))
            
    except Exception as e:
        error_result = {
            'container_id': $container_id,
            'name': '$name',
            'error': str(e),
            'health_status': 'error',
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_result))
    finally:
        await client.aclose()

asyncio.run(get_container_data())
" 2>/dev/null)
    
    if [ -z "$metrics" ]; then
        metrics="{\"container_id\": $container_id, \"name\": \"$name\", \"error\": \"No response\", \"health_status\": \"error\", \"timestamp\": \"$(date --iso-8601=seconds)\"}"
    fi
    
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
        
        # Parse health status
        local health_status=$(echo "$container_data" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(data.get('health_status', 'error'))
except:
    print('error')
")
        
        # Extract metrics for CSV
        local csv_data=$(echo "$container_data" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(f\"{data.get('timestamp')},{data.get('container_id')},{data.get('name')},{data.get('status')},{data.get('cpu_percent')},{data.get('memory_percent')},{data.get('memory_used_mb')},{data.get('memory_max_mb')},{data.get('uptime_hours')},{data.get('storage_type')},{data.get('health_status')}\")
except:
    print('error,error,error,error,error,error,error,error,error,error,error')
")
        
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
        sleep 2
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
    *)
        echo "TrueNAS Container 48-Hour Stability Monitor"
        echo "Usage: $0 [start|status|sample]"
        echo "  start   - Begin 48-hour monitoring (default)"
        echo "  status  - Show current monitoring status"
        echo "  sample  - Collect single sample"
        exit 1
        ;;
esac
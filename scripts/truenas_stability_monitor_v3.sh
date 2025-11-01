#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# TrueNAS Container 48-Hour Stability Monitor - Version 3.3
# Version: 3.3 - Fixed Python processing and API calls
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
MONITORING_DURATION_HOURS="${MONITORING_DURATION_HOURS:-48}"
MONITORING_INTERVAL_MINUTES="${MONITORING_INTERVAL_MINUTES:-5}"
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

get_container_metrics() {
    local container_id="$1"
    local name="$2"
    local type="$3"
    local priority="$4"
    local original_id="$5"
    
    echo "    📡 Fetching data for CT $container_id ($name)..." | tee -a "$STABILITY_LOG"
    
    # Create a Python script to handle the entire process
    local python_script="/tmp/monitor_container_${container_id}_$$.py"
    
    cat > "$python_script" << 'PYTHON_EOF'
#!/usr/bin/env python3
import json
import sys
import os
import subprocess
from datetime import datetime

def main():
    container_id = sys.argv[1]
    name = sys.argv[2]
    container_type = sys.argv[3]
    priority = sys.argv[4]
    original_id = sys.argv[5]
    proxmox_url = sys.argv[6]
    proxmox_token = sys.argv[7]
    proxmox_node = sys.argv[8]
    
    try:
        # Get container status
        status_cmd = [
            'curl', '--connect-timeout', '5', '--max-time', '10',
            '--retry', '2', '--retry-delay', '1',
            '-s', '-k', '-H', f'Authorization: {proxmox_token}',
            f'{proxmox_url}/api2/json/nodes/{proxmox_node}/lxc/{container_id}/status/current'
        ]
        
        status_result = subprocess.run(status_cmd, capture_output=True, text=True, timeout=15)
        if status_result.returncode != 0 or not status_result.stdout:
            raise Exception("Failed to get status")
        status_response = json.loads(status_result.stdout)
        
        # Get container config
        config_cmd = [
            'curl', '--connect-timeout', '5', '--max-time', '10',
            '--retry', '2', '--retry-delay', '1',
            '-s', '-k', '-H', f'Authorization: {proxmox_token}',
            f'{proxmox_url}/api2/json/nodes/{proxmox_node}/lxc/{container_id}/config'
        ]
        
        config_result = subprocess.run(config_cmd, capture_output=True, text=True, timeout=15)
        if config_result.returncode != 0 or not config_result.stdout:
            raise Exception("Failed to get config")
        config_response = json.loads(config_result.stdout)
        
        # Check for errors in responses
        if 'error' in status_response or 'error' in config_response:
            raise Exception("API returned error")
        
        if 'data' not in status_response or 'data' not in config_response:
            raise Exception("Invalid response structure")
        
        status_data = status_response['data']
        config_data = config_response['data']
        
        # Calculate metrics
        memory_used = status_data.get('mem', 0)
        memory_max = max(status_data.get('maxmem', 1), 1)
        memory_percent = round((memory_used / memory_max) * 100, 2)
        cpu_percent = round(status_data.get('cpu', 0) * 100, 2)
        uptime_hours = round(status_data.get('uptime', 0) / 3600, 2)
        
        # Determine health status
        container_status = status_data.get('status', 'unknown')
        if container_status != 'running':
            health = 'critical'
        elif memory_percent >= 90 or cpu_percent >= 90:
            health = 'critical'
        elif memory_percent >= 75 or cpu_percent >= 70:
            health = 'warning'
        elif uptime_hours < 1:
            health = 'unstable'
        else:
            health = 'healthy'
        
        # Extract storage type
        rootfs = config_data.get('rootfs', '')
        storage_type = 'TrueNas_NVMe' if 'TrueNas_NVMe' in str(rootfs) else 'unknown'
        
        # Create result
        result = {
            'container_id': int(container_id),
            'name': name,
            'type': container_type,
            'priority': priority,
            'original_id': int(original_id),
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
        # Create error result
        error_result = {
            'container_id': int(container_id),
            'name': name,
            'error': str(e)[:100],
            'health_status': 'error',
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_result))

if __name__ == '__main__':
    main()
PYTHON_EOF
    
    chmod +x "$python_script"
    
    # Run the Python script with proper arguments
    local metrics=$(python3 "$python_script" \
        "$container_id" \
        "$name" \
        "$type" \
        "$priority" \
        "$original_id" \
        "$PROXMOX_URL" \
        "$PROXMOX_TOKEN" \
        "$PROXMOX_NODE" 2>/dev/null)
    
    # Cleanup
    rm -f "$python_script" 2>/dev/null || true
    
    if [ -z "$metrics" ]; then
        metrics="{\"container_id\": $container_id, \"name\": \"$name\", \"error\": \"Processing failed\", \"health_status\": \"error\", \"timestamp\": \"$(date --iso-8601=seconds)\"}"
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
    
    # Collect all container data
    local all_container_data=""
    
    for container_id in "${!TRUENAS_CONTAINERS[@]}"; do
        container_info="${TRUENAS_CONTAINERS[$container_id]}"
        IFS=':' read -r name type priority original_id <<< "$container_info"
        
        echo "  🔍 Monitoring CT $container_id ($name)..." | tee -a "$STABILITY_LOG"
        
        # Get metrics
        local container_data=$(get_container_metrics "$container_id" "$name" "$type" "$priority" "$original_id")
        
        # Store data for JSON output
        if [ -n "$all_container_data" ]; then
            all_container_data="${all_container_data},"
        fi
        all_container_data="${all_container_data}${container_data}"
        
        # Parse health status and create CSV line
        local health_status="error"
        local csv_line=""
        
        if [ -n "$container_data" ]; then
            # Extract data using Python for safety
            csv_line=$(echo "$container_data" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    health = data.get('health_status', 'error')
    csv_line = '{},{},{},{},{},{},{},{},{},{},{}'.format(
        data.get('timestamp', ''),
        data.get('container_id', ''),
        data.get('name', ''),
        data.get('status', ''),
        data.get('cpu_percent', ''),
        data.get('memory_percent', ''),
        data.get('memory_used_mb', ''),
        data.get('memory_max_mb', ''),
        data.get('uptime_hours', ''),
        data.get('storage_type', ''),
        data.get('health_status', '')
    )
    print(health)
    print(csv_line)
except Exception as e:
    print('error')
    print('error,error,error,error,error,error,error,error,error,error,error')
" 2>/dev/null || echo -e "error\nerror,error,error,error,error,error,error,error,error,error,error")
            
            health_status=$(echo "$csv_line" | head -n1)
            csv_line=$(echo "$csv_line" | tail -n1)
        else
            csv_line="$(date --iso-8601=seconds),$container_id,$name,error,0,0,0,0,0,unknown,error"
            health_status="error"
        fi
        
        # Append to CSV
        echo "$csv_line" >> "$METRICS_CSV"
        
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
  "monitoring_status": "$([ $sample_number -eq $total_samples ] && echo "completed" || echo "in_progress")",
  "containers": [$all_container_data]
}
EOF
    
    echo "  📊 Sample summary: ✅$healthy_count ⚠️$warning_count 🚨$critical_count 🔄$unstable_count ❌$error_count" | tee -a "$STABILITY_LOG"
    echo "" | tee -a "$STABILITY_LOG"
    
    return $((critical_count + error_count))
}

analyze_stability_results() {
    echo "🔬 Analyzing stability data from: $METRICS_CSV" | tee -a "$STABILITY_LOG"
    
    # Use Python for more accurate analysis
    python3 << 'ANALYZE_EOF' > "$STABILITY_JSON"
import csv
import json
from datetime import datetime
import sys

csv_file = sys.argv[1] if len(sys.argv) > 1 else ""

try:
    # Read CSV data
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    # Analyze data
    total_samples = len(rows)
    healthy_samples = sum(1 for row in rows if row.get('health_status') == 'healthy')
    warning_samples = sum(1 for row in rows if row.get('health_status') == 'warning')
    critical_samples = sum(1 for row in rows if row.get('health_status') == 'critical')
    unstable_samples = sum(1 for row in rows if row.get('health_status') == 'unstable')
    error_samples = sum(1 for row in rows if row.get('health_status') == 'error')
    
    # Calculate per-container statistics
    container_stats = {}
    for row in rows:
        cid = row.get('container_id', 'unknown')
        name = row.get('name', 'unknown')
        if cid not in container_stats:
            container_stats[cid] = {
                'name': name,
                'total': 0,
                'healthy': 0,
                'warning': 0,
                'critical': 0,
                'unstable': 0,
                'error': 0
            }
        container_stats[cid]['total'] += 1
        status = row.get('health_status', 'error')
        if status in container_stats[cid]:
            container_stats[cid][status] += 1
    
    # Calculate stability scores
    overall_stability = (healthy_samples * 100 / total_samples) if total_samples > 0 else 0
    
    # Per-container stability
    container_stability = {}
    for cid, stats in container_stats.items():
        if stats['total'] > 0:
            container_stability[cid] = {
                'name': stats['name'],
                'stability_score': (stats['healthy'] * 100 / stats['total']),
                'health_distribution': {
                    'healthy': stats['healthy'],
                    'warning': stats['warning'],
                    'critical': stats['critical'],
                    'unstable': stats['unstable'],
                    'error': stats['error']
                }
            }
    
    # Create report
    report = {
        'analysis_timestamp': datetime.now().isoformat(),
        'monitoring_summary': {
            'total_samples': total_samples,
            'healthy_samples': healthy_samples,
            'warning_samples': warning_samples,
            'critical_samples': critical_samples,
            'unstable_samples': unstable_samples,
            'error_samples': error_samples,
            'overall_stability_score': round(overall_stability, 2)
        },
        'container_analysis': container_stability,
        'overall_assessment': {
            'stability_score': round(overall_stability, 2),
            'migration_success': overall_stability >= 85,
            'truenas_performance': 'excellent' if overall_stability >= 90 else 'good' if overall_stability >= 80 else 'needs_attention',
            'recommendation': 'Stable - continue monitoring' if overall_stability >= 85 else 'Investigate issues with containers'
        }
    }
    
    print(json.dumps(report, indent=2))
    
except Exception as e:
    error_report = {
        'error': str(e),
        'analysis_timestamp': datetime.now().isoformat()
    }
    print(json.dumps(error_report, indent=2))
ANALYZE_EOF
    
    echo "📊 Analysis complete - Results saved to: $STABILITY_JSON" | tee -a "$STABILITY_LOG"
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

run_daemon_mode() {
    echo "🚀 Starting TrueNAS Stability Monitor in daemon mode..."
    echo "📝 PID: $$"
    echo "📁 Log: $STABILITY_LOG"
    
    # Write PID file
    echo $$ > "$MONITORING_DIR/monitor.pid"
    
    # Trap signals for graceful shutdown
    trap 'echo "Received shutdown signal, analyzing data..."; analyze_stability_results; exit 0' SIGTERM SIGINT
    
    # Run monitoring
    run_48hour_monitoring
    
    # Remove PID file
    rm -f "$MONITORING_DIR/monitor.pid"
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
    "daemon")
        setup_monitoring_environment
        run_daemon_mode
        ;;
    "status")
        if [ -f "$CURRENT_STATUS_JSON" ]; then
            echo "📊 Current TrueNAS Stability Monitoring Status:"
            cat "$CURRENT_STATUS_JSON" | python3 -m json.tool
        else
            echo "❌ No monitoring session in progress."
            exit 1
        fi
        ;;
    "sample")
        # For testing - just one sample
        setup_monitoring_environment
        collect_stability_sample "1" "1"
        if [ -f "$CURRENT_STATUS_JSON" ]; then
            echo ""
            echo "📊 Sample Results:"
            cat "$CURRENT_STATUS_JSON" | python3 -m json.tool
        fi
        ;;
    "analyze")
        # Find most recent CSV file
        LATEST_CSV=$(ls -t "$MONITORING_DIR"/truenas_metrics_*.csv 2>/dev/null | head -n1)
        if [ -n "$LATEST_CSV" ]; then
            METRICS_CSV="$LATEST_CSV"
            analyze_stability_results
        else
            echo "❌ No metrics data found to analyze."
            exit 1
        fi
        ;;
    *)
        echo "TrueNAS Container 48-Hour Stability Monitor"
        echo "Usage: $0 [start|daemon|status|sample|analyze]"
        echo "  start   - Begin 48-hour monitoring (default)"
        echo "  daemon  - Run as background daemon"
        echo "  status  - Show current monitoring status"
        echo "  sample  - Collect single sample for testing"
        echo "  analyze - Analyze existing monitoring data"
        exit 1
        ;;
esac
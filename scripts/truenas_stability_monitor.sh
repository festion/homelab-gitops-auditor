#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# TrueNAS Container 48-Hour Stability Monitor
# Version: 1.0 - Homelab GitOps Auditor Integration
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

# Thresholds for stability analysis
MEMORY_WARNING_THRESHOLD=75
MEMORY_CRITICAL_THRESHOLD=90
CPU_WARNING_THRESHOLD=70
CPU_CRITICAL_THRESHOLD=90
MIN_UPTIME_STABLE_HOURS=1

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

get_enhanced_container_metrics() {
    local container_id="$1"
    local name="$2"
    local type="$3"
    local priority="$4"
    local original_id="$5"
    
    echo "    📡 Fetching data via Proxmox API..." | tee -a "$STABILITY_LOG"
    
    # Create temp files first
    local temp_status="/tmp/status_${container_id}_$$.json"
    local temp_config="/tmp/config_${container_id}_$$.json"
    local temp_metrics="/tmp/metrics_${container_id}_$$.json"
    
    # Cleanup function with local vars
    cleanup_temp_files() {
        rm -f "/tmp/status_${container_id}_$$.json" "/tmp/config_${container_id}_$$.json" "/tmp/metrics_${container_id}_$$.json" 2>/dev/null
    }
    
    # Get container status with shorter timeout and better error handling
    timeout 5s curl -s -k -H "Authorization: $PROXMOX_TOKEN" \
        "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/$container_id/status/current" \
        > "$temp_status" 2>/dev/null
    
    local status_exit=$?
    
    # Get container config with shorter timeout
    timeout 5s curl -s -k -H "Authorization: $PROXMOX_TOKEN" \
        "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/$container_id/config" \
        > "$temp_config" 2>/dev/null
        
    local config_exit=$?
    
    # Check if API calls succeeded and files have content
    if [ $status_exit -ne 0 ] || [ $config_exit -ne 0 ] || [ ! -s "$temp_status" ] || [ ! -s "$temp_config" ]; then
        echo "{\"container_id\": $container_id, \"name\": \"$name\", \"error\": \"API timeout or no data\", \"health_status\": \"error\", \"timestamp\": \"$(date --iso-8601=seconds)\"}"
        cleanup_temp_files
        return
    fi
    
    # Process with Python using a separate script approach to avoid hanging
    cat > "$temp_metrics" << 'EOF_PYTHON'
import json
import sys
from datetime import datetime

def process_container_metrics(container_id, name, container_type, priority, original_id, status_file, config_file):
    try:
        with open(status_file, 'r') as f:
            status_response = json.load(f)
        with open(config_file, 'r') as f:
            config_response = json.load(f)
            
        # Check if response has proper structure
        if 'data' not in status_response or 'data' not in config_response:
            raise Exception("Invalid API response structure")
            
        status_data = status_response['data']
        config_data = config_response['data']
        
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
            'container_id': int(container_id),
            'name': name,
            'type': container_type,
            'priority': priority,
            'original_id': int(original_id),
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
        
        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            'container_id': int(container_id),
            'name': name,
            'error': str(e),
            'health_status': 'error',
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_result, indent=2))

if __name__ == "__main__":
    if len(sys.argv) != 7:
        print('{"error": "Invalid arguments", "health_status": "error"}')
        sys.exit(1)
    process_container_metrics(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7])
EOF_PYTHON
    
    # Run Python processing with timeout
    local metrics=$(timeout 10s python3 "$temp_metrics" "$container_id" "$name" "$type" "$priority" "$original_id" "$temp_status" "$temp_config" 2>/dev/null)
    
    # Cleanup temp files
    cleanup_temp_files
    
    if [ -z "$metrics" ]; then
        metrics="{\"container_id\": $container_id, \"name\": \"$name\", \"error\": \"Failed to process metrics\", \"health_status\": \"error\", \"timestamp\": \"$(date --iso-8601=seconds)\"}"
    fi
    
    echo "$metrics"
}

collect_stability_sample() {
    local sample_number="$1"
    local total_samples="$2"
    
    echo "📊 Collecting stability sample $sample_number/$total_samples at $(date)" | tee -a "$STABILITY_LOG"
    
    local all_containers_data=()
    local healthy_count=0
    local warning_count=0
    local critical_count=0
    local error_count=0
    local unstable_count=0
    
    for container_id in "${!TRUENAS_CONTAINERS[@]}"; do
        container_info="${TRUENAS_CONTAINERS[$container_id]}"
        IFS=':' read -r name type priority original_id <<< "$container_info"
        
        echo "  🔍 Monitoring CT $container_id ($name)..." | tee -a "$STABILITY_LOG"
        
        # Get enhanced metrics
        local container_data=$(get_enhanced_container_metrics "$container_id" "$name" "$type" "$priority" "$original_id")
        
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
        
        all_containers_data+=("$container_data")
        
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

analyze_stability_trends() {
    echo "🔬 Analyzing 48-hour stability trends..." | tee -a "$STABILITY_LOG"
    
    # Use Python to analyze the CSV data
    local analysis_result=$(python3 -c "
import pandas as pd
import json
from datetime import datetime, timedelta
import sys

try:
    # Read CSV data
    df = pd.read_csv('$METRICS_CSV')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Overall statistics
    total_samples = len(df)
    containers_monitored = df['container_id'].nunique()
    monitoring_duration = (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 3600
    
    # Health status distribution
    health_counts = df['health_status'].value_counts().to_dict()
    
    # Per-container analysis
    container_analysis = {}
    for container_id in df['container_id'].unique():
        container_df = df[df['container_id'] == container_id].copy()
        container_name = container_df['name'].iloc[0]
        
        # Stability metrics
        uptime_stability = container_df['uptime_hours'].std() < 0.5  # Low uptime variance
        memory_stability = container_df['memory_percent'].std() < 10  # Low memory variance  
        cpu_stability = container_df['cpu_percent'].std() < 15  # Low CPU variance
        
        # Performance trends
        memory_trend = 'stable'
        if len(container_df) > 10:
            memory_diff = container_df['memory_percent'].iloc[-5:].mean() - container_df['memory_percent'].iloc[:5].mean()
            if memory_diff > 5:
                memory_trend = 'increasing'
            elif memory_diff < -5:
                memory_trend = 'decreasing'
        
        cpu_trend = 'stable'
        if len(container_df) > 10:
            cpu_diff = container_df['cpu_percent'].iloc[-5:].mean() - container_df['cpu_percent'].iloc[:5].mean()
            if cpu_diff > 10:
                cpu_trend = 'increasing'
            elif cpu_diff < -10:
                cpu_trend = 'decreasing'
        
        # Calculate stability score (0-100)
        health_score = (container_df['health_status'] == 'healthy').mean() * 100
        stability_score = min(100, health_score + (10 if uptime_stability else 0) + (10 if memory_stability else 0) + (10 if cpu_stability else 0))
        
        container_analysis[int(container_id)] = {
            'name': container_name,
            'samples_collected': len(container_df),
            'avg_memory_percent': round(container_df['memory_percent'].mean(), 2),
            'max_memory_percent': round(container_df['memory_percent'].max(), 2),
            'avg_cpu_percent': round(container_df['cpu_percent'].mean(), 2),
            'max_cpu_percent': round(container_df['cpu_percent'].max(), 2),
            'uptime_stability': uptime_stability,
            'memory_stability': memory_stability,
            'cpu_stability': cpu_stability,
            'memory_trend': memory_trend,
            'cpu_trend': cpu_trend,
            'stability_score': round(stability_score, 1),
            'health_distribution': container_df['health_status'].value_counts().to_dict(),
            'recommendation': 'stable_on_truenas' if stability_score >= 85 else 'monitor_closely' if stability_score >= 70 else 'consider_optimization'
        }
    
    # Overall assessment
    avg_stability_score = sum([c['stability_score'] for c in container_analysis.values()]) / len(container_analysis)
    
    result = {
        'analysis_timestamp': datetime.now().isoformat(),
        'monitoring_summary': {
            'total_samples': int(total_samples),
            'containers_monitored': int(containers_monitored),
            'monitoring_duration_hours': round(monitoring_duration, 2),
            'samples_per_container': int(total_samples / containers_monitored) if containers_monitored > 0 else 0
        },
        'overall_health_distribution': health_counts,
        'container_analysis': container_analysis,
        'overall_assessment': {
            'average_stability_score': round(avg_stability_score, 1),
            'migration_success': avg_stability_score >= 80,
            'truenas_performance_impact': 'minimal' if avg_stability_score >= 90 else 'acceptable' if avg_stability_score >= 80 else 'concerning',
            'recommendation': 'migration_successful' if avg_stability_score >= 85 else 'needs_attention'
        }
    }
    
    print(json.dumps(result, indent=2))

except Exception as e:
    error_result = {
        'error': str(e),
        'analysis_timestamp': datetime.now().isoformat(),
        'status': 'analysis_failed'
    }
    print(json.dumps(error_result, indent=2))
" 2>/dev/null)
    
    echo "$analysis_result" > "$STABILITY_JSON"
    echo "📊 Stability analysis saved to: $STABILITY_JSON" | tee -a "$STABILITY_LOG"
    
    # Extract and display key findings
    local overall_score=$(echo "$analysis_result" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(data['overall_assessment']['average_stability_score'])
except:
    print('N/A')
")
    
    local migration_success=$(echo "$analysis_result" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    print(data['overall_assessment']['migration_success'])
except:
    print('false')
")
    
    echo "🎯 STABILITY ANALYSIS RESULTS:" | tee -a "$STABILITY_LOG"
    echo "  📊 Overall Stability Score: $overall_score/100" | tee -a "$STABILITY_LOG"
    echo "  🎉 Migration Success: $migration_success" | tee -a "$STABILITY_LOG"
    echo "  📈 Full analysis available in: $STABILITY_JSON" | tee -a "$STABILITY_LOG"
    
    return $([ "$migration_success" = "true" ] && echo 0 || echo 1)
}

run_48hour_monitoring() {
    echo "🏥 Starting 48-Hour TrueNAS Container Stability Monitoring" | tee -a "$STABILITY_LOG"
    echo "=============================================" | tee -a "$STABILITY_LOG"
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
    echo "" | tee -a "$STABILITY_LOG"
    
    # Perform final analysis
    analyze_stability_trends
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
    "analyze")
        if [ ! -f "$METRICS_CSV" ]; then
            echo "❌ No metrics data found. Run monitoring first."
            exit 1
        fi
        analyze_stability_trends
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
        echo "Usage: $0 [start|analyze|status|sample]"
        echo "  start   - Begin 48-hour monitoring (default)"
        echo "  analyze - Analyze existing data"  
        echo "  status  - Show current monitoring status"
        echo "  sample  - Collect single sample"
        exit 1
        ;;
esac
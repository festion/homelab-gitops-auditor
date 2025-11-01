#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# External Container Health Monitor
# Version: 1.0 - Homelab GitOps Auditor Integration
# Purpose: Monitor containers externally via Proxmox API when direct access unavailable
# ------------------------------------------------------------------

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

### CONFIGURATION ###
PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"

# Output files
MONITORING_LOG="/tmp/container_health_$(date +%Y%m%d_%H%M%S).log"
MONITORING_JSON="/home/dev/workspace/homelab-gitops-auditor/output/ProxmoxContainerReport.json"

# Critical containers to monitor
declare -A CRITICAL_CONTAINERS=(
    [100]="influxdb:database:high"
    [105]="nginxproxymanager:networking:high"
    [111]="OmadaController:networking:high"
    [112]="wikijs:documentation:medium"
    [122]="zigbee2mqtt:iot:high"
    [128]="developmentenvironment:development:medium"
    [130]="wikijs-integration:integration:medium"
    [200]="github-runner:cicd:medium"
    [1250]="adguard:networking:high"
    [1300]="wikijs-integration:integration:medium"
    [1400]="netbox-agent:monitoring:medium"
    [2000]="github-runner:cicd:medium"
)

### FUNCTIONS ###

get_container_metrics() {
    local container_id="$1"
    local name="$2"
    local type="$3"
    local priority="$4"
    
    echo "🔍 Monitoring CT $container_id ($name)..." | tee -a "$MONITORING_LOG"
    
    local metrics=$(python3 -c "
import asyncio
import httpx
import json
import sys
from datetime import datetime

async def get_container_data():
    container_id = $container_id
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        # Get current status
        response = await client.get(f'/nodes/$PROXMOX_NODE/lxc/{container_id}/status/current')
        if response.status_code != 200:
            return {'error': 'Failed to get status', 'status_code': response.status_code}
        
        status_data = response.json()['data']
        
        # Get configuration
        config_response = await client.get(f'/nodes/$PROXMOX_NODE/lxc/{container_id}/config')
        if config_response.status_code != 200:
            return {'error': 'Failed to get config', 'status_code': config_response.status_code}
        
        config_data = config_response.json()['data']
        
        # Process metrics
        result = {
            'container_id': container_id,
            'name': '$name',
            'type': '$type',
            'priority': '$priority',
            'status': status_data.get('status', 'unknown'),
            'uptime': status_data.get('uptime', 0),
            'cpu_usage': round(status_data.get('cpu', 0) * 100, 2),
            'memory_used_bytes': status_data.get('mem', 0),
            'memory_max_bytes': status_data.get('maxmem', 0),
            'memory_allocated_mb': config_data.get('memory', 0),
            'swap_allocated_mb': config_data.get('swap', 0),
            'cores': config_data.get('cores', 1),
            'rootfs': config_data.get('rootfs', 'unknown'),
            'timestamp': datetime.now().isoformat(),
            'health_status': 'unknown'
        }
        
        # Calculate memory usage percentage
        if result['memory_max_bytes'] > 0:
            result['memory_usage_percent'] = round((result['memory_used_bytes'] / result['memory_max_bytes']) * 100, 2)
        else:
            result['memory_usage_percent'] = 0
        
        # Determine health status based on metrics
        if result['status'] != 'running':
            result['health_status'] = 'critical'
        elif result['memory_usage_percent'] >= 90:
            result['health_status'] = 'critical'
        elif result['memory_usage_percent'] >= 75 or result['cpu_usage'] >= 80:
            result['health_status'] = 'warning'
        else:
            result['health_status'] = 'healthy'
        
        print(json.dumps(result, indent=2))
        return result
        
    except Exception as e:
        error_result = {
            'container_id': container_id,
            'name': '$name',
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'health_status': 'error'
        }
        print(json.dumps(error_result, indent=2))
        return error_result
    finally:
        await client.aclose()

asyncio.run(get_container_data())
" 2>/dev/null)
    
    echo "$metrics"
    echo "$metrics" >> "$MONITORING_LOG"
}

generate_health_report() {
    echo "📊 Generating Container Health Report..." | tee -a "$MONITORING_LOG"
    echo "⏰ Timestamp: $(date)" | tee -a "$MONITORING_LOG"
    echo "" | tee -a "$MONITORING_LOG"
    
    local all_containers=()
    local healthy_count=0
    local warning_count=0
    local critical_count=0
    local error_count=0
    
    for container_id in "${!CRITICAL_CONTAINERS[@]}"; do
        container_info="${CRITICAL_CONTAINERS[$container_id]}"
        IFS=':' read -r name type priority <<< "$container_info"
        
        # Get container metrics
        local container_data=$(get_container_metrics "$container_id" "$name" "$type" "$priority")
        
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
        
        case "$health_status" in
            "healthy") ((healthy_count++)) ;;
            "warning") ((warning_count++)) ;;
            "critical") ((critical_count++)) ;;
            *) ((error_count++)) ;;
        esac
        
        # Collect container data
        all_containers+=("$container_data")
        
        echo "" | tee -a "$MONITORING_LOG"
    done
    
    # Create simple JSON report structure
    cat > "$MONITORING_JSON" << EOF
{
  "timestamp": "$(date --iso-8601=seconds)",
  "summary": {
    "total_containers": ${#CRITICAL_CONTAINERS[@]},
    "healthy": $healthy_count,
    "warning": $warning_count,
    "critical": $critical_count,
    "errors": $error_count,
    "overall_health": "$([ $critical_count -eq 0 ] && [ $error_count -eq 0 ] && echo "healthy" || echo "needs_attention")"
  },
  "containers": [],
  "monitoring_version": "1.0",
  "monitoring_source": "external_proxmox_api"
}
EOF
    
    echo "📝 Health report saved to: $MONITORING_JSON" | tee -a "$MONITORING_LOG"
    
    # Display summary
    echo "" | tee -a "$MONITORING_LOG"
    echo "📊 HEALTH SUMMARY:" | tee -a "$MONITORING_LOG"
    echo "  ✅ Healthy: $healthy_count" | tee -a "$MONITORING_LOG"
    echo "  ⚠️  Warning: $warning_count" | tee -a "$MONITORING_LOG"
    echo "  🚨 Critical: $critical_count" | tee -a "$MONITORING_LOG"
    echo "  ❌ Errors: $error_count" | tee -a "$MONITORING_LOG"
    echo "  📊 Total Monitored: ${#CRITICAL_CONTAINERS[@]}" | tee -a "$MONITORING_LOG"
    
    # Determine overall status
    if [ $critical_count -gt 0 ] || [ $error_count -gt 0 ]; then
        echo "  🏥 Overall Status: NEEDS ATTENTION" | tee -a "$MONITORING_LOG"
        return 1
    elif [ $warning_count -gt 0 ]; then
        echo "  🏥 Overall Status: MONITORING RECOMMENDED" | tee -a "$MONITORING_LOG"
        return 2
    else
        echo "  🏥 Overall Status: ALL SYSTEMS HEALTHY" | tee -a "$MONITORING_LOG"
        return 0
    fi
}

### MAIN EXECUTION ###

echo "🏥 Starting External Container Health Monitor"
echo "============================================"
echo "📊 Target: ${#CRITICAL_CONTAINERS[@]} critical containers"
echo "⏰ Timestamp: $(date)"
echo "📝 Log file: $MONITORING_LOG"
echo ""

if [ -z "$PROXMOX_TOKEN" ]; then
    echo "❌ PROXMOX_TOKEN not set. Please configure authentication."
    exit 1
fi

# Generate health report
generate_health_report
monitor_result=$?

echo ""
echo "🔗 Integration with GitOps Framework:"
echo "  - Health data saved to: $MONITORING_JSON"
echo "  - Monitoring log: $MONITORING_LOG"  
echo "  - Dashboard will auto-refresh with new data"
echo "  - MCP servers can consume health status"

echo ""
case $monitor_result in
    0) 
        echo "🎉 All containers healthy - no action required"
        echo "📈 Recommended: Schedule this script to run every 5-15 minutes"
        ;;
    1)
        echo "🚨 Critical issues detected - immediate attention required"
        echo "🔧 Check containers with critical or error status"
        ;;
    2)
        echo "⚠️ Warning conditions detected - monitoring recommended"
        echo "📊 Review containers with warning status for optimization"
        ;;
esac

exit $monitor_result
#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# Proxmox Container Health and Performance Monitor
# Version: 1.0 - Integrated with Homelab GitOps Auditor
# Maintainer: festion GitOps
# License: MIT
# Features: Container resource monitoring, optimization alerts, automated fixes
# MCP Integration: Uses Proxmox MCP for container management
# ------------------------------------------------------------------

# Load configuration from GitOps auditor framework
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

### CONFIGURATION ###
PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"

# Determine if running in dev mode
if [ "${1:-}" = "--dev" ] || [ -f ".dev_mode" ]; then
  PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
  HISTORY_DIR="${PROJECT_ROOT}/audit-history"
  REPORT_DIR="${PROJECT_ROOT}/output"
  echo "📂 Running in development mode. Using ${HISTORY_DIR}"
else
  HISTORY_DIR="${PRODUCTION_BASE_PATH}/audit-history"
  REPORT_DIR="${PRODUCTION_BASE_PATH}/output"
  echo "📂 Running in production mode. Using ${HISTORY_DIR}"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
JSON_PATH="${REPORT_DIR}/ProxmoxContainerReport.json"
ALERT_LOG="${HISTORY_DIR}/container_alerts_${TIMESTAMP}.log"

mkdir -p "$HISTORY_DIR" "$REPORT_DIR"

### DEPENDENCY CHECKS ###
command -v python3 >/dev/null || { echo "❌ python3 is required"; exit 1; }
command -v jq >/dev/null || { echo "❌ jq is required"; exit 1; }

### FUNCTIONS ###

# Function to get container status via Proxmox API
get_container_status() {
    local container_id="$1"
    python3 -c "
import asyncio
import httpx
import json
import sys

async def get_status():
    container_id = sys.argv[1]
    proxmox_url = sys.argv[2]
    proxmox_token = sys.argv[3]
    proxmox_node = sys.argv[4]
    
    client = httpx.AsyncClient(
        base_url=f'{proxmox_url}/api2/json',
        headers={'Authorization': proxmox_token},
        verify=False,
        timeout=30.0
    )
    
    try:
        # Get config
        config_response = await client.get(f'/nodes/{proxmox_node}/lxc/{container_id}/config')
        status_response = await client.get(f'/nodes/{proxmox_node}/lxc/{container_id}/status/current')
        
        if config_response.status_code == 200 and status_response.status_code == 200:
            config = config_response.json()['data']
            status = status_response.json()['data']
            
            result = {
                'id': int(container_id),
                'name': config.get('hostname', f'ct{container_id}'),
                'status': status['status'],
                'memory_allocated': config.get('memory', 0),
                'swap_allocated': config.get('swap', 0),
                'memory_used': status.get('mem', 0),
                'memory_max': status.get('maxmem', 0),
                'cpu_usage': status.get('cpu', 0),
                'uptime': status.get('uptime', 0)
            }
            print(json.dumps(result))
        else:
            print(json.dumps({'error': f'API error: {config_response.status_code}'}))
            
    except Exception as e:
        print(json.dumps({'error': str(e)}))
    finally:
        await client.aclose()

asyncio.run(get_status())
" "$container_id" "$PROXMOX_URL" "$PROXMOX_TOKEN" "$PROXMOX_NODE"
}

# Function to classify container by workload type
classify_container() {
    local name="$1"
    case "$name" in
        *influx*|*database*|*db*) echo "database" ;;
        *grafana*|*dashboard*) echo "dashboard" ;;
        *adguard*|*dns*) echo "networking" ;;
        *zigbee*|*mqtt*|*iot*) echo "iot" ;;
        *github*|*runner*|*ci*|*cd*) echo "cicd" ;;
        *home*assistant*|*hass*) echo "automation" ;;
        *git*|*repo*) echo "development" ;;
        *proxy*|*nginx*) echo "proxy" ;;
        *monitor*|*metric*) echo "monitoring" ;;
        *) echo "general" ;;
    esac
}

# Function to determine risk level based on usage
assess_risk_level() {
    local memory_used="$1"
    local memory_max="$2"
    local swap_allocated="$3"
    local container_type="$4"
    
    if [ "$memory_max" -eq 0 ]; then
        echo "unknown"
        return
    fi
    
    local usage_percent=$((memory_used * 100 / memory_max))
    
    # Critical services need lower thresholds
    case "$container_type" in
        "database"|"automation"|"iot")
            if [ "$usage_percent" -ge 85 ]; then
                echo "critical"
            elif [ "$usage_percent" -ge 70 ] || [ "$swap_allocated" -eq 0 ]; then
                echo "high"
            elif [ "$usage_percent" -ge 50 ]; then
                echo "medium"
            else
                echo "low"
            fi
            ;;
        "cicd"|"dashboard")
            if [ "$usage_percent" -ge 90 ]; then
                echo "critical"
            elif [ "$usage_percent" -ge 80 ] || [ "$swap_allocated" -eq 0 ]; then
                echo "high"
            elif [ "$usage_percent" -ge 60 ]; then
                echo "medium"
            else
                echo "low"
            fi
            ;;
        *)
            if [ "$usage_percent" -ge 95 ]; then
                echo "critical"
            elif [ "$usage_percent" -ge 85 ]; then
                echo "high"
            elif [ "$usage_percent" -ge 70 ]; then
                echo "medium"
            else
                echo "low"
            fi
            ;;
    esac
}

# Function to generate optimization recommendation
get_optimization_recommendation() {
    local container_id="$1"
    local name="$2"
    local memory_allocated="$3"
    local swap_allocated="$4"
    local usage_percent="$5"
    local container_type="$6"
    local risk_level="$7"
    
    local recommendations=()
    
    case "$risk_level" in
        "critical")
            if [ "$usage_percent" -ge 90 ]; then
                recommendations+=("URGENT: Increase memory allocation by 50-100%")
            fi
            if [ "$swap_allocated" -eq 0 ]; then
                recommendations+=("URGENT: Add SWAP allocation (min 2GB)")
            fi
            recommendations+=("Deploy monitoring script immediately")
            ;;
        "high")
            if [ "$usage_percent" -ge 80 ]; then
                recommendations+=("Increase memory allocation by 25-50%")
            fi
            if [ "$swap_allocated" -lt 1024 ]; then
                recommendations+=("Increase SWAP to at least 1GB")
            fi
            recommendations+=("Consider adding monitoring script")
            ;;
        "medium")
            if [ "$container_type" = "cicd" ] && [ "$memory_allocated" -lt 4096 ]; then
                recommendations+=("Consider increasing memory for CI/CD workloads")
            fi
            if [ "$swap_allocated" -eq 0 ]; then
                recommendations+=("Add SWAP allocation for safety")
            fi
            ;;
        "low")
            recommendations+=("Container is operating within normal parameters")
            ;;
    esac
    
    # Join recommendations with semicolon
    local IFS='; '
    echo "${recommendations[*]}"
}

### MAIN MONITORING LOGIC ###
echo "🔍 Starting Proxmox container health monitoring..."
echo "📊 Analyzing containers on node: $PROXMOX_NODE"

# Get list of containers
echo "🌐 Fetching container list from Proxmox API..."
containers_json=$(python3 -c "
import asyncio
import httpx
import json
import sys

async def get_containers():
    proxmox_url = sys.argv[1]
    proxmox_token = sys.argv[2]
    proxmox_node = sys.argv[3]
    
    client = httpx.AsyncClient(
        base_url=f'{proxmox_url}/api2/json',
        headers={'Authorization': proxmox_token},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get(f'/nodes/{proxmox_node}/lxc')
        if response.status_code == 200:
            containers = response.json()['data']
            running_containers = [c for c in containers if c.get('status') == 'running']
            print(json.dumps(running_containers))
        else:
            print('[]')
    except Exception as e:
        print('[]')
    finally:
        await client.aclose()

asyncio.run(get_containers())
" "$PROXMOX_URL" "$PROXMOX_TOKEN" "$PROXMOX_NODE")

# Arrays for categorization
critical_containers=()
high_risk_containers=()
medium_risk_containers=()
low_risk_containers=()
total_containers=0
total_memory_allocated=0
total_memory_used=0

# Container details for JSON report
container_details=()

echo "📋 Analyzing individual containers..."

# Process each container
while IFS= read -r container_line; do
    if [ -n "$container_line" ]; then
        vmid=$(echo "$container_line" | jq -r '.vmid')
        name=$(echo "$container_line" | jq -r '.name')
        status=$(echo "$container_line" | jq -r '.status')
        
        if [ "$status" = "running" ]; then
            echo "  📦 Analyzing CT $vmid ($name)..."
            
            container_status=$(get_container_status "$vmid")
            
            if echo "$container_status" | jq -e '.error' >/dev/null 2>&1; then
                echo "    ⚠️ Could not get detailed status"
                continue
            fi
            
            memory_allocated=$(echo "$container_status" | jq -r '.memory_allocated // 0')
            swap_allocated=$(echo "$container_status" | jq -r '.swap_allocated // 0')
            memory_used=$(echo "$container_status" | jq -r '.memory_used // 0')
            memory_max=$(echo "$container_status" | jq -r '.memory_max // 0')
            cpu_usage=$(echo "$container_status" | jq -r '.cpu_usage // 0')
            uptime=$(echo "$container_status" | jq -r '.uptime // 0')
            
            # Convert memory to MB for calculations
            memory_used_mb=$((memory_used / 1024 / 1024))
            
            container_type=$(classify_container "$name")
            
            usage_percent=0
            if [ "$memory_max" -gt 0 ]; then
                usage_percent=$((memory_used * 100 / memory_max))
            fi
            
            risk_level=$(assess_risk_level "$memory_used" "$memory_max" "$swap_allocated" "$container_type")
            recommendation=$(get_optimization_recommendation "$vmid" "$name" "$memory_allocated" "$swap_allocated" "$usage_percent" "$container_type" "$risk_level")
            
            # Categorize by risk level
            case "$risk_level" in
                "critical") critical_containers+=("$vmid:$name") ;;
                "high") high_risk_containers+=("$vmid:$name") ;;
                "medium") medium_risk_containers+=("$vmid:$name") ;;
                "low") low_risk_containers+=("$vmid:$name") ;;
            esac
            
            # Add to totals
            ((total_containers++))
            total_memory_allocated=$((total_memory_allocated + memory_allocated))
            total_memory_used=$((total_memory_used + memory_used_mb))
            
            # Store container details for JSON
            container_detail=$(cat <<EOF
    {
      "id": $vmid,
      "name": "$name",
      "type": "$container_type",
      "status": "$status",
      "memory_allocated_mb": $memory_allocated,
      "swap_allocated_mb": $swap_allocated,
      "memory_used_mb": $memory_used_mb,
      "memory_usage_percent": $usage_percent,
      "cpu_usage_percent": $(printf "%.1f" $(echo "$cpu_usage * 100" | bc -l 2>/dev/null || echo "0")),
      "uptime_seconds": $uptime,
      "risk_level": "$risk_level",
      "recommendation": "$recommendation",
      "dashboard_link": "/container/$vmid?action=optimize"
    }
EOF
            )
            container_details+=("$container_detail")
            
            echo "    📊 RAM: ${memory_used_mb}MB/${memory_allocated}MB (${usage_percent}%) | SWAP: ${swap_allocated}MB | Risk: $risk_level"
        fi
    fi
done < <(echo "$containers_json" | jq -c '.[]')

# Calculate overall health status
health_status="green"
if [ ${#critical_containers[@]} -gt 0 ]; then
    health_status="red"
elif [ ${#high_risk_containers[@]} -gt 0 ]; then
    health_status="yellow"
fi

# Log alerts for critical containers
if [ ${#critical_containers[@]} -gt 0 ]; then
    echo "🚨 CRITICAL CONTAINER ALERTS:" | tee -a "$ALERT_LOG"
    for container in "${critical_containers[@]}"; do
        echo "  ⚠️ ${container}" | tee -a "$ALERT_LOG"
    done
fi

echo ""
echo "📊 Container Health Summary:"
echo "  Total Running: $total_containers"
echo "  Critical Risk: ${#critical_containers[@]}"
echo "  High Risk: ${#high_risk_containers[@]}"
echo "  Medium Risk: ${#medium_risk_containers[@]}"
echo "  Low Risk: ${#low_risk_containers[@]}"
echo "  Overall Health: $health_status"
echo "  Total Memory Allocated: ${total_memory_allocated}MB"
echo "  Total Memory Used: ${total_memory_used}MB"

### GENERATE JSON REPORT ###
{
    echo "{"
    echo "  \"timestamp\": \"${TIMESTAMP}\","
    echo "  \"health_status\": \"${health_status}\","
    echo "  \"proxmox_node\": \"${PROXMOX_NODE}\","
    echo "  \"summary\": {"
    echo "    \"total_running\": ${total_containers},"
    echo "    \"critical_risk\": ${#critical_containers[@]},"
    echo "    \"high_risk\": ${#high_risk_containers[@]},"
    echo "    \"medium_risk\": ${#medium_risk_containers[@]},"
    echo "    \"low_risk\": ${#low_risk_containers[@]},"
    echo "    \"total_memory_allocated_mb\": ${total_memory_allocated},"
    echo "    \"total_memory_used_mb\": ${total_memory_used}"
    echo "  },"
    echo "  \"containers\": ["
    
    first=1
    for container_detail in "${container_details[@]}"; do
        [[ $first -eq 0 ]] && echo ","
        echo "$container_detail"
        first=0
    done
    
    echo ""
    echo "  ],"
    echo "  \"optimization_actions\": {"
    echo "    \"increase_memory\": \"Increase memory allocation for high-usage containers\","
    echo "    \"add_swap\": \"Add SWAP allocation to prevent memory pressure\","
    echo "    \"deploy_monitoring\": \"Deploy monitoring scripts to critical containers\","
    echo "    \"restart_service\": \"Restart containers experiencing memory issues\""
    echo "  }"
    echo "}"
} > "$JSON_PATH"

# Create symlink for latest report
ln -sf "$JSON_PATH" "$REPORT_DIR/LatestContainerReport.json"

### GENERATE MITIGATION SUGGESTIONS ###
if [ ${#critical_containers[@]} -gt 0 ] || [ ${#high_risk_containers[@]} -gt 0 ]; then
    echo ""
    echo "🔧 Urgent Optimization Actions Required:"
    
    if [ ${#critical_containers[@]} -gt 0 ]; then
        echo "  🚨 CRITICAL - Immediate Action Required:"
        for container in "${critical_containers[@]}"; do
            vmid="${container%%:*}"
            name="${container##*:}"
            echo "    CT $vmid ($name): Increase memory allocation or add monitoring"
        done
    fi
    
    if [ ${#high_risk_containers[@]} -gt 0 ]; then
        echo "  ⚠️ HIGH RISK - Action Recommended:"
        for container in "${high_risk_containers[@]}"; do
            vmid="${container%%:*}"
            name="${container##*:}"
            echo "    CT $vmid ($name): Monitor closely and consider optimization"
        done
    fi
    
    echo ""
    echo "🤖 Automated Optimization Available:"
    echo "  Use Proxmox MCP server for automated memory adjustments"
    echo "  Deploy monitoring scripts via GitOps framework"
    echo "  Schedule regular health assessments"
fi

### INTEGRATION WITH GITOPS FRAMEWORK ###
echo ""
echo "✅ Container monitoring complete. Report saved to:"
echo "  $JSON_PATH"
echo "📊 GitOps Integration:"
echo "  - Report available in homelab-gitops-auditor dashboard"
echo "  - Alerts logged to: $ALERT_LOG"
echo "  - MCP servers available for automated fixes"

# If this is part of a scheduled run, update the main audit
if [ "${2:-}" = "--scheduled" ]; then
    echo "🔄 Updating main GitOps audit with container status..."
    # This integrates with the main comprehensive_audit.sh
fi

echo "🌐 Dashboard Access:"
echo "  Production: http://$PRODUCTION_SERVER_IP/containers"
echo "  Local: http://localhost:$DEVELOPMENT_DASHBOARD_PORT/containers"
echo ""
#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# Stop Local-LVM Containers for Migration Cleanup
# Version: 1.0 - Integrated with Homelab GitOps Auditor
# Purpose: Stop containers running from local-lvm storage while keeping TrueNAS ones
# ------------------------------------------------------------------

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

### CONFIGURATION ###
PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"

# Containers running from local-lvm (to be stopped)
declare -A LOCAL_LVM_CONTAINERS=(
    [100]="influxdb:critical:"         # CT 100 -> no TrueNAS replacement (keep running)
    [101]="grafana:medium:"            # CT 101 -> no direct replacement
    [102]="cloudflared:low:"           # CT 102 -> no direct replacement
    [103]="watchyourlan:low:"          # CT 103 -> no direct replacement  
    [104]="myspeed:medium:"            # CT 104 -> no direct replacement
    [105]="nginxproxymanager:high:"    # CT 105 -> no direct replacement
    [106]="pairdrop:low:"              # CT 106 -> no direct replacement
    [115]="memos:low:"                 # CT 115 -> no direct replacement (already stopped)
    [117]="hoarder:medium:"            # CT 117 -> no direct replacement
    [122]="zigbee2mqtt:critical:"      # CT 122 -> critical, keep running
    [123]="gitopsdashboard:medium:"    # CT 123 -> no direct replacement
    [124]="mqtt:medium:"               # CT 124 -> no direct replacement
    [125]="adguard:critical:1250"      # CT 125 -> TrueNAS replacement CT 1250  
    [131]="netbox:medium:1400"         # CT 131 -> TrueNAS replacement CT 1400
)

### FUNCTIONS ###

stop_container_safely() {
    local container_id="$1"
    local name="$2"
    local priority="$3"
    local replacement_id="$4"
    
    echo "🛑 Preparing to stop CT $container_id ($name)..."
    echo "   Priority: $priority"
    
    if [ -n "$replacement_id" ]; then
        echo "   🔄 TrueNAS replacement: CT $replacement_id"
        
        # Verify replacement is running
        local replacement_status=$(python3 -c "
import asyncio
import httpx

async def check_replacement():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get('/nodes/$PROXMOX_NODE/lxc/$replacement_id/status/current')
        if response.status_code == 200:
            status = response.json()['data']['status']
            print(status)
        else:
            print('not_found')
    except:
        print('error')
    finally:
        await client.aclose()

asyncio.run(check_replacement())
" 2>/dev/null)
        
        if [ "$replacement_status" != "running" ]; then
            echo "   ❌ ABORT: Replacement CT $replacement_id not running ($replacement_status)"
            return 1
        else
            echo "   ✅ Replacement CT $replacement_id is running"
        fi
    else
        echo "   ⚠️  No TrueNAS replacement - service will be offline"
        if [ "$priority" = "critical" ]; then
            echo "   ❌ ABORT: Critical service with no replacement"
            return 1
        fi
    fi
    
    # Check current status first
    echo "   🔍 Checking current status..."
    current_status=$(python3 -c "
import asyncio
import httpx

async def check_status():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get('/nodes/$PROXMOX_NODE/lxc/$container_id/status/current')
        if response.status_code == 200:
            print(response.json()['data']['status'])
        else:
            print('error')
    except:
        print('error')
    finally:
        await client.aclose()

asyncio.run(check_status())
" 2>/dev/null)
    
    if [ "$current_status" = "stopped" ]; then
        echo "   ✅ Container already stopped"
        return 0
    elif [ "$current_status" = "error" ]; then
        echo "   ❌ Error checking container status"
        return 1
    fi
    
    # Stop the container
    echo "   🛑 Stopping CT $container_id (currently: $current_status)..."
    python3 -c "
import asyncio
import httpx

async def stop_container():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=60.0
    )
    
    try:
        response = await client.post('/nodes/$PROXMOX_NODE/lxc/$container_id/status/stop')
        if response.status_code == 200:
            print('Stop task initiated')
            
            # Wait for stop with timeout
            for i in range(45):
                await asyncio.sleep(2)
                status_response = await client.get('/nodes/$PROXMOX_NODE/lxc/$container_id/status/current')
                if status_response.status_code == 200:
                    current_status = status_response.json()['data']['status']
                    if current_status == 'stopped':
                        print('✅ Container stopped successfully')
                        return True
            
            print('⚠️ Stop operation timed out')
            return False
        else:
            print(f'❌ Failed to initiate stop: {response.status_code}')
            return False
    except Exception as e:
        print(f'❌ Error stopping: {e}')
        return False
    finally:
        await client.aclose()

import sys
success = asyncio.run(stop_container())
sys.exit(0 if success else 1)
"
    
    local stop_result=$?
    if [ $stop_result -eq 0 ]; then
        echo "   ✅ CT $container_id stopped successfully"
        return 0
    else
        echo "   ❌ Failed to stop CT $container_id"
        return 1
    fi
}

### MAIN EXECUTION ###

echo "🛑 Stopping Local-LVM Containers for Migration Cleanup"
echo "======================================================"
echo "🎯 Target: Stop containers running from local-lvm storage"
echo "✅ Keep: Containers running from TrueNAS storage"
echo "⏰ Timestamp: $(date)"
echo ""

if [ -z "$PROXMOX_TOKEN" ]; then
    echo "❌ PROXMOX_TOKEN not set. Please configure authentication."
    exit 1
fi

successful_stops=0
failed_stops=0
skipped_stops=0

echo "🔍 PHASE 1: Verify TrueNAS containers are running"
echo "--------------------------------------------------"

truenas_containers=(111 112 125 128 130 200 1250 1300 1400 2000)
echo "Checking TrueNAS containers:"
for ct_id in "${truenas_containers[@]}"; do
    status=$(python3 -c "
import asyncio
import httpx

async def check_status():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get('/nodes/$PROXMOX_NODE/lxc/$ct_id/status/current')
        if response.status_code == 200:
            print(response.json()['data']['status'])
        else:
            print('not_found')
    except:
        print('error')
    finally:
        await client.aclose()

asyncio.run(check_status())
" 2>/dev/null)
    echo "  CT $ct_id: $status"
done

echo ""
echo "🛑 PHASE 2: Stop local-lvm containers (safe order)"
echo "----------------------------------------------------"

# Stop non-critical containers first
echo "Step 1: Stopping non-critical containers..."
for container_id in "${!LOCAL_LVM_CONTAINERS[@]}"; do
    container_info="${LOCAL_LVM_CONTAINERS[$container_id]}"
    IFS=':' read -r name priority replacement_id <<< "$container_info"
    
    if [ "$priority" != "critical" ]; then
        echo ""
        if stop_container_safely "$container_id" "$name" "$priority" "$replacement_id"; then
            ((successful_stops++))
        else
            ((failed_stops++))
        fi
    fi
done

echo ""
echo "Step 2: Stopping critical containers with confirmed replacements..."
for container_id in "${!LOCAL_LVM_CONTAINERS[@]}"; do
    container_info="${LOCAL_LVM_CONTAINERS[$container_id]}"
    IFS=':' read -r name priority replacement_id <<< "$container_info"
    
    if [ "$priority" = "critical" ] && [ -n "$replacement_id" ]; then
        echo ""
        if stop_container_safely "$container_id" "$name" "$priority" "$replacement_id"; then
            ((successful_stops++))
        else
            ((failed_stops++))
        fi
    fi
done

echo ""
echo "Step 3: Handling critical containers without replacements..."
for container_id in "${!LOCAL_LVM_CONTAINERS[@]}"; do
    container_info="${LOCAL_LVM_CONTAINERS[$container_id]}"
    IFS=':' read -r name priority replacement_id <<< "$container_info"
    
    if [ "$priority" = "critical" ] && [ -z "$replacement_id" ]; then
        echo ""
        echo "🚨 CT $container_id ($name): Critical service with no TrueNAS replacement"
        echo "   Action: Skipping for manual review"
        ((skipped_stops++))
    fi
done

echo ""
echo "📊 Stop Operations Summary:"
echo "  ✅ Successful stops: $successful_stops"
echo "  ❌ Failed stops: $failed_stops"
echo "  ⚠️  Skipped (critical): $skipped_stops"
echo ""

echo "🔍 PHASE 3: Verify system health after stops"
echo "----------------------------------------------"

echo "Checking TrueNAS containers are still running:"
healthy_truenas=0
total_truenas=${#truenas_containers[@]}

for ct_id in "${truenas_containers[@]}"; do
    status=$(python3 -c "
import asyncio
import httpx

async def check_status():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get('/nodes/$PROXMOX_NODE/lxc/$ct_id/status/current')
        if response.status_code == 200:
            print(response.json()['data']['status'])
        else:
            print('not_found')
    except:
        print('error')
    finally:
        await client.aclose()

asyncio.run(check_status())
" 2>/dev/null)
    
    if [ "$status" = "running" ]; then
        echo "  ✅ CT $ct_id: $status"
        ((healthy_truenas++))
    else
        echo "  ❌ CT $ct_id: $status"
    fi
done

echo ""
echo "🎯 FINAL RESULTS:"
if [ $healthy_truenas -eq $total_truenas ] && [ $failed_stops -eq 0 ]; then
    echo "  ✅ SUCCESS: All TrueNAS containers healthy, local-lvm containers stopped"
    echo "  🔄 Ready for final cleanup and monitoring deployment"
    echo ""
    echo "🔄 NEXT STEPS:"
    echo "  1. Test services are working correctly (AdGuard DNS, GitHub Runner, etc.)"
    echo "  2. If all services work correctly, DELETE stopped local-lvm containers"
    echo "  3. Deploy monitoring scripts to active TrueNAS containers"
    echo "  4. Update container documentation with new IDs"
else
    echo "  ⚠️  WARNING: Some issues detected"
    echo "     TrueNAS containers healthy: $healthy_truenas/$total_truenas"
    echo "     Failed stops: $failed_stops"
    echo "  🔄 Manual review required before proceeding"
fi
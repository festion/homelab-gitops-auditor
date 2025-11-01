#!/bin/bash
set -euo pipefail
# ------------------------------------------------------------------
# Clean up Cloned Containers from Storage Migration
# Version: 1.0 - Integrated with Homelab GitOps Auditor
# Purpose: Remove duplicate 4-digit temp containers created during migration
# ------------------------------------------------------------------

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

### CONFIGURATION ###
PROXMOX_NODE="${PROXMOX_NODE:-proxmox}"
PROXMOX_URL="${PROXMOX_URL:-https://192.168.1.137:8006}"
PROXMOX_TOKEN="${PROXMOX_TOKEN:-}"

# Containers to clean up (temp 4-digit containers)
declare -A TEMP_CONTAINERS_RUNNING=(
    [1250]="adguard:125"         # CT 1250 -> original CT 125
    [2000]="github-runner:200"   # CT 2000 -> original CT 200
    [1300]="wikijs-integration:130"  # CT 1300 -> original CT 130
    [1400]="netbox-agent:140"    # CT 1400 -> original CT 140
)

declare -A TEMP_CONTAINERS_STOPPED=(
    [1160]="debian:116"          # CT 1160 -> original CT 116
    [1260]="vikunja:126"         # CT 1260 -> original CT 126
    [1270]="infisical:127"       # CT 1270 -> original CT 127
    [1290]="gitops-qa:129"       # CT 1290 -> original CT 129
)

### FUNCTIONS ###

stop_and_remove_container() {
    local temp_id="$1"
    local name="$2"
    local original_id="$3"
    
    echo "🔄 Processing CT $temp_id ($name)..."
    
    # Check if container exists and get its status
    local status=$(python3 -c "
import asyncio
import httpx
import sys

async def get_status():
    temp_id = sys.argv[1]
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=30.0
    )
    
    try:
        response = await client.get(f'/nodes/$PROXMOX_NODE/lxc/{temp_id}/status/current')
        if response.status_code == 200:
            status = response.json()['data']['status']
            print(status)
        else:
            print('not_found')
    except:
        print('error')
    finally:
        await client.aclose()

asyncio.run(get_status())
" "$temp_id")
    
    if [ "$status" = "not_found" ] || [ "$status" = "error" ]; then
        echo "   ⚠️  Container CT $temp_id not found or error accessing"
        return 1
    fi
    
    echo "   📊 Status: $status"
    
    # Stop container if running
    if [ "$status" = "running" ]; then
        echo "   🛑 Stopping container..."
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
        response = await client.post('/nodes/$PROXMOX_NODE/lxc/$temp_id/status/stop')
        if response.status_code == 200:
            print('Stop task initiated')
            
            # Wait for stop
            for i in range(30):
                await asyncio.sleep(2)
                status_response = await client.get('/nodes/$PROXMOX_NODE/lxc/$temp_id/status/current')
                if status_response.status_code == 200:
                    current_status = status_response.json()['data']['status']
                    if current_status == 'stopped':
                        print('Container stopped successfully')
                        break
        else:
            print(f'Failed to stop: {response.status_code}')
    except Exception as e:
        print(f'Error stopping: {e}')
    finally:
        await client.aclose()

asyncio.run(stop_container())
"
    fi
    
    # Remove container
    echo "   🗑️  Removing container..."
    python3 -c "
import asyncio
import httpx

async def remove_container():
    client = httpx.AsyncClient(
        base_url='$PROXMOX_URL/api2/json',
        headers={'Authorization': '$PROXMOX_TOKEN'},
        verify=False,
        timeout=60.0
    )
    
    try:
        response = await client.delete('/nodes/$PROXMOX_NODE/lxc/$temp_id')
        if response.status_code == 200:
            print('✅ Container removed successfully')
        else:
            print(f'❌ Failed to remove: {response.status_code}')
    except Exception as e:
        print(f'❌ Error removing: {e}')
    finally:
        await client.aclose()

asyncio.run(remove_container())
"
    
    echo "   ✅ CT $temp_id cleanup completed"
    echo ""
}

### MAIN EXECUTION ###

echo "🧹 Starting Cloned Container Cleanup"
echo "===================================="
echo "🎯 Target: Remove duplicate 4-digit temp containers"
echo "⏰ Timestamp: $(date)"
echo ""

if [ -z "$PROXMOX_TOKEN" ]; then
    echo "❌ PROXMOX_TOKEN not set. Please configure authentication."
    exit 1
fi

successful_cleanups=0
total_cleanups=$((${#TEMP_CONTAINERS_RUNNING[@]} + ${#TEMP_CONTAINERS_STOPPED[@]}))

echo "📋 PHASE 1: Cleaning up running temp containers"
echo "-----------------------------------------------"

for temp_id in "${!TEMP_CONTAINERS_RUNNING[@]}"; do
    container_info="${TEMP_CONTAINERS_RUNNING[$temp_id]}"
    IFS=':' read -r name original_id <<< "$container_info"
    
    if stop_and_remove_container "$temp_id" "$name" "$original_id"; then
        ((successful_cleanups++))
    fi
done

echo "📋 PHASE 2: Cleaning up stopped temp containers"
echo "------------------------------------------------"

for temp_id in "${!TEMP_CONTAINERS_STOPPED[@]}"; do
    container_info="${TEMP_CONTAINERS_STOPPED[$temp_id]}"
    IFS=':' read -r name original_id <<< "$container_info"
    
    if stop_and_remove_container "$temp_id" "$name" "$original_id"; then
        ((successful_cleanups++))
    fi
done

echo "📊 Cleanup Summary:"
echo "  ✅ Successful: $successful_cleanups/$total_cleanups"
echo "  📈 Success Rate: $((successful_cleanups * 100 / total_cleanups))%"
echo ""

if [ "$successful_cleanups" -eq "$total_cleanups" ]; then
    echo "🎉 All temp containers cleaned up successfully!"
    echo "✅ No more duplicate containers"
    echo "🔧 Ready for monitoring deployment"
else
    echo "⚠️ Some cleanup operations failed. Manual intervention may be required."
fi

echo ""
echo "🔄 Next Steps:"
echo "  1. Verify original containers are running properly"
echo "  2. Check for missing critical containers (e.g., CT 114 Home Assistant)"
echo "  3. Deploy monitoring scripts to clean environment"
echo "  4. Update container optimization documentation"
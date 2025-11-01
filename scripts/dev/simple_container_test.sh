#!/bin/bash
# Simple test script to identify where the TrueNAS monitoring script hangs

set -euo pipefail

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

echo "=== SIMPLE CONTAINER API TEST ==="
echo "Testing container 2000 (github-runner) API connectivity..."
echo "PROXMOX_URL: $PROXMOX_URL"
echo "PROXMOX_NODE: $PROXMOX_NODE"
echo ""

echo "1. Testing status API call..."
timeout 5s curl -s -k -H "Authorization: $PROXMOX_TOKEN" \
    "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/2000/status/current" \
    | python3 -c "import json, sys; data=json.load(sys.stdin); print(f'Status: {data[\"data\"][\"status\"]}, CPU: {data[\"data\"][\"cpu\"]:.2%}')" 2>/dev/null || echo "FAILED"

echo ""
echo "2. Testing config API call..."
timeout 5s curl -s -k -H "Authorization: $PROXMOX_TOKEN" \
    "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/2000/config" \
    | python3 -c "import json, sys; data=json.load(sys.stdin); print(f'Memory: {data[\"data\"][\"memory\"]}MB')" 2>/dev/null || echo "FAILED"

echo ""
echo "3. Testing simple Python metrics calculation..."
python3 -c "
import json
from datetime import datetime
print('Basic Python execution working')
result = {'test': 'success', 'timestamp': datetime.now().isoformat()}
print(json.dumps(result))
"

echo ""
echo "Test completed successfully!"
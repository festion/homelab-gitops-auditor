#!/bin/bash
set -euo pipefail

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-loader.sh"
load_config

echo "=== CURL TIMEOUT TESTING ==="
echo "PROXMOX_URL: $PROXMOX_URL"
echo "PROXMOX_NODE: $PROXMOX_NODE"
echo ""

echo "1. Testing basic curl with research-recommended timeouts..."
echo "Command: curl --connect-timeout 5 --max-time 10 --retry 2 --retry-delay 1 -s -k -H \"Authorization: $PROXMOX_TOKEN\" \"$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/2000/status/current\""
echo ""

# Test with proper timeout parameters from web research
start_time=$(date +%s)
echo "Starting at: $(date)"

result=$(curl --connect-timeout 5 --max-time 10 --retry 2 --retry-delay 1 \
    -s -k -H "Authorization: $PROXMOX_TOKEN" \
    "$PROXMOX_URL/api2/json/nodes/$PROXMOX_NODE/lxc/2000/status/current" \
    2>/dev/null || echo '{"error": "curl_failed"}')

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "Completed at: $(date)"
echo "Duration: ${duration} seconds"
echo "Result length: ${#result} characters"
echo ""

if [[ "$result" == *"error"* ]]; then
    echo "❌ CURL FAILED"
    echo "Result: $result"
else
    echo "✅ CURL SUCCESS"
    # Parse with Python to verify JSON structure
    echo "$result" | python3 -c "
import json
import sys
try:
    data = json.load(sys.stdin)
    if 'data' in data:
        status_data = data['data']
        print(f'Status: {status_data.get(\"status\", \"unknown\")}')
        print(f'CPU: {status_data.get(\"cpu\", 0)*100:.1f}%')
        print(f'Memory: {status_data.get(\"mem\", 0)/(1024*1024):.1f}MB')
        print('✅ JSON parsing successful')
    else:
        print('❌ Invalid response structure')
except Exception as e:
    print(f'❌ JSON parsing failed: {e}')
"
fi

echo ""
echo "=== TEST COMPLETE ==="
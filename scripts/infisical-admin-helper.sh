#!/bin/bash
#
# Infisical Admin Helper Script
# Utility script for managing infrastructure secrets via Infisical homelab-admin project
#
# Usage:
#   export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab..."
#   source scripts/infisical-admin-helper.sh
#   get_admin_secret "PROXMOX_PASSWORD"
#

INFISICAL_URL="${INFISICAL_URL:-https://infisical.internal.lakehouse.wtf}"
INFISICAL_ENV="${INFISICAL_ENV:-prod}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if token is set
check_token() {
  if [ -z "$INFISICAL_ADMIN_TOKEN" ]; then
    echo -e "${RED}❌ INFISICAL_ADMIN_TOKEN not set${NC}"
    echo ""
    echo "Please set the token:"
    echo "  export INFISICAL_ADMIN_TOKEN=\"st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab...\""
    return 1
  fi
  return 0
}

# Get a secret from Infisical homelab-admin project
get_admin_secret() {
  local secret_name="$1"
  local environment="${2:-$INFISICAL_ENV}"

  if ! check_token; then
    return 1
  fi

  if [ -z "$secret_name" ]; then
    echo -e "${RED}❌ Secret name required${NC}"
    echo "Usage: get_admin_secret SECRET_NAME [environment]"
    return 1
  fi

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
    "$INFISICAL_URL/api/v3/secrets/raw/$secret_name?environment=$environment")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ]; then
    echo "$body" | jq -r '.secret.secretValue' 2>/dev/null
    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Failed to parse secret value${NC}" >&2
      return 1
    fi
  else
    echo -e "${RED}❌ Failed to fetch secret '$secret_name' (HTTP $http_code)${NC}" >&2
    echo "$body" | jq -r '.message // .error // .' >&2 2>/dev/null || echo "$body" >&2
    return 1
  fi
}

# Set a secret in Infisical homelab-admin project
set_admin_secret() {
  local secret_name="$1"
  local secret_value="$2"
  local environment="${3:-$INFISICAL_ENV}"

  if ! check_token; then
    return 1
  fi

  if [ -z "$secret_name" ] || [ -z "$secret_value" ]; then
    echo -e "${RED}❌ Secret name and value required${NC}"
    echo "Usage: set_admin_secret SECRET_NAME SECRET_VALUE [environment]"
    return 1
  fi

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"secretName\":\"$secret_name\",\"secretValue\":\"$secret_value\",\"environment\":\"$environment\",\"type\":\"shared\"}" \
    "$INFISICAL_URL/api/v3/secrets/raw/$secret_name")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
    echo -e "${GREEN}✅ Secret '$secret_name' set successfully in $environment${NC}"
    return 0
  else
    echo -e "${RED}❌ Failed to set secret '$secret_name' (HTTP $http_code)${NC}" >&2
    echo "$body" | jq -r '.message // .error // .' >&2 2>/dev/null || echo "$body" >&2
    return 1
  fi
}

# List all secrets in homelab-admin project
list_admin_secrets() {
  local environment="${1:-$INFISICAL_ENV}"

  if ! check_token; then
    return 1
  fi

  echo -e "${YELLOW}📋 Listing secrets in homelab-admin ($environment)...${NC}"

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $INFISICAL_ADMIN_TOKEN" \
    "$INFISICAL_URL/api/v3/secrets/raw?environment=$environment")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ]; then
    echo "$body" | jq -r '.secrets[] | "  - \(.secretKey)"' 2>/dev/null
    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Failed to parse secrets list${NC}" >&2
      return 1
    fi
  else
    echo -e "${RED}❌ Failed to list secrets (HTTP $http_code)${NC}" >&2
    echo "$body" | jq -r '.message // .error // .' >&2 2>/dev/null || echo "$body" >&2
    return 1
  fi
}

# Test connection to Infisical
test_admin_connection() {
  if ! check_token; then
    return 1
  fi

  echo -e "${YELLOW}🧪 Testing Infisical connection...${NC}"

  local response
  response=$(curl -s -w "\n%{http_code}" \
    "$INFISICAL_URL/api/status")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Infisical server is reachable${NC}"

    # Test token by trying to list secrets
    echo -e "${YELLOW}🔑 Testing admin token...${NC}"
    if list_admin_secrets >/dev/null 2>&1; then
      echo -e "${GREEN}✅ Admin token is valid${NC}"
      return 0
    else
      echo -e "${RED}❌ Admin token is invalid or has no permissions${NC}"
      return 1
    fi
  else
    echo -e "${RED}❌ Cannot reach Infisical server (HTTP $http_code)${NC}"
    return 1
  fi
}

# Example: Get Proxmox credentials
get_proxmox_credentials() {
  echo -e "${YELLOW}🔐 Fetching Proxmox credentials...${NC}"

  PROXMOX_HOST=$(get_admin_secret "PROXMOX_HOST")
  PROXMOX_USERNAME=$(get_admin_secret "PROXMOX_USERNAME")
  PROXMOX_PASSWORD=$(get_admin_secret "PROXMOX_PASSWORD")

  if [ -n "$PROXMOX_HOST" ] && [ -n "$PROXMOX_USERNAME" ] && [ -n "$PROXMOX_PASSWORD" ]; then
    echo -e "${GREEN}✅ Proxmox credentials loaded${NC}"
    echo "  Host: $PROXMOX_HOST"
    echo "  Username: $PROXMOX_USERNAME"
    echo "  Password: [REDACTED]"
    export PROXMOX_HOST PROXMOX_USERNAME PROXMOX_PASSWORD
    return 0
  else
    echo -e "${RED}❌ Failed to load Proxmox credentials${NC}"
    return 1
  fi
}

# Example: Get AdGuard credentials
get_adguard_credentials() {
  echo -e "${YELLOW}🔐 Fetching AdGuard credentials...${NC}"

  ADGUARD_PRIMARY_URL=$(get_admin_secret "ADGUARD_PRIMARY_URL")
  ADGUARD_SECONDARY_URL=$(get_admin_secret "ADGUARD_SECONDARY_URL")
  ADGUARD_USERNAME=$(get_admin_secret "ADGUARD_USERNAME")
  ADGUARD_PASSWORD=$(get_admin_secret "ADGUARD_PASSWORD")

  if [ -n "$ADGUARD_USERNAME" ] && [ -n "$ADGUARD_PASSWORD" ]; then
    echo -e "${GREEN}✅ AdGuard credentials loaded${NC}"
    echo "  Primary: ${ADGUARD_PRIMARY_URL:-http://192.168.1.253:80}"
    echo "  Secondary: ${ADGUARD_SECONDARY_URL:-http://192.168.1.224:80}"
    echo "  Username: $ADGUARD_USERNAME"
    echo "  Password: [REDACTED]"
    export ADGUARD_PRIMARY_URL ADGUARD_SECONDARY_URL ADGUARD_USERNAME ADGUARD_PASSWORD
    return 0
  else
    echo -e "${RED}❌ Failed to load AdGuard credentials${NC}"
    return 1
  fi
}

# Help message
show_help() {
  cat <<EOF
${GREEN}Infisical Admin Helper${NC}

Utility functions for managing infrastructure secrets via Infisical homelab-admin project.

${YELLOW}Setup:${NC}
  export INFISICAL_ADMIN_TOKEN="st.5289cbfa-4d3c-4e19-ac4f-551a18e1aeab..."
  source scripts/infisical-admin-helper.sh

${YELLOW}Available Functions:${NC}
  test_admin_connection              - Test connection to Infisical
  list_admin_secrets [env]           - List all secrets (default: prod)
  get_admin_secret NAME [env]        - Get a secret value
  set_admin_secret NAME VALUE [env]  - Set a secret value
  get_proxmox_credentials            - Load Proxmox credentials to env vars
  get_adguard_credentials            - Load AdGuard credentials to env vars

${YELLOW}Examples:${NC}
  # Test connection
  test_admin_connection

  # Get a single secret
  PROXMOX_PASSWORD=\$(get_admin_secret "PROXMOX_PASSWORD")

  # Set a new secret
  set_admin_secret "CLOUDFLARE_API_KEY" "your-api-key-here"

  # List all secrets
  list_admin_secrets

  # Load Proxmox credentials
  get_proxmox_credentials
  sshpass -p "\$PROXMOX_PASSWORD" ssh \$PROXMOX_USERNAME@\$PROXMOX_HOST "pct list"

${YELLOW}Environment Variables:${NC}
  INFISICAL_ADMIN_TOKEN  - Service token for homelab-admin project (required)
  INFISICAL_URL          - Infisical server URL (default: https://infisical.internal.lakehouse.wtf)
  INFISICAL_ENV          - Environment to use (default: prod)

EOF
}

# If script is run directly (not sourced), show help
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  show_help
fi

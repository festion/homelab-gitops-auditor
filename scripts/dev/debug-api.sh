#!/bin/bash
# API Debugging Utility
# Helps diagnose common issues with the GitOps Audit API

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Determine environment
if [ -d "/opt/gitops" ]; then
  echo -e "${CYAN}Running in production environment${NC}"
  ENV="production"
  ROOT_DIR="/opt/gitops"
else
  echo -e "${CYAN}Running in development environment${NC}"
  ENV="development"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT_DIR="$(dirname "$SCRIPT_DIR")"
fi

# Check Node.js and npm
echo -e "\n${YELLOW}Checking Node.js installation:${NC}"
node_version=$(node -v 2>/dev/null || echo "Node.js not found")
npm_version=$(npm -v 2>/dev/null || echo "npm not found")

echo "Node.js version: $node_version"
echo "npm version: $npm_version"

# Check API directory and files
echo -e "\n${YELLOW}Checking API directory:${NC}"
API_DIR="$ROOT_DIR/api"

if [ -d "$API_DIR" ]; then
  echo -e "${GREEN}✓ API directory exists at $API_DIR${NC}"
  
  if [ -f "$API_DIR/server.js" ]; then
    echo -e "${GREEN}✓ server.js exists${NC}"
  else
    echo -e "${RED}✗ server.js is missing!${NC}"
  fi
  
  if [ -d "$API_DIR/node_modules" ]; then
    echo -e "${GREEN}✓ node_modules exists${NC}"
  else
    echo -e "${RED}✗ node_modules is missing! Run 'npm install' in $API_DIR${NC}"
  fi
else
  echo -e "${RED}✗ API directory not found!${NC}"
fi

# Check audit history
echo -e "\n${YELLOW}Checking audit history:${NC}"
HISTORY_DIR="$ROOT_DIR/audit-history"

if [ -d "$HISTORY_DIR" ]; then
  echo -e "${GREEN}✓ Audit history directory exists at $HISTORY_DIR${NC}"
  
  count=$(ls -1 "$HISTORY_DIR"/*.json 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $count JSON files in audit history${NC}"
  else
    echo -e "${RED}✗ No JSON files found in audit history${NC}"
  fi
  
  if [ -f "$HISTORY_DIR/latest.json" ]; then
    echo -e "${GREEN}✓ latest.json exists${NC}"
    
    # Check JSON validity
    if jq . "$HISTORY_DIR/latest.json" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ latest.json is valid JSON${NC}"
    else
      echo -e "${RED}✗ latest.json is not valid JSON!${NC}"
    fi
  else
    echo -e "${RED}✗ latest.json is missing!${NC}"
  fi
else
  echo -e "${RED}✗ Audit history directory not found!${NC}"
fi

# Check API is running (in production)
if [ "$ENV" = "production" ]; then
  echo -e "\n${YELLOW}Checking API service:${NC}"
  
  if systemctl is-active --quiet gitops-audit-api; then
    echo -e "${GREEN}✓ API service is running${NC}"
  else
    echo -e "${RED}✗ API service is not running!${NC}"
    echo -e "${CYAN}Recent logs:${NC}"
    journalctl -u gitops-audit-api -n 10
  fi
  
  echo -e "\n${YELLOW}Testing API endpoint:${NC}"
  if curl -s http://localhost:3070/audit > /dev/null; then
    echo -e "${GREEN}✓ API endpoint is responding${NC}"
    repo_count=$(curl -s http://localhost:3070/audit | jq '.repos | length' 2>/dev/null || echo "Error parsing JSON")
    echo -e "${CYAN}Found $repo_count repositories in API response${NC}"
  else
    echo -e "${RED}✗ API endpoint is not responding!${NC}"
  fi
else
  # In development, check if API is already running
  if nc -z localhost 3070 2>/dev/null; then
    echo -e "\n${GREEN}✓ API is running on port 3070${NC}"
    repo_count=$(curl -s http://localhost:3070/audit | jq '.repos | length' 2>/dev/null || echo "Error parsing JSON")
    echo -e "${CYAN}Found $repo_count repositories in API response${NC}"
  else
    echo -e "\n${YELLOW}API is not running. Start with:${NC}"
    echo -e "${CYAN}cd $ROOT_DIR && NODE_ENV=development node api/server.js${NC}"
  fi
fi

echo -e "\n${YELLOW}Debug complete!${NC}"
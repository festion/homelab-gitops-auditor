#!/bin/bash
# Start Home Assistant Deployment Service
# Usage: ./start-deployment-service.sh [environment]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR/services"
CONFIG_DIR="$SCRIPT_DIR/../config"

# Default environment
ENVIRONMENT="${1:-production}"

echo "🚀 Starting Home Assistant Deployment Service"
echo "   Environment: $ENVIRONMENT"
echo "   Service Directory: $SERVICE_DIR"
echo "   Config Directory: $CONFIG_DIR"
echo ""

# Check dependencies
echo "📦 Checking dependencies..."
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js version: $NODE_VERSION"

# Check if npm packages are installed
if [ ! -d "$SERVICE_DIR/node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    cd "$SERVICE_DIR"
    npm install
    cd "$SCRIPT_DIR"
fi

# Check configuration
CONFIG_FILE="$CONFIG_DIR/deployment-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    exit 1
fi

echo "✅ Configuration file found: $CONFIG_FILE"

# Set environment variables
export NODE_ENV="$ENVIRONMENT"
export DEPLOYER_CONFIG_PATH="$CONFIG_FILE"

# Create required directories
mkdir -p "$SCRIPT_DIR/../logs"
mkdir -p "$SCRIPT_DIR/../logs/deployments"

echo "📁 Created required directories"

# Start the service
echo ""
echo "🔥 Starting deployment service..."
echo "   API will be available at: http://localhost:3071"
echo "   Health check: http://localhost:3071/health"
echo "   API status: http://localhost:3071/api/status"
echo ""
echo "Press Ctrl+C to stop the service"
echo "=========================================================================================="

cd "$SERVICE_DIR"
exec node home-assistant-deployer.js
#!/bin/bash

# WikiJS Sync Agent Installation Script
set -e

echo "🚀 Installing WikiJS Sync Agent..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16 or later."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "16" ]; then
    echo "❌ Node.js version 16 or later is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js version check passed: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Make CLI executable
chmod +x src/cli.js

# Create data directory
echo "📁 Creating data directory..."
mkdir -p ~/.wikijs-sync/logs

# Copy example configuration if it doesn't exist
if [ ! -f ~/.wikijs-sync/config.json ]; then
    echo "📋 Creating example configuration..."
    cp config.example.json ~/.wikijs-sync/config.json.example
    echo "   Configuration example created at ~/.wikijs-sync/config.json.example"
    echo "   Please copy and customize it to ~/.wikijs-sync/config.json"
else
    echo "✅ Configuration file already exists"
fi

# Create symbolic link for global access (optional)
if command -v npm &> /dev/null; then
    echo "🔗 Creating global symlink..."
    npm link 2>/dev/null || echo "   (Could not create global symlink - you may need sudo)"
fi

echo ""
echo "✅ Installation completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure your WikiJS connection:"
echo "      wikijs-sync config --init"
echo ""
echo "   2. Test the connection:"
echo "      wikijs-sync test"
echo ""
echo "   3. Start synchronization:"
echo "      wikijs-sync start"
echo ""
echo "📖 For more information, run: wikijs-sync --help"
echo "🐛 Report issues: https://github.com/your-org/wikijs-sync-agent/issues"
echo ""
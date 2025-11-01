#!/bin/bash
# deploy-websocket-agent.sh - Deploy the WebSocket development agent

set -e

echo "🚀 WebSocket Development Agent Deployment Script"
echo "================================================"

# Configuration
PROJECT_ROOT="/mnt/c/GIT/homelab-gitops-auditor"
AGENT_PROMPTS_DIR="$PROJECT_ROOT/.prompts/agents"
DOCS_DIR="$PROJECT_ROOT/docs"

# Verify project structure
echo "📋 Verifying project structure..."
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "❌ Error: Project root not found at $PROJECT_ROOT"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/.prompts/agents/websocket-deployment-agent.md" ]; then
    echo "❌ Error: WebSocket agent prompt not found"
    exit 1
fi

echo "✅ Project structure verified"

# Check Gemini MCP server availability
echo "🔍 Checking Gemini MCP server availability..."
if ! claude mcp list | grep -q "gemini-collab"; then
    echo "❌ Error: Gemini MCP server not configured"
    echo "Please run: claude mcp add gemini-collab /mnt/c/GIT/claude_code-gemini-mcp/venv/bin/python /mnt/c/GIT/claude_code-gemini-mcp/server.py"
    exit 1
fi

echo "✅ Gemini MCP server configured"

# Check Serena project activation
echo "🔍 Checking Serena project activation..."
if ! ps aux | grep -q "homelab-gitops-auditor"; then
    echo "⚠️  Warning: Serena not running with homelab-gitops-auditor project"
    echo "Consider activating the project in Serena"
fi

# Verify required dependencies
echo "📦 Checking development environment..."

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found"
    exit 1
fi

echo "✅ Node.js $(node --version) and npm $(npm --version) available"

# Check backend dependencies
echo "🔧 Checking backend environment..."
cd "$PROJECT_ROOT/api"
if [ ! -f "package.json" ]; then
    echo "❌ Error: Backend package.json not found"
    exit 1
fi

echo "✅ Backend environment ready"

# Check frontend dependencies
echo "🎨 Checking frontend environment..."
cd "$PROJECT_ROOT/dashboard"
if [ ! -f "package.json" ]; then
    echo "❌ Error: Frontend package.json not found"
    exit 1
fi

echo "✅ Frontend environment ready"

# Create agent workspace
echo "📁 Setting up agent workspace..."
cd "$PROJECT_ROOT"

# Create agent development directory
mkdir -p "agent-workspace/websocket"
mkdir -p "agent-workspace/websocket/backend"
mkdir -p "agent-workspace/websocket/frontend"
mkdir -p "agent-workspace/websocket/tests"
mkdir -p "agent-workspace/websocket/docs"

echo "✅ Agent workspace created"

# Copy relevant deployment plan and agent instructions
echo "📋 Preparing agent documentation..."
cp "$DOCS_DIR/WEBSOCKET-DEPLOYMENT-PLAN.md" "agent-workspace/websocket/docs/"
cp "$AGENT_PROMPTS_DIR/websocket-deployment-agent.md" "agent-workspace/websocket/docs/"
cp "$AGENT_PROMPTS_DIR/activate-websocket-agent.md" "agent-workspace/websocket/docs/"

echo "✅ Agent documentation prepared"

# Create agent task tracker
cat > "agent-workspace/websocket/AGENT_TASKS.md" << 'EOF'
# WebSocket Agent Task Tracker

## Phase 1: Backend Infrastructure (Week 1)
- [ ] WebSocket server integration with Express.js
- [ ] File system watcher implementation
- [ ] Connection management system
- [ ] Health check API endpoints
- [ ] **Gemini Review**: Backend architecture
- [ ] **Gemini Review**: Security implementation
- [ ] **Gemini Review**: Error handling

## Phase 2: Frontend Integration (Week 2)
- [ ] React WebSocket hook development
- [ ] Dashboard component updates
- [ ] Connection status indicators
- [ ] Fallback mechanism implementation
- [ ] **Gemini Review**: Frontend integration
- [ ] **Gemini Review**: User experience
- [ ] **Gemini Review**: Error boundaries

## Phase 3: Testing & Deployment (Week 3)
- [ ] Unit test implementation
- [ ] Integration testing
- [ ] Performance testing
- [ ] Staging deployment
- [ ] Production deployment
- [ ] **Gemini Review**: Testing strategy
- [ ] **Gemini Review**: Deployment procedures
- [ ] **Gemini Review**: Performance optimization

## Gemini Review Log
| Date | Component | Status | Issues | Resolution |
|------|-----------|--------|--------|------------|
|      |           |        |        |            |

## Performance Metrics
- [ ] WebSocket connection time < 2s
- [ ] Update latency < 500ms
- [ ] Support 20+ concurrent connections
- [ ] 99.5% connection stability
- [ ] Graceful fallback functional

## Notes
Add development notes, issues, and decisions here.
EOF

echo "✅ Agent task tracker created"

# Install WebSocket dependencies for development
echo "📦 Installing WebSocket development dependencies..."

# Backend WebSocket dependencies
cd "$PROJECT_ROOT/api"
echo "Installing backend WebSocket dependencies..."
npm install ws chokidar express-ws --save

# Frontend WebSocket dependencies (if needed)
cd "$PROJECT_ROOT/dashboard"
echo "Installing frontend dependencies..."
# WebSocket is built into browsers, but may need additional utilities
npm install --save-dev @types/ws

echo "✅ WebSocket dependencies installed"

# Create agent activation script
cat > "$PROJECT_ROOT/agent-workspace/websocket/activate-agent.sh" << 'EOF'
#!/bin/bash
# activate-agent.sh - Activate the WebSocket development agent

echo "🤖 Activating WebSocket Development Agent"
echo "========================================"

echo "Agent Role: WebSocket Development & Deployment"
echo "Project: homelab-gitops-auditor v1.2.0"
echo "Authority: Full development autonomy with Gemini oversight"
echo ""

echo "📋 CRITICAL REQUIREMENTS:"
echo "1. ALL code changes MUST be reviewed by Gemini"
echo "2. Use: mcp__gemini-collab__gemini_code_review"
echo "3. Focus: WebSocket stability, performance, security"
echo ""

echo "📁 Agent Workspace: $(pwd)"
echo "📖 Documentation: ./docs/"
echo "📝 Task Tracker: ./AGENT_TASKS.md"
echo ""

echo "🔧 Development Environment:"
echo "Backend: ../../../api/"
echo "Frontend: ../../../dashboard/"
echo "Scripts: ../../../scripts/"
echo ""

echo "✅ Agent activation complete!"
echo "Next: Review deployment plan and begin Phase 1 development"
EOF

chmod +x "$PROJECT_ROOT/agent-workspace/websocket/activate-agent.sh"

# Create quick development commands
cat > "$PROJECT_ROOT/agent-workspace/websocket/dev-commands.sh" << 'EOF'
#!/bin/bash
# dev-commands.sh - Quick development commands for WebSocket agent

PROJECT_ROOT="/mnt/c/GIT/homelab-gitops-auditor"

# Backend development
start_backend() {
    echo "🚀 Starting backend development server..."
    cd "$PROJECT_ROOT/api"
    npm run dev
}

# Frontend development
start_frontend() {
    echo "🎨 Starting frontend development server..."
    cd "$PROJECT_ROOT/dashboard"
    npm run dev
}

# Run tests
run_tests() {
    echo "🧪 Running WebSocket tests..."
    cd "$PROJECT_ROOT"
    npm test
}

# Gemini code review helper
gemini_review() {
    echo "🔍 Use this command structure for Gemini review:"
    echo "mcp__gemini-collab__gemini_code_review"
    echo "  code: \"[YOUR CODE HERE]\""
    echo "  focus: \"WebSocket implementation stability, performance, and security\""
}

# Check project status
status() {
    echo "📊 WebSocket Development Status:"
    echo "Project: $PROJECT_ROOT"
    echo "Workspace: $(pwd)"
    echo "Tasks: See AGENT_TASKS.md"
}

case "$1" in
    backend) start_backend ;;
    frontend) start_frontend ;;
    test) run_tests ;;
    gemini) gemini_review ;;
    status) status ;;
    *)
        echo "Usage: $0 {backend|frontend|test|gemini|status}"
        echo ""
        echo "Commands:"
        echo "  backend  - Start backend development server"
        echo "  frontend - Start frontend development server"
        echo "  test     - Run WebSocket tests"
        echo "  gemini   - Show Gemini review command"
        echo "  status   - Show development status"
        ;;
esac
EOF

chmod +x "$PROJECT_ROOT/agent-workspace/websocket/dev-commands.sh"

# Final summary
echo ""
echo "🎉 WebSocket Development Agent Deployment Complete!"
echo "=================================================="
echo ""
echo "📁 Agent Workspace: $PROJECT_ROOT/agent-workspace/websocket/"
echo "📖 Documentation: Available in workspace/docs/"
echo "📝 Task Tracker: AGENT_TASKS.md"
echo "🔧 Development Tools: dev-commands.sh"
echo ""
echo "🚀 Next Steps:"
echo "1. cd $PROJECT_ROOT/agent-workspace/websocket/"
echo "2. ./activate-agent.sh"
echo "3. Review docs/WEBSOCKET-DEPLOYMENT-PLAN.md"
echo "4. Begin Phase 1 development with Gemini reviews"
echo ""
echo "✅ Agent is ready for activation!"
EOF

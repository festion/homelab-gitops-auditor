#!/bin/bash
# WikiJS MCP Server Test Suite - Comprehensive functionality validation
# Version: 1.0.0

set -euo pipefail

# Configuration
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
TEST_LOG="/tmp/wikijs-mcp-test-$(date +%Y%m%d-%H%M%S).log"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log_test() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$TEST_LOG"
}

# Test result functions
test_passed() {
    local test_name="$1"
    echo -e "${GREEN}✅ PASS${NC}: $test_name"
    log_test "PASS" "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_failed() {
    local test_name="$1"
    local error="${2:-Unknown error}"
    echo -e "${RED}❌ FAIL${NC}: $test_name - $error"
    log_test "FAIL" "$test_name - $error"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_skipped() {
    local test_name="$1"
    local reason="${2:-Prerequisites not met}"
    echo -e "${YELLOW}⏭️  SKIP${NC}: $test_name - $reason"
    log_test "SKIP" "$test_name - $reason"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

# Test 1: Token Manager Functionality
test_token_manager() {
    echo -e "\n${BLUE}🔧 Testing Token Manager${NC}"
    
    if [ -x "$SCRIPT_DIR/github-token-manager.sh" ]; then
        if "$SCRIPT_DIR/github-token-manager.sh" verify wikijs >/dev/null 2>&1; then
            test_passed "Token Manager - WikiJS credentials verification"
        else
            test_failed "Token Manager - WikiJS credentials verification"
        fi
        
        if "$SCRIPT_DIR/github-token-manager.sh" load wikijs >/dev/null 2>&1; then
            test_passed "Token Manager - WikiJS credentials loading"
        else
            test_failed "Token Manager - WikiJS credentials loading"
        fi
    else
        test_skipped "Token Manager tests" "github-token-manager.sh not executable"
    fi
}

# Test 2: MCP Server File Validation
test_mcp_server_files() {
    echo -e "\n${BLUE}📁 Testing MCP Server Files${NC}"
    
    local mcp_dir="/home/dev/workspace/mcp-servers/wikijs-mcp-server"
    
    if [ -d "$mcp_dir" ]; then
        test_passed "MCP Server Directory exists"
        
        local required_files=(
            "src/wikijs_mcp/__init__.py"
            "src/wikijs_mcp/server.py" 
            "src/wikijs_mcp/config.py"
            "src/wikijs_mcp/wikijs_client.py"
            "src/wikijs_mcp/document_scanner.py"
            "src/wikijs_mcp/security.py"
            "src/wikijs_mcp/exceptions.py"
            "run_server.py"
        )
        
        for file in "${required_files[@]}"; do
            if [ -f "$mcp_dir/$file" ]; then
                test_passed "MCP Server File - $file"
            else
                test_failed "MCP Server File - $file" "File not found"
            fi
        done
    else
        test_failed "MCP Server Directory" "Directory not found: $mcp_dir"
    fi
}

# Test 3: Python Import Test
test_python_imports() {
    echo -e "\n${BLUE}🐍 Testing Python Imports${NC}"
    
    local mcp_dir="/home/dev/workspace/mcp-servers/wikijs-mcp-server"
    
    if [ -d "$mcp_dir" ]; then
        cd "$mcp_dir"
        
        # Test main server import
        if python3 -c "import sys; sys.path.insert(0, 'src'); from wikijs_mcp import server" 2>/dev/null; then
            test_passed "Python Import - wikijs_mcp.server"
        else
            test_failed "Python Import - wikijs_mcp.server"
        fi
        
        # Test individual modules
        local modules=("config" "wikijs_client" "document_scanner" "security" "exceptions")
        for module in "${modules[@]}"; do
            if python3 -c "import sys; sys.path.insert(0, 'src'); from wikijs_mcp import $module" 2>/dev/null; then
                test_passed "Python Import - wikijs_mcp.$module"
            else
                test_failed "Python Import - wikijs_mcp.$module"
            fi
        done
    else
        test_skipped "Python Import tests" "MCP server directory not found"
    fi
}

# Test 4: Wrapper Script Validation
test_wrapper_script() {
    echo -e "\n${BLUE}🔧 Testing Wrapper Script${NC}"
    
    if [ -x "$SCRIPT_DIR/wikijs-mcp-wrapper.sh" ]; then
        test_passed "Wrapper Script - Executable"
        
        # Test syntax
        if bash -n "$SCRIPT_DIR/wikijs-mcp-wrapper.sh"; then
            test_passed "Wrapper Script - Syntax validation"
        else
            test_failed "Wrapper Script - Syntax validation"
        fi
        
        # Test dry run (timeout to avoid hanging)
        log_test "INFO" "Testing wrapper script dry run (10s timeout)"
        if timeout 10s "$SCRIPT_DIR/wikijs-mcp-wrapper.sh" >/dev/null 2>&1; then
            test_passed "Wrapper Script - Dry run execution"
        else
            local exit_code=$?
            if [ $exit_code -eq 124 ]; then
                test_passed "Wrapper Script - Started successfully (timed out as expected)"
            else
                test_failed "Wrapper Script - Dry run execution" "Exit code: $exit_code"
            fi
        fi
    else
        test_failed "Wrapper Script" "Not executable or not found"
    fi
}

# Test 5: Configuration Files
test_configuration() {
    echo -e "\n${BLUE}⚙️  Testing Configuration${NC}"
    
    # Test MCP configuration
    if [ -f "$SCRIPT_DIR/mcp-wikijs-config.json" ]; then
        if python3 -m json.tool "$SCRIPT_DIR/mcp-wikijs-config.json" >/dev/null 2>&1; then
            test_passed "Configuration - MCP WikiJS config JSON syntax"
        else
            test_failed "Configuration - MCP WikiJS config JSON syntax"
        fi
    else
        test_skipped "Configuration - MCP WikiJS config" "File not found"
    fi
    
    # Test token storage
    if [ -f "/home/dev/.mcp_tokens/wikijs_url" ] && [ -f "/home/dev/.mcp_tokens/wikijs_token" ]; then
        test_passed "Configuration - WikiJS credentials stored"
    else
        test_failed "Configuration - WikiJS credentials stored"
    fi
}

# Test 6: Health Monitoring
test_health_monitoring() {
    echo -e "\n${BLUE}🏥 Testing Health Monitoring${NC}"
    
    # Test health monitor script
    if [ -x "$SCRIPT_DIR/wikijs-health-monitor.sh" ]; then
        test_passed "Health Monitor - Script executable"
        
        # Test syntax
        if bash -n "$SCRIPT_DIR/wikijs-health-monitor.sh"; then
            test_passed "Health Monitor - Syntax validation"
        else
            test_failed "Health Monitor - Syntax validation"
        fi
        
        # Test status command
        if "$SCRIPT_DIR/wikijs-health-monitor.sh" status >/dev/null 2>&1; then
            test_passed "Health Monitor - Status command"
        else
            test_failed "Health Monitor - Status command"
        fi
    else
        test_failed "Health Monitor" "Script not executable or not found"
    fi
}

# Test 7: WikiJS Connectivity (if available)
test_wikijs_connectivity() {
    echo -e "\n${BLUE}🌐 Testing WikiJS Connectivity${NC}"
    
    # Load credentials first
    if eval "$("$SCRIPT_DIR/github-token-manager.sh" load wikijs 2>/dev/null)"; then
        local url="$WIKIJS_URL"
        
        if [ -n "$url" ]; then
            log_test "INFO" "Testing connectivity to: $url"
            
            # Basic connectivity test
            if timeout 10 curl -s --fail "$url" >/dev/null 2>&1; then
                test_passed "WikiJS Connectivity - Basic HTTP"
                
                # GraphQL endpoint test
                if timeout 10 curl -s -X POST \
                    -H "Content-Type: application/json" \
                    -H "Authorization: Bearer $WIKIJS_TOKEN" \
                    -d '{"query": "{ site { title } }"}' \
                    "$url/graphql" | grep -q '"data"'; then
                    test_passed "WikiJS Connectivity - GraphQL API"
                else
                    test_failed "WikiJS Connectivity - GraphQL API"
                fi
            else
                test_failed "WikiJS Connectivity - Basic HTTP" "Cannot reach $url"
            fi
        else
            test_skipped "WikiJS Connectivity tests" "No WikiJS URL configured"
        fi
    else
        test_skipped "WikiJS Connectivity tests" "Cannot load credentials"
    fi
}

# Test 8: Directory Structure
test_directory_structure() {
    echo -e "\n${BLUE}📂 Testing Directory Structure${NC}"
    
    local required_dirs=(
        "/home/dev/.mcp_tokens"
        "/home/dev/.mcp_logs"
        "/home/dev/.wikijs_mcp"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            test_passed "Directory Structure - $dir"
            
            # Check permissions
            local perms=$(stat -c %a "$dir" 2>/dev/null || echo "000")
            if [ "$perms" = "700" ]; then
                test_passed "Directory Permissions - $dir (700)"
            else
                test_failed "Directory Permissions - $dir" "Expected 700, got $perms"
            fi
        else
            test_failed "Directory Structure - $dir" "Directory not found"
        fi
    done
}

# Main test runner
run_all_tests() {
    echo -e "${BLUE}🚀 WikiJS MCP Server Test Suite${NC}"
    echo "=================================="
    echo "Test log: $TEST_LOG"
    echo ""
    
    log_test "INFO" "Starting WikiJS MCP Server test suite"
    
    # Run all tests
    test_token_manager
    test_mcp_server_files
    test_python_imports
    test_wrapper_script
    test_configuration
    test_health_monitoring
    test_wikijs_connectivity
    test_directory_structure
    
    # Summary
    echo ""
    echo "=================================="
    echo -e "${BLUE}📊 Test Results Summary${NC}"
    echo "=================================="
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo "Total: $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    echo ""
    echo "Test log: $TEST_LOG"
    
    log_test "INFO" "Test suite completed - Passed: $TESTS_PASSED, Failed: $TESTS_FAILED, Skipped: $TESTS_SKIPPED"
    
    # Return appropriate exit code
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed or skipped!${NC}"
        return 0
    else
        echo -e "${RED}💥 Some tests failed!${NC}"
        return 1
    fi
}

# Command handling
case "${1:-all}" in
    "all"|"run")
        run_all_tests
        ;;
    "token")
        test_token_manager
        ;;
    "files")
        test_mcp_server_files
        ;;
    "imports")
        test_python_imports
        ;;
    "wrapper")
        test_wrapper_script
        ;;
    "config")
        test_configuration
        ;;
    "health")
        test_health_monitoring
        ;;
    "connectivity")
        test_wikijs_connectivity
        ;;
    "dirs")
        test_directory_structure
        ;;
    *)
        echo "WikiJS MCP Server Test Suite"
        echo "Usage: $0 {all|token|files|imports|wrapper|config|health|connectivity|dirs}"
        echo ""
        echo "Commands:"
        echo "  all          - Run all tests (default)"
        echo "  token        - Test token manager functionality"
        echo "  files        - Test MCP server files"
        echo "  imports      - Test Python imports"
        echo "  wrapper      - Test wrapper script"
        echo "  config       - Test configuration"
        echo "  health       - Test health monitoring"
        echo "  connectivity - Test WikiJS connectivity"
        echo "  dirs         - Test directory structure"
        exit 1
        ;;
esac
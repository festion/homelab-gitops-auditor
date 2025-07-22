#!/usr/bin/env python3
"""
Test script to verify WikiJS MCP server can start without hanging.
"""

import sys
import os
from pathlib import Path

# Add src directory to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

def test_server_startup():
    """Test that server can initialize without errors."""
    try:
        from wikijs_mcp.server import load_config, WikiJSMCPServer
        
        # Test config loading
        config_path = "config/wikijs_mcp_config.json"
        print(f"Testing config loading from {config_path}...")
        config = load_config(config_path)
        print("✅ Config loaded successfully")
        
        # Test server initialization  
        print("Testing server initialization...")
        server = WikiJSMCPServer(config)
        print("✅ Server initialized successfully")
        
        print("✅ WikiJS MCP Server startup test passed!")
        return True
        
    except Exception as e:
        print(f"❌ WikiJS MCP Server startup test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_server_startup()
    sys.exit(0 if success else 1)
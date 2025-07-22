#!/usr/bin/env python3
"""
Simple test script to verify WikiJS MCP Server setup.
"""

import json
import sys
import os

def test_config():
    """Test configuration loading."""
    config_path = "config/wikijs_mcp_config.json"
    
    print("🔧 Testing WikiJS MCP Server Setup")
    print("=" * 50)
    
    # Test 1: Configuration file exists
    if not os.path.exists(config_path):
        print("❌ Configuration file not found:", config_path)
        return False
    
    print("✅ Configuration file found")
    
    # Test 2: Valid JSON
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        print("✅ Configuration is valid JSON")
    except json.JSONDecodeError as e:
        print(f"❌ Configuration JSON error: {e}")
        return False
    
    # Test 3: Required sections
    required_sections = ['wikijs', 'document_discovery', 'security']
    for section in required_sections:
        if section not in config:
            print(f"❌ Missing required section: {section}")
            return False
        print(f"✅ Section '{section}' found")
    
    # Test 4: WikiJS configuration
    wikijs_config = config['wikijs']
    
    if 'url' not in wikijs_config:
        print("❌ Missing WikiJS URL")
        return False
    
    if 'api_key' not in wikijs_config:
        print("❌ Missing WikiJS API key")
        return False
    
    if wikijs_config['api_key'] == "PASTE_YOUR_API_KEY_HERE":
        print("❌ API key not configured (still placeholder)")
        return False
    
    print(f"✅ WikiJS URL: {wikijs_config['url']}")
    print(f"✅ API key configured: {wikijs_config['api_key'][:20]}...")
    
    # Test 5: File structure
    required_files = [
        "src/wikijs_mcp/__init__.py",
        "src/wikijs_mcp/config.py", 
        "src/wikijs_mcp/cli.py",
        "claude_desktop_config.json",
        "SETUP_INSTRUCTIONS.md"
    ]
    
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"⚠️  {file_path} (missing)")
    
    print("\n🎉 Basic Setup Verification Complete!")
    print("\n📋 Next Steps:")
    print("1. Install dependencies: pip install pydantic aiohttp PyYAML")
    print("2. Add MCP configuration to Claude Desktop")
    print("3. Restart Claude Desktop")
    print("4. Test with: 'Find markdown files in my GIT directory'")
    
    return True

if __name__ == "__main__":
    success = test_config()
    sys.exit(0 if success else 1)
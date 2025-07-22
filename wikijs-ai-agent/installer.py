"""
Installer for WikiJS MCP Server.

This installer sets up the WikiJS MCP Server environment including:
- Creating necessary directories
- Installing dependencies 
- Creating sample configuration
- Setting up command-line tools
- Integration instructions for Claude Desktop
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path


def run_command(command, capture_output=True, check=True):
    """Run a command and return the result."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=capture_output,
            text=True,
            check=check
        )
        return result
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed: {command}")
        print(f"Error: {e.stderr if e.stderr else e}")
        if check:
            sys.exit(1)
        return e


def check_python_version():
    """Check if Python version is compatible."""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        sys.exit(1)
    print(f"✅ Python version: {sys.version.split()[0]}")


def setup_directories():
    """Create necessary directories."""
    current_dir = Path.cwd()
    
    directories = [
        current_dir / "src" / "wikijs_mcp",
        current_dir / "tests",
        current_dir / "config",
        current_dir / "logs"
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"📁 Created directory: {directory}")


def install_dependencies():
    """Install Python dependencies."""
    print("📦 Installing dependencies...")
    
    # Required packages
    packages = [
        "mcp>=0.1.0",
        "aiohttp>=3.8.0",
        "pydantic>=2.0.0", 
        "pyyaml>=6.0",
        "asyncio-mqtt>=0.11.0"  # For future MQTT support
    ]
    
    for package in packages:
        print(f"  Installing {package}...")
        result = run_command(f"pip install {package}")
        if result.returncode == 0:
            print(f"  ✅ {package} installed")
        else:
            print(f"  ❌ Failed to install {package}")


def copy_source_files():
    """Copy source files to installation directory."""
    current_dir = Path.cwd()
    src_dir = current_dir / "src"
    
    if not src_dir.exists():
        print("❌ Source directory not found. Make sure you're running this from the project root.")
        sys.exit(1)
    
    print("📁 Source files already in place")


def create_sample_config():
    """Create sample configuration file."""
    config_dir = Path.cwd() / "config"
    config_file = config_dir / "wikijs_mcp_config.json"
    
    sample_config = {
        "wikijs": {
            "url": "https://your-wiki.example.com",
            "api_key": "your-api-key-here",
            "default_locale": "en",
            "default_editor": "markdown", 
            "default_tags": ["documentation", "auto-generated"],
            "timeout": 30,
            "retry_attempts": 3
        },
        "document_discovery": {
            "search_paths": [
                str(Path.home() / "documents"),
                str(Path.home() / "projects")
            ],
            "include_patterns": ["*.md", "*.markdown", "README.md"],
            "exclude_patterns": [
                "node_modules/**",
                ".git/**",
                "**/.git/**", 
                "**/node_modules/**",
                "*.private.md"
            ],
            "max_file_size": "10MB",
            "max_files_per_scan": 1000,
            "follow_symlinks": False,
            "extract_frontmatter": True,
            "extract_links": True
        },
        "security": {
            "allowed_paths": [
                str(Path.home() / "documents"),
                str(Path.home() / "projects"),
                "/mnt/docs"
            ],
            "forbidden_patterns": [
                "*.private.*",
                "secret*", 
                "password*",
                "*.key",
                "*.pem",
                "credentials*"
            ],
            "max_files_per_operation": 100,
            "require_path_validation": True,
            "allow_hidden_files": False,
            "content_filters": [
                "(?i)(password|secret|api[_-]?key|token)\\s*[:=]\\s*[^\\s]+",
                "-----BEGIN [A-Z ]+-----"
            ]
        },
        "page_config": {
            "default_title_transform": "title_case",
            "preserve_directory_structure": True,
            "update_existing_pages": False,
            "conflict_resolution": "skip",
            "auto_generate_tags": True,
            "include_metadata": True
        },
        "logging_level": "INFO"
    }
    
    with open(config_file, 'w') as f:
        json.dump(sample_config, f, indent=2)
    
    print(f"✅ Sample configuration created: {config_file}")
    return config_file


def create_run_script():
    """Create convenience run script."""
    current_dir = Path.cwd()
    
    # Create Python run script
    run_script = current_dir / "run_server.py"
    
    script_content = f'''#!/usr/bin/env python3
"""
WikiJS MCP Server runner script.
"""

import sys
import os
from pathlib import Path

# Add src directory to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

from wikijs_mcp.server import main

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
'''
    
    with open(run_script, 'w') as f:
        f.write(script_content)
    
    # Make executable on Unix systems
    if sys.platform != 'win32':
        os.chmod(run_script, 0o755)
    
    print(f"✅ Run script created: {run_script}")
    return run_script


def show_claude_integration():
    """Show Claude Desktop integration instructions."""
    current_dir = Path.cwd()
    config_file = current_dir / "config" / "wikijs_mcp_config.json"
    run_script = current_dir / "run_server.py"
    
    print("\\n" + "="*60)
    print("🤖 CLAUDE DESKTOP INTEGRATION")
    print("="*60)
    
    print("\\nTo integrate with Claude Desktop, add this to your Claude config:")
    print("\\n📁 Claude Desktop config location:")
    
    if sys.platform == "win32":
        config_path = "%APPDATA%\\Claude\\claude_desktop_config.json"
    elif sys.platform == "darwin":
        config_path = "~/Library/Application Support/Claude/claude_desktop_config.json"
    else:
        config_path = "~/.config/claude/claude_desktop_config.json"
    
    print(f"  {config_path}")
    
    claude_config = {
        "mcpServers": {
            "wikijs-mcp-server": {
                "command": "python",
                "args": [str(run_script), str(config_file)],
                "env": {}
            }
        }
    }
    
    print("\\n📝 Add this configuration:")
    print(json.dumps(claude_config, indent=2))
    
    print("\\n⚠️  Important Setup Steps:")
    print("1. Edit the configuration file with your WikiJS details:")
    print(f"   {config_file}")
    print("2. Update the 'allowed_paths' in security config")
    print("3. Set your WikiJS URL and API key")
    print("4. Test the connection before using with Claude")


def show_usage_examples():
    """Show usage examples."""
    current_dir = Path.cwd()
    
    print("\\n" + "="*60)
    print("📚 USAGE EXAMPLES")
    print("="*60)
    
    print("\\n🔧 Configuration:")
    print(f"  python -m wikijs_mcp.cli configure")
    print(f"  python -m wikijs_mcp.cli validate config/wikijs_mcp_config.json")
    
    print("\\n🧪 Testing:")
    print(f"  python -m wikijs_mcp.cli test-connection config/wikijs_mcp_config.json")
    print(f"  python -m wikijs_mcp.cli scan config/wikijs_mcp_config.json /path/to/docs")
    
    print("\\n🚀 Running:")
    print(f"  python run_server.py")
    print(f"  python -m wikijs_mcp.cli serve config/wikijs_mcp_config.json")
    
    print("\\n🔍 Document Operations (via Claude):")
    print('  "Find all markdown files in my projects directory"')
    print('  "Upload this document to my wiki at /documentation/project"')
    print('  "Migrate all docs from /local/docs to /wiki/imported"')


def show_next_steps():
    """Show next steps for user."""
    current_dir = Path.cwd()
    config_file = current_dir / "config" / "wikijs_mcp_config.json"
    
    print("\\n" + "="*60)
    print("🎯 NEXT STEPS")
    print("="*60)
    
    print("\\n1. 📝 Configure WikiJS Connection:")
    print(f"   Edit: {config_file}")
    print("   - Set your WikiJS URL")
    print("   - Add your API key") 
    print("   - Configure allowed paths")
    
    print("\\n2. 🧪 Test the Connection:")
    print("   python -m wikijs_mcp.cli test-connection config/wikijs_mcp_config.json")
    
    print("\\n3. 🔍 Test Document Discovery:")
    print("   python -m wikijs_mcp.cli scan config/wikijs_mcp_config.json ~/documents")
    
    print("\\n4. 🤖 Integrate with Claude Desktop:")
    print("   - Add the MCP server configuration")
    print("   - Restart Claude Desktop")
    print("   - Test with: 'Find markdown documents in my projects'")
    
    print("\\n5. 📚 Documentation:")
    print("   - Read README.md for detailed usage")
    print("   - Check examples for common workflows")
    print("   - Review security settings")


def main():
    """Main installer function."""
    print("🚀 WikiJS MCP Server Installer")
    print("="*50)
    
    # Check requirements
    check_python_version()
    
    # Setup environment
    setup_directories()
    install_dependencies()
    copy_source_files()
    
    # Create configuration and scripts
    config_file = create_sample_config()
    run_script = create_run_script()
    
    # Show integration instructions
    show_claude_integration()
    show_usage_examples()
    show_next_steps()
    
    print("\\n" + "="*60)
    print("✅ INSTALLATION COMPLETE!")
    print("="*60)
    print("\\nYour WikiJS MCP Server is ready to use.")
    print("Don't forget to configure your WikiJS connection details!")


if __name__ == "__main__":
    main()
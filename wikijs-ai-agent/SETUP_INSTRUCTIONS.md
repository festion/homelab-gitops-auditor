# WikiJS MCP Server - Complete Setup Instructions

## 🎯 Your WikiJS Configuration

**WikiJS URL**: `https://wiki.internal.lakehouse.wtf`  
**Status**: ✅ Pre-configured in the system

## 🔑 Required: Add Your API Key

### Step 1: Get Your WikiJS API Key

1. Open your WikiJS admin panel: `https://wiki.internal.lakehouse.wtf/admin`
2. Navigate to **Administration** → **API Access**
3. Click **"Generate New Key"**
4. Set the following permissions:
   - ✅ `pages:write` - Create and update pages
   - ✅ `pages:read` - Read existing pages
   - ✅ `pages:manage` - Full page management
5. Copy the generated API key (starts with `wjs_`)

### Step 2: Add API Key to Configuration

Edit the configuration file:
```bash
nano /home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/config/wikijs_mcp_config.json
```

Replace `PASTE_YOUR_API_KEY_HERE` with your actual API key:
```json
{
  "wikijs": {
    "url": "https://wiki.internal.lakehouse.wtf",
    "api_key": "wjs_your_actual_api_key_here",
    ...
  }
}
```

### Step 3: Test the Connection

```bash
cd /home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server
python -m wikijs_mcp.cli test-connection config/wikijs_mcp_config.json
```

Expected output:
```
✅ WikiJS Connection Test - SUCCESS
WikiJS Version: 2.x.x
Total Pages: [number]
Server URL: https://wiki.internal.lakehouse.wtf
```

## 🤖 Claude Desktop Integration

### Option 1: Copy Configuration (Recommended)

Copy the pre-generated configuration to your Claude Desktop config:

**Location of your Claude config file:**
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

**Add this to your Claude config:**
```json
{
  "mcpServers": {
    "wikijs-mcp-server": {
      "command": "python",
      "args": [
        "/home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/run_server.py",
        "/home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/config/wikijs_mcp_config.json"
      ],
      "env": {
        "PYTHONPATH": "/home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/src"
      }
    }
  }
}
```

### Option 2: Use Pre-generated File

Copy the ready-made configuration:
```bash
cp /home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/claude_desktop_config.json ~/.config/claude/claude_desktop_config.json
```

## 🧪 Test Your Setup

### 1. Test Document Discovery
```bash
cd /home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server
python -m wikijs_mcp.cli scan config/wikijs_mcp_config.json /home/dev/workspace
```

### 2. Test with Claude Desktop

Restart Claude Desktop, then try these commands:

**Find documents:**
> "Find all markdown documents in my GIT directory"

**Upload a document:**
> "Upload the README.md from my proxmox-agent project to the wiki at /infrastructure/proxmox"

**Migrate documentation:**
> "Migrate all documentation from my mcp-servers project to /development/mcp-servers in the wiki"

## 🛡️ Security Configuration

The system is pre-configured with secure defaults:

### Allowed Paths
- `/home/dev/workspace` - Main workspace directory
- `/home/dev/workspace/mcp-servers` - MCP server implementations
- `/home/dev/workspace/infrastructure` - Infrastructure projects
- `/home/dev/workspace/manufacturing` - Manufacturing projects

### Forbidden Patterns
- `*.private.*` - Private files
- `secret*`, `password*` - Sensitive files
- `*.env`, `*.key`, `*.pem` - Configuration/credential files

### Content Filters
- API keys and tokens
- Database connection strings
- Private keys and certificates

## 📁 Directory Structure

```
/home/dev/workspace/mcp-servers/mcp-servers/wikijs-mcp-server/
├── config/
│   └── wikijs_mcp_config.json     # ← Edit this file with your API key
├── src/wikijs_mcp/                # Source code
├── tests/                         # Test files
├── run_server.py                  # Server runner
├── installer.py                   # Setup script
└── claude_desktop_config.json     # Claude integration config
```

## 🚀 Common Usage Examples

### Via Claude Desktop (After Setup)

**Document Discovery:**
- "What markdown files are in my proxmox-agent project?"
- "Scan my GIT directory for documentation files"
- "Show me the structure of documentation in my mcp-servers project"

**WikiJS Operations:**
- "Upload this project's README to the wiki at /projects/wikijs-mcp"
- "Create a wiki page from this markdown file at /documentation/setup"
- "Migrate all docs from /home/dev/workspace/project-name to /wiki/projects/project-name"

**Bulk Operations:**
- "Find all README files in my projects and upload them to /documentation/readmes"
- "Migrate the entire proxmox-agent/docs directory to /infrastructure/proxmox"

### Via Command Line

**Quick tests:**
```bash
# Test connection
python -m wikijs_mcp.cli test-connection config/wikijs_mcp_config.json

# Scan for documents
python -m wikijs_mcp.cli scan config/wikijs_mcp_config.json /home/dev/workspace/proxmox-agent

# Run server directly
python run_server.py
```

## ❗ Troubleshooting

### Connection Issues
- Verify WikiJS URL is accessible: `curl https://wiki.internal.lakehouse.wtf`
- Check API key is valid and has correct permissions
- Ensure WikiJS GraphQL API is enabled

### Path Issues
- Update `allowed_paths` in config if accessing different directories
- Check file permissions on documents you want to upload

### Claude Integration Issues
- Restart Claude Desktop after adding MCP configuration
- Check Claude Desktop logs for error messages
- Verify Python path and file paths in configuration

## 🎉 You're Ready!

Once you've added your API key and tested the connection, your WikiJS MCP server will be ready to:

✅ **Find and analyze** all your markdown documentation  
✅ **Upload individual files** to your wiki with proper formatting  
✅ **Migrate entire directories** while preserving structure  
✅ **Work with Serena projects** for automated documentation  
✅ **Integrate with Claude** for natural language documentation management  

Your wiki at `https://wiki.internal.lakehouse.wtf` will become the central hub for all your project documentation!
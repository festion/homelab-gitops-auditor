# WikiJS Migration Implementation

## Current Document Mapping

Based on the scan, here's how existing documents map to the new unified structure:

### Documents to Migrate

#### MCP Server Troubleshooting
- `MCP-Server-ENOENT-Troubleshooting-Guide.md` → `/troubleshooting/mcp-servers/enoent-errors`
- `MCP-Server-Best-Practices.md` → `/guides/mcp-servers/security` 
- `MCP_Reliability_Guide.md` → `/guides/mcp-servers/performance`
- `Directory_Polling_MCP_Server_Fix_Documentation.md` → `/troubleshooting/mcp-servers/configuration`

#### Status and Reports
- `mcp-status-report.md` → `/monitoring/mcp-servers/status`
- `MCP-Server-Status-Summary.md` → `/monitoring/mcp-servers/status`
- `TEMPLATE_DEPLOYMENT_REPORT.md` → `/deployment/reports/template-deployment`

#### Home Assistant Documentation
- `Z-Wave_LED_Troubleshooting_Summary.md` → `/troubleshooting/home-assistant/zwave-problems`
- `led_troubleshooting_wiki.md` → `/home-assistant/devices/zwave-led`
- `zwave_led_troubleshooting_guide.md` → `/troubleshooting/home-assistant/device-issues`

#### Summary Documents
- `MCP-Documentation-Summary.md` → `/reference/documentation-index`
- `mcp-troubleshooting-summary.md` → `/troubleshooting/summary`

## Migration Process

### Step 1: Create Category Structure
```bash
# Create main category pages in WikiJS
/mcp-servers/overview
/home-assistant/overview  
/troubleshooting/overview
/guides/overview
/deployment/overview
/monitoring/overview
/reference/overview
/development/overview
/administration/overview
```

### Step 2: Migrate High-Priority Content
1. **MCP Server Documentation** (Immediate)
2. **Troubleshooting Guides** (Immediate) 
3. **Configuration Guides** (Week 1)
4. **Status Reports** (Week 1)

### Step 3: Consolidate Duplicate Content
- Merge multiple MCP status reports into single current status
- Combine similar troubleshooting guides
- Consolidate LED/Z-Wave documentation

### Step 4: Create Missing Content
- Overview pages for each major section
- Cross-reference links between related topics
- Quick-start guides for new users

## Implementation Script

```python
MIGRATION_MAP = {
    # MCP Troubleshooting
    "MCP-Server-ENOENT-Troubleshooting-Guide.md": "/troubleshooting/mcp-servers/enoent-errors",
    "MCP-Server-Best-Practices.md": "/guides/mcp-servers/security",
    "MCP_Reliability_Guide.md": "/guides/mcp-servers/performance",
    "Directory_Polling_MCP_Server_Fix_Documentation.md": "/troubleshooting/mcp-servers/configuration",
    
    # Status Reports
    "mcp-status-report.md": "/monitoring/mcp-servers/status", 
    "MCP-Server-Status-Summary.md": "/monitoring/mcp-servers/status-summary",
    "TEMPLATE_DEPLOYMENT_REPORT.md": "/deployment/reports/template-deployment",
    
    # Home Assistant
    "Z-Wave_LED_Troubleshooting_Summary.md": "/troubleshooting/home-assistant/zwave-problems",
    
    # Documentation
    "MCP-Documentation-Summary.md": "/reference/documentation-index",
    "mcp-troubleshooting-summary.md": "/troubleshooting/summary"
}

def migrate_documents():
    for old_path, new_path in MIGRATION_MAP.items():
        # Upload document to new location
        # Update internal links
        # Add appropriate tags
        # Create redirects from old locations
```

## Navigation Benefits

### Single Tree Structure
- **No Duplicate Navigation**: One tree serves both page structure and content organization
- **Logical Hierarchy**: Related content grouped together naturally
- **Scalable**: Easy to add new content in logical locations
- **Discoverable**: Clear path to any piece of information

### User Experience Improvements
- **Faster Navigation**: Single click to any content area
- **Context Awareness**: Related content visible in same tree branch
- **Predictable Structure**: Users know where to find information
- **Mobile Friendly**: Collapsible tree works well on all devices

## Next Steps

1. **Implement Core Structure**: Create main category pages
2. **Migrate Priority Content**: Move critical troubleshooting and guides first
3. **Update Internal Links**: Ensure all cross-references work with new structure
4. **Create Redirects**: Maintain backward compatibility
5. **User Training**: Brief team on new navigation system

This unified approach eliminates navigation redundancy while making the wiki more intuitive and maintainable.
# 🐙 MCP Servers Documentation

Model Context Protocol (MCP) servers extend Claude's capabilities by providing access to external systems and services.

## 📖 Overview

MCP servers act as bridges between Claude and various external systems, enabling:
- File system access and manipulation
- Network resource management  
- Code quality validation and linting
- Documentation system integration
- Repository and project management
- Infrastructure monitoring and control

## 🔧 Available MCP Servers

### Core Infrastructure Servers

#### 🌐 Network MCP Server
**Purpose**: Network filesystem access (SMB/CIFS, NFS)  
**Status**: ✅ Complete and Functional  
**Documentation**: [Network MCP Server Guide](/mcp-servers/network/)
- 7 MCP tools for file operations
- Comprehensive security controls
- Windows shares and Samba server support

#### 🔍 Code Linter MCP Server  
**Purpose**: Multi-language code validation and quality control  
**Status**: ✅ Complete and Functional  
**Documentation**: [Code Linter MCP Server Guide](/mcp-servers/code-linter/)
- Python, Go, JavaScript, TypeScript, YAML, JSON support
- Serena workflow integration (blocks saves on quality failures)
- Concurrent linter execution with result caching

#### 🖥️ Proxmox MCP Server
**Purpose**: Proxmox VE datacenter management  
**Status**: ✅ Complete and Functional  
**Documentation**: [Proxmox MCP Server Guide](/mcp-servers/proxmox/)
- 12 comprehensive management tools
- VM/Container lifecycle management
- Snapshot and backup operations
- Health monitoring and resource optimization

#### 📝 WikiJS MCP Server
**Purpose**: Documentation management and content organization  
**Status**: ✅ Complete and Functional  
**Documentation**: [WikiJS MCP Server Guide](/mcp-servers/wikijs/)
- Document upload and management
- Content analysis and metadata extraction
- Search and organization capabilities

#### 🐙 GitHub MCP Server
**Purpose**: Repository and project management  
**Status**: ✅ Production Ready (Forked from GitHub Official)  
**Documentation**: [GitHub MCP Server Guide](/mcp-servers/github/)
- Complete GitHub API access
- Repository, issues, and pull request management
- Project board support (planned enhancement)

## 🛠️ Development and Configuration

### Quick Start Guides
- [🚀 Getting Started with MCP Servers](/guides/mcp-servers/getting-started/)
- [⚙️ Configuration Best Practices](/guides/mcp-servers/configuration/)
- [🔧 Troubleshooting Common Issues](/troubleshooting/mcp-servers/)

### Development Resources
- [🏗️ Building Custom MCP Servers](/documentation/mcp-servers/development/)
- [📋 MCP Protocol Reference](/documentation/mcp-servers/protocol/)
- [🧪 Testing and Validation](/documentation/mcp-servers/testing/)

### Integration Guides
- [🤖 Claude Desktop Integration](/guides/mcp-servers/claude-integration/)
- [🔗 Serena Workflow Integration](/guides/mcp-servers/serena-integration/)
- [📊 Monitoring and Logging](/guides/mcp-servers/monitoring/)

## 🐛 Troubleshooting

### Common Issues
- [❌ ENOENT Errors](/troubleshooting/mcp-servers/enoent-errors/) - Server startup and file path issues
- [⏱️ Timeout Problems](/troubleshooting/mcp-servers/timeouts/) - Connection and response timeouts
- [🔐 Authentication Issues](/troubleshooting/mcp-servers/authentication/) - Token and permission problems
- [🔧 Configuration Errors](/troubleshooting/mcp-servers/configuration/) - Setup and config validation

### Diagnostic Tools
- [🔍 MCP Server Diagnostics](/guides/mcp-servers/diagnostics/) - Health checks and validation
- [📊 Performance Monitoring](/guides/mcp-servers/performance/) - Monitoring server performance
- [📝 Logging Configuration](/guides/mcp-servers/logging/) - Setting up comprehensive logging

## 📊 Current Status

### Server Status Overview
| Server | Status | Tools | Last Updated |
|--------|--------|-------|--------------|
| Network MCP | ✅ Operational | 7 | 2025-07-01 |
| Code Linter | ✅ Operational | 6 | 2025-07-01 |
| Proxmox MCP | ✅ Operational | 12 | 2025-07-01 |
| WikiJS MCP | ✅ Operational | 9 | 2025-07-02 |
| GitHub MCP | ✅ Operational | 25+ | 2025-07-03 |

### Recent Updates
- [📋 GitHub Project Board Enhancement](/reports/deployment/github-project-board-roadmap/) - New project management capabilities
- [🔧 ENOENT Error Resolution](/reports/troubleshooting/mcp-enoent-fix-summary/) - Server startup issues resolved
- [📊 Template Deployment](/reports/deployment/template-deployment-report/) - Standardized GitHub templates deployed

## 🚀 Roadmap

### GitHub MCP Server Enhancements (Q1 2025)
- **Project Board Support**: Comprehensive project management capabilities
- **Advanced Automation**: Workflow automation and card management
- **Template System**: Standardized project templates

### Infrastructure Improvements
- **Monitoring Integration**: Enhanced monitoring and alerting
- **Performance Optimization**: Improved response times and reliability
- **Security Enhancements**: Advanced authentication and authorization

### New Server Development
- **Database MCP Server**: SQL database access and management
- **Container MCP Server**: Docker and container management
- **Cloud MCP Server**: AWS/Azure cloud resource management

## 📖 Additional Resources

### External Documentation
- [MCP Protocol Specification](https://modelcontextprotocol.io/) - Official protocol documentation
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/mcp) - Integration with Claude Desktop
- [Community Examples](https://github.com/modelcontextprotocol/servers) - Open source MCP server examples

### Community and Support
- [💬 Discussion Forum](/reference/support/forums/) - Community help and discussion
- [🐛 Issue Reporting](/guides/support/reporting-issues/) - How to report problems
- [💡 Feature Requests](/guides/support/feature-requests/) - Suggesting new capabilities

---

**Last Updated**: 2025-07-03  
**Total MCP Servers**: 5 operational  
**Total MCP Tools**: 50+ available
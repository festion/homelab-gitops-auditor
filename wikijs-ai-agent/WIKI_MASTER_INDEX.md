# 🏠 Homelab Documentation Wiki

Welcome to the comprehensive documentation hub for your homelab infrastructure, MCP servers, and automation systems.

## 🚀 Quick Start

### New Here?
- [📖 Getting Started Guide](/guides/installation/getting-started) - Set up your first MCP server
- [🔧 Common Issues](/troubleshooting/common-issues) - Quick fixes for frequent problems  
- [📋 Best Practices](/guides/best-practices) - Essential configuration guidelines

### Need Help?
- [🆘 Emergency Troubleshooting](/troubleshooting/emergency) - Critical system issues
- [❓ FAQ](/reference/faq) - Frequently asked questions
- [📞 Support Contacts](/reference/support) - Who to contact for help

## 📚 Main Documentation Categories

### 🔧 Troubleshooting & Support
**Quick problem resolution and debugging guides**
- [MCP Servers](/troubleshooting/mcp-servers/) - Server issues, ENOENT errors, timeouts
- [Home Assistant](/troubleshooting/home-assistant/) - Z-Wave, LED control, integrations
- [Network & Connectivity](/troubleshooting/network/) - Connection and communication issues
- [Common Error Codes](/troubleshooting/error-codes/) - Standard error reference

### 📋 How-To Guides  
**Step-by-step instructions for common tasks**
- [Installation Guides](/guides/installation/) - Setting up new systems and servers
- [Configuration Guides](/guides/configuration/) - System and service configuration
- [Best Practices](/guides/best-practices/) - Recommended approaches and standards
- [Workflow Automation](/guides/workflows/) - Streamlining common processes

### 📚 Technical Documentation
**In-depth technical references and architecture**
- [System Architecture](/documentation/architecture/) - Overall system design and relationships
- [API References](/documentation/api-reference/) - Detailed API documentation
- [Configuration References](/documentation/configuration/) - Complete configuration options
- [Development Guides](/documentation/development/) - Contributing and extending systems

### 📊 Reports & Status
**System status, deployment reports, and audits**
- [Deployment Reports](/reports/deployment/) - Recent deployments and changes
- [System Status](/reports/status/) - Current system health and performance  
- [Audit Reports](/reports/audits/) - Security and compliance audits
- [Performance Metrics](/reports/performance/) - System performance analysis

## 🏗️ Technology-Specific Documentation

### 🐙 MCP Servers
**Model Context Protocol server documentation**
- [📖 Overview](/mcp-servers/) - What are MCP servers and how they work
- [🔧 Server Collection](/mcp-servers/collection/) - Available MCP servers
- [⚙️ Configuration](/mcp-servers/configuration/) - Setup and configuration guides
- [🛠️ Development](/mcp-servers/development/) - Building and extending MCP servers
- [🐛 Troubleshooting](/mcp-servers/troubleshooting/) - Common issues and solutions

**Individual Server Documentation:**
- [🌐 Network MCP Server](/mcp-servers/network/) - Network filesystem access (SMB/NFS)
- [🔍 Code Linter MCP Server](/mcp-servers/code-linter/) - Code quality and validation
- [🖥️ Proxmox MCP Server](/mcp-servers/proxmox/) - Proxmox VE management
- [📝 WikiJS MCP Server](/mcp-servers/wikijs/) - Documentation management
- [🐙 GitHub MCP Server](/mcp-servers/github/) - Repository and project management

### 🏠 Home Assistant
**Smart home automation and control**
- [📖 Overview](/home-assistant/) - Home Assistant setup and overview
- [🔗 Integrations](/home-assistant/integrations/) - Connected devices and services
- [🤖 Automations](/home-assistant/automations/) - Automated workflows and scenes
- [📱 Devices](/home-assistant/devices/) - Device-specific configuration and troubleshooting
- [🐛 Troubleshooting](/home-assistant/troubleshooting/) - Common issues and solutions

**Device Categories:**
- [💡 Z-Wave LED Control](/home-assistant/devices/zwave-led/) - LED strip control and automation
- [🔌 Smart Switches](/home-assistant/devices/switches/) - Switch configuration and control
- [🌡️ Sensors](/home-assistant/devices/sensors/) - Temperature, motion, and other sensors
- [📷 Cameras](/home-assistant/devices/cameras/) - Security and monitoring cameras

### 🔗 Integrations & Services
**Third-party integrations and external services**
- [🐙 GitHub Integration](/integrations/github/) - Repository management and automation
- [📝 WikiJS Integration](/integrations/wikijs/) - Documentation system integration
- [🖥️ Proxmox Integration](/integrations/proxmox/) - Virtualization platform management
- [🌐 Network Services](/integrations/network/) - Network filesystem and connectivity

### 🚀 Deployment & Automation
**Deployment processes and automation systems**
- [📋 Template Systems](/deployment/templates/) - Standardized deployment templates
- [🤖 Automation Scripts](/deployment/automation/) - Automated deployment and management
- [🌍 Environment Management](/deployment/environments/) - Development, staging, production
- [↩️ Rollback Procedures](/deployment/rollback/) - Emergency rollback and recovery

## 🔍 Finding Information

### Search by Topic
- [🔍 Search All Content](/search) - Full-text search across all documentation
- [🏷️ Browse by Tags](/tags) - Content organized by topic tags
- [📅 Recent Updates](/recent) - Latest documentation changes
- [⭐ Popular Content](/popular) - Most accessed documentation

### Quick Reference
- [📖 Glossary](/reference/glossary/) - Technical terms and definitions
- [⌨️ Command Reference](/reference/commands/) - Common commands and shortcuts
- [🔧 Configuration Templates](/reference/configurations/) - Standard configuration examples
- [🔗 External Links](/reference/external/) - Useful external resources

### By Technology
| Technology | Documentation | Troubleshooting | Configuration |
|------------|---------------|-----------------|---------------|
| **MCP Servers** | [📖 Docs](/mcp-servers/) | [🔧 Issues](/troubleshooting/mcp-servers/) | [⚙️ Config](/mcp-servers/configuration/) |
| **Home Assistant** | [📖 Docs](/home-assistant/) | [🔧 Issues](/troubleshooting/home-assistant/) | [⚙️ Config](/home-assistant/configuration/) |
| **GitHub** | [📖 Docs](/integrations/github/) | [🔧 Issues](/troubleshooting/github/) | [⚙️ Config](/integrations/github/configuration/) |
| **WikiJS** | [📖 Docs](/integrations/wikijs/) | [🔧 Issues](/troubleshooting/wikijs/) | [⚙️ Config](/integrations/wikijs/configuration/) |
| **Proxmox** | [📖 Docs](/integrations/proxmox/) | [🔧 Issues](/troubleshooting/proxmox/) | [⚙️ Config](/integrations/proxmox/configuration/) |

## 📊 Recent Activity

### Latest Updates
- [🔄 Template Deployment Report](/reports/deployment/template-deployment-report) - GitHub project management templates deployed
- [🐛 MCP Server ENOENT Fix](/troubleshooting/mcp-servers/enoent-troubleshooting) - Resolved server startup issues
- [💡 Z-Wave LED Troubleshooting](/troubleshooting/home-assistant/zwave-led-control) - LED control automation fixes
- [📋 Project Board Guide](/guides/workflows/project-board-deployment) - Manual project board creation

### System Status
- **MCP Servers**: ✅ All 8 servers operational
- **Home Assistant**: ✅ Running, 23 devices connected
- **GitHub Integration**: ✅ Template deployment complete
- **WikiJS**: ✅ Online, reorganization in progress

## 🛠️ Contributing

### For Developers
- [🔧 Development Setup](/documentation/development/setup/) - Setting up development environment
- [📝 Documentation Standards](/documentation/development/standards/) - Writing and formatting guidelines
- [🔄 Contribution Workflow](/documentation/development/workflow/) - How to contribute changes
- [🧪 Testing Guidelines](/documentation/development/testing/) - Testing requirements and procedures

### For Users
- [📝 Reporting Issues](/guides/support/reporting-issues/) - How to report problems
- [💡 Suggesting Improvements](/guides/support/suggestions/) - How to suggest enhancements
- [📖 Documentation Feedback](/guides/support/documentation/) - Improving documentation

## 📞 Support & Community

### Getting Help
- [📧 Contact Information](/reference/support/contacts/) - Who to contact for specific issues
- [🆘 Emergency Procedures](/reference/support/emergency/) - Critical issue escalation
- [❓ FAQ](/reference/support/faq/) - Answers to common questions

### Community Resources
- [💬 Discussion Forums](/reference/support/forums/) - Community discussion and help
- [📚 External Resources](/reference/support/external/) - Useful external documentation
- [🔗 Related Projects](/reference/support/related/) - Connected projects and tools

---

**Last Updated**: 2025-07-03  
**Wiki Version**: 2.0 (Reorganized)  
**Total Documents**: 50+ (and growing)

> 💡 **Tip**: Use the search function (Ctrl+K) to quickly find specific topics or use the category indexes to browse systematically.
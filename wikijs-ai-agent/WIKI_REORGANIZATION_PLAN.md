# WikiJS Reorganization and Indexing Plan

## Current State Analysis

### Issues Identified
1. **Scattered Documentation**: MCP-related docs spread across multiple directories
2. **Inconsistent Naming**: Multiple similar documents with different naming conventions
3. **No Clear Hierarchy**: No organized taxonomy or categorization system
4. **Duplicate Content**: Overlapping troubleshooting guides and status reports
5. **No Central Index**: Difficult to discover and navigate content

### Documents Found (Sample)
- Z-Wave LED Troubleshooting Summary
- MCP Server ENOENT Troubleshooting Guide  
- MCP Server Best Practices
- MCP Reliability Guide
- MCP Status Report
- Template Deployment Report
- And many more scattered across workspace

## Proposed Reorganization Structure

### 1. Top-Level Categories
```
/
├── 📚 documentation/
├── 🔧 troubleshooting/
├── 📋 guides/
├── 📊 reports/
├── 🚀 deployment/
├── 🏠 home-assistant/
├── 🐙 mcp-servers/
├── 🔗 integrations/
└── 📖 reference/
```

### 2. Detailed Taxonomy

#### `/documentation/`
- **Purpose**: Core project documentation and architecture
- **Structure**:
  ```
  /documentation/
  ├── architecture/
  ├── api-reference/
  ├── configuration/
  └── development/
  ```

#### `/troubleshooting/`
- **Purpose**: Problem resolution guides and debugging
- **Structure**:
  ```
  /troubleshooting/
  ├── mcp-servers/
  ├── home-assistant/
  ├── network/
  ├── common-issues/
  └── error-codes/
  ```

#### `/guides/`
- **Purpose**: Step-by-step how-to guides
- **Structure**:
  ```
  /guides/
  ├── installation/
  ├── configuration/
  ├── best-practices/
  └── workflows/
  ```

#### `/reports/`
- **Purpose**: Status reports, deployment summaries, audits
- **Structure**:
  ```
  /reports/
  ├── deployment/
  ├── status/
  ├── audits/
  └── performance/
  ```

#### `/deployment/`
- **Purpose**: Deployment guides, scripts, and automation
- **Structure**:
  ```
  /deployment/
  ├── templates/
  ├── automation/
  ├── environments/
  └── rollback/
  ```

#### `/home-assistant/`
- **Purpose**: Home Assistant specific documentation
- **Structure**:
  ```
  /home-assistant/
  ├── integrations/
  ├── automations/
  ├── devices/
  └── troubleshooting/
  ```

#### `/mcp-servers/`
- **Purpose**: MCP server specific documentation
- **Structure**:
  ```
  /mcp-servers/
  ├── development/
  ├── configuration/
  ├── troubleshooting/
  └── guides/
  ```

#### `/integrations/`
- **Purpose**: Third-party integrations and connections
- **Structure**:
  ```
  /integrations/
  ├── github/
  ├── wikijs/
  ├── proxmox/
  └── network/
  ```

#### `/reference/`
- **Purpose**: Quick reference materials and indexes
- **Structure**:
  ```
  /reference/
  ├── commands/
  ├── apis/
  ├── configurations/
  └── glossary/
  ```

## Migration Strategy

### Phase 1: Index Creation (Immediate)
1. Create master index page with navigation
2. Create category index pages
3. Establish tagging system
4. Create search optimization

### Phase 2: Content Consolidation (Week 1)
1. **MCP Documentation**:
   - Consolidate all MCP troubleshooting guides
   - Merge duplicate content
   - Standardize naming conventions

2. **Home Assistant Content**:
   - Organize Z-Wave and LED documentation
   - Create integration guides
   - Consolidate device troubleshooting

3. **Deployment Documentation**:
   - Organize template deployment reports
   - Create deployment guides
   - Document automation processes

### Phase 3: Content Enhancement (Week 2)
1. **Cross-References**: Add internal linking between related documents
2. **Search Optimization**: Implement consistent tagging and metadata
3. **Templates**: Create standard templates for new documents
4. **Quality Assurance**: Review and update content for accuracy

### Phase 4: Maintenance System (Ongoing)
1. **Automated Organization**: Scripts to maintain organization
2. **Content Lifecycle**: Regular review and archiving processes
3. **Version Control**: Track document changes and updates
4. **Access Control**: Implement appropriate permissions

## Tagging System

### Standard Tags
- **Type**: `guide`, `troubleshooting`, `reference`, `report`, `api-doc`
- **Technology**: `mcp`, `home-assistant`, `github`, `wikijs`, `proxmox`
- **Complexity**: `beginner`, `intermediate`, `advanced`
- **Status**: `draft`, `review`, `published`, `archived`
- **Priority**: `critical`, `high`, `medium`, `low`

### Example Tagging
```markdown
---
title: "MCP Server ENOENT Troubleshooting Guide"
tags: ["troubleshooting", "mcp", "intermediate", "published", "high"]
category: "troubleshooting/mcp-servers"
last_updated: "2025-07-03"
version: "1.2"
---
```

## Navigation System

### Master Index Structure
```markdown
# 🏠 Wiki Home

## 🚀 Quick Start
- [Getting Started Guide](/guides/installation/getting-started)
- [Common Issues](/troubleshooting/common-issues)
- [Best Practices](/guides/best-practices)

## 📚 Main Categories
- [📚 Documentation](/documentation/) - Core project docs
- [🔧 Troubleshooting](/troubleshooting/) - Problem resolution
- [📋 Guides](/guides/) - Step-by-step instructions
- [📊 Reports](/reports/) - Status and deployment reports

## 🔍 Find What You Need
- [🔍 Search by Technology](#technology-index)
- [📊 Recent Updates](#recent-updates)
- [⭐ Most Popular](#popular-content)
```

### Technology-Specific Indexes
Each major technology gets its own index page:
- `/mcp-servers/index` - All MCP server documentation
- `/home-assistant/index` - All Home Assistant content
- `/integrations/index` - All integration guides

## Implementation Tools

### Automated Migration Script
```python
# WikiJS Migration Tool
class WikiReorganizer:
    def __init__(self):
        self.content_map = {}
        self.migration_plan = {}
    
    def analyze_content(self):
        # Scan existing content
        # Identify categories and tags
        # Detect duplicates
    
    def create_migration_plan(self):
        # Map old paths to new paths
        # Identify content consolidation opportunities
        # Generate redirect mappings
    
    def execute_migration(self):
        # Create new structure
        # Move content to new locations
        # Update internal links
        # Create redirects
```

### Content Quality Tools
- **Link Checker**: Validate all internal and external links
- **Duplicate Detector**: Identify and merge similar content
- **Metadata Validator**: Ensure consistent tagging and categorization
- **Search Optimizer**: Improve content discoverability

## Success Metrics

### Immediate Goals (1 Week)
- [ ] Master index page created
- [ ] All MCP content organized under `/mcp-servers/`
- [ ] Troubleshooting guides consolidated
- [ ] Basic tagging system implemented

### Medium-term Goals (1 Month)
- [ ] 100% content categorized and tagged
- [ ] All duplicate content merged
- [ ] Cross-references implemented
- [ ] Search functionality optimized

### Long-term Goals (3 Months)
- [ ] Automated content organization
- [ ] Regular content auditing
- [ ] User feedback integration
- [ ] Performance metrics tracking

## Next Steps

1. **Create Master Index** - Start with main navigation page
2. **Category Setup** - Create all category index pages
3. **Content Audit** - Complete inventory of all existing content
4. **Migration Execution** - Begin systematic content reorganization
5. **Quality Assurance** - Review and optimize migrated content

This reorganization will transform your organically grown wiki into a well-structured, navigable knowledge base that scales effectively with your growing documentation needs.
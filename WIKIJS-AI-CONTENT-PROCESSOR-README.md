# WikiJS AI-Enhanced Content Processing Pipeline

An advanced content processing pipeline that enhances document quality using AI tools and validates content before WikiJS upload, integrating with MCP (Model Context Protocol) servers for scalable automation.

## Overview

This system provides a comprehensive solution for processing markdown documents with AI-powered enhancements and thorough validation. It integrates with multiple MCP servers to deliver:

- **AI Content Enhancement**: Grammar, clarity, structure optimization via Serena MCP
- **Content Validation**: Markdown linting, link checking, style enforcement via Code-Linter MCP  
- **Quality Scoring**: Automated quality assessment with detailed metrics
- **WikiJS Integration**: Seamless upload and publishing workflow
- **Batch Processing**: Efficient handling of multiple documents

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Input Files   │────│  Content         │────│  Enhanced       │
│   (.md docs)    │    │  Processor       │    │  Content        │
└─────────────────┘    │                  │    └─────────────────┘
                       │  ┌─────────────┐ │           │
┌─────────────────┐    │  │   Serena    │ │           │
│  Serena MCP     │────┼──│   AI        │ │           ▼
│  Server         │    │  │ Enhancement │ │    ┌─────────────────┐
└─────────────────┘    │  └─────────────┘ │    │  Validation &   │
                       │                  │    │  Quality Score  │
┌─────────────────┐    │  ┌─────────────┐ │    └─────────────────┘
│ Code-Linter     │────┼──│  Content    │ │           │
│ MCP Server      │    │  │ Validation  │ │           ▼
└─────────────────┘    │  └─────────────┘ │    ┌─────────────────┐
                       │                  │    │   WikiJS        │
┌─────────────────┐    │  ┌─────────────┐ │    │   Upload        │
│  WikiJS MCP     │────┼──│   WikiJS    │ │    │  (Optional)     │
│  Server         │    │  │Integration  │ │    └─────────────────┘
└─────────────────┘    └──────────────────┘
```

## Features

### 🤖 AI-Powered Content Enhancement
- **Grammar & Clarity**: Automated grammar corrections and clarity improvements
- **Structure Optimization**: Document organization and heading hierarchy optimization
- **Cross-Referencing**: Intelligent internal link generation and cross-references
- **Summary Generation**: Automatic summaries for documents >1000 words
- **Table of Contents**: Auto-generated TOC for long documents

### ✅ Comprehensive Validation
- **Markdown Linting**: Syntax validation and formatting consistency
- **Link Verification**: Detection and reporting of broken links
- **Image Validation**: Asset existence and alt-text checking
- **Spell Checking**: Content spell checking with suggestions
- **Style Guide Enforcement**: Consistent formatting and structure validation

### 📊 Quality Assurance System
- **Multi-Metric Scoring**: Readability, structure, links, depth, technical accuracy
- **Quality Thresholds**: Configurable minimum quality requirements
- **Enhancement Tracking**: Detailed reporting of AI improvements made
- **Performance Metrics**: Processing time, success rates, error tracking

### 🔧 Advanced Configuration
- **Processing Options**: Parallel jobs, retry logic, timeout management
- **Quality Thresholds**: Customizable scoring and requirements
- **MCP Integration**: Flexible server configuration and fallbacks
- **Output Control**: Backup creation, report generation, metric tracking

## Installation

### Prerequisites
- Node.js 16+
- Access to MCP servers (Serena, Code-Linter, WikiJS)
- MCP wrapper scripts configured in `/home/dev/workspace/`

### Setup
```bash
# Install dependencies
npm install

# Make CLI executable
chmod +x wikijs-content-processor-cli.js

# Test system
npm run test-processor
```

### MCP Server Configuration
Ensure the following MCP servers are properly configured:

1. **Serena Enhanced MCP Server**
   - Path: `/home/dev/workspace/serena-enhanced-wrapper.sh`
   - Purpose: AI content enhancement

2. **Code-Linter MCP Server** 
   - Path: `/home/dev/workspace/code-linter-wrapper.sh`
   - Purpose: Content validation and linting

3. **WikiJS MCP Server**
   - Path: `/home/dev/workspace/wikijs-mcp-wrapper.sh`
   - Purpose: WikiJS integration and upload

## Usage

### Command Line Interface

```bash
# Process a single file
node wikijs-content-processor-cli.js process document.md

# Process with output file
node wikijs-content-processor-cli.js process input.md -o output.md

# Process and upload to WikiJS
node wikijs-content-processor-cli.js process document.md -u -w /docs/document

# Batch process multiple files
node wikijs-content-processor-cli.js batch "docs/*.md" -o ./processed/

# Test system and connections
node wikijs-content-processor-cli.js test

# View processing metrics
node wikijs-content-processor-cli.js metrics

# Show configuration
node wikijs-content-processor-cli.js config
```

### NPM Scripts
```bash
# Process files
npm run process document.md

# Batch processing
npm run batch "*.md"

# System test
npm run test-processor

# View metrics
npm run metrics
```

### Programmatic Usage
```javascript
const { WikiJSContentProcessor } = require('./wikijs-ai-content-processor.js');

const processor = new WikiJSContentProcessor({
  enhancement: { enabled: true },
  validation: { enabled: true },
  qualityThresholds: { minScore: 8.0 }
});

await processor.initialize();

const result = await processor.processDocument('document.md');
if (result.success) {
  console.log(`Quality Score: ${result.qualityScore.overall}/10`);
  console.log(`Processing Time: ${result.report.processingTime}ms`);
}

await processor.cleanup();
```

## Configuration

The system uses `content-processor-config.json` for configuration:

```json
{
  "enhancement": {
    "enabled": true,
    "serenaPrompts": {
      "grammar": "Improve grammar and clarity while preserving accuracy",
      "structure": "Optimize document structure and organization",
      "linking": "Add relevant cross-references and internal links"
    }
  },
  "validation": {
    "enabled": true,
    "linting": true,
    "linkChecking": true,
    "imageValidation": true,
    "styleGuideEnforcement": true
  },
  "qualityThresholds": {
    "minScore": 7.0,
    "requireTOC": 1000,
    "maxProcessingTime": 30000
  }
}
```

### Key Configuration Options

- **enhancement.enabled**: Enable/disable AI enhancement
- **validation.enabled**: Enable/disable content validation  
- **qualityThresholds.minScore**: Minimum quality score (0-10)
- **processing.parallelJobs**: Number of concurrent processing jobs
- **output.preserveOriginal**: Keep original files as backups

## Processing Pipeline

The content processing follows these stages:

1. **Content Analysis**: Document classification, word count, complexity analysis
2. **AI Enhancement**: Grammar, structure, and linking improvements via Serena MCP
3. **Content Validation**: Markdown linting and validation via Code-Linter MCP
4. **Link Processing**: Link resolution and cross-reference validation
5. **Asset Processing**: Image and media asset validation
6. **Quality Scoring**: Multi-metric quality assessment
7. **Report Generation**: Comprehensive processing and quality reports
8. **WikiJS Upload**: Optional upload to WikiJS with metadata

## Quality Scoring

The system calculates quality scores based on:

- **Readability** (25%): Sentence structure and complexity
- **Structure** (25%): Heading hierarchy and organization
- **Link Quality** (15%): Link validity and cross-references  
- **Content Depth** (20%): Document comprehensiveness
- **Technical Accuracy** (15%): Technical content quality

Scores range from 0-10, with configurable minimum thresholds.

## Error Handling & Recovery

- **Graceful Degradation**: Continues processing when MCP servers are unavailable
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Fallback Processing**: Basic validation when advanced features fail
- **Comprehensive Logging**: Detailed error tracking and debugging information

## Performance Optimization

- **Parallel Processing**: Concurrent document processing for batch operations
- **Connection Pooling**: Efficient MCP server connection management
- **Caching**: Temporary file caching for improved performance
- **Resource Cleanup**: Automatic cleanup of temporary resources

## Monitoring & Metrics

The system tracks:
- Total documents processed
- Success/failure rates
- Average processing time
- Quality improvement metrics
- MCP server connection status

## Integration Points

### MCP Server Integration
- **Serena MCP**: Advanced AI content enhancement
- **Code-Linter MCP**: Comprehensive validation and linting
- **WikiJS MCP**: Direct WikiJS integration for uploads

### WikiJS Integration
- Automated page creation and updates
- Metadata preservation and enhancement
- Tag management and categorization
- Publishing workflow integration

## Troubleshooting

### Common Issues

1. **MCP Server Connection Failures**
   - Verify wrapper scripts are executable
   - Check MCP server logs
   - Test individual server connections

2. **Processing Timeouts**
   - Increase timeout values in configuration
   - Reduce parallel job count
   - Check system resource availability

3. **Quality Score Issues**
   - Review quality threshold settings
   - Examine detailed quality breakdown
   - Check content complexity metrics

### Debug Mode
```bash
node wikijs-content-processor-cli.js process document.md -v
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please use the GitHub issues tracker.

---

**Built with ❤️ using MCP (Model Context Protocol) integration**
# WikiJS MCP Server with AI Enhancement

An intelligent document processing system that combines WikiJS integration with advanced AI capabilities through Serena MCP server integration.

## 🤖 AI Features

### Content Enhancement Pipeline
- **Grammar & Style Correction**: Automatic grammar fixes and style improvements
- **Technical Writing Optimization**: Enhanced clarity for technical documentation
- **Readability Analysis**: Flesch-Kincaid and custom readability metrics
- **Structure Optimization**: Improved document organization and flow

### Automatic Table of Contents Generation
- **Smart TOC Creation**: Generate TOC for documents with 3+ headings
- **Hierarchical Structure**: Proper heading level detection and organization
- **Anchor Link Generation**: Automatic internal navigation links
- **Placement Optimization**: Intelligent TOC positioning within documents

### Intelligent Document Categorization
- **Multi-Category Classification**: Primary and secondary categories
- **Auto-Tagging**: AI-generated relevant tags (5-10 per document)
- **Audience Detection**: Target audience identification (developers/users/administrators)
- **Complexity Assessment**: Beginner/intermediate/advanced level classification
- **Related Content Suggestions**: Discover related document topics

### Cross-Document Link Detection
- **Internal Link Suggestions**: Find concepts that could link to other documents
- **Broken Link Detection**: Identify and suggest fixes for broken internal links
- **Reference Resolution**: Resolve cross-references automatically
- **Link Context Analysis**: Generate meaningful link text and descriptions

### Quality Assurance System
- **Comprehensive Scoring**: Grammar, readability, technical accuracy, structure
- **Issue Detection**: Identify specific problems with line numbers
- **Improvement Suggestions**: Actionable recommendations for enhancement
- **Template Compliance**: Check adherence to documentation standards

### Navigation Structure Generation
- **Hierarchical Navigation**: Category-based document organization
- **Topic-Based Structure**: Tag-driven navigation organization
- **Audience-Based Navigation**: User-role specific document grouping
- **Breadcrumb Generation**: Contextual navigation breadcrumbs
- **Sitemap Creation**: Automatic site map generation

## 🛠️ Available Tools

### AI Content Processing Tools

#### `enhance_document_content`
Enhance document content using AI for improved clarity, grammar, and structure.

**Parameters:**
- `file_path`: Path to document to enhance
- `content`: Document content (optional if file_path provided)
- `enhancement_type`: Type of enhancement (general, technical, user_guide, api_docs)
- `target_audience`: Target audience (developers, users, administrators, general)
- `preserve_technical_details`: Whether to preserve all technical details

#### `generate_document_toc`
Generate automatic table of contents for a document.

**Parameters:**
- `file_path`: Path to the document
- `content`: Document content (optional if file_path provided)
- `min_headings`: Minimum number of headings required (default: 3)
- `max_depth`: Maximum heading depth to include (default: 4)
- `insert_toc`: Whether to insert TOC into the document

#### `categorize_document`
Automatically categorize and tag a document using AI.

**Parameters:**
- `file_path`: Path to document to categorize
- `content`: Document content (optional if file_path provided)
- `suggest_wiki_path`: Whether to suggest optimal WikiJS path

#### `detect_cross_document_links`
Detect and suggest cross-document links and references.

**Parameters:**
- `file_path`: Path to document to analyze
- `content`: Document content (optional if file_path provided)
- `search_directory`: Directory to search for related documents
- `create_links`: Whether to automatically insert suggested links

#### `assess_document_quality`
Perform comprehensive quality assessment of a document.

**Parameters:**
- `file_path`: Path to document to assess
- `content`: Document content (optional if file_path provided)
- `template_type`: Document template type (api_documentation, user_guide, technical_reference)
- `detailed_report`: Whether to include detailed issues and suggestions

#### `improve_document_readability`
Improve document readability while preserving technical accuracy.

**Parameters:**
- `file_path`: Path to document to improve
- `content`: Document content (optional if file_path provided)
- `target_audience`: Target audience for readability optimization
- `complexity_level`: Target complexity level (beginner, intermediate, advanced)

#### `batch_process_documents`
Process multiple documents with AI enhancements in batch.

**Parameters:**
- `source_directory`: Directory containing documents to process
- `file_patterns`: File patterns to include (default: ["*.md"])
- `processing_options`: Processing configuration object
- `output_directory`: Directory to save processed documents
- `dry_run`: Preview processing without making changes

#### `create_navigation_structure`
Generate intelligent navigation structure for document collections.

**Parameters:**
- `source_directory`: Directory containing documents to organize
- `structure_type`: Type of navigation (hierarchical, topic_based, audience_based)
- `include_breadcrumbs`: Whether to generate breadcrumb navigation
- `generate_sitemap`: Whether to generate a site map

## 📋 Configuration

### AI Processing Configuration

Create or modify `wikijs_ai_config.json`:

```json
{
  "ai_processing": {
    "serena_endpoint": "mcp://serena-enhanced",
    "enhancement_settings": {
      "preserve_technical_details": true,
      "target_audience": "developers",
      "enhancement_type": "technical",
      "confidence_threshold": 0.7
    },
    "toc_settings": {
      "min_headings": 3,
      "max_depth": 4,
      "auto_insert_toc": false
    },
    "categorization_settings": {
      "max_tags": 10,
      "confidence_threshold": 0.6,
      "enable_auto_tagging": true
    },
    "quality_settings": {
      "min_quality_score": 0.7,
      "enable_template_compliance": true
    },
    "batch_processing": {
      "max_concurrent": 5,
      "rate_limit_delay": 1.0,
      "enable_caching": true
    }
  }
}
```

### Template Compliance Templates

Supported template types:

#### API Documentation Template
- **Required Sections**: Overview, Parameters, Examples, Response
- **Optional Sections**: Authentication, Rate Limits, SDKs
- **Validation Rules**: Code examples present, parameter types defined

#### User Guide Template
- **Required Sections**: Introduction, Prerequisites, Steps, Troubleshooting
- **Optional Sections**: Advanced Usage, FAQ
- **Validation Rules**: Step numbering, screenshot references

#### Technical Reference Template
- **Required Sections**: Overview, Specifications, Implementation
- **Optional Sections**: Examples, Best Practices
- **Validation Rules**: Technical accuracy, complete specifications

## 🚀 Usage Examples

### Basic Content Enhancement

```bash
# Enhance a single document
enhance_document_content --file_path "./docs/api-guide.md" --enhancement_type "technical" --target_audience "developers"

# Generate table of contents
generate_document_toc --file_path "./docs/user-manual.md" --min_headings 3 --insert_toc true

# Categorize document
categorize_document --file_path "./docs/troubleshooting.md" --suggest_wiki_path true
```

### Batch Processing

```bash
# Process entire documentation directory
batch_process_documents \
  --source_directory "./docs" \
  --processing_options '{
    "enhance_content": true,
    "generate_toc": true,
    "categorize": true,
    "assess_quality": true,
    "enhancement_type": "technical",
    "target_audience": "developers"
  }' \
  --dry_run false
```

### Quality Assessment

```bash
# Assess document quality with template compliance
assess_document_quality \
  --file_path "./docs/api-reference.md" \
  --template_type "api_documentation" \
  --detailed_report true
```

### Navigation Structure

```bash
# Generate hierarchical navigation
create_navigation_structure \
  --source_directory "./docs" \
  --structure_type "hierarchical" \
  --include_breadcrumbs true \
  --generate_sitemap true
```

## 🏗️ Architecture

### AI Processing Pipeline

1. **Content Analysis**: Analyze document structure and content
2. **Grammar Enhancement**: Fix grammar and style issues
3. **Structure Optimization**: Improve document organization
4. **Link Detection**: Find and create internal links
5. **TOC Generation**: Generate table of contents
6. **Categorization**: Classify and tag document
7. **Quality Scoring**: Assess content quality
8. **Template Compliance**: Check template adherence
9. **Final Validation**: Final quality check

### Integration Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WikiJS MCP   │────│  AI Processor    │────│ Serena MCP      │
│   Server        │    │  Engine          │    │ Server          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │                        │                       │
    ┌────▼────┐              ┌────▼────┐             ┌────▼────┐
    │ WikiJS  │              │ Document│             │ AI      │
    │ Client  │              │ Scanner │             │ Prompts │
    └─────────┘              └─────────┘             └─────────┘
```

## 📊 Performance & Metrics

### Quality Scoring Metrics
- **Grammar Score**: 0.0-1.0 (grammar correctness)
- **Readability Score**: 0.0-1.0 (Flesch-Kincaid based)
- **Technical Accuracy**: 0.0-1.0 (technical content quality)
- **Structure Score**: 0.0-1.0 (document organization)
- **Template Compliance**: 0.0-1.0 (adherence to templates)

### Performance Considerations
- **Batch Processing**: Up to 5 concurrent documents
- **Rate Limiting**: 1.0 second delay between AI calls
- **Caching**: 24-hour cache for AI processing results
- **File Size Limits**: 10MB maximum per document

## 🔧 Advanced Configuration

### Serena MCP Integration

Configure Serena endpoint in your config:

```json
{
  "ai_processing": {
    "serena_endpoint": "mcp://serena-enhanced",
    "processing_pipeline": [
      "content_analysis",
      "grammar_enhancement", 
      "structure_optimization",
      "link_detection",
      "toc_generation",
      "categorization",
      "quality_scoring",
      "template_compliance",
      "final_validation"
    ]
  }
}
```

### Custom Prompts

The AI processor uses specialized prompts for different tasks:
- Content enhancement prompts
- TOC generation prompts
- Categorization prompts
- Link detection prompts
- Quality assessment prompts

### Error Handling & Recovery

- **Graceful Degradation**: Continue processing if AI service unavailable
- **Error Recovery**: Retry failed operations with exponential backoff
- **Partial Results**: Return partial results if some processing fails
- **Rollback Capability**: Restore original content if processing fails

## 🔒 Security Considerations

### File Access Security
- **Path Validation**: Strict path validation and sandboxing
- **File Size Limits**: Maximum 10MB per file
- **Extension Filtering**: Only allow specified file extensions
- **Content Validation**: Scan content for security issues

### AI Processing Security
- **Content Sanitization**: Remove sensitive information before AI processing
- **Token Management**: Secure handling of API tokens
- **Rate Limiting**: Prevent abuse of AI services
- **Audit Logging**: Track all AI processing operations

## 📈 Monitoring & Troubleshooting

### Health Checks
- AI processor connectivity
- Serena MCP server status
- WikiJS connection health
- Processing queue status

### Logging
- Processing success/failure rates
- Quality score distributions
- Performance metrics
- Error patterns

### Common Issues
1. **Serena MCP Connection Failed**: Check endpoint configuration
2. **Low Quality Scores**: Review content and adjust settings
3. **Slow Processing**: Reduce batch size or increase rate limiting
4. **Template Compliance Failures**: Review template requirements

## 🎯 Best Practices

### Document Preparation
1. Use consistent heading structure
2. Include proper frontmatter when applicable
3. Ensure adequate content length for AI processing
4. Use descriptive titles and section headers

### Processing Optimization
1. Start with single documents before batch processing
2. Use dry-run mode to preview changes
3. Configure appropriate confidence thresholds
4. Monitor quality scores and adjust settings

### Quality Management
1. Review AI suggestions before applying
2. Maintain original backups
3. Use template compliance for consistency
4. Regularly assess processing quality

## 🔄 Integration Workflow

### Typical Workflow
1. **Document Discovery**: Scan for eligible documents
2. **AI Processing**: Apply enhancement pipeline
3. **Quality Review**: Assess processing results
4. **WikiJS Upload**: Publish enhanced documents
5. **Navigation Update**: Update site navigation structure

### Automation Options
- **Scheduled Processing**: Set up cron jobs for regular processing
- **Git Hook Integration**: Process documents on commit/push
- **Watch Mode**: Monitor directories for changes
- **CI/CD Integration**: Include in deployment pipelines

## 📚 Additional Resources

- **Configuration Reference**: See `wikijs_ai_config.json`
- **Usage Examples**: Run `python ai_processing_examples.py`
- **Template Examples**: Check template compliance templates
- **Troubleshooting Guide**: See error handling documentation

---

**Note**: This AI-enhanced WikiJS MCP server requires a working Serena MCP server for AI processing capabilities. Ensure proper configuration and connectivity before use.
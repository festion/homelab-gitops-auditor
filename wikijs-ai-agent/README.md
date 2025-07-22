# WikiJS MCP Server

An MCP (Model Context Protocol) server for managing documentation with WikiJS. This server provides tools for finding Markdown documents and automatically adding them to a WikiJS instance, enabling seamless documentation management and migration.

## Recent Updates

### Version 1.0.1 - Critical Fixes (2025-07-01)
- **🔧 FIXED:** GraphQL schema compatibility with WikiJS 2.5.307
- **🔧 FIXED:** Type comparison errors in configuration display
- **🔧 FIXED:** Search functionality now works reliably
- **📚 NEW:** Added comprehensive troubleshooting guide

**⚠️ Breaking Change Note:** If you're using WikiJS 2.5.307, please update to v1.0.1 to resolve search functionality issues.

## Features

### 🔍 Document Discovery
- **Find Markdown Files**: Recursively search directories for `.md` documents
- **Pattern Matching**: Support for glob patterns and filters
- **Metadata Extraction**: Extract frontmatter and document metadata
- **Content Analysis**: Analyze document structure and links

### 📝 WikiJS Integration  
- **Page Creation**: Create new pages in WikiJS from Markdown files
- **Page Updates**: Update existing pages with new content
- **Bulk Operations**: Process multiple documents efficiently
- **Conflict Resolution**: Handle existing pages gracefully

### 🛡️ Security & Validation
- **Path Validation**: Secure file path handling with configurable restrictions
- **Content Filtering**: Validate document content before upload
- **Authentication**: Secure WikiJS API authentication
- **Permission Checks**: Verify user permissions for operations

### 🔧 Integration Features
- **Serena Project Integration**: Designed for use with Serena projects for automatic documentation
- **Configuration Management**: Flexible configuration with validation
- **Logging & Monitoring**: Comprehensive logging for troubleshooting
- **Error Handling**: Robust error handling with meaningful messages

## Installation

### Prerequisites
- Python 3.8 or higher
- Access to a WikiJS instance with API enabled
- Valid WikiJS API key or authentication credentials

### Quick Install
```bash
# Clone and install
git clone <repository-url>
cd wikijs-mcp-server
python installer.py

# Configure WikiJS connection
wikijs-mcp configure

# Test connection
wikijs-mcp test-connection
```

## Configuration

### WikiJS Connection
```json
{
  "wikijs": {
    "url": "https://your-wiki.example.com",
    "api_key": "your-api-key",
    "default_locale": "en",
    "default_editor": "markdown"
  },
  "document_discovery": {
    "search_paths": ["/home/dev/workspace/docs", "/home/dev/workspace/projects"],
    "include_patterns": ["*.md", "README.md"],
    "exclude_patterns": ["node_modules/**", ".git/**"],
    "max_file_size": "10MB"
  },
  "security": {
    "allowed_paths": ["/home/dev/workspace/docs", "/home/dev/workspace/projects"],
    "forbidden_patterns": ["*.private.md", "secrets/**"],
    "max_files_per_operation": 100
  }
}
```

## Usage

### Basic Document Operations

#### Find Markdown Documents
```python
# Find all .md files in a directory
mcp_call("find_markdown_documents", {
    "search_path": "/path/to/docs",
    "recursive": True,
    "include_patterns": ["*.md"]
})
```

#### Upload Document to WikiJS
```python
# Upload a document to WikiJS
mcp_call("upload_document_to_wiki", {
    "file_path": "/path/to/document.md",
    "wiki_path": "/documentation/project",
    "title": "Project Documentation",
    "tags": ["project", "documentation"]
})
```

#### Bulk Migration
```python
# Migrate entire directory to WikiJS
mcp_call("migrate_directory_to_wiki", {
    "source_path": "/path/to/docs",
    "target_wiki_path": "/migrated-docs",
    "preserve_structure": True,
    "update_existing": False
})
```

### Advanced Features

#### Document Analysis
```python
# Analyze document structure and metadata
mcp_call("analyze_document", {
    "file_path": "/path/to/doc.md",
    "extract_links": True,
    "extract_images": True,
    "extract_frontmatter": True
})
```

#### WikiJS Page Management
```python
# Get existing page info
mcp_call("get_wiki_page_info", {
    "wiki_path": "/documentation/project"
})

# Update existing page
mcp_call("update_wiki_page", {
    "wiki_path": "/documentation/project",
    "content": "Updated content",
    "update_metadata": True
})
```

## MCP Tools Reference

### Document Discovery Tools
- `find_markdown_documents` - Search for Markdown files
- `analyze_document` - Extract document metadata and structure  
- `validate_document_path` - Check if path is allowed for operations

### WikiJS Integration Tools
- `upload_document_to_wiki` - Upload single document to WikiJS
- `update_wiki_page` - Update existing WikiJS page
- `get_wiki_page_info` - Retrieve WikiJS page information
- `delete_wiki_page` - Remove page from WikiJS
- `migrate_directory_to_wiki` - Bulk migration of documents

### Configuration Tools
- `get_wikijs_connection_info` - Display current WikiJS configuration
- `test_wikijs_connection` - Verify connection to WikiJS API
- `get_supported_formats` - List supported document formats

## Serena Integration

This MCP server is designed to work seamlessly with Serena projects:

### Automatic Documentation
```python
# Called by Serena after project completion
mcp_call("document_project_completion", {
    "project_path": "/path/to/project",
    "project_name": "My Project",
    "completion_summary": "Project completed successfully",
    "include_code_examples": True
})
```

### Project Documentation Templates
```python
# Generate project documentation from template
mcp_call("create_project_documentation", {
    "project_path": "/path/to/project",
    "template_type": "api_project",
    "output_path": "/path/to/project/docs",
    "auto_upload": True
})
```

## Security Considerations

### Path Security
- All file paths are validated against configured allowed paths
- Symbolic links are resolved and validated
- Directory traversal attempts are blocked

### Content Security  
- Document content is scanned for sensitive patterns
- File size limits prevent resource exhaustion
- Upload rate limiting available

### Authentication
- WikiJS API keys are stored securely
- Support for token refresh and rotation
- Audit logging for all operations

## Development

### Project Structure
```
wikijs-mcp-server/
├── src/wikijs_mcp/
│   ├── __init__.py
│   ├── server.py          # Main MCP server
│   ├── config.py          # Configuration models
│   ├── wikijs_client.py   # WikiJS API client
│   ├── document_scanner.py # Document discovery
│   ├── security.py        # Security validation
│   └── exceptions.py      # Custom exceptions
├── tests/
├── installer.py
└── README.md
```

### Contributing
1. Follow established patterns from other MCP servers
2. Maintain comprehensive logging
3. Include security validation for all operations
4. Write tests for new functionality
5. Update documentation for new features

## Error Handling

Common error scenarios and solutions:

### Connection Errors
- **WikiJS API Unreachable**: Check URL and network connectivity
- **Authentication Failed**: Verify API key and permissions
- **Rate Limited**: Implement retry logic with backoff

### Document Errors
- **File Not Found**: Validate file paths before operations
- **Permission Denied**: Check file system permissions
- **Invalid Format**: Validate document format before upload

### WikiJS Errors
- **Page Already Exists**: Use update operations or conflict resolution
- **Invalid Path**: Validate WikiJS path format
- **Quota Exceeded**: Check WikiJS storage limits

## License

[License information]

## Support

For issues and feature requests, please use the project's issue tracker.
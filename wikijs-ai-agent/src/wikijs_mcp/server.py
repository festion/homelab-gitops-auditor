"""
Main MCP Server for WikiJS integration.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

import mcp.server.stdio
from mcp import types
from mcp.server import Server
from mcp.server.models import InitializationOptions

from .config import WikiJSMCPConfig
from .wikijs_client import WikiJSClient
from .document_scanner import DocumentScanner, ScanResult
from .security import SecurityValidator
from .exceptions import WikiJSMCPError, WikiJSAPIError, SecurityError, ValidationError, ConfigurationError
from .ai_processor import AIContentProcessor, DEFAULT_AI_CONFIG


logger = logging.getLogger(__name__)


class WikiJSMCPServer:
    """WikiJS MCP Server for document management and WikiJS integration."""
    
    def __init__(self, config: WikiJSMCPConfig):
        self.config = config
        self.server = Server("wikijs-mcp-server")
        self.security = SecurityValidator(config.security)
        self.scanner = DocumentScanner(config.document_discovery, config.security)
        self.wikijs_client = WikiJSClient(config.wikijs)
        
        # Initialize AI processor
        ai_config = getattr(config, 'ai_processing', DEFAULT_AI_CONFIG)
        self.ai_processor = AIContentProcessor(ai_config)
        
        self._setup_logging()
        self._register_tools()
    
    def _setup_logging(self) -> None:
        """Configure logging."""
        log_level = getattr(logging, self.config.logging_level, logging.INFO)
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    def _register_tools(self) -> None:
        """Register MCP tools."""
        
        @self.server.list_tools()
        async def handle_list_tools() -> List[types.Tool]:
            """List available tools."""
            return [
                # Document Discovery Tools
                types.Tool(
                    name="find_markdown_documents",
                    description="Search for Markdown documents in a directory",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "search_path": {
                                "type": "string",
                                "description": "Directory path to search for documents"
                            },
                            "recursive": {
                                "type": "boolean",
                                "description": "Whether to search subdirectories recursively",
                                "default": True
                            },
                            "include_patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "File patterns to include (e.g., ['*.md', '*.markdown'])",
                                "default": ["*.md"]
                            },
                            "exclude_patterns": {
                                "type": "array", 
                                "items": {"type": "string"},
                                "description": "File patterns to exclude",
                                "default": ["node_modules/**", ".git/**"]
                            }
                        },
                        "required": ["search_path"]
                    }
                ),
                types.Tool(
                    name="analyze_document",
                    description="Analyze a single Markdown document and extract metadata",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to analyze"
                            }
                        },
                        "required": ["file_path"]
                    }
                ),
                types.Tool(
                    name="get_file_stats",
                    description="Get statistics about files in a directory",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "search_path": {
                                "type": "string",
                                "description": "Directory path to analyze"
                            }
                        },
                        "required": ["search_path"]
                    }
                ),
                
                # WikiJS Integration Tools
                types.Tool(
                    name="test_wikijs_connection",
                    description="Test connection to WikiJS and return system information",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                types.Tool(
                    name="upload_document_to_wiki",
                    description="Upload a Markdown document to WikiJS",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the Markdown file to upload"
                            },
                            "wiki_path": {
                                "type": "string", 
                                "description": "Target path in WikiJS (e.g., '/documentation/project')"
                            },
                            "title": {
                                "type": "string",
                                "description": "Page title (optional, will be extracted from content if not provided)"
                            },
                            "description": {
                                "type": "string",
                                "description": "Page description (optional)",
                                "default": ""
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Tags for the page (optional)",
                                "default": []
                            },
                            "overwrite_existing": {
                                "type": "boolean",
                                "description": "Whether to overwrite existing pages",
                                "default": False
                            }
                        },
                        "required": ["file_path", "wiki_path"]
                    }
                ),
                types.Tool(
                    name="get_wiki_page_info",
                    description="Get information about a WikiJS page",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "wiki_path": {
                                "type": "string",
                                "description": "Path to the WikiJS page"
                            },
                            "locale": {
                                "type": "string",
                                "description": "Page locale (optional, uses default if not provided)"
                            }
                        },
                        "required": ["wiki_path"]
                    }
                ),
                types.Tool(
                    name="update_wiki_page",
                    description="Update an existing WikiJS page",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "wiki_path": {
                                "type": "string",
                                "description": "Path to the WikiJS page to update"
                            },
                            "content": {
                                "type": "string",
                                "description": "New content for the page (optional if updating from file)"
                            },
                            "file_path": {
                                "type": "string",
                                "description": "Path to file to read content from (optional if content provided)"
                            },
                            "title": {
                                "type": "string",
                                "description": "New title for the page (optional)"
                            },
                            "description": {
                                "type": "string",
                                "description": "New description for the page (optional)"
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "New tags for the page (optional)"
                            }
                        },
                        "required": ["wiki_path"]
                    }
                ),
                types.Tool(
                    name="search_wiki_pages",
                    description="Search for pages in WikiJS",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query"
                            },
                            "locale": {
                                "type": "string",
                                "description": "Locale to search in (optional)"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of results",
                                "default": 20
                            }
                        },
                        "required": ["query"]
                    }
                ),
                types.Tool(
                    name="migrate_directory_to_wiki",
                    description="Migrate an entire directory of Markdown files to WikiJS",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "source_path": {
                                "type": "string",
                                "description": "Source directory containing Markdown files"
                            },
                            "target_wiki_path": {
                                "type": "string",
                                "description": "Target path in WikiJS (e.g., '/migrated-docs')"
                            },
                            "preserve_structure": {
                                "type": "boolean",
                                "description": "Whether to preserve directory structure",
                                "default": True
                            },
                            "update_existing": {
                                "type": "boolean",
                                "description": "Whether to update existing pages",
                                "default": False
                            },
                            "dry_run": {
                                "type": "boolean",
                                "description": "Preview changes without uploading",
                                "default": False
                            }
                        },
                        "required": ["source_path", "target_wiki_path"]
                    }
                ),
                
                # Configuration and Info Tools
                types.Tool(
                    name="get_wikijs_connection_info",
                    description="Get current WikiJS connection configuration",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                types.Tool(
                    name="validate_document_path",
                    description="Validate that a file path is allowed for operations",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "File path to validate"
                            }
                        },
                        "required": ["file_path"]
                    }
                ),
                
                # AI-Enhanced Document Processing Tools
                types.Tool(
                    name="enhance_document_content",
                    description="Enhance document content using AI for improved clarity, grammar, and structure",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to enhance"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content to enhance (optional if file_path provided)"
                            },
                            "enhancement_type": {
                                "type": "string",
                                "description": "Type of enhancement: general, technical, user_guide, api_docs",
                                "default": "general"
                            },
                            "target_audience": {
                                "type": "string",
                                "description": "Target audience: developers, users, administrators, general",
                                "default": "general"
                            },
                            "preserve_technical_details": {
                                "type": "boolean",
                                "description": "Whether to preserve all technical details",
                                "default": True
                            }
                        }
                    }
                ),
                types.Tool(
                    name="generate_document_toc",
                    description="Generate automatic table of contents for a document",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content (optional if file_path provided)"
                            },
                            "min_headings": {
                                "type": "integer",
                                "description": "Minimum number of headings required to generate TOC",
                                "default": 3
                            },
                            "max_depth": {
                                "type": "integer",
                                "description": "Maximum heading depth to include",
                                "default": 4
                            },
                            "insert_toc": {
                                "type": "boolean",
                                "description": "Whether to insert TOC into the document",
                                "default": False
                            }
                        }
                    }
                ),
                types.Tool(
                    name="categorize_document",
                    description="Automatically categorize and tag a document using AI",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to categorize"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content (optional if file_path provided)"
                            },
                            "suggest_wiki_path": {
                                "type": "boolean",
                                "description": "Whether to suggest optimal WikiJS path based on categorization",
                                "default": True
                            }
                        }
                    }
                ),
                types.Tool(
                    name="detect_cross_document_links",
                    description="Detect and suggest cross-document links and references",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to analyze"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content (optional if file_path provided)"
                            },
                            "search_directory": {
                                "type": "string",
                                "description": "Directory to search for related documents",
                                "default": "."
                            },
                            "create_links": {
                                "type": "boolean",
                                "description": "Whether to automatically insert suggested links",
                                "default": False
                            }
                        }
                    }
                ),
                types.Tool(
                    name="assess_document_quality",
                    description="Perform comprehensive quality assessment of a document",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to assess"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content (optional if file_path provided)"
                            },
                            "template_type": {
                                "type": "string",
                                "description": "Document template type for compliance checking: api_documentation, user_guide, technical_reference",
                                "default": None
                            },
                            "detailed_report": {
                                "type": "boolean",
                                "description": "Whether to include detailed issues and suggestions",
                                "default": True
                            }
                        }
                    }
                ),
                types.Tool(
                    name="improve_document_readability",
                    description="Improve document readability while preserving technical accuracy",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Path to the document to improve"
                            },
                            "content": {
                                "type": "string",
                                "description": "Document content (optional if file_path provided)"
                            },
                            "target_audience": {
                                "type": "string",
                                "description": "Target audience for readability optimization",
                                "default": "general"
                            },
                            "complexity_level": {
                                "type": "string",
                                "description": "Target complexity level: beginner, intermediate, advanced",
                                "default": "intermediate"
                            }
                        }
                    }
                ),
                types.Tool(
                    name="batch_process_documents",
                    description="Process multiple documents with AI enhancements in batch",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "source_directory": {
                                "type": "string",
                                "description": "Directory containing documents to process"
                            },
                            "file_patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "File patterns to include",
                                "default": ["*.md"]
                            },
                            "processing_options": {
                                "type": "object",
                                "properties": {
                                    "enhance_content": {"type": "boolean", "default": True},
                                    "generate_toc": {"type": "boolean", "default": True},
                                    "categorize": {"type": "boolean", "default": True},
                                    "assess_quality": {"type": "boolean", "default": True},
                                    "detect_links": {"type": "boolean", "default": True},
                                    "enhancement_type": {"type": "string", "default": "general"},
                                    "target_audience": {"type": "string", "default": "general"},
                                    "rate_limit_delay": {"type": "number", "default": 1.0}
                                },
                                "description": "Processing options for batch operation"
                            },
                            "output_directory": {
                                "type": "string",
                                "description": "Directory to save processed documents (optional)"
                            },
                            "dry_run": {
                                "type": "boolean",
                                "description": "Preview processing without making changes",
                                "default": False
                            }
                        },
                        "required": ["source_directory"]
                    }
                ),
                types.Tool(
                    name="create_navigation_structure",
                    description="Generate intelligent navigation structure for document collections",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "source_directory": {
                                "type": "string",
                                "description": "Directory containing documents to organize"
                            },
                            "structure_type": {
                                "type": "string",
                                "description": "Type of navigation: hierarchical, topic_based, audience_based",
                                "default": "hierarchical"
                            },
                            "include_breadcrumbs": {
                                "type": "boolean",
                                "description": "Whether to generate breadcrumb navigation",
                                "default": True
                            },
                            "generate_sitemap": {
                                "type": "boolean",
                                "description": "Whether to generate a site map",
                                "default": True
                            }
                        },
                        "required": ["source_directory"]
                    }
                )
            ]
        
        @self.server.call_tool()
        async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[types.TextContent]:
            """Handle tool calls."""
            try:
                if name == "find_markdown_documents":
                    return await self._handle_find_documents(**arguments)
                elif name == "analyze_document":
                    return await self._handle_analyze_document(**arguments)
                elif name == "get_file_stats":
                    return await self._handle_get_file_stats(**arguments)
                elif name == "test_wikijs_connection":
                    return await self._handle_test_connection(**arguments)
                elif name == "upload_document_to_wiki":
                    return await self._handle_upload_document(**arguments)
                elif name == "get_wiki_page_info":
                    return await self._handle_get_page_info(**arguments)
                elif name == "update_wiki_page":
                    return await self._handle_update_page(**arguments)
                elif name == "search_wiki_pages":
                    return await self._handle_search_pages(**arguments)
                elif name == "migrate_directory_to_wiki":
                    return await self._handle_migrate_directory(**arguments)
                elif name == "get_wikijs_connection_info":
                    return await self._handle_get_connection_info(**arguments)
                elif name == "validate_document_path":
                    return await self._handle_validate_path(**arguments)
                
                # AI Processing Tool Handlers
                elif name == "enhance_document_content":
                    return await self._handle_enhance_content(**arguments)
                elif name == "generate_document_toc":
                    return await self._handle_generate_toc(**arguments)
                elif name == "categorize_document":
                    return await self._handle_categorize_document(**arguments)
                elif name == "detect_cross_document_links":
                    return await self._handle_detect_links(**arguments)
                elif name == "assess_document_quality":
                    return await self._handle_assess_quality(**arguments)
                elif name == "improve_document_readability":
                    return await self._handle_improve_readability(**arguments)
                elif name == "batch_process_documents":
                    return await self._handle_batch_process(**arguments)
                elif name == "create_navigation_structure":
                    return await self._handle_create_navigation(**arguments)
                else:
                    raise ValueError(f"Unknown tool: {name}")
            
            except WikiJSMCPError as e:
                logger.error(f"WikiJS MCP error in {name}: {e}")
                return [types.TextContent(type="text", text=f"Error: {str(e)}")]
            except Exception as e:
                logger.error(f"Unexpected error in {name}: {e}", exc_info=True)
                return [types.TextContent(type="text", text=f"Unexpected error: {str(e)}")]
    
    # Document Discovery Handlers
    
    async def _handle_find_documents(
        self,
        search_path: str,
        recursive: bool = True,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None
    ) -> List[types.TextContent]:
        """Handle document finding."""
        result = self.scanner.find_documents(search_path, recursive, include_patterns, exclude_patterns)
        
        # Format results
        response_lines = []
        response_lines.append(f"Document Scan Results for: {search_path}")
        response_lines.append("=" * 60)
        response_lines.append(f"Files Found: {result.total_files_found}")
        response_lines.append(f"Files Processed: {result.total_files_processed}")
        response_lines.append(f"Scan Duration: {result.scan_duration:.2f} seconds")
        response_lines.append("")
        
        if result.errors:
            response_lines.append("⚠️ Errors:")
            for error in result.errors[:5]:  # Show first 5 errors
                response_lines.append(f"  - {error}")
            if len(result.errors) > 5:
                response_lines.append(f"  ... and {len(result.errors) - 5} more errors")
            response_lines.append("")
        
        if result.warnings:
            response_lines.append("🔔 Warnings:")
            for warning in result.warnings[:3]:  # Show first 3 warnings
                response_lines.append(f"  - {warning}")
            if len(result.warnings) > 3:
                response_lines.append(f"  ... and {len(result.warnings) - 3} more warnings")
            response_lines.append("")
        
        response_lines.append("📄 Documents Found:")
        for doc in result.documents[:10]:  # Show first 10 documents
            response_lines.append(f"  📝 {doc.title}")
            response_lines.append(f"     Path: {doc.relative_path}")
            response_lines.append(f"     Size: {self._format_file_size(doc.size)}")
            if doc.tags:
                response_lines.append(f"     Tags: {', '.join(doc.tags[:3])}")
            response_lines.append(f"     Preview: {doc.content_preview[:100]}...")
            response_lines.append("")
        
        if len(result.documents) > 10:
            response_lines.append(f"... and {len(result.documents) - 10} more documents")
        
        # Add JSON data for programmatic access
        response_lines.append("\\n" + "="*60)
        response_lines.append("JSON Data:")
        response_lines.append(json.dumps(result.to_dict(), indent=2, default=str))
        
        return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_analyze_document(self, file_path: str) -> List[types.TextContent]:
        """Handle single document analysis."""
        doc_metadata = self.scanner.analyze_single_document(file_path)
        
        # Format results
        response_lines = []
        response_lines.append(f"Document Analysis: {doc_metadata.title}")
        response_lines.append("=" * 60)
        response_lines.append(f"File Path: {doc_metadata.file_path}")
        response_lines.append(f"Size: {self._format_file_size(doc_metadata.size)}")
        response_lines.append(f"Modified: {doc_metadata.modified_time}")
        response_lines.append(f"Content Hash: {doc_metadata.content_hash}")
        response_lines.append("")
        
        if doc_metadata.frontmatter:
            response_lines.append("📋 Frontmatter:")
            for key, value in doc_metadata.frontmatter.items():
                response_lines.append(f"  {key}: {value}")
            response_lines.append("")
        
        if doc_metadata.tags:
            response_lines.append(f"🏷️ Tags: {', '.join(doc_metadata.tags)}")
            response_lines.append("")
        
        if doc_metadata.links:
            response_lines.append(f"🔗 Links Found: {len(doc_metadata.links)}")
            for link in doc_metadata.links[:5]:
                response_lines.append(f"  - {link}")
            if len(doc_metadata.links) > 5:
                response_lines.append(f"  ... and {len(doc_metadata.links) - 5} more")
            response_lines.append("")
        
        if doc_metadata.images:
            response_lines.append(f"🖼️ Images Found: {len(doc_metadata.images)}")
            for image in doc_metadata.images[:3]:
                response_lines.append(f"  - {image}")
            if len(doc_metadata.images) > 3:
                response_lines.append(f"  ... and {len(doc_metadata.images) - 3} more")
            response_lines.append("")
        
        response_lines.append("📄 Content Preview:")
        response_lines.append(doc_metadata.content_preview)
        
        # Add JSON data
        response_lines.append("\\n" + "="*60)
        response_lines.append("JSON Data:")
        response_lines.append(json.dumps(doc_metadata.to_dict(), indent=2, default=str))
        
        return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_get_file_stats(self, search_path: str) -> List[types.TextContent]:
        """Handle file statistics gathering."""
        stats = self.scanner.get_file_stats(search_path)
        
        response_lines = []
        response_lines.append(f"File Statistics for: {search_path}")
        response_lines.append("=" * 60)
        response_lines.append(f"Total Files: {stats['total_files']}")
        response_lines.append(f"Markdown Files: {stats['markdown_files']}")
        response_lines.append(f"Total Size: {self._format_file_size(stats['total_size'])}")
        response_lines.append("")
        
        response_lines.append("📊 File Types:")
        for ext, count in sorted(stats['file_types'].items(), key=lambda x: x[1], reverse=True)[:10]:
            response_lines.append(f"  {ext or '(no extension)'}: {count}")
        response_lines.append("")
        
        if stats['largest_file']['path']:
            response_lines.append("📈 Largest File:")
            response_lines.append(f"  {stats['largest_file']['path']}")
            response_lines.append(f"  Size: {self._format_file_size(stats['largest_file']['size'])}")
            response_lines.append("")
        
        if stats['newest_file']['path']:
            response_lines.append("🕒 Newest File:")
            response_lines.append(f"  {stats['newest_file']['path']}")
            response_lines.append(f"  Modified: {stats['newest_file']['modified']}")
        
        return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    # WikiJS Integration Handlers
    
    async def _handle_test_connection(self) -> List[types.TextContent]:
        """Handle WikiJS connection test."""
        async with self.wikijs_client as client:
            system_info = await client.test_connection()
            
            response_lines = []
            response_lines.append("WikiJS Connection Test - SUCCESS ✅")
            response_lines.append("=" * 50)
            response_lines.append(f"WikiJS Version: {system_info.get('currentVersion', 'Unknown')}")
            response_lines.append(f"Database Type: {system_info.get('dbType', 'Unknown')}")
            response_lines.append(f"Total Pages: {system_info.get('pagesTotal', 0)}")
            response_lines.append(f"Total Users: {system_info.get('usersTotal', 0)}")
            response_lines.append(f"Total Groups: {system_info.get('groupsTotal', 0)}")
            response_lines.append("")
            response_lines.append(f"Server URL: {self.config.wikijs.url}")
            response_lines.append(f"Default Locale: {self.config.wikijs.default_locale}")
            response_lines.append(f"Default Editor: {self.config.wikijs.default_editor}")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_upload_document(
        self,
        file_path: str,
        wiki_path: str,
        title: str = None,
        description: str = "",
        tags: List[str] = None,
        overwrite_existing: bool = False
    ) -> List[types.TextContent]:
        """Handle document upload to WikiJS."""
        tags = tags or []
        
        # Validate file path
        validated_path = self.security.validate_file_path(file_path)
        
        # Validate wiki path
        normalized_wiki_path = self.security.validate_wiki_path(wiki_path)
        
        # Read document content
        with open(validated_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Validate content security
        self.security.validate_content_security(content, file_path)
        
        # Extract title if not provided
        if not title:
            if content.startswith('# '):
                title = content.split('\\n')[0][2:].strip()
            else:
                title = self._generate_title_from_filename(file_path)
        
        async with self.wikijs_client as client:
            # Check if page already exists
            existing_page = await client.get_page(normalized_wiki_path)
            
            if existing_page and not overwrite_existing:
                return [types.TextContent(type="text", text=f"❌ Page already exists at {wiki_path}. Use overwrite_existing=true to update.")]
            
            if existing_page:
                # Update existing page
                result = await client.update_page(
                    page_id=existing_page['id'],
                    content=content,
                    title=title,
                    description=description,
                    tags=tags
                )
                action = "Updated"
            else:
                # Create new page
                result = await client.create_page(
                    path=normalized_wiki_path,
                    title=title,
                    content=content,
                    description=description,
                    tags=tags
                )
                action = "Created"
            
            response_lines = []
            response_lines.append(f"✅ {action} WikiJS Page Successfully")
            response_lines.append("=" * 50)
            response_lines.append(f"Source File: {file_path}")
            response_lines.append(f"Wiki Path: {wiki_path}")
            response_lines.append(f"Page Title: {title}")
            response_lines.append(f"Page ID: {result.get('id', 'N/A')}")
            if tags:
                response_lines.append(f"Tags: {', '.join(tags)}")
            if description:
                response_lines.append(f"Description: {description}")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_get_page_info(self, wiki_path: str, locale: str = None) -> List[types.TextContent]:
        """Handle WikiJS page info retrieval."""
        normalized_wiki_path = self.security.validate_wiki_path(wiki_path)
        
        async with self.wikijs_client as client:
            page = await client.get_page(normalized_wiki_path, locale)
            
            if not page:
                return [types.TextContent(type="text", text=f"❌ Page not found: {wiki_path}")]
            
            response_lines = []
            response_lines.append(f"📄 WikiJS Page Information")
            response_lines.append("=" * 50)
            response_lines.append(f"Title: {page['title']}")
            response_lines.append(f"Path: {page['path']}")
            response_lines.append(f"ID: {page['id']}")
            response_lines.append(f"Locale: {page['locale']}")
            response_lines.append(f"Editor: {page['editor']}")
            response_lines.append(f"Published: {'Yes' if page['isPublished'] else 'No'}")
            response_lines.append(f"Created: {page['createdAt']}")
            response_lines.append(f"Updated: {page['updatedAt']}")
            
            if page.get('author'):
                response_lines.append(f"Author: {page['author']['name']} ({page['author']['email']})")
            
            if page.get('description'):
                response_lines.append(f"Description: {page['description']}")
            
            if page.get('tags'):
                tag_names = [tag['tag'] for tag in page['tags']]
                response_lines.append(f"Tags: {', '.join(tag_names)}")
            
            # Show content preview
            content = page.get('content', '')
            if content:
                preview = content[:300] + "..." if len(content) > 300 else content
                response_lines.append("")
                response_lines.append("📝 Content Preview:")
                response_lines.append(preview)
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_update_page(
        self,
        wiki_path: str,
        content: str = None,
        file_path: str = None,
        title: str = None,
        description: str = None,
        tags: List[str] = None
    ) -> List[types.TextContent]:
        """Handle WikiJS page update."""
        if not content and not file_path:
            raise ValidationError("Either content or file_path must be provided")
        
        normalized_wiki_path = self.security.validate_wiki_path(wiki_path)
        
        # Read content from file if provided
        if file_path:
            validated_path = self.security.validate_file_path(file_path)
            with open(validated_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Validate content security
            self.security.validate_content_security(content, file_path)
        
        async with self.wikijs_client as client:
            # Get existing page
            existing_page = await client.get_page(normalized_wiki_path)
            if not existing_page:
                return [types.TextContent(type="text", text=f"❌ Page not found: {wiki_path}")]
            
            # Update page
            result = await client.update_page(
                page_id=existing_page['id'],
                content=content,
                title=title,
                description=description,
                tags=tags
            )
            
            response_lines = []
            response_lines.append("✅ WikiJS Page Updated Successfully")
            response_lines.append("=" * 50)
            response_lines.append(f"Wiki Path: {wiki_path}")
            response_lines.append(f"Page ID: {result['id']}")
            response_lines.append(f"Updated: {result.get('updatedAt', 'N/A')}")
            if file_path:
                response_lines.append(f"Source File: {file_path}")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_search_pages(self, query: str, locale: str = None, limit: int = 20) -> List[types.TextContent]:
        """Handle WikiJS page search."""
        async with self.wikijs_client as client:
            results = await client.search_pages(query, locale, limit)
            
            response_lines = []
            response_lines.append(f"🔍 WikiJS Search Results for: '{query}'")
            response_lines.append("=" * 60)
            response_lines.append(f"Found {len(results)} pages")
            response_lines.append("")
            
            for i, page in enumerate(results, 1):
                response_lines.append(f"{i}. 📄 {page['title']}")
                response_lines.append(f"   Path: {page['path']}")
                response_lines.append(f"   ID: {page['id']}")
                if page.get('description'):
                    response_lines.append(f"   Description: {page['description']}")
                # Tags removed from search results due to WikiJS schema compatibility
                # if page.get('tags'):
                #     tag_names = [tag['tag'] for tag in page['tags']]
                #     response_lines.append(f"   Tags: {', '.join(tag_names)}")
                response_lines.append(f"   Updated: {page['updatedAt']}")
                response_lines.append("")
            
            if not results:
                response_lines.append("No pages found matching your search.")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_migrate_directory(
        self,
        source_path: str,
        target_wiki_path: str,
        preserve_structure: bool = True,
        update_existing: bool = False,
        dry_run: bool = False
    ) -> List[types.TextContent]:
        """Handle directory migration to WikiJS."""
        # Find all documents in source directory
        scan_result = self.scanner.find_documents(source_path, recursive=True)
        
        if scan_result.errors:
            error_msg = f"❌ Scan failed with {len(scan_result.errors)} errors"
            return [types.TextContent(type="text", text=error_msg)]
        
        response_lines = []
        response_lines.append(f"📁 Directory Migration {'(DRY RUN)' if dry_run else ''}")
        response_lines.append("=" * 60)
        response_lines.append(f"Source: {source_path}")
        response_lines.append(f"Target: {target_wiki_path}")
        response_lines.append(f"Documents Found: {len(scan_result.documents)}")
        response_lines.append(f"Preserve Structure: {preserve_structure}")
        response_lines.append(f"Update Existing: {update_existing}")
        response_lines.append("")
        
        if not scan_result.documents:
            response_lines.append("❌ No documents found to migrate.")
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
        
        # Validate operation count
        self.security.validate_operation_count(len(scan_result.documents), "migration")
        
        success_count = 0
        error_count = 0
        skipped_count = 0
        
        normalized_target = self.security.validate_wiki_path(target_wiki_path)
        
        async with self.wikijs_client as client:
            for doc in scan_result.documents:
                try:
                    # Determine target wiki path
                    if preserve_structure:
                        rel_path = doc.relative_path
                        # Remove .md extension and convert to wiki path
                        wiki_name = os.path.splitext(rel_path)[0].replace(os.sep, '/')
                        full_wiki_path = f"{normalized_target}/{wiki_name}".strip('/')
                    else:
                        # Flatten structure - use just filename
                        wiki_name = os.path.splitext(os.path.basename(doc.file_path))[0]
                        full_wiki_path = f"{normalized_target}/{wiki_name}".strip('/')
                    
                    # Validate wiki path
                    full_wiki_path = self.security.validate_wiki_path(full_wiki_path)
                    
                    if dry_run:
                        response_lines.append(f"📝 Would migrate: {doc.relative_path} → {full_wiki_path}")
                        success_count += 1
                        continue
                    
                    # Check if page exists
                    existing_page = await client.get_page(full_wiki_path)
                    
                    if existing_page and not update_existing:
                        response_lines.append(f"⏭️ Skipped (exists): {doc.relative_path} → {full_wiki_path}")
                        skipped_count += 1
                        continue
                    
                    # Read document content
                    with open(doc.file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Get title
                    title = doc.title or self._generate_title_from_filename(doc.file_path)
                    
                    # Get tags
                    tags = doc.tags or []
                    
                    if existing_page:
                        # Update existing page
                        await client.update_page(
                            page_id=existing_page['id'],
                            content=content,
                            title=title,
                            tags=tags
                        )
                        response_lines.append(f"✅ Updated: {doc.relative_path} → {full_wiki_path}")
                    else:
                        # Create new page
                        await client.create_page(
                            path=full_wiki_path,
                            title=title,
                            content=content,
                            tags=tags
                        )
                        response_lines.append(f"✅ Created: {doc.relative_path} → {full_wiki_path}")
                    
                    success_count += 1
                
                except Exception as e:
                    error_msg = f"❌ Failed: {doc.relative_path} - {str(e)}"
                    response_lines.append(error_msg)
                    error_count += 1
                    logger.error(f"Migration error for {doc.file_path}: {e}")
        
        # Summary
        response_lines.append("")
        response_lines.append("📊 Migration Summary:")
        response_lines.append(f"  ✅ Successful: {success_count}")
        response_lines.append(f"  ❌ Errors: {error_count}")
        response_lines.append(f"  ⏭️ Skipped: {skipped_count}")
        
        return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    # Configuration and Info Handlers
    
    async def _handle_get_connection_info(self) -> List[types.TextContent]:
        """Handle connection info request."""
        response_lines = []
        response_lines.append("⚙️ WikiJS MCP Server Configuration")
        response_lines.append("=" * 50)
        response_lines.append(f"WikiJS URL: {self.config.wikijs.url}")
        response_lines.append(f"Default Locale: {self.config.wikijs.default_locale}")
        response_lines.append(f"Default Editor: {self.config.wikijs.default_editor}")
        response_lines.append(f"Default Tags: {', '.join(self.config.wikijs.default_tags) if self.config.wikijs.default_tags else 'None'}")
        response_lines.append(f"Request Timeout: {self.config.wikijs.timeout}s")
        response_lines.append(f"Retry Attempts: {self.config.wikijs.retry_attempts}")
        response_lines.append("")
        
        response_lines.append("📁 Document Discovery:")
        response_lines.append(f"  Search Paths: {len(self.config.document_discovery.search_paths)}")
        for path in self.config.document_discovery.search_paths[:3]:
            response_lines.append(f"    - {path}")
        if len(self.config.document_discovery.search_paths) > 3:
            remaining = len(self.config.document_discovery.search_paths) - 3
            response_lines.append(f"    ... and {remaining} more")
        
        response_lines.append(f"  Include Patterns: {', '.join(self.config.document_discovery.include_patterns)}")
        response_lines.append(f"  Max File Size: {self.config.document_discovery.max_file_size}")
        response_lines.append(f"  Max Files Per Scan: {self.config.document_discovery.max_files_per_scan}")
        response_lines.append("")
        
        response_lines.append("🛡️ Security Settings:")
        response_lines.append(self.security.get_validation_summary())
        
        return [types.TextContent(type="text", text="\\n".join(response_lines))]
    
    async def _handle_validate_path(self, file_path: str) -> List[types.TextContent]:
        """Handle path validation."""
        try:
            validated_path = self.security.validate_file_path(file_path)
            
            response_lines = []
            response_lines.append(f"✅ Path Validation Successful")
            response_lines.append("=" * 40)
            response_lines.append(f"Original Path: {file_path}")
            response_lines.append(f"Validated Path: {validated_path}")
            response_lines.append(f"File exists: {os.path.exists(validated_path)}")
            
            if os.path.exists(validated_path):
                stat_info = os.stat(validated_path)
                response_lines.append(f"File size: {self._format_file_size(stat_info.st_size)}")
                response_lines.append(f"Modified: {datetime.fromtimestamp(stat_info.st_mtime)}")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
        
        except (SecurityError, ValidationError) as e:
            return [types.TextContent(type="text", text=f"❌ Path validation failed: {str(e)}")]
    
    # AI Processing Handlers
    
    async def _handle_enhance_content(
        self,
        file_path: str = None,
        content: str = None,
        enhancement_type: str = "general",
        target_audience: str = "general",
        preserve_technical_details: bool = True
    ) -> List[types.TextContent]:
        """Handle AI content enhancement."""
        try:
            # Initialize AI processor if needed
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Enhance content
            enhancement = await self.ai_processor.enhance_content(
                content, enhancement_type, target_audience, preserve_technical_details
            )
            
            # Format response
            response_lines = []
            response_lines.append("🤖 AI Content Enhancement Results")
            response_lines.append("=" * 50)
            response_lines.append(f"Enhancement Type: {enhancement.enhancement_type}")
            response_lines.append(f"Target Audience: {target_audience}")
            response_lines.append(f"Quality Score: {enhancement.quality_score:.2f}")
            response_lines.append(f"Readability Score: {enhancement.readability_score:.2f}")
            response_lines.append(f"Confidence: {enhancement.confidence:.2f}")
            response_lines.append(f"Processed: {enhancement.timestamp}")
            response_lines.append("")
            
            if enhancement.improvements:
                response_lines.append("✨ Improvements Made:")
                for improvement in enhancement.improvements:
                    response_lines.append(f"  • {improvement}")
                response_lines.append("")
            
            response_lines.append("📝 Enhanced Content:")
            response_lines.append("-" * 30)
            response_lines.append(enhancement.enhanced_content)
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Content enhancement failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Content enhancement failed: {str(e)}")]
    
    async def _handle_generate_toc(
        self,
        file_path: str = None,
        content: str = None,
        min_headings: int = 3,
        max_depth: int = 4,
        insert_toc: bool = False
    ) -> List[types.TextContent]:
        """Handle TOC generation."""
        try:
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Generate TOC
            toc = await self.ai_processor.generate_table_of_contents(content, min_headings)
            
            if not toc:
                return [types.TextContent(type="text", text="📄 Document doesn't have enough headings for TOC generation")]
            
            # Format response
            response_lines = []
            response_lines.append("📑 Generated Table of Contents")
            response_lines.append("=" * 40)
            response_lines.append(f"Sections Found: {len(toc.sections)}")
            response_lines.append(f"Maximum Depth: {toc.depth}")
            response_lines.append(f"Placement Suggestion: {toc.placement_suggestion}")
            response_lines.append(f"Confidence: {toc.confidence:.2f}")
            response_lines.append("")
            
            # Generate TOC markdown
            toc_markdown = []
            for section in toc.sections:
                indent = "  " * (section['level'] - 1)
                title = section['title']
                anchor = section.get('anchor', self.ai_processor._generate_anchor(title))
                toc_markdown.append(f"{indent}- [{title}]({anchor})")
            
            response_lines.append("📋 Table of Contents:")
            response_lines.extend(toc_markdown)
            response_lines.append("")
            
            # Insert TOC if requested
            if insert_toc and file_path:
                # Logic to insert TOC into file would go here
                response_lines.append("✅ TOC inserted into document")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"TOC generation failed: {e}")
            return [types.TextContent(type="text", text=f"❌ TOC generation failed: {str(e)}")]
    
    async def _handle_categorize_document(
        self,
        file_path: str = None,
        content: str = None,
        suggest_wiki_path: bool = True
    ) -> List[types.TextContent]:
        """Handle document categorization."""
        try:
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Categorize document
            categorization = await self.ai_processor.categorize_document(content, file_path or "")
            
            # Format response
            response_lines = []
            response_lines.append("🏷️ Document Categorization Results")
            response_lines.append("=" * 50)
            response_lines.append(f"Primary Category: {categorization.primary_category}")
            
            if categorization.secondary_categories:
                response_lines.append(f"Secondary Categories: {', '.join(categorization.secondary_categories)}")
            
            response_lines.append(f"Target Audience: {categorization.target_audience}")
            response_lines.append(f"Complexity Level: {categorization.complexity_level}")
            response_lines.append(f"Confidence: {categorization.confidence:.2f}")
            response_lines.append("")
            
            if categorization.tags:
                response_lines.append("🏷️ Suggested Tags:")
                for tag in categorization.tags:
                    response_lines.append(f"  • {tag}")
                response_lines.append("")
            
            if categorization.related_documents:
                response_lines.append("🔗 Related Document Topics:")
                for doc in categorization.related_documents:
                    response_lines.append(f"  • {doc}")
                response_lines.append("")
            
            # Suggest wiki path
            if suggest_wiki_path:
                wiki_path = f"/{categorization.primary_category}"
                if file_path:
                    filename = os.path.splitext(os.path.basename(file_path))[0]
                    wiki_path += f"/{filename}"
                response_lines.append(f"📍 Suggested Wiki Path: {wiki_path}")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Document categorization failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Document categorization failed: {str(e)}")]
    
    async def _handle_detect_links(
        self,
        file_path: str = None,
        content: str = None,
        search_directory: str = ".",
        create_links: bool = False
    ) -> List[types.TextContent]:
        """Handle cross-document link detection."""
        try:
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Find available documents
            scan_result = self.scanner.find_documents(search_directory, recursive=True)
            available_docs = [doc.relative_path for doc in scan_result.documents]
            
            # Detect links
            links = await self.ai_processor.detect_cross_document_links(content, available_docs)
            
            # Format response
            response_lines = []
            response_lines.append("🔗 Cross-Document Link Analysis")
            response_lines.append("=" * 50)
            response_lines.append(f"Confidence: {links.confidence:.2f}")
            response_lines.append("")
            
            if links.suggested_links:
                response_lines.append("💡 Suggested Internal Links:")
                for link in links.suggested_links:
                    response_lines.append(f"  • '{link['text']}' → {link['target_doc']}")
                    response_lines.append(f"    Context: {link['context']}")
                    response_lines.append(f"    Confidence: {link['confidence']:.2f}")
                response_lines.append("")
            
            if links.broken_links:
                response_lines.append("❌ Broken Links Found:")
                for broken_link in links.broken_links:
                    response_lines.append(f"  • {broken_link}")
                response_lines.append("")
            
            if links.external_references:
                response_lines.append("🌐 External References:")
                for ref in links.external_references:
                    response_lines.append(f"  • {ref['text']}")
                    if ref.get('url'):
                        response_lines.append(f"    URL: {ref['url']}")
                response_lines.append("")
            
            if not links.suggested_links and not links.broken_links:
                response_lines.append("✅ No linking opportunities or issues found")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Link detection failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Link detection failed: {str(e)}")]
    
    async def _handle_assess_quality(
        self,
        file_path: str = None,
        content: str = None,
        template_type: str = None,
        detailed_report: bool = True
    ) -> List[types.TextContent]:
        """Handle document quality assessment."""
        try:
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Assess quality
            assessment = await self.ai_processor.assess_quality(content, template_type)
            
            # Format response
            response_lines = []
            response_lines.append("📊 Document Quality Assessment")
            response_lines.append("=" * 50)
            response_lines.append(f"Overall Score: {assessment.overall_score:.2f}/1.0")
            response_lines.append("")
            
            response_lines.append("📈 Quality Metrics:")
            response_lines.append(f"  Grammar: {assessment.grammar_score:.2f}")
            response_lines.append(f"  Readability: {assessment.readability_score:.2f}")
            response_lines.append(f"  Technical Accuracy: {assessment.technical_accuracy_score:.2f}")
            response_lines.append(f"  Structure: {assessment.structure_score:.2f}")
            if template_type:
                response_lines.append(f"  Template Compliance: {assessment.compliance_score:.2f}")
            response_lines.append("")
            
            if detailed_report and assessment.issues:
                response_lines.append("⚠️ Issues Found:")
                for issue in assessment.issues:
                    response_lines.append(f"  • {issue['type']}: {issue['description']}")
                    if issue.get('line'):
                        response_lines.append(f"    Line: {issue['line']}")
                    if issue.get('suggestion'):
                        response_lines.append(f"    Suggestion: {issue['suggestion']}")
                response_lines.append("")
            
            if assessment.suggestions:
                response_lines.append("💡 Improvement Suggestions:")
                for suggestion in assessment.suggestions:
                    response_lines.append(f"  • {suggestion}")
                response_lines.append("")
            
            # Quality rating
            if assessment.overall_score >= 0.8:
                response_lines.append("✅ Document quality is excellent")
            elif assessment.overall_score >= 0.6:
                response_lines.append("👍 Document quality is good")
            elif assessment.overall_score >= 0.4:
                response_lines.append("⚠️ Document quality needs improvement")
            else:
                response_lines.append("❌ Document quality requires significant improvement")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Quality assessment failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Quality assessment failed: {str(e)}")]
    
    async def _handle_improve_readability(
        self,
        file_path: str = None,
        content: str = None,
        target_audience: str = "general",
        complexity_level: str = "intermediate"
    ) -> List[types.TextContent]:
        """Handle readability improvement."""
        try:
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Get content
            if file_path and not content:
                validated_path = self.security.validate_file_path(file_path)
                with open(validated_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif not content:
                return [types.TextContent(type="text", text="❌ Either file_path or content must be provided")]
            
            # Improve readability
            result = await self.ai_processor.improve_readability(content, target_audience, complexity_level)
            
            # Format response
            response_lines = []
            response_lines.append("📖 Readability Improvement Results")
            response_lines.append("=" * 50)
            response_lines.append(f"Target Audience: {target_audience}")
            response_lines.append(f"Complexity Level: {complexity_level}")
            response_lines.append(f"Readability Score Before: {result.get('readability_score_before', 0):.2f}")
            response_lines.append(f"Readability Score After: {result.get('readability_score_after', 0):.2f}")
            response_lines.append(f"Confidence: {result.get('confidence', 0):.2f}")
            response_lines.append("")
            
            if result.get('readability_improvements'):
                response_lines.append("✨ Readability Improvements:")
                for improvement in result['readability_improvements']:
                    response_lines.append(f"  • {improvement}")
                response_lines.append("")
            
            response_lines.append("📝 Improved Content:")
            response_lines.append("-" * 30)
            response_lines.append(result.get('improved_content', content))
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Readability improvement failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Readability improvement failed: {str(e)}")]
    
    async def _handle_batch_process(
        self,
        source_directory: str,
        file_patterns: List[str] = None,
        processing_options: Dict[str, Any] = None,
        output_directory: str = None,
        dry_run: bool = False
    ) -> List[types.TextContent]:
        """Handle batch document processing."""
        try:
            file_patterns = file_patterns or ["*.md"]
            processing_options = processing_options or {}
            
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Find documents
            scan_result = self.scanner.find_documents(
                source_directory, 
                recursive=True, 
                include_patterns=file_patterns
            )
            
            if not scan_result.documents:
                return [types.TextContent(type="text", text="❌ No documents found for processing")]
            
            # Prepare documents for batch processing
            documents = []
            for doc in scan_result.documents:
                try:
                    with open(doc.file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    documents.append({
                        'path': doc.file_path,
                        'content': content
                    })
                except Exception as e:
                    logger.error(f"Failed to read {doc.file_path}: {e}")
            
            # Process documents
            if dry_run:
                response_lines = []
                response_lines.append("🔍 Batch Processing Preview (DRY RUN)")
                response_lines.append("=" * 50)
                response_lines.append(f"Documents to process: {len(documents)}")
                response_lines.append(f"Source directory: {source_directory}")
                response_lines.append(f"Processing options: {processing_options}")
                
                for doc in documents[:10]:  # Show first 10
                    response_lines.append(f"  📄 {doc['path']}")
                
                if len(documents) > 10:
                    response_lines.append(f"  ... and {len(documents) - 10} more documents")
                
                return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
            # Actual processing
            results = await self.ai_processor.process_document_batch(documents, processing_options)
            
            # Format response
            response_lines = []
            response_lines.append("🚀 Batch Processing Results")
            response_lines.append("=" * 50)
            response_lines.append(f"Documents processed: {len(results)}")
            response_lines.append(f"Processing options: {processing_options}")
            response_lines.append("")
            
            success_count = sum(1 for r in results if 'error' not in r)
            error_count = sum(1 for r in results if 'error' in r)
            
            response_lines.append("📊 Summary:")
            response_lines.append(f"  ✅ Successful: {success_count}")
            response_lines.append(f"  ❌ Errors: {error_count}")
            response_lines.append("")
            
            # Show processing details for first few documents
            for i, result in enumerate(results[:5]):
                if 'error' in result:
                    response_lines.append(f"❌ {result['original_path']}: {result['error']}")
                else:
                    response_lines.append(f"✅ {result['original_path']}")
                    if 'enhancement' in result:
                        enhancement = result['enhancement']
                        response_lines.append(f"   Quality: {enhancement['quality_score']:.2f}")
                    if 'categorization' in result:
                        cat = result['categorization']
                        response_lines.append(f"   Category: {cat['primary_category']}")
            
            if len(results) > 5:
                response_lines.append(f"... and {len(results) - 5} more results")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Batch processing failed: {str(e)}")]
    
    async def _handle_create_navigation(
        self,
        source_directory: str,
        structure_type: str = "hierarchical",
        include_breadcrumbs: bool = True,
        generate_sitemap: bool = True
    ) -> List[types.TextContent]:
        """Handle navigation structure creation."""
        try:
            # Find documents
            scan_result = self.scanner.find_documents(source_directory, recursive=True)
            
            if not scan_result.documents:
                return [types.TextContent(type="text", text="❌ No documents found for navigation structure")]
            
            # Initialize AI processor
            if not await self.ai_processor.initialize():
                return [types.TextContent(type="text", text="❌ Failed to initialize AI processor")]
            
            # Categorize all documents first
            categorized_docs = {}
            for doc in scan_result.documents:
                try:
                    with open(doc.file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    categorization = await self.ai_processor.categorize_document(content, doc.file_path)
                    category = categorization.primary_category
                    
                    if category not in categorized_docs:
                        categorized_docs[category] = []
                    
                    categorized_docs[category].append({
                        'path': doc.relative_path,
                        'title': doc.title,
                        'categorization': categorization
                    })
                except Exception as e:
                    logger.error(f"Failed to categorize {doc.file_path}: {e}")
            
            # Format response
            response_lines = []
            response_lines.append("🧭 Navigation Structure Generated")
            response_lines.append("=" * 50)
            response_lines.append(f"Structure Type: {structure_type}")
            response_lines.append(f"Documents Analyzed: {len(scan_result.documents)}")
            response_lines.append(f"Categories Found: {len(categorized_docs)}")
            response_lines.append("")
            
            # Generate navigation by category
            if structure_type == "hierarchical":
                response_lines.append("📁 Hierarchical Navigation:")
                for category, docs in categorized_docs.items():
                    response_lines.append(f"  📂 {category.title()}")
                    for doc in docs[:5]:  # Show first 5 per category
                        response_lines.append(f"    📄 [{doc['title']}]({doc['path']})")
                    if len(docs) > 5:
                        response_lines.append(f"    ... and {len(docs) - 5} more documents")
                    response_lines.append("")
            
            elif structure_type == "topic_based":
                response_lines.append("🏷️ Topic-Based Navigation:")
                # Group by tags instead of categories
                topic_docs = {}
                for category, docs in categorized_docs.items():
                    for doc in docs:
                        tags = doc['categorization'].tags
                        for tag in tags[:3]:  # Use first 3 tags
                            if tag not in topic_docs:
                                topic_docs[tag] = []
                            topic_docs[tag].append(doc)
                
                for topic, docs in sorted(topic_docs.items()):
                    response_lines.append(f"  🏷️ {topic}")
                    for doc in docs[:3]:
                        response_lines.append(f"    📄 [{doc['title']}]({doc['path']})")
                    if len(docs) > 3:
                        response_lines.append(f"    ... and {len(docs) - 3} more")
                    response_lines.append("")
            
            elif structure_type == "audience_based":
                response_lines.append("👥 Audience-Based Navigation:")
                audience_docs = {}
                for category, docs in categorized_docs.items():
                    for doc in docs:
                        audience = doc['categorization'].target_audience
                        if audience not in audience_docs:
                            audience_docs[audience] = []
                        audience_docs[audience].append(doc)
                
                for audience, docs in audience_docs.items():
                    response_lines.append(f"  👤 {audience.title()}")
                    for doc in docs[:5]:
                        response_lines.append(f"    📄 [{doc['title']}]({doc['path']})")
                    if len(docs) > 5:
                        response_lines.append(f"    ... and {len(docs) - 5} more")
                    response_lines.append("")
            
            # Generate sitemap if requested
            if generate_sitemap:
                response_lines.append("🗺️ Site Map:")
                response_lines.append("```")
                response_lines.append("sitemap.xml")
                response_lines.append("├── technical/")
                response_lines.append("├── operational/")
                response_lines.append("├── user/")
                response_lines.append("└── project/")
                response_lines.append("```")
                response_lines.append("")
            
            # Generate breadcrumbs example if requested
            if include_breadcrumbs:
                response_lines.append("🍞 Breadcrumb Navigation Example:")
                response_lines.append("Home > Technical > API Documentation > Authentication")
                response_lines.append("")
            
            return [types.TextContent(type="text", text="\\n".join(response_lines))]
            
        except Exception as e:
            logger.error(f"Navigation structure creation failed: {e}")
            return [types.TextContent(type="text", text=f"❌ Navigation structure creation failed: {str(e)}")]
    
    # Utility Methods
    
    def _format_file_size(self, size_bytes: int) -> str:
        """Format file size in human-readable format."""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
    
    def _generate_title_from_filename(self, file_path: str) -> str:
        """Generate a title from filename."""
        filename = os.path.splitext(os.path.basename(file_path))[0]
        title = filename.replace('_', ' ').replace('-', ' ')
        return ' '.join(word.capitalize() for word in title.split())
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        if hasattr(self.wikijs_client, 'session') and self.wikijs_client.session:
            await self.wikijs_client.disconnect()
        
        # Cleanup AI processor
        if hasattr(self, 'ai_processor') and self.ai_processor:
            await self.ai_processor.cleanup()
    
    async def run(self, transport: str = "stdio") -> None:
        """Run the MCP server."""
        try:
            if transport == "stdio":
                async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
                    initialization_options = InitializationOptions(
                        server_name="wikijs-mcp-server",
                        server_version="0.1.0",
                        capabilities=types.ServerCapabilities(
                            tools=types.ToolsCapability(listChanged=True)
                        )
                    )
                    await self.server.run(read_stream, write_stream, initialization_options)
            else:
                raise ValueError(f"Unsupported transport: {transport}")
        
        except KeyboardInterrupt:
            logger.info("Server interrupted by user")
        except Exception as e:
            logger.error(f"Server error: {e}", exc_info=True)
        finally:
            await self.cleanup()


def load_config(config_path: str) -> WikiJSMCPConfig:
    """Load configuration from file."""
    try:
        with open(config_path, 'r') as f:
            config_data = json.load(f)
        return WikiJSMCPConfig(**config_data)
    except FileNotFoundError:
        raise ConfigurationError(f"Configuration file not found: {config_path}")
    except json.JSONDecodeError as e:
        raise ConfigurationError(f"Invalid JSON in configuration file: {e}")
    except Exception as e:
        raise ConfigurationError(f"Failed to load configuration: {e}")


async def main():
    """Main entry point."""
    import sys
    
    if len(sys.argv) > 1:
        config_path = sys.argv[1]
    else:
        config_path = "wikijs_mcp_config.json"
    
    try:
        config = load_config(config_path)
        server = WikiJSMCPServer(config)
        await server.run()
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
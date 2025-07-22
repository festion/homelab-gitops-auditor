"""Configuration models for WikiJS MCP Server."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, HttpUrl
import json


class WikiJSConfig(BaseModel):
    """Configuration for WikiJS connection."""
    
    url: HttpUrl = Field(..., description="WikiJS instance URL")
    api_key: str = Field(..., description="WikiJS API key")
    default_locale: str = Field(default="en", description="Default locale for pages")
    default_editor: str = Field(default="markdown", description="Default editor type")
    default_tags: List[str] = Field(default_factory=list, description="Default tags for new pages")
    timeout: int = Field(default=30, description="API request timeout in seconds")
    retry_attempts: int = Field(default=3, description="Number of retry attempts for failed requests")


class DocumentDiscoveryConfig(BaseModel):
    """Configuration for document discovery and scanning."""
    
    search_paths: List[str] = Field(default_factory=list, description="Base paths to search for documents")
    include_patterns: List[str] = Field(default_factory=lambda: ["*.md"], description="File patterns to include")
    exclude_patterns: List[str] = Field(
        default_factory=lambda: ["node_modules/**", ".git/**", "**/.git/**", "**/node_modules/**"],
        description="File patterns to exclude"
    )
    max_file_size: str = Field(default="10MB", description="Maximum file size to process")
    max_files_per_scan: int = Field(default=1000, description="Maximum files to process in single scan")
    follow_symlinks: bool = Field(default=False, description="Whether to follow symbolic links")
    extract_frontmatter: bool = Field(default=True, description="Extract YAML frontmatter from documents")
    extract_links: bool = Field(default=True, description="Extract internal and external links")


class SecurityConfig(BaseModel):
    """Security configuration for file operations."""
    
    allowed_paths: List[str] = Field(default_factory=list, description="Allowed base paths for file operations")
    forbidden_patterns: List[str] = Field(
        default_factory=lambda: ["*.private.*", "secret*", "password*", "*.key", "*.pem"],
        description="Patterns for files that should never be processed"
    )
    max_files_per_operation: int = Field(default=100, description="Maximum files per bulk operation")
    require_path_validation: bool = Field(default=True, description="Require all paths to be validated")
    allow_hidden_files: bool = Field(default=False, description="Allow processing hidden files (starting with .)")
    content_filters: List[str] = Field(
        default_factory=lambda: [
            r"(?i)(password|secret|api[_-]?key|token)\s*[:=]\s*[^\s]+",
            r"-----BEGIN [A-Z ]+-----"
        ],
        description="Regex patterns to detect sensitive content"
    )


class WikiJSPageConfig(BaseModel):
    """Configuration for WikiJS page creation and updates."""
    
    default_title_transform: str = Field(default="title_case", description="How to transform filenames to titles")
    preserve_directory_structure: bool = Field(default=True, description="Preserve directory structure in wiki paths")
    update_existing_pages: bool = Field(default=False, description="Whether to update existing pages")
    conflict_resolution: str = Field(default="skip", description="How to handle existing pages")
    auto_generate_tags: bool = Field(default=True, description="Automatically generate tags from content")
    include_metadata: bool = Field(default=True, description="Include file metadata in page properties")


class WikiJSMCPConfig(BaseModel):
    """Main configuration for WikiJS MCP Server."""
    
    wikijs: WikiJSConfig = Field(..., description="WikiJS connection configuration")
    document_discovery: DocumentDiscoveryConfig = Field(
        default_factory=DocumentDiscoveryConfig,
        description="Document discovery settings"
    )
    security: SecurityConfig = Field(
        default_factory=SecurityConfig,
        description="Security and validation settings"
    )
    page_config: WikiJSPageConfig = Field(
        default_factory=WikiJSPageConfig,
        description="Page creation and update settings"
    )
    logging_level: str = Field(default="INFO", description="Logging level")
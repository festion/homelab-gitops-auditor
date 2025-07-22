"""
Document discovery and scanning functionality for WikiJS MCP Server.
"""

import os
import re
import glob
import yaml
import fnmatch
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from .config import DocumentDiscoveryConfig, SecurityConfig
from .exceptions import DocumentError, SecurityError


logger = logging.getLogger(__name__)


@dataclass
class DocumentMetadata:
    """Metadata extracted from a document."""
    
    file_path: str
    relative_path: str = ""
    title: str = ""
    size: int = 0
    modified_time: Optional[datetime] = None
    created_time: Optional[datetime] = None
    frontmatter: Dict[str, Any] = field(default_factory=dict)
    links: List[str] = field(default_factory=list)
    images: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    content_preview: str = ""
    content_hash: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'file_path': self.file_path,
            'relative_path': self.relative_path,
            'title': self.title,
            'size': self.size,
            'modified_time': self.modified_time.isoformat() if self.modified_time else None,
            'created_time': self.created_time.isoformat() if self.created_time else None,
            'frontmatter': self.frontmatter,
            'links': self.links,
            'images': self.images,
            'tags': self.tags,
            'content_preview': self.content_preview,
            'content_hash': self.content_hash
        }


@dataclass
class ScanResult:
    """Result of a document scan operation."""
    
    documents: List[DocumentMetadata] = field(default_factory=list)
    total_files_found: int = 0
    total_files_processed: int = 0
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    scan_duration: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'documents': [doc.to_dict() for doc in self.documents],
            'total_files_found': self.total_files_found,
            'total_files_processed': self.total_files_processed,
            'errors': self.errors,
            'warnings': self.warnings,
            'scan_duration': self.scan_duration
        }


class DocumentScanner:
    """Scanner for finding and analyzing Markdown documents."""
    
    def __init__(self, config: DocumentDiscoveryConfig, security_config: SecurityConfig):
        self.config = config
        self.security_config = security_config
        self._setup_logging()
    
    def _setup_logging(self) -> None:
        """Setup logging for the scanner."""
        # Logging setup is handled by the main server
        pass
    
    def find_documents(
        self,
        search_path: str,
        recursive: bool = True,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None
    ) -> ScanResult:
        """
        Find Markdown documents in the specified path.
        
        Args:
            search_path: Directory path to search
            recursive: Whether to search subdirectories
            include_patterns: File patterns to include (overrides config)
            exclude_patterns: File patterns to exclude (overrides config)
            
        Returns:
            ScanResult with found documents and metadata
        """
        start_time = datetime.now()
        result = ScanResult()
        
        try:
            # Validate search path
            self._validate_search_path(search_path)
            
            # Use provided patterns or config defaults
            include_patterns = include_patterns or self.config.include_patterns
            exclude_patterns = exclude_patterns or self.config.exclude_patterns
            
            # Find all matching files
            found_files = self._find_files(search_path, recursive, include_patterns, exclude_patterns)
            result.total_files_found = len(found_files)
            
            # Process each file
            for file_path in found_files:
                if len(result.documents) >= self.config.max_files_per_scan:
                    result.warnings.append(f"Stopped scanning after {self.config.max_files_per_scan} files")
                    break
                
                try:
                    if self._should_process_file(file_path):
                        doc_metadata = self._analyze_document(file_path, search_path)
                        result.documents.append(doc_metadata)
                        result.total_files_processed += 1
                    else:
                        result.warnings.append(f"Skipped file (security): {file_path}")
                
                except Exception as e:
                    error_msg = f"Error processing {file_path}: {str(e)}"
                    result.errors.append(error_msg)
                    logger.error(error_msg, exc_info=True)
            
            # Calculate scan duration
            end_time = datetime.now()
            result.scan_duration = (end_time - start_time).total_seconds()
            
            logger.info(f"Scan completed: {result.total_files_processed}/{result.total_files_found} files processed")
            
        except Exception as e:
            error_msg = f"Scan failed: {str(e)}"
            result.errors.append(error_msg)
            logger.error(error_msg, exc_info=True)
        
        return result
    
    def analyze_single_document(self, file_path: str) -> DocumentMetadata:
        """
        Analyze a single document and return its metadata.
        
        Args:
            file_path: Path to the document to analyze
            
        Returns:
            DocumentMetadata object with extracted information
        """
        # Validate file path
        self._validate_file_path(file_path)
        
        if not self._should_process_file(file_path):
            raise SecurityError(f"File not allowed for processing: {file_path}")
        
        return self._analyze_document(file_path)
    
    def _validate_search_path(self, search_path: str) -> None:
        """Validate that search path is allowed."""
        abs_search_path = os.path.abspath(os.path.expanduser(search_path))
        
        if not os.path.exists(abs_search_path):
            raise DocumentError(f"Search path does not exist: {search_path}")
        
        if not os.path.isdir(abs_search_path):
            raise DocumentError(f"Search path is not a directory: {search_path}")
        
        # Check against allowed paths
        if self.security_config.require_path_validation and self.security_config.allowed_paths:
            allowed = False
            for allowed_path in self.security_config.allowed_paths:
                if abs_search_path.startswith(allowed_path):
                    allowed = True
                    break
            
            if not allowed:
                raise SecurityError(f"Search path not in allowed paths: {search_path}")
    
    def _validate_file_path(self, file_path: str) -> None:
        """Validate that file path is allowed."""
        abs_file_path = os.path.abspath(os.path.expanduser(file_path))
        
        if not os.path.exists(abs_file_path):
            raise DocumentError(f"File does not exist: {file_path}")
        
        if not os.path.isfile(abs_file_path):
            raise DocumentError(f"Path is not a file: {file_path}")
        
        # Check against allowed paths
        if self.security_config.require_path_validation and self.security_config.allowed_paths:
            allowed = False
            for allowed_path in self.security_config.allowed_paths:
                if abs_file_path.startswith(allowed_path):
                    allowed = True
                    break
            
            if not allowed:
                raise SecurityError(f"File path not in allowed paths: {file_path}")
    
    def _find_files(
        self,
        search_path: str,
        recursive: bool,
        include_patterns: List[str],
        exclude_patterns: List[str]
    ) -> List[str]:
        """Find all files matching the patterns."""
        found_files = []
        search_path = os.path.abspath(os.path.expanduser(search_path))
        
        if recursive:
            # Use os.walk for recursive search
            for root, dirs, files in os.walk(search_path, followlinks=self.config.follow_symlinks):
                # Filter directories based on exclude patterns
                dirs[:] = [d for d in dirs if not self._matches_exclude_patterns(
                    os.path.join(root, d), exclude_patterns
                )]
                
                for file in files:
                    file_path = os.path.join(root, file)
                    if self._should_include_file(file_path, include_patterns, exclude_patterns):
                        found_files.append(file_path)
        else:
            # Non-recursive search
            try:
                for item in os.listdir(search_path):
                    item_path = os.path.join(search_path, item)
                    if os.path.isfile(item_path):
                        if self._should_include_file(item_path, include_patterns, exclude_patterns):
                            found_files.append(item_path)
            except PermissionError as e:
                raise DocumentError(f"Permission denied accessing directory: {search_path}")
        
        return found_files
    
    def _should_include_file(
        self,
        file_path: str,
        include_patterns: List[str],
        exclude_patterns: List[str]
    ) -> bool:
        """Check if file should be included based on patterns."""
        file_name = os.path.basename(file_path)
        
        # Check exclude patterns first
        if self._matches_exclude_patterns(file_path, exclude_patterns):
            return False
        
        # Check include patterns
        for pattern in include_patterns:
            if fnmatch.fnmatch(file_name, pattern) or fnmatch.fnmatch(file_path, pattern):
                return True
        
        return False
    
    def _matches_exclude_patterns(self, file_path: str, exclude_patterns: List[str]) -> bool:
        """Check if file matches any exclude pattern."""
        for pattern in exclude_patterns:
            if fnmatch.fnmatch(file_path, pattern) or fnmatch.fnmatch(os.path.basename(file_path), pattern):
                return True
        return False
    
    def _should_process_file(self, file_path: str) -> bool:
        """Check if file should be processed based on security rules."""
        file_name = os.path.basename(file_path)
        
        # Check hidden files
        if not self.security_config.allow_hidden_files and file_name.startswith('.'):
            return False
        
        # Check forbidden patterns
        for pattern in self.security_config.forbidden_patterns:
            if fnmatch.fnmatch(file_name, pattern) or fnmatch.fnmatch(file_path, pattern):
                return False
        
        # Check file size
        try:
            file_size = os.path.getsize(file_path)
            max_size_bytes = self._parse_size_string(self.config.max_file_size)
            if file_size > max_size_bytes:
                logger.warning(f"File too large: {file_path} ({file_size} bytes)")
                return False
        except OSError:
            return False
        
        return True
    
    def _parse_size_string(self, size_str: str) -> int:
        """Parse size string like '10MB' into bytes."""
        import re
        
        # Handle direct integer strings
        if size_str.isdigit():
            return int(size_str)
        
        # Parse size with units
        match = re.match(r'^(\d+(?:\.\d+)?)\s*([KMGT]?B)?$', size_str.upper().strip())
        if not match:
            # Fallback to 10MB if parsing fails
            return 10 * 1024 * 1024
        
        size_value = float(match.group(1))
        unit = match.group(2) or 'B'
        
        multipliers = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 ** 2,
            'GB': 1024 ** 3,
            'TB': 1024 ** 4
        }
        
        return int(size_value * multipliers.get(unit, 1))
    
    def _analyze_document(self, file_path: str, base_path: str = None) -> DocumentMetadata:
        """Analyze a document and extract metadata."""
        import hashlib
        
        metadata = DocumentMetadata(file_path=file_path)
        
        try:
            # Basic file info
            stat_info = os.stat(file_path)
            metadata.size = stat_info.st_size
            metadata.modified_time = datetime.fromtimestamp(stat_info.st_mtime)
            metadata.created_time = datetime.fromtimestamp(stat_info.st_ctime)
            
            # Calculate relative path
            if base_path:
                try:
                    metadata.relative_path = os.path.relpath(file_path, base_path)
                except ValueError:
                    metadata.relative_path = os.path.basename(file_path)
            else:
                metadata.relative_path = os.path.basename(file_path)
            
            # Read content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Calculate content hash
            metadata.content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            
            # Extract frontmatter
            if self.config.extract_frontmatter:
                content, frontmatter = self._extract_frontmatter(content)
                metadata.frontmatter = frontmatter
                
                # Use frontmatter title if available
                if 'title' in frontmatter:
                    metadata.title = str(frontmatter['title'])
                if 'tags' in frontmatter and isinstance(frontmatter['tags'], list):
                    metadata.tags = [str(tag) for tag in frontmatter['tags']]
            
            # Generate title from filename if not set
            if not metadata.title:
                metadata.title = self._generate_title_from_filename(file_path)
            
            # Extract links and images
            if self.config.extract_links:
                metadata.links = self._extract_links(content)
                metadata.images = self._extract_images(content)
            
            # Create content preview
            metadata.content_preview = self._create_content_preview(content)
            
            # Check for sensitive content
            self._validate_content_security(content, file_path)
            
        except Exception as e:
            raise DocumentError(f"Failed to analyze document {file_path}: {str(e)}")
        
        return metadata
    
    def _extract_frontmatter(self, content: str) -> Tuple[str, Dict[str, Any]]:
        """Extract YAML frontmatter from document content."""
        frontmatter = {}
        
        if content.startswith('---\n'):
            try:
                # Find the end of frontmatter
                end_marker = content.find('\n---\n', 4)
                if end_marker > 0:
                    frontmatter_text = content[4:end_marker]
                    content = content[end_marker + 5:]  # Remove frontmatter and marker
                    
                    # Parse YAML
                    frontmatter = yaml.safe_load(frontmatter_text) or {}
            except yaml.YAMLError as e:
                logger.warning(f"Failed to parse frontmatter: {e}")
        
        return content, frontmatter
    
    def _extract_links(self, content: str) -> List[str]:
        """Extract markdown links from content."""
        # Match markdown links: [text](url)
        link_pattern = r'\[([^\]]+)\]\(([^\)]+)\)'
        links = re.findall(link_pattern, content)
        return [url for text, url in links]
    
    def _extract_images(self, content: str) -> List[str]:
        """Extract markdown images from content."""
        # Match markdown images: ![alt](src)
        image_pattern = r'!\[([^\]]*)\]\(([^\)]+)\)'
        images = re.findall(image_pattern, content)
        return [src for alt, src in images]
    
    def _create_content_preview(self, content: str, max_length: int = 200) -> str:
        """Create a preview of the content."""
        # Remove markdown formatting for preview
        preview = re.sub(r'[#*`_\[\]()]', '', content)
        preview = re.sub(r'\n+', ' ', preview)
        preview = preview.strip()
        
        if len(preview) > max_length:
            preview = preview[:max_length] + '...'
        
        return preview
    
    def _generate_title_from_filename(self, file_path: str) -> str:
        """Generate a title from the filename."""
        filename = os.path.splitext(os.path.basename(file_path))[0]
        
        # Replace underscores and hyphens with spaces
        title = filename.replace('_', ' ').replace('-', ' ')
        
        # Title case
        title = ' '.join(word.capitalize() for word in title.split())
        
        return title
    
    def _validate_content_security(self, content: str, file_path: str) -> None:
        """Validate content doesn't contain sensitive information."""
        for pattern in self.security_config.content_filters:
            if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
                raise SecurityError(f"Document contains sensitive content: {file_path}")
    
    def get_file_stats(self, search_path: str) -> Dict[str, Any]:
        """Get statistics about files in a directory."""
        stats = {
            'total_files': 0,
            'markdown_files': 0,
            'total_size': 0,
            'file_types': {},
            'largest_file': {'path': '', 'size': 0},
            'newest_file': {'path': '', 'modified': None}
        }
        
        try:
            self._validate_search_path(search_path)
            
            for root, dirs, files in os.walk(search_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    try:
                        stat_info = os.stat(file_path)
                        file_size = stat_info.st_size
                        modified_time = datetime.fromtimestamp(stat_info.st_mtime)
                        
                        stats['total_files'] += 1
                        stats['total_size'] += file_size
                        
                        # Track file types
                        ext = os.path.splitext(file)[1].lower()
                        stats['file_types'][ext] = stats['file_types'].get(ext, 0) + 1
                        
                        # Check for markdown files
                        if ext in ['.md', '.markdown']:
                            stats['markdown_files'] += 1
                        
                        # Track largest file
                        if file_size > stats['largest_file']['size']:
                            stats['largest_file'] = {'path': file_path, 'size': file_size}
                        
                        # Track newest file
                        if (stats['newest_file']['modified'] is None or 
                            modified_time > stats['newest_file']['modified']):
                            stats['newest_file'] = {'path': file_path, 'modified': modified_time}
                    
                    except OSError:
                        continue  # Skip files we can't access
        
        except Exception as e:
            logger.error(f"Error gathering file stats: {e}")
        
        return stats
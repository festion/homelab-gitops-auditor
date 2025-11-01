"""
Security validation for WikiJS MCP Server.
"""

import os
import re
import logging
from pathlib import Path
from typing import List, Dict, Any

from .config import SecurityConfig
from .exceptions import SecurityError, ValidationError


logger = logging.getLogger(__name__)


class SecurityValidator:
    """Security validation for file operations and content."""
    
    def __init__(self, config: SecurityConfig):
        self.config = config
        self._compiled_patterns = {
            'forbidden': [re.compile(pattern, re.IGNORECASE) for pattern in config.forbidden_patterns],
            'content_filters': [re.compile(pattern, re.IGNORECASE | re.MULTILINE) 
                              for pattern in config.content_filters]
        }
    
    def validate_file_path(self, file_path: str) -> str:
        """
        Validate and normalize a file path for security.
        
        Args:
            file_path: The file path to validate
            
        Returns:
            Normalized absolute path
            
        Raises:
            SecurityError: If path is not allowed
        """
        # Normalize and resolve the path
        normalized_path = os.path.abspath(os.path.expanduser(file_path))
        
        # Check if file exists
        if not os.path.exists(normalized_path):
            raise ValidationError(f"File does not exist: {file_path}")
        
        # Check against allowed paths
        if self.config.require_path_validation and self.config.allowed_paths:
            if not self._is_path_allowed(normalized_path):
                raise SecurityError(f"Path not in allowed directories: {file_path}")
        
        # Check for forbidden patterns
        if self._matches_forbidden_pattern(normalized_path):
            raise SecurityError(f"Path matches forbidden pattern: {file_path}")
        
        # Check for hidden files if not allowed
        if not self.config.allow_hidden_files:
            if any(part.startswith('.') for part in Path(normalized_path).parts):
                raise SecurityError(f"Hidden files not allowed: {file_path}")
        
        # Additional security checks
        self._check_symlink_security(normalized_path)
        
        return normalized_path
    
    def validate_directory_path(self, dir_path: str) -> str:
        """
        Validate a directory path for security.
        
        Args:
            dir_path: The directory path to validate
            
        Returns:
            Normalized absolute path
            
        Raises:
            SecurityError: If path is not allowed
        """
        # Normalize and resolve the path
        normalized_path = os.path.abspath(os.path.expanduser(dir_path))
        
        # Check if directory exists
        if not os.path.exists(normalized_path):
            raise ValidationError(f"Directory does not exist: {dir_path}")
        
        if not os.path.isdir(normalized_path):
            raise ValidationError(f"Path is not a directory: {dir_path}")
        
        # Check against allowed paths
        if self.config.require_path_validation and self.config.allowed_paths:
            if not self._is_path_allowed(normalized_path):
                raise SecurityError(f"Directory not in allowed paths: {dir_path}")
        
        return normalized_path
    
    def validate_operation_count(self, count: int, operation_type: str = "operation") -> None:
        """
        Validate that operation count doesn't exceed limits.
        
        Args:
            count: Number of operations/files
            operation_type: Type of operation for error messages
            
        Raises:
            SecurityError: If count exceeds limits
        """
        if count > self.config.max_files_per_operation:
            raise SecurityError(
                f"Too many files for {operation_type}: {count} > {self.config.max_files_per_operation}"
            )
    
    def validate_content_security(self, content: str, file_path: str = "") -> None:
        """
        Validate content doesn't contain sensitive information.
        
        Args:
            content: Content to validate
            file_path: File path for error messages
            
        Raises:
            SecurityError: If content contains sensitive patterns
        """
        for i, pattern in enumerate(self._compiled_patterns['content_filters']):
            if pattern.search(content):
                raise SecurityError(
                    f"Content contains sensitive information (filter {i+1}): {file_path}"
                )
    
    def validate_wiki_path(self, wiki_path: str) -> str:
        """
        Validate and normalize a WikiJS path.
        
        Args:
            wiki_path: WikiJS page path to validate
            
        Returns:
            Normalized wiki path
            
        Raises:
            ValidationError: If path format is invalid
        """
        # Remove leading/trailing slashes
        normalized_path = wiki_path.strip('/')
        
        # Validate path format
        if not normalized_path:
            raise ValidationError("Wiki path cannot be empty")
        
        # Check for invalid characters
        invalid_chars = ['<', '>', ':', '"', '|', '?', '*', '\\']
        for char in invalid_chars:
            if char in normalized_path:
                raise ValidationError(f"Wiki path contains invalid character '{char}': {wiki_path}")
        
        # Check path length
        if len(normalized_path) > 255:
            raise ValidationError(f"Wiki path too long (max 255 characters): {wiki_path}")
        
        # Validate path segments
        segments = normalized_path.split('/')
        for segment in segments:
            if not segment.strip():
                raise ValidationError(f"Wiki path contains empty segment: {wiki_path}")
            
            # Check for reserved names (common filesystem reserved names)
            reserved_names = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 
                            'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 
                            'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']
            if segment.lower() in reserved_names:
                raise ValidationError(f"Wiki path contains reserved name '{segment}': {wiki_path}")
        
        return normalized_path
    
    def validate_file_size(self, size: int, max_size: int = None) -> None:
        """
        Validate file size doesn't exceed limits.
        
        Args:
            size: File size in bytes
            max_size: Maximum allowed size (uses config default if None)
            
        Raises:
            ValidationError: If file is too large
        """
        # This would need to be implemented based on the config
        # For now, just check against a reasonable default
        max_allowed = max_size or (10 * 1024 * 1024)  # 10MB default
        
        if size > max_allowed:
            size_mb = size / (1024 * 1024)
            max_mb = max_allowed / (1024 * 1024)
            raise ValidationError(f"File too large: {size_mb:.1f}MB > {max_mb:.1f}MB")
    
    def _is_path_allowed(self, path: str) -> bool:
        """Check if path is within allowed directories."""
        path = os.path.abspath(path)
        
        for allowed_path in self.config.allowed_paths:
            allowed_path = os.path.abspath(allowed_path)
            
            # Check if path is within or equal to allowed path
            try:
                os.path.relpath(path, allowed_path)
                if path.startswith(allowed_path):
                    return True
            except ValueError:
                # Different drives on Windows
                continue
        
        return False
    
    def _matches_forbidden_pattern(self, path: str) -> bool:
        """Check if path matches any forbidden pattern."""
        filename = os.path.basename(path)
        
        for pattern in self._compiled_patterns['forbidden']:
            if pattern.search(filename) or pattern.search(path):
                return True
        
        return False
    
    def _check_symlink_security(self, path: str) -> None:
        """Check for symlink security issues."""
        if os.path.islink(path):
            # Resolve the symlink and check if target is allowed
            try:
                real_path = os.path.realpath(path)
                if self.config.require_path_validation and self.config.allowed_paths:
                    if not self._is_path_allowed(real_path):
                        raise SecurityError(f"Symlink target not in allowed paths: {path} -> {real_path}")
            except OSError:
                raise SecurityError(f"Cannot resolve symlink: {path}")
    
    def get_validation_summary(self) -> str:
        """Get a summary of current security settings."""
        summary_lines = []
        summary_lines.append("Security Validation Settings:")
        summary_lines.append(f"  Path validation required: {self.config.require_path_validation}")
        summary_lines.append(f"  Hidden files allowed: {self.config.allow_hidden_files}")
        summary_lines.append(f"  Max files per operation: {self.config.max_files_per_operation}")
        
        if self.config.allowed_paths:
            summary_lines.append(f"  Allowed paths: {len(self.config.allowed_paths)}")
            for path in self.config.allowed_paths[:3]:  # Show first 3
                summary_lines.append(f"    - {path}")
            if len(self.config.allowed_paths) > 3:
                summary_lines.append(f"    ... and {len(self.config.allowed_paths) - 3} more")
        
        summary_lines.append(f"  Forbidden patterns: {len(self.config.forbidden_patterns)}")
        summary_lines.append(f"  Content filters: {len(self.config.content_filters)}")
        
        return "\n".join(summary_lines)
    
    def check_bulk_operation_security(
        self,
        file_paths: List[str],
        operation_type: str = "bulk operation"
    ) -> List[str]:
        """
        Validate multiple file paths for bulk operations.
        
        Args:
            file_paths: List of file paths to validate
            operation_type: Type of operation for error messages
            
        Returns:
            List of validated normalized paths
            
        Raises:
            SecurityError: If any validation fails
        """
        # Check operation count
        self.validate_operation_count(len(file_paths), operation_type)
        
        validated_paths = []
        errors = []
        
        for file_path in file_paths:
            try:
                validated_path = self.validate_file_path(file_path)
                validated_paths.append(validated_path)
            except (SecurityError, ValidationError) as e:
                errors.append(f"{file_path}: {str(e)}")
        
        if errors:
            raise SecurityError(f"Validation failed for {operation_type}:\n" + "\n".join(errors))
        
        return validated_paths
    
    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitize a filename for safe use.
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove or replace invalid characters
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
        
        # Remove leading/trailing dots and spaces
        sanitized = sanitized.strip('. ')
        
        # Ensure not empty
        if not sanitized:
            sanitized = "untitled"
        
        # Limit length
        if len(sanitized) > 255:
            name, ext = os.path.splitext(sanitized)
            max_name_len = 255 - len(ext)
            sanitized = name[:max_name_len] + ext
        
        return sanitized
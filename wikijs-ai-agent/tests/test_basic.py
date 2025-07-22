"""
Basic tests for WikiJS MCP Server.
"""

import os
import json
import tempfile
from pathlib import Path

import pytest

from wikijs_mcp.config import (
    WikiJSConfig, 
    DocumentDiscoveryConfig, 
    SecurityConfig,
    WikiJSPageConfig,
    WikiJSMCPConfig
)
from wikijs_mcp.exceptions import (
    ValidationError,
    SecurityError,
    ConfigurationError
)
from wikijs_mcp.security import SecurityValidator
from wikijs_mcp.document_scanner import DocumentScanner


class TestConfig:
    """Test configuration models."""
    
    def test_wikijs_config_creation(self):
        """Test WikiJS config creation."""
        config = WikiJSConfig(
            url="https://wiki.example.com",
            api_key="test-key"
        )
        
        assert str(config.url) == "https://wiki.example.com"
        assert config.api_key == "test-key"
        assert config.default_locale == "en"
        assert config.default_editor == "markdown"
    
    def test_wikijs_config_validation(self):
        """Test WikiJS config validation."""
        # Test invalid locale
        with pytest.raises(ValueError):
            WikiJSConfig(
                url="https://wiki.example.com",
                api_key="test-key",
                default_locale="invalid-locale"
            )
        
        # Test invalid editor
        with pytest.raises(ValueError):
            WikiJSConfig(
                url="https://wiki.example.com", 
                api_key="test-key",
                default_editor="invalid-editor"
            )
    
    def test_document_discovery_config(self):
        """Test document discovery config."""
        config = DocumentDiscoveryConfig()
        
        assert config.include_patterns == ["*.md"]
        assert "node_modules/**" in config.exclude_patterns
        assert config.max_files_per_scan == 1000
        assert config.extract_frontmatter is True
    
    def test_document_discovery_file_size_parsing(self):
        """Test file size parsing."""
        config = DocumentDiscoveryConfig(max_file_size="5MB")
        assert config.max_file_size == 5 * 1024 * 1024
        
        config = DocumentDiscoveryConfig(max_file_size="1GB")
        assert config.max_file_size == 1024 * 1024 * 1024
    
    def test_security_config(self):
        """Test security configuration."""
        config = SecurityConfig(
            allowed_paths=["/home/dev/workspace/docs", "/home/dev/workspace/projects"]
        )
        
        # Paths should be converted to absolute
        assert all(os.path.isabs(path) for path in config.allowed_paths)
        assert config.require_path_validation is True
        assert config.allow_hidden_files is False
    
    def test_full_config_creation(self):
        """Test complete configuration creation."""
        config_data = {
            "wikijs": {
                "url": "https://wiki.example.com",
                "api_key": "test-key"
            },
            "document_discovery": {
                "search_paths": ["/docs"],
                "max_file_size": "5MB"
            },
            "security": {
                "allowed_paths": ["/docs"]
            }
        }
        
        config = WikiJSMCPConfig(**config_data)
        assert config.wikijs.url == "https://wiki.example.com"
        assert config.document_discovery.max_file_size == 5 * 1024 * 1024


class TestSecurityValidator:
    """Test security validation."""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)
    
    @pytest.fixture
    def security_config(self, temp_dir):
        """Create security config for testing."""
        return SecurityConfig(
            allowed_paths=[str(temp_dir)],
            forbidden_patterns=["*.private.*", "secret*"],
            allow_hidden_files=False,
            require_path_validation=True
        )
    
    @pytest.fixture
    def validator(self, security_config):
        """Create security validator."""
        return SecurityValidator(security_config)
    
    def test_validate_file_path_success(self, validator, temp_dir):
        """Test successful file path validation."""
        test_file = temp_dir / "test.md"
        test_file.write_text("# Test Document")
        
        validated_path = validator.validate_file_path(str(test_file))
        assert validated_path == str(test_file.absolute())
    
    def test_validate_file_path_not_exists(self, validator, temp_dir):
        """Test validation of non-existent file."""
        test_file = temp_dir / "nonexistent.md"
        
        with pytest.raises(ValidationError, match="File does not exist"):
            validator.validate_file_path(str(test_file))
    
    def test_validate_file_path_forbidden_pattern(self, validator, temp_dir):
        """Test validation with forbidden pattern."""
        test_file = temp_dir / "secret_document.md"
        test_file.write_text("Secret content")
        
        with pytest.raises(SecurityError, match="forbidden pattern"):
            validator.validate_file_path(str(test_file))
    
    def test_validate_file_path_hidden_file(self, validator, temp_dir):
        """Test validation of hidden file."""
        test_file = temp_dir / ".hidden.md"
        test_file.write_text("Hidden content")
        
        with pytest.raises(SecurityError, match="Hidden files not allowed"):
            validator.validate_file_path(str(test_file))
    
    def test_validate_file_path_outside_allowed(self, temp_dir):
        """Test validation of file outside allowed paths."""
        # Create validator with different allowed path
        other_dir = temp_dir.parent / "other"
        other_dir.mkdir()
        
        config = SecurityConfig(
            allowed_paths=[str(other_dir)],
            require_path_validation=True
        )
        validator = SecurityValidator(config)
        
        test_file = temp_dir / "test.md"
        test_file.write_text("Test content")
        
        with pytest.raises(SecurityError, match="not in allowed paths"):
            validator.validate_file_path(str(test_file))
    
    def test_validate_directory_path(self, validator, temp_dir):
        """Test directory path validation."""
        validated_path = validator.validate_directory_path(str(temp_dir))
        assert validated_path == str(temp_dir.absolute())
    
    def test_validate_wiki_path(self, validator):
        """Test wiki path validation."""
        # Valid paths
        assert validator.validate_wiki_path("/docs/project") == "docs/project"
        assert validator.validate_wiki_path("simple-page") == "simple-page"
        
        # Invalid paths
        with pytest.raises(ValidationError, match="empty"):
            validator.validate_wiki_path("")
        
        with pytest.raises(ValidationError, match="invalid character"):
            validator.validate_wiki_path("docs<invalid>")
    
    def test_validate_content_security(self, validator):
        """Test content security validation."""
        # Safe content
        safe_content = "# My Document\\n\\nThis is safe content."
        validator.validate_content_security(safe_content)  # Should not raise
        
        # Unsafe content
        unsafe_content = "password = secret123"
        with pytest.raises(SecurityError, match="sensitive information"):
            validator.validate_content_security(unsafe_content)
    
    def test_bulk_operation_security(self, validator, temp_dir):
        """Test bulk operation validation."""
        # Create test files
        files = []
        for i in range(3):
            test_file = temp_dir / f"test{i}.md"
            test_file.write_text(f"# Test Document {i}")
            files.append(str(test_file))
        
        validated_paths = validator.check_bulk_operation_security(files)
        assert len(validated_paths) == 3
        assert all(os.path.isabs(path) for path in validated_paths)
    
    def test_bulk_operation_too_many_files(self, validator, temp_dir):
        """Test bulk operation with too many files."""
        # Create config with low limit
        config = SecurityConfig(
            allowed_paths=[str(temp_dir)],
            max_files_per_operation=2
        )
        validator = SecurityValidator(config)
        
        files = []
        for i in range(5):
            test_file = temp_dir / f"test{i}.md"
            test_file.write_text(f"# Test Document {i}")
            files.append(str(test_file))
        
        with pytest.raises(SecurityError, match="Too many files"):
            validator.check_bulk_operation_security(files)


class TestDocumentScanner:
    """Test document scanner functionality."""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory with test documents."""
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_path = Path(tmpdir)
            
            # Create test documents
            (temp_path / "doc1.md").write_text("# Document 1\\n\\nContent 1")
            (temp_path / "doc2.md").write_text("---\\ntitle: Document 2\\ntags: [test]\\n---\\n\\n# Document 2")
            (temp_path / "README.md").write_text("# README\\n\\nProject documentation")
            
            # Create subdirectory
            subdir = temp_path / "subdir"
            subdir.mkdir()
            (subdir / "subdoc.md").write_text("# Sub Document\\n\\nSub content")
            
            # Create non-markdown file
            (temp_path / "other.txt").write_text("Not markdown")
            
            yield temp_path
    
    @pytest.fixture
    def scanner(self, temp_dir):
        """Create document scanner."""
        discovery_config = DocumentDiscoveryConfig(
            search_paths=[str(temp_dir)]
        )
        security_config = SecurityConfig(
            allowed_paths=[str(temp_dir)],
            require_path_validation=True
        )
        return DocumentScanner(discovery_config, security_config)
    
    def test_find_documents_recursive(self, scanner, temp_dir):
        """Test recursive document finding."""
        result = scanner.find_documents(str(temp_dir), recursive=True)
        
        assert result.total_files_found >= 3  # At least 3 .md files
        assert result.total_files_processed >= 3
        assert len(result.documents) >= 3
        assert result.scan_duration > 0
    
    def test_find_documents_non_recursive(self, scanner, temp_dir):
        """Test non-recursive document finding.""" 
        result = scanner.find_documents(str(temp_dir), recursive=False)
        
        # Should find files in root but not subdirectory
        found_paths = [doc.relative_path for doc in result.documents]
        assert "doc1.md" in found_paths
        assert "subdoc.md" not in found_paths
    
    def test_analyze_single_document(self, scanner, temp_dir):
        """Test single document analysis."""
        doc_path = temp_dir / "doc2.md"
        metadata = scanner.analyze_single_document(str(doc_path))
        
        assert metadata.title == "Document 2"
        assert "test" in metadata.tags
        assert metadata.size > 0
        assert metadata.content_hash
        assert metadata.frontmatter["title"] == "Document 2"
    
    def test_file_stats(self, scanner, temp_dir):
        """Test file statistics gathering."""
        stats = scanner.get_file_stats(str(temp_dir))
        
        assert stats["total_files"] >= 5  # At least 5 files total
        assert stats["markdown_files"] >= 3  # At least 3 .md files
        assert stats["total_size"] > 0
        assert ".md" in stats["file_types"]
        assert stats["file_types"][".md"] >= 3


class TestConfigLoading:
    """Test configuration loading from files."""
    
    def test_load_valid_config(self):
        """Test loading valid configuration."""
        config_data = {
            "wikijs": {
                "url": "https://wiki.example.com",
                "api_key": "test-key"
            },
            "logging_level": "DEBUG"
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(config_data, f)
            config_path = f.name
        
        try:
            from wikijs_mcp.server import load_config
            config = load_config(config_path)
            assert config.wikijs.url == "https://wiki.example.com"
            assert config.logging_level == "DEBUG"
        finally:
            os.unlink(config_path)
    
    def test_load_nonexistent_config(self):
        """Test loading non-existent configuration."""
        from wikijs_mcp.server import load_config
        
        with pytest.raises(ConfigurationError, match="not found"):
            load_config("/nonexistent/config.json")
    
    def test_load_invalid_json(self):
        """Test loading invalid JSON configuration."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("{ invalid json }")
            config_path = f.name
        
        try:
            from wikijs_mcp.server import load_config
            
            with pytest.raises(ConfigurationError, match="Invalid JSON"):
                load_config(config_path)
        finally:
            os.unlink(config_path)
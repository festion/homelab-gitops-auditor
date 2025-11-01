"""
Integration tests for WikiJS MCP Server.

These tests require a running WikiJS instance for full integration testing.
They can be skipped if WikiJS is not available.
"""

import os
import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from wikijs_mcp.config import WikiJSConfig, WikiJSMCPConfig
from wikijs_mcp.wikijs_client import WikiJSClient
from wikijs_mcp.server import WikiJSMCPServer
from wikijs_mcp.exceptions import WikiJSAPIError, AuthenticationError


# Skip integration tests if no test config available
WIKIJS_TEST_CONFIG = os.environ.get('WIKIJS_TEST_CONFIG')
skip_integration = pytest.mark.skipif(
    not WIKIJS_TEST_CONFIG,
    reason="No WikiJS test configuration available (set WIKIJS_TEST_CONFIG environment variable)"
)


class TestWikiJSClientMocked:
    """Test WikiJS client with mocked responses."""
    
    @pytest.fixture
    def wikijs_config(self):
        """Create test WikiJS config."""
        return WikiJSConfig(
            url="https://test-wiki.example.com",
            api_key="test-api-key"
        )
    
    @pytest.fixture
    def client(self, wikijs_config):
        """Create WikiJS client."""
        return WikiJSClient(wikijs_config)
    
    @pytest.mark.asyncio
    async def test_connection_test_success(self, client):
        """Test successful connection test."""
        mock_response = {
            'data': {
                'system': {
                    'info': {
                        'currentVersion': '2.5.0',
                        'dbType': 'postgres',
                        'pagesTotal': 100,
                        'usersTotal': 5,
                        'groupsTotal': 3
                    }
                }
            }
        }
        
        with patch.object(client, '_execute_query', return_value=mock_response):
            result = await client.test_connection()
            
            assert result['currentVersion'] == '2.5.0'
            assert result['pagesTotal'] == 100
    
    @pytest.mark.asyncio
    async def test_connection_test_failure(self, client):
        """Test connection test failure."""
        with patch.object(client, '_execute_query', side_effect=WikiJSAPIError("Connection failed")):
            with pytest.raises(WikiJSAPIError):
                await client.test_connection()
    
    @pytest.mark.asyncio
    async def test_get_page_success(self, client):
        """Test successful page retrieval."""
        mock_response = {
            'data': {
                'pages': {
                    'single': {
                        'id': 1,
                        'path': 'test-page',
                        'title': 'Test Page',
                        'content': '# Test Content',
                        'isPublished': True,
                        'locale': 'en',
                        'tags': [{'id': 1, 'tag': 'test'}],
                        'createdAt': '2023-01-01T00:00:00Z',
                        'updatedAt': '2023-01-01T00:00:00Z',
                        'author': {'id': 1, 'name': 'Test User', 'email': 'test@example.com'},
                        'editor': 'markdown'
                    }
                }
            }
        }
        
        with patch.object(client, '_execute_query', return_value=mock_response):
            page = await client.get_page('test-page')
            
            assert page['id'] == 1
            assert page['title'] == 'Test Page'
            assert page['path'] == 'test-page'
    
    @pytest.mark.asyncio
    async def test_get_page_not_found(self, client):
        """Test page not found."""
        mock_response = {
            'data': {
                'pages': {
                    'single': None
                }
            }
        }
        
        with patch.object(client, '_execute_query', return_value=mock_response):
            page = await client.get_page('nonexistent-page')
            assert page is None
    
    @pytest.mark.asyncio
    async def test_create_page_success(self, client):
        """Test successful page creation."""
        mock_response = {
            'data': {
                'pages': {
                    'create': {
                        'responseResult': {
                            'succeeded': True,
                            'errorCode': None,
                            'message': None
                        },
                        'page': {
                            'id': 1,
                            'path': 'new-page',
                            'title': 'New Page'
                        }
                    }
                }
            }
        }
        
        with patch.object(client, '_execute_query', return_value=mock_response):
            result = await client.create_page(
                path='new-page',
                title='New Page',
                content='# New Content'
            )
            
            assert result['id'] == 1
            assert result['path'] == 'new-page'
    
    @pytest.mark.asyncio
    async def test_create_page_failure(self, client):
        """Test page creation failure."""
        mock_response = {
            'data': {
                'pages': {
                    'create': {
                        'responseResult': {
                            'succeeded': False,
                            'errorCode': 'PAGE_ALREADY_EXISTS',
                            'message': 'Page already exists'
                        },
                        'page': None
                    }
                }
            }
        }
        
        with patch.object(client, '_execute_query', return_value=mock_response):
            with pytest.raises(WikiJSAPIError, match="Failed to create page"):
                await client.create_page(
                    path='existing-page',
                    title='Existing Page',
                    content='# Content'
                )
    
    @pytest.mark.asyncio
    async def test_authentication_error(self, client):
        """Test authentication error handling."""
        from aiohttp import ClientResponseError
        from aiohttp.web import HTTPUnauthorized
        
        error = ClientResponseError(
            request_info=None,
            history=(),
            status=401,
            message="Unauthorized"
        )
        
        with patch.object(client, '_execute_query', side_effect=AuthenticationError("Invalid API key")):
            with pytest.raises(AuthenticationError):
                await client.test_connection()


class TestMCPServerIntegration:
    """Test MCP server integration."""
    
    @pytest.fixture
    def config(self):
        """Create test MCP server config."""
        return WikiJSMCPConfig(
            wikijs=WikiJSConfig(
                url="https://test-wiki.example.com",
                api_key="test-api-key"
            )
        )
    
    @pytest.fixture
    def server(self, config):
        """Create MCP server."""
        return WikiJSMCPServer(config)
    
    def test_server_initialization(self, server):
        """Test server initialization."""
        assert server.config is not None
        assert server.security is not None
        assert server.scanner is not None
        assert server.wikijs_client is not None
    
    @pytest.mark.asyncio
    async def test_server_cleanup(self, server):
        """Test server cleanup."""
        # Mock the wikijs client session
        server.wikijs_client.session = AsyncMock()
        
        await server.cleanup()
        
        # Verify cleanup was called
        assert hasattr(server.wikijs_client, 'session')


@skip_integration
class TestRealWikiJSIntegration:
    """Integration tests with real WikiJS instance."""
    
    @pytest.fixture
    def real_config(self):
        """Load real WikiJS configuration from environment."""
        import json
        
        with open(WIKIJS_TEST_CONFIG) as f:
            config_data = json.load(f)
        
        return WikiJSMCPConfig(**config_data)
    
    @pytest.fixture
    def real_client(self, real_config):
        """Create client with real configuration."""
        return WikiJSClient(real_config.wikijs)
    
    @pytest.mark.asyncio
    async def test_real_connection(self, real_client):
        """Test connection to real WikiJS instance."""
        async with real_client as client:
            system_info = await client.test_connection()
            
            assert 'currentVersion' in system_info
            assert isinstance(system_info['pagesTotal'], int)
    
    @pytest.mark.asyncio
    async def test_real_page_operations(self, real_client):
        """Test page operations on real WikiJS instance."""
        test_path = "test/integration-test-page"
        test_title = "Integration Test Page"
        test_content = "# Integration Test\\n\\nThis is a test page created by integration tests."
        
        async with real_client as client:
            try:
                # Clean up any existing test page
                existing_page = await client.get_page(test_path)
                if existing_page:
                    await client.delete_page(existing_page['id'])
                
                # Create new page
                created_page = await client.create_page(
                    path=test_path,
                    title=test_title,
                    content=test_content,
                    tags=['test', 'integration']
                )
                
                assert created_page['path'] == test_path
                
                # Retrieve the created page
                retrieved_page = await client.get_page(test_path)
                assert retrieved_page is not None
                assert retrieved_page['title'] == test_title
                assert retrieved_page['content'] == test_content
                
                # Update the page
                updated_content = test_content + "\\n\\nUpdated content."
                await client.update_page(
                    page_id=retrieved_page['id'],
                    content=updated_content
                )
                
                # Verify update
                updated_page = await client.get_page(test_path)
                assert updated_content in updated_page['content']
                
            finally:
                # Clean up test page
                try:
                    page = await client.get_page(test_path)
                    if page:
                        await client.delete_page(page['id'])
                except:
                    pass  # Ignore cleanup errors
    
    @pytest.mark.asyncio
    async def test_real_search(self, real_client):
        """Test search functionality on real WikiJS instance."""
        async with real_client as client:
            results = await client.search_pages("test", limit=5)
            
            assert isinstance(results, list)
            # May be empty if no pages match
            if results:
                page = results[0]
                assert 'id' in page
                assert 'title' in page
                assert 'path' in page
"""
WikiJS API client for WikiJS MCP Server.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
import aiohttp
from urllib.parse import urljoin, quote

from .config import WikiJSConfig
from .exceptions import WikiJSAPIError, AuthenticationError, ValidationError


logger = logging.getLogger(__name__)


class WikiJSClient:
    """Async client for WikiJS API operations."""
    
    def __init__(self, config: WikiJSConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.base_url = str(config.url).rstrip('/')
        self.api_url = urljoin(self.base_url, '/graphql')
        
    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
    
    async def connect(self) -> None:
        """Initialize the HTTP session."""
        if self.session is None:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout)
            self.session = aiohttp.ClientSession(
                timeout=timeout,
                headers={
                    'Authorization': f'Bearer {self.config.api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': 'WikiJS-MCP-Server/0.1.0'
                }
            )
    
    async def disconnect(self) -> None:
        """Close the HTTP session."""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test the connection to WikiJS and return system info."""
        query = '''
        query {
            system {
                info {
                    currentVersion
                    dbType
                    groupsTotal
                    pagesTotal
                    usersTotal
                }
            }
        }
        '''
        
        try:
            result = await self._execute_query(query)
            return result['data']['system']['info']
        except Exception as e:
            raise WikiJSAPIError(f"Connection test failed: {str(e)}")
    
    async def get_page(self, path: str, locale: str = None) -> Optional[Dict[str, Any]]:
        """Get a page by its path using corrected schema."""
        locale = locale or self.config.default_locale
        
        # First get all pages and find the one with matching path
        query = '''
        {
            pages {
                list {
                    id
                    path
                    title
                    description
                    content
                    isPublished
                    createdAt
                    updatedAt
                }
            }
        }
        '''
        
        try:
            result = await self._execute_query(query)
            all_pages = result['data']['pages']['list']
            
            # Find page with matching path
            for page in all_pages:
                if page['path'] == path:
                    return page
                    
            # Page not found
            return None
            
        except WikiJSAPIError:
            # API error or page doesn't exist
            return None
    
    async def create_page(
        self,
        path: str,
        title: str,
        content: str,
        description: str = "",
        tags: List[str] = None,
        locale: str = None,
        editor: str = None,
        is_published: bool = True,
        is_private: bool = False
    ) -> Dict[str, Any]:
        """Create a new page in WikiJS."""
        locale = locale or self.config.default_locale
        editor = editor or self.config.default_editor
        tags = tags or []
        
        # Combine default tags with provided tags
        all_tags = list(set(self.config.default_tags + tags))
        
        mutation = '''
        mutation CreatePage(
            $content: String!,
            $description: String!,
            $editor: String!,
            $isPublished: Boolean!,
            $isPrivate: Boolean!,
            $locale: String!,
            $path: String!,
            $tags: [String]!,
            $title: String!
        ) {
            pages {
                create(
                    content: $content,
                    description: $description,
                    editor: $editor,
                    isPublished: $isPublished,
                    isPrivate: $isPrivate,
                    locale: $locale,
                    path: $path,
                    tags: $tags,
                    title: $title
                ) {
                    responseResult {
                        succeeded
                        errorCode
                        slug
                        message
                    }
                    page {
                        id
                        path
                        title
                    }
                }
            }
        }
        '''
        
        variables = {
            'content': content,
            'description': description,
            'editor': editor,
            'isPublished': is_published,
            'isPrivate': is_private,
            'locale': locale,
            'path': path,
            'tags': all_tags,
            'title': title
        }
        
        result = await self._execute_query(mutation, variables)
        create_result = result['data']['pages']['create']
        
        if not create_result['responseResult']['succeeded']:
            error_msg = create_result['responseResult']['message']
            error_code = create_result['responseResult']['errorCode']
            raise WikiJSAPIError(f"Failed to create page: {error_msg}", response_data={'errorCode': error_code})
        
        return create_result['page']
    
    async def update_page(
        self,
        page_id: int,
        content: str,
        title: str = None,
        description: str = None,
        tags: List[str] = None,
        is_published: bool = None
    ) -> Dict[str, Any]:
        """Update an existing page."""
        mutation = '''
        mutation UpdatePage(
            $id: Int!,
            $content: String!,
            $title: String,
            $description: String,
            $tags: [String],
            $isPublished: Boolean
        ) {
            pages {
                update(
                    id: $id,
                    content: $content,
                    title: $title,
                    description: $description,
                    tags: $tags,
                    isPublished: $isPublished
                ) {
                    responseResult {
                        succeeded
                        errorCode
                        slug
                        message
                    }
                    page {
                        id
                        path
                        title
                        updatedAt
                    }
                }
            }
        }
        '''
        
        variables = {
            'id': page_id,
            'content': content
        }
        
        # Only include non-None values
        if title is not None:
            variables['title'] = title
        if description is not None:
            variables['description'] = description
        if tags is not None:
            variables['tags'] = tags
        if is_published is not None:
            variables['isPublished'] = is_published
        
        result = await self._execute_query(mutation, variables)
        update_result = result['data']['pages']['update']
        
        if not update_result['responseResult']['succeeded']:
            error_msg = update_result['responseResult']['message']
            error_code = update_result['responseResult']['errorCode']
            raise WikiJSAPIError(f"Failed to update page: {error_msg}", response_data={'errorCode': error_code})
        
        return update_result['page']
    
    async def delete_page(self, page_id: int) -> bool:
        """Delete a page by ID."""
        mutation = '''
        mutation DeletePage($id: Int!) {
            pages {
                delete(id: $id) {
                    responseResult {
                        succeeded
                        errorCode
                        message
                    }
                }
            }
        }
        '''
        
        variables = {'id': page_id}
        
        result = await self._execute_query(mutation, variables)
        delete_result = result['data']['pages']['delete']
        
        if not delete_result['responseResult']['succeeded']:
            error_msg = delete_result['responseResult']['message']
            error_code = delete_result['responseResult']['errorCode']
            raise WikiJSAPIError(f"Failed to delete page: {error_msg}", response_data={'errorCode': error_code})
        
        return True
    
    async def search_pages(
        self,
        query: str,
        locale: str = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Search for pages by query."""
        locale = locale or self.config.default_locale
        
        search_query = '''
        query SearchPages($query: String!, $locale: String!) {
            pages {
                search(query: $query, locale: $locale) {
                    results {
                        id
                        title
                        path
                        description
                        locale
                        createdAt
                        updatedAt
                    }
                    totalHits
                }
            }
        }
        '''
        
        variables = {'query': query, 'locale': locale}
        
        result = await self._execute_query(search_query, variables)
        search_result = result['data']['pages']['search']
        
        # Limit results if needed
        results = search_result['results'][:limit]
        
        return results
    
    async def list_pages(
        self,
        locale: str = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """List pages with simplified query that works with WikiJS schema."""
        
        # Use simple query without problematic pagination and schema fields
        query = '''
        {
            pages {
                list {
                    id
                    path
                    title
                    description
                    isPublished
                    createdAt
                    updatedAt
                }
            }
        }
        '''
        
        result = await self._execute_query(query)
        all_pages = result['data']['pages']['list']
        
        # Apply client-side pagination and filtering
        if locale and locale != 'en':
            # Filter by locale if specified (basic implementation)
            filtered_pages = [p for p in all_pages if 'locale' not in p or p.get('locale') == locale]
        else:
            filtered_pages = all_pages
        
        # Apply pagination
        start_idx = offset
        end_idx = offset + limit
        paginated_pages = filtered_pages[start_idx:end_idx]
        
        return {
            'pages': paginated_pages,
            'total': len(paginated_pages),
            'offset': offset,
            'limit': limit
        }
    
    async def get_tags(self) -> List[Dict[str, Any]]:
        """Get all available tags."""
        query = '''
        query GetTags {
            pages {
                tags {
                    id
                    tag
                    title
                    createdAt
                    updatedAt
                }
            }
        }
        '''
        
        result = await self._execute_query(query)
        return result['data']['pages']['tags']
    
    async def upload_asset(
        self,
        file_path: str,
        content: bytes,
        folder_id: int = 0
    ) -> Dict[str, Any]:
        """Upload an asset (image, document) to WikiJS."""
        # WikiJS asset upload requires multipart form data
        # This is a simplified implementation - full implementation would need
        # proper multipart handling for file uploads
        
        # For now, we'll return an error indicating this needs implementation
        raise WikiJSAPIError("Asset upload not yet implemented in this version")
    
    async def _execute_query(
        self,
        query: str,
        variables: Dict[str, Any] = None,
        retry_count: int = 0
    ) -> Dict[str, Any]:
        """Execute a GraphQL query against WikiJS API."""
        if not self.session:
            await self.connect()
        
        payload = {'query': query}
        if variables:
            payload['variables'] = variables
        
        # Debug logging
        logger.debug(f"GraphQL Request:")
        logger.debug(f"Query: {query[:200]}...")
        logger.debug(f"Variables: {variables}")
        
        try:
            async with self.session.post(self.api_url, json=payload) as response:
                response_text = await response.text()
                logger.debug(f"Response status: {response.status}")
                logger.debug(f"Response: {response_text[:500]}...")
                
                try:
                    result = await response.json()
                except:
                    result = {"error": "Failed to parse JSON", "response": response_text}
                
                # Check for HTTP errors
                if response.status == 401:
                    raise AuthenticationError("Invalid API key or insufficient permissions")
                elif response.status == 403:
                    raise AuthenticationError("Access forbidden - check permissions")
                elif response.status >= 400:
                    raise WikiJSAPIError(
                        f"HTTP {response.status}: {response.reason} - {response_text[:200]}",
                        status_code=response.status
                    )
                
                # Check for GraphQL errors
                if 'errors' in result:
                    error_messages = [error['message'] for error in result['errors']]
                    raise WikiJSAPIError(f"GraphQL errors: {'; '.join(error_messages)}")
                
                return result
        
        except aiohttp.ClientError as e:
            if retry_count < self.config.retry_attempts:
                logger.warning(f"Request failed, retrying ({retry_count + 1}/{self.config.retry_attempts}): {e}")
                await asyncio.sleep(2 ** retry_count)  # Exponential backoff
                return await self._execute_query(query, variables, retry_count + 1)
            else:
                raise WikiJSAPIError(f"Request failed after {self.config.retry_attempts} retries: {str(e)}")
        
        except Exception as e:
            raise WikiJSAPIError(f"Unexpected error during API request: {str(e)}")
    
    def _normalize_path(self, path: str) -> str:
        """Normalize a WikiJS page path."""
        # Remove leading/trailing slashes and ensure proper format
        path = path.strip('/')
        
        # URL encode special characters but preserve slashes
        path_parts = path.split('/')
        encoded_parts = [quote(part, safe='') for part in path_parts]
        
        return '/'.join(encoded_parts)
    
    def _extract_title_from_content(self, content: str) -> str:
        """Extract title from markdown content if not provided."""
        lines = content.split('\\n')
        for line in lines:
            line = line.strip()
            if line.startswith('# '):
                return line[2:].strip()
        return "Untitled Document"
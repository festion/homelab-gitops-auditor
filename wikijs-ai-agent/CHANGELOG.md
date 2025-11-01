# WikiJS MCP Server Changelog

## [1.0.1] - 2025-07-01

### Fixed
- **CRITICAL:** Fixed GraphQL schema compatibility with WikiJS 2.5.307
  - Removed unsupported `tags { id, tag }` field from search query in `wikijs_client.py`
  - Search functionality now works properly with WikiJS 2.5.307 and earlier versions
- **Fixed:** Type comparison error in connection info display
  - Fixed string/integer comparison in `server.py` when displaying file size configuration
  - `get_wikijs_connection_info` tool now works without errors
- **Fixed:** Search result processing for tags field
  - Commented out tags processing in search results to prevent errors
  - Search results now display properly without trying to access unavailable tags data

### Changed
- Updated GraphQL queries to be compatible with WikiJS 2.5.307 schema
- Simplified file size display in connection info (shows config value directly)
- Enhanced error handling for GraphQL schema mismatches

### Technical Details
- **Issue:** WikiJS 2.5.307 `PageSearchResult` type doesn't support complex `tags` field structure
- **Solution:** Removed tags from search query and result processing
- **Impact:** Search functionality fully restored, connection info tool functional

### Files Modified
- `src/wikijs_mcp/wikijs_client.py` - Fixed GraphQL search query
- `src/wikijs_mcp/server.py` - Fixed file size formatting and tags processing

## [1.0.0] - 2025-06-30

### Added
- Initial release of WikiJS MCP Server
- Document discovery and analysis
- WikiJS page creation and updates
- Search functionality
- Security validation
- Configuration management
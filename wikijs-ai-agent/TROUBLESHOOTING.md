# WikiJS MCP Server Troubleshooting Guide

## Common Issues and Solutions

### GraphQL Schema Errors

#### Symptom
```
Error: Cannot query field "tags" on type "PageSearchResult"
HTTP 400: Bad Request - {"errors":[{"message":"Cannot query field \"tags\" on type \"PageSearchResult\""...
```

#### Cause
WikiJS versions may have different GraphQL schema support. The `tags` field structure varies between versions.

#### Solution
- **Fixed in v1.0.1:** Search queries now use only supported fields
- For custom queries, check your WikiJS version's GraphQL schema at `/graphql-playground`

### Type Comparison Errors

#### Symptom
```
Unexpected error: '<' not supported between instances of 'str' and 'int'
```

#### Cause
Configuration values like `max_file_size` are strings (e.g., "10MB") but code may try to use them as integers.

#### Solution
- **Fixed in v1.0.1:** File size display uses string directly
- Use `_parse_size_string()` method to convert size strings to bytes when needed

### Content Upload Failures

#### Symptom
```
Error: Content contains sensitive information (filter 3)
```

#### Cause
Security filters may be too aggressive and flag legitimate content as sensitive.

#### Solution
1. Review content for actual sensitive information (passwords, tokens, keys)
2. If content is safe, adjust security filters in configuration:
   ```json
   "security": {
     "content_filters": [
       "(?i)(password|secret|api[_-]?key|token)\\s*[:=]\\s*[^\\s]+",
       "-----BEGIN [A-Z ]+-----"
     ]
   }
   ```

### Connection Issues

#### Symptom
```
Error: Not connected
```

#### Cause
- WikiJS server not accessible
- Invalid API token
- Network connectivity issues

#### Solution
1. Verify WikiJS server is running and accessible
2. Check API token validity
3. Test connection with `test_wikijs_connection` tool
4. Verify URL and token in configuration

### Search Returns No Results

#### Symptom
Search queries complete but return empty results even when pages exist.

#### Cause
- Search indexing may not be complete
- Locale mismatch in search query
- Content not indexed yet

#### Solution
1. Check search locale matches your content locale
2. Wait for WikiJS search indexing to complete
3. Verify pages are published and visible

## Debugging Tips

### Enable Debug Logging
Set logging level to DEBUG in configuration:
```json
{
  "logging_level": "DEBUG"
}
```

### Test GraphQL Queries
Use WikiJS GraphQL playground at `http://your-wikijs-url/graphql-playground` to test queries.

### Verify Configuration
Use the `get_wikijs_connection_info` tool to verify configuration is loaded correctly.

### Check WikiJS Version
Different WikiJS versions have different capabilities. Check your version with:
```
query {
  system {
    info {
      currentVersion
    }
  }
}
```

## Version Compatibility

### Tested Versions
- **WikiJS 2.5.307** - ✅ Fully supported (fixed in v1.0.1)

### Known Issues by Version
- **WikiJS 2.5.x** - Complex `tags` queries not supported in search results
- **WikiJS 2.4.x** - Not tested, may have schema differences

## Getting Help

1. Check this troubleshooting guide
2. Review error messages carefully
3. Test with `test_wikijs_connection` tool
4. Check WikiJS server logs
5. Verify configuration values

## Error Code Reference

- **HTTP 400** - GraphQL schema error or invalid query
- **HTTP 401** - Authentication failure (check API token)
- **HTTP 404** - Page or endpoint not found
- **HTTP 500** - Server error (check WikiJS server logs)
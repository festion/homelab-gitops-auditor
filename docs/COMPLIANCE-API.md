# Template Compliance API Documentation

## Overview
The Template Compliance API provides comprehensive template compliance tracking, scoring, and management for repositories in the homelab environment. It integrates with the Phase 1B Template Application Engine to ensure DevOps templates are properly applied and maintained across all monitored repositories.

## Base URL
```
/api/v2/compliance
```

## Authentication
The API uses existing project authentication and integrates with the Phase 1B template system located in `.mcp/` directory.

## Core Concepts

### Compliance Scoring
- **Score Range**: 0-100 points
- **Compliance Threshold**: 80+ points = compliant
- **Scoring Factors**: Files (60%), Directories (20%), Content (20%)
- **Issue Severity**: High (1.0), Medium (0.6), Low (0.3) weight

### Issue Types
- `missing`: Required template files/directories not present
- `outdated`: Template files exist but are outdated
- `modified`: Template files have been modified from original
- `invalid`: Template files have syntax or structural errors

### Template Integration
- Uses Phase 1B `template-applicator.py` for applying templates
- Reads template definitions from `.mcp/templates/`
- Supports template versioning and drift detection

## Endpoints

### GET /api/v2/compliance/status
Get compliance status for all monitored repositories.

#### Query Parameters
- `repository` (optional): Filter by specific repository name
- `template` (optional): Filter by specific template name
- `includeDetails` (optional): Include detailed issue information (default: false)

#### Response Format
```json
{
  "repositories": [
    {
      "name": "homelab-gitops-auditor",
      "compliant": true,
      "score": 95,
      "appliedTemplates": ["standard-devops"],
      "missingTemplates": [],
      "lastChecked": "2025-01-01T10:00:00Z",
      "issues": [
        {
          "type": "modified",
          "template": "standard-devops",
          "file": ".gitignore",
          "severity": "low",
          "description": "File has been modified from template",
          "recommendation": "Review changes and update template if needed",
          "detectedAt": "2025-01-01T10:00:00Z"
        }
      ],
      "templateVersions": {
        "standard-devops": "1.0.0"
      },
      "issueCount": 1,
      "highPriorityIssues": 0
    }
  ],
  "summary": {
    "totalRepos": 5,
    "compliantRepos": 4,
    "nonCompliantRepos": 1,
    "complianceRate": 80,
    "averageScore": 85,
    "totalIssues": 12,
    "highSeverityIssues": 2
  },
  "timestamp": "2025-01-01T10:00:00Z"
}
```

#### Usage Examples
```bash
# Get overall compliance status
curl "http://localhost:3070/api/v2/compliance/status"

# Check specific repository
curl "http://localhost:3070/api/v2/compliance/status?repository=homelab-gitops-auditor"

# Filter by template with details
curl "http://localhost:3070/api/v2/compliance/status?template=standard-devops&includeDetails=true"
```

### GET /api/v2/compliance/repository/:repo
Get detailed compliance report for a specific repository.

#### Path Parameters
- `repo`: Repository name

#### Query Parameters
- `templates` (optional): Comma-separated list of templates to check
- `includeHistory` (optional): Include template application history (default: false)

#### Response Format
```json
{
  "name": "homelab-gitops-auditor",
  "compliant": true,
  "score": 95,
  "appliedTemplates": ["standard-devops"],
  "missingTemplates": [],
  "lastChecked": "2025-01-01T10:00:00Z",
  "issues": [
    {
      "type": "modified",
      "template": "standard-devops",
      "file": ".gitignore",
      "severity": "low",
      "description": "File has been modified from template",
      "recommendation": "Review changes and update template if needed"
    }
  ],
  "templateVersions": {
    "standard-devops": "1.0.0"
  },
  "complianceDetails": {
    "filesCompliant": 5,
    "filesTotal": 6,
    "directoriesCompliant": 2,
    "directoriesTotal": 2
  },
  "recommendations": [
    {
      "priority": "low",
      "action": "improve_score",
      "description": "Improve compliance score from 95% to 98%",
      "currentScore": 95,
      "targetScore": 98
    }
  ],
  "applicationHistory": [
    {
      "id": "app_123",
      "templateName": "standard-devops",
      "templateVersion": "1.0.0",
      "appliedAt": "2024-12-15T09:00:00Z",
      "appliedBy": "api",
      "status": "success",
      "duration": 45,
      "filesAdded": [".mcp.json", "CLAUDE.md"],
      "filesModified": [".gitignore"]
    }
  ]
}
```

### POST /api/v2/compliance/check
Trigger compliance check for multiple repositories.

#### Request Body
```json
{
  "repositories": ["repo1", "repo2"],
  "templates": ["standard-devops", "microservice"],
  "priority": "normal"
}
```

#### Parameters
- `repositories` (optional): Array of repository names (default: all monitored)
- `templates` (optional): Array of template names (default: all enabled)
- `priority` (optional): Job priority - "high", "normal", "low" (default: "normal")

#### Response Format
```json
{
  "jobId": "check_1672531200_abc123",
  "message": "Compliance check initiated",
  "repositories": ["repo1", "repo2"],
  "templates": ["standard-devops"],
  "estimatedDuration": 120,
  "timestamp": "2025-01-01T10:00:00Z"
}
```

#### Job Status Tracking
Use WebSocket events to track job progress:
- `compliance.job-started`: Job execution began
- `compliance.job-progress`: Progress updates
- `compliance.job-completed`: Job finished successfully
- `compliance.job-failed`: Job encountered errors

### GET /api/v2/compliance/templates
List available templates and their requirements.

#### Response Format
```json
{
  "templates": [
    {
      "id": "standard-devops",
      "name": "Standard DevOps Project Template",
      "version": "1.0.0",
      "description": "Comprehensive DevOps project template with GitOps, CI/CD, and MCP integration",
      "type": "devops",
      "tags": ["devops", "gitops", "mcp", "ci-cd"],
      "requirements": {
        "git": true,
        "mcp": true,
        "cicd": true
      },
      "files": [
        {
          "path": ".mcp.json",
          "type": "merge",
          "source": "mcp-config.json",
          "required": true
        },
        {
          "path": "CLAUDE.md",
          "type": "template",
          "source": "CLAUDE.md.template",
          "required": true
        }
      ],
      "directories": [
        {
          "path": "scripts",
          "required": true
        }
      ],
      "compliance": {
        "required_files": [".mcp.json", "CLAUDE.md"],
        "required_directories": ["scripts"],
        "scoring_weights": {
          "files": 0.6,
          "directories": 0.2,
          "content": 0.2
        }
      },
      "usage": {
        "totalApplications": 15,
        "successfulApplications": 14,
        "failedApplications": 1,
        "successRate": 93,
        "currentlyCompliant": 8,
        "lastUsed": 1672531200000
      }
    }
  ],
  "total": 1,
  "timestamp": "2025-01-01T10:00:00Z"
}
```

### GET /api/v2/compliance/history
Get template application history with filtering and pagination.

#### Query Parameters
- `repository` (optional): Filter by repository name
- `template` (optional): Filter by template name
- `limit` (optional): Maximum results per page (default: 50, max: 100)
- `offset` (optional): Results offset for pagination (default: 0)

#### Response Format
```json
{
  "applications": [
    {
      "id": "app_123",
      "repository": "homelab-gitops-auditor",
      "templateName": "standard-devops",
      "templateVersion": "1.0.0",
      "appliedAt": "2025-01-01T10:00:00Z",
      "appliedBy": "api",
      "status": "success",
      "prUrl": null,
      "backupPath": "/backups/repo_20250101_100000",
      "filesModified": [".gitignore"],
      "filesAdded": [".mcp.json", "CLAUDE.md"],
      "error": null,
      "duration": 45,
      "durationFormatted": "45s"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  },
  "timestamp": "2025-01-01T10:00:00Z"
}
```

### POST /api/v2/compliance/apply
Apply templates to repositories with backup and PR creation options.

#### Request Body
```json
{
  "repository": "homelab-gitops-auditor",
  "templates": ["standard-devops"],
  "createPR": false,
  "dryRun": true
}
```

#### Required Parameters
- `repository`: Target repository name
- `templates`: Array of template names to apply

#### Optional Parameters
- `createPR`: Create pull request instead of direct commits (default: false)
- `dryRun`: Preview changes without applying (default: true)

#### Response Format
```json
{
  "repository": "homelab-gitops-auditor",
  "templates": ["standard-devops"],
  "results": [
    {
      "template": "standard-devops",
      "success": true,
      "dryRun": true,
      "output": "Would apply template standard-devops:\n  + .mcp.json\n  + CLAUDE.md\n  ~ .gitignore",
      "error": null,
      "duration": 3,
      "applicationId": "app_1672531200_abc123"
    }
  ],
  "dryRun": true,
  "createPR": false,
  "timestamp": "2025-01-01T10:00:00Z"
}
```

## WebSocket Events

The API supports real-time updates via WebSocket connection on the `compliance` channel.

### Event Types
- `compliance.checked` - Repository compliance status updated
- `compliance.job-started` - Compliance check job started
- `compliance.job-progress` - Job progress update
- `compliance.job-completed` - Job completed successfully
- `compliance.job-failed` - Job failed with errors
- `compliance.application-started` - Template application started
- `compliance.application-completed` - Template application completed
- `compliance.application-failed` - Template application failed
- `status.requested` - Compliance status was requested
- `repository.checked` - Repository was checked
- `check.triggered` - Compliance check was triggered
- `templates.requested` - Template list was requested
- `history.requested` - Application history was requested
- `template.applied` - Template was applied

### WebSocket Event Format
```json
{
  "type": "phase2.event",
  "channel": "compliance",
  "event": "compliance.checked",
  "data": {
    "repository": "homelab-gitops-auditor",
    "compliant": true,
    "score": 95,
    "issueCount": 1
  },
  "timestamp": "2025-01-01T10:00:00Z"
}
```

## Error Handling

### Error Response Format
```json
{
  "error": "Error description",
  "details": "Detailed error message"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `404`: Not Found (repository or template not found)
- `500`: Internal Server Error
- `503`: Service Unavailable (template engine issues)

### Template Engine Errors
- Repository not found or inaccessible
- Template configuration invalid
- Python script execution failed
- File system permission errors

## Configuration

### Environment Variables
- `NODE_ENV`: Environment mode (development/production)
- `MONITORED_REPOSITORIES`: Comma-separated list of repositories to monitor
- `PROJECT_ROOT`: Root directory for template operations

### Template Configuration
Templates are configured in `.mcp/templates/` with the following structure:
```
.mcp/templates/
├── standard-devops/
│   ├── template.json          # Template configuration
│   ├── mcp-config.json       # MCP configuration template
│   ├── CLAUDE.md.template    # Claude documentation template
│   └── gitignore.template    # Git ignore template
└── microservice/
    ├── template.json
    └── ...
```

### Cache Configuration
- Compliance results cached for 5 minutes
- Template list cached for 10 minutes
- Job results stored in memory (temporary)

## Integration Notes

### Phase 1B Integration
- Uses `template-applicator.py` for template operations
- Reads template definitions from `.mcp/templates/`
- Supports backup creation via `backup-manager.py`
- Handles conflict resolution and batch operations

### Git Integration
- Detects Git repositories automatically
- Checks for uncommitted changes before operations
- Supports branch creation for PR workflows
- Integrates with existing Git workflows

### MCP Server Integration
- Designed for integration with MCP server ecosystem
- Supports WebSocket events for real-time updates
- Compatible with existing MCP configuration patterns

## Examples

### Basic Compliance Check
```bash
# Check overall compliance
curl "http://localhost:3070/api/v2/compliance/status"

# Check specific repository with details
curl "http://localhost:3070/api/v2/compliance/repository/homelab-gitops-auditor?includeHistory=true"
```

### Trigger Bulk Compliance Check
```bash
curl -X POST "http://localhost:3070/api/v2/compliance/check" \
  -H "Content-Type: application/json" \
  -d '{
    "repositories": ["repo1", "repo2"],
    "templates": ["standard-devops"],
    "priority": "high"
  }'
```

### Apply Template (Dry Run)
```bash
curl -X POST "http://localhost:3070/api/v2/compliance/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "homelab-gitops-auditor",
    "templates": ["standard-devops"],
    "dryRun": true,
    "createPR": false
  }'
```

### Get Application History
```bash
# Get recent applications for a repository
curl "http://localhost:3070/api/v2/compliance/history?repository=homelab-gitops-auditor&limit=10"

# Get all failed applications
curl "http://localhost:3070/api/v2/compliance/history?status=failed"
```

## Best Practices

### Compliance Monitoring
1. **Regular Checks**: Schedule daily compliance checks
2. **Score Thresholds**: Maintain >80% compliance score
3. **Issue Prioritization**: Address high-severity issues first
4. **Template Updates**: Keep templates current with latest standards

### Template Management
1. **Version Control**: Use semantic versioning for templates
2. **Testing**: Test template changes in development first
3. **Documentation**: Document template requirements clearly
4. **Rollback Plans**: Maintain backup strategies for template applications

### Performance Optimization
1. **Caching**: Utilize API caching for frequently accessed data
2. **Batch Operations**: Use bulk checking for multiple repositories
3. **Async Processing**: Use job queues for long-running operations
4. **Resource Limits**: Monitor Python script execution times

### Security Considerations
1. **File Permissions**: Ensure proper file system permissions
2. **Input Validation**: Validate all repository and template names
3. **Path Traversal**: Prevent directory traversal attacks
4. **Script Execution**: Secure Python script execution environment
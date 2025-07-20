# Pipeline Status API Documentation

## Overview
The Pipeline Status API provides real-time CI/CD pipeline monitoring, GitHub Actions integration, and analytics for the homelab-gitops-auditor platform. This API enables the dashboard to display current pipeline status, historical data, and metrics across monitored repositories.

## Base URL
```
/api/v2/pipelines
```

## Authentication
The API uses GitHub tokens configured via the `GITHUB_TOKEN` environment variable for accessing GitHub Actions data.

## Endpoints

### GET /api/v2/pipelines/status
Get current pipeline status for all monitored repositories.

#### Query Parameters
- `repo` (optional): Filter by specific repository (format: `owner/repo`)
- `branch` (optional): Filter by branch name
- `status` (optional): Filter by status (`success`, `failure`, `pending`, `running`)
- `limit` (optional): Maximum number of results (default: 50)

#### Response Format
```json
{
  "pipelines": [
    {
      "repository": "owner/repo-name",
      "branch": "main",
      "status": "success",
      "lastRun": "2025-01-01T10:05:00Z",
      "duration": 300,
      "workflowName": "CI/CD Pipeline",
      "runId": 123456789,
      "conclusion": "success",
      "steps": [
        {
          "name": "Setup Node.js",
          "status": "completed",
          "conclusion": "success"
        }
      ]
    }
  ],
  "metadata": {
    "total": 1,
    "timestamp": "2025-01-01T10:10:00Z"
  }
}
```

#### Status Values
- `success`: Pipeline completed successfully
- `failure`: Pipeline failed or was cancelled
- `running`: Pipeline currently executing
- `pending`: Pipeline queued for execution

### GET /api/v2/pipelines/history/:repo
Get pipeline run history for a specific repository.

#### Path Parameters
- `repo`: Repository name in `owner/repo` format

#### Query Parameters
- `page` (optional): Page number for pagination (default: 1)
- `per_page` (optional): Results per page (default: 30, max: 100)
- `workflow_id` (optional): Filter by specific workflow ID
- `branch` (optional): Filter by branch name

#### Response Format
```json
{
  "repository": "owner/repo-name",
  "runs": [
    {
      "id": 123456789,
      "name": "CI/CD Pipeline",
      "status": "success",
      "conclusion": "success",
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-01T10:05:00Z",
      "duration": 300,
      "branch": "main",
      "commit_sha": "abc123def456",
      "commit_message": "Add new feature",
      "actor": "username",
      "jobs": [
        {
          "id": 987654321,
          "name": "build",
          "status": "success",
          "started_at": "2025-01-01T10:01:00Z",
          "completed_at": "2025-01-01T10:04:00Z",
          "duration": 180,
          "steps": []
        }
      ],
      "artifacts": []
    }
  ],
  "metadata": {
    "page": 1,
    "per_page": 30,
    "total": 1,
    "timestamp": "2025-01-01T10:10:00Z"
  }
}
```

### POST /api/v2/pipelines/trigger
Manually trigger a pipeline run.

#### Request Body
```json
{
  "repository": "owner/repo-name",
  "workflow": "CI/CD Pipeline",
  "branch": "main",
  "inputs": {
    "debug": "true",
    "environment": "staging"
  }
}
```

#### Required Fields
- `repository`: Repository in `owner/repo` format
- `workflow`: Workflow name or workflow file path

#### Optional Fields
- `branch`: Target branch (default: "main")
- `inputs`: Workflow inputs as key-value pairs

#### Response Format
```json
{
  "success": true,
  "repository": "owner/repo-name",
  "workflow": "CI/CD Pipeline",
  "branch": "main",
  "message": "Pipeline triggered successfully",
  "timestamp": "2025-01-01T10:10:00Z"
}
```

### GET /api/v2/pipelines/metrics
Get pipeline analytics and metrics.

#### Query Parameters
- `repository` (optional): Filter by specific repository
- `timeRange` (optional): Time range for metrics (default: "30d")
  - Format: `<number><unit>` where unit is `d` (days), `h` (hours), or `w` (weeks)
  - Examples: `7d`, `24h`, `2w`
- `branch` (optional): Filter by branch name

#### Response Format
```json
{
  "metrics": {
    "owner/repo-name": {
      "total": 100,
      "successful": 85,
      "failed": 12,
      "cancelled": 3,
      "successRate": 85,
      "failureRate": 12,
      "averageDuration": 240,
      "medianDuration": 220
    }
  },
  "timeRange": "30d",
  "timestamp": "2025-01-01T10:10:00Z"
}
```

#### Metrics Explanation
- `total`: Total number of pipeline runs
- `successful`: Number of successful runs
- `failed`: Number of failed runs
- `cancelled`: Number of cancelled runs
- `successRate`: Success rate as percentage
- `failureRate`: Failure rate as percentage
- `averageDuration`: Average run duration in seconds
- `medianDuration`: Median run duration in seconds

## WebSocket Events

The API supports real-time updates via WebSocket connection on the `pipelines` channel.

### Event Types
- `pipeline:started` - New pipeline run initiated
- `pipeline:completed` - Pipeline run finished successfully
- `pipeline:failed` - Pipeline run failed
- `pipeline:step-update` - Individual step status change
- `pipeline:metrics` - Pipeline metrics updated
- `pipeline:status-summary` - Overall status summary

### WebSocket Event Format
```json
{
  "type": "phase2.event",
  "channel": "pipelines",
  "event": "pipeline:completed",
  "data": {
    "repository": "owner/repo-name",
    "workflow": "CI/CD Pipeline",
    "runId": 123456789,
    "status": "success",
    "duration": 300
  },
  "timestamp": "2025-01-01T10:05:00Z"
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
- `404`: Not Found (repository or workflow not found)
- `500`: Internal Server Error
- `503`: Service Unavailable (GitHub API issues)

### Rate Limiting
The API respects GitHub API rate limits and implements exponential backoff for retries. If rate limits are exceeded, the API will return appropriate error messages.

## Configuration

### Environment Variables
- `GITHUB_TOKEN`: GitHub personal access token with `repo` and `workflow` permissions
- `MONITORED_REPOSITORIES`: Comma-separated list of repositories to monitor (default: auto-detected)

### Cache Configuration
- Pipeline status is cached for 1 minute to improve performance
- Cache automatically expires and refreshes based on TTL settings
- Failed requests are retried with exponential backoff

## Integration Notes

### GitHub MCP Server
The API is designed to work with the GitHub MCP server for enhanced GitHub integration. When available, it uses the MCP server for all GitHub API operations. If not available, it falls back to direct GitHub API calls.

### Serena Orchestration
All pipeline operations can be orchestrated through Serena for workflow coordination and multi-server integration.

### Dashboard Integration
The Pipeline API is specifically designed for integration with the Phase 2 enhanced dashboard, providing real-time pipeline status updates and comprehensive analytics.

## Examples

### Get Current Pipeline Status
```bash
curl "http://localhost:3070/api/v2/pipelines/status?limit=10"
```

### Get Pipeline History for Repository
```bash
curl "http://localhost:3070/api/v2/pipelines/history/owner/repo-name?page=1&per_page=20"
```

### Trigger Pipeline
```bash
curl -X POST "http://localhost:3070/api/v2/pipelines/trigger" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "owner/repo-name",
    "workflow": "CI/CD Pipeline",
    "branch": "develop",
    "inputs": {"debug": "true"}
  }'
```

### Get Pipeline Metrics
```bash
curl "http://localhost:3070/api/v2/pipelines/metrics?timeRange=7d&repository=owner/repo-name"
```
# API Specification: Home Assistant Config Automated Deployment

## Overview
This document specifies the API endpoints, webhook configurations, and data structures for the Home Assistant Config automated deployment system.

## Base Configuration
- **Base URL**: `http://192.168.1.58:3070/api` (Production)
- **Base URL**: `http://localhost:3070/api` (Development)
- **Authentication**: Bearer token authentication
- **Content-Type**: `application/json`
- **API Version**: `v1`

## Authentication

### Token Authentication
```http
Authorization: Bearer <deployment-token>
```

### Token Scopes
- `deployment:read` - Read deployment status and history
- `deployment:write` - Trigger deployments and rollbacks
- `deployment:admin` - Full deployment management access

## API Endpoints

### 1. Deployment Status

#### GET /api/deployments/home-assistant-config/status
Get current deployment status for home-assistant-config repository.

**Response:**
```json
{
  "status": "success",
  "data": {
    "deploymentId": "deploy-20250711-092847",
    "state": "completed",
    "repository": "festion/home-assistant-config",
    "branch": "main",
    "commit": "689a045",
    "author": "Jeremy Ames",
    "startTime": "2025-07-11T09:28:47Z",
    "endTime": "2025-07-11T09:30:12Z",
    "duration": 85,
    "progress": {
      "current": 5,
      "total": 5,
      "stage": "completed",
      "message": "Deployment completed successfully"
    },
    "health": {
      "homeAssistantStatus": "running",
      "configurationValid": true,
      "apiResponsive": true,
      "lastHealthCheck": "2025-07-11T09:30:15Z"
    }
  }
}
```

### 2. Deployment History

#### GET /api/deployments/home-assistant-config/history
Get deployment history with filtering and pagination.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)
- `status` (optional): Filter by deployment status (completed, failed, in-progress)
- `author` (optional): Filter by author
- `since` (optional): ISO 8601 date string to filter deployments since
- `until` (optional): ISO 8601 date string to filter deployments until

**Response:**
```json
{
  "status": "success",
  "data": {
    "deployments": [
      {
        "deploymentId": "deploy-20250711-092847",
        "state": "completed",
        "repository": "festion/home-assistant-config",
        "branch": "main",
        "commit": "689a045",
        "author": "Jeremy Ames",
        "startTime": "2025-07-11T09:28:47Z",
        "endTime": "2025-07-11T09:30:12Z",
        "duration": 85,
        "result": "success",
        "message": "Deployment completed successfully"
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 127,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

### 3. Manual Deployment

#### POST /api/deployments/home-assistant-config/deploy
Trigger a manual deployment of the home-assistant-config repository.

**Request Body:**
```json
{
  "branch": "main",
  "commit": "689a045",
  "reason": "Manual deployment for emergency fix",
  "skipHealthCheck": false,
  "createBackup": true
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "deploymentId": "deploy-20250711-093245",
    "state": "queued",
    "repository": "festion/home-assistant-config",
    "branch": "main",
    "commit": "689a045",
    "author": "Jeremy Ames",
    "startTime": null,
    "endTime": null,
    "progress": {
      "current": 0,
      "total": 5,
      "stage": "queued",
      "message": "Deployment queued for processing"
    }
  }
}
```

### 4. Rollback Deployment

#### POST /api/deployments/home-assistant-config/rollback
Rollback to a previous deployment or specific backup.

**Request Body:**
```json
{
  "deploymentId": "deploy-20250711-092847",
  "reason": "Rollback due to configuration error",
  "skipHealthCheck": false
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "rollbackId": "rollback-20250711-093845",
    "state": "queued",
    "targetDeploymentId": "deploy-20250711-092847",
    "reason": "Rollback due to configuration error",
    "startTime": null,
    "endTime": null,
    "progress": {
      "current": 0,
      "total": 4,
      "stage": "queued",
      "message": "Rollback queued for processing"
    }
  }
}
```

### 5. Deployment Logs

#### GET /api/deployments/home-assistant-config/logs/{deploymentId}
Get detailed logs for a specific deployment.

**Response:**
```json
{
  "status": "success",
  "data": {
    "deploymentId": "deploy-20250711-092847",
    "logs": [
      {
        "timestamp": "2025-07-11T09:28:47Z",
        "level": "info",
        "stage": "initialization",
        "message": "Starting deployment process",
        "details": {
          "commit": "689a045",
          "branch": "main",
          "author": "Jeremy Ames"
        }
      },
      {
        "timestamp": "2025-07-11T09:28:52Z",
        "level": "info",
        "stage": "backup",
        "message": "Creating configuration backup",
        "details": {
          "backupId": "backup-20250711-092852",
          "backupPath": "/backup/config-20250711-092852.tar.gz"
        }
      },
      {
        "timestamp": "2025-07-11T09:29:15Z",
        "level": "info",
        "stage": "health-check",
        "message": "Pre-deployment health check passed",
        "details": {
          "homeAssistantStatus": "running",
          "configurationValid": true,
          "apiResponsive": true
        }
      }
    ]
  }
}
```

### 6. Health Check

#### GET /api/deployments/home-assistant-config/health
Get current health status of the Home Assistant instance.

**Response:**
```json
{
  "status": "success",
  "data": {
    "timestamp": "2025-07-11T09:35:22Z",
    "homeAssistant": {
      "status": "running",
      "version": "2025.7.0",
      "uptime": "2d 14h 23m",
      "configurationValid": true,
      "apiResponsive": true,
      "responseTime": 45
    },
    "system": {
      "cpu": {
        "usage": 12.5,
        "temperature": 42.3
      },
      "memory": {
        "usage": 68.2,
        "total": 8192,
        "available": 2608
      },
      "storage": {
        "usage": 23.7,
        "total": 32768,
        "available": 25012
      }
    }
  }
}
```

## Webhook Configuration

### GitHub Repository Webhook
Configure webhook in the home-assistant-config repository settings.

**Webhook URL:** `https://192.168.1.58:3070/api/webhooks/github`

**Events to Subscribe:**
- `push` - Repository push events
- `repository_dispatch` - Custom deployment events

**Payload Example:**
```json
{
  "action": "deploy-home-assistant-config",
  "repository": {
    "full_name": "festion/home-assistant-config",
    "clone_url": "https://github.com/festion/home-assistant-config.git"
  },
  "ref": "refs/heads/main",
  "after": "689a045",
  "pusher": {
    "name": "Jeremy Ames",
    "email": "jeremy.ames@example.com"
  },
  "client_payload": {
    "repository": "festion/home-assistant-config",
    "ref": "refs/heads/main",
    "sha": "689a045",
    "author": "Jeremy Ames"
  }
}
```

### Webhook Security
- **Signature Verification**: GitHub webhook signatures verified using HMAC SHA-256
- **Secret Management**: Webhook secrets stored securely
- **Rate Limiting**: Webhook endpoints rate limited to prevent abuse
- **IP Filtering**: Webhook access restricted to GitHub IP ranges

## WebSocket Integration

### Real-time Deployment Status
WebSocket endpoint for real-time deployment status updates.

**WebSocket URL:** `ws://192.168.1.58:3070/ws/deployments`

**Message Format:**
```json
{
  "type": "deployment-status",
  "deploymentId": "deploy-20250711-092847",
  "state": "in-progress",
  "progress": {
    "current": 3,
    "total": 5,
    "stage": "configuration-update",
    "message": "Updating Home Assistant configuration"
  },
  "timestamp": "2025-07-11T09:29:45Z"
}
```

## Error Handling

### HTTP Status Codes
- `200 OK` - Successful request
- `201 Created` - Resource created successfully
- `202 Accepted` - Request accepted for processing
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Deployment conflict (e.g., already in progress)
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

### Error Response Format
```json
{
  "status": "error",
  "error": {
    "code": "DEPLOYMENT_IN_PROGRESS",
    "message": "A deployment is already in progress",
    "details": {
      "currentDeploymentId": "deploy-20250711-092847",
      "currentState": "in-progress"
    },
    "timestamp": "2025-07-11T09:35:22Z"
  }
}
```

## Rate Limiting

### API Endpoints
- **Read Operations**: 100 requests per minute per IP
- **Write Operations**: 10 requests per minute per IP
- **Webhook Endpoints**: 50 requests per minute per IP

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1625678400
```

## Data Validation

### Deployment Request Validation
```javascript
{
  "branch": {
    "type": "string",
    "pattern": "^[a-zA-Z0-9/_-]+$",
    "maxLength": 100,
    "required": true
  },
  "commit": {
    "type": "string",
    "pattern": "^[a-f0-9]{7,40}$",
    "required": false
  },
  "reason": {
    "type": "string",
    "maxLength": 500,
    "required": false
  },
  "skipHealthCheck": {
    "type": "boolean",
    "default": false
  },
  "createBackup": {
    "type": "boolean",
    "default": true
  }
}
```

### Webhook Payload Validation
```javascript
{
  "repository": {
    "type": "object",
    "properties": {
      "full_name": {
        "type": "string",
        "pattern": "^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$"
      }
    },
    "required": ["full_name"]
  },
  "ref": {
    "type": "string",
    "pattern": "^refs/heads/[a-zA-Z0-9/_-]+$"
  },
  "after": {
    "type": "string",
    "pattern": "^[a-f0-9]{40}$"
  }
}
```

## Testing Endpoints

### Development and Testing
- **Test Deployment**: `POST /api/deployments/home-assistant-config/test`
- **Mock Webhook**: `POST /api/webhooks/github/test`
- **Health Check Test**: `GET /api/deployments/home-assistant-config/health/test`

### Testing Utilities
- **Deployment Simulation**: Simulate deployment process without actual changes
- **Webhook Testing**: Test webhook processing with sample payloads
- **Health Check Simulation**: Test health check logic with mock responses
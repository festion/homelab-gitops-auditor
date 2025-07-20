# GitHub Webhook Configuration Guide

## Environment Variables

Create a `.env` file in the project root with the following configuration:

### Required Variables

```bash
# GitHub Webhook Configuration
GITHUB_WEBHOOK_SECRET=your-secure-webhook-secret-here
GITHUB_WEBHOOK_PATH=/api/v2/webhooks/github
WEBHOOK_PROCESSING_TIMEOUT=30000
WEBHOOK_MAX_PAYLOAD_SIZE=5mb
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAY=1000
WEBHOOK_MAX_QUEUE_SIZE=1000

# Server Configuration
NODE_ENV=development
PORT=3070

# API Configuration
API_BASE_URL=http://localhost:3070
DASHBOARD_URL=http://localhost:3000
LOCAL_GIT_ROOT=/mnt/c/GIT
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3070

# Feature Flags
ENABLE_WEBHOOK_HANDLER=true
ENABLE_REAL_TIME_UPDATES=true
```

### Optional Variables

```bash
# Logging
ENABLE_VERBOSE_LOGGING=true

# WebSocket Configuration
WEBSOCKET_MAX_CONNECTIONS=50
WEBSOCKET_DEBOUNCE_DELAY=1000

# Security
SESSION_SECRET=your-session-secret-here

# External Services
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# GitHub Integration
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_ORG=your-organization-name

# Feature Flags
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_CSV_EXPORT=true
```

## Setting Up GitHub Webhooks

### 1. Generate Webhook Secret

Generate a secure secret for webhook signature verification:

```bash
# Generate a random secret
openssl rand -hex 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure GitHub Repository Webhook

1. Go to your GitHub repository
2. Navigate to Settings → Webhooks
3. Click "Add webhook"
4. Configure:
   - **Payload URL**: `https://your-domain.com/api/v2/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use the secret generated above
   - **Events**: Select events you want to receive:
     - Push
     - Pull requests
     - Issues
     - Releases
     - Workflow runs
     - Repository (for repo creation/deletion)
     - Stars (optional)

### 3. Configure GitHub Organization Webhook (Optional)

For organization-level webhooks:

1. Go to your GitHub organization
2. Navigate to Settings → Webhooks
3. Follow the same configuration as repository webhooks

## Webhook Events Handled

The webhook receiver handles the following GitHub events:

### Repository Events
- `repository` - Repository created, deleted, transferred

### Code Events
- `push` - Code pushed to repository
- `pull_request` - PR opened, closed, synchronized

### CI/CD Events
- `workflow_run` - GitHub Actions workflow completed

### Project Management Events
- `issues` - Issues opened, closed, edited
- `release` - Releases published
- `star` - Repository starred/unstarred

## Event Processing Flow

1. **Webhook Reception**: GitHub sends webhook to `/api/v2/webhooks/github`
2. **Signature Verification**: HMAC-SHA256 signature validation
3. **Event Queuing**: Events are queued for processing with retry logic
4. **Event Processing**: Events are processed asynchronously
5. **WebSocket Broadcast**: Real-time updates sent to dashboard
6. **Action Triggers**: Specific actions triggered based on event type

## Webhook Management API

### Get Webhook Status
```http
GET /api/v2/webhooks/status
```

### Get Recent Events
```http
GET /api/v2/webhooks/events?limit=50&type=push&repository=repo-name
```

### Queue Management
```http
POST /api/v2/webhooks/queue/pause
POST /api/v2/webhooks/queue/resume
POST /api/v2/webhooks/queue/cleanup
```

### Test Webhook (Development)
```http
POST /api/v2/webhooks/test
Content-Type: application/json

{
  "eventType": "push",
  "repository": "test/repo"
}
```

## Security Considerations

1. **Webhook Secret**: Always use a strong, randomly generated secret
2. **HTTPS**: Use HTTPS in production for webhook endpoint
3. **IP Allowlist**: Consider restricting webhook source IPs to GitHub's ranges
4. **Rate Limiting**: Webhook endpoint has built-in rate limiting
5. **Payload Limits**: Maximum payload size is configurable (default 5MB)

## Monitoring and Troubleshooting

### Check Webhook Status
```bash
curl http://localhost:3070/api/v2/webhooks/status
```

### View Event Queue
```bash
curl http://localhost:3070/api/v2/webhooks/events
```

### Common Issues

1. **Invalid Signature**: Check webhook secret configuration
2. **Queue Backup**: Monitor queue size via status endpoint
3. **Processing Failures**: Check application logs for errors
4. **WebSocket Issues**: Verify WebSocket service is running

### Logs

Webhook processing logs include:
- Event reception and validation
- Queue operations
- Processing results
- Error details

Example log format:
```
🪝 GitHub webhook handler initialized - endpoint: /api/v2/webhooks/github
📝 Event queued: push_owner/repo_main_abc123_2025-01-10T10:00:00Z (queue: 1)
✅ Event processed successfully: push_owner/repo_main_abc123_2025-01-10T10:00:00Z
```

## Integration with Other Services

### WebSocket Service
Webhook events are automatically broadcast to connected WebSocket clients for real-time dashboard updates.

### Pipeline Service
Webhook events can trigger pipeline executions for CI/CD workflows.

### Audit Service
Repository changes trigger audit refreshes to keep compliance data current.

### Notification Service
Critical events can trigger email notifications or other alerting mechanisms.
# Configuration Management

The GitOps Auditor supports user-configurable settings for production server addresses, local repository paths, and other key parameters.

## Quick Configuration

### Method 1: Interactive Configuration (Recommended)
```bash
# Run the interactive configuration wizard
./scripts/config/config-manager.sh interactive
```

### Method 2: Command Line Configuration
```bash
# Set production server IP
./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "192.168.1.100"

# Set local Git repository root
./scripts/config/config-manager.sh set LOCAL_GIT_ROOT "/home/user/repositories"

# Set GitHub username
./scripts/config/config-manager.sh set GITHUB_USER "your-username"
```

### Method 3: Manual Configuration File
```bash
# Create user configuration file
./scripts/config/config-manager.sh create-user-config

# Edit the configuration file
nano config/settings.local.conf
```

## Configuration Files

- **`config/settings.conf`** - Default configuration (version controlled)
- **`config/settings.local.conf`** - User overrides (gitignored, create this file)

The user configuration file overrides the defaults and is not tracked by git, making it safe for personal settings.

## Key Configuration Options

### Production Server
```bash
PRODUCTION_SERVER_IP="192.168.1.58"     # Production server IP address
PRODUCTION_SERVER_USER="root"            # SSH username
PRODUCTION_SERVER_PORT="22"              # SSH port
PRODUCTION_BASE_PATH="/opt/gitops"       # Installation path on production
```

### Local Development
```bash
LOCAL_GIT_ROOT="/mnt/c/GIT"              # Local Git repositories directory
DEVELOPMENT_API_PORT="3070"              # Local API server port
DEVELOPMENT_DASHBOARD_PORT="5173"        # Local dashboard port
```

### GitHub Integration
```bash
GITHUB_USER="festion"                    # GitHub username for repository sync
```

### Audit Settings
```bash
AUDIT_SCHEDULE="0 3 * * *"               # Cron schedule for automated audits
MAX_AUDIT_HISTORY="30"                   # Days of audit history to retain
ENABLE_AUTO_MITIGATION="false"           # Enable automatic issue fixes
```

## Configuration Management Commands

### View Current Configuration
```bash
./scripts/config/config-manager.sh show
```

### Validate Configuration
```bash
./scripts/config/config-manager.sh validate
```

### Test Production Server Connection
```bash
./scripts/config/config-manager.sh test-connection
```

### Get/Set Individual Values
```bash
# Get a configuration value
./scripts/config/config-manager.sh get PRODUCTION_SERVER_IP

# Set a configuration value
./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "192.168.1.200"
```

### Reset to Defaults
```bash
./scripts/config/config-manager.sh reset
```

## Environment-Specific URLs

The system automatically generates URLs based on your configuration:

### Development URLs
- **Dashboard**: `http://localhost:{DEVELOPMENT_DASHBOARD_PORT}`
- **API**: `http://localhost:{DEVELOPMENT_API_PORT}`

### Production URLs
- **Dashboard**: `http://{PRODUCTION_SERVER_IP}/`
- **API**: `http://{PRODUCTION_SERVER_IP}:{DEVELOPMENT_API_PORT}`

## Examples

### Home Lab Setup
```bash
# Configure for a typical home lab
./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "192.168.1.100"
./scripts/config/config-manager.sh set LOCAL_GIT_ROOT "/home/user/git"
./scripts/config/config-manager.sh set GITHUB_USER "homelab-user"
```

### Windows WSL Setup
```bash
# Configure for Windows WSL environment
./scripts/config/config-manager.sh set LOCAL_GIT_ROOT "/mnt/c/Users/YourName/Git"
./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "192.168.1.58"
```

### Corporate Environment
```bash
# Configure for corporate network
./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "10.0.1.50"
./scripts/config/config-manager.sh set PRODUCTION_SERVER_USER "gitops"
./scripts/config/config-manager.sh set DEVELOPMENT_API_PORT "8080"
```

## Deployment with Custom Configuration

The deployment scripts automatically use your configuration:

```bash
# Deploy to your configured production server
./scripts/deployment/deploy-production.sh

# Run audit with your settings
./scripts/comprehensive_audit.sh --dev
```

## Troubleshooting

### Configuration Issues
```bash
# Check current configuration
./scripts/config/config-manager.sh show

# Validate configuration
./scripts/config/config-manager.sh validate

# Test connection to production server
./scripts/config/config-manager.sh test-connection
```

### Common Configuration Problems

1. **Local Git Root Not Found**
   ```bash
   # Fix: Set correct path to your Git repositories
   ./scripts/config/config-manager.sh set LOCAL_GIT_ROOT "/correct/path/to/git"
   ```

2. **Production Server Unreachable**
   ```bash
   # Test connection
   ./scripts/config/config-manager.sh test-connection
   
   # Update IP if needed
   ./scripts/config/config-manager.sh set PRODUCTION_SERVER_IP "correct.ip.address"
   ```

3. **Port Conflicts**
   ```bash
   # Change API port if 3070 is in use
   ./scripts/config/config-manager.sh set DEVELOPMENT_API_PORT "3071"
   
   # Change dashboard port if 5173 is in use
   ./scripts/config/config-manager.sh set DEVELOPMENT_DASHBOARD_PORT "5174"
   ```

## Security Considerations

- User configuration files (`settings.local.conf`) are automatically excluded from git
- SSH key-based authentication is recommended for production server access
- API endpoints can be restricted using the `ALLOWED_ORIGINS` setting
- Consider enabling API authentication in production environments

## Migration from Hardcoded Settings

If upgrading from a version with hardcoded settings:

1. **Run the configuration wizard**:
   ```bash
   ./scripts/config/config-manager.sh interactive
   ```

2. **Update your existing settings**:
   - Production server IP (was hardcoded to 192.168.1.58)
   - Local Git root (was hardcoded to /mnt/c/GIT)
   - GitHub username (was hardcoded to "festion")

3. **Test the new configuration**:
   ```bash
   ./scripts/config/config-manager.sh validate
   ./scripts/config/config-manager.sh test-connection
   ```

4. **Deploy with new settings**:
   ```bash
   ./scripts/deployment/deploy-production.sh
   ```
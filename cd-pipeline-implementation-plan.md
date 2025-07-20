## Detailed Plan: Complete CD Pipeline with Auto-Commit Integration

### Current State Analysis
1. **CI Pipeline**: Fully automated with GitHub Actions (YAML lint + HA validation)
2. **CD Pipeline**: Manual sync script using Samba share (likely to fail due to outdated paths/configs)
3. **Auto-Commit**: Claude auto-commit feature available in GitHub MCP server
4. **DevOps Platform**: homelab-gitops-auditor ready for integration

### Detailed Implementation Steps

#### Phase 1: GitHub Actions CD Workflow Setup

**Step 1.1: Create Deployment Workflow File**
```yaml
# .github/workflows/deploy-to-production.yml
name: Deploy to Production

on:
  workflow_run:
    workflows: ["YAML Lint & Home Assistant Validation"]
    types:
      - completed
    branches:
      - main
      - master

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup deployment environment
        run: |
          # Install required tools
          sudo apt-get update
          sudo apt-get install -y openssh-client rsync jq curl
          
      - name: Configure SSH
        env:
          SSH_PRIVATE_KEY: ${{ secrets.HA_DEPLOY_SSH_KEY }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          # Add HA server to known hosts
          ssh-keyscan -H 192.168.1.155 >> ~/.ssh/known_hosts
```

**Step 1.2: Add Pre-deployment Validation**
```yaml
      - name: Validate configuration locally
        run: |
          # Create validation script
          cat > validate_config.sh << 'EOF'
          #!/bin/bash
          # Check for required files
          required_files=("configuration.yaml" "automations.yaml" "scripts.yaml")
          for file in "${required_files[@]}"; do
            if [ ! -f "$file" ]; then
              echo "ERROR: Required file $file not found"
              exit 1
            fi
          done
          
          # Validate YAML syntax
          python3 -m pip install pyyaml
          python3 -c "
          import yaml
          import sys
          files_to_check = ['configuration.yaml', 'automations.yaml', 'scripts.yaml']
          for file in files_to_check:
              try:
                  with open(file, 'r') as f:
                      yaml.safe_load(f)
                  print(f'{file}: Valid')
              except Exception as e:
                  print(f'{file}: Invalid - {e}')
                  sys.exit(1)
          "
          EOF
          chmod +x validate_config.sh
          ./validate_config.sh
```

**Step 1.3: Create Deployment Execution**
```yaml
      - name: Deploy to Home Assistant
        env:
          HA_HOST: ${{ secrets.HA_PRODUCTION_HOST }}
          HA_USER: ${{ secrets.HA_DEPLOY_USER }}
        run: |
          # Create deployment script
          cat > deploy.sh << 'EOF'
          #!/bin/bash
          set -e
          
          # Configuration
          REMOTE_PATH="/config"
          LOCAL_PATH="."
          BACKUP_PATH="/config/backups/auto-deploy-$(date +%Y%m%d-%H%M%S)"
          
          echo "Starting deployment to Home Assistant..."
          
          # Create backup on remote
          ssh -i ~/.ssh/deploy_key ${HA_USER}@${HA_HOST} "mkdir -p $BACKUP_PATH"
          ssh -i ~/.ssh/deploy_key ${HA_USER}@${HA_HOST} "cp -r $REMOTE_PATH/* $BACKUP_PATH/"
          
          # Sync files (excluding sensitive and temporary files)
          rsync -avz --delete \
            --exclude='.git' \
            --exclude='.storage' \
            --exclude='*.log' \
            --exclude='*.db' \
            --exclude='secrets.yaml' \
            --exclude='known_devices.yaml' \
            --exclude='home-assistant_v2.db' \
            -e "ssh -i ~/.ssh/deploy_key" \
            ${LOCAL_PATH}/ ${HA_USER}@${HA_HOST}:${REMOTE_PATH}/
          
          echo "Files synchronized successfully"
          EOF
          chmod +x deploy.sh
          ./deploy.sh
```

#### Phase 2: Home Assistant API Integration

**Step 2.1: Configuration Check via API**
```yaml
      - name: Validate configuration via HA API
        env:
          HA_TOKEN: ${{ secrets.HA_API_TOKEN }}
          HA_URL: ${{ secrets.HA_URL }}
        run: |
          # Check configuration validity
          response=$(curl -s -X POST \
            -H "Authorization: Bearer ${HA_TOKEN}" \
            -H "Content-Type: application/json" \
            "${HA_URL}/api/config/core/check_config")
          
          if echo "$response" | jq -e '.valid == true' > /dev/null; then
            echo "Configuration is valid"
          else
            echo "Configuration validation failed:"
            echo "$response" | jq .
            exit 1
          fi
```

**Step 2.2: Reload Configuration**
```yaml
      - name: Reload Home Assistant configuration
        env:
          HA_TOKEN: ${{ secrets.HA_API_TOKEN }}
          HA_URL: ${{ secrets.HA_URL }}
        run: |
          # Reload core configuration
          curl -X POST \
            -H "Authorization: Bearer ${HA_TOKEN}" \
            -H "Content-Type: application/json" \
            "${HA_URL}/api/services/homeassistant/reload_core_config"
          
          # Reload automations
          curl -X POST \
            -H "Authorization: Bearer ${HA_TOKEN}" \
            -H "Content-Type: application/json" \
            "${HA_URL}/api/services/automation/reload"
          
          # Reload scripts
          curl -X POST \
            -H "Authorization: Bearer ${HA_TOKEN}" \
            -H "Content-Type: application/json" \
            "${HA_URL}/api/services/script/reload"
          
          # Wait for reload to complete
          sleep 10
```

#### Phase 3: Health Check Implementation

**Step 3.1: Post-deployment Health Verification**
```yaml
      - name: Verify deployment health
        env:
          HA_TOKEN: ${{ secrets.HA_API_TOKEN }}
          HA_URL: ${{ secrets.HA_URL }}
        run: |
          cat > health_check.sh << 'EOF'
          #!/bin/bash
          set -e
          
          # Function to check health
          check_health() {
            # Check if HA is responding
            if ! curl -s -f -H "Authorization: Bearer ${HA_TOKEN}" "${HA_URL}/api/" > /dev/null; then
              return 1
            fi
            
            # Check integration health percentage
            health=$(curl -s -H "Authorization: Bearer ${HA_TOKEN}" \
              "${HA_URL}/api/states/sensor.integration_health_percentage" | \
              jq -r '.state' 2>/dev/null || echo "0")
            
            if [ "${health%.*}" -lt 80 ]; then
              echo "Health check failed: Integration health at ${health}%"
              return 1
            fi
            
            # Check for critical errors in log
            errors=$(curl -s -H "Authorization: Bearer ${HA_TOKEN}" \
              "${HA_URL}/api/error_log" | grep -c "ERROR" || true)
            
            if [ "$errors" -gt 10 ]; then
              echo "Too many errors in log: $errors"
              return 1
            fi
            
            return 0
          }
          
          # Retry health check
          for i in {1..5}; do
            echo "Health check attempt $i..."
            if check_health; then
              echo "Health check passed"
              exit 0
            fi
            sleep 10
          done
          
          echo "Health check failed after 5 attempts"
          exit 1
          EOF
          chmod +x health_check.sh
          ./health_check.sh
```

#### Phase 4: Auto-Commit Integration

**Step 4.1: Generate Deployment Commit Message**
```yaml
      - name: Generate deployment commit message
        id: commit_message
        run: |
          # Create a summary of changes
          CHANGES=$(git log --oneline -n 5 --pretty=format:"- %s")
          
          # Generate deployment message
          MESSAGE="🚀 Deploy to production
          
          Deployment triggered by successful CI run.
          
          Changes included:
          $CHANGES
          
          Deployment ID: ${{ github.run_id }}
          Workflow: ${{ github.workflow }}
          "
          
          # Set output for later use
          echo "message<<EOF" >> $GITHUB_OUTPUT
          echo "$MESSAGE" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
```

**Step 4.2: Create Deployment Tag**
```yaml
      - name: Tag deployment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Create deployment tag
          TAG_NAME="deploy-$(date +%Y%m%d-%H%M%S)"
          
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          
          git tag -a "$TAG_NAME" -m "${{ steps.commit_message.outputs.message }}"
          git push origin "$TAG_NAME"
```

#### Phase 5: Rollback Mechanism

**Step 5.1: Automatic Rollback on Failure**
```yaml
      - name: Rollback on failure
        if: failure()
        env:
          HA_HOST: ${{ secrets.HA_PRODUCTION_HOST }}
          HA_USER: ${{ secrets.HA_DEPLOY_USER }}
        run: |
          echo "Deployment failed, initiating rollback..."
          
          # Get latest backup directory
          LATEST_BACKUP=$(ssh -i ~/.ssh/deploy_key ${HA_USER}@${HA_HOST} \
            "ls -t /config/backups/auto-deploy-* | head -1")
          
          if [ -n "$LATEST_BACKUP" ]; then
            # Restore from backup
            ssh -i ~/.ssh/deploy_key ${HA_USER}@${HA_HOST} \
              "cp -r $LATEST_BACKUP/* /config/"
            
            # Reload HA with restored config
            curl -X POST \
              -H "Authorization: Bearer ${HA_TOKEN}" \
              -H "Content-Type: application/json" \
              "${HA_URL}/api/services/homeassistant/reload_core_config"
            
            echo "Rollback completed"
          else
            echo "No backup found for rollback"
            exit 1
          fi
```

#### Phase 6: Monitoring Integration

**Step 6.1: Notify homelab-gitops-auditor**
```yaml
      - name: Report deployment to DevOps platform
        if: always()
        env:
          AUDITOR_WEBHOOK: ${{ secrets.GITOPS_AUDITOR_WEBHOOK }}
        run: |
          # Prepare deployment report
          REPORT=$(cat << EOF
          {
            "repository": "${{ github.repository }}",
            "deployment_id": "${{ github.run_id }}",
            "status": "${{ job.status }}",
            "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
            "commit": "${{ github.sha }}",
            "deployer": "${{ github.actor }}",
            "environment": "production",
            "health_check": "${{ steps.health_check.outcome }}",
            "rollback_performed": "${{ steps.rollback.outcome == 'success' }}"
          }
          EOF
          )
          
          # Send to auditor platform
          curl -X POST \
            -H "Content-Type: application/json" \
            -d "$REPORT" \
            "$AUDITOR_WEBHOOK"
```

### GitHub Secrets Required

1. **HA_DEPLOY_SSH_KEY**: SSH private key for deployment user
2. **HA_PRODUCTION_HOST**: IP address (192.168.1.155)
3. **HA_DEPLOY_USER**: Username for SSH access
4. **HA_API_TOKEN**: Home Assistant long-lived access token
5. **HA_URL**: Full URL (http://192.168.1.155:8123)
6. **GITOPS_AUDITOR_WEBHOOK**: Webhook URL for monitoring platform

### Setup Instructions

1. **Create deployment user on HA**:
   ```bash
   # On HA server
   sudo useradd -m -s /bin/bash ha-deploy
   sudo usermod -aG homeassistant ha-deploy
   sudo -u ha-deploy ssh-keygen -t ed25519
   # Add public key to authorized_keys
   ```

2. **Generate HA API token**:
   - Go to HA Profile → Long-Lived Access Tokens
   - Create new token named "GitHub Deploy"
   - Save token in GitHub secrets

3. **Configure GitHub repository**:
   - Go to Settings → Secrets and variables → Actions
   - Add all required secrets
   - Enable Actions if not already enabled

4. **Test deployment workflow**:
   - Create a test branch
   - Make a small change
   - Create PR to trigger CI/CD pipeline
   - Monitor deployment logs

### Maintenance Tasks

1. **Regular backup cleanup**: Delete deployments older than 30 days
2. **Monitor deployment success rate**: Track in homelab-gitops-auditor
3. **Update SSH keys annually**: Rotate for security
4. **Review and update health checks**: As HA configuration grows

### Benefits

- **Fully automated**: No manual intervention required
- **Reliable**: SSH/API more stable than Samba
- **Auditable**: Complete deployment history with auto-commit
- **Safe**: Automatic rollback on failures
- **Integrated**: Works with existing DevOps platform

### Risk Mitigation

- Test deployment workflow in dev environment first
- Implement gradual rollout (canary deployments)
- Keep manual override capability
- Maintain deployment logs for troubleshooting
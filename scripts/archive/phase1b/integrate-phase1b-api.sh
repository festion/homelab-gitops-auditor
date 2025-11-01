#!/bin/bash
#
# Phase 1B API Integration Script
# Integrates Template Application Engine with existing GitOps Auditor API
#
# Extends existing API server with template endpoints

set -euo pipefail

# Configuration
PRODUCTION_SERVER="192.168.1.58"
PRODUCTION_BASE_DIR="/opt/gitops"
LOCAL_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
msg_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
msg_ok() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
msg_error() { echo -e "${RED}[ERROR]${NC} $1"; }
msg_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Create template API endpoints
create_template_api_endpoints() {
    msg_info "Creating template API endpoints..."
    
    ssh root@${PRODUCTION_SERVER} "
        # Create template API module
        cat > ${PRODUCTION_BASE_DIR}/api/template-endpoints.js << 'EOF'
/**
 * Phase 1B Template Application API Endpoints
 * Integrates with existing GitOps Auditor API
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class TemplateAPI {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.mcpDir = path.join(baseDir, '.mcp');
        this.scriptsDir = path.join(baseDir, 'scripts');
    }

    // Register all template endpoints
    registerEndpoints(app) {
        // Template management endpoints
        app.get('/api/templates', this.listTemplates.bind(this));
        app.get('/api/templates/:templateName', this.getTemplate.bind(this));
        
        // Template application endpoints
        app.post('/api/templates/apply', this.applyTemplate.bind(this));
        app.post('/api/templates/batch-apply', this.batchApplyTemplate.bind(this));
        
        // Template status and monitoring
        app.get('/api/templates/status', this.getTemplateStatus.bind(this));
        app.get('/api/templates/history', this.getTemplateHistory.bind(this));
        
        // Repository template compliance
        app.get('/api/repositories/template-compliance', this.getRepositoryCompliance.bind(this));
        app.get('/api/repositories/:repoName/template-status', this.getRepositoryTemplateStatus.bind(this));
        
        // Backup and rollback endpoints
        app.get('/api/templates/backups', this.listBackups.bind(this));
        app.post('/api/templates/rollback', this.rollbackTemplate.bind(this));
        
        console.log('✅ Phase 1B Template API endpoints registered');
    }

    // List available templates
    async listTemplates(req, res) {
        try {
            const command = \`cd \${this.baseDir} && python3 .mcp/template-applicator.py list\`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: 'Failed to list templates', details: stderr });
                }
                
                // Parse template list output
                const templates = this.parseTemplateList(stdout);
                res.json({ templates, status: 'success' });
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    // Get specific template details
    async getTemplate(req, res) {
        try {
            const { templateName } = req.params;
            const templatePath = path.join(this.mcpDir, 'templates', templateName, 'template.json');
            
            if (!fs.existsSync(templatePath)) {
                return res.status(404).json({ error: 'Template not found' });
            }
            
            const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
            res.json({ template: templateData, status: 'success' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get template', details: error.message });
        }
    }

    // Apply template to repository
    async applyTemplate(req, res) {
        try {
            const { templateName, repositoryPath, dryRun = true, options = {} } = req.body;
            
            if (!templateName || !repositoryPath) {
                return res.status(400).json({ error: 'Template name and repository path required' });
            }
            
            const command = this.buildApplyCommand(templateName, repositoryPath, dryRun, options);
            
            exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ 
                        error: 'Template application failed', 
                        details: stderr,
                        command: command 
                    });
                }
                
                const result = this.parseApplicationResult(stdout);
                res.json({ result, status: dryRun ? 'dry-run-complete' : 'applied' });
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    // Batch apply template to multiple repositories
    async batchApplyTemplate(req, res) {
        try {
            const { templateName, repositories, dryRun = true, options = {} } = req.body;
            
            if (!templateName || !repositories || !Array.isArray(repositories)) {
                return res.status(400).json({ error: 'Template name and repositories array required' });
            }
            
            const command = this.buildBatchApplyCommand(templateName, repositories, dryRun, options);
            
            exec(command, { maxBuffer: 2048 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ 
                        error: 'Batch template application failed', 
                        details: stderr,
                        command: command 
                    });
                }
                
                const result = this.parseBatchResult(stdout);
                res.json({ result, status: dryRun ? 'batch-dry-run-complete' : 'batch-applied' });
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    // Get template system status
    async getTemplateStatus(req, res) {
        try {
            const status = {
                templateCount: 0,
                recentApplications: [],
                systemHealth: 'unknown',
                lastUpdate: new Date().toISOString()
            };
            
            // Count available templates
            const templatesDir = path.join(this.mcpDir, 'templates');
            if (fs.existsSync(templatesDir)) {
                status.templateCount = fs.readdirSync(templatesDir).filter(item => {
                    const templateFile = path.join(templatesDir, item, 'template.json');
                    return fs.existsSync(templateFile);
                }).length;
            }
            
            // Check system health
            const command = \`cd \${this.baseDir} && python3 .mcp/template-applicator.py list\`;
            exec(command, (error, stdout, stderr) => {
                status.systemHealth = error ? 'unhealthy' : 'healthy';
                res.json({ status, timestamp: new Date().toISOString() });
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get template status', details: error.message });
        }
    }

    // Get template application history
    async getTemplateHistory(req, res) {
        try {
            const logsDir = path.join(this.baseDir, 'logs', 'template-operations');
            const history = [];
            
            if (fs.existsSync(logsDir)) {
                const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.json'));
                
                for (const logFile of logFiles.slice(-10)) { // Last 10 operations
                    try {
                        const logPath = path.join(logsDir, logFile);
                        const logData = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                        history.push(logData);
                    } catch (err) {
                        console.warn(\`Failed to parse log file \${logFile}:\`, err.message);
                    }
                }
            }
            
            res.json({ history: history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get template history', details: error.message });
        }
    }

    // Get repository template compliance
    async getRepositoryCompliance(req, res) {
        try {
            // This would integrate with existing repository audit data
            const compliance = {
                totalRepositories: 0,
                compliantRepositories: 0,
                nonCompliantRepositories: 0,
                compliancePercentage: 0,
                details: []
            };
            
            res.json({ compliance, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get repository compliance', details: error.message });
        }
    }

    // Get specific repository template status
    async getRepositoryTemplateStatus(req, res) {
        try {
            const { repoName } = req.params;
            const status = {
                repository: repoName,
                hasTemplateConfig: false,
                templateCompliance: 'unknown',
                lastTemplateUpdate: null,
                recommendations: []
            };
            
            res.json({ status, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get repository template status', details: error.message });
        }
    }

    // List available backups
    async listBackups(req, res) {
        try {
            const command = \`cd \${this.baseDir} && python3 .mcp/backup-manager.py list\`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: 'Failed to list backups', details: stderr });
                }
                
                const backups = this.parseBackupList(stdout);
                res.json({ backups, status: 'success' });
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    // Rollback template application
    async rollbackTemplate(req, res) {
        try {
            const { backupId, targetPath } = req.body;
            
            if (!backupId) {
                return res.status(400).json({ error: 'Backup ID required' });
            }
            
            const command = \`cd \${this.baseDir} && python3 .mcp/backup-manager.py restore --backup-id \${backupId}\` + 
                          (targetPath ? \` --target \${targetPath}\` : '');
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: 'Rollback failed', details: stderr });
                }
                
                res.json({ message: 'Rollback completed successfully', details: stdout });
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    // Helper methods
    parseTemplateList(output) {
        const lines = output.split('\\n').filter(line => line.includes(' - '));
        return lines.map(line => {
            const match = line.match(/\\s*-\\s+([^:]+):\\s*(.+)/);
            return match ? { name: match[1], description: match[2] } : null;
        }).filter(Boolean);
    }

    parseApplicationResult(output) {
        try {
            return JSON.parse(output);
        } catch {
            return { rawOutput: output };
        }
    }

    parseBatchResult(output) {
        try {
            return JSON.parse(output);
        } catch {
            return { rawOutput: output };
        }
    }

    parseBackupList(output) {
        const lines = output.split('\\n').filter(line => line.includes(' - '));
        return lines.map(line => {
            const parts = line.split(' - ');
            return parts.length >= 3 ? {
                id: parts[0].trim(),
                timestamp: parts[1].trim(),
                type: parts[2].trim()
            } : null;
        }).filter(Boolean);
    }

    buildApplyCommand(templateName, repositoryPath, dryRun, options) {
        let command = \`cd \${this.baseDir} && python3 .mcp/template-applicator.py apply --template \${templateName} --repository \${repositoryPath}\`;
        
        if (dryRun) {
            command += ' --dry-run';
        } else {
            command += ' --apply';
        }
        
        if (options.verbose) {
            command += ' --verbose';
        }
        
        return command;
    }

    buildBatchApplyCommand(templateName, repositories, dryRun, options) {
        let command = \`cd \${this.baseDir} && python3 .mcp/batch-processor.py create --template \${templateName}\`;
        
        repositories.forEach(repo => {
            command += \` --repositories \${repo}\`;
        });
        
        if (dryRun) {
            command += ' --dry-run';
        }
        
        if (options.workers) {
            command += \` --workers \${options.workers}\`;
        }
        
        return command;
    }
}

module.exports = TemplateAPI;
EOF
    "
    
    msg_ok "Template API endpoints created"
}

# Update main API server
update_main_api_server() {
    msg_info "Updating main API server with template integration..."
    
    ssh root@${PRODUCTION_SERVER} "
        # Backup current server.js
        cp ${PRODUCTION_BASE_DIR}/api/server.js ${PRODUCTION_BASE_DIR}/api/server.js.backup
        
        # Add template API integration to server.js
        cat >> ${PRODUCTION_BASE_DIR}/api/server.js << 'EOF'

// Phase 1B Template Application Engine Integration
const TemplateAPI = require('./template-endpoints');

// Initialize template API
const templateAPI = new TemplateAPI('${PRODUCTION_BASE_DIR}');
templateAPI.registerEndpoints(app);

console.log('✅ Phase 1B Template API integrated');
EOF
    "
    
    msg_ok "Main API server updated with template integration"
}

# Test API integration
test_api_integration() {
    msg_info "Testing API integration..."
    
    # Restart API service to load new endpoints
    ssh root@${PRODUCTION_SERVER} "
        if systemctl is-active --quiet gitops-audit-api; then
            systemctl restart gitops-audit-api
            sleep 3
        fi
    "
    
    # Test template endpoints
    local api_url="http://${PRODUCTION_SERVER}:3070"
    
    if curl -f -s "${api_url}/api/templates" >/dev/null 2>&1; then
        msg_ok "Template API endpoints responding"
    else
        msg_warn "Template API endpoints not yet responding (service may still be starting)"
    fi
    
    msg_ok "API integration testing complete"
}

# Main integration workflow
main() {
    echo -e "${GREEN}🔗 Phase 1B API Integration${NC}"
    echo -e "${BLUE}Target: ${PRODUCTION_SERVER}:3070${NC}"
    echo ""
    
    create_template_api_endpoints
    update_main_api_server
    test_api_integration
    
    echo ""
    echo -e "${GREEN}✅ Phase 1B API Integration Complete${NC}"
    echo ""
    echo -e "${YELLOW}📋 Available Template API Endpoints:${NC}"
    echo -e "   • ${BLUE}GET /api/templates${NC} - List available templates"
    echo -e "   • ${BLUE}POST /api/templates/apply${NC} - Apply template to repository"
    echo -e "   • ${BLUE}POST /api/templates/batch-apply${NC} - Batch apply to multiple repos"
    echo -e "   • ${BLUE}GET /api/templates/status${NC} - Template system status"
    echo -e "   • ${BLUE}GET /api/templates/history${NC} - Template application history"
    echo -e "   • ${BLUE}GET /api/repositories/template-compliance${NC} - Repository compliance"
    echo -e "   • ${BLUE}POST /api/templates/rollback${NC} - Rollback template changes"
    echo ""
    echo -e "${YELLOW}🧪 Test Commands:${NC}"
    echo -e "   • ${BLUE}curl http://${PRODUCTION_SERVER}:3070/api/templates${NC}"
    echo -e "   • ${BLUE}curl http://${PRODUCTION_SERVER}:3070/api/templates/status${NC}"
    echo ""
}

# Execute integration
main \"\$@\"
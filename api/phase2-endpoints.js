// Phase 2 API Endpoints
// Extends the main API server with Phase 2 DevOps platform features

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import authentication middleware
const { 
  authenticate, 
  authenticateOptional, 
  authorize, 
  requireRole 
} = require('./middleware/auth');
const { Permission } = require('./models/user');

// Create Phase 2 router
const phase2Router = express.Router();

module.exports = phase2Router;

// Helper function to emit WebSocket events
function emitWSEvent(req, channel, event, data) {
  const phase2WS = req.app.locals.phase2WS;
  if (phase2WS) {
    phase2WS.emit(channel, event, data);
  }
}

// In-memory storage for development (replace with database in production)
const storage = {
  templates: new Map(),
  pipelines: new Map(),
  dependencies: new Map(),
  qualityGates: new Map(),
  operations: new Map()
};

// Initialize with sample data
function initializeSampleData() {
  // Templates
  storage.templates.set('standard-devops', {
    id: 'standard-devops',
    name: 'Standard DevOps Template',
    description: 'Comprehensive DevOps project template with GitOps, CI/CD, and MCP integration',
    version: '1.0.0',
    files: ['.mcp.json', 'CLAUDE.md', 'scripts/', '.gitignore', '.github/workflows/'],
    lastUpdated: new Date().toISOString(),
    downloads: 42,
    tags: ['devops', 'gitops', 'mcp', 'ci/cd']
  });

  storage.templates.set('microservice-template', {
    id: 'microservice-template',
    name: 'Microservice Template',
    description: 'Docker-based microservice template with K8s manifests',
    version: '2.1.0',
    files: ['Dockerfile', 'docker-compose.yml', 'k8s/', '.dockerignore'],
    lastUpdated: new Date().toISOString(),
    downloads: 28,
    tags: ['docker', 'kubernetes', 'microservice']
  });

  // Pipelines
  storage.pipelines.set('test-pipeline-1', {
    id: 'test-pipeline-1',
    name: 'Node.js CI/CD',
    repository: 'homelab-gitops-auditor',
    description: 'Automated testing and deployment for Node.js applications',
    status: 'active',
    created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    successRate: 95,
    avgDuration: 180, // seconds
    stages: ['quality', 'build', 'test', 'deploy'],
    triggers: ['push', 'pull_request']
  });

  // Quality Gates
  storage.qualityGates.set('code-linting', {
    id: 'code-linting',
    name: 'Code Linting',
    type: 'pre_commit',
    description: 'ESLint and Prettier checks',
    status: 'active',
    passRate: 95,
    lastRun: new Date().toISOString(),
    rules: ['eslint:recommended', 'prettier/recommended'],
    threshold: 90
  });
}

// Initialize sample data on startup
initializeSampleData();

// Middleware for request validation
const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missingFields
      });
    }
    next();
  };
};

// ===============================
// Template Management Endpoints
// ===============================

// Get all templates with filtering and pagination
phase2Router.get('/templates', (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      sort = 'downloads', 
      order = 'desc',
      tags 
    } = req.query;

    let templates = Array.from(storage.templates.values());

    // Filter by tags if provided
    if (tags) {
      const tagList = tags.split(',');
      templates = templates.filter(template => 
        tagList.some(tag => template.tags.includes(tag))
      );
    }

    // Sort templates
    templates.sort((a, b) => {
      const aVal = a[sort] || 0;
      const bVal = b[sort] || 0;
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTemplates = templates.slice(startIndex, endIndex);

    res.json({
      templates: paginatedTemplates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: templates.length,
        pages: Math.ceil(templates.length / limit)
      },
      filters: {
        availableTags: ['devops', 'gitops', 'mcp', 'ci/cd', 'docker', 'kubernetes', 'microservice']
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates', details: error.message });
  }
});

// Get specific template details
phase2Router.get('/templates/:id', (req, res) => {
  const template = storage.templates.get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

// Get template engine status
phase2Router.get('/templates/status', (req, res) => {
  res.json({
    engine_status: 'operational',
    templates_available: storage.templates.size,
    backup_system: 'active',
    last_operation: storage.operations.size > 0 
      ? Array.from(storage.operations.values()).pop().timestamp 
      : null,
    capabilities: ['apply', 'preview', 'rollback', 'diff']
  });
});

// Apply template to repository
phase2Router.post('/templates/apply', 
  authenticate, 
  authorize(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.APPLY),
  validateRequest(['templateName', 'repositoryPath']), 
  async (req, res) => {
  try {
    const { templateName, repositoryPath, dryRun = true, options = {} } = req.body;
    
    const template = storage.templates.get(templateName);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const operationId = `apply_${uuidv4()}`;
    const operation = {
      id: operationId,
      type: 'template_apply',
      template: templateName,
      repository: repositoryPath,
      dryRun,
      status: 'in_progress',
      options,
      startedAt: new Date().toISOString(),
      files: {
        added: [],
        modified: [],
        deleted: []
      }
    };

    storage.operations.set(operationId, operation);
    
    // Emit operation started event
    emitWSEvent(req, 'operations', 'operation.started', {
      operationId,
      type: 'template_apply',
      template: templateName,
      repository: repositoryPath
    });

    // Simulate template application (in production, this would actually apply the template)
    setTimeout(() => {
      operation.status = 'success';
      operation.completedAt = new Date().toISOString();
      operation.files = {
        added: template.files.filter(f => !f.endsWith('/')),
        modified: [],
        deleted: []
      };
      operation.backupCreated = !dryRun;
      
      // Emit completion event
      emitWSEvent(req, 'operations', 'operation.completed', {
        operationId,
        type: 'template_apply',
        status: 'success',
        files: operation.files
      });
      
      emitWSEvent(req, 'templates', 'template.applied', {
        templateId: template.id,
        templateName: template.name,
        repository: repositoryPath,
        filesAdded: operation.files.added.length
      });
    }, 1000);

    res.json({
      operationId,
      message: dryRun ? 'Dry run initiated' : 'Template application started',
      template: template.name,
      repository: repositoryPath
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply template', details: error.message });
  }
});

// Get template application status
phase2Router.get('/templates/operations/:id', (req, res) => {
  const operation = storage.operations.get(req.params.id);
  if (!operation) {
    return res.status(404).json({ error: 'Operation not found' });
  }
  res.json(operation);
});

// ===============================
// Pipeline Management Endpoints
// ===============================

// Validate pipeline configuration
phase2Router.post('/pipelines/validate', validateRequest(['pipeline']), async (req, res) => {
  try {
    const { pipeline } = req.body;
    
    // Validation results structure
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      info: [],
      issues: []
    };
    
    // Validate basic pipeline structure
    if (!pipeline.name || !pipeline.name.trim()) {
      result.errors.push('Pipeline name is required');
      result.issues.push({
        severity: 'ERROR',
        message: 'Pipeline name is required'
      });
    }
    
    if (!pipeline.nodes || !Array.isArray(pipeline.nodes) || pipeline.nodes.length === 0) {
      result.errors.push('Pipeline must have at least one node');
      result.issues.push({
        severity: 'ERROR',
        message: 'Pipeline must have at least one node'
      });
    }
    
    if (pipeline.nodes && Array.isArray(pipeline.nodes)) {
      // Validate nodes
      const nodeIds = new Set();
      let hasStartNode = false;
      
      pipeline.nodes.forEach((node, index) => {
        // Check for duplicate node IDs
        if (nodeIds.has(node.id)) {
          result.errors.push(`Duplicate node ID: ${node.id}`);
          result.issues.push({
            severity: 'ERROR',
            message: `Duplicate node ID: ${node.id}`,
            nodeId: node.id
          });
        }
        nodeIds.add(node.id);
        
        // Check for start node
        if (node.type === 'start') {
          hasStartNode = true;
        }
        
        // Validate required node fields
        if (!node.id || !node.id.trim()) {
          result.errors.push(`Node at index ${index} missing ID`);
          result.issues.push({
            severity: 'ERROR',
            message: `Node at index ${index} missing ID`
          });
        }
        
        if (!node.type || !node.type.trim()) {
          result.errors.push(`Node ${node.id} missing type`);
          result.issues.push({
            severity: 'ERROR',
            message: `Node ${node.id} missing type`,
            nodeId: node.id
          });
        }
        
        if (!node.name || !node.name.trim()) {
          result.warnings.push(`Node ${node.id} missing name`);
          result.issues.push({
            severity: 'WARNING',
            message: `Node ${node.id} missing name`,
            nodeId: node.id
          });
        }
        
        // Validate node position
        if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          result.warnings.push(`Node ${node.id} missing or invalid position`);
          result.issues.push({
            severity: 'WARNING',
            message: `Node ${node.id} missing or invalid position`,
            nodeId: node.id
          });
        }
        
        // Validate dependencies
        if (node.dependencies && Array.isArray(node.dependencies)) {
          node.dependencies.forEach(depId => {
            if (!nodeIds.has(depId) && !pipeline.nodes.some(n => n.id === depId)) {
              result.errors.push(`Node ${node.id} has invalid dependency: ${depId}`);
              result.issues.push({
                severity: 'ERROR',
                message: `Node ${node.id} has invalid dependency: ${depId}`,
                nodeId: node.id
              });
            }
          });
        }
        
        // Type-specific validation
        switch (node.type) {
          case 'start':
            if (!node.config?.trigger) {
              result.warnings.push(`Start node ${node.id} missing trigger configuration`);
              result.issues.push({
                severity: 'WARNING',
                message: `Start node ${node.id} missing trigger configuration`,
                nodeId: node.id
              });
            }
            break;
          case 'command':
            if (!node.config?.command) {
              result.errors.push(`Command node ${node.id} missing command configuration`);
              result.issues.push({
                severity: 'ERROR',
                message: `Command node ${node.id} missing command configuration`,
                nodeId: node.id
              });
            }
            break;
          case 'test':
            if (!node.config?.testCommand && !node.config?.framework) {
              result.warnings.push(`Test node ${node.id} missing test configuration`);
              result.issues.push({
                severity: 'WARNING',
                message: `Test node ${node.id} missing test configuration`,
                nodeId: node.id
              });
            }
            break;
          case 'deploy':
            if (!node.config?.deployType && !node.config?.target) {
              result.errors.push(`Deploy node ${node.id} missing deployment configuration`);
              result.issues.push({
                severity: 'ERROR',
                message: `Deploy node ${node.id} missing deployment configuration`,
                nodeId: node.id
              });
            }
            break;
        }
      });
      
      // Check for start node
      if (!hasStartNode) {
        result.warnings.push('Pipeline should have a start node');
        result.issues.push({
          severity: 'WARNING',
          message: 'Pipeline should have a start node'
        });
      }
      
      // Validate edges if present
      if (pipeline.edges && Array.isArray(pipeline.edges)) {
        pipeline.edges.forEach((edge, index) => {
          if (!edge.source || !edge.target) {
            result.errors.push(`Edge at index ${index} missing source or target`);
            result.issues.push({
              severity: 'ERROR',
              message: `Edge at index ${index} missing source or target`
            });
          } else {
            // Check if source and target nodes exist
            if (!nodeIds.has(edge.source)) {
              result.errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
              result.issues.push({
                severity: 'ERROR',
                message: `Edge ${edge.id} references non-existent source node: ${edge.source}`
              });
            }
            if (!nodeIds.has(edge.target)) {
              result.errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
              result.issues.push({
                severity: 'ERROR',
                message: `Edge ${edge.id} references non-existent target node: ${edge.target}`
              });
            }
          }
        });
      }
      
      // Check for cycles in dependencies
      const visited = new Set();
      const recursionStack = new Set();
      
      function hasCycle(nodeId) {
        if (recursionStack.has(nodeId)) {
          return true; // Found a cycle
        }
        if (visited.has(nodeId)) {
          return false;
        }
        
        visited.add(nodeId);
        recursionStack.add(nodeId);
        
        const node = pipeline.nodes.find(n => n.id === nodeId);
        if (node && node.dependencies) {
          for (const depId of node.dependencies) {
            if (hasCycle(depId)) {
              return true;
            }
          }
        }
        
        recursionStack.delete(nodeId);
        return false;
      }
      
      for (const node of pipeline.nodes) {
        if (hasCycle(node.id)) {
          result.errors.push('Pipeline contains dependency cycles');
          result.issues.push({
            severity: 'ERROR',
            message: 'Pipeline contains dependency cycles',
            nodeId: node.id
          });
          break;
        }
      }
    }
    
    // Add validation info
    if (result.errors.length === 0) {
      result.info.push('Pipeline structure is valid');
    }
    if (pipeline.nodes) {
      result.info.push(`Pipeline contains ${pipeline.nodes.length} nodes`);
    }
    if (pipeline.edges) {
      result.info.push(`Pipeline contains ${pipeline.edges.length} edges`);
    }
    
    // Set overall validity
    result.isValid = result.errors.length === 0;
    
    // Emit validation event if successful
    if (result.isValid) {
      emitWSEvent(req, 'pipelines', 'pipeline.validated', {
        pipelineName: pipeline.name,
        nodeCount: pipeline.nodes?.length || 0,
        edgeCount: pipeline.edges?.length || 0,
        warningCount: result.warnings.length
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Pipeline validation error:', error);
    res.status(500).json({ 
      error: 'Pipeline validation failed', 
      details: error.message,
      isValid: false,
      errors: ['Internal validation error'],
      warnings: [],
      info: []
    });
  }
});

// Get all pipelines with filtering
phase2Router.get('/pipelines', (req, res) => {
  try {
    const { repository, status, page = 1, limit = 10 } = req.query;
    
    let pipelines = Array.from(storage.pipelines.values());

    // Filter by repository
    if (repository) {
      pipelines = pipelines.filter(p => p.repository === repository);
    }

    // Filter by status
    if (status) {
      pipelines = pipelines.filter(p => p.status === status);
    }

    // Sort by last run (most recent first)
    pipelines.sort((a, b) => new Date(b.lastRun) - new Date(a.lastRun));

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedPipelines = pipelines.slice(startIndex, endIndex);

    res.json({
      pipelines: paginatedPipelines,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: pipelines.length,
        pages: Math.ceil(pipelines.length / limit)
      },
      summary: {
        total: pipelines.length,
        active: pipelines.filter(p => p.status === 'active').length,
        paused: pipelines.filter(p => p.status === 'paused').length,
        failed: pipelines.filter(p => p.status === 'failed').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pipelines', details: error.message });
  }
});

// Get specific pipeline details
phase2Router.get('/pipelines/:id', (req, res) => {
  const pipeline = storage.pipelines.get(req.params.id);
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }
  
  // Add execution history
  pipeline.recentExecutions = [
    {
      id: `run_${Date.now() - 7200000}`,
      status: 'success',
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      completedAt: new Date(Date.now() - 7000000).toISOString(),
      duration: 200,
      triggeredBy: 'push'
    },
    {
      id: `run_${Date.now() - 14400000}`,
      status: 'failed',
      startedAt: new Date(Date.now() - 14400000).toISOString(),
      completedAt: new Date(Date.now() - 14200000).toISOString(),
      duration: 200,
      triggeredBy: 'pull_request',
      error: 'Test coverage below threshold'
    }
  ];
  
  res.json(pipeline);
});

// Get pipeline execution status
phase2Router.get('/pipelines/:id/status', (req, res) => {
  const { id } = req.params;
  const pipeline = storage.pipelines.get(id);
  
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  // Simulate running pipeline
  const isRunning = Math.random() > 0.3;
  const currentStageIndex = isRunning ? Math.floor(Math.random() * pipeline.stages.length) : -1;
  
  res.json({
    pipelineId: id,
    pipelineName: pipeline.name,
    status: isRunning ? 'running' : 'idle',
    currentStage: isRunning ? pipeline.stages[currentStageIndex] : null,
    progress: isRunning ? ((currentStageIndex + 1) / pipeline.stages.length) * 100 : 0,
    startedAt: isRunning ? new Date(Date.now() - Math.random() * 300000).toISOString() : null,
    stages: pipeline.stages.map((stage, index) => ({
      name: stage,
      status: isRunning 
        ? (index < currentStageIndex ? 'completed' : index === currentStageIndex ? 'running' : 'pending')
        : 'idle',
      duration: index < currentStageIndex ? Math.floor(Math.random() * 120) + 30 : null
    }))
  });
});

// Execute pipeline
phase2Router.post('/pipelines/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { parameters = {}, trigger = 'manual' } = req.body;
    
    const pipeline = storage.pipelines.get(id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    const runId = `run_${uuidv4()}`;
    const execution = {
      runId,
      pipelineId: id,
      pipelineName: pipeline.name,
      status: 'queued',
      trigger,
      parameters,
      queuedAt: new Date().toISOString()
    };

    // Store execution (in production, this would be in a database)
    storage.operations.set(runId, execution);
    
    // Emit pipeline queued event
    emitWSEvent(req, 'pipelines', 'pipeline.started', {
      runId,
      pipelineId: id,
      pipelineName: pipeline.name,
      trigger,
      repository: pipeline.repository
    });

    // Simulate pipeline execution start
    setTimeout(() => {
      execution.status = 'running';
      execution.startedAt = new Date().toISOString();
      
      // Emit pipeline running event
      emitWSEvent(req, 'pipelines', 'pipeline.progress', {
        runId,
        pipelineId: id,
        status: 'running',
        stage: pipeline.stages[0],
        progress: 0
      });
    }, 2000);

    res.json({
      runId,
      pipelineId: id,
      status: 'queued',
      message: 'Pipeline execution queued successfully',
      estimatedStartTime: new Date(Date.now() + 2000).toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute pipeline', details: error.message });
  }
});

// Generate GitHub Actions workflow from pipeline
phase2Router.post('/pipelines/:id/generate-workflow', async (req, res) => {
  try {
    const { id } = req.params;
    const { repository, branch = 'main', workflowName, templateOverrides = {} } = req.body;
    
    const pipeline = storage.pipelines.get(id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    // Generate GitHub Actions workflow YAML
    const workflowYaml = generateGitHubActionsWorkflow(pipeline, {
      repository,
      branch,
      workflowName: workflowName || `${pipeline.name} Workflow`,
      templateOverrides
    });

    const operationId = `workflow_${uuidv4()}`;
    const operation = {
      id: operationId,
      type: 'workflow_generation',
      pipelineId: id,
      pipelineName: pipeline.name,
      repository,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: {
        workflowYaml,
        workflowPath: `.github/workflows/${workflowName || pipeline.name.toLowerCase().replace(/\s+/g, '-')}.yml`,
        nodeCount: pipeline.nodes?.length || 0,
        stageCount: pipeline.stages?.length || 0
      }
    };

    storage.operations.set(operationId, operation);

    // Emit workflow generation event
    emitWSEvent(req, 'pipelines', 'workflow.generated', {
      operationId,
      pipelineId: id,
      pipelineName: pipeline.name,
      repository,
      workflowPath: operation.result.workflowPath
    });

    res.json({
      operationId,
      message: 'GitHub Actions workflow generated successfully',
      pipeline: pipeline.name,
      repository,
      workflow: {
        name: workflowName || `${pipeline.name} Workflow`,
        path: operation.result.workflowPath,
        yaml: workflowYaml
      }
    });
  } catch (error) {
    console.error('Workflow generation error:', error);
    res.status(500).json({ error: 'Failed to generate workflow', details: error.message });
  }
});

// Helper function to generate GitHub Actions workflow YAML
function generateGitHubActionsWorkflow(pipeline, options) {
  const { repository, branch, workflowName, templateOverrides } = options;
  
  // Build triggers based on pipeline configuration
  const triggers = pipeline.triggers || ['push'];
  const triggerConfig = {};
  
  if (triggers.includes('push')) {
    triggerConfig.push = {
      branches: [branch]
    };
  }
  
  if (triggers.includes('pull_request')) {
    triggerConfig.pull_request = {
      branches: [branch]
    };
  }
  
  if (triggers.includes('manual')) {
    triggerConfig.workflow_dispatch = {};
  }

  // Generate jobs based on pipeline stages/nodes
  const jobs = {};
  
  if (pipeline.nodes && Array.isArray(pipeline.nodes)) {
    // Convert pipeline nodes to GitHub Actions jobs
    const sortedNodes = topologicalSort(pipeline.nodes);
    
    sortedNodes.forEach((node, index) => {
      const jobId = node.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const job = {
        'runs-on': 'ubuntu-latest',
        steps: []
      };
      
      // Add dependencies (needs)
      if (node.dependencies && node.dependencies.length > 0) {
        job.needs = node.dependencies.map(dep => dep.replace(/[^a-zA-Z0-9_-]/g, '_'));
      }
      
      // Add checkout step for most job types
      if (node.type !== 'start') {
        job.steps.push({
          name: 'Checkout code',
          uses: 'actions/checkout@v4'
        });
      }
      
      // Add type-specific steps
      switch (node.type) {
        case 'start':
          // Start nodes don't generate actual jobs, just trigger conditions
          return;
          
        case 'command':
          if (node.config?.workingDirectory) {
            job.steps.push({
              name: 'Change to working directory',
              run: `cd ${node.config.workingDirectory}`
            });
          }
          
          job.steps.push({
            name: node.config?.label || node.name || 'Run command',
            run: node.config?.command || 'echo "No command specified"',
            timeout: node.config?.timeout ? `${node.config.timeout}s` : undefined
          });
          break;
          
        case 'test':
          // Setup Node.js if not already done
          if (node.config?.framework === 'jest' || node.config?.testCommand?.includes('npm')) {
            job.steps.push({
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '20',
                'cache': 'npm'
              }
            });
            
            job.steps.push({
              name: 'Install dependencies',
              run: 'npm ci'
            });
          }
          
          job.steps.push({
            name: node.config?.label || 'Run tests',
            run: node.config?.testCommand || 'npm test'
          });
          
          // Add coverage reporting if enabled
          if (node.config?.coverage) {
            job.steps.push({
              name: 'Upload coverage reports',
              uses: 'codecov/codecov-action@v3',
              with: {
                token: '${{ secrets.CODECOV_TOKEN }}'
              }
            });
          }
          break;
          
        case 'deploy':
          job.steps.push({
            name: node.config?.label || 'Deploy',
            run: generateDeploymentScript(node.config),
            env: {
              DEPLOY_TARGET: node.config?.target || 'production',
              DEPLOY_TYPE: node.config?.deployType || 'docker',
              ENVIRONMENT: node.config?.environment || 'production'
            }
          });
          
          // Add deployment status check
          job.steps.push({
            name: 'Check deployment status',
            run: 'echo "Deployment completed successfully"'
          });
          break;
          
        default:
          job.steps.push({
            name: node.name || 'Custom step',
            run: 'echo "Custom pipeline step"'
          });
      }
      
      // Apply template overrides
      if (templateOverrides[jobId]) {
        Object.assign(job, templateOverrides[jobId]);
      }
      
      jobs[jobId] = job;
    });
  } else if (pipeline.stages && Array.isArray(pipeline.stages)) {
    // Fallback: convert stages to simple jobs
    pipeline.stages.forEach((stage, index) => {
      const jobId = stage.replace(/[^a-zA-Z0-9_-]/g, '_');
      const job = {
        'runs-on': 'ubuntu-latest',
        steps: [
          {
            name: 'Checkout code',
            uses: 'actions/checkout@v4'
          },
          {
            name: `Run ${stage}`,
            run: `echo "Running ${stage} stage"`
          }
        ]
      };
      
      // Add dependencies for sequential execution
      if (index > 0) {
        const prevStage = pipeline.stages[index - 1].replace(/[^a-zA-Z0-9_-]/g, '_');
        job.needs = [prevStage];
      }
      
      jobs[jobId] = job;
    });
  }

  // Build the complete workflow object
  const workflow = {
    name: workflowName,
    on: triggerConfig,
    jobs
  };

  // Convert to YAML string
  return `# Generated from Pipeline: ${pipeline.name}
# Generated on: ${new Date().toISOString()}
# Repository: ${repository}

name: ${workflowName}

on:
${Object.entries(triggerConfig).map(([trigger, config]) => {
  if (Object.keys(config).length === 0) {
    return `  ${trigger}:`;
  }
  return `  ${trigger}:\n${Object.entries(config).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `    ${key}:\n${value.map(v => `      - ${v}`).join('\n')}`;
    }
    return `    ${key}: ${value}`;
  }).join('\n')}`;
}).join('\n')}

jobs:
${Object.entries(jobs).map(([jobId, job]) => {
  let jobYaml = `  ${jobId}:\n    runs-on: ${job['runs-on']}`;
  
  if (job.needs) {
    if (Array.isArray(job.needs)) {
      jobYaml += `\n    needs: [${job.needs.join(', ')}]`;
    } else {
      jobYaml += `\n    needs: ${job.needs}`;
    }
  }
  
  jobYaml += '\n    steps:';
  job.steps.forEach(step => {
    jobYaml += `\n      - name: ${step.name}`;
    if (step.uses) {
      jobYaml += `\n        uses: ${step.uses}`;
    }
    if (step.run) {
      jobYaml += `\n        run: ${step.run}`;
    }
    if (step.with) {
      jobYaml += '\n        with:';
      Object.entries(step.with).forEach(([key, value]) => {
        jobYaml += `\n          ${key}: ${value}`;
      });
    }
    if (step.env) {
      jobYaml += '\n        env:';
      Object.entries(step.env).forEach(([key, value]) => {
        jobYaml += `\n          ${key}: ${value}`;
      });
    }
    if (step.timeout) {
      jobYaml += `\n        timeout-minutes: ${step.timeout}`;
    }
  });
  
  return jobYaml;
}).join('\n\n')}
`;
}

// Helper function to generate deployment script based on config
function generateDeploymentScript(deployConfig) {
  if (!deployConfig) {
    return 'echo "No deployment configuration specified"';
  }
  
  const { deployType, target, environment } = deployConfig;
  
  switch (deployType) {
    case 'kubernetes':
      return `kubectl apply -f k8s/ --context=${target}`;
    case 'docker':
      return `docker build -t ${target} . && docker push ${target}`;
    case 'heroku':
      return `git push heroku ${environment}:main`;
    case 'aws':
      return `aws deploy create-deployment --application-name ${target} --deployment-group-name ${environment}`;
    default:
      return `echo "Deploying to ${target} (${deployType})"`;
  }
}

// Helper function for topological sort of pipeline nodes
function topologicalSort(nodes) {
  const visited = new Set();
  const tempMark = new Set();
  const result = [];
  
  function visit(node) {
    if (tempMark.has(node.id)) {
      throw new Error('Circular dependency detected');
    }
    if (visited.has(node.id)) {
      return;
    }
    
    tempMark.add(node.id);
    
    // Visit dependencies first
    if (node.dependencies) {
      node.dependencies.forEach(depId => {
        const depNode = nodes.find(n => n.id === depId);
        if (depNode) {
          visit(depNode);
        }
      });
    }
    
    tempMark.delete(node.id);
    visited.add(node.id);
    result.push(node);
  }
  
  // Start with nodes that have no dependencies (like start nodes)
  const startNodes = nodes.filter(node => !node.dependencies || node.dependencies.length === 0);
  startNodes.forEach(visit);
  
  // Then process remaining nodes
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      visit(node);
    }
  });
  
  return result;
}

// Save pipeline to GitHub repository
phase2Router.post('/pipelines/:id/deploy-workflow', async (req, res) => {
  try {
    const { id } = req.params;
    const { repository, branch = 'main', commitMessage, createPullRequest = false } = req.body;
    
    if (!repository) {
      return res.status(400).json({ error: 'Repository is required' });
    }

    const pipeline = storage.pipelines.get(id);
    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    // Get the GitHub MCP manager (would be injected in real implementation)
    const GitHubMCPManager = req.app.locals.githubMCP;
    
    const operationId = `deploy_${uuidv4()}`;
    const operation = {
      id: operationId,
      type: 'workflow_deployment',
      pipelineId: id,
      pipelineName: pipeline.name,
      repository,
      status: 'in_progress',
      startedAt: new Date().toISOString()
    };

    storage.operations.set(operationId, operation);

    // Emit deployment started event
    emitWSEvent(req, 'pipelines', 'workflow.deployment.started', {
      operationId,
      pipelineId: id,
      pipelineName: pipeline.name,
      repository,
      createPullRequest
    });

    // Simulate GitHub workflow deployment
    setTimeout(async () => {
      try {
        // Generate workflow
        const workflowYaml = generateGitHubActionsWorkflow(pipeline, {
          repository,
          branch,
          workflowName: `${pipeline.name} Workflow`
        });

        // Simulate GitHub MCP operations
        const workflowPath = `.github/workflows/${pipeline.name.toLowerCase().replace(/\s+/g, '-')}.yml`;
        
        operation.status = 'completed';
        operation.completedAt = new Date().toISOString();
        operation.result = {
          workflowPath,
          commitSha: `sha_${Date.now()}`,
          pullRequestUrl: createPullRequest ? `https://github.com/${repository}/pull/${Math.floor(Math.random() * 1000)}` : null,
          workflowUrl: `https://github.com/${repository}/actions/workflows/${pipeline.name.toLowerCase().replace(/\s+/g, '-')}.yml`
        };

        // Emit deployment completed event
        emitWSEvent(req, 'pipelines', 'workflow.deployment.completed', {
          operationId,
          pipelineId: id,
          status: 'completed',
          workflowPath,
          workflowUrl: operation.result.workflowUrl,
          pullRequestUrl: operation.result.pullRequestUrl
        });

      } catch (error) {
        operation.status = 'failed';
        operation.error = error.message;
        operation.completedAt = new Date().toISOString();

        emitWSEvent(req, 'pipelines', 'workflow.deployment.failed', {
          operationId,
          pipelineId: id,
          error: error.message
        });
      }
    }, 3000);

    res.json({
      operationId,
      message: 'Workflow deployment started',
      pipeline: pipeline.name,
      repository,
      estimatedCompletion: new Date(Date.now() + 3000).toISOString()
    });
  } catch (error) {
    console.error('Workflow deployment error:', error);
    res.status(500).json({ error: 'Failed to deploy workflow', details: error.message });
  }
});

// Create new pipeline
phase2Router.post('/pipelines', validateRequest(['name', 'repository', 'stages']), async (req, res) => {
  try {
    const { name, repository, description, stages, triggers = ['manual'] } = req.body;
    
    const pipelineId = `pipeline_${uuidv4()}`;
    const pipeline = {
      id: pipelineId,
      name,
      repository,
      description,
      status: 'active',
      created: new Date().toISOString(),
      lastRun: null,
      successRate: 0,
      avgDuration: 0,
      stages,
      triggers
    };

    storage.pipelines.set(pipelineId, pipeline);

    res.status(201).json({
      message: 'Pipeline created successfully',
      pipeline
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create pipeline', details: error.message });
  }
});

// ===============================
// Dependency Management Endpoints
// ===============================

// Get dependency graph
phase2Router.get('/dependencies/graph', (req, res) => {
  try {
    const { repository, depth = 2 } = req.query;
    
    // Generate sample dependency graph
    const nodes = [
      { id: 'homelab-gitops-auditor', type: 'primary', group: 'core' },
      { id: 'shared-config', type: 'dependency', group: 'config' },
      { id: 'home-assistant-config', type: 'primary', group: 'core' },
      { id: 'shared-scripts', type: 'dependency', group: 'utilities' },
      { id: 'docker-compose-templates', type: 'dependency', group: 'infrastructure' },
      { id: 'monitoring-stack', type: 'secondary', group: 'infrastructure' }
    ];

    const edges = [
      { source: 'homelab-gitops-auditor', target: 'shared-config', type: 'config', impact: 'medium', version: '^1.0.0' },
      { source: 'homelab-gitops-auditor', target: 'shared-scripts', type: 'runtime', impact: 'low', version: '*' },
      { source: 'home-assistant-config', target: 'shared-scripts', type: 'git', impact: 'high', version: 'main' },
      { source: 'home-assistant-config', target: 'docker-compose-templates', type: 'build', impact: 'high', version: '~2.0.0' },
      { source: 'monitoring-stack', target: 'shared-config', type: 'config', impact: 'medium', version: '^1.0.0' }
    ];

    // Filter by repository if specified
    let filteredNodes = nodes;
    let filteredEdges = edges;
    
    if (repository) {
      const connectedNodes = new Set([repository]);
      
      // Find connected nodes up to specified depth
      for (let i = 0; i < depth; i++) {
        const currentNodes = Array.from(connectedNodes);
        edges.forEach(edge => {
          if (currentNodes.includes(edge.source)) {
            connectedNodes.add(edge.target);
          }
          if (currentNodes.includes(edge.target)) {
            connectedNodes.add(edge.source);
          }
        });
      }
      
      filteredNodes = nodes.filter(node => connectedNodes.has(node.id));
      filteredEdges = edges.filter(edge => 
        connectedNodes.has(edge.source) && connectedNodes.has(edge.target)
      );
    }

    res.json({
      nodes: filteredNodes,
      edges: filteredEdges,
      summary: {
        totalDependencies: filteredEdges.length,
        highImpact: filteredEdges.filter(e => e.impact === 'high').length,
        mediumImpact: filteredEdges.filter(e => e.impact === 'medium').length,
        lowImpact: filteredEdges.filter(e => e.impact === 'low').length,
        dependencyTypes: [...new Set(filteredEdges.map(e => e.type))]
      },
      metadata: {
        graphVersion: '1.0.0',
        lastUpdated: new Date().toISOString(),
        depth: parseInt(depth)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate dependency graph', details: error.message });
  }
});

// Analyze dependency impact
phase2Router.post('/dependencies/analyze-impact', validateRequest(['repository']), async (req, res) => {
  try {
    const { repository, changeType = 'update', changes = [] } = req.body;
    
    // Simulate impact analysis
    const impactLevels = ['low', 'medium', 'high', 'critical'];
    const riskLevel = impactLevels[Math.floor(Math.random() * impactLevels.length)];
    
    const analysis = {
      repository,
      changeType,
      changes,
      impactAnalysis: {
        directImpact: Math.floor(Math.random() * 5) + 1,
        transitiveImpact: Math.floor(Math.random() * 10) + 2,
        riskLevel,
        affectedRepositories: [
          'home-assistant-config',
          'monitoring-stack',
          'backup-system'
        ].slice(0, Math.floor(Math.random() * 3) + 1),
        affectedServices: [
          { name: 'API Gateway', impact: 'medium', downtime: false },
          { name: 'Monitoring', impact: 'low', downtime: false },
          { name: 'Backup Service', impact: 'high', downtime: true }
        ].slice(0, Math.floor(Math.random() * 3) + 1),
        recommendations: riskLevel === 'critical' || riskLevel === 'high' ? [
          'Perform thorough testing in staging environment',
          'Schedule maintenance window for deployment',
          'Prepare rollback plan',
          'Notify affected teams',
          'Monitor closely after deployment'
        ] : [
          'Test primary dependencies',
          'Monitor deployment closely',
          'Have rollback plan ready'
        ]
      },
      timeline: {
        estimatedTestingTime: `${Math.floor(Math.random() * 4) + 2} hours`,
        recommendedDeploymentWindow: riskLevel === 'critical' ? 'Weekend maintenance' : 'Off-peak hours',
        rollbackTime: '< 5 minutes'
      }
    };
    
    // Store analysis
    const analysisId = `analysis_${uuidv4()}`;
    storage.operations.set(analysisId, {
      id: analysisId,
      type: 'dependency_analysis',
      ...analysis,
      createdAt: new Date().toISOString()
    });
    
    // Emit impact analysis event
    emitWSEvent(req, 'dependencies', 'impact.analyzed', {
      analysisId,
      repository,
      riskLevel: analysis.impactAnalysis.riskLevel,
      affectedCount: analysis.impactAnalysis.affectedRepositories.length,
      directImpact: analysis.impactAnalysis.directImpact,
      transitiveImpact: analysis.impactAnalysis.transitiveImpact
    });
    
    res.json({
      analysisId,
      ...analysis
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze impact', details: error.message });
  }
});

// Get dependency vulnerabilities
phase2Router.get('/dependencies/vulnerabilities', (req, res) => {
  try {
    const { severity, repository } = req.query;
    
    const vulnerabilities = [
      {
        id: 'CVE-2024-1234',
        severity: 'high',
        package: 'express',
        version: '4.17.1',
        fixedVersion: '4.18.0',
        repository: 'homelab-gitops-auditor',
        description: 'Remote code execution vulnerability',
        published: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'CVE-2024-5678',
        severity: 'medium',
        package: 'lodash',
        version: '4.17.20',
        fixedVersion: '4.17.21',
        repository: 'shared-scripts',
        description: 'Prototype pollution vulnerability',
        published: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'CVE-2024-9012',
        severity: 'low',
        package: 'minimist',
        version: '1.2.5',
        fixedVersion: '1.2.6',
        repository: 'home-assistant-config',
        description: 'Regular expression denial of service',
        published: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    let filtered = vulnerabilities;
    
    if (severity) {
      filtered = filtered.filter(v => v.severity === severity);
    }
    
    if (repository) {
      filtered = filtered.filter(v => v.repository === repository);
    }
    
    res.json({
      vulnerabilities: filtered,
      summary: {
        total: filtered.length,
        critical: filtered.filter(v => v.severity === 'critical').length,
        high: filtered.filter(v => v.severity === 'high').length,
        medium: filtered.filter(v => v.severity === 'medium').length,
        low: filtered.filter(v => v.severity === 'low').length
      },
      lastScan: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vulnerabilities', details: error.message });
  }
});

// ===============================
// Quality Gates Endpoints
// ===============================

// Get all quality gates
phase2Router.get('/quality/gates', (req, res) => {
  try {
    const { type, status } = req.query;
    
    let gates = Array.from(storage.qualityGates.values());
    
    // Add more quality gates
    const additionalGates = [
      {
        id: 'test-coverage',
        name: 'Test Coverage',
        type: 'pre_merge',
        description: 'Minimum 80% code coverage required',
        status: 'active',
        passRate: 82,
        lastRun: new Date().toISOString(),
        threshold: 80,
        metrics: {
          current: 82,
          target: 80,
          trend: 'improving'
        }
      },
      {
        id: 'security-scan',
        name: 'Security Scan',
        type: 'pre_deploy',
        description: 'Vulnerability scanning and security checks',
        status: 'active',
        passRate: 91,
        lastRun: new Date().toISOString(),
        threshold: 90,
        metrics: {
          vulnerabilities: {
            critical: 0,
            high: 0,
            medium: 2,
            low: 5
          }
        }
      },
      {
        id: 'performance-check',
        name: 'Performance Check',
        type: 'pre_merge',
        description: 'Performance regression detection',
        status: 'active',
        passRate: 88,
        lastRun: new Date().toISOString(),
        threshold: 85,
        metrics: {
          responseTime: '145ms',
          maxResponseTime: '200ms',
          trend: 'stable'
        }
      }
    ];
    
    additionalGates.forEach(gate => {
      if (!storage.qualityGates.has(gate.id)) {
        storage.qualityGates.set(gate.id, gate);
      }
    });
    
    gates = Array.from(storage.qualityGates.values());
    
    if (type) {
      gates = gates.filter(g => g.type === type);
    }
    
    if (status) {
      gates = gates.filter(g => g.status === status);
    }
    
    res.json({
      gates,
      summary: {
        totalGates: gates.length,
        activeGates: gates.filter(g => g.status === 'active').length,
        overallPassRate: Math.round(
          gates.reduce((sum, g) => sum + g.passRate, 0) / gates.length
        ),
        gateTypes: {
          preCommit: gates.filter(g => g.type === 'pre_commit').length,
          preMerge: gates.filter(g => g.type === 'pre_merge').length,
          preDeploy: gates.filter(g => g.type === 'pre_deploy').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quality gates', details: error.message });
  }
});

// Run quality validation
phase2Router.post('/quality/validate', validateRequest(['repository']), async (req, res) => {
  try {
    const { repository, gateType = 'pre_commit', files = [] } = req.body;
    
    const validationId = `val_${uuidv4()}`;
    const validation = {
      validationId,
      repository,
      gateType,
      status: 'running',
      startedAt: new Date().toISOString(),
      checks: []
    };
    
    // Define checks based on gate type
    const checksByType = {
      pre_commit: ['linting', 'formatting', 'commit-message'],
      pre_merge: ['linting', 'tests', 'coverage', 'performance'],
      pre_deploy: ['security', 'integration-tests', 'deployment-readiness']
    };
    
    const checks = checksByType[gateType] || checksByType.pre_commit;
    
    // Simulate running checks
    validation.checks = checks.map(check => ({
      name: check,
      status: 'pending',
      score: null,
      issues: [],
      startedAt: null,
      completedAt: null
    }));
    
    storage.operations.set(validationId, validation);
    
    // Emit validation started event
    emitWSEvent(req, 'quality', 'quality.check.started', {
      validationId,
      repository,
      gateType,
      checksCount: checks.length
    });
    
    // Simulate check execution
    setTimeout(() => {
      validation.checks.forEach((check, index) => {
        setTimeout(() => {
          check.status = Math.random() > 0.1 ? 'passed' : 'failed';
          check.score = Math.floor(Math.random() * 20) + 80;
          check.startedAt = new Date(Date.now() - (checks.length - index) * 1000).toISOString();
          check.completedAt = new Date().toISOString();
          
          if (check.status === 'failed') {
            check.issues = [
              {
                file: files[0] || 'src/index.js',
                line: Math.floor(Math.random() * 100) + 1,
                message: `${check.name} violation detected`,
                severity: 'error'
              }
            ];
          }
          
          // Emit check progress event
          emitWSEvent(req, 'quality', 'quality.check.progress', {
            validationId,
            checkName: check.name,
            status: check.status,
            score: check.score,
            progress: ((index + 1) / checks.length) * 100
          });
        }, index * 500);
      });
      
      setTimeout(() => {
        const allPassed = validation.checks.every(c => c.status === 'passed');
        const avgScore = Math.round(
          validation.checks.reduce((sum, c) => sum + c.score, 0) / validation.checks.length
        );
        
        validation.status = allPassed ? 'passed' : 'failed';
        validation.score = avgScore;
        validation.completedAt = new Date().toISOString();
        validation.summary = {
          totalChecks: validation.checks.length,
          passed: validation.checks.filter(c => c.status === 'passed').length,
          failed: validation.checks.filter(c => c.status === 'failed').length,
          score: avgScore
        };
        
        // Emit validation completed event
        emitWSEvent(req, 'quality', 'quality.check.completed', {
          validationId,
          repository,
          gateType,
          status: validation.status,
          score: avgScore,
          summary: validation.summary
        });
      }, checks.length * 500 + 500);
    }, 1000);
    
    res.json({
      validationId,
      message: 'Quality validation started',
      repository,
      gateType,
      checksScheduled: checks.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start validation', details: error.message });
  }
});

// Get validation result
phase2Router.get('/quality/validations/:id', (req, res) => {
  const validation = storage.operations.get(req.params.id);
  if (!validation || validation.type !== 'quality_validation') {
    return res.status(404).json({ error: 'Validation not found' });
  }
  res.json(validation);
});

// Configure quality thresholds
phase2Router.put('/quality/thresholds', validateRequest(['gateId']), (req, res) => {
  try {
    const { gateId, threshold, rules } = req.body;
    
    const gate = storage.qualityGates.get(gateId);
    if (!gate) {
      return res.status(404).json({ error: 'Quality gate not found' });
    }
    
    if (threshold !== undefined) {
      gate.threshold = threshold;
    }
    
    if (rules !== undefined) {
      gate.rules = rules;
    }
    
    gate.lastUpdated = new Date().toISOString();
    
    res.json({
      message: 'Quality threshold updated',
      gate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update threshold', details: error.message });
  }
});

// ===============================
// Pipeline Status API Endpoints
// ===============================

// Import pipeline service
const PipelineService = require('./services/pipeline/pipelineService');
let pipelineService = null;

// Initialize pipeline service with MCP integration
function initializePipelineService(app) {
  const ConfigLoader = require('./config-loader');
  const config = new ConfigLoader();
  
  // Get GitHub MCP instance from app context if available
  const githubMCP = app.locals?.githubMCP || null;
  
  pipelineService = new PipelineService(githubMCP, config);
  
  // Set up pipeline event listeners for WebSocket
  pipelineService.on('pipeline:triggered', (data) => {
    // Emit WebSocket event if available
    const phase2WS = app.locals?.phase2WS;
    if (phase2WS) {
      phase2WS.emit('pipelines', 'pipeline.triggered', data);
    }
  });
  
  return pipelineService;
}

// GET /api/v2/pipelines/status - Get current pipeline status for all repositories
phase2Router.get('/pipelines/status', async (req, res) => {
  try {
    if (!pipelineService) {
      pipelineService = initializePipelineService(req.app);
    }
    
    const { repo, branch, status, limit } = req.query;
    const options = {
      repo,
      branch,
      status,
      limit: limit ? parseInt(limit) : undefined
    };
    
    const result = await pipelineService.getPipelineStatus(options);
    
    // Emit WebSocket event for real-time updates
    emitWSEvent(req, 'pipelines', 'status.requested', {
      options,
      resultCount: result.pipelines.length
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting pipeline status:', error);
    res.status(500).json({ 
      error: 'Failed to get pipeline status', 
      details: error.message 
    });
  }
});

// GET /api/v2/pipelines/history/:repo - Get pipeline run history for a specific repository
phase2Router.get('/pipelines/history/:repo', async (req, res) => {
  try {
    if (!pipelineService) {
      pipelineService = initializePipelineService(req.app);
    }
    
    const repository = req.params.repo;
    const { page, per_page, workflow_id, branch } = req.query;
    
    const options = {
      page: page ? parseInt(page) : 1,
      per_page: per_page ? parseInt(per_page) : 30,
      workflow_id,
      branch
    };
    
    const result = await pipelineService.getPipelineHistory(repository, options);
    
    // Emit WebSocket event
    emitWSEvent(req, 'pipelines', 'history.requested', {
      repository,
      options,
      resultCount: result.runs.length
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error getting pipeline history for ${req.params.repo}:`, error);
    res.status(500).json({ 
      error: 'Failed to get pipeline history', 
      details: error.message 
    });
  }
});

// POST /api/v2/pipelines/trigger - Manually trigger a pipeline run
phase2Router.post('/pipelines/trigger', 
  authenticate, 
  authorize(Permission.RESOURCES.PIPELINES, Permission.ACTIONS.TRIGGER),
  validateRequest(['repository', 'workflow']), 
  async (req, res) => {
  try {
    if (!pipelineService) {
      pipelineService = initializePipelineService(req.app);
    }
    
    const { repository, workflow, branch, inputs } = req.body;
    
    const request = {
      repository,
      workflow,
      branch: branch || 'main',
      inputs: inputs || {}
    };
    
    const result = await pipelineService.triggerPipeline(request);
    
    // Emit WebSocket event
    emitWSEvent(req, 'pipelines', 'pipeline.triggered', {
      repository,
      workflow,
      branch: request.branch,
      inputs: request.inputs,
      success: result.success
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error triggering pipeline:', error);
    res.status(500).json({ 
      error: 'Failed to trigger pipeline', 
      details: error.message 
    });
  }
});

// GET /api/v2/pipelines/metrics - Get pipeline metrics and analytics
phase2Router.get('/pipelines/metrics', async (req, res) => {
  try {
    if (!pipelineService) {
      pipelineService = initializePipelineService(req.app);
    }
    
    const { repository, timeRange, branch } = req.query;
    
    const options = {
      repository,
      timeRange: timeRange || '30d',
      branch
    };
    
    const result = await pipelineService.getPipelineMetrics(options);
    
    // Emit WebSocket event
    emitWSEvent(req, 'pipelines', 'metrics.requested', {
      options,
      repositoryCount: Object.keys(result.metrics).length
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting pipeline metrics:', error);
    res.status(500).json({ 
      error: 'Failed to get pipeline metrics', 
      details: error.message 
    });
  }
});

// ===============================
// System Status Endpoint
// ===============================

phase2Router.get('/status', (req, res) => {
  const recentOperations = Array.from(storage.operations.values())
    .slice(-10)
    .map(op => ({
      id: op.id,
      type: op.type,
      status: op.status,
      timestamp: op.timestamp || op.startedAt || op.createdAt
    }));

  res.json({
    platformVersion: '2.0.0',
    phase: 'Phase 2: Advanced DevOps Platform',
    components: {
      templateEngine: {
        status: 'operational',
        templatesAvailable: storage.templates.size,
        recentOperations: recentOperations.filter(op => op.type === 'template_apply').length
      },
      pipelineEngine: {
        status: 'operational',
        pipelinesActive: Array.from(storage.pipelines.values()).filter(p => p.status === 'active').length,
        pipelinesTotal: storage.pipelines.size
      },
      dependencyManager: {
        status: 'operational',
        lastAnalysis: recentOperations.find(op => op.type === 'dependency_analysis')?.timestamp
      },
      qualityGates: {
        status: 'operational',
        gatesActive: Array.from(storage.qualityGates.values()).filter(g => g.status === 'active').length,
        gatesTotal: storage.qualityGates.size,
        overallPassRate: Math.round(
          Array.from(storage.qualityGates.values()).reduce((sum, g) => sum + g.passRate, 0) / storage.qualityGates.size
        )
      }
    },
    statistics: {
      repositoriesManaged: 12,
      templatesApplied: 8,
      pipelinesActive: storage.pipelines.size,
      qualityGatesActive: storage.qualityGates.size,
      recentOperations: recentOperations.length
    },
    health: {
      status: 'healthy',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      lastHealthCheck: new Date().toISOString()
    },
    lastUpdated: new Date().toISOString()
  });
});

// ===============================
// Template Compliance API Endpoints
// ===============================

// Import compliance service
const ComplianceService = require('./services/compliance/complianceService');
let complianceService = null;

// Initialize compliance service
function initializeComplianceService(app) {
  const ConfigLoader = require('./config-loader');
  const config = new ConfigLoader();
  
  complianceService = new ComplianceService(config, {
    projectRoot: process.cwd(),
    verbose: process.env.NODE_ENV === 'development'
  });
  
  // Set up compliance event listeners for WebSocket
  complianceService.on('compliance:checked', (data) => {
    emitWSEvent(app.locals?.phase2WS?.req || {}, 'compliance', 'compliance.checked', data);
  });
  
  complianceService.on('compliance:job-started', (data) => {
    emitWSEvent(app.locals?.phase2WS?.req || {}, 'compliance', 'compliance.job-started', data);
  });
  
  complianceService.on('compliance:job-completed', (data) => {
    emitWSEvent(app.locals?.phase2WS?.req || {}, 'compliance', 'compliance.job-completed', data);
  });
  
  complianceService.on('compliance:application-completed', (data) => {
    emitWSEvent(app.locals?.phase2WS?.req || {}, 'compliance', 'compliance.application-completed', data);
  });
  
  return complianceService;
}

// ===============================
// Pipeline Orchestration Endpoints
// ===============================

// Initialize orchestration service
const { createOrchestrationService, getOrchestrationService } = require('./services/orchestrator');
let orchestrationService = null;

function initializeOrchestrationService(app) {
  if (!orchestrationService) {
    const services = {
      websocket: app.locals?.phase2WS,
      github: app.locals?.githubMCP,
      metrics: app.locals?.metricsService
    };
    
    orchestrationService = createOrchestrationService(services);
    
    // Initialize the service
    orchestrationService.initialize().catch(error => {
      console.error('Failed to initialize orchestration service:', error);
    });
  }
  
  return orchestrationService;
}

// Add orchestration routes
const orchestrationRouter = require('./routes/orchestration');

// Mount orchestration router with middleware
phase2Router.use('/orchestration', (req, res, next) => {
  // Ensure orchestration service is available
  if (!req.orchestrator) {
    req.orchestrator = initializeOrchestrationService(req.app);
  }
  
  // Pass services through request
  req.services = {
    websocket: req.app.locals?.phase2WS,
    github: req.app.locals?.githubMCP,
    metrics: req.app.locals?.metricsService
  };
  
  next();
}, orchestrationRouter);

// Legacy orchestration endpoints for backward compatibility
phase2Router.get('/orchestration-status', async (req, res) => {
  try {
    const orchestrator = initializeOrchestrationService(req.app);
    const status = orchestrator.getSystemStatus();
    
    res.json({
      ...status,
      orchestrationService: 'operational',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get orchestration status', details: error.message });
  }
});

phase2Router.get('/orchestration-metrics', async (req, res) => {
  try {
    const orchestrator = initializeOrchestrationService(req.app);
    const metrics = orchestrator.getMetrics(req.query.timeRange || '1h');
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get orchestration metrics', details: error.message });
  }
});

// GET /api/v2/compliance/status - Get compliance status for all repositories
phase2Router.get('/compliance/status', async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const { repository, template, includeDetails } = req.query;
    const options = {
      repository,
      template,
      includeDetails: includeDetails === 'true'
    };
    
    const result = await complianceService.getComplianceStatus(options);
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'status.requested', {
      options,
      resultCount: result.repositories.length,
      complianceRate: result.summary.complianceRate
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting compliance status:', error);
    res.status(500).json({ 
      error: 'Failed to get compliance status', 
      details: error.message 
    });
  }
});

// GET /api/v2/compliance/repository/:repo - Detailed compliance report for specific repository
phase2Router.get('/compliance/repository/:repo', async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const repository = req.params.repo;
    const { templates, includeHistory } = req.query;
    
    const options = {
      templates: templates ? templates.split(',') : undefined,
      includeHistory: includeHistory === 'true'
    };
    
    const result = await complianceService.getRepositoryCompliance(repository, options);
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'repository.checked', {
      repository,
      compliant: result.compliant,
      score: result.score,
      issueCount: result.issues.length
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error getting repository compliance for ${req.params.repo}:`, error);
    res.status(500).json({ 
      error: 'Failed to get repository compliance', 
      details: error.message 
    });
  }
});

// POST /api/v2/compliance/check - Trigger compliance check for repositories
phase2Router.post('/compliance/check', 
  authenticate, 
  authorize(Permission.RESOURCES.TEMPLATES, Permission.ACTIONS.APPLY),
  async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const { repositories = [], templates = [], priority = 'normal' } = req.body;
    
    const result = await complianceService.triggerComplianceCheck({
      repositories,
      templates,
      priority
    });
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'check.triggered', {
      jobId: result.jobId,
      repositories: result.repositories,
      templates: result.templates,
      estimatedDuration: result.estimatedDuration
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error triggering compliance check:', error);
    res.status(500).json({ 
      error: 'Failed to trigger compliance check', 
      details: error.message 
    });
  }
});

// GET /api/v2/compliance/templates - List available templates and their requirements
phase2Router.get('/compliance/templates', async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const result = await complianceService.getAvailableTemplates();
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'templates.requested', {
      templateCount: result.templates.length
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting available templates:', error);
    res.status(500).json({ 
      error: 'Failed to get templates', 
      details: error.message 
    });
  }
});

// GET /api/v2/compliance/history - Template application history
phase2Router.get('/compliance/history', async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const { repository, template, limit, offset } = req.query;
    
    const options = {
      repository,
      template,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    };
    
    const result = await complianceService.getApplicationHistory(options);
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'history.requested', {
      options,
      resultCount: result.applications.length,
      totalApplications: result.pagination.total
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting application history:', error);
    res.status(500).json({ 
      error: 'Failed to get application history', 
      details: error.message 
    });
  }
});

// POST /api/v2/compliance/apply - Apply templates to non-compliant repositories
phase2Router.post('/compliance/apply', validateRequest(['repository', 'templates']), async (req, res) => {
  try {
    if (!complianceService) {
      complianceService = initializeComplianceService(req.app);
    }
    
    const { repository, templates, createPR = false, dryRun = true } = req.body;
    
    if (!Array.isArray(templates) || templates.length === 0) {
      return res.status(400).json({ 
        error: 'Templates must be a non-empty array' 
      });
    }
    
    const result = await complianceService.applyTemplate({
      repository,
      templates,
      createPR,
      dryRun
    });
    
    // Emit WebSocket event
    emitWSEvent(req, 'compliance', 'template.applied', {
      repository,
      templates,
      dryRun,
      success: result.results.every(r => r.success),
      resultCount: result.results.length
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error applying templates:', error);
    res.status(500).json({ 
      error: 'Failed to apply templates', 
      details: error.message 
    });
  }
});

// ===============================
// WebSocket Support Endpoints
// ===============================

// Get WebSocket connection info
phase2Router.get('/websocket/info', (req, res) => {
  res.json({
    url: process.env.NODE_ENV === 'development' 
      ? 'ws://localhost:3071' 
      : 'wss://gitops.internal/ws',
    channels: [
      'templates',
      'pipelines',
      'dependencies',
      'quality',
      'operations',
      'compliance'
    ],
    reconnectInterval: 5000,
    heartbeatInterval: 30000
  });
});

// ===== WEBHOOK MANAGEMENT ENDPOINTS =====

// Get webhook status and statistics
phase2Router.get('/webhooks/status', (req, res) => {
  try {
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized',
        status: 'unavailable'
      });
    }

    const stats = webhookHandler.getStats();
    const queueInfo = webhookHandler.eventQueue.getQueueInfo();
    
    res.json({
      status: 'active',
      endpoint: '/api/v2/webhooks/github',
      security: {
        hasSecret: stats.secret,
        signatureVerification: stats.secret ? 'enabled' : 'disabled'
      },
      queue: {
        ...stats.queue,
        items: queueInfo.items.slice(0, 10), // Show only first 10 items
        processing: queueInfo.processing
      },
      handlers: stats.eventHandlers,
      listeners: stats.listenerCount
    });
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({ error: 'Failed to get webhook status' });
  }
});

// Get recent webhook events
phase2Router.get('/webhooks/events', (req, res) => {
  try {
    const { limit = 50, type, repository } = req.query;
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized' 
      });
    }

    const queueInfo = webhookHandler.eventQueue.getQueueInfo();
    let events = queueInfo.items;

    // Filter by type if specified
    if (type) {
      events = events.filter(event => event.type === type);
    }

    // Filter by repository if specified
    if (repository) {
      events = events.filter(event => 
        event.repository && event.repository.includes(repository)
      );
    }

    // Limit results
    events = events.slice(0, parseInt(limit));

    res.json({
      events,
      total: queueInfo.items.length,
      filtered: events.length,
      processing: queueInfo.processing.length,
      filters: { type, repository, limit }
    });
  } catch (error) {
    console.error('Error getting webhook events:', error);
    res.status(500).json({ error: 'Failed to get webhook events' });
  }
});

// Webhook queue management
phase2Router.post('/webhooks/queue/pause', (req, res) => {
  try {
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized' 
      });
    }

    webhookHandler.eventQueue.pause();
    
    res.json({
      status: 'paused',
      message: 'Webhook event processing paused'
    });
  } catch (error) {
    console.error('Error pausing webhook queue:', error);
    res.status(500).json({ error: 'Failed to pause webhook queue' });
  }
});

phase2Router.post('/webhooks/queue/resume', (req, res) => {
  try {
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized' 
      });
    }

    webhookHandler.eventQueue.resume();
    
    res.json({
      status: 'resumed',
      message: 'Webhook event processing resumed'
    });
  } catch (error) {
    console.error('Error resuming webhook queue:', error);
    res.status(500).json({ error: 'Failed to resume webhook queue' });
  }
});

// Clear processed events cache
phase2Router.post('/webhooks/queue/cleanup', (req, res) => {
  try {
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized' 
      });
    }

    const beforeSize = webhookHandler.eventQueue.processed.size;
    webhookHandler.eventQueue.cleanupProcessedEvents();
    const afterSize = webhookHandler.eventQueue.processed.size;
    
    res.json({
      status: 'cleaned',
      message: 'Processed events cache cleaned',
      before: beforeSize,
      after: afterSize,
      cleaned: beforeSize - afterSize
    });
  } catch (error) {
    console.error('Error cleaning webhook queue:', error);
    res.status(500).json({ error: 'Failed to clean webhook queue' });
  }
});

// Test webhook endpoint (for development/testing)
phase2Router.post('/webhooks/test', (req, res) => {
  try {
    const { eventType = 'ping', repository = 'test/repo' } = req.body;
    const webhookHandler = req.app.locals.webhookHandler;
    
    if (!webhookHandler) {
      return res.status(503).json({ 
        error: 'Webhook handler not initialized' 
      });
    }

    // Create a test event
    const testEvent = {
      type: eventType,
      action: 'test',
      repository: {
        name: repository.split('/')[1] || 'repo',
        fullName: repository
      },
      timestamp: new Date().toISOString(),
      _test: true
    };

    // Queue the test event
    const queued = webhookHandler.eventQueue.enqueue(testEvent);
    
    res.json({
      status: 'test_event_created',
      queued,
      event: testEvent,
      message: `Test ${eventType} event ${queued ? 'queued' : 'rejected'} for ${repository}`
    });
  } catch (error) {
    console.error('Error creating test webhook:', error);
    res.status(500).json({ error: 'Failed to create test webhook' });
  }
});

module.exports = phase2Router;
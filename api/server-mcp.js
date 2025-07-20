/**
 * GitOps Auditor API Server with GitHub MCP Integration
 * 
 * Enhanced with GitHub MCP server integration for repository operations.
 * All git operations are coordinated through Serena MCP orchestration.
 * 
 * Version: 2.0.0 (Phase 2: Advanced DevOps Platform)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Load configuration and GitHub MCP manager
const ConfigLoader = require('./config-loader');
const GitHubMCPManager = require('./github-mcp-manager');
const WikiAgentManager = require('./wiki-agent-manager');

// Phase 2 API Endpoints
const phase2Router = require('./phase2-endpoints');

// WebSocket Support
const WebSocketManager = require('./websocket-server');
const Phase2WebSocketExtension = require('./phase2-websocket');

const config = new ConfigLoader();
const githubMCP = new GitHubMCPManager(config);

// Parse command line arguments
const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
const portFromArg = portArg ? parseInt(portArg.split('=')[1]) : null;

// Environment detection
const isDev = process.env.NODE_ENV === 'development';
const rootDir = isDev ? process.cwd() : '/opt/gitops';

// Initialize WikiJS Agent after rootDir is available
const wikiAgent = new WikiAgentManager(config, rootDir);

// Configuration
const PORT = portFromArg || process.env.PORT || 3070;
const HISTORY_DIR = path.join(rootDir, 'audit-history');
const LOCAL_DIR = path.join(rootDir, 'repos');

const app = express();

// CORS configuration with GitHub MCP integration awareness
const allowedOrigins = isDev ? ['http://localhost:5173', 'http://localhost:5174'] : [];

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isDev && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware to log MCP integration status
app.use((req, res, next) => {
  if (req.path.startsWith('/audit')) {
    console.log(`🔄 API Request: ${req.method} ${req.path} (GitHub MCP: ${githubMCP.mcpAvailable ? 'Active' : 'Fallback'})`);
  }
  next();
});

// ===============================
// Health Monitoring API Endpoints
// ===============================

// Health monitoring routes (temporarily commented out due to middleware dependencies)
// const { router: healthRouter, initializeServices: initializeHealthServices } = require('./routes/health');

// Mount health monitoring routes
// app.use('/api/health', healthRouter);

// ===============================
// WikiJS Agent API Endpoints
// ===============================

// Get wiki agent status and statistics
app.get('/wiki-agent/status', async (req, res) => {
  try {
    const stats = await wikiAgent.getAgentStats();
    res.json({
      status: 'active',
      agent: 'WikiJS AI Agent',
      version: '1.0.0',
      statistics: stats
    });
  } catch (error) {
    console.error('❌ Failed to get wiki agent status:', error);
    res.status(500).json({ 
      error: 'Failed to get agent status', 
      details: error.message 
    });
  }
});

// Manual initialization trigger
app.post('/wiki-agent/initialize', async (req, res) => {
  try {
    await wikiAgent.initialize();
    res.json({ 
      success: true, 
      message: 'WikiJS Agent initialized successfully' 
    });
  } catch (error) {
    console.error('❌ Failed to initialize wiki agent:', error);
    res.status(500).json({ 
      error: 'Failed to initialize agent', 
      details: error.message 
    });
  }
});

// Get agent configuration
app.get('/wiki-agent/config', async (req, res) => {
  try {
    const config = await wikiAgent.runQuery('SELECT * FROM agent_config ORDER BY id DESC LIMIT 1');
    if (config.length === 0) {
      return res.status(404).json({ error: 'No configuration found' });
    }
    
    const configData = config[0];
    res.json({
      auto_discovery_enabled: configData.auto_discovery_enabled === 1,
      batch_size: configData.batch_size,
      priority_threshold: configData.priority_threshold,
      wikijs_url: configData.wikijs_url,
      wikijs_enabled: configData.wikijs_enabled === 1,
      last_updated: configData.updated_at
    });
  } catch (error) {
    console.error('❌ Failed to get wiki agent config:', error);
    res.status(500).json({ 
      error: 'Failed to get configuration', 
      details: error.message 
    });
  }
});

// Update agent configuration
app.post('/wiki-agent/config', async (req, res) => {
  try {
    const {
      auto_discovery_enabled,
      batch_size,
      priority_threshold,
      wikijs_url,
      wikijs_enabled
    } = req.body;

    // Update configuration in database
    await wikiAgent.runQuery(`
      INSERT OR REPLACE INTO agent_config 
      (id, auto_discovery_enabled, batch_size, priority_threshold, wikijs_url, wikijs_enabled, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      auto_discovery_enabled ? 1 : 0,
      batch_size || 10,
      priority_threshold || 50,
      wikijs_url || '',
      wikijs_enabled ? 1 : 0
    ]);

    res.json({ 
      success: true, 
      message: 'Configuration updated successfully' 
    });
  } catch (error) {
    console.error('❌ Failed to update wiki agent config:', error);
    res.status(500).json({ 
      error: 'Failed to update configuration', 
      details: error.message 
    });
  }
});

// Test WikiJS connectivity
app.get('/wiki-agent/test-wikijs', async (req, res) => {
  try {
    // Get current configuration
    const configResult = await wikiAgent.runQuery('SELECT * FROM agent_config ORDER BY id DESC LIMIT 1');
    if (configResult.length === 0) {
      return res.status(400).json({ 
        error: 'No WikiJS configuration found',
        success: false 
      });
    }

    const config = configResult[0];
    if (!config.wikijs_url) {
      return res.status(400).json({ 
        error: 'WikiJS URL not configured',
        success: false 
      });
    }

    // Test WikiJS connection using the real implementation
    const testResult = await wikiAgent.testWikiJSConnection();
    res.json(testResult);
  } catch (error) {
    console.error('❌ Failed to test WikiJS connection:', error);
    res.status(500).json({ 
      error: 'Failed to test WikiJS connection', 
      details: error.message,
      success: false 
    });
  }
});

// Document discovery endpoints
app.post('/wiki-agent/discover', async (req, res) => {
  try {
    const result = await wikiAgent.runProjectDiscovery();
    res.json({
      success: true,
      message: 'Document discovery completed',
      discovered: result.discovered,
      processed: result.processed
    });
  } catch (error) {
    console.error('❌ Document discovery failed:', error);
    res.status(500).json({
      error: 'Document discovery failed',
      details: error.message
    });
  }
});

// Get discovered documents
app.get('/wiki-agent/documents', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM wiki_documents';
    let params = [];
    
    if (status) {
      query += ' WHERE sync_status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY priority_score DESC, updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const documents = await wikiAgent.allQuery(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM wiki_documents';
    let countParams = [];
    if (status) {
      countQuery += ' WHERE sync_status = ?';
      countParams.push(status);
    }
    
    const totalResult = await wikiAgent.getQuery(countQuery, countParams);
    
    res.json({
      documents,
      total: totalResult?.total || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Failed to get documents:', error);
    res.status(500).json({
      error: 'Failed to get documents',
      details: error.message
    });
  }
});

// Upload documents to WikiJS
app.post('/wiki-agent/upload/:documentId', async (req, res) => {
  try {
    const documentId = parseInt(req.params.documentId);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const result = await wikiAgent.uploadToWikiJS(documentId);
    res.json(result);
  } catch (error) {
    console.error('❌ Document upload failed:', error);
    res.status(500).json({
      error: 'Document upload failed',
      details: error.message
    });
  }
});

// Get production status and configuration
app.get('/wiki-agent/production-status', async (req, res) => {
  try {
    const status = {
      environment: wikiAgent.environment,
      isProduction: wikiAgent.isProduction,
      configuration: {
        maxRetries: wikiAgent.productionConfig.maxRetries,
        initialRetryDelay: wikiAgent.productionConfig.initialRetryDelay,
        batchSize: wikiAgent.productionConfig.batchSize,
        enableDetailedLogging: wikiAgent.productionConfig.enableDetailedLogging,
        wikijsConfigured: !!wikiAgent.productionConfig.wikijsToken
      },
      databasePath: wikiAgent.dbPath,
      serverStartTime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    };
    
    res.json(status);
  } catch (error) {
    console.error('❌ Failed to get production status:', error);
    res.status(500).json({
      error: 'Failed to get production status',
      details: error.message
    });
  }
});

// Batch upload documents
app.post('/wiki-agent/upload/batch', async (req, res) => {
  try {
    const { documentIds } = req.body;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }
    
    const results = await wikiAgent.batchUploadToWikiJS(documentIds);
    res.json(results);
  } catch (error) {
    console.error('❌ Batch upload failed:', error);
    res.status(500).json({
      error: 'Batch upload failed',
      details: error.message
    });
  }
});

// ===============================
// Phase 2 Advanced DevOps Platform Routes
// ===============================

// Mount Phase 2 endpoints
app.use('/api/v2', phase2Router);

// ===============================
// Audit API Endpoints
// ===============================

// Load latest audit report
app.get('/audit', (req, res) => {
  try {
    console.log('📊 Loading latest audit report...');
    
    // Try loading latest.json from audit-history
    const latestPath = path.join(HISTORY_DIR, 'latest.json');
    let auditData;
    
    if (fs.existsSync(latestPath)) {
      auditData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      console.log('✅ Loaded latest audit report from history');
    } else {
      // Fallback to dashboard/public/audit.json for development
      const fallbackPath = path.join(rootDir, 'dashboard', 'public', 'audit.json');
      if (fs.existsSync(fallbackPath)) {
        auditData = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        console.log('✅ Loaded audit report from fallback location');
      } else {
        console.log('⚠️  No audit report found');
        return res.status(404).json({ error: 'No audit report available' });
      }
    }
    
    res.json(auditData);
  } catch (err) {
    console.error('❌ Error loading audit report:', err);
    res.status(500).json({ error: 'Failed to load latest audit report.' });
  }
});

// List historical audit reports
app.get('/audit/history', (req, res) => {
  try {
    console.log('📚 Loading audit history...');
    
    // Create history directory if it doesn't exist
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(file => file.endsWith('.json') && file !== 'latest.json')
      .sort((a, b) => b.localeCompare(a)) // Most recent first
      .slice(0, 50); // Limit to 50 most recent
    
    const history = files.map(file => ({
      filename: file,
      timestamp: file.replace('.json', ''),
      path: `/audit/history/${file}`
    }));
    
    console.log(`✅ Loaded ${history.length} historical reports`);
    res.json(history);
  } catch (err) {
    console.error('❌ Error loading audit history:', err);
    res.status(500).json({ error: 'Failed to load audit history' });
  }
});

// Clone missing repository using GitHub MCP
app.post('/audit/clone', async (req, res) => {
  const { repo, clone_url } = req.body;
  
  if (!repo || !clone_url) {
    return res.status(400).json({ error: 'repo and clone_url required' });
  }
  
  try {
    console.log(`🔄 Cloning repository: ${repo}`);
    const dest = path.join(LOCAL_DIR, repo);
    
    // Use GitHub MCP manager for cloning
    const result = await githubMCP.cloneRepository(repo, clone_url, dest);
    
    // Create issue for audit finding if MCP is available
    if (githubMCP.mcpAvailable) {
      await githubMCP.createIssueForAuditFinding(
        `Repository ${repo} was missing locally`,
        `Repository ${repo} was found missing from local audit environment and has been cloned.\n\nClone URL: ${clone_url}\nDestination: ${dest}`,
        ['audit', 'missing-repo', 'automated-fix']
      );
    }
    
    res.json(result);
  } catch (error) {
    console.error(`❌ Clone failed for ${repo}:`, error);
    res.status(500).json({ error: `Failed to clone ${repo}: ${error.message}` });
  }
});

// Delete extra repository
app.post('/audit/delete', (req, res) => {
  const { repo } = req.body;
  const target = path.join(LOCAL_DIR, repo);
  
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: 'Repo not found locally' });
  }
  
  console.log(`🗑️  Deleting extra repository: ${repo}`);
  exec(`rm -rf ${target}`, async (err) => {
    if (err) {
      console.error(`❌ Delete failed for ${repo}:`, err);
      return res.status(500).json({ error: `Failed to delete ${repo}` });
    }
    
    console.log(`✅ Successfully deleted ${repo}`);
    
    // Create issue for audit finding if MCP is available
    if (githubMCP.mcpAvailable) {
      try {
        await githubMCP.createIssueForAuditFinding(
          `Extra repository ${repo} was deleted`,
          `Repository ${repo} was found as an extra local repository (not in GitHub) and has been deleted.\n\nPath: ${target}`,
          ['audit', 'extra-repo', 'automated-cleanup']
        );
      } catch (issueError) {
        console.error('⚠️  Failed to create issue for deletion:', issueError);
      }
    }
    
    res.json({ status: `Deleted ${repo}` });
  });
});

// Commit dirty repository using GitHub MCP
app.post('/audit/commit', async (req, res) => {
  const { repo, message } = req.body;
  const repoPath = path.join(LOCAL_DIR, repo);
  
  if (!githubMCP.isGitRepository(repoPath)) {
    return res.status(404).json({ error: 'Not a git repo' });
  }
  
  try {
    console.log(`💾 Committing changes in repository: ${repo}`);
    const commitMessage = message || 'Auto commit from GitOps audit';
    
    // Use GitHub MCP manager for committing
    const result = await githubMCP.commitChanges(repo, repoPath, commitMessage);
    
    // Create issue for audit finding if MCP is available
    if (githubMCP.mcpAvailable) {
      await githubMCP.createIssueForAuditFinding(
        `Uncommitted changes in ${repo} were committed`,
        `Repository ${repo} had uncommitted changes that have been committed automatically.\n\nCommit message: ${commitMessage}\nPath: ${repoPath}`,
        ['audit', 'dirty-repo', 'automated-commit']
      );
    }
    
    res.json(result);
  } catch (error) {
    console.error(`❌ Commit failed for ${repo}:`, error);
    res.status(500).json({ error: 'Commit failed', details: error.message });
  }
});

// Fix remote URL using GitHub MCP
if (isDev) {
  app.post('/audit/fix-remote', async (req, res) => {
    const { repo, expected_url } = req.body;
    
    if (!repo || !expected_url) {
      return res.status(400).json({ error: 'repo and expected_url required' });
    }
    
    const repoPath = path.join(LOCAL_DIR, repo);
    
    if (!githubMCP.isGitRepository(repoPath)) {
      return res.status(404).json({ error: 'Not a git repo' });
    }
    
    try {
      console.log(`🔗 Fixing remote URL for repository: ${repo}`);
      
      // Use GitHub MCP manager for updating remote URL
      const result = await githubMCP.updateRemoteUrl(repo, repoPath, expected_url);
      
      // Create issue for audit finding if MCP is available
      if (githubMCP.mcpAvailable) {
        await githubMCP.createIssueForAuditFinding(
          `Remote URL mismatch fixed for ${repo}`,
          `Repository ${repo} had incorrect remote URL that has been fixed.\n\nNew URL: ${expected_url}\nPath: ${repoPath}`,
          ['audit', 'remote-mismatch', 'automated-fix']
        );
      }
      
      res.json(result);
    } catch (error) {
      console.error(`❌ Remote URL fix failed for ${repo}:`, error);
      res.status(500).json({ error: 'Failed to fix remote URL', details: error.message });
    }
  });

  // Get repository mismatch details using GitHub MCP
  app.get('/audit/mismatch/:repo', async (req, res) => {
    const repo = req.params.repo;
    const repoPath = path.join(LOCAL_DIR, repo);

    if (!githubMCP.isGitRepository(repoPath)) {
      return res.status(404).json({ error: 'Not a git repo' });
    }

    try {
      console.log(`🔍 Checking remote URL mismatch for: ${repo}`);
      
      // Use GitHub MCP manager for getting remote URL
      const result = await githubMCP.getRemoteUrl(repo, repoPath);
      const currentUrl = result.url;
      const expectedUrl = githubMCP.getExpectedGitHubUrl(repo);

      res.json({
        repo,
        currentUrl,
        expectedUrl,
        mismatch: currentUrl !== expectedUrl,
      });
    } catch (error) {
      console.error(`❌ Mismatch check failed for ${repo}:`, error);
      res.status(500).json({ error: 'Failed to get remote URL' });
    }
  });

  // Batch operation for multiple repositories using GitHub MCP
  app.post('/audit/batch', async (req, res) => {
    const { operation, repos } = req.body;
    
    if (!operation || !repos || !Array.isArray(repos)) {
      return res.status(400).json({ error: 'operation and repos array required' });
    }

    console.log(`🔄 Executing batch operation: ${operation} on ${repos.length} repositories`);
    
    const results = [];
    let completed = 0;

    for (const repo of repos) {
      const repoPath = path.join(LOCAL_DIR, repo);
      
      try {
        let result;
        
        switch (operation) {
          case 'clone':
            const cloneUrl = githubMCP.getExpectedGitHubUrl(repo);
            result = await githubMCP.cloneRepository(repo, cloneUrl, repoPath);
            break;
            
          case 'fix-remote':
            const expectedUrl = githubMCP.getExpectedGitHubUrl(repo);
            result = await githubMCP.updateRemoteUrl(repo, repoPath, expectedUrl);
            break;
            
          case 'delete':
            // Delete operation doesn't use MCP (file system operation)
            await new Promise((resolve, reject) => {
              exec(`rm -rf ${repoPath}`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            result = { status: `Deleted ${repo}` };
            break;
            
          default:
            throw new Error('Invalid operation');
        }
        
        results.push({
          repo,
          success: true,
          error: null,
          result: result,
        });
        
        console.log(`✅ Batch ${operation} completed for ${repo}`);
      } catch (error) {
        console.error(`❌ Batch ${operation} failed for ${repo}:`, error);
        results.push({
          repo,
          success: false,
          error: error.message,
          result: null,
        });
      }
      
      completed++;
    }
    
    console.log(`🎯 Batch operation completed: ${completed}/${repos.length} repositories processed`);
    res.json({ operation, results });
  });
}

// Discard changes in dirty repo using GitHub MCP
app.post('/audit/discard', async (req, res) => {
  const { repo } = req.body;
  const repoPath = path.join(LOCAL_DIR, repo);
  
  if (!githubMCP.isGitRepository(repoPath)) {
    return res.status(404).json({ error: 'Not a git repo' });
  }
  
  try {
    console.log(`🗑️  Discarding changes in repository: ${repo}`);
    
    // Use GitHub MCP manager for discarding changes
    const result = await githubMCP.discardChanges(repo, repoPath);
    
    // Create issue for audit finding if MCP is available
    if (githubMCP.mcpAvailable) {
      await githubMCP.createIssueForAuditFinding(
        `Changes discarded in ${repo}`,
        `Repository ${repo} had uncommitted changes that have been discarded.\n\nPath: ${repoPath}`,
        ['audit', 'changes-discarded', 'automated-cleanup']
      );
    }
    
    res.json(result);
  } catch (error) {
    console.error(`❌ Discard failed for ${repo}:`, error);
    res.status(500).json({ error: 'Discard failed', details: error.message });
  }
});

// Return status and diff for dirty repository using GitHub MCP
app.get('/audit/diff/:repo', async (req, res) => {
  const repo = req.params.repo;
  const repoPath = path.join(LOCAL_DIR, repo);
  
  if (!githubMCP.isGitRepository(repoPath)) {
    return res.status(404).json({ error: 'Not a git repo' });
  }

  try {
    console.log(`📊 Getting diff for repository: ${repo}`);
    
    // Use GitHub MCP manager for getting repository diff
    const result = await githubMCP.getRepositoryDiff(repo, repoPath);
    
    res.json({ repo, diff: result.diff });
  } catch (error) {
    console.error(`❌ Diff failed for ${repo}:`, error);
    res.status(500).json({ error: 'Diff failed', details: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 GitOps Auditor API Server started!');
  console.log(`📡 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔧 Environment: ${isDev ? 'Development' : 'Production'}`);
  console.log(`📂 Root directory: ${rootDir}`);
  console.log(`🔗 GitHub MCP: ${githubMCP.mcpAvailable ? 'Active' : 'Fallback mode'}`);
  
  // Initialize WikiJS Agent
  try {
    await wikiAgent.initialize();
    console.log('📚 WikiJS Agent: Initialized');
  } catch (error) {
    console.error('❌ WikiJS Agent initialization failed:', error.message);
  }
  
  // Initialize WebSocket Manager
  const auditDataPath = path.join(HISTORY_DIR, 'latest.json');
  const wsManager = new WebSocketManager(app, auditDataPath, {
    maxConnections: 100,
    debounceDelay: 1000
  });
  
  // Initialize Phase 2 WebSocket Extensions
  const phase2WS = new Phase2WebSocketExtension(wsManager);
  
  // Make WebSocket manager available to Phase 2 endpoints
  app.locals.wsManager = wsManager;
  app.locals.phase2WS = phase2WS;
  
  // Initialize MCP integration with real MCP servers
  const SerenaOrchestrator = require('./serena-orchestrator');
  const MCPConnector = require('./mcp-connector');
  
  // Initialize real MCP connections
  const mcpConnector = new MCPConnector();
  await mcpConnector.initialize();
  const mcpServers = mcpConnector.getMCPServers();
  
  // Create and configure SerenaOrchestrator
  const orchestrator = new SerenaOrchestrator(mcpServers);
  
  // Set MCP servers and orchestrator on GitHubMCPManager
  githubMCP.setMCPServers(mcpServers);
  githubMCP.setOrchestrator(orchestrator);
  
  // Make GitHub MCP manager available to endpoints
  app.locals.githubMCP = githubMCP;
  app.locals.orchestrator = orchestrator;
  
  // Initialize health monitoring services (commented out temporarily)
  /*
  const healthServices = {
    metrics: null, // Will be integrated with MetricsService when available
    websocket: wsManager,
    alerting: null // Will be integrated with AlertingService when available
  };
  
  // Initialize health monitoring
  try {
    initializeHealthServices(healthServices);
    console.log('🏥 Health monitoring services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize health monitoring:', error.message);
  }
  */
  
  console.log('🔌 WebSocket server initialized with Phase 2 extensions');
  
  console.log(`🎯 Ready to serve GitOps audit operations!`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM signal, shutting down gracefully...');
  
  // Clean up WebSocket connections
  if (app.locals.wsManager) {
    app.locals.wsManager.cleanup();
  }
  
  await wikiAgent.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT signal, shutting down gracefully...');
  
  // Clean up WebSocket connections
  if (app.locals.wsManager) {
    app.locals.wsManager.cleanup();
  }
  
  await wikiAgent.close();
  process.exit(0);
});

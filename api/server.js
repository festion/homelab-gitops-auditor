// File: server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const ConfigLoader = require('./config-loader');
const config = new ConfigLoader();
const { exec } = require('child_process');

// v1.1.0 Feature imports
const { handleCSVExport } = require('./csv-export');
const { handleEmailSummary } = require('./email-notifications');

// v1.2.0 WebSocket Feature import
const WebSocketManager = require('./websocket-server');

// GitHub Webhook Handler
const WebhookHandler = require('./services/webhook-handler');

// Phase 2 API Endpoints
const phase2Router = require('./phase2-endpoints');

// Authentication System
const Database = require('./models/database');
const SecurityMiddleware = require('./middleware/security');
const authRoutes = require('./routes/auth');

// WikiJS Agent System
const WikiAgentManager = require('./wiki-agent-manager');
const wikiRoutes = require('./routes/wiki');

// Parse command line arguments for port
const args = process.argv.slice(2);
let portArg = args.find((arg) => arg.startsWith('--port='));
let portFromArg = portArg ? parseInt(portArg.split('=')[1], 10) : null;

// Determine if we're in development or production mode
const isDev = process.env.NODE_ENV !== 'production';
const rootDir = isDev
  ? path.resolve(__dirname, '..') // Development: /mnt/c/GIT/homelab-gitops-auditor
  : '/opt/gitops'; // Production: /opt/gitops

const app = express();
const PORT = portFromArg || process.env.PORT || 3070;
const HISTORY_DIR = path.join(rootDir, 'audit-history');
const LOCAL_DIR = isDev ? '/mnt/c/GIT' : '/mnt/c/GIT';

// WikiJS Agent Manager instance
let wikiAgentManager;

// Security middleware
if (process.env.NODE_ENV === 'production') {
  SecurityMiddleware.productionSecurity().forEach(middleware => app.use(middleware));
} else {
  SecurityMiddleware.developmentSecurity().forEach(middleware => app.use(middleware));
}

// Initialize authentication database
async function initializeAuth() {
  try {
    const db = Database.getInstance();
    await db.connect();
    await db.initializeSchema();
    await db.createDefaultAdmin();
    console.log('Authentication system initialized');
  } catch (error) {
    console.error('Failed to initialize authentication:', error);
    process.exit(1);
  }
}

// Initialize WikiJS Agent Manager
async function initializeWikiAgent() {
  try {
    wikiAgentManager = new WikiAgentManager(config, rootDir);
    await wikiAgentManager.initialize();
    console.log('WikiJS Agent Manager initialized');
  } catch (error) {
    console.error('Failed to initialize WikiJS Agent Manager:', error);
    // Don't exit process - wiki functionality is optional
  }
}

// Serve static dashboard files in development
if (isDev) {
  app.use(express.static(path.join(rootDir, 'dashboard/public')));
}

app.use(express.json());

// Mount authentication routes
app.use('/api/v2/auth', authRoutes);

// Mount Phase 2 routes
app.use('/api/v2', phase2Router);

// Mount WikiJS Agent routes
app.use('/api/wiki', (req, res, next) => {
  req.wikiAgentManager = wikiAgentManager;
  next();
}, wikiRoutes);

// Load latest audit report
app.get('/audit', (req, res) => {
  try {
    // Try loading latest.json from audit-history
    const latestJsonPath = path.join(HISTORY_DIR, 'latest.json');

    if (fs.existsSync(latestJsonPath)) {
      const data = fs.readFileSync(latestJsonPath);
      res.json(JSON.parse(data));
    } else {
      // Fallback to reading the static file from dashboard/public in development
      const staticFilePath = path.join(
        rootDir,
        'dashboard/public/GitRepoReport.json'
      );

      if (fs.existsSync(staticFilePath)) {
        const data = fs.readFileSync(staticFilePath);
        res.json(JSON.parse(data));
      } else {
        throw new Error('No JSON data found');
      }
    }
  } catch (err) {
    console.error('Error loading audit report:', err);
    res.status(500).json({ error: 'Failed to load latest audit report.' });
  }
});

// List historical audit reports
app.get('/audit/history', (req, res) => {
  try {
    // Create history directory if it doesn't exist
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }

    const files = fs
      .readdirSync(HISTORY_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'latest.json')
      .sort()
      .reverse();

    // In development mode with no history, return empty array instead of error
    res.json(files);
  } catch (err) {
    console.error('Error listing audit history:', err);

// v1.1.0 - CSV Export endpoint
app.get('/audit/export/csv', (req, res) => {
  handleCSVExport(req, res, HISTORY_DIR);
});

// v1.1.0 - Email Summary endpoint  
app.post('/audit/email-summary', (req, res) => {
  handleEmailSummary(req, res, HISTORY_DIR);
});
    res.status(500).json({ error: 'Failed to list audit history.' });
  }
});

// Clone missing repository
app.post('/audit/clone', (req, res) => {
  const { repo, clone_url } = req.body;
  if (!repo || !clone_url)
    return res.status(400).json({ error: 'repo and clone_url required' });
  const dest = path.join(LOCAL_DIR, repo);
  exec(`git clone ${clone_url} ${dest}`, (err) => {
    if (err) return res.status(500).json({ error: `Failed to clone ${repo}` });
    res.json({ status: `Cloned ${repo} to ${dest}` });
  });
});

// Delete extra repository
app.post('/audit/delete', (req, res) => {
  const { repo } = req.body;
  const target = path.join(LOCAL_DIR, repo);
  if (!fs.existsSync(target))
    return res.status(404).json({ error: 'Repo not found locally' });
  exec(`rm -rf ${target}`, (err) => {
    if (err) return res.status(500).json({ error: `Failed to delete ${repo}` });
    res.json({ status: `Deleted ${repo}` });
  });
});

// Commit dirty repository
app.post('/audit/commit', (req, res) => {
  const { repo, message } = req.body;
  const repoPath = path.join(LOCAL_DIR, repo);
  if (!fs.existsSync(path.join(repoPath, '.git')))
    return res.status(404).json({ error: 'Not a git repo' });
  const commitMessage = message || 'Auto commit from GitOps audit';
  const cmd = `cd ${repoPath} && git add . && git commit -m "${commitMessage}"`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: 'Commit failed', stderr });

    // Fix remote URL mismatch
    app.post('/audit/fix-remote', (req, res) => {
      const { repo, expected_url } = req.body;
      if (!repo || !expected_url)
        return res
          .status(400)
          .json({ error: 'repo and expected_url required' });

      const repoPath = path.join(LOCAL_DIR, repo);
      if (!fs.existsSync(path.join(repoPath, '.git')))
        return res.status(404).json({ error: 'Not a git repo' });

      const cmd = `cd ${repoPath} && git remote set-url origin ${expected_url}`;
      exec(cmd, (err, stdout, stderr) => {
        if (err)
          return res
            .status(500)
            .json({ error: 'Failed to fix remote URL', stderr });
        res.json({ status: `Fixed remote URL for ${repo}`, stdout });
      });
    });

    // Run comprehensive audit script
    app.post('/audit/run-comprehensive', (req, res) => {
      const scriptPath = isDev
        ? path.join(rootDir, 'scripts/comprehensive_audit.sh')
        : '/opt/gitops/scripts/comprehensive_audit.sh';

      const devFlag = isDev ? '--dev' : '';
      const cmd = `bash ${scriptPath} ${devFlag}`;

      exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err)
          return res
            .status(500)
            .json({ error: 'Comprehensive audit failed', stderr });
        res.json({ status: 'Comprehensive audit completed', stdout });
      });
    });

    // Get repository mismatch details
    app.get('/audit/mismatch/:repo', (req, res) => {
      const repo = req.params.repo;
      const repoPath = path.join(LOCAL_DIR, repo);

      if (!fs.existsSync(path.join(repoPath, '.git'))) {
        return res.status(404).json({ error: 'Not a git repo' });
      }

      const cmd = `cd ${repoPath} && git remote get-url origin`;
      exec(cmd, (err, stdout) => {
        if (err)
          return res.status(500).json({ error: 'Failed to get remote URL' });

        const currentUrl = stdout.trim();
        const expectedUrl = `https://github.com/${config.get(
          'GITHUB_USER'
        )}/${repo}.git`;

        res.json({
          repo,
          currentUrl,
          expectedUrl,
          mismatch: currentUrl !== expectedUrl,
        });
      });
    });

    // Batch operation for multiple repositories
    app.post('/audit/batch', (req, res) => {
      const { operation, repos } = req.body;
      if (!operation || !repos || !Array.isArray(repos)) {
        return res
          .status(400)
          .json({ error: 'operation and repos array required' });
      }

      const results = [];
      let completed = 0;

      repos.forEach((repo) => {
        let cmd;
        const repoPath = path.join(LOCAL_DIR, repo);

        switch (operation) {
          case 'clone':
            cmd = `git clone https://github.com/${config.get(
              'GITHUB_USER'
            )}/${repo}.git ${repoPath}`;
            break;
          case 'fix-remote':
            cmd = `cd ${repoPath} && git remote set-url origin https://github.com/${config.get(
              'GITHUB_USER'
            )}/${repo}.git`;
            break;
          case 'delete':
            cmd = `rm -rf ${repoPath}`;
            break;
          default:
            return res.status(400).json({ error: 'Invalid operation' });
        }

        exec(cmd, (err, stdout, stderr) => {
          results.push({
            repo,
            success: !err,
            error: err ? err.message : null,
            output: stdout,
          });

          completed++;
          if (completed === repos.length) {
            res.json({ operation, results });
          }
        });
      });
    });

    res.json({ status: 'Committed changes', stdout });
  });
});

// Discard changes in dirty repo
app.post('/audit/discard', (req, res) => {
  const { repo } = req.body;
  const repoPath = path.join(LOCAL_DIR, repo);
  if (!fs.existsSync(path.join(repoPath, '.git')))
    return res.status(404).json({ error: 'Not a git repo' });
  const cmd = `cd ${repoPath} && git reset --hard && git clean -fd`;
  exec(cmd, (err) => {
    if (err) return res.status(500).json({ error: 'Discard failed' });
    res.json({ status: 'Discarded changes' });
  });
});

// Return status and diff for dirty repository
app.get('/audit/diff/:repo', (req, res) => {
  const repo = req.params.repo;
  const repoPath = path.join(LOCAL_DIR, repo);
  if (!fs.existsSync(path.join(repoPath, '.git')))
    return res.status(404).json({ error: 'Not a git repo' });

  const cmd = `cd ${repoPath} && git status --short && echo '---' && git diff`;
  exec(cmd, (err, stdout) => {
    if (err) return res.status(500).json({ error: 'Diff failed' });
    res.json({ repo, diff: stdout });
  });
});

// GitHub Webhook endpoint - must use raw body parser
app.post('/api/v2/webhooks/github', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Convert raw body back to JSON for webhook handler
  try {
    req.body = JSON.parse(req.body);
    next();
  } catch (error) {
    console.error('Invalid JSON in webhook payload:', error);
    res.status(400).json({ error: 'Invalid JSON payload' });
  }
});

// Initialize WebSocket Manager
const auditDataPath = isDev 
  ? path.join(rootDir, 'dashboard/public/GitRepoReport.json')
  : '/opt/gitops/dashboard/GitRepoReport.json';

let wsManager;

// Start server with authentication initialization
async function startServer() {
  try {
    // Initialize authentication system first
    await initializeAuth();
    
    // Initialize WikiJS Agent Manager
    await initializeWikiAgent();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🔧 GitOps Audit API running on port ${PORT}`);
      console.log(`📋 Configuration loaded successfully`);
      console.log(`🔐 Authentication system ready`);

  // Initialize WebSocket after server starts
  try {
    wsManager = new WebSocketManager(app, auditDataPath, {
      maxConnections: 50,
      debounceDelay: 1000
    });
    console.log(`🔌 WebSocket server initialized - watching: ${auditDataPath}`);
  } catch (error) {
    console.error(`❌ Failed to initialize WebSocket server:`, error);
  }

  // Initialize GitHub Webhook Handler
  try {
    const webhookHandler = new WebhookHandler({
      secret: process.env.GITHUB_WEBHOOK_SECRET,
      websocketService: wsManager
    });

    // Store webhook handler in app locals for endpoint access
    app.locals.webhookHandler = webhookHandler;

    // Set up webhook endpoint with the middleware
    app.use('/api/v2/webhooks/github', webhookHandler.middleware());

    // Connect webhook events to WebSocket broadcasts
    webhookHandler.on('push_event', (event) => {
      if (wsManager) {
        wsManager.broadcastUpdate({
          type: 'webhook',
          eventType: 'push',
          data: event
        });
      }
    });

    webhookHandler.on('workflow_run_event', (event) => {
      if (wsManager) {
        wsManager.broadcastUpdate({
          type: 'webhook',
          eventType: 'workflow_run',
          data: event
        });
      }
    });

    webhookHandler.on('pull_request_event', (event) => {
      if (wsManager) {
        wsManager.broadcastUpdate({
          type: 'webhook',
          eventType: 'pull_request',
          data: event
        });
      }
    });

    webhookHandler.on('audit_refresh_needed', (event) => {
      if (wsManager) {
        wsManager.broadcastUpdate({
          type: 'audit_refresh',
          data: event
        });
      }
    });

    console.log(`🪝 GitHub webhook handler initialized - endpoint: /api/v2/webhooks/github`);
  } catch (error) {
    console.error(`❌ Failed to initialize webhook handler:`, error);
  }

  if (config.getBoolean('ENABLE_VERBOSE_LOGGING')) {
    config.display();
  }

  if (isDev) {
    console.log(`📍 Development mode - API: ${config.getApiUrl(true)}`);
    console.log(`📍 Dashboard: ${config.getDashboardUrl(true)}`);
    console.log(`📁 Local Git Root: ${config.get('LOCAL_GIT_ROOT')}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
  } else {
    console.log(`📍 Production mode - API: ${config.getApiUrl(false)}`);
    console.log(`📍 Dashboard: ${config.getDashboardUrl(false)}`);
    console.log(`📁 Local Git Root: ${config.get('LOCAL_GIT_ROOT')}`);
    console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT}/ws`);
  }
    });
    
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().then(server => {
  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('📊 SIGTERM received, shutting down gracefully');
    
    if (wsManager) {
      wsManager.cleanup();
    }
    
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('📊 SIGINT received, shutting down gracefully');
    
    if (wsManager) {
      wsManager.cleanup();
    }
    
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}).catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

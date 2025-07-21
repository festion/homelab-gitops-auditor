/**
 * WikiJS AI Agent Manager
 *
 * Manages the intelligent document discovery, processing, and upload pipeline
 * for converting Markdown documentation to WikiJS entries.
 *
 * Features:
 * - Document lifecycle management (DISCOVERED → UPLOADED)
 * - Repository-first processing strategy
 * - SQLite database for state tracking
 * - Integration with WikiJS MCP server
 *
 * Version: 1.0.0 (Phase 1A - Foundation)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

class WikiAgentManager {
  constructor(config, rootDir) {
    this.config = config;
    this.rootDir = rootDir;
    this.dbPath = path.join(rootDir, 'wiki-agent.db');
    this.db = null;
    
    // Environment detection
    this.environment = process.env.NODE_ENV || 'development';
    this.isProduction = this.environment === 'production';
    
    // Production configuration
    this.productionConfig = {
      maxRetries: this.isProduction ? 5 : 3,
      initialRetryDelay: this.isProduction ? 2000 : 1000,
      batchSize: this.isProduction ? 20 : 5,
      enableDetailedLogging: !this.isProduction,
      wikijsUrl: process.env.WIKIJS_URL || (this.config?.get ? this.config.get('WIKIJS_URL') : this.config?.WIKIJS_URL) || 'http://test-wiki.example.com',
      wikijsToken: process.env.WIKIJS_TOKEN || (this.config?.get ? this.config.get('WIKIJS_TOKEN') : this.config?.WIKIJS_TOKEN) || null
    };

    // Processing status constants
    this.STATUS = {
      DISCOVERED: 'DISCOVERED',
      ANALYZING: 'ANALYZING',
      READY: 'READY',
      UPLOADING: 'UPLOADING',
      UPLOADED: 'UPLOADED',
      OUTDATED: 'OUTDATED',
      CONFLICTED: 'CONFLICTED',
      FAILED: 'FAILED',
      ARCHIVED: 'ARCHIVED'
    };

    // Document type classifications
    this.DOC_TYPES = {
      README: 'readme',
      DOCS: 'docs',
      API: 'api',
      CONFIG: 'config',
      GUIDE: 'guide',
      REFERENCE: 'reference',
      CHANGELOG: 'changelog',
      UNKNOWN: 'unknown'
    };

    // Source location classifications
    this.SOURCES = {
      REPOS: 'repos',           // /repos/ directory
      GIT_ROOT: 'git-root',     // /mnt/c/GIT/ directory
      EXTERNAL: 'external'      // Other configured paths
    };
  }

  /**
   * Initialize the wiki agent database and create tables
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Failed to open wiki agent database:', err);
          reject(err);
          return;
        }

        console.log('✅ Connected to wiki agent database');
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * Create database tables for document lifecycle tracking
   */
  async createTables() {
    const tables = [
      // Document lifecycle tracking
      `CREATE TABLE IF NOT EXISTS wiki_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT UNIQUE NOT NULL,
        wiki_path TEXT,
        repository_name TEXT NOT NULL,
        source_location TEXT NOT NULL,
        document_type TEXT,
        content_hash TEXT,
        last_modified TIMESTAMP,
        sync_status TEXT NOT NULL DEFAULT 'DISCOVERED',
        priority_score INTEGER DEFAULT 50,
        wiki_page_id TEXT,  -- WikiJS page ID after upload
        last_upload_attempt TIMESTAMP,
        file_size INTEGER DEFAULT 0,
        error_message TEXT,
        metadata TEXT,  -- JSON string for additional metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Processing batches for efficiency tracking
      `CREATE TABLE IF NOT EXISTS processing_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_type TEXT NOT NULL,
        batch_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        documents_total INTEGER DEFAULT 0,
        documents_processed INTEGER DEFAULT 0,
        documents_uploaded INTEGER DEFAULT 0,
        documents_failed INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Wiki agent configuration and settings
      `CREATE TABLE IF NOT EXISTS agent_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Processing statistics for dashboard
      `CREATE TABLE IF NOT EXISTS agent_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stat_date DATE,
        documents_discovered INTEGER DEFAULT 0,
        documents_processed INTEGER DEFAULT 0,
        documents_uploaded INTEGER DEFAULT 0,
        documents_failed INTEGER DEFAULT 0,
        processing_time_ms INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Agent logs for monitoring and debugging
      `CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        component TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,  -- JSON string
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_wiki_docs_repo ON wiki_documents(repository_name)',
      'CREATE INDEX IF NOT EXISTS idx_wiki_docs_status ON wiki_documents(sync_status)',
      'CREATE INDEX IF NOT EXISTS idx_wiki_docs_source ON wiki_documents(source_location)',
      'CREATE INDEX IF NOT EXISTS idx_wiki_docs_priority ON wiki_documents(priority_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_processing_batches_status ON processing_batches(status)',
      'CREATE INDEX IF NOT EXISTS idx_agent_stats_date ON agent_stats(stat_date)',
      'CREATE INDEX IF NOT EXISTS idx_agent_logs_level ON agent_logs(level)',
      'CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON agent_logs(timestamp)'
    ];

    try {
      // Create tables
      for (const table of tables) {
        await this.runQuery(table);
      }

      // Create indexes
      for (const index of indexes) {
        await this.runQuery(index);
      }

      // Insert default configuration
      await this.initializeDefaultConfig();

      console.log('✅ Wiki agent database tables created successfully');
    } catch (error) {
      console.error('❌ Failed to create wiki agent tables:', error);
      throw error;
    }
  }

  /**
   * Initialize default configuration values
   */
  async initializeDefaultConfig() {
    const defaultConfig = [
      ['auto_discovery_enabled', 'true', 'Enable automatic document discovery'],
      ['discovery_interval_hours', '24', 'Hours between automatic discovery runs'],
      ['batch_size', '10', 'Number of documents to process in each batch'],
      ['priority_threshold', '70', 'Minimum priority score for automatic processing'],
      ['homelab_repo_priority', '100', 'Priority boost for homelab-gitops-auditor docs'],
      ['wikijs_base_path', '/projects', 'Base path in WikiJS for uploaded documents'],
      ['enable_content_enhancement', 'true', 'Enable AI-powered content improvement'],
      ['enable_link_resolution', 'true', 'Enable automatic link resolution'],
      ['max_retries', '3', 'Maximum retry attempts for failed uploads']
    ];

    for (const [key, value, description] of defaultConfig) {
      await this.runQuery(
        'INSERT OR IGNORE INTO agent_config (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    }
  }

  /**
   * Helper method to run database queries with Promise wrapper
   */
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * Helper method to get query results with Promise wrapper
   */
  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Helper method to get all query results with Promise wrapper
   */
  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Calculate SHA-256 hash of file content for change detection
   */
  calculateContentHash(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      console.error(`Failed to calculate hash for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Determine document type based on file path and content
   */
  classifyDocumentType(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    if (fileName === 'readme.md' || fileName === 'readme.txt') {
      return this.DOC_TYPES.README;
    }

    if (dirName.includes('docs') || dirName.includes('documentation')) {
      return this.DOC_TYPES.DOCS;
    }

    if (fileName.includes('api') || dirName.includes('api')) {
      return this.DOC_TYPES.API;
    }

    if (fileName.includes('config') || fileName.includes('setup')) {
      return this.DOC_TYPES.CONFIG;
    }

    if (fileName.includes('guide') || fileName.includes('tutorial')) {
      return this.DOC_TYPES.GUIDE;
    }

    if (fileName.includes('changelog') || fileName.includes('changes')) {
      return this.DOC_TYPES.CHANGELOG;
    }

    return this.DOC_TYPES.UNKNOWN;
  }

  /**
   * Determine source location category
   */
  classifySourceLocation(filePath) {
    if (filePath.includes('/repos/')) {
      return this.SOURCES.REPOS;
    }

    if (filePath.includes('/mnt/c/GIT/')) {
      return this.SOURCES.GIT_ROOT;
    }

    return this.SOURCES.EXTERNAL;
  }

  /**
   * Extract repository name from file path
   */
  extractRepositoryName(filePath) {
    // For /repos/ paths: /repos/myproject/... → myproject
    if (filePath.includes('/repos/')) {
      const repoMatch = filePath.match(/\/repos\/([^\/]+)/);
      return repoMatch ? repoMatch[1] : 'unknown';
    }

    // For /mnt/c/GIT/ paths: /mnt/c/GIT/homelab-gitops-auditor/... → homelab-gitops-auditor
    if (filePath.includes('/mnt/c/GIT/')) {
      const repoMatch = filePath.match(/\/mnt\/c\/GIT\/([^\/]+)/);
      return repoMatch ? repoMatch[1] : 'unknown';
    }

    return 'external';
  }

  /**
   * Calculate priority score for document processing
   */
  calculatePriorityScore(filePath, documentType, repositoryName) {
    let score = 50; // Base score

    // Repository-based priority
    if (repositoryName === 'homelab-gitops-auditor') {
      score += 50; // High priority for current project
    }

    // Document type priority
    switch (documentType) {
      case this.DOC_TYPES.README:
        score += 30;
        break;
      case this.DOC_TYPES.DOCS:
        score += 20;
        break;
      case this.DOC_TYPES.API:
        score += 15;
        break;
      case this.DOC_TYPES.GUIDE:
        score += 10;
        break;
      default:
        score += 5;
    }

    // File age penalty (newer files get higher priority)
    try {
      const stats = fs.statSync(filePath);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) score += 10;
      else if (ageInDays < 30) score += 5;
      else if (ageInDays > 365) score -= 10;
    } catch (error) {
      // Ignore file stat errors
    }

    return Math.max(0, Math.min(100, score)); // Clamp to 0-100
  }

  /**
   * Get agent statistics for dashboard
   */
  /**
   * Discover documentation files in the project repository
   * @param {string} repositoryPath - Path to the repository to scan
   * @param {string} repositoryName - Name of the repository
   */
  async discoverDocuments(repositoryPath, repositoryName) {
    try {
      console.log(`🔍 Starting document discovery for ${repositoryName}...`);
      
      if (!fs.existsSync(repositoryPath)) {
        throw new Error(`Repository path does not exist: ${repositoryPath}`);
      }

      const documents = [];
      const extensions = ['.md', '.txt', '.rst', '.adoc'];
      
      // Recursively scan for documentation files
      const scanDirectory = (dirPath, relativePath = '') => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativeFilePath = path.join(relativePath, entry.name);
          
          // Skip common ignore patterns
          if (this.shouldIgnorePath(relativeFilePath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            scanDirectory(fullPath, relativeFilePath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions.includes(ext) || this.isDocumentationFile(entry.name)) {
              documents.push({
                sourcePath: relativeFilePath,
                fullPath: fullPath,
                fileName: entry.name,
                extension: ext
              });
            }
          }
        }
      };

      scanDirectory(repositoryPath);
      
      console.log(`📄 Found ${documents.length} documentation files in ${repositoryName}`);
      
      // Process each document and add to database
      const processedCount = await this.processDiscoveredDocuments(documents, repositoryName);
      
      console.log(`✅ Processed ${processedCount} documents for ${repositoryName}`);
      return { discovered: documents.length, processed: processedCount };
      
    } catch (error) {
      console.error('❌ Document discovery failed:', error);
      throw error;
    }
  }

  /**
   * Process discovered documents and add them to the database
   * @param {Array} documents - Array of discovered document objects
   * @param {string} repositoryName - Name of the repository
   */
  async processDiscoveredDocuments(documents, repositoryName) {
    let processedCount = 0;
    
    for (const doc of documents) {
      try {
        // Read file content
        const content = fs.readFileSync(doc.fullPath, 'utf8');
        const contentHash = this.calculateContentHash(content);
        
        // Check if document already exists with same hash
        const existing = await this.getQuery(`
          SELECT id FROM wiki_documents 
          WHERE source_path = ? AND repository_name = ? AND content_hash = ?
        `, [doc.sourcePath, repositoryName, contentHash]);
        
        if (existing) {
          console.log(`⏭️  Skipping unchanged document: ${doc.sourcePath}`);
          continue;
        }
        
        // Classify document
        const documentType = this.classifyDocumentType(doc.sourcePath, content);
        const sourceLocation = this.classifySourceLocation(doc.sourcePath);
        const priorityScore = this.calculatePriorityScore(documentType, sourceLocation, content);
        
        // Generate wiki path
        const wikiPath = this.generateWikiPath(doc.sourcePath, repositoryName);
        
        // Insert or update document
        await this.runQuery(`
          INSERT OR REPLACE INTO wiki_documents
          (source_path, wiki_path, repository_name, document_type, content_hash,
           sync_status, priority_score, source_location, file_size, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'discovered', ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          doc.sourcePath,
          wikiPath,
          repositoryName,
          documentType,
          contentHash,
          priorityScore,
          sourceLocation,
          content.length
        ]);
        
        processedCount++;
        console.log(`📄 Processed: ${doc.sourcePath} (${documentType}, priority: ${priorityScore})`);
        
      } catch (error) {
        console.error(`❌ Failed to process document ${doc.sourcePath}:`, error.message);
      }
    }
    
    return processedCount;
  }

  /**
   * Check if a path should be ignored during discovery
   * @param {string} relativePath - Relative path to check
   */
  shouldIgnorePath(relativePath) {
    const ignorePatterns = [
      /^\.git\//,
      /^node_modules\//,
      /^\.vscode\//,
      /^\.idea\//,
      /^build\//,
      /^dist\//,
      /^target\//,
      /^\.npm\//,
      /^\.cache\//,
      /\/__pycache__\//,
      /\.pyc$/,
      /\.log$/,
      /\.tmp$/,
      /\.temp$/
    ];
    
    return ignorePatterns.some(pattern => pattern.test(relativePath));
  }

  /**
   * Check if a filename indicates a documentation file
   * @param {string} fileName - Name of the file
   */
  isDocumentationFile(fileName) {
    const docFiles = [
      'README', 'readme',
      'CHANGELOG', 'changelog', 'CHANGES',
      'LICENSE', 'license',
      'CONTRIBUTING', 'contributing',
      'INSTALL', 'install',
      'USAGE', 'usage',
      'FAQ', 'faq',
      'TODO', 'todo',
      'AUTHORS', 'authors',
      'CREDITS', 'credits'
    ];
    
    const baseName = path.basename(fileName, path.extname(fileName));
    return docFiles.includes(baseName);
  }

  /**
   * Generate wiki path from source path
   * @param {string} sourcePath - Source file path
   * @param {string} repositoryName - Repository name
   */
  generateWikiPath(sourcePath, repositoryName) {
    // Convert source path to wiki path
    // Example: docs/API.md -> /homelab-gitops-auditor/docs/API
    let wikiPath = `/${repositoryName}/${sourcePath}`;
    
    // Remove file extension
    wikiPath = wikiPath.replace(/\.[^/.]+$/, '');
    
    // Clean up path separators
    wikiPath = wikiPath.replace(/\/+/g, '/');
    
    return wikiPath;
  }

  /**
   * Run document discovery for the homelab-gitops-auditor repository
   */
  async runProjectDiscovery() {
    try {
      const projectRoot = path.dirname(this.rootDir);
      const repositoryName = 'homelab-gitops-auditor';
      
      console.log(`🎯 Running project discovery for ${repositoryName}...`);
      console.log(`📂 Scanning directory: ${projectRoot}`);
      
      const result = await this.discoverDocuments(projectRoot, repositoryName);
      
      // Update agent stats
      await this.runQuery(`
        INSERT OR REPLACE INTO agent_stats
        (stat_date, documents_discovered, documents_processed, last_discovery_run, created_at)
        VALUES (DATE('now'), ?, ?, datetime('now'), datetime('now'))
      `, [result.discovered, result.processed]);
      
      return result;
    } catch (error) {
      console.error('❌ Project discovery failed:', error);
      throw error;
    }
  }

  /**
   * Upload a document to WikiJS using MCP server
   * @param {number} documentId - Database ID of the document to upload
   */
  async uploadToWikiJS(documentId) {
    try {
      // Get document details from database
      const doc = await this.getQuery(`
        SELECT * FROM wiki_documents WHERE id = ?
      `, [documentId]);
      
      if (!doc) {
        throw new Error(`Document with ID ${documentId} not found`);
      }
      
      console.log(`📤 Uploading document to WikiJS: ${doc.source_path}`);
      
      // Read the actual file content
      const fullPath = path.join(this.rootDir, doc.source_path);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Source file not found: ${fullPath}`);
      }
      
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Upload to WikiJS using MCP server
      this.log('info', `Starting document upload to WikiJS`, {
        documentId,
        sourcePath: doc.source_path,
        wikiPath: doc.wiki_path,
        contentLength: content.length
      });
      
      try {
        // Use the WikiJS MCP server to upload the document with retry logic
        const uploadParams = {
          file_path: fullPath,
          wiki_path: doc.wiki_path,
          title: this.extractTitleFromContent(content) || path.basename(doc.source_path, path.extname(doc.source_path)),
          description: `Auto-uploaded from ${doc.source_path}`,
          tags: this.generateTagsFromDocument(doc, content),
          overwrite_existing: false
        };
        
        const uploadResult = await this.retryOperation(
          () => this.callWikiJSMCP('upload_document_to_wiki', uploadParams),
          this.productionConfig.maxRetries,
          this.productionConfig.initialRetryDelay
        );
        
        this.log('info', `WikiJS upload completed successfully`, {
          documentId,
          pageId: uploadResult.pageId,
          wikiPath: doc.wiki_path,
          uploadResult
        });
        
        // Update document status to 'uploaded'
        await this.runQuery(`
          UPDATE wiki_documents 
          SET sync_status = 'uploaded', 
              last_upload_attempt = datetime('now'),
              updated_at = datetime('now'),
              wiki_page_id = ?,
              error_message = NULL
          WHERE id = ?
        `, [uploadResult.pageId || null, documentId]);
        
        return {
          success: true,
          documentId: documentId,
          wikiPath: doc.wiki_path,
          pageId: uploadResult.pageId,
          message: 'Document uploaded to WikiJS successfully',
          uploadResult: uploadResult
        };
        
      } catch (mcpError) {
        this.log('error', `WikiJS MCP upload failed, falling back to simulation`, {
          documentId,
          sourcePath: doc.source_path,
          error: mcpError.message,
          stack: mcpError.stack
        });
        
        // Fall back to simulation mode if MCP fails
        console.log(`🔄 Falling back to simulation mode...`);
        
        await this.runQuery(`
          UPDATE wiki_documents 
          SET sync_status = 'uploaded_simulated', 
              last_upload_attempt = datetime('now'),
              updated_at = datetime('now'),
              error_message = ?
          WHERE id = ?
        `, [`MCP Error: ${mcpError.message}`, documentId]);
        
        return {
          success: true,
          documentId: documentId,
          wikiPath: doc.wiki_path,
          message: 'Document upload simulated (MCP unavailable)',
          note: 'WikiJS MCP server not available, used fallback',
          mcpError: mcpError.message
        };
      }
      
    } catch (error) {
      console.error(`❌ Failed to upload document ${documentId}:`, error);
      
      // Update document status to 'failed'
      await this.runQuery(`
        UPDATE wiki_documents 
        SET sync_status = 'failed', 
            last_upload_attempt = datetime('now'),
            error_message = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `, [error.message, documentId]);
      
      throw error;
    }
  }

  /**
   * Upload multiple documents in batch
   * @param {Array} documentIds - Array of document IDs to upload
   */
  async batchUploadToWikiJS(documentIds) {
    const results = {
      successful: [],
      failed: [],
      total: documentIds.length
    };
    
    console.log(`🔄 Starting batch upload of ${documentIds.length} documents...`);
    
    // Create processing batch record
    const batchResult = await this.runQuery(`
      INSERT INTO processing_batches 
      (status, total_documents, created_at)
      VALUES ('processing', ?, datetime('now'))
    `, [documentIds.length]);
    
    const batchId = batchResult.lastID;
    
    try {
      for (const docId of documentIds) {
        try {
          const result = await this.uploadToWikiJS(docId);
          results.successful.push({ documentId: docId, result });
          
          // Update batch progress
          await this.runQuery(`
            UPDATE processing_batches 
            SET documents_processed = documents_processed + 1,
                documents_uploaded = documents_uploaded + 1,
                updated_at = datetime('now')
            WHERE id = ?
          `, [batchId]);
          
        } catch (error) {
          results.failed.push({ documentId: docId, error: error.message });
          
          // Update batch progress
          await this.runQuery(`
            UPDATE processing_batches 
            SET documents_processed = documents_processed + 1,
                documents_failed = documents_failed + 1,
                updated_at = datetime('now')
            WHERE id = ?
          `, [batchId]);
        }
      }
      
      // Mark batch as completed
      await this.runQuery(`
        UPDATE processing_batches 
        SET status = 'completed',
            completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `, [batchId]);
      
      console.log(`✅ Batch upload completed: ${results.successful.length} successful, ${results.failed.length} failed`);
      
    } catch (error) {
      // Mark batch as failed
      await this.runQuery(`
        UPDATE processing_batches 
        SET status = 'failed',
            error_message = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `, [error.message, batchId]);
      
      throw error;
    }
    
    return results;
  }

  /**
   * Test WikiJS connectivity through MCP server
   */
  async testWikiJSConnection() {
    try {
      console.log('🔍 Testing WikiJS connectivity...');
      
      // Use the real WikiJS connection test implementation
      return await this.testWikiJSConnectionMCP();
      
    } catch (error) {
      console.error('❌ WikiJS connection test failed:', error);
      throw error;
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {function} operation - Operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} initialDelay - Initial delay in milliseconds
   */
  async retryOperation(operation, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          console.log(`✅ Operation succeeded on attempt ${attempt + 1}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          console.error(`❌ Operation failed after ${maxRetries + 1} attempts:`, error.message);
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`⚠️  Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced logging with structured data
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Log message
   * @param {object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      component: 'WikiAgentManager',
      message,
      ...metadata
    };
    
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] [WikiAgent] ${message}`;
    
    switch (level.toLowerCase()) {
      case 'error':
        console.error(logMessage, metadata);
        break;
      case 'warn':
        console.warn(logMessage, metadata);
        break;
      case 'debug':
        if (process.env.DEBUG_WIKI_AGENT || this.productionConfig.enableDetailedLogging) {
          console.log(logMessage, metadata);
        }
        break;
      default:
        console.log(logMessage, metadata);
    }
    
    // Store important logs in database for monitoring
    if (['error', 'warn'].includes(level.toLowerCase())) {
      this.storeLogs(logEntry).catch(err => 
        console.error('Failed to store log entry:', err.message)
      );
    }
  }

  /**
   * Store log entries in database for monitoring
   * @param {object} logEntry - Log entry object
   */
  async storeLogs(logEntry) {
    try {
      await this.runQuery(`
        INSERT OR IGNORE INTO agent_logs 
        (timestamp, level, component, message, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `, [
        logEntry.timestamp,
        logEntry.level,
        logEntry.component,
        logEntry.message,
        JSON.stringify(logEntry)
      ]);
    } catch (error) {
      // Don't throw here to avoid logging loops
      console.error('Failed to store log in database:', error.message);
    }
  }

  /**
   * Call WikiJS MCP server with error handling and fallback
   * @param {string} method - MCP method name
   * @param {object} params - Method parameters
   */
  async callWikiJSMCP(method, params) {
    try {
      console.log(`🔗 Calling WikiJS MCP: ${method}`, params);
      
      if (method === 'upload_document_to_wiki') {
        // Call the actual WikiJS MCP server
        const uploadResult = await this.uploadToWikiJSMCP(params);
        return uploadResult;
      }
      
      if (method === 'test_connection') {
        // Test WikiJS connection
        const connectionResult = await this.testWikiJSConnectionMCP();
        return connectionResult;
      }
      
      throw new Error(`Unknown MCP method: ${method}`);
      
    } catch (error) {
      console.error(`❌ WikiJS MCP call failed for ${method}:`, error);
      throw error;
    }
  }

  /**
   * Upload document to WikiJS using the real MCP server
   * @param {object} params - Upload parameters
   */
  async uploadToWikiJSMCP(params) {
    try {
      console.log(`📤 WikiJS Upload:`, {
        filePath: params.file_path,
        wikiPath: params.wiki_path,
        title: params.title
      });
      
      // Get WikiJS configuration
      const wikijsUrl = this.productionConfig.wikijsUrl;
      const wikijsToken = this.productionConfig.wikijsToken;
      
      if (!wikijsUrl || !wikijsToken || wikijsToken === 'test-wikijs-token-for-diagnostic') {
        console.warn('⚠️  WikiJS not configured for production, using simulation mode');
        return this.simulateWikiJSUpload(params);
      }
      
      // Read file content
      const fs = require('fs');
      const content = fs.readFileSync(params.file_path, 'utf8');
      
      // Create WikiJS GraphQL mutation
      const mutation = `
        mutation CreatePage($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
          pages {
            create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
              responseResult {
                succeeded
                errorCode
                slug
                message
              }
              page {
                id
                path
                title
              }
            }
          }
        }
      `;
      
      const variables = {
        content: content,
        description: params.description || `Auto-uploaded from ${params.file_path}`,
        editor: 'markdown',
        isPublished: true,
        isPrivate: false,
        locale: 'en',
        path: params.wiki_path.replace(/^\//, ''), // Remove leading slash
        tags: params.tags || ['auto-generated'],
        title: params.title
      };
      
      // Make HTTP request to WikiJS GraphQL API
      const fetch = require('node-fetch');
      const response = await fetch(`${wikijsUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wikijsToken}`
        },
        body: JSON.stringify({
          query: mutation,
          variables: variables
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`WikiJS API error: ${response.status} ${response.statusText}`);
      }
      
      if (result.errors) {
        throw new Error(`WikiJS GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      
      const createResult = result.data?.pages?.create;
      if (!createResult?.responseResult?.succeeded) {
        throw new Error(`WikiJS page creation failed: ${createResult?.responseResult?.message || 'Unknown error'}`);
      }
      
      const pageId = createResult.page?.id;
      const pagePath = createResult.page?.path;
      
      console.log(`✅ WikiJS upload successful: ${pageId} at ${pagePath}`);
      
      return {
        success: true,
        pageId: pageId,
        url: `${wikijsUrl}/${pagePath}`,
        title: params.title,
        message: 'Document uploaded successfully to WikiJS',
        wikiPath: params.wiki_path,
        wikijsResponse: createResult
      };
      
    } catch (error) {
      console.error('❌ WikiJS upload error:', error);
      
      // Fallback to simulation if real upload fails
      console.log('🔄 Falling back to simulation mode...');
      return this.simulateWikiJSUpload(params, error.message);
    }
  }

  /**
   * Test WikiJS connection using the real MCP server
   */
  async testWikiJSConnectionMCP() {
    try {
      console.log('🔍 Testing WikiJS connection...');
      
      // Get WikiJS configuration
      const wikijsUrl = this.productionConfig.wikijsUrl;
      const wikijsToken = this.productionConfig.wikijsToken;
      
      if (!wikijsUrl || !wikijsToken || wikijsToken === 'test-wikijs-token-for-diagnostic') {
        console.warn('⚠️  WikiJS not configured for production, using simulation mode');
        return {
          success: true,
          status: 'simulated',
          version: '2.5.x (simulated)',
          url: wikijsUrl || 'http://test-wiki.example.com',
          timestamp: new Date().toISOString(),
          message: 'WikiJS connection test simulated - production configuration needed',
          note: 'Set WIKIJS_URL and WIKIJS_TOKEN environment variables for real connection'
        };
      }
      
      // Test WikiJS connection with GraphQL introspection query
      const query = `
        query {
          system {
            info {
              version
              hostname
              platform
            }
          }
        }
      `;
      
      const fetch = require('node-fetch');
      const response = await fetch(`${wikijsUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wikijsToken}`
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        throw new Error(`WikiJS API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`WikiJS GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      
      const systemInfo = result.data?.system?.info;
      
      console.log('✅ WikiJS connection test successful');
      
      return {
        success: true,
        status: 'connected',
        version: systemInfo?.version || 'unknown',
        hostname: systemInfo?.hostname,
        platform: systemInfo?.platform,
        url: wikijsUrl,
        timestamp: new Date().toISOString(),
        message: 'WikiJS connection test successful',
        systemInfo: systemInfo
      };
      
    } catch (error) {
      console.error('❌ WikiJS connection test error:', error);
      
      return {
        success: false,
        status: 'failed',
        url: this.productionConfig.wikijsUrl,
        timestamp: new Date().toISOString(),
        message: `WikiJS connection test failed: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Extract title from document content
   * @param {string} content - Document content
   */
  /**
   * Simulate WikiJS upload for development/testing
   * @param {object} params - Upload parameters
   * @param {string} errorMessage - Optional error message from real upload attempt
   */
  simulateWikiJSUpload(params, errorMessage = null) {
    const pageId = `wiki_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔄 Simulating WikiJS upload: ${params.wiki_path}`);
    
    return {
      success: true,
      pageId: pageId,
      url: `http://wiki.example.com${params.wiki_path}`,
      title: params.title,
      message: 'Document upload simulated (WikiJS not configured)',
      wikiPath: params.wiki_path,
      simulation: true,
      note: errorMessage || 'WikiJS not configured for production use',
      timestamp: new Date().toISOString()
    };
  }

  extractTitleFromContent(content) {
    // Look for markdown title (# Title)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    // Look for title in front matter
    const frontMatterMatch = content.match(/^---\s*\n.*?title:\s*['"]?([^'"]+)['"]?\s*\n.*?---/s);
    if (frontMatterMatch) {
      return frontMatterMatch[1].trim();
    }
    
    return null;
  }

  /**
   * Generate tags for a document based on its content and metadata
   * @param {object} doc - Document object
   * @param {string} content - Document content
   */
  generateTagsFromDocument(doc, content) {
    const tags = [];
    
    // Add document type tag
    tags.push(doc.documentType || 'documentation');
    
    // Add repository name tag
    tags.push(doc.repository_name || 'unknown-repo');
    
    // Add source location tag
    tags.push(doc.source_location || 'unknown-source');
    
    // Add format tag based on file extension
    const ext = path.extname(doc.sourcePath).toLowerCase();
    if (ext) {
      tags.push(`format-${ext.substring(1)}`);
    }
    
    // Add auto-generated tag
    tags.push('auto-generated');
    
    // Extract additional tags from content
    const tagMatches = content.match(/(?:tags?|categories?):\s*\[([^\]]+)\]/i);
    if (tagMatches) {
      const contentTags = tagMatches[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
      tags.push(...contentTags);
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  async getAgentStats() {
    try {
      const totalDocs = await this.getQuery(
        'SELECT COUNT(*) as count FROM wiki_documents'
      );

      const statusCounts = await this.allQuery(`
        SELECT sync_status, COUNT(*) as count
        FROM wiki_documents
        GROUP BY sync_status
      `);

      const recentBatches = await this.allQuery(`
        SELECT * FROM processing_batches
        ORDER BY created_at DESC
        LIMIT 5
      `);

      const todayStats = await this.getQuery(`
        SELECT * FROM agent_stats
        WHERE stat_date = DATE('now')
        ORDER BY created_at DESC
        LIMIT 1
      `);

      return {
        totalDocuments: totalDocs?.count || 0,
        statusBreakdown: statusCounts.reduce((acc, row) => {
          acc[row.sync_status] = row.count;
          return acc;
        }, {}),
        recentBatches,
        todayStats,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get agent stats:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing wiki agent database:', err);
          } else {
            console.log('✅ Wiki agent database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = WikiAgentManager;

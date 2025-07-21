/**
 * WikiJS Agent API Routes
 *
 * RESTful API endpoints for WikiJS agent operations including:
 * - Document discovery and management
 * - Upload operations (single and batch)
 * - Status monitoring and statistics
 * - Connection testing
 *
 * @file /home/dev/workspace/homelab-gitops-auditor/api/routes/wiki.js
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateJWT } = require('../middleware/auth');
const { AuditLogger } = require('../utils/audit-logger');
const router = express.Router();

// Rate limiting configuration
const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later' }
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit uploads to 10 per 5 minutes
  message: { error: 'Upload rate limit exceeded, please try again later' }
});

const discoveryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // limit discovery to 5 per 10 minutes
  message: { error: 'Discovery rate limit exceeded, please try again later' }
});

// Middleware to check if WikiAgentManager is available
const requireWikiAgent = (req, res, next) => {
  if (!req.wikiAgentManager) {
    return res.status(503).json({ 
      error: 'WikiJS Agent not available',
      details: 'The WikiJS Agent Manager is not initialized or has failed to start'
    });
  }
  next();
};

// Error handling middleware for validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/wiki/status
 * Get agent status and health information
 */
router.get('/status', defaultLimiter, requireWikiAgent, asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  
  try {
    // Get basic status information
    const status = {
      agent: {
        initialized: !!manager.db,
        environment: manager.environment,
        isProduction: manager.isProduction,
        version: '1.0.0'
      },
      database: {
        connected: !!manager.db,
        path: manager.dbPath
      },
      config: {
        wikijsUrl: manager.productionConfig.wikijsUrl,
        hasToken: !!manager.productionConfig.wikijsToken,
        batchSize: manager.productionConfig.batchSize,
        maxRetries: manager.productionConfig.maxRetries
      },
      processing: {
        lastDiscovery: null, // Will be populated from database if available
        totalDocuments: 0,
        readyForUpload: 0,
        uploaded: 0,
        failed: 0
      }
    };

    // Get processing statistics from database
    if (manager.db) {
      const stats = await new Promise((resolve, reject) => {
        manager.db.all(`
          SELECT 
            status,
            COUNT(*) as count
          FROM documents 
          GROUP BY status
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const statusCounts = {};
      stats.forEach(row => {
        statusCounts[row.status] = row.count;
      });

      status.processing = {
        ...status.processing,
        totalDocuments: stats.reduce((sum, row) => sum + row.count, 0),
        readyForUpload: statusCounts[manager.STATUS.READY] || 0,
        uploaded: statusCounts[manager.STATUS.UPLOADED] || 0,
        failed: statusCounts[manager.STATUS.FAILED] || 0,
        discovered: statusCounts[manager.STATUS.DISCOVERED] || 0,
        outdated: statusCounts[manager.STATUS.OUTDATED] || 0
      };

      // Get last discovery timestamp
      const lastDiscovery = await new Promise((resolve, reject) => {
        manager.db.get(`
          SELECT MAX(discovered_at) as last_discovery
          FROM documents
        `, [], (err, row) => {
          if (err) reject(err);
          else resolve(row?.last_discovery);
        });
      });

      status.processing.lastDiscovery = lastDiscovery;
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting wiki agent status:', error);
    res.status(500).json({
      error: 'Failed to get status',
      details: error.message
    });
  }
}));

/**
 * GET /api/wiki/documents
 * List discovered documents with filtering and pagination
 */
router.get('/documents', [
  defaultLimiter,
  requireWikiAgent,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn([
    'DISCOVERED', 'ANALYZING', 'READY', 'UPLOADING', 'UPLOADED', 'OUTDATED', 'CONFLICTED', 'FAILED', 'ARCHIVED'
  ]).withMessage('Invalid status filter'),
  query('source').optional().isIn(['repos', 'git-root', 'external']).withMessage('Invalid source filter'),
  query('type').optional().isIn([
    'readme', 'docs', 'api', 'config', 'guide', 'reference', 'changelog', 'unknown'
  ]).withMessage('Invalid document type filter'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    // Build dynamic WHERE clause based on filters
    if (req.query.status) {
      whereClause += ' AND status = ?';
      params.push(req.query.status);
    }
    
    if (req.query.source) {
      whereClause += ' AND source = ?';
      params.push(req.query.source);
    }
    
    if (req.query.type) {
      whereClause += ' AND doc_type = ?';
      params.push(req.query.type);
    }

    // Get total count for pagination
    const totalCount = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT COUNT(*) as total
        FROM documents
        ${whereClause}
      `, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });

    // Get documents with pagination
    const documents = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT 
          id, file_path, status, doc_type, source, title,
          priority_score, discovered_at, updated_at, uploaded_at,
          error_message, wiki_path, content_hash
        FROM documents
        ${whereClause}
        ORDER BY priority_score DESC, discovered_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      details: error.message
    });
  }
}));

/**
 * POST /api/wiki/discover
 * Trigger document discovery process
 */
router.post('/discover', [
  authenticateJWT,
  discoveryLimiter,
  requireWikiAgent,
  body('paths').optional().isArray().withMessage('Paths must be an array'),
  body('forceRefresh').optional().isBoolean().withMessage('ForceRefresh must be boolean'),
  body('includeExisting').optional().isBoolean().withMessage('IncludeExisting must be boolean'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  const { paths = [], forceRefresh = false, includeExisting = false } = req.body;
  
  try {
    // Check if WikiAgentManager has discovery methods
    if (typeof manager.discoverDocuments !== 'function') {
      return res.status(501).json({
        error: 'Discovery not implemented',
        details: 'Document discovery functionality is not available in current version'
      });
    }

    const discoveryOptions = {
      paths: paths.length > 0 ? paths : undefined,
      forceRefresh,
      includeExisting
    };

    const results = await manager.discoverDocuments(discoveryOptions);
    
    // Log discovery operation
    AuditLogger.logWebhookEvent({
      eventType: 'wiki-discovery',
      delivery: `wiki-${Date.now()}`,
      repository: 'wiki-agent',
      result: 'success',
      processingTime: Date.now() - Date.now(), // Simple placeholder
      trigger: 'manual',
      userAgent: req.get('User-Agent'),
      metadata: {
        user: req.auth?.username || 'unknown',
        discovered: results.discovered || 0,
        updated: results.updated || 0,
        skipped: results.skipped || 0,
        paths: discoveryOptions.paths?.length || 'all'
      }
    });
    
    res.json({
      success: true,
      data: {
        discovered: results.discovered || 0,
        updated: results.updated || 0,
        skipped: results.skipped || 0,
        errors: results.errors || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during document discovery:', error);
    res.status(500).json({
      error: 'Discovery failed',
      details: error.message
    });
  }
}));

/**
 * POST /api/wiki/upload/:id
 * Upload specific document to WikiJS
 */
router.post('/upload/:id', [
  authenticateJWT,
  uploadLimiter,
  requireWikiAgent,
  param('id').isInt({ min: 1 }).withMessage('Document ID must be a positive integer'),
  body('overwrite').optional().isBoolean().withMessage('Overwrite must be boolean'),
  body('wikiPath').optional().isString().isLength({ min: 1, max: 500 })
    .withMessage('Wiki path must be 1-500 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  const documentId = parseInt(req.params.id);
  const { overwrite = false, wikiPath, tags = [] } = req.body;
  
  try {
    // Get document details
    const document = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT * FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        details: `Document with ID ${documentId} does not exist`
      });
    }

    // Check if document is in uploadable state
    const uploadableStates = [manager.STATUS.READY, manager.STATUS.FAILED];
    if (!overwrite && !uploadableStates.includes(document.status)) {
      return res.status(400).json({
        error: 'Document not ready for upload',
        details: `Document status is ${document.status}. Expected: ${uploadableStates.join(' or ')}`
      });
    }

    // Check if upload method exists
    if (typeof manager.uploadDocument !== 'function') {
      return res.status(501).json({
        error: 'Upload not implemented',
        details: 'Document upload functionality is not available in current version'
      });
    }

    // Perform upload
    const uploadOptions = {
      overwrite,
      wikiPath: wikiPath || document.wiki_path,
      tags
    };

    const result = await manager.uploadDocument(documentId, uploadOptions);
    
    // Log upload operation
    AuditLogger.logWebhookEvent({
      eventType: 'wiki-upload',
      delivery: `wiki-upload-${documentId}-${Date.now()}`,
      repository: 'wiki-agent',
      result: 'success',
      processingTime: Date.now() - Date.now(),
      trigger: 'manual',
      userAgent: req.get('User-Agent'),
      metadata: {
        user: req.auth?.username || 'unknown',
        documentId,
        documentPath: document.file_path,
        wikiPath: uploadOptions.wikiPath,
        overwrite: uploadOptions.overwrite,
        tags: uploadOptions.tags?.length || 0
      }
    });
    
    res.json({
      success: true,
      data: {
        documentId,
        status: result.status,
        wikiUrl: result.wikiUrl || null,
        message: result.message || 'Upload completed successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error uploading document ${documentId}:`, error);
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
}));

/**
 * POST /api/wiki/batch-upload
 * Batch upload multiple documents
 */
router.post('/batch-upload', [
  authenticateJWT,
  uploadLimiter,
  requireWikiAgent,
  body('documentIds').isArray({ min: 1, max: 20 })
    .withMessage('DocumentIds must be an array of 1-20 items'),
  body('documentIds.*').isInt({ min: 1 })
    .withMessage('Each document ID must be a positive integer'),
  body('overwrite').optional().isBoolean().withMessage('Overwrite must be boolean'),
  body('concurrency').optional().isInt({ min: 1, max: 5 })
    .withMessage('Concurrency must be between 1 and 5'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  const { documentIds, overwrite = false, concurrency = 3 } = req.body;
  
  try {
    // Check if batch upload method exists
    if (typeof manager.batchUploadDocuments !== 'function') {
      return res.status(501).json({
        error: 'Batch upload not implemented',
        details: 'Batch upload functionality is not available in current version'
      });
    }

    const results = await manager.batchUploadDocuments(documentIds, {
      overwrite,
      concurrency
    });
    
    res.json({
      success: true,
      data: {
        processed: results.processed || 0,
        successful: results.successful || 0,
        failed: results.failed || 0,
        results: results.results || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during batch upload:', error);
    res.status(500).json({
      error: 'Batch upload failed',
      details: error.message
    });
  }
}));

/**
 * GET /api/wiki/stats
 * Get processing statistics and performance metrics
 */
router.get('/stats', defaultLimiter, requireWikiAgent, asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  
  try {
    // Get comprehensive statistics from database
    const stats = {
      documents: {
        total: 0,
        byStatus: {},
        byType: {},
        bySource: {}
      },
      processing: {
        averageProcessingTime: 0,
        successRate: 0,
        recentActivity: []
      },
      performance: {
        dbSize: 0,
        lastOptimized: null
      }
    };

    if (!manager.db) {
      return res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    }

    // Get document counts by status
    const statusCounts = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT status, COUNT(*) as count
        FROM documents
        GROUP BY status
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    statusCounts.forEach(row => {
      stats.documents.byStatus[row.status] = row.count;
      stats.documents.total += row.count;
    });

    // Get document counts by type
    const typeCounts = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT doc_type, COUNT(*) as count
        FROM documents
        GROUP BY doc_type
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    typeCounts.forEach(row => {
      stats.documents.byType[row.doc_type] = row.count;
    });

    // Get document counts by source
    const sourceCounts = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT source, COUNT(*) as count
        FROM documents
        GROUP BY source
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    sourceCounts.forEach(row => {
      stats.documents.bySource[row.source] = row.count;
    });

    // Calculate success rate
    const uploaded = stats.documents.byStatus[manager.STATUS.UPLOADED] || 0;
    const failed = stats.documents.byStatus[manager.STATUS.FAILED] || 0;
    const total = uploaded + failed;
    stats.processing.successRate = total > 0 ? (uploaded / total * 100).toFixed(2) : 0;

    // Get recent activity (last 24 hours)
    const recentActivity = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT status, COUNT(*) as count
        FROM documents
        WHERE updated_at > datetime('now', '-24 hours')
        GROUP BY status
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    stats.processing.recentActivity = recentActivity;

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
}));

/**
 * POST /api/wiki/test-connection
 * Test WikiJS connectivity and configuration
 */
router.post('/test-connection', [
  rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 3, // limit connection tests to 3 per 2 minutes
    message: { error: 'Connection test rate limit exceeded' }
  }),
  requireWikiAgent
], asyncHandler(async (req, res) => {
  const manager = req.wikiAgentManager;
  
  try {
    // Check if connection test method exists
    if (typeof manager.testConnection !== 'function') {
      // Basic configuration check
      const config = manager.productionConfig;
      const hasValidConfig = config.wikijsUrl && config.wikijsUrl !== 'http://test-wiki.example.com';
      const hasToken = !!config.wikijsToken;

      return res.json({
        success: true,
        data: {
          connection: {
            status: 'unknown',
            message: 'Connection testing not implemented in current version'
          },
          configuration: {
            url: config.wikijsUrl,
            hasValidUrl: hasValidConfig,
            hasToken,
            environment: manager.environment
          },
          timestamp: new Date().toISOString()
        }
      });
    }

    const connectionTest = await manager.testConnection();
    
    res.json({
      success: true,
      data: connectionTest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({
      error: 'Connection test failed',
      details: error.message
    });
  }
}));

// Global error handler for this router
router.use((error, req, res, next) => {
  console.error('WikiJS API Error:', error);
  
  // Don't log stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    details: isDevelopment ? error.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
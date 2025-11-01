/**
 * Enhanced Multi-Source Document Discovery Manager
 * 
 * Extends WikiAgentManager with advanced document discovery capabilities:
 * - Multi-source discovery (homelab, repos, external Git, workspace)
 * - Intelligent document classification using NLP/ML techniques
 * - Parallel processing and optimization
 * - Content-based analysis and priority scoring
 * - Performance monitoring and health checks
 * 
 * Version: 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const natural = require('natural');
const WikiAgentManager = require('./wiki-agent-manager');

class EnhancedDiscoveryManager extends WikiAgentManager {
  constructor(config, rootDir) {
    super(config, rootDir);
    
    // Load discovery configuration
    this.discoveryConfigPath = path.join(rootDir, 'config', 'discovery-sources.json');
    this.discoveryConfig = null;
    this.discoveryStats = {
      totalSources: 0,
      activeSources: 0,
      documentsDiscovered: 0,
      documentsProcessed: 0,
      lastDiscoveryRun: null,
      averageProcessingTime: 0,
      errorCount: 0
    };

    // NLP and ML components
    this.stemmer = natural.PorterStemmer;
    this.classifier = null;
    this.contentAnalyzer = new ContentAnalyzer();
    
    // Performance tracking
    this.performanceMetrics = {
      sourceProcessingTimes: new Map(),
      fileProcessingTimes: [],
      memoryUsage: [],
      concurrencyStats: {
        maxConcurrent: 0,
        avgConcurrent: 0
      }
    };

    // Cache for processed files (content hashes)
    this.processedFilesCache = new Map();
    
    // Initialize enhanced document types
    this.ENHANCED_DOC_TYPES = {
      ...this.DOC_TYPES,
      TUTORIAL: 'tutorial',
      INSTALL: 'install',
      QUICKSTART: 'quickstart',
      ARCHITECTURE: 'architecture',
      DEPLOYMENT: 'deployment',
      TROUBLESHOOTING: 'troubleshooting',
      SECURITY: 'security',
      MIGRATION: 'migration',
      RELEASE_NOTES: 'release_notes',
      SPECIFICATION: 'specification'
    };
  }

  /**
   * Initialize enhanced discovery manager
   */
  async initialize() {
    await super.initialize();
    await this.loadDiscoveryConfiguration();
    await this.initializeNLPClassifier();
    await this.createEnhancedTables();
    console.log('✅ Enhanced Discovery Manager initialized');
  }

  /**
   * Load discovery configuration from file
   */
  async loadDiscoveryConfiguration() {
    try {
      const configContent = await fs.readFile(this.discoveryConfigPath, 'utf8');
      this.discoveryConfig = JSON.parse(configContent).discoveryConfig;
      
      // Validate configuration
      this.validateDiscoveryConfig();
      
      console.log(`✅ Loaded discovery configuration with ${this.discoveryConfig.sources.length} sources`);
    } catch (error) {
      console.error('❌ Failed to load discovery configuration:', error);
      throw error;
    }
  }

  /**
   * Validate discovery configuration
   */
  validateDiscoveryConfig() {
    if (!this.discoveryConfig || !this.discoveryConfig.sources) {
      throw new Error('Invalid discovery configuration: missing sources');
    }

    for (const source of this.discoveryConfig.sources) {
      if (!source.id || !source.path || !source.type) {
        throw new Error(`Invalid source configuration: ${JSON.stringify(source)}`);
      }
    }

    this.discoveryStats.totalSources = this.discoveryConfig.sources.length;
    this.discoveryStats.activeSources = this.discoveryConfig.sources.filter(s => s.enabled).length;
  }

  /**
   * Initialize NLP classifier for document type classification
   */
  async initializeNLPClassifier() {
    try {
      this.classifier = new natural.LogisticRegressionClassifier();
      
      // Train classifier with document type examples
      const trainingData = [
        // README documents
        ['getting started quick start setup installation', 'readme'],
        ['project overview description introduction', 'readme'],
        ['how to use this repository project', 'readme'],
        
        // API documentation
        ['api endpoint reference method parameter', 'api'],
        ['rest graphql swagger openapi specification', 'api'],
        ['authentication authorization token bearer', 'api'],
        
        // Tutorials and guides
        ['tutorial step by step guide walkthrough', 'tutorial'],
        ['how to configure setup install deploy', 'guide'],
        ['quickstart quick start getting started', 'quickstart'],
        
        // Configuration
        ['configuration config settings environment variables', 'config'],
        ['setup installation deployment environment', 'config'],
        
        // Architecture and design
        ['architecture design system overview', 'architecture'],
        ['components modules structure diagram', 'architecture'],
        
        // Security
        ['security authentication authorization permission', 'security'],
        ['vulnerability threat security policy', 'security'],
        
        // Deployment
        ['deployment deploy production staging', 'deployment'],
        ['docker kubernetes helm terraform', 'deployment'],
        
        // Troubleshooting
        ['troubleshooting debug error problem solution', 'troubleshooting'],
        ['common issues problems faq frequently asked', 'troubleshooting']
      ];

      // Add training data
      for (const [text, label] of trainingData) {
        this.classifier.addDocument(text, label);
      }

      // Train the classifier
      this.classifier.train();
      
      console.log('✅ NLP classifier initialized and trained');
    } catch (error) {
      console.warn('⚠️ Failed to initialize NLP classifier:', error);
      this.classifier = null;
    }
  }

  /**
   * Create enhanced database tables for discovery tracking
   */
  async createEnhancedTables() {
    const enhancedTables = [
      // Discovery sources tracking
      `CREATE TABLE IF NOT EXISTS discovery_sources (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        weight INTEGER DEFAULT 50,
        enabled BOOLEAN DEFAULT 1,
        last_scan TIMESTAMP,
        documents_found INTEGER DEFAULT 0,
        processing_time_ms INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Enhanced document metadata
      `CREATE TABLE IF NOT EXISTS document_metadata (
        document_id INTEGER PRIMARY KEY,
        content_length INTEGER,
        word_count INTEGER,
        readability_score REAL,
        language TEXT,
        extracted_keywords TEXT,
        extracted_links TEXT,
        image_count INTEGER DEFAULT 0,
        table_count INTEGER DEFAULT 0,
        code_block_count INTEGER DEFAULT 0,
        heading_count INTEGER DEFAULT 0,
        quality_score REAL,
        nlp_classification TEXT,
        confidence_score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES wiki_documents (id)
      )`,

      // Discovery performance metrics
      `CREATE TABLE IF NOT EXISTS discovery_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT,
        metric_type TEXT NOT NULL,
        metric_value REAL,
        metric_unit TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )`
    ];

    try {
      for (const table of enhancedTables) {
        await this.runQuery(table);
      }
      
      // Create indexes for enhanced tables
      const enhancedIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_discovery_sources_enabled ON discovery_sources(enabled)',
        'CREATE INDEX IF NOT EXISTS idx_discovery_sources_type ON discovery_sources(type)',
        'CREATE INDEX IF NOT EXISTS idx_document_metadata_quality ON document_metadata(quality_score DESC)',
        'CREATE INDEX IF NOT EXISTS idx_document_metadata_classification ON document_metadata(nlp_classification)',
        'CREATE INDEX IF NOT EXISTS idx_discovery_metrics_source ON discovery_metrics(source_id)',
        'CREATE INDEX IF NOT EXISTS idx_discovery_metrics_type ON discovery_metrics(metric_type)'
      ];

      for (const index of enhancedIndexes) {
        await this.runQuery(index);
      }

      console.log('✅ Enhanced discovery tables created successfully');
    } catch (error) {
      console.error('❌ Failed to create enhanced tables:', error);
      throw error;
    }
  }

  /**
   * Enhanced document type classification using NLP and content analysis
   */
  async classifyDocumentTypeEnhanced(filePath, content = null) {
    const startTime = Date.now();
    
    try {
      // Get basic classification from parent method
      let basicType = this.classifyDocumentType(filePath);
      
      // If we have content, perform advanced classification
      if (content && this.classifier) {
        const nlpType = await this.performNLPClassification(content);
        const contentType = this.performContentBasedClassification(content, filePath);
        
        // Combine classifications with confidence weighting
        const finalType = this.combineClassificationResults(basicType, nlpType, contentType);
        
        // Log classification performance
        const processingTime = Date.now() - startTime;
        await this.recordMetric('classification_time', processingTime, 'ms');
        
        return finalType;
      }
      
      return basicType;
    } catch (error) {
      console.error('❌ Enhanced classification failed:', error);
      return this.classifyDocumentType(filePath); // Fallback to basic classification
    }
  }

  /**
   * Perform NLP-based classification
   */
  async performNLPClassification(content) {
    if (!this.classifier) return null;

    try {
      // Extract meaningful text for classification
      const cleanContent = this.contentAnalyzer.extractClassificationText(content);
      
      // Get classification from NLP model
      const classification = this.classifier.classify(cleanContent);
      const confidence = this.classifier.getClassifications(cleanContent);
      
      return {
        type: classification,
        confidence: confidence[0]?.value || 0,
        method: 'nlp'
      };
    } catch (error) {
      console.error('❌ NLP classification failed:', error);
      return null;
    }
  }

  /**
   * Perform content-based classification
   */
  performContentBasedClassification(content, filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    const fileDir = path.dirname(filePath).toLowerCase();
    
    // Enhanced pattern matching
    const patterns = {
      quickstart: /quick\s*start|getting\s*started|setup|installation/i,
      tutorial: /tutorial|walkthrough|step\s*by\s*step|how\s*to/i,
      architecture: /architecture|design|structure|components|system\s*overview/i,
      deployment: /deploy|deployment|production|docker|kubernetes|helm/i,
      security: /security|authentication|authorization|vulnerability|threat/i,
      troubleshooting: /troubleshoot|debug|error|problem|issue|faq/i,
      specification: /specification|spec|requirements|rfc/i,
      migration: /migration|migrate|upgrade|update|change/i,
      release_notes: /release|changelog|changes|version|history/i
    };

    // Check content patterns
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(content) || pattern.test(fileName) || pattern.test(fileDir)) {
        return {
          type: this.ENHANCED_DOC_TYPES[type.toUpperCase()] || type,
          confidence: 0.8,
          method: 'content_pattern'
        };
      }
    }

    return null;
  }

  /**
   * Combine multiple classification results
   */
  combineClassificationResults(basicType, nlpType, contentType) {
    const results = [
      { type: basicType, confidence: 0.6, weight: 0.3 },
      ...(nlpType ? [{ ...nlpType, weight: 0.4 }] : []),
      ...(contentType ? [{ ...contentType, weight: 0.3 }] : [])
    ];

    // Calculate weighted scores
    const typeScores = new Map();
    let totalWeight = 0;

    for (const result of results) {
      const score = result.confidence * result.weight;
      typeScores.set(result.type, (typeScores.get(result.type) || 0) + score);
      totalWeight += result.weight;
    }

    // Find best classification
    let bestType = basicType;
    let bestScore = 0;

    for (const [type, score] of typeScores.entries()) {
      const normalizedScore = score / totalWeight;
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestType = type;
      }
    }

    return bestType;
  }

  /**
   * Run multi-source document discovery
   */
  async runMultiSourceDiscovery() {
    const startTime = Date.now();
    console.log('🚀 Starting multi-source document discovery...');

    try {
      // Load and validate sources
      const enabledSources = this.discoveryConfig.sources.filter(source => source.enabled);
      console.log(`📍 Processing ${enabledSources.length} enabled sources`);

      // Process sources with controlled concurrency
      const maxConcurrent = this.discoveryConfig.performance.maxConcurrentSources || 3;
      const results = await this.processSourcesConcurrently(enabledSources, maxConcurrent);

      // Aggregate results
      const totalResults = {
        sourcesProcessed: results.length,
        documentsDiscovered: results.reduce((sum, r) => sum + r.discovered, 0),
        documentsProcessed: results.reduce((sum, r) => sum + r.processed, 0),
        errors: results.filter(r => r.error).length,
        processingTimeMs: Date.now() - startTime
      };

      // Update statistics
      this.discoveryStats.documentsDiscovered = totalResults.documentsDiscovered;
      this.discoveryStats.documentsProcessed = totalResults.documentsProcessed;
      this.discoveryStats.lastDiscoveryRun = new Date().toISOString();
      this.discoveryStats.averageProcessingTime = totalResults.processingTimeMs;

      // Record metrics
      await this.recordDiscoveryMetrics(totalResults);

      console.log('✅ Multi-source discovery completed:', totalResults);
      return totalResults;

    } catch (error) {
      console.error('❌ Multi-source discovery failed:', error);
      this.discoveryStats.errorCount++;
      throw error;
    }
  }

  /**
   * Process sources with controlled concurrency
   */
  async processSourcesConcurrently(sources, maxConcurrent) {
    const results = [];
    const executing = [];

    for (const source of sources) {
      // Wait if we've hit the concurrency limit
      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
      }

      const promise = this.processDiscoverySource(source)
        .then(result => {
          results.push(result);
          return result;
        })
        .catch(error => {
          const errorResult = { source: source.id, error: error.message, discovered: 0, processed: 0 };
          results.push(errorResult);
          return errorResult;
        })
        .finally(() => {
          // Remove from executing array
          const index = executing.indexOf(promise);
          if (index > -1) executing.splice(index, 1);
        });

      executing.push(promise);
    }

    // Wait for all remaining promises
    await Promise.all(executing);
    return results;
  }

  /**
   * Process a single discovery source
   */
  async processDiscoverySource(source) {
    const startTime = Date.now();
    console.log(`📂 Processing source: ${source.id} (${source.path})`);

    try {
      // Check if source path exists
      await fs.access(source.path);

      // Run discovery with source-specific configuration
      const result = await this.discoverDocumentsEnhanced(source);

      // Record source processing metrics
      const processingTime = Date.now() - startTime;
      await this.updateSourceMetrics(source.id, result, processingTime);

      console.log(`✅ Source ${source.id} processed: ${result.discovered} discovered, ${result.processed} processed`);
      return { source: source.id, ...result, processingTimeMs: processingTime };

    } catch (error) {
      console.error(`❌ Failed to process source ${source.id}:`, error);
      await this.recordMetric('source_error', 1, 'count', { source: source.id, error: error.message });
      throw error;
    }
  }

  /**
   * Enhanced document discovery for a specific source
   */
  async discoverDocumentsEnhanced(source) {
    const documents = [];
    const extensions = this.discoveryConfig.includePatterns.filter(p => p.startsWith('*')).map(p => p.substring(1));
    const includePatterns = this.discoveryConfig.includePatterns.filter(p => !p.startsWith('*'));
    
    // Scan directory with optimization
    await this.scanDirectoryOptimized(
      source.path,
      documents,
      extensions,
      includePatterns,
      source.maxDepth || 10,
      0
    );

    // Filter and deduplicate
    const uniqueDocuments = this.deduplicateDocuments(documents);
    
    // Process with enhanced classification and metadata extraction
    const processedCount = await this.processDiscoveredDocumentsEnhanced(
      uniqueDocuments,
      source
    );

    return {
      discovered: uniqueDocuments.length,
      processed: processedCount
    };
  }

  /**
   * Optimized directory scanning with exclusion patterns and depth limits
   */
  async scanDirectoryOptimized(dirPath, documents, extensions, includePatterns, maxDepth, currentDepth) {
    if (currentDepth >= maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);

        // Skip excluded patterns
        if (this.shouldIgnorePathEnhanced(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.scanDirectoryOptimized(
            fullPath,
            documents,
            extensions,
            includePatterns,
            maxDepth,
            currentDepth + 1
          );
        } else if (entry.isFile()) {
          if (this.isDocumentFileEnhanced(entry.name, extensions, includePatterns)) {
            const stats = await fs.stat(fullPath);
            documents.push({
              sourcePath: relativePath,
              fullPath: fullPath,
              fileName: entry.name,
              extension: path.extname(entry.name).toLowerCase(),
              size: stats.size,
              lastModified: stats.mtime,
              isSymbolicLink: entry.isSymbolicLink()
            });
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to scan directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Enhanced path exclusion checking
   */
  shouldIgnorePathEnhanced(relativePath) {
    const excludePatterns = this.discoveryConfig.excludePatterns || [];
    
    for (const pattern of excludePatterns) {
      // Simple glob pattern matching
      const regex = this.globToRegex(pattern);
      if (regex.test(relativePath)) {
        return true;
      }
    }

    // Additional checks
    if (relativePath.length > 500) return true; // Very long paths
    if (relativePath.includes('/.') && !relativePath.includes('/.github')) return true; // Hidden directories except .github

    return false;
  }

  /**
   * Convert glob pattern to regex
   */
  globToRegex(pattern) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\*\*/g, '___DOUBLESTAR___')   // Temporarily replace **
      .replace(/\*/g, '[^/]*')               // * matches anything except /
      .replace(/___DOUBLESTAR___/g, '.*');   // ** matches anything including /

    return new RegExp(`^${escaped}$`);
  }

  /**
   * Enhanced document file detection
   */
  isDocumentFileEnhanced(fileName, extensions, includePatterns) {
    const lowerFileName = fileName.toLowerCase();
    
    // Check extensions
    for (const ext of extensions) {
      if (lowerFileName.endsWith(ext)) return true;
    }
    
    // Check include patterns
    for (const pattern of includePatterns) {
      if (lowerFileName.includes(pattern.toLowerCase())) return true;
    }

    return false;
  }

  /**
   * Deduplicate documents based on content hash
   */
  deduplicateDocuments(documents) {
    const seen = new Set();
    return documents.filter(doc => {
      const key = `${doc.fileName}-${doc.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Process discovered documents with enhanced metadata extraction
   */
  async processDiscoveredDocumentsEnhanced(documents, source) {
    let processedCount = 0;
    const batchSize = this.discoveryConfig.performance.maxFilesPerBatch || 50;

    // Process in batches to avoid memory issues
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchResults = await this.processBatchEnhanced(batch, source);
      processedCount += batchResults;
    }

    return processedCount;
  }

  /**
   * Process a batch of documents
   */
  async processBatchEnhanced(documents, source) {
    let processed = 0;

    for (const doc of documents) {
      try {
        // Read file content
        const content = await this.readFileWithSizeLimit(doc.fullPath);
        
        // Enhanced classification
        const documentType = await this.classifyDocumentTypeEnhanced(doc.fullPath, content);
        
        // Content analysis
        const contentMetadata = await this.contentAnalyzer.analyzeContent(content);
        
        // Calculate enhanced priority score
        const priorityScore = this.calculateEnhancedPriorityScore(doc, documentType, contentMetadata, source);
        
        // Store document with enhanced metadata
        await this.storeDocumentEnhanced(doc, source, documentType, contentMetadata, priorityScore, content);
        
        processed++;
      } catch (error) {
        console.error(`❌ Failed to process document ${doc.fullPath}:`, error);
      }
    }

    return processed;
  }

  /**
   * Read file with size limit
   */
  async readFileWithSizeLimit(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const maxSize = this.parseSize(this.discoveryConfig.contentAnalysis?.maxContentLength || '1MB');
      
      if (stats.size > maxSize) {
        console.warn(`⚠️ File too large, reading first ${maxSize} bytes: ${filePath}`);
        const buffer = Buffer.alloc(maxSize);
        const fd = await fs.open(filePath, 'r');
        await fd.read(buffer, 0, maxSize, 0);
        await fd.close();
        return buffer.toString('utf8');
      }
      
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      console.error(`❌ Failed to read file ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Parse size string (e.g., "1MB", "500KB") to bytes
   */
  parseSize(sizeString) {
    const units = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = sizeString.match(/^(\d+)(KB|MB|GB)$/i);
    if (!match) return parseInt(sizeString) || 1024 * 1024; // Default 1MB
    
    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  /**
   * Calculate enhanced priority score
   */
  calculateEnhancedPriorityScore(doc, documentType, contentMetadata, source) {
    const weights = this.discoveryConfig.priorityScoring.weights;
    const typeScores = this.discoveryConfig.priorityScoring.documentTypeScores;
    const sourceScores = this.discoveryConfig.priorityScoring.sourceLocationScores;
    
    let score = 0;
    
    // Document type score
    score += (typeScores[documentType] || 50) * weights.documentType;
    
    // Last modified score (more recent = higher score)
    const daysSinceModified = (Date.now() - new Date(doc.lastModified)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 100 - daysSinceModified * 2);
    score += recencyScore * weights.lastModified;
    
    // File size score (moderate size preferred)
    const sizeScore = Math.min(100, Math.max(0, 100 - Math.abs(doc.size - 5000) / 100));
    score += sizeScore * weights.fileSize;
    
    // Repository/source importance
    score += (sourceScores[source.type] || 25) * weights.repositoryImportance;
    score += (source.weight || 50) * weights.repositoryImportance * 0.5;
    
    // Content quality score
    if (contentMetadata && contentMetadata.qualityScore) {
      score += contentMetadata.qualityScore * weights.contentQuality;
    }
    
    return Math.round(Math.min(100, Math.max(0, score)));
  }

  /**
   * Store document with enhanced metadata
   */
  async storeDocumentEnhanced(doc, source, documentType, contentMetadata, priorityScore, content) {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const repositoryName = this.extractRepositoryNameFromPath(doc.fullPath, source.path);
    const sourceLocation = source.type;
    
    // Check if document already exists and unchanged
    const existingDoc = await this.getQuery(
      'SELECT id, content_hash FROM wiki_documents WHERE source_path = ?',
      [doc.sourcePath]
    );

    if (existingDoc && existingDoc.content_hash === contentHash) {
      // Document unchanged, just update timestamp
      await this.runQuery(
        'UPDATE wiki_documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [existingDoc.id]
      );
      return;
    }

    // Store or update document
    const docData = {
      source_path: doc.sourcePath,
      repository_name: repositoryName,
      source_location: sourceLocation,
      document_type: documentType,
      content_hash: contentHash,
      last_modified: doc.lastModified.toISOString(),
      sync_status: this.STATUS.DISCOVERED,
      priority_score: priorityScore,
      file_size: doc.size,
      metadata: JSON.stringify({
        source_id: source.id,
        extension: doc.extension,
        is_symbolic_link: doc.isSymbolicLink || false
      })
    };

    let documentId;
    if (existingDoc) {
      // Update existing document
      await this.runQuery(`
        UPDATE wiki_documents 
        SET repository_name = ?, source_location = ?, document_type = ?, 
            content_hash = ?, last_modified = ?, priority_score = ?, 
            file_size = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        docData.repository_name, docData.source_location, docData.document_type,
        docData.content_hash, docData.last_modified, docData.priority_score,
        docData.file_size, docData.metadata, existingDoc.id
      ]);
      documentId = existingDoc.id;
    } else {
      // Insert new document
      const result = await this.runQuery(`
        INSERT INTO wiki_documents (
          source_path, repository_name, source_location, document_type,
          content_hash, last_modified, sync_status, priority_score,
          file_size, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        docData.source_path, docData.repository_name, docData.source_location,
        docData.document_type, docData.content_hash, docData.last_modified,
        docData.sync_status, docData.priority_score, docData.file_size,
        docData.metadata
      ]);
      documentId = result.lastID;
    }

    // Store enhanced metadata
    if (contentMetadata && documentId) {
      await this.storeDocumentMetadata(documentId, contentMetadata);
    }
  }

  /**
   * Store document metadata
   */
  async storeDocumentMetadata(documentId, metadata) {
    const metadataRecord = {
      document_id: documentId,
      content_length: metadata.contentLength || 0,
      word_count: metadata.wordCount || 0,
      readability_score: metadata.readabilityScore || 0,
      language: metadata.language || 'en',
      extracted_keywords: JSON.stringify(metadata.keywords || []),
      extracted_links: JSON.stringify(metadata.links || []),
      image_count: metadata.imageCount || 0,
      table_count: metadata.tableCount || 0,
      code_block_count: metadata.codeBlockCount || 0,
      heading_count: metadata.headingCount || 0,
      quality_score: metadata.qualityScore || 50,
      nlp_classification: metadata.nlpClassification || null,
      confidence_score: metadata.confidenceScore || 0
    };

    // Check if metadata already exists
    const existing = await this.getQuery(
      'SELECT document_id FROM document_metadata WHERE document_id = ?',
      [documentId]
    );

    if (existing) {
      // Update existing metadata
      const updateFields = Object.keys(metadataRecord).filter(k => k !== 'document_id');
      const updateQuery = `
        UPDATE document_metadata 
        SET ${updateFields.map(f => `${f} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ?
      `;
      const updateValues = updateFields.map(f => metadataRecord[f]);
      updateValues.push(documentId);
      
      await this.runQuery(updateQuery, updateValues);
    } else {
      // Insert new metadata
      const insertFields = Object.keys(metadataRecord);
      const insertQuery = `
        INSERT INTO document_metadata (${insertFields.join(', ')})
        VALUES (${insertFields.map(() => '?').join(', ')})
      `;
      const insertValues = insertFields.map(f => metadataRecord[f]);
      
      await this.runQuery(insertQuery, insertValues);
    }
  }

  /**
   * Extract repository name from file path
   */
  extractRepositoryNameFromPath(filePath, sourcePath) {
    const relativePath = path.relative(sourcePath, filePath);
    const parts = relativePath.split(path.sep);
    
    // For Git repositories, usually the first directory is the repo name
    if (parts.length > 0) {
      return parts[0];
    }
    
    return path.basename(sourcePath);
  }

  /**
   * Record discovery metrics
   */
  async recordDiscoveryMetrics(results) {
    const metrics = [
      { type: 'sources_processed', value: results.sourcesProcessed },
      { type: 'documents_discovered', value: results.documentsDiscovered },
      { type: 'documents_processed', value: results.documentsProcessed },
      { type: 'processing_time_ms', value: results.processingTimeMs },
      { type: 'error_count', value: results.errors }
    ];

    for (const metric of metrics) {
      await this.recordMetric(metric.type, metric.value, 'count');
    }
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metricType, metricValue, unit = 'count', metadata = null) {
    await this.runQuery(`
      INSERT INTO discovery_metrics (metric_type, metric_value, metric_unit, metadata)
      VALUES (?, ?, ?, ?)
    `, [metricType, metricValue, unit, metadata ? JSON.stringify(metadata) : null]);
  }

  /**
   * Update source processing metrics
   */
  async updateSourceMetrics(sourceId, result, processingTime) {
    await this.runQuery(`
      INSERT OR REPLACE INTO discovery_sources (
        id, last_scan, documents_found, processing_time_ms,
        error_count, updated_at
      ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, 0, CURRENT_TIMESTAMP)
    `, [sourceId, result.discovered, processingTime]);
  }

  /**
   * Get discovery statistics
   */
  getDiscoveryStats() {
    return {
      ...this.discoveryStats,
      performanceMetrics: {
        avgSourceProcessingTime: this.calculateAverageSourceProcessingTime(),
        memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
        totalMetricsRecorded: this.performanceMetrics.fileProcessingTimes.length
      }
    };
  }

  /**
   * Calculate average source processing time
   */
  calculateAverageSourceProcessingTime() {
    if (this.performanceMetrics.sourceProcessingTimes.size === 0) return 0;
    
    const times = Array.from(this.performanceMetrics.sourceProcessingTimes.values());
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }
}

/**
 * Content Analyzer Class
 * Handles advanced content analysis including NLP and quality scoring
 */
class ContentAnalyzer {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    // Initialize sentiment analyzer with correct parameters
    try {
      this.sentiment = new natural.SentimentAnalyzer('English', 
        natural.PorterStemmer, 'afinn');
    } catch (error) {
      console.warn('⚠️ Failed to initialize sentiment analyzer:', error.message);
      this.sentiment = null;
    }
  }

  /**
   * Analyze document content for metadata extraction
   */
  async analyzeContent(content) {
    if (!content || content.trim().length === 0) {
      return this.getEmptyAnalysis();
    }

    try {
      const analysis = {
        contentLength: content.length,
        wordCount: this.countWords(content),
        readabilityScore: this.calculateReadabilityScore(content),
        language: this.detectLanguage(content),
        keywords: this.extractKeywords(content),
        links: this.extractLinks(content),
        imageCount: this.countImages(content),
        tableCount: this.countTables(content),
        codeBlockCount: this.countCodeBlocks(content),
        headingCount: this.countHeadings(content),
        qualityScore: 0 // Will be calculated below
      };

      // Calculate overall quality score
      analysis.qualityScore = this.calculateQualityScore(analysis, content);

      return analysis;
    } catch (error) {
      console.error('❌ Content analysis failed:', error);
      return this.getEmptyAnalysis();
    }
  }

  /**
   * Extract text suitable for classification
   */
  extractClassificationText(content) {
    // Remove markdown formatting but keep meaningful text
    let text = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Keep link text only
      .replace(/#{1,6}\s+/g, '') // Remove heading markers
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Remove emphasis
      .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
      .toLowerCase();

    // Take first 500 words for classification
    const words = this.tokenizer.tokenize(text);
    return words.slice(0, 500).join(' ');
  }

  /**
   * Count words in content
   */
  countWords(content) {
    const words = this.tokenizer.tokenize(content);
    return words ? words.length : 0;
  }

  /**
   * Calculate readability score (simplified Flesch Reading Ease)
   */
  calculateReadabilityScore(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = this.tokenizer.tokenize(content) || [];
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    // Simplified Flesch Reading Ease formula
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Count syllables in a word (approximate)
   */
  countSyllables(word) {
    if (!word || word.length === 0) return 0;
    
    word = word.toLowerCase();
    let count = 0;
    let previousWasVowel = false;
    const vowels = 'aeiouy';

    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    // Adjust for silent 'e'
    if (word.endsWith('e') && count > 1) {
      count--;
    }

    return Math.max(1, count);
  }

  /**
   * Simple language detection
   */
  detectLanguage(content) {
    // Simple English detection based on common words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with'];
    const words = this.tokenizer.tokenize(content.toLowerCase()) || [];
    const englishCount = words.filter(word => englishWords.includes(word)).length;
    
    return englishCount > words.length * 0.05 ? 'en' : 'unknown';
  }

  /**
   * Extract keywords using TF-IDF
   */
  extractKeywords(content) {
    try {
      const words = this.tokenizer.tokenize(content.toLowerCase()) || [];
      const filteredWords = words.filter(word => 
        word.length > 3 && 
        !natural.stopwords.includes(word) &&
        /^[a-zA-Z]+$/.test(word)
      );

      // Simple frequency analysis
      const wordFreq = {};
      filteredWords.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });

      // Get top keywords
      return Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word]) => word);
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract links from content
   */
  extractLinks(content) {
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2]
      });
    }

    return links.slice(0, 20); // Limit to prevent excessive storage
  }

  /**
   * Count images in markdown
   */
  countImages(content) {
    const imagePattern = /!\[.*?\]\([^)]+\)/g;
    const matches = content.match(imagePattern);
    return matches ? matches.length : 0;
  }

  /**
   * Count tables in markdown
   */
  countTables(content) {
    const tablePattern = /^\|.*\|$/gm;
    const matches = content.match(tablePattern);
    return matches ? Math.ceil(matches.length / 2) : 0; // Approximate table count
  }

  /**
   * Count code blocks
   */
  countCodeBlocks(content) {
    const codeBlockPattern = /```[\s\S]*?```/g;
    const inlineCodePattern = /`[^`]+`/g;
    
    const blockMatches = content.match(codeBlockPattern) || [];
    const inlineMatches = content.match(inlineCodePattern) || [];
    
    return blockMatches.length + Math.ceil(inlineMatches.length / 5); // Weight inline code less
  }

  /**
   * Count headings
   */
  countHeadings(content) {
    const headingPattern = /^#{1,6}\s+.+$/gm;
    const matches = content.match(headingPattern);
    return matches ? matches.length : 0;
  }

  /**
   * Calculate overall content quality score
   */
  calculateQualityScore(analysis, content) {
    let score = 50; // Base score

    // Content length score
    if (analysis.contentLength > 100 && analysis.contentLength < 10000) {
      score += 15;
    } else if (analysis.contentLength > 500) {
      score += 10;
    }

    // Word count score
    if (analysis.wordCount > 50) score += 10;
    if (analysis.wordCount > 200) score += 5;

    // Structure score
    if (analysis.headingCount > 0) score += 10;
    if (analysis.headingCount > 2) score += 5;

    // Rich content score
    if (analysis.links.length > 0) score += 5;
    if (analysis.imageCount > 0) score += 3;
    if (analysis.tableCount > 0) score += 3;
    if (analysis.codeBlockCount > 0) score += 7;

    // Readability score
    if (analysis.readabilityScore > 60) score += 10;
    else if (analysis.readabilityScore > 30) score += 5;

    // Keywords diversity
    if (analysis.keywords.length > 5) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get empty analysis for error cases
   */
  getEmptyAnalysis() {
    return {
      contentLength: 0,
      wordCount: 0,
      readabilityScore: 0,
      language: 'unknown',
      keywords: [],
      links: [],
      imageCount: 0,
      tableCount: 0,
      codeBlockCount: 0,
      headingCount: 0,
      qualityScore: 0
    };
  }
}

module.exports = EnhancedDiscoveryManager;
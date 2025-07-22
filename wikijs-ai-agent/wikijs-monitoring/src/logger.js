/**
 * WikiJS Agent Structured Logger
 * Comprehensive logging system with aggregation and analysis capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const { EventEmitter } = require('events');

class WikiJSLogger extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            levels: config.levels || ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
            format: config.format || 'JSON',
            default_level: config.default_level || 'INFO',
            outputs: {
                file: {
                    enabled: config.file_enabled !== false,
                    path: config.log_path || '/home/dev/workspace/wikijs-monitoring/logs',
                    filename_pattern: config.filename_pattern || 'wikijs-agent-{date}.log',
                    rotation: config.rotation || 'daily',
                    retention: config.retention || 30, // days
                    compression: config.compression !== false,
                    max_size: config.max_file_size || '100MB'
                },
                console: {
                    enabled: config.console_enabled !== false,
                    level: config.console_level || 'INFO',
                    colorize: config.colorize !== false
                },
                syslog: {
                    enabled: config.syslog_enabled || false,
                    facility: config.syslog_facility || 'local0',
                    host: config.syslog_host || 'localhost',
                    port: config.syslog_port || 514
                },
                elasticsearch: {
                    enabled: config.elasticsearch_enabled || false,
                    url: config.elasticsearch_url || 'http://localhost:9200',
                    index_pattern: config.elasticsearch_index || 'wikijs-agent-logs-{date}'
                }
            },
            correlation: {
                enabled: config.correlation_enabled !== false,
                id_header: config.correlation_header || 'x-correlation-id'
            },
            sampling: {
                enabled: config.sampling_enabled || false,
                rate: config.sampling_rate || 0.1 // 10% sampling for high-volume logs
            },
            buffer: {
                enabled: config.buffer_enabled !== false,
                size: config.buffer_size || 1000,
                flush_interval: config.flush_interval || 5000 // 5 seconds
            },
            ...config
        };

        this.levelPriority = {
            'TRACE': 0,
            'DEBUG': 1,
            'INFO': 2,
            'WARN': 3,
            'ERROR': 4
        };

        this.logBuffer = [];
        this.fileStreams = new Map();
        this.currentLogFile = null;
        this.correlationContext = new Map();
        this.metrics = {
            totalLogs: 0,
            logsByLevel: new Map(),
            errors: 0,
            patterns: new Map()
        };

        this.isActive = false;
    }

    /**
     * Start logger
     */
    async start() {
        if (this.isActive) {
            return;
        }

        this.isActive = true;
        console.log('📝 Starting WikiJS Agent Logger');

        // Initialize outputs
        await this.initializeOutputs();

        // Start buffer flushing
        if (this.config.buffer.enabled) {
            this.startBufferFlushing();
        }

        // Start log rotation
        this.startLogRotation();

        // Initialize log levels
        this.initializeLogLevels();

        this.emit('logger-started');
    }

    /**
     * Stop logger
     */
    async stop() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        console.log('⏹️ Stopping WikiJS Agent Logger');

        // Flush remaining logs
        await this.flushLogs();

        // Close file streams
        for (const stream of this.fileStreams.values()) {
            if (stream && !stream.destroyed) {
                stream.end();
            }
        }

        // Clear intervals
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }

        this.emit('logger-stopped');
    }

    /**
     * Initialize logging outputs
     */
    async initializeOutputs() {
        // Initialize file output
        if (this.config.outputs.file.enabled) {
            await this.initializeFileOutput();
        }

        // Initialize console output
        if (this.config.outputs.console.enabled) {
            this.initializeConsoleOutput();
        }

        // Initialize syslog output
        if (this.config.outputs.syslog.enabled) {
            this.initializeSyslogOutput();
        }

        // Initialize Elasticsearch output
        if (this.config.outputs.elasticsearch.enabled) {
            this.initializeElasticsearchOutput();
        }
    }

    /**
     * Initialize file output
     */
    async initializeFileOutput() {
        const logDir = this.config.outputs.file.path;
        await fs.mkdir(logDir, { recursive: true });

        // Create current log file
        const logFilename = this.generateLogFilename();
        const logPath = path.join(logDir, logFilename);
        
        const stream = createWriteStream(logPath, { flags: 'a' });
        this.fileStreams.set('main', stream);
        this.currentLogFile = logPath;
    }

    /**
     * Initialize console output
     */
    initializeConsoleOutput() {
        // Console output is handled in the log method
    }

    /**
     * Initialize syslog output
     */
    initializeSyslogOutput() {
        // Syslog implementation would go here
        // For now, just log that it's configured
        console.log('Syslog output configured');
    }

    /**
     * Initialize Elasticsearch output
     */
    initializeElasticsearchOutput() {
        // Elasticsearch client initialization would go here
        console.log('Elasticsearch output configured');
    }

    /**
     * Initialize log levels dynamically
     */
    initializeLogLevels() {
        for (const level of this.config.levels) {
            this[level.toLowerCase()] = (message, metadata = {}) => {
                this.log(level, message, metadata);
            };
        }
    }

    /**
     * Main logging method
     */
    log(level, message, metadata = {}) {
        if (!this.isActive) {
            return;
        }

        // Check log level threshold
        if (!this.shouldLog(level)) {
            return;
        }

        // Apply sampling if enabled
        if (this.config.sampling.enabled && !this.shouldSample()) {
            return;
        }

        // Generate log entry
        const logEntry = this.createLogEntry(level, message, metadata);

        // Buffer or process immediately
        if (this.config.buffer.enabled) {
            this.logBuffer.push(logEntry);
            
            // Flush if buffer is full
            if (this.logBuffer.length >= this.config.buffer.size) {
                this.flushLogs();
            }
        } else {
            this.processLogEntry(logEntry);
        }

        // Update metrics
        this.updateMetrics(logEntry);

        // Emit log event
        this.emit('log-entry', logEntry);
    }

    /**
     * Create structured log entry
     */
    createLogEntry(level, message, metadata) {
        const timestamp = new Date().toISOString();
        const correlationId = this.getCurrentCorrelationId();

        const logEntry = {
            timestamp,
            level,
            message,
            correlation_id: correlationId,
            component: metadata.component || 'wikijs-agent',
            operation: metadata.operation || null,
            duration: metadata.duration || null,
            user_id: metadata.user_id || null,
            session_id: metadata.session_id || null,
            request_id: metadata.request_id || null,
            error: metadata.error ? this.serializeError(metadata.error) : null,
            metadata: this.sanitizeMetadata(metadata),
            hostname: require('os').hostname(),
            pid: process.pid,
            memory_usage: process.memoryUsage().heapUsed,
            uptime: process.uptime()
        };

        // Add stack trace for errors
        if (level === 'ERROR' && metadata.error instanceof Error) {
            logEntry.stack_trace = metadata.error.stack;
        }

        return logEntry;
    }

    /**
     * Process log entry through all outputs
     */
    async processLogEntry(logEntry) {
        const outputs = [];

        // File output
        if (this.config.outputs.file.enabled) {
            outputs.push(this.writeToFile(logEntry));
        }

        // Console output
        if (this.config.outputs.console.enabled) {
            outputs.push(this.writeToConsole(logEntry));
        }

        // Syslog output
        if (this.config.outputs.syslog.enabled) {
            outputs.push(this.writeToSyslog(logEntry));
        }

        // Elasticsearch output
        if (this.config.outputs.elasticsearch.enabled) {
            outputs.push(this.writeToElasticsearch(logEntry));
        }

        await Promise.allSettled(outputs);
    }

    /**
     * Write to file
     */
    async writeToFile(logEntry) {
        const stream = this.fileStreams.get('main');
        if (!stream || stream.destroyed) {
            return;
        }

        const logLine = this.formatLogEntry(logEntry, 'file') + '\n';
        
        return new Promise((resolve, reject) => {
            stream.write(logLine, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Write to console
     */
    async writeToConsole(logEntry) {
        const consoleLevel = this.config.outputs.console.level;
        if (!this.shouldLogToConsole(logEntry.level, consoleLevel)) {
            return;
        }

        const formattedMessage = this.formatLogEntry(logEntry, 'console');
        
        if (this.config.outputs.console.colorize) {
            console.log(this.colorizeMessage(formattedMessage, logEntry.level));
        } else {
            console.log(formattedMessage);
        }
    }

    /**
     * Write to syslog
     */
    async writeToSyslog(logEntry) {
        // Syslog implementation would go here
        // For now, just simulate
        console.log(`SYSLOG: ${this.formatLogEntry(logEntry, 'syslog')}`);
    }

    /**
     * Write to Elasticsearch
     */
    async writeToElasticsearch(logEntry) {
        // Elasticsearch implementation would go here
        // For now, just simulate
        console.log(`ES: ${JSON.stringify(logEntry)}`);
    }

    /**
     * Format log entry for different outputs
     */
    formatLogEntry(logEntry, outputType) {
        switch (outputType) {
            case 'console':
                if (this.config.format === 'JSON') {
                    return JSON.stringify(logEntry);
                } else {
                    return `${logEntry.timestamp} [${logEntry.level}] ${logEntry.component}: ${logEntry.message}`;
                }
            
            case 'file':
                return JSON.stringify(logEntry);
            
            case 'syslog':
                return `${logEntry.level}: ${logEntry.message}`;
            
            default:
                return JSON.stringify(logEntry);
        }
    }

    /**
     * Colorize console messages
     */
    colorizeMessage(message, level) {
        const colors = {
            ERROR: '\x1b[31m',  // Red
            WARN: '\x1b[33m',   // Yellow
            INFO: '\x1b[36m',   // Cyan
            DEBUG: '\x1b[35m',  // Magenta
            TRACE: '\x1b[90m'   // Gray
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || '';
        
        return `${color}${message}${reset}`;
    }

    /**
     * Check if log should be written
     */
    shouldLog(level) {
        const currentLevelPriority = this.levelPriority[this.config.default_level] || 2;
        const logLevelPriority = this.levelPriority[level] || 2;
        
        return logLevelPriority >= currentLevelPriority;
    }

    /**
     * Check if log should be written to console
     */
    shouldLogToConsole(level, consoleLevel) {
        const consoleLevelPriority = this.levelPriority[consoleLevel] || 2;
        const logLevelPriority = this.levelPriority[level] || 2;
        
        return logLevelPriority >= consoleLevelPriority;
    }

    /**
     * Apply sampling
     */
    shouldSample() {
        return Math.random() <= this.config.sampling.rate;
    }

    /**
     * Serialize error objects
     */
    serializeError(error) {
        if (!(error instanceof Error)) {
            return error;
        }

        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            errno: error.errno,
            syscall: error.syscall,
            path: error.path
        };
    }

    /**
     * Sanitize metadata to remove sensitive information
     */
    sanitizeMetadata(metadata) {
        const sanitized = { ...metadata };
        
        // Remove common sensitive fields
        const sensitiveFields = [
            'password', 'passwd', 'secret', 'token', 'key', 'auth',
            'authorization', 'cookie', 'session', 'api_key', 'access_token'
        ];
        
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        // Remove error and duration as they're handled separately
        delete sanitized.error;
        delete sanitized.duration;
        delete sanitized.component;
        delete sanitized.operation;

        return sanitized;
    }

    /**
     * Start buffer flushing
     */
    startBufferFlushing() {
        this.flushInterval = setInterval(async () => {
            if (this.logBuffer.length > 0) {
                await this.flushLogs();
            }
        }, this.config.buffer.flush_interval);
    }

    /**
     * Flush log buffer
     */
    async flushLogs() {
        if (this.logBuffer.length === 0) {
            return;
        }

        const logsToFlush = [...this.logBuffer];
        this.logBuffer = [];

        const flushPromises = logsToFlush.map(logEntry => this.processLogEntry(logEntry));
        await Promise.allSettled(flushPromises);

        this.emit('logs-flushed', { count: logsToFlush.length });
    }

    /**
     * Start log rotation
     */
    startLogRotation() {
        // Check for rotation every hour
        this.rotationInterval = setInterval(async () => {
            await this.rotateLogsIfNeeded();
        }, 3600000);
    }

    /**
     * Rotate logs if needed
     */
    async rotateLogsIfNeeded() {
        if (!this.config.outputs.file.enabled || !this.currentLogFile) {
            return;
        }

        const shouldRotate = await this.checkRotationCriteria();
        
        if (shouldRotate) {
            await this.rotateLogs();
        }
    }

    /**
     * Check if logs should be rotated
     */
    async checkRotationCriteria() {
        try {
            const stats = await fs.stat(this.currentLogFile);
            const now = new Date();
            const fileDate = new Date(stats.birthtime);
            
            switch (this.config.outputs.file.rotation) {
                case 'daily':
                    return now.getDate() !== fileDate.getDate();
                case 'weekly':
                    const weeksDiff = Math.floor((now - fileDate) / (7 * 24 * 60 * 60 * 1000));
                    return weeksDiff >= 1;
                case 'size':
                    const maxSizeBytes = this.parseSize(this.config.outputs.file.max_size);
                    return stats.size >= maxSizeBytes;
                default:
                    return false;
            }
        } catch (error) {
            console.error('Error checking rotation criteria:', error);
            return false;
        }
    }

    /**
     * Parse size string to bytes
     */
    parseSize(sizeStr) {
        const units = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024
        };
        
        const match = sizeStr.match(/^(\d+)([A-Z]+)$/);
        if (!match) {
            return 100 * 1024 * 1024; // Default 100MB
        }
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        return value * (units[unit] || 1);
    }

    /**
     * Rotate logs
     */
    async rotateLogs() {
        // Close current stream
        const currentStream = this.fileStreams.get('main');
        if (currentStream && !currentStream.destroyed) {
            currentStream.end();
        }

        // Archive current log file
        if (this.currentLogFile) {
            const archivePath = this.generateArchiveFilename(this.currentLogFile);
            await fs.rename(this.currentLogFile, archivePath);
            
            // Compress if enabled
            if (this.config.outputs.file.compression) {
                await this.compressLogFile(archivePath);
            }
        }

        // Create new log file
        await this.initializeFileOutput();
        
        // Clean up old logs
        await this.cleanupOldLogs();
        
        this.emit('logs-rotated');
    }

    /**
     * Generate log filename
     */
    generateLogFilename() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        
        return this.config.outputs.file.filename_pattern.replace('{date}', dateStr);
    }

    /**
     * Generate archive filename
     */
    generateArchiveFilename(originalPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = path.extname(originalPath);
        const basename = path.basename(originalPath, ext);
        const dirname = path.dirname(originalPath);
        
        return path.join(dirname, `${basename}-${timestamp}${ext}`);
    }

    /**
     * Compress log file
     */
    async compressLogFile(filePath) {
        const zlib = require('zlib');
        const { createReadStream } = require('fs');
        
        try {
            const readStream = createReadStream(filePath);
            const writeStream = createWriteStream(`${filePath}.gz`);
            const gzipStream = zlib.createGzip();
            
            await new Promise((resolve, reject) => {
                readStream
                    .pipe(gzipStream)
                    .pipe(writeStream)
                    .on('finish', resolve)
                    .on('error', reject);
            });
            
            // Remove original file after successful compression
            await fs.unlink(filePath);
        } catch (error) {
            console.error('Log compression failed:', error);
        }
    }

    /**
     * Clean up old log files
     */
    async cleanupOldLogs() {
        try {
            const logDir = this.config.outputs.file.path;
            const files = await fs.readdir(logDir);
            const now = Date.now();
            const retentionMs = this.config.outputs.file.retention * 24 * 60 * 60 * 1000;
            
            for (const file of files) {
                if (file.includes('wikijs-agent') && (file.endsWith('.log') || file.endsWith('.log.gz'))) {
                    const filePath = path.join(logDir, file);
                    const stats = await fs.stat(filePath);
                    
                    if (now - stats.mtime.getTime() > retentionMs) {
                        await fs.unlink(filePath);
                        console.log(`Cleaned up old log file: ${file}`);
                    }
                }
            }
        } catch (error) {
            console.error('Log cleanup failed:', error);
        }
    }

    /**
     * Update logging metrics
     */
    updateMetrics(logEntry) {
        this.metrics.totalLogs++;
        
        // Count by level
        const levelCount = this.metrics.logsByLevel.get(logEntry.level) || 0;
        this.metrics.logsByLevel.set(logEntry.level, levelCount + 1);
        
        // Count errors
        if (logEntry.level === 'ERROR') {
            this.metrics.errors++;
        }
        
        // Pattern detection (simplified)
        if (logEntry.message) {
            const pattern = this.extractPattern(logEntry.message);
            const patternCount = this.metrics.patterns.get(pattern) || 0;
            this.metrics.patterns.set(pattern, patternCount + 1);
        }
    }

    /**
     * Extract pattern from log message
     */
    extractPattern(message) {
        // Simple pattern extraction - replace numbers and IDs with placeholders
        return message
            .replace(/\d+/g, 'NUM')
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
            .replace(/\w+@\w+\.\w+/g, 'EMAIL')
            .replace(/https?:\/\/[^\s]+/g, 'URL');
    }

    /**
     * Correlation context management
     */
    setCorrelationId(correlationId) {
        this.correlationContext.set('current', correlationId);
    }

    getCurrentCorrelationId() {
        return this.correlationContext.get('current') || this.generateCorrelationId();
    }

    generateCorrelationId() {
        return `wikijs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    clearCorrelationId() {
        this.correlationContext.delete('current');
    }

    /**
     * Structured logging helpers
     */
    logOperation(operation, duration, success, metadata = {}) {
        const level = success ? 'INFO' : 'WARN';
        const message = `Operation ${operation} ${success ? 'completed' : 'failed'} in ${duration}ms`;
        
        this.log(level, message, {
            operation,
            duration,
            success,
            ...metadata
        });
    }

    logError(error, context = {}) {
        this.log('ERROR', error.message || 'Unknown error', {
            error,
            ...context
        });
    }

    logPerformance(operation, startTime, metadata = {}) {
        const duration = Date.now() - startTime;
        this.log('DEBUG', `Performance: ${operation}`, {
            operation,
            duration,
            performance: true,
            ...metadata
        });
    }

    logSecurity(event, user, details = {}) {
        this.log('WARN', `Security event: ${event}`, {
            security_event: event,
            user_id: user,
            component: 'security',
            ...details
        });
    }

    /**
     * Get logging statistics
     */
    getMetrics() {
        return {
            total_logs: this.metrics.totalLogs,
            logs_by_level: Object.fromEntries(this.metrics.logsByLevel),
            error_count: this.metrics.errors,
            common_patterns: Array.from(this.metrics.patterns.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10),
            buffer_size: this.logBuffer.length,
            active_outputs: this.getActiveOutputs(),
            current_log_file: this.currentLogFile
        };
    }

    /**
     * Get active outputs
     */
    getActiveOutputs() {
        const outputs = [];
        
        if (this.config.outputs.file.enabled) outputs.push('file');
        if (this.config.outputs.console.enabled) outputs.push('console');
        if (this.config.outputs.syslog.enabled) outputs.push('syslog');
        if (this.config.outputs.elasticsearch.enabled) outputs.push('elasticsearch');
        
        return outputs;
    }

    /**
     * Search logs
     */
    async searchLogs(query, options = {}) {
        // This would implement log search functionality
        // For now, return a placeholder
        return {
            query,
            results: [],
            total: 0,
            took: 0
        };
    }

    /**
     * Export logger data
     */
    exportData() {
        return {
            config: this.config,
            metrics: this.getMetrics(),
            correlation_context: Object.fromEntries(this.correlationContext),
            buffer_size: this.logBuffer.length,
            file_streams: Array.from(this.fileStreams.keys())
        };
    }
}

module.exports = WikiJSLogger;
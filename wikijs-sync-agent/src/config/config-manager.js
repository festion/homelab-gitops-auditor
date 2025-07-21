const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = this.getDefaultConfig();
    this.watchers = [];
  }

  getDefaultConfig() {
    return {
      // Connection settings
      wikiJsUrl: '',
      apiToken: '',
      locale: 'en',

      // Local settings
      localPath: '',
      dataDir: '',

      // Monitoring settings
      monitoring: {
        watchLocal: true,
        pollRemote: true,
        pollInterval: 60000,      // 1 minute
        debounceDelay: 1000       // 1 second
      },

      // Conflict resolution settings
      conflicts: {
        autoResolve: ['local_newer', 'remote_newer'],
        requireManual: ['both_changed', 'structural_conflict'],
        backupOnResolve: true,
        notifyUser: true
      },

      // Performance settings
      performance: {
        batchSize: 10,
        maxConcurrent: 3,
        compressionLevel: 6,
        deltaSyncThreshold: 1024
      },

      // Notification settings
      notifications: {
        log: true,
        system: true,
        systemLevels: ['error', 'warning'],
        email: false,
        webhook: false
      },

      // Backup settings
      backup: {
        enabled: true,
        compressionThreshold: 1024,
        retentionDays: 30,
        autoCleanup: true
      },

      // Security settings
      security: {
        validateSSL: true,
        maxFileSize: 10485760,    // 10MB
        allowedExtensions: ['.md', '.txt'],
        encryptBackups: false
      },

      // Sync modes
      syncMode: {
        mode: 'bidirectional',    // 'push_only', 'pull_only', 'bidirectional', 'manual'
        interval: 'realtime',     // 'realtime', 'periodic', 'manual'
        periodicInterval: 300000  // 5 minutes
      },

      // File filtering
      filtering: {
        ignorePatterns: [
          '.git/**',
          '.svn/**',
          'node_modules/**',
          '*.tmp',
          '*.swp',
          '*.bak',
          '.DS_Store',
          'Thumbs.db'
        ],
        includeHidden: false,
        maxDepth: 10
      },

      // Logging settings
      logging: {
        level: 'info',           // 'debug', 'info', 'warning', 'error'
        file: true,
        console: true,
        maxFileSize: 10485760,   // 10MB
        maxFiles: 5
      }
    };
  }

  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(data);
      this.config = this.mergeConfig(this.getDefaultConfig(), userConfig);
      await this.validate();
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save();
        return this.config;
      }
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  async save() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configData);
      
      this.notifyWatchers('save', this.config);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(userConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this.mergeConfig(defaultConfig[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  async validate() {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!this.config.wikiJsUrl) {
      errors.push('WikiJS URL is required');
    }

    if (!this.config.apiToken) {
      errors.push('API token is required');
    }

    if (!this.config.localPath) {
      errors.push('Local path is required');
    }

    if (!this.config.dataDir) {
      errors.push('Data directory is required');
    }

    // URL validation
    if (this.config.wikiJsUrl) {
      try {
        new URL(this.config.wikiJsUrl);
      } catch (error) {
        errors.push('Invalid WikiJS URL format');
      }
    }

    // Path validation
    if (this.config.localPath) {
      try {
        const stats = await fs.stat(this.config.localPath);
        if (!stats.isDirectory()) {
          errors.push('Local path must be a directory');
        }
      } catch (error) {
        warnings.push('Local path does not exist or is not accessible');
      }
    }

    // Data directory validation
    if (this.config.dataDir) {
      try {
        await fs.mkdir(this.config.dataDir, { recursive: true });
      } catch (error) {
        errors.push('Cannot create or access data directory');
      }
    }

    // Performance settings validation
    if (this.config.performance.maxConcurrent < 1) {
      warnings.push('Max concurrent operations should be at least 1');
      this.config.performance.maxConcurrent = 1;
    }

    if (this.config.performance.batchSize < 1) {
      warnings.push('Batch size should be at least 1');
      this.config.performance.batchSize = 1;
    }

    // Monitoring intervals validation
    if (this.config.monitoring.pollInterval < 10000) {
      warnings.push('Poll interval should be at least 10 seconds');
      this.config.monitoring.pollInterval = 10000;
    }

    if (this.config.monitoring.debounceDelay < 100) {
      warnings.push('Debounce delay should be at least 100ms');
      this.config.monitoring.debounceDelay = 100;
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      console.warn('Configuration warnings:', warnings.join(', '));
    }

    return { valid: true, errors, warnings };
  }

  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current === null || current === undefined || !current.hasOwnProperty(key)) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current;
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = this.config;
    
    for (const key of keys) {
      if (!current.hasOwnProperty(key) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
    this.notifyWatchers('change', { path, value });
  }

  update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      this.set(path, value);
    }
  }

  reset(section = null) {
    const defaultConfig = this.getDefaultConfig();
    
    if (section) {
      if (defaultConfig.hasOwnProperty(section)) {
        this.config[section] = defaultConfig[section];
        this.notifyWatchers('reset', { section });
      }
    } else {
      this.config = defaultConfig;
      this.notifyWatchers('reset', { section: 'all' });
    }
  }

  watch(callback) {
    this.watchers.push(callback);
    
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index > -1) {
        this.watchers.splice(index, 1);
      }
    };
  }

  notifyWatchers(event, data) {
    for (const watcher of this.watchers) {
      try {
        watcher(event, data);
      } catch (error) {
        console.error('Config watcher error:', error);
      }
    }
  }

  async createBackup() {
    const backupPath = this.configPath + '.backup.' + Date.now();
    
    try {
      const currentConfig = await fs.readFile(this.configPath, 'utf-8');
      await fs.writeFile(backupPath, currentConfig);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create config backup: ${error.message}`);
    }
  }

  async restoreFromBackup(backupPath) {
    try {
      const backupData = await fs.readFile(backupPath, 'utf-8');
      const backupConfig = JSON.parse(backupData);
      
      this.config = this.mergeConfig(this.getDefaultConfig(), backupConfig);
      await this.validate();
      await this.save();
      
      this.notifyWatchers('restore', { backupPath });
      return true;
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  async export() {
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      config: this.config
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async import(data) {
    try {
      const importData = JSON.parse(data);
      
      if (!importData.config) {
        throw new Error('Invalid import data: no config section found');
      }
      
      const backup = await this.createBackup();
      
      try {
        this.config = this.mergeConfig(this.getDefaultConfig(), importData.config);
        await this.validate();
        await this.save();
        
        this.notifyWatchers('import', { version: importData.version });
        return { success: true, backup };
        
      } catch (error) {
        // Restore from backup on validation failure
        await this.restoreFromBackup(backup);
        throw error;
      }
      
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }

  getSchema() {
    return {
      wikiJsUrl: { type: 'string', required: true, description: 'WikiJS base URL' },
      apiToken: { type: 'string', required: true, description: 'WikiJS API token', sensitive: true },
      locale: { type: 'string', default: 'en', description: 'Default locale' },
      localPath: { type: 'string', required: true, description: 'Local directory path' },
      dataDir: { type: 'string', required: true, description: 'Data directory path' },
      
      monitoring: {
        watchLocal: { type: 'boolean', default: true, description: 'Enable local file watching' },
        pollRemote: { type: 'boolean', default: true, description: 'Enable remote polling' },
        pollInterval: { type: 'number', default: 60000, min: 10000, description: 'Remote poll interval (ms)' },
        debounceDelay: { type: 'number', default: 1000, min: 100, description: 'Change debounce delay (ms)' }
      },
      
      conflicts: {
        autoResolve: { type: 'array', default: ['local_newer', 'remote_newer'], description: 'Auto-resolve conflict types' },
        requireManual: { type: 'array', default: ['both_changed', 'structural_conflict'], description: 'Require manual resolution' },
        backupOnResolve: { type: 'boolean', default: true, description: 'Create backups when resolving conflicts' },
        notifyUser: { type: 'boolean', default: true, description: 'Notify user of conflicts' }
      },
      
      performance: {
        batchSize: { type: 'number', default: 10, min: 1, description: 'Batch processing size' },
        maxConcurrent: { type: 'number', default: 3, min: 1, description: 'Maximum concurrent operations' },
        compressionLevel: { type: 'number', default: 6, min: 0, max: 9, description: 'Compression level' },
        deltaSyncThreshold: { type: 'number', default: 1024, min: 0, description: 'Delta sync threshold (bytes)' }
      }
    };
  }

  getSensitiveFields() {
    return [
      'apiToken',
      'security.encryptionKey',
      'notifications.email.password',
      'notifications.webhook.secret'
    ];
  }

  sanitizeForLogging() {
    const sanitized = JSON.parse(JSON.stringify(this.config));
    const sensitiveFields = this.getSensitiveFields();
    
    for (const field of sensitiveFields) {
      const keys = field.split('.');
      let current = sanitized;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (current && current[keys[i]]) {
          current = current[keys[i]];
        } else {
          break;
        }
      }
      
      if (current && current[keys[keys.length - 1]]) {
        current[keys[keys.length - 1]] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }
}

module.exports = ConfigManager;
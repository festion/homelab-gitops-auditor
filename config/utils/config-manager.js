const path = require('path');
const fs = require('fs').promises;
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const _ = require('lodash');

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../deployment-config.json');
    this.schemaPath = path.join(__dirname, '../deployment-config.schema.json');
    this.config = null;
    this.schema = null;
    this.watchers = [];
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async load(environment = 'production') {
    try {
      // Load base configuration
      const baseConfig = await this.loadFile(this.configPath);
      
      // Load environment-specific overrides
      const envPath = path.join(__dirname, `../environments/${environment}.json`);
      let envConfig = {};
      try {
        envConfig = await this.loadFile(envPath);
      } catch (error) {
        console.warn(`Environment config not found: ${envPath}`);
      }

      // Merge configurations
      this.config = _.merge({}, baseConfig, envConfig);

      // Resolve environment variables
      this.config = this.resolveEnvironmentVariables(this.config);

      // Validate configuration
      await this.validate();

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  async loadFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load file ${filePath}: ${error.message}`);
    }
  }

  async validate() {
    if (!this.schema) {
      this.schema = await this.loadFile(this.schemaPath);
    }

    const validate = this.ajv.compile(this.schema);
    const valid = validate(this.config);

    if (!valid) {
      const errors = validate.errors.map(err => 
        `${err.instancePath}: ${err.message}`
      ).join(', ');
      throw new Error(`Configuration validation failed: ${errors}`);
    }

    return true;
  }

  resolveEnvironmentVariables(config) {
    const configStr = JSON.stringify(config);
    const resolved = configStr.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        console.warn(`Environment variable ${varName} is not defined, using placeholder`);
        return match; // Keep placeholder if not defined
      }
      return value;
    });

    return JSON.parse(resolved);
  }

  get(path) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return _.get(this.config, path);
  }

  set(path, value) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    _.set(this.config, path, value);
    return this;
  }

  async reload(environment = 'production') {
    return await this.load(environment);
  }

  subscribe(path, callback) {
    this.watchers.push({ path, callback });
    return () => {
      this.watchers = this.watchers.filter(w => w.callback !== callback);
    };
  }

  static async loadConfig(environment = 'production') {
    const manager = new ConfigManager();
    return await manager.load(environment);
  }

  static validateConfig(config) {
    const manager = new ConfigManager();
    manager.config = manager.resolveEnvironmentVariables(config);
    return manager.validate();
  }

  getRequiredEnvironmentVariables() {
    const envVars = this.get('environment.variables') || {};
    return Object.entries(envVars)
      .filter(([_, config]) => config.required)
      .map(([name, config]) => ({ name, ...config }));
  }

  checkRequiredEnvironmentVariables() {
    const required = this.getRequiredEnvironmentVariables();
    const missing = required.filter(({ name }) => !process.env[name]);
    
    if (missing.length > 0) {
      const missingNames = missing.map(v => v.name).join(', ');
      throw new Error(`Missing required environment variables: ${missingNames}`);
    }
    
    return true;
  }

  async save(configPath = null) {
    const outputPath = configPath || this.configPath;
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(outputPath, content, 'utf8');
    return outputPath;
  }
}

module.exports = ConfigManager;
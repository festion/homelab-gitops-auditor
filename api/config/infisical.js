const { InfisicalSDK } = require('@infisical/sdk');

class InfisicalManager {
  constructor() {
    this.client = null;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.initialized = false;
    this.serviceToken = null;
  }

  /**
   * Initialize Infisical client with service token
   * Token should be provided via environment variable INFISICAL_TOKEN
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    const token = process.env.INFISICAL_TOKEN;

    if (!token) {
      console.warn('⚠️  INFISICAL_TOKEN not set - secrets management disabled');
      return;
    }

    try {
      this.serviceToken = token;
      this.client = new InfisicalSDK({
        auth: {
          serviceToken: this.serviceToken
        },
        siteUrl: process.env.INFISICAL_SITE_URL || 'https://infisical.internal.lakehouse.wtf',
        cacheTtl: 60 // Cache for 60 seconds
      });

      // Authenticate the client
      await this.client.authenticate();

      this.initialized = true;
      console.log('✅ Infisical connected successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Infisical:', error.message);
      console.error('   Stack:', error.stack);
      // Fallback to environment variables if Infisical fails
      this.client = null;
    }
  }

  /**
   * Get a secret from Infisical with caching
   * Falls back to environment variable if Infisical is unavailable
   *
   * @param {string} secretName - Name of the secret
   * @param {string} environment - Environment (dev, staging, prod)
   * @param {string} fallbackEnvVar - Environment variable to use as fallback
   * @returns {Promise<string|null>} Secret value or null
   */
  async getSecret(secretName, environment = 'dev', fallbackEnvVar = null) {
    // Check cache first
    const cacheKey = `${environment}:${secretName}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    // Try Infisical if initialized
    if (this.client && this.initialized) {
      try {
        const secret = await this.client.getSecret({
          secretName,
          environment,
          type: 'shared'
        });

        const value = secret.secretValue;

        // Cache the value
        this.cache.set(cacheKey, {
          value,
          timestamp: Date.now()
        });

        return value;
      } catch (error) {
        console.warn(`⚠️  Failed to fetch secret "${secretName}" from Infisical:`, error.message);
        // Fall through to environment variable fallback
      }
    }

    // Fallback to environment variable
    if (fallbackEnvVar && process.env[fallbackEnvVar]) {
      return process.env[fallbackEnvVar];
    }

    console.warn(`⚠️  Secret "${secretName}" not found in Infisical or environment variables`);
    return null;
  }

  /**
   * Get multiple secrets at once
   *
   * @param {Array<{name: string, envVar: string}>} secrets - Array of secret configurations
   * @param {string} environment - Environment
   * @returns {Promise<Object>} Object with secret names as keys
   */
  async getSecrets(secrets, environment = 'dev') {
    const result = {};

    for (const { name, envVar } of secrets) {
      result[name] = await this.getSecret(name, environment, envVar);
    }

    return result;
  }

  /**
   * Set a secret in Infisical
   *
   * @param {string} secretName - Name of the secret
   * @param {string} secretValue - Value to set
   * @param {string} environment - Environment
   * @returns {Promise<boolean>} Success status
   */
  async setSecret(secretName, secretValue, environment = 'dev') {
    if (!this.client || !this.initialized) {
      console.error('❌ Infisical not initialized - cannot set secret');
      return false;
    }

    try {
      await this.client.createSecret({
        secretName,
        secretValue,
        environment,
        type: 'shared'
      });

      // Invalidate cache for this secret
      const cacheKey = `${environment}:${secretName}`;
      this.cache.delete(cacheKey);

      console.log(`✅ Secret "${secretName}" set successfully in environment "${environment}"`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to set secret "${secretName}":`, error.message);
      return false;
    }
  }

  /**
   * Clear the secrets cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️  Infisical cache cleared');
  }
}

// Export singleton instance
const infisicalManager = new InfisicalManager();

module.exports = infisicalManager;

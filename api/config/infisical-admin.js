const axios = require('axios');

/**
 * Infisical Admin Manager
 *
 * Manages infrastructure/DevOps secrets from the homelab-admin Infisical project
 * Separate from application secrets in homelab-gitops
 *
 * Usage:
 *   const infisicalAdmin = require('./config/infisical-admin');
 *   await infisicalAdmin.initialize();
 *   const proxmoxPassword = await infisicalAdmin.getSecret('PROXMOX_PASSWORD');
 */

class InfisicalAdminManager {
  constructor() {
    this.token = null;
    this.siteUrl = null;
    this.environment = 'prod';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.initialized = false;
  }

  /**
   * Initialize the Infisical admin client
   * Uses INFISICAL_ADMIN_TOKEN environment variable
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.token = process.env.INFISICAL_ADMIN_TOKEN;
    this.siteUrl = process.env.INFISICAL_SITE_URL || 'https://infisical.internal.lakehouse.wtf';
    this.environment = process.env.INFISICAL_ADMIN_ENV || 'prod';

    if (!this.token) {
      console.warn('⚠️  INFISICAL_ADMIN_TOKEN not set - admin secrets management disabled');
      return;
    }

    try {
      // Test connection
      const response = await axios.get(`${this.siteUrl}/api/status`);
      if (response.status === 200) {
        this.initialized = true;
        console.log('✅ Infisical Admin connected successfully');
      }
    } catch (error) {
      console.error('❌ Failed to connect to Infisical Admin:', error.message);
    }
  }

  /**
   * Get a secret from homelab-admin project
   *
   * @param {string} secretName - Name of the secret
   * @param {string} environment - Environment (dev, staging, prod)
   * @param {string} fallbackEnvVar - Environment variable to use as fallback
   * @returns {Promise<string|null>} Secret value or null
   */
  async getSecret(secretName, environment = null, fallbackEnvVar = null) {
    const env = environment || this.environment;
    const cacheKey = `${env}:${secretName}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    // Try Infisical if initialized
    if (this.initialized && this.token) {
      try {
        const response = await axios.get(
          `${this.siteUrl}/api/v3/secrets/raw/${secretName}`,
          {
            headers: {
              'Authorization': `Bearer ${this.token}`
            },
            params: {
              environment: env
            }
          }
        );

        const value = response.data.secret.secretValue;

        // Cache the value
        this.cache.set(cacheKey, {
          value,
          timestamp: Date.now()
        });

        return value;
      } catch (error) {
        console.warn(`⚠️  Failed to fetch admin secret "${secretName}":`, error.response?.data?.message || error.message);
        // Fall through to fallback
      }
    }

    // Fallback to environment variable
    if (fallbackEnvVar && process.env[fallbackEnvVar]) {
      return process.env[fallbackEnvVar];
    }

    console.warn(`⚠️  Admin secret "${secretName}" not found in Infisical or environment variables`);
    return null;
  }

  /**
   * Get multiple secrets at once
   *
   * @param {Array<{name: string, envVar: string}>} secrets - Array of secret configurations
   * @param {string} environment - Environment
   * @returns {Promise<Object>} Object with secret names as keys
   */
  async getSecrets(secrets, environment = null) {
    const result = {};

    for (const { name, envVar } of secrets) {
      result[name] = await this.getSecret(name, environment, envVar);
    }

    return result;
  }

  /**
   * Set a secret in homelab-admin project
   *
   * @param {string} secretName - Name of the secret
   * @param {string} secretValue - Value to set
   * @param {string} environment - Environment
   * @returns {Promise<boolean>} Success status
   */
  async setSecret(secretName, secretValue, environment = null) {
    const env = environment || this.environment;

    if (!this.initialized || !this.token) {
      console.error('❌ Infisical Admin not initialized - cannot set secret');
      return false;
    }

    try {
      await axios.post(
        `${this.siteUrl}/api/v3/secrets/raw/${secretName}`,
        {
          secretName,
          secretValue,
          environment: env,
          type: 'shared'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Invalidate cache for this secret
      const cacheKey = `${env}:${secretName}`;
      this.cache.delete(cacheKey);

      console.log(`✅ Admin secret "${secretName}" set successfully in environment "${env}"`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to set admin secret "${secretName}":`, error.response?.data?.message || error.message);
      return false;
    }
  }

  /**
   * List all secrets in homelab-admin project
   *
   * @param {string} environment - Environment
   * @returns {Promise<Array<string>>} Array of secret names
   */
  async listSecrets(environment = null) {
    const env = environment || this.environment;

    if (!this.initialized || !this.token) {
      console.error('❌ Infisical Admin not initialized - cannot list secrets');
      return [];
    }

    try {
      const response = await axios.get(
        `${this.siteUrl}/api/v3/secrets/raw`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          },
          params: {
            environment: env
          }
        }
      );

      return response.data.secrets.map(s => s.secretKey);
    } catch (error) {
      console.error('❌ Failed to list admin secrets:', error.response?.data?.message || error.message);
      return [];
    }
  }

  /**
   * Get Proxmox credentials as an object
   *
   * @returns {Promise<Object>} Proxmox credentials
   */
  async getProxmoxCredentials() {
    const credentials = await this.getSecrets([
      { name: 'PROXMOX_HOST', envVar: 'PROXMOX_HOST' },
      { name: 'PROXMOX_USERNAME', envVar: 'PROXMOX_USERNAME' },
      { name: 'PROXMOX_PASSWORD', envVar: 'PROXMOX_PASSWORD' },
      { name: 'PROXMOX_API_TOKEN', envVar: 'PROXMOX_API_TOKEN' }
    ]);

    return {
      host: credentials.PROXMOX_HOST,
      username: credentials.PROXMOX_USERNAME,
      password: credentials.PROXMOX_PASSWORD,
      apiToken: credentials.PROXMOX_API_TOKEN
    };
  }

  /**
   * Get AdGuard credentials as an object
   *
   * @returns {Promise<Object>} AdGuard credentials
   */
  async getAdGuardCredentials() {
    const credentials = await this.getSecrets([
      { name: 'ADGUARD_PRIMARY_URL', envVar: 'ADGUARD_PRIMARY_URL' },
      { name: 'ADGUARD_SECONDARY_URL', envVar: 'ADGUARD_SECONDARY_URL' },
      { name: 'ADGUARD_USERNAME', envVar: 'ADGUARD_USERNAME' },
      { name: 'ADGUARD_PASSWORD', envVar: 'ADGUARD_PASSWORD' }
    ]);

    return {
      primaryUrl: credentials.ADGUARD_PRIMARY_URL || 'http://192.168.1.253:80',
      secondaryUrl: credentials.ADGUARD_SECONDARY_URL || 'http://192.168.1.224:80',
      username: credentials.ADGUARD_USERNAME,
      password: credentials.ADGUARD_PASSWORD
    };
  }

  /**
   * Get KEA DHCP configuration
   *
   * @returns {Promise<Object>} KEA DHCP configuration
   */
  async getKeaDhcpConfig() {
    const config = await this.getSecrets([
      { name: 'KEA_PRIMARY_HOST', envVar: 'KEA_PRIMARY_HOST' },
      { name: 'KEA_SECONDARY_HOST', envVar: 'KEA_SECONDARY_HOST' },
      { name: 'KEA_API_PORT', envVar: 'KEA_API_PORT' },
      { name: 'KEA_CONFIG_PATH', envVar: 'KEA_CONFIG_PATH' }
    ]);

    return {
      primaryHost: config.KEA_PRIMARY_HOST || '192.168.1.133',
      secondaryHost: config.KEA_SECONDARY_HOST || '192.168.1.134',
      apiPort: config.KEA_API_PORT || '8000',
      configPath: config.KEA_CONFIG_PATH || '/etc/kea/kea-dhcp4.conf'
    };
  }

  /**
   * Clear the secrets cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️  Infisical Admin cache cleared');
  }
}

// Export singleton instance
const infisicalAdminManager = new InfisicalAdminManager();

module.exports = infisicalAdminManager;

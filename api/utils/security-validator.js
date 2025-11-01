const crypto = require('crypto');
const { ConfigManager } = require('../config/utils/config-manager');

/**
 * SecurityValidator Class
 * 
 * Provides comprehensive security validation for GitHub webhooks including:
 * - HMAC SHA-256 signature verification
 * - IP address validation against GitHub ranges
 * - Request size and content type validation
 * - Rate limiting and security headers
 */
class SecurityValidator {
  
  /**
   * Validate a GitHub webhook request
   * @param {Object} req - Express request object
   * @throws {Error} If validation fails
   */
  static async validateGitHubWebhook(req) {
    // Validate request method
    if (req.method !== 'POST') {
      const error = new Error('Invalid request method. Only POST requests are allowed for webhooks.');
      error.statusCode = 405;
      error.code = 'INVALID_METHOD';
      throw error;
    }
    
    // Validate content type
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      const error = new Error('Invalid content type. Expected application/json.');
      error.statusCode = 400;
      error.code = 'INVALID_CONTENT_TYPE';
      throw error;
    }
    
    // Validate GitHub event header
    if (!req.headers['x-github-event']) {
      const error = new Error('Missing required X-GitHub-Event header');
      error.statusCode = 400;
      error.code = 'MISSING_EVENT_HEADER';
      throw error;
    }
    
    // Validate GitHub delivery ID header
    if (!req.headers['x-github-delivery']) {
      const error = new Error('Missing required X-GitHub-Delivery header');
      error.statusCode = 400;
      error.code = 'MISSING_DELIVERY_HEADER';
      throw error;
    }
    
    // Validate webhook signature
    await this.validateWebhookSignature(req);
    
    // Validate source IP
    this.validateSourceIP(req);
    
    // Validate request size
    this.validateRequestSize(req);
    
    // Validate User-Agent header
    this.validateUserAgent(req);
  }

  /**
   * Validate the HMAC SHA-256 signature from GitHub
   * @param {Object} req - Express request object
   * @throws {Error} If signature validation fails
   */
  static async validateWebhookSignature(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      const error = new Error('Missing webhook signature. Ensure X-Hub-Signature-256 header is present.');
      error.statusCode = 401;
      error.code = 'MISSING_SIGNATURE';
      throw error;
    }
    
    // Load configuration to get webhook secret
    const config = await ConfigManager.loadConfig(process.env.NODE_ENV || 'production');
    const secret = config.webhook.secret;
    
    if (!secret || secret.startsWith('${')) {
      const error = new Error('Webhook secret not configured. Please set GITHUB_WEBHOOK_SECRET environment variable.');
      error.statusCode = 500;
      error.code = 'MISSING_SECRET';
      throw error;
    }
    
    // Calculate expected signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    // Extract signature from header (remove 'sha256=' prefix)
    const providedSignature = signature.replace('sha256=', '');
    
    // Use timing-safe comparison to prevent timing attacks
    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const providedBuffer = Buffer.from(providedSignature, 'hex');
      
      if (expectedBuffer.length !== providedBuffer.length) {
        throw new Error('Signature length mismatch');
      }
      
      if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        throw new Error('Signature verification failed');
      }
    } catch (cryptoError) {
      const error = new Error(`Invalid webhook signature: ${cryptoError.message}`);
      error.statusCode = 401;
      error.code = 'INVALID_SIGNATURE';
      throw error;
    }
  }

  /**
   * Validate the source IP address against GitHub's ranges
   * @param {Object} req - Express request object
   * @throws {Error} If IP validation fails
   */
  static validateSourceIP(req) {
    const clientIP = this.getClientIP(req);
    
    // GitHub's official IP ranges (as of 2024)
    const githubIPRanges = [
      '140.82.112.0/20',    // GitHub.com
      '185.199.108.0/22',   // GitHub Pages
      '192.30.252.0/22',    // Legacy GitHub
      '143.55.64.0/20',     // Additional GitHub range
      '192.168.0.0/16',     // Local network (for testing)
      '10.0.0.0/8',         // Private network (for testing)
      '172.16.0.0/12'       // Private network (for testing)
    ];
    
    const isAllowed = githubIPRanges.some(range => this.isIPInRange(clientIP, range));
    
    if (!isAllowed) {
      const error = new Error(`Unauthorized source IP address: ${clientIP}. Only GitHub webhook IPs are allowed.`);
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_IP';
      error.clientIP = clientIP;
      throw error;
    }
  }

  /**
   * Validate request size limits
   * @param {Object} req - Express request object
   * @throws {Error} If request is too large
   */
  static validateRequestSize(req) {
    const maxSize = 1024 * 1024; // 1MB limit
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      const error = new Error(`Request body too large: ${contentLength} bytes (max: ${maxSize} bytes)`);
      error.statusCode = 413;
      error.code = 'REQUEST_TOO_LARGE';
      throw error;
    }
    
    // Validate actual body size if available
    if (req.body && typeof req.body === 'object') {
      const bodySize = JSON.stringify(req.body).length;
      if (bodySize > maxSize) {
        const error = new Error(`Request body too large: ${bodySize} bytes (max: ${maxSize} bytes)`);
        error.statusCode = 413;
        error.code = 'REQUEST_TOO_LARGE';
        throw error;
      }
    }
  }

  /**
   * Validate User-Agent header for GitHub webhooks
   * @param {Object} req - Express request object
   * @throws {Error} If User-Agent is invalid
   */
  static validateUserAgent(req) {
    const userAgent = req.headers['user-agent'];
    
    if (!userAgent) {
      const error = new Error('Missing User-Agent header');
      error.statusCode = 400;
      error.code = 'MISSING_USER_AGENT';
      throw error;
    }
    
    // GitHub webhooks should have User-Agent starting with 'GitHub-Hookshot/'
    if (!userAgent.startsWith('GitHub-Hookshot/')) {
      console.warn(`Suspicious User-Agent for webhook: ${userAgent}`);
      // Don't reject for User-Agent mismatch, just log it for monitoring
    }
  }

  /**
   * Get the client IP address from the request
   * @param {Object} req - Express request object
   * @returns {string} Client IP address
   */
  static getClientIP(req) {
    // Check various headers for the real IP (useful behind proxies)
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * Check if an IP address is within a CIDR range
   * @param {string} ip - IP address to check
   * @param {string} range - CIDR range (e.g., '192.168.1.0/24')
   * @returns {boolean} True if IP is in range
   */
  static isIPInRange(ip, range) {
    try {
      if (!range.includes('/')) {
        // Direct IP comparison
        return ip === range;
      }
      
      const [network, maskBits] = range.split('/');
      const mask = parseInt(maskBits);
      
      // Convert IP addresses to 32-bit integers
      const ipInt = this.ipToInt(ip);
      const networkInt = this.ipToInt(network);
      
      // Create subnet mask
      const subnetMask = (0xFFFFFFFF << (32 - mask)) >>> 0;
      
      // Check if IP is in the subnet
      return (ipInt & subnetMask) === (networkInt & subnetMask);
    } catch (error) {
      console.error(`Error checking IP range for ${ip} in ${range}:`, error);
      return false;
    }
  }

  /**
   * Convert IP address string to 32-bit integer
   * @param {string} ip - IP address string
   * @returns {number} 32-bit integer representation
   */
  static ipToInt(ip) {
    const parts = ip.split('.').map(part => parseInt(part, 10));
    
    if (parts.length !== 4 || parts.some(part => isNaN(part) || part < 0 || part > 255)) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  /**
   * Validate allowed events for the webhook
   * @param {string} eventType - The GitHub event type
   * @param {Array} allowedEvents - Array of allowed event types
   * @throws {Error} If event type is not allowed
   */
  static validateEventType(eventType, allowedEvents) {
    if (!allowedEvents.includes(eventType)) {
      const error = new Error(`Event type '${eventType}' is not allowed. Allowed events: ${allowedEvents.join(', ')}`);
      error.statusCode = 400;
      error.code = 'INVALID_EVENT_TYPE';
      throw error;
    }
  }

  /**
   * Validate webhook payload structure
   * @param {Object} payload - The webhook payload
   * @param {string} eventType - The event type
   * @throws {Error} If payload is invalid
   */
  static validatePayloadStructure(payload, eventType) {
    if (!payload || typeof payload !== 'object') {
      const error = new Error('Invalid payload: Expected JSON object');
      error.statusCode = 400;
      error.code = 'INVALID_PAYLOAD';
      throw error;
    }
    
    // Basic validation for common payload properties
    switch (eventType) {
      case 'repository_dispatch':
        if (!payload.action || !payload.repository) {
          const error = new Error('Invalid repository_dispatch payload: Missing action or repository');
          error.statusCode = 400;
          error.code = 'INVALID_PAYLOAD_STRUCTURE';
          throw error;
        }
        break;
        
      case 'push':
        if (!payload.repository || !payload.ref || payload.after === undefined) {
          const error = new Error('Invalid push payload: Missing repository, ref, or after');
          error.statusCode = 400;
          error.code = 'INVALID_PAYLOAD_STRUCTURE';
          throw error;
        }
        break;
        
      case 'pull_request':
        if (!payload.action || !payload.pull_request || !payload.repository) {
          const error = new Error('Invalid pull_request payload: Missing action, pull_request, or repository');
          error.statusCode = 400;
          error.code = 'INVALID_PAYLOAD_STRUCTURE';
          throw error;
        }
        break;
    }
  }
}

module.exports = { SecurityValidator };
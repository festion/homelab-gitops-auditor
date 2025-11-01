const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

class WebhookConfigService {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
    this.webhookUrl = process.env.WEBHOOK_URL || 'https://your-domain.com/api/webhooks/github';
  }

  async setupRepositoryWebhooks(owner, repo) {
    try {
      console.log(`Setting up webhook for ${owner}/${repo}`);
      
      // Check if webhook already exists
      const webhooks = await this.octokit.repos.listWebhooks({
        owner,
        repo
      });

      const existingWebhook = webhooks.data.find(
        hook => hook.config.url === this.webhookUrl
      );

      if (existingWebhook) {
        console.log(`Webhook already exists for ${owner}/${repo}, updating...`);
        
        // Update existing webhook with latest configuration
        const updatedWebhook = await this.octokit.repos.updateWebhook({
          owner,
          repo,
          hook_id: existingWebhook.id,
          config: {
            url: this.webhookUrl,
            content_type: 'json',
            secret: this.webhookSecret,
            insecure_ssl: '0'
          },
          events: this.getWebhookEvents(),
          active: true
        });
        
        return updatedWebhook.data;
      }

      // Create new webhook
      console.log(`Creating new webhook for ${owner}/${repo}`);
      const webhook = await this.octokit.repos.createWebhook({
        owner,
        repo,
        config: {
          url: this.webhookUrl,
          content_type: 'json',
          secret: this.webhookSecret,
          insecure_ssl: '0'
        },
        events: this.getWebhookEvents(),
        active: true
      });

      console.log(`✅ Webhook created successfully for ${owner}/${repo}`);
      return webhook.data;
    } catch (error) {
      console.error(`Failed to setup webhook for ${owner}/${repo}:`, error.message);
      
      // Handle specific error cases
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or no access`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to create webhook for ${owner}/${repo}`);
      } else if (error.status === 422) {
        throw new Error(`Webhook validation failed for ${owner}/${repo}: ${error.message}`);
      }
      
      throw error;
    }
  }

  async setupOrganizationWebhook(org) {
    try {
      console.log(`Setting up organization webhook for ${org}`);
      
      // Check existing org webhooks
      const webhooks = await this.octokit.orgs.listWebhooks({
        org
      });

      const existingWebhook = webhooks.data.find(
        hook => hook.config.url === this.webhookUrl
      );

      if (existingWebhook) {
        console.log(`Organization webhook already exists for ${org}`);
        return existingWebhook;
      }

      const webhook = await this.octokit.orgs.createWebhook({
        org,
        config: {
          url: this.webhookUrl,
          content_type: 'json',
          secret: this.webhookSecret,
          insecure_ssl: '0'
        },
        events: this.getOrganizationWebhookEvents()
      });

      console.log(`✅ Organization webhook created successfully for ${org}`);
      return webhook.data;
    } catch (error) {
      console.error(`Failed to setup org webhook for ${org}:`, error.message);
      throw error;
    }
  }

  async removeRepositoryWebhook(owner, repo) {
    try {
      const webhooks = await this.octokit.repos.listWebhooks({
        owner,
        repo
      });

      const ourWebhook = webhooks.data.find(
        hook => hook.config.url === this.webhookUrl
      );

      if (ourWebhook) {
        await this.octokit.repos.deleteWebhook({
          owner,
          repo,
          hook_id: ourWebhook.id
        });
        
        console.log(`✅ Webhook removed for ${owner}/${repo}`);
        return true;
      }

      console.log(`No webhook found for ${owner}/${repo}`);
      return false;
    } catch (error) {
      console.error(`Failed to remove webhook for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async validateWebhookDelivery(webhookId, deliveryId) {
    try {
      const delivery = await this.octokit.repos.getWebhookDelivery({
        hook_id: webhookId,
        delivery_id: deliveryId
      });

      return {
        success: true,
        delivery: delivery.data,
        status: delivery.data.status_code,
        duration: delivery.data.duration
      };
    } catch (error) {
      console.error('Failed to validate webhook delivery:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getWebhookDeliveries(owner, repo, webhookId, limit = 50) {
    try {
      const deliveries = await this.octokit.repos.listWebhookDeliveries({
        owner,
        repo,
        hook_id: webhookId,
        per_page: limit
      });

      return deliveries.data.map(delivery => ({
        id: delivery.id,
        guid: delivery.guid,
        deliveredAt: delivery.delivered_at,
        redelivery: delivery.redelivery,
        duration: delivery.duration,
        status: delivery.status,
        statusCode: delivery.status_code,
        event: delivery.event,
        action: delivery.action
      }));
    } catch (error) {
      console.error('Failed to get webhook deliveries:', error.message);
      return [];
    }
  }

  async testWebhookDelivery(owner, repo, event = 'ping') {
    try {
      const webhooks = await this.octokit.repos.listWebhooks({
        owner,
        repo
      });

      const ourWebhook = webhooks.data.find(
        hook => hook.config.url === this.webhookUrl
      );

      if (!ourWebhook) {
        throw new Error(`No webhook found for ${owner}/${repo}`);
      }

      // Ping the webhook
      const pingResult = await this.octokit.repos.pingWebhook({
        owner,
        repo,
        hook_id: ourWebhook.id
      });

      return {
        success: true,
        webhookId: ourWebhook.id,
        pingResult: pingResult.status === 204 ? 'success' : 'failed'
      };
    } catch (error) {
      console.error('Failed to test webhook delivery:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getWebhookEvents() {
    return [
      'push',                    // Code pushes
      'pull_request',           // PR opened, closed, synchronized
      'pull_request_review',    // PR reviews
      'workflow_run',           // GitHub Actions workflow runs
      'workflow_job',           // Individual job status
      'issues',                 // Issue events
      'issue_comment',          // Issue comments
      'create',                 // Branch/tag creation
      'delete',                 // Branch/tag deletion
      'release',                // Release events
      'deployment',             // Deployment events
      'deployment_status',      // Deployment status changes
      'check_run',              // Check run events
      'check_suite',            // Check suite events
      'status',                 // Commit status events
      'security_advisory',      // Security advisory events
      'dependabot_alert',       // Dependabot alerts
      'code_scanning_alert',    // Code scanning alerts
      'secret_scanning_alert'   // Secret scanning alerts
    ];
  }

  getOrganizationWebhookEvents() {
    return [
      'repository',            // Repository created, deleted, etc.
      'member',               // Member added, removed
      'membership',           // Team membership changes
      'team',                 // Team events
      'organization',         // Organization events
      'public',               // Repository made public
      'meta'                  // Webhook modified
    ];
  }

  async getRepositoryWebhookStatus(owner, repo) {
    try {
      const webhooks = await this.octokit.repos.listWebhooks({
        owner,
        repo
      });

      const ourWebhook = webhooks.data.find(
        hook => hook.config.url === this.webhookUrl
      );

      if (!ourWebhook) {
        return {
          configured: false,
          webhook: null
        };
      }

      // Get recent deliveries
      const recentDeliveries = await this.getWebhookDeliveries(
        owner, 
        repo, 
        ourWebhook.id, 
        10
      );

      const successfulDeliveries = recentDeliveries.filter(d => d.statusCode === 200);
      const failedDeliveries = recentDeliveries.filter(d => d.statusCode !== 200);

      return {
        configured: true,
        webhook: {
          id: ourWebhook.id,
          active: ourWebhook.active,
          events: ourWebhook.events,
          createdAt: ourWebhook.created_at,
          updatedAt: ourWebhook.updated_at,
          url: ourWebhook.config.url,
          contentType: ourWebhook.config.content_type,
          insecureSsl: ourWebhook.config.insecure_ssl
        },
        deliveries: {
          total: recentDeliveries.length,
          successful: successfulDeliveries.length,
          failed: failedDeliveries.length,
          recent: recentDeliveries.slice(0, 5)
        }
      };
    } catch (error) {
      console.error(`Failed to get webhook status for ${owner}/${repo}:`, error.message);
      return {
        configured: false,
        webhook: null,
        error: error.message
      };
    }
  }

  async bulkSetupWebhooks(repositories) {
    const results = [];
    const batchSize = 5; // GitHub API rate limiting
    
    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (repo) => {
        try {
          const [owner, repoName] = repo.split('/');
          const webhook = await this.setupRepositoryWebhooks(owner, repoName);
          
          return {
            repository: repo,
            success: true,
            webhook: {
              id: webhook.id,
              active: webhook.active,
              events: webhook.events.length
            }
          };
        } catch (error) {
          return {
            repository: repo,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + batchSize < repositories.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`Webhook bulk setup complete: ${successful.length} successful, ${failed.length} failed`);

    return {
      total: repositories.length,
      successful: successful.length,
      failed: failed.length,
      results
    };
  }

  generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  verifyWebhookSignature(payload, signature, secret = this.webhookSecret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const digest = 'sha256=' + hmac.digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }
}

module.exports = WebhookConfigService;
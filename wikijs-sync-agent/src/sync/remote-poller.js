const EventEmitter = require('events');
const axios = require('axios');
const crypto = require('crypto');

class RemotePoller extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.apiClient = this.createApiClient();
    this.lastPollData = new Map();
    this.isPolling = false;
  }

  createApiClient() {
    return axios.create({
      baseURL: this.config.wikiJsUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async checkForChanges() {
    if (this.isPolling) {
      return [];
    }

    this.isPolling = true;
    
    try {
      const changes = [];
      const pages = await this.fetchAllPages();
      
      for (const page of pages) {
        const change = await this.detectPageChange(page);
        if (change) {
          changes.push(change);
        }
      }
      
      return changes;
      
    } catch (error) {
      this.emit('error', { type: 'polling_error', error });
      throw error;
    } finally {
      this.isPolling = false;
    }
  }

  async fetchAllPages() {
    try {
      const query = `
        query {
          pages {
            list {
              id
              path
              title
              description
              isPublished
              isPrivate
              content
              contentType
              createdAt
              updatedAt
              hash
              tags {
                tag
              }
              author {
                name
                email
              }
              locale
            }
          }
        }
      `;
      
      const response = await this.apiClient.post('/graphql', {
        query
      });
      
      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }
      
      return response.data.data.pages.list || [];
      
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Authentication failed - check WikiJS API token');
      }
      throw error;
    }
  }

  async detectPageChange(page) {
    const pageKey = `page:${page.id}`;
    const lastData = this.lastPollData.get(pageKey);
    
    const currentHash = this.calculatePageHash(page);
    const currentModified = new Date(page.updatedAt);
    
    if (!lastData) {
      this.lastPollData.set(pageKey, {
        hash: currentHash,
        lastModified: currentModified,
        lastSeen: new Date()
      });
      
      return {
        type: 'discovered',
        pageId: page.id,
        path: page.path,
        title: page.title,
        hash: currentHash,
        lastModified: currentModified,
        content: page.content,
        metadata: this.extractMetadata(page)
      };
    }
    
    if (currentHash !== lastData.hash || 
        currentModified > lastData.lastModified) {
      
      const change = {
        type: 'updated',
        pageId: page.id,
        path: page.path,
        title: page.title,
        hash: currentHash,
        oldHash: lastData.hash,
        lastModified: currentModified,
        previousModified: lastData.lastModified,
        content: page.content,
        metadata: this.extractMetadata(page)
      };
      
      this.lastPollData.set(pageKey, {
        hash: currentHash,
        lastModified: currentModified,
        lastSeen: new Date()
      });
      
      return change;
    }
    
    this.lastPollData.get(pageKey).lastSeen = new Date();
    return null;
  }

  calculatePageHash(page) {
    const hashData = {
      content: page.content || '',
      title: page.title || '',
      description: page.description || '',
      path: page.path || '',
      tags: (page.tags || []).map(t => t.tag).sort(),
      isPublished: page.isPublished,
      isPrivate: page.isPrivate,
      locale: page.locale || 'en'
    };
    
    const hashString = JSON.stringify(hashData);
    return crypto.createHash('sha256').update(hashString).digest('hex');
  }

  extractMetadata(page) {
    return {
      title: page.title,
      description: page.description,
      isPublished: page.isPublished,
      isPrivate: page.isPrivate,
      contentType: page.contentType,
      locale: page.locale,
      tags: (page.tags || []).map(t => t.tag),
      author: page.author ? {
        name: page.author.name,
        email: page.author.email
      } : null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt
    };
  }

  async getPageContent(pageId) {
    try {
      const query = `
        query($id: Int!) {
          pages {
            single(id: $id) {
              id
              path
              title
              description
              content
              contentType
              isPublished
              isPrivate
              updatedAt
              hash
              tags {
                tag
              }
              author {
                name
                email
              }
              locale
            }
          }
        }
      `;
      
      const response = await this.apiClient.post('/graphql', {
        query,
        variables: { id: parseInt(pageId) }
      });
      
      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }
      
      return response.data.data.pages.single;
      
    } catch (error) {
      this.emit('error', { type: 'page_fetch_error', pageId, error });
      throw error;
    }
  }

  async getPageByPath(pagePath) {
    try {
      const query = `
        query($path: String!, $locale: String!) {
          pages {
            single(path: $path, locale: $locale) {
              id
              path
              title
              description
              content
              contentType
              isPublished
              isPrivate
              updatedAt
              hash
              tags {
                tag
              }
              author {
                name
                email
              }
              locale
            }
          }
        }
      `;
      
      const response = await this.apiClient.post('/graphql', {
        query,
        variables: { 
          path: pagePath,
          locale: this.config.locale || 'en'
        }
      });
      
      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }
      
      return response.data.data.pages.single;
      
    } catch (error) {
      this.emit('error', { type: 'page_fetch_by_path_error', pagePath, error });
      throw error;
    }
  }

  async detectDeletedPages() {
    const currentPageIds = new Set();
    
    try {
      const pages = await this.fetchAllPages();
      pages.forEach(page => currentPageIds.add(`page:${page.id}`));
      
      const deletedPages = [];
      
      for (const [pageKey, data] of this.lastPollData) {
        if (pageKey.startsWith('page:') && !currentPageIds.has(pageKey)) {
          const daysSinceLastSeen = (new Date() - data.lastSeen) / (1000 * 60 * 60 * 24);
          
          if (daysSinceLastSeen > 1) {
            const pageId = pageKey.replace('page:', '');
            deletedPages.push({
              type: 'deleted',
              pageId,
              lastSeen: data.lastSeen,
              hash: data.hash
            });
            
            this.lastPollData.delete(pageKey);
          }
        }
      }
      
      return deletedPages;
      
    } catch (error) {
      this.emit('error', { type: 'deleted_pages_detection_error', error });
      return [];
    }
  }

  async searchPages(query, options = {}) {
    try {
      const searchQuery = `
        query($query: String!, $path: String, $locale: String!) {
          pages {
            search(query: $query, path: $path, locale: $locale) {
              results {
                id
                title
                description
                path
                locale
              }
              totalHits
            }
          }
        }
      `;
      
      const response = await this.apiClient.post('/graphql', {
        query: searchQuery,
        variables: {
          query,
          path: options.path || '',
          locale: options.locale || this.config.locale || 'en'
        }
      });
      
      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }
      
      return response.data.data.pages.search;
      
    } catch (error) {
      this.emit('error', { type: 'search_error', query, error });
      throw error;
    }
  }

  async testConnection() {
    try {
      const response = await this.apiClient.post('/graphql', {
        query: '{ system { info { currentVersion } } }'
      });
      
      if (response.data.errors) {
        throw new Error(`Connection test failed: ${JSON.stringify(response.data.errors)}`);
      }
      
      return {
        connected: true,
        version: response.data.data.system.info.currentVersion
      };
      
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  getPollingStats() {
    return {
      totalPages: Array.from(this.lastPollData.keys()).filter(k => k.startsWith('page:')).length,
      isPolling: this.isPolling,
      lastPollTime: this.lastPollTime,
      averagePageSize: this.calculateAveragePageSize()
    };
  }

  calculateAveragePageSize() {
    let totalSize = 0;
    let count = 0;
    
    for (const [key, data] of this.lastPollData) {
      if (key.startsWith('page:') && data.contentSize) {
        totalSize += data.contentSize;
        count++;
      }
    }
    
    return count > 0 ? Math.round(totalSize / count) : 0;
  }

  clearPollingData() {
    this.lastPollData.clear();
  }
}

module.exports = RemotePoller;
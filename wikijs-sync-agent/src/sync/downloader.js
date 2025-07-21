const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

class Downloader {
  constructor(config) {
    this.config = config;
    this.apiClient = this.createApiClient();
  }

  createApiClient() {
    return axios.create({
      baseURL: this.config.wikiJsUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
  }

  async download(item) {
    try {
      const page = await this.fetchPage(item);
      const localPath = this.getLocalPath(item);
      
      await this.ensureDirectoryExists(path.dirname(localPath));
      
      const content = this.formatContent(page);
      await fs.writeFile(localPath, content, 'utf-8');
      
      await this.preserveTimestamps(localPath, page);
      
      return {
        success: true,
        action: 'downloaded',
        localPath,
        remotePage: page,
        timestamp: new Date()
      };
      
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  async fetchPage(item) {
    if (item.pageId) {
      return await this.fetchPageById(item.pageId);
    } else if (item.path) {
      return await this.fetchPageByPath(item.path);
    } else {
      throw new Error('No page ID or path provided');
    }
  }

  async fetchPageById(pageId) {
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
            createdAt
            updatedAt
            locale
            tags {
              tag
            }
            author {
              name
              email
            }
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
    
    const page = response.data.data.pages.single;
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    return page;
  }

  async fetchPageByPath(pagePath) {
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
            createdAt
            updatedAt
            locale
            tags {
              tag
            }
            author {
              name
              email
            }
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
    
    const page = response.data.data.pages.single;
    if (!page) {
      throw new Error(`Page at path ${pagePath} not found`);
    }
    
    return page;
  }

  formatContent(page) {
    const frontMatter = this.generateFrontMatter(page);
    const content = page.content || '';
    
    if (frontMatter) {
      return `---\n${frontMatter}\n---\n\n${content}`;
    }
    
    return content;
  }

  generateFrontMatter(page) {
    const yaml = require('js-yaml');
    
    const metadata = {
      title: page.title,
      description: page.description || undefined,
      published: page.isPublished,
      private: page.isPrivate || undefined,
      locale: page.locale !== 'en' ? page.locale : undefined,
      tags: page.tags && page.tags.length > 0 ? page.tags.map(t => t.tag) : undefined,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      author: page.author ? {
        name: page.author.name,
        email: page.author.email
      } : undefined
    };
    
    const cleanMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([_, value]) => value !== undefined)
    );
    
    if (Object.keys(cleanMetadata).length === 0) {
      return '';
    }
    
    try {
      return yaml.dump(cleanMetadata, {
        defaultFlowStyle: false,
        lineWidth: 80
      }).trim();
    } catch (error) {
      return '';
    }
  }

  getLocalPath(item) {
    if (item.localPath) {
      return item.localPath;
    }
    
    let localPath = item.path || item.pagePath;
    
    if (localPath.startsWith('/')) {
      localPath = localPath.slice(1);
    }
    
    if (!localPath.endsWith('.md')) {
      localPath += '.md';
    }
    
    return path.join(this.config.localPath, localPath);
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async preserveTimestamps(localPath, page) {
    try {
      const createdAt = new Date(page.createdAt);
      const updatedAt = new Date(page.updatedAt);
      
      await fs.utimes(localPath, createdAt, updatedAt);
    } catch (error) {
      // Non-critical error - continue without preserving timestamps
    }
  }

  async downloadBatch(items) {
    const results = [];
    const concurrentLimit = this.config.performance?.maxConcurrent || 3;
    
    for (let i = 0; i < items.length; i += concurrentLimit) {
      const batch = items.slice(i, i + concurrentLimit);
      
      const batchResults = await Promise.allSettled(
        batch.map(item => this.download(item))
      );
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const item = batch[j];
        
        if (result.status === 'fulfilled') {
          results.push({
            item,
            result: result.value,
            success: true
          });
        } else {
          results.push({
            item,
            error: result.reason.message,
            success: false
          });
        }
      }
      
      if (i + concurrentLimit < items.length) {
        await this.delay(1000);
      }
    }
    
    return results;
  }

  async downloadAll() {
    try {
      const pages = await this.fetchAllPages();
      const results = await this.downloadBatch(pages);
      
      const summary = {
        total: pages.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
      
      return summary;
      
    } catch (error) {
      throw new Error(`Bulk download failed: ${error.message}`);
    }
  }

  async fetchAllPages() {
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
            updatedAt
            locale
          }
        }
      }
    `;
    
    const response = await this.apiClient.post('/graphql', { query });
    
    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }
    
    return response.data.data.pages.list || [];
  }

  async downloadByQuery(searchQuery, options = {}) {
    try {
      const searchResults = await this.searchPages(searchQuery, options);
      const items = searchResults.results.map(result => ({
        pageId: result.id,
        path: result.path
      }));
      
      return await this.downloadBatch(items);
      
    } catch (error) {
      throw new Error(`Query-based download failed: ${error.message}`);
    }
  }

  async searchPages(query, options = {}) {
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
  }

  async syncDirectory(remotePath = '/') {
    try {
      const pages = await this.fetchPagesByPath(remotePath);
      const localDir = this.getLocalDirectoryPath(remotePath);
      
      await this.ensureDirectoryExists(localDir);
      
      const items = pages.map(page => ({
        pageId: page.id,
        path: page.path,
        localPath: path.join(localDir, this.getFileNameFromPath(page.path))
      }));
      
      return await this.downloadBatch(items);
      
    } catch (error) {
      throw new Error(`Directory sync failed: ${error.message}`);
    }
  }

  async fetchPagesByPath(basePath) {
    const allPages = await this.fetchAllPages();
    
    return allPages.filter(page => 
      page.path.startsWith(basePath) && 
      (page.isPublished || this.config.includeUnpublished)
    );
  }

  getLocalDirectoryPath(remotePath) {
    let localPath = remotePath;
    
    if (localPath.startsWith('/')) {
      localPath = localPath.slice(1);
    }
    
    return path.join(this.config.localPath, localPath);
  }

  getFileNameFromPath(pagePath) {
    const fileName = path.basename(pagePath);
    return fileName.endsWith('.md') ? fileName : fileName + '.md';
  }

  async validateDownload(item) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    if (!item.pageId && !item.path) {
      validation.valid = false;
      validation.errors.push('No page ID or path provided');
    }
    
    const localPath = this.getLocalPath(item);
    const localDir = path.dirname(localPath);
    
    try {
      await fs.access(localDir, fs.constants.W_OK);
    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Cannot write to directory: ${localDir}`);
    }
    
    try {
      const stats = await fs.stat(localPath);
      if (stats.isFile()) {
        validation.warnings.push('Local file will be overwritten');
      }
    } catch (error) {
      // File doesn't exist - this is fine
    }
    
    return validation;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getDownloadStats() {
    return {
      totalDownloaded: this.totalDownloaded || 0,
      totalErrors: this.totalErrors || 0,
      averageDownloadTime: this.averageDownloadTime || 0,
      lastDownloadTime: this.lastDownloadTime || null
    };
  }

  async testDownload(pageId) {
    try {
      const page = await this.fetchPageById(pageId);
      const content = this.formatContent(page);
      
      return {
        success: true,
        pageTitle: page.title,
        contentLength: content.length,
        hasContent: !!page.content,
        hasFrontMatter: content.startsWith('---')
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = Downloader;
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

class Uploader {
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

  async upload(item) {
    try {
      const fileContent = await this.getFileContent(item);
      const metadata = await this.extractMetadata(item, fileContent);
      const wikiPath = this.getWikiPath(item.filePath);
      
      const existingPage = await this.findExistingPage(wikiPath);
      
      if (existingPage) {
        return await this.updatePage(existingPage.id, fileContent, metadata);
      } else {
        return await this.createPage(wikiPath, fileContent, metadata);
      }
      
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async uploadFromLocal(localPath, wikiPath) {
    try {
      const fileContent = await fs.readFile(localPath, 'utf-8');
      const metadata = await this.extractMetadataFromPath(localPath, fileContent);
      
      const existingPage = await this.findExistingPage(wikiPath);
      
      if (existingPage) {
        return await this.updatePage(existingPage.id, fileContent, metadata);
      } else {
        return await this.createPage(wikiPath, fileContent, metadata);
      }
      
    } catch (error) {
      throw new Error(`Upload from local failed: ${error.message}`);
    }
  }

  async getFileContent(item) {
    if (item.content) {
      return item.content;
    }
    
    if (item.filePath) {
      return await fs.readFile(item.filePath, 'utf-8');
    }
    
    throw new Error('No content or file path provided');
  }

  async extractMetadata(item, content) {
    const frontMatter = this.extractFrontMatter(content);
    const stats = await this.getFileStats(item.filePath);
    
    return {
      title: frontMatter.title || this.generateTitleFromPath(item.filePath),
      description: frontMatter.description || this.extractDescription(content),
      tags: frontMatter.tags || [],
      isPublished: frontMatter.published !== false,
      isPrivate: frontMatter.private === true,
      locale: frontMatter.locale || this.config.locale || 'en',
      contentType: 'markdown',
      createdAt: frontMatter.createdAt || stats.birthtime,
      updatedAt: new Date()
    };
  }

  async extractMetadataFromPath(filePath, content) {
    const frontMatter = this.extractFrontMatter(content);
    const stats = await fs.stat(filePath);
    
    return {
      title: frontMatter.title || this.generateTitleFromPath(filePath),
      description: frontMatter.description || this.extractDescription(content),
      tags: frontMatter.tags || [],
      isPublished: frontMatter.published !== false,
      isPrivate: frontMatter.private === true,
      locale: frontMatter.locale || this.config.locale || 'en',
      contentType: 'markdown',
      createdAt: frontMatter.createdAt || stats.birthtime,
      updatedAt: new Date()
    };
  }

  extractFrontMatter(content) {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontMatterRegex);
    
    if (!match) {
      return {};
    }
    
    try {
      const yaml = require('js-yaml');
      return yaml.load(match[1]) || {};
    } catch (error) {
      return {};
    }
  }

  extractDescription(content) {
    const contentWithoutFrontMatter = this.removeFrontMatter(content);
    const lines = contentWithoutFrontMatter.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.substring(0, 200);
      }
    }
    
    return '';
  }

  removeFrontMatter(content) {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    return content.replace(frontMatterRegex, '');
  }

  generateTitleFromPath(filePath) {
    const baseName = path.basename(filePath, '.md');
    return baseName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  getWikiPath(filePath) {
    const relativePath = path.relative(this.config.localPath, filePath);
    let wikiPath = relativePath.replace(/\\/g, '/');
    
    if (wikiPath.endsWith('.md')) {
      wikiPath = wikiPath.slice(0, -3);
    }
    
    if (!wikiPath.startsWith('/')) {
      wikiPath = '/' + wikiPath;
    }
    
    return wikiPath;
  }

  async findExistingPage(wikiPath) {
    try {
      const query = `
        query($path: String!, $locale: String!) {
          pages {
            single(path: $path, locale: $locale) {
              id
              path
              title
              updatedAt
              hash
            }
          }
        }
      `;
      
      const response = await this.apiClient.post('/graphql', {
        query,
        variables: { 
          path: wikiPath,
          locale: this.config.locale || 'en'
        }
      });
      
      if (response.data.errors) {
        return null;
      }
      
      return response.data.data.pages.single;
      
    } catch (error) {
      return null;
    }
  }

  async createPage(wikiPath, content, metadata) {
    const cleanContent = this.removeFrontMatter(content);
    
    const mutation = `
      mutation($content: String!, $description: String!, $editor: String!, $isPrivate: Boolean!, $isPublished: Boolean!, $locale: String!, $path: String!, $tags: [String], $title: String!) {
        pages {
          create(content: $content, description: $description, editor: $editor, isPrivate: $isPrivate, isPublished: $isPublished, locale: $locale, path: $path, tags: $tags, title: $title) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              path
              title
              updatedAt
            }
          }
        }
      }
    `;
    
    const variables = {
      content: cleanContent,
      description: metadata.description || '',
      editor: 'markdown',
      isPrivate: metadata.isPrivate || false,
      isPublished: metadata.isPublished !== false,
      locale: metadata.locale || 'en',
      path: wikiPath,
      tags: metadata.tags || [],
      title: metadata.title
    };
    
    const response = await this.apiClient.post('/graphql', {
      query: mutation,
      variables
    });
    
    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }
    
    const result = response.data.data.pages.create.responseResult;
    if (!result.succeeded) {
      throw new Error(`Page creation failed: ${result.message} (${result.errorCode})`);
    }
    
    return {
      success: true,
      action: 'created',
      page: response.data.data.pages.create.page,
      timestamp: new Date()
    };
  }

  async updatePage(pageId, content, metadata) {
    const cleanContent = this.removeFrontMatter(content);
    
    const mutation = `
      mutation($id: Int!, $content: String!, $description: String!, $editor: String!, $isPrivate: Boolean!, $isPublished: Boolean!, $locale: String!, $path: String!, $tags: [String], $title: String!) {
        pages {
          update(id: $id, content: $content, description: $description, editor: $editor, isPrivate: $isPrivate, isPublished: $isPublished, locale: $locale, path: $path, tags: $tags, title: $title) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              path
              title
              updatedAt
            }
          }
        }
      }
    `;
    
    const variables = {
      id: parseInt(pageId),
      content: cleanContent,
      description: metadata.description || '',
      editor: 'markdown',
      isPrivate: metadata.isPrivate || false,
      isPublished: metadata.isPublished !== false,
      locale: metadata.locale || 'en',
      path: metadata.path || this.getWikiPath(metadata.filePath),
      tags: metadata.tags || [],
      title: metadata.title
    };
    
    const response = await this.apiClient.post('/graphql', {
      query: mutation,
      variables
    });
    
    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }
    
    const result = response.data.data.pages.update.responseResult;
    if (!result.succeeded) {
      throw new Error(`Page update failed: ${result.message} (${result.errorCode})`);
    }
    
    return {
      success: true,
      action: 'updated',
      page: response.data.data.pages.update.page,
      timestamp: new Date()
    };
  }

  async deletePage(pageId) {
    const mutation = `
      mutation($id: Int!) {
        pages {
          delete(id: $id) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;
    
    const response = await this.apiClient.post('/graphql', {
      query: mutation,
      variables: { id: parseInt(pageId) }
    });
    
    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }
    
    const result = response.data.data.pages.delete.responseResult;
    if (!result.succeeded) {
      throw new Error(`Page deletion failed: ${result.message} (${result.errorCode})`);
    }
    
    return {
      success: true,
      action: 'deleted',
      pageId: pageId,
      timestamp: new Date()
    };
  }

  async uploadBatch(items) {
    const results = [];
    const concurrentLimit = this.config.performance?.maxConcurrent || 3;
    
    for (let i = 0; i < items.length; i += concurrentLimit) {
      const batch = items.slice(i, i + concurrentLimit);
      
      const batchResults = await Promise.allSettled(
        batch.map(item => this.upload(item))
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

  async getFileStats(filePath) {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      return {
        birthtime: new Date(),
        mtime: new Date(),
        size: 0
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateUpload(item) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    if (!item.filePath && !item.content) {
      validation.valid = false;
      validation.errors.push('No file path or content provided');
    }
    
    if (item.filePath) {
      try {
        const stats = await fs.stat(item.filePath);
        
        if (stats.size > 10 * 1024 * 1024) {
          validation.warnings.push('File size exceeds 10MB');
        }
        
        if (!item.filePath.endsWith('.md')) {
          validation.warnings.push('File is not a Markdown file');
        }
        
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Cannot access file: ${error.message}`);
      }
    }
    
    return validation;
  }

  async getUploadStats() {
    return {
      totalUploaded: this.totalUploaded || 0,
      totalErrors: this.totalErrors || 0,
      averageUploadTime: this.averageUploadTime || 0,
      lastUploadTime: this.lastUploadTime || null
    };
  }
}

module.exports = Uploader;
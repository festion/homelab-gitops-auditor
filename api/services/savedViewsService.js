/**
 * Saved Views Service
 * Handles persistence and management of saved search views
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SavedViewsService {
  constructor() {
    this.viewsPath = path.join(process.cwd(), 'data', 'saved-views.json');
    this.viewsCache = null;
    this.lastCacheUpdate = 0;
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Load saved views from storage
   */
  async loadViews() {
    const now = Date.now();
    if (this.viewsCache && (now - this.lastCacheUpdate) < this.cacheTimeout) {
      return this.viewsCache;
    }

    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.viewsPath), { recursive: true });

      // Try to read existing views
      try {
        const data = await fs.readFile(this.viewsPath, 'utf8');
        this.viewsCache = JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, create empty structure
          this.viewsCache = { views: [] };
          await this.saveViews();
        } else {
          throw error;
        }
      }

      this.lastCacheUpdate = now;
      return this.viewsCache;
    } catch (error) {
      console.error('Failed to load saved views:', error);
      return { views: [] };
    }
  }

  /**
   * Save views to storage
   */
  async saveViews() {
    try {
      if (!this.viewsCache) return;
      
      const data = JSON.stringify(this.viewsCache, null, 2);
      await fs.writeFile(this.viewsPath, data, 'utf8');
      this.lastCacheUpdate = Date.now();
    } catch (error) {
      console.error('Failed to save views:', error);
      throw new Error('Failed to save views to storage');
    }
  }

  /**
   * Get saved views for a user
   */
  async getSavedViews(userId = 'default') {
    try {
      const data = await this.loadViews();
      
      // Filter views for the specific user (or default for anonymous users)
      const userViews = data.views.filter(view => view.userId === userId);
      
      // Sort by creation date (newest first)
      return userViews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('Failed to get saved views:', error);
      return [];
    }
  }

  /**
   * Create a new saved view
   */
  async createSavedView(viewData) {
    try {
      const { name, criteria, isDefault = false, userId = 'default' } = viewData;

      if (!name || !criteria) {
        throw new Error('Name and criteria are required');
      }

      const data = await this.loadViews();
      
      // Check for duplicate names for this user
      const existingView = data.views.find(view => 
        view.userId === userId && 
        view.name.toLowerCase() === name.toLowerCase()
      );
      
      if (existingView) {
        const error = new Error(`A view named "${name}" already exists`);
        error.code = 'DUPLICATE_NAME';
        throw error;
      }

      // If this is set as default, remove default flag from other views
      if (isDefault) {
        data.views.forEach(view => {
          if (view.userId === userId) {
            view.isDefault = false;
          }
        });
      }

      // Create new view
      const newView = {
        id: this.generateViewId(),
        name: name.trim(),
        criteria: this.sanitizeCriteria(criteria),
        isDefault,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      data.views.push(newView);
      this.viewsCache = data;
      await this.saveViews();

      return newView;
    } catch (error) {
      console.error('Failed to create saved view:', error);
      throw error;
    }
  }

  /**
   * Update an existing saved view
   */
  async updateSavedView(viewId, updateData) {
    try {
      const { name, criteria, isDefault, userId = 'default' } = updateData;
      
      const data = await this.loadViews();
      const viewIndex = data.views.findIndex(view => 
        view.id === viewId && view.userId === userId
      );

      if (viewIndex === -1) {
        return null; // View not found or user doesn't have permission
      }

      const view = data.views[viewIndex];

      // Check for duplicate names if name is being changed
      if (name && name !== view.name) {
        const existingView = data.views.find((v, index) => 
          index !== viewIndex &&
          v.userId === userId && 
          v.name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingView) {
          const error = new Error(`A view named "${name}" already exists`);
          error.code = 'DUPLICATE_NAME';
          throw error;
        }
      }

      // If this is being set as default, remove default flag from other views
      if (isDefault) {
        data.views.forEach((v, index) => {
          if (index !== viewIndex && v.userId === userId) {
            v.isDefault = false;
          }
        });
      }

      // Update view
      const updatedView = {
        ...view,
        ...(name && { name: name.trim() }),
        ...(criteria && { criteria: this.sanitizeCriteria(criteria) }),
        ...(isDefault !== undefined && { isDefault }),
        updatedAt: new Date().toISOString()
      };

      data.views[viewIndex] = updatedView;
      this.viewsCache = data;
      await this.saveViews();

      return updatedView;
    } catch (error) {
      console.error('Failed to update saved view:', error);
      throw error;
    }
  }

  /**
   * Delete a saved view
   */
  async deleteSavedView(viewId, userId = 'default') {
    try {
      const data = await this.loadViews();
      const initialLength = data.views.length;
      
      // Remove the view if it belongs to the user
      data.views = data.views.filter(view => 
        !(view.id === viewId && view.userId === userId)
      );

      const deleted = data.views.length < initialLength;

      if (deleted) {
        this.viewsCache = data;
        await this.saveViews();
      }

      return deleted;
    } catch (error) {
      console.error('Failed to delete saved view:', error);
      throw error;
    }
  }

  /**
   * Get a specific saved view
   */
  async getSavedView(viewId, userId = 'default') {
    try {
      const data = await this.loadViews();
      
      return data.views.find(view => 
        view.id === viewId && view.userId === userId
      ) || null;
    } catch (error) {
      console.error('Failed to get saved view:', error);
      return null;
    }
  }

  /**
   * Set a view as default
   */
  async setDefaultView(viewId, userId = 'default') {
    try {
      const data = await this.loadViews();
      
      // Remove default flag from all user views
      data.views.forEach(view => {
        if (view.userId === userId) {
          view.isDefault = false;
        }
      });

      // Set the specified view as default
      const targetView = data.views.find(view => 
        view.id === viewId && view.userId === userId
      );

      if (!targetView) {
        return null;
      }

      targetView.isDefault = true;
      targetView.updatedAt = new Date().toISOString();

      this.viewsCache = data;
      await this.saveViews();

      return targetView;
    } catch (error) {
      console.error('Failed to set default view:', error);
      throw error;
    }
  }

  /**
   * Get the default view for a user
   */
  async getDefaultView(userId = 'default') {
    try {
      const data = await this.loadViews();
      
      return data.views.find(view => 
        view.userId === userId && view.isDefault
      ) || null;
    } catch (error) {
      console.error('Failed to get default view:', error);
      return null;
    }
  }

  /**
   * Export all views for a user
   */
  async exportViews(userId = 'default') {
    try {
      const views = await this.getSavedViews(userId);
      
      return {
        exportedAt: new Date().toISOString(),
        userId,
        views: views.map(view => ({
          name: view.name,
          criteria: view.criteria,
          isDefault: view.isDefault,
          createdAt: view.createdAt
        }))
      };
    } catch (error) {
      console.error('Failed to export views:', error);
      throw error;
    }
  }

  /**
   * Import views for a user
   */
  async importViews(importData, userId = 'default', options = {}) {
    try {
      const { overwrite = false, mergeStrategy = 'skip' } = options;
      const { views: importedViews } = importData;

      if (!Array.isArray(importedViews)) {
        throw new Error('Invalid import data format');
      }

      const data = await this.loadViews();
      const existingNames = new Set(
        data.views
          .filter(view => view.userId === userId)
          .map(view => view.name.toLowerCase())
      );

      const results = {
        imported: 0,
        skipped: 0,
        errors: []
      };

      for (const importedView of importedViews) {
        try {
          const { name, criteria, isDefault = false } = importedView;
          
          if (!name || !criteria) {
            results.errors.push(`Invalid view: missing name or criteria`);
            continue;
          }

          const normalizedName = name.toLowerCase();
          
          if (existingNames.has(normalizedName)) {
            if (mergeStrategy === 'skip') {
              results.skipped++;
              continue;
            } else if (mergeStrategy === 'update') {
              // Update existing view
              const existingView = data.views.find(view => 
                view.userId === userId && view.name.toLowerCase() === normalizedName
              );
              if (existingView) {
                existingView.criteria = this.sanitizeCriteria(criteria);
                existingView.updatedAt = new Date().toISOString();
                if (isDefault) {
                  // Remove default from others
                  data.views.forEach(view => {
                    if (view.userId === userId && view.id !== existingView.id) {
                      view.isDefault = false;
                    }
                  });
                  existingView.isDefault = true;
                }
                results.imported++;
                continue;
              }
            }
          }

          // Create new view
          const newView = {
            id: this.generateViewId(),
            name: name.trim(),
            criteria: this.sanitizeCriteria(criteria),
            isDefault: isDefault && !existingNames.size, // Only if no existing views
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          data.views.push(newView);
          existingNames.add(normalizedName);
          results.imported++;

        } catch (error) {
          results.errors.push(`Failed to import view "${importedView.name}": ${error.message}`);
        }
      }

      this.viewsCache = data;
      await this.saveViews();

      return results;
    } catch (error) {
      console.error('Failed to import views:', error);
      throw error;
    }
  }

  /**
   * Generate a unique view ID
   */
  generateViewId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Sanitize search criteria to ensure valid structure
   */
  sanitizeCriteria(criteria) {
    if (!criteria || typeof criteria !== 'object') {
      return { query: '', filters: {}, sort: { field: 'name', direction: 'asc' } };
    }

    return {
      query: typeof criteria.query === 'string' ? criteria.query : '',
      filters: this.sanitizeFilters(criteria.filters || {}),
      sort: this.sanitizeSort(criteria.sort)
    };
  }

  /**
   * Sanitize filter object
   */
  sanitizeFilters(filters) {
    const sanitized = {};
    
    if (Array.isArray(filters.status)) {
      sanitized.status = filters.status.filter(s => 
        ['clean', 'dirty', 'missing', 'extra'].includes(s)
      );
    }
    
    if (Array.isArray(filters.compliance)) {
      sanitized.compliance = filters.compliance.filter(c =>
        ['compliant', 'non-compliant'].includes(c)
      );
    }
    
    if (Array.isArray(filters.pipelineStatus)) {
      sanitized.pipelineStatus = filters.pipelineStatus.filter(p =>
        ['success', 'failure', 'pending', 'running'].includes(p)
      );
    }
    
    if (typeof filters.hasUncommittedChanges === 'boolean') {
      sanitized.hasUncommittedChanges = filters.hasUncommittedChanges;
    }
    
    if (typeof filters.hasStaleTags === 'boolean') {
      sanitized.hasStaleTags = filters.hasStaleTags;
    }
    
    if (typeof filters.lastActivityDays === 'number' && filters.lastActivityDays > 0) {
      sanitized.lastActivityDays = Math.min(filters.lastActivityDays, 365);
    }
    
    if (Array.isArray(filters.templates)) {
      sanitized.templates = filters.templates.filter(t => typeof t === 'string' && t.trim().length > 0);
    }
    
    if (Array.isArray(filters.tags)) {
      sanitized.tags = filters.tags.filter(t => typeof t === 'string' && t.trim().length > 0);
    }

    return sanitized;
  }

  /**
   * Sanitize sort object
   */
  sanitizeSort(sort) {
    if (!sort || typeof sort !== 'object') {
      return { field: 'name', direction: 'asc' };
    }

    const validFields = ['name', 'status', 'lastActivity', 'compliance', 'relevance'];
    const validDirections = ['asc', 'desc'];

    return {
      field: validFields.includes(sort.field) ? sort.field : 'name',
      direction: validDirections.includes(sort.direction) ? sort.direction : 'asc'
    };
  }

  /**
   * Clean up old views (optional maintenance)
   */
  async cleanupOldViews(maxAge = 365 * 24 * 60 * 60 * 1000) { // 1 year default
    try {
      const data = await this.loadViews();
      const cutoffDate = new Date(Date.now() - maxAge);
      const initialLength = data.views.length;

      data.views = data.views.filter(view => {
        const createdAt = new Date(view.createdAt);
        return createdAt > cutoffDate || view.isDefault; // Keep default views
      });

      const cleaned = initialLength - data.views.length;
      
      if (cleaned > 0) {
        this.viewsCache = data;
        await this.saveViews();
        console.log(`Cleaned up ${cleaned} old saved views`);
      }

      return cleaned;
    } catch (error) {
      console.error('Failed to cleanup old views:', error);
      return 0;
    }
  }
}

// Export singleton instance
const savedViewsService = new SavedViewsService();

module.exports = {
  getSavedViews: (userId) => savedViewsService.getSavedViews(userId),
  createSavedView: (viewData) => savedViewsService.createSavedView(viewData),
  updateSavedView: (viewId, updateData) => savedViewsService.updateSavedView(viewId, updateData),
  deleteSavedView: (viewId, userId) => savedViewsService.deleteSavedView(viewId, userId),
  getSavedView: (viewId, userId) => savedViewsService.getSavedView(viewId, userId),
  setDefaultView: (viewId, userId) => savedViewsService.setDefaultView(viewId, userId),
  getDefaultView: (userId) => savedViewsService.getDefaultView(userId),
  exportViews: (userId) => savedViewsService.exportViews(userId),
  importViews: (importData, userId, options) => savedViewsService.importViews(importData, userId, options)
};
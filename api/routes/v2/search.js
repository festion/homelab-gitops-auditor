/**
 * Search API Routes
 * Provides endpoints for advanced repository search, filtering, and bulk operations
 */

const express = require('express');
const router = express.Router();
const { searchRepositories, getSearchFacets } = require('../../services/searchService');
const { 
  executeBulkAction,
  validateBulkAction 
} = require('../../services/bulkActionService');
const { 
  getSavedViews, 
  createSavedView, 
  deleteSavedView,
  updateSavedView 
} = require('../../services/savedViewsService');
const { validateSearchQuery, validateBulkActionParams } = require('../../middleware/validation');
const { requireAuth } = require('../../middleware/auth');
const { logActivity } = require('../../middleware/logging');

// Apply authentication to all routes
router.use(requireAuth);

/**
 * GET /api/v2/search
 * Advanced repository search with filtering and sorting
 */
router.get('/', validateSearchQuery, logActivity('search'), async (req, res) => {
  try {
    const {
      q: query = '',
      status,
      compliance,
      pipeline_status,
      uncommitted_changes,
      stale_tags,
      last_activity_days,
      templates,
      tags,
      sort_field = 'name',
      sort_direction = 'asc',
      limit = 100,
      offset = 0,
      fuzzy = 'true',
      highlight = 'true',
      include_facets = 'false'
    } = req.query;

    // Parse filter parameters
    const filters = {
      status: status ? status.split(',').map(s => s.trim()) : undefined,
      compliance: compliance ? compliance.split(',').map(c => c.trim()) : undefined,
      pipelineStatus: pipeline_status ? pipeline_status.split(',').map(p => p.trim()) : undefined,
      hasUncommittedChanges: uncommitted_changes === 'true' ? true : 
                            uncommitted_changes === 'false' ? false : undefined,
      hasStaleTags: stale_tags === 'true' ? true : 
                   stale_tags === 'false' ? false : undefined,
      lastActivityDays: last_activity_days ? parseInt(last_activity_days) : undefined,
      templates: templates ? templates.split(',').map(t => t.trim()) : undefined,
      tags: tags ? tags.split(',').map(t => t.trim()) : undefined
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const searchParams = {
      query: query.trim(),
      filters,
      sort: {
        field: sort_field,
        direction: sort_direction
      },
      pagination: {
        limit: Math.min(parseInt(limit), 1000), // Cap at 1000
        offset: Math.max(parseInt(offset), 0)
      },
      options: {
        fuzzySearch: fuzzy === 'true',
        highlighting: highlight === 'true',
        includeFacets: include_facets === 'true'
      }
    };

    const startTime = Date.now();
    const results = await searchRepositories(searchParams);
    const searchTime = Date.now() - startTime;

    res.json({
      ...results,
      took: searchTime,
      query: searchParams
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
      total: 0,
      items: []
    });
  }
});

/**
 * GET /api/v2/search/facets
 * Get search facets/aggregations for filter options
 */
router.get('/facets', logActivity('search_facets'), async (req, res) => {
  try {
    const facets = await getSearchFacets();
    res.json(facets);
  } catch (error) {
    console.error('Facets error:', error);
    res.status(500).json({
      error: 'Failed to get search facets',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/bulk-actions
 * Execute bulk actions on selected repositories
 */
router.post('/bulk-actions', validateBulkActionParams, logActivity('bulk_action'), async (req, res) => {
  try {
    const { type, repositories, params = {} } = req.body;

    // Validate the bulk action
    const validation = await validateBulkAction({ type, repositories, params });
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid bulk action',
        message: validation.message,
        errors: validation.errors
      });
    }

    // Execute the bulk action
    const result = await executeBulkAction({
      type,
      repositories,
      params,
      userId: req.user?.id,
      sessionId: req.sessionId
    });

    res.json(result);

  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk action failed',
      error: error.message,
      affectedRepositories: []
    });
  }
});

/**
 * GET /api/v2/views
 * Get saved search views for the current user
 */
router.get('/views', logActivity('get_saved_views'), async (req, res) => {
  try {
    const userId = req.user?.id;
    const views = await getSavedViews(userId);
    res.json(views);
  } catch (error) {
    console.error('Get saved views error:', error);
    res.status(500).json({
      error: 'Failed to get saved views',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/views
 * Create a new saved search view
 */
router.post('/views', logActivity('create_saved_view'), async (req, res) => {
  try {
    const { name, criteria, isDefault = false } = req.body;
    const userId = req.user?.id;

    if (!name || !criteria) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Name and criteria are required'
      });
    }

    const savedView = await createSavedView({
      name: name.trim(),
      criteria,
      isDefault,
      userId
    });

    res.status(201).json(savedView);

  } catch (error) {
    console.error('Create saved view error:', error);
    
    if (error.code === 'DUPLICATE_NAME') {
      return res.status(409).json({
        error: 'View name already exists',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create saved view',
      message: error.message
    });
  }
});

/**
 * PUT /api/v2/views/:viewId
 * Update an existing saved view
 */
router.put('/views/:viewId', logActivity('update_saved_view'), async (req, res) => {
  try {
    const { viewId } = req.params;
    const { name, criteria, isDefault } = req.body;
    const userId = req.user?.id;

    const updatedView = await updateSavedView(viewId, {
      name: name?.trim(),
      criteria,
      isDefault,
      userId
    });

    if (!updatedView) {
      return res.status(404).json({
        error: 'View not found',
        message: 'The specified view does not exist or you do not have permission to update it'
      });
    }

    res.json(updatedView);

  } catch (error) {
    console.error('Update saved view error:', error);
    res.status(500).json({
      error: 'Failed to update saved view',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v2/views/:viewId
 * Delete a saved search view
 */
router.delete('/views/:viewId', logActivity('delete_saved_view'), async (req, res) => {
  try {
    const { viewId } = req.params;
    const userId = req.user?.id;

    const deleted = await deleteSavedView(viewId, userId);

    if (!deleted) {
      return res.status(404).json({
        error: 'View not found',
        message: 'The specified view does not exist or you do not have permission to delete it'
      });
    }

    res.status(204).send();

  } catch (error) {
    console.error('Delete saved view error:', error);
    res.status(500).json({
      error: 'Failed to delete saved view',
      message: error.message
    });
  }
});

/**
 * GET /api/v2/search/suggestions
 * Get search suggestions based on partial query
 */
router.get('/suggestions', logActivity('search_suggestions'), async (req, res) => {
  try {
    const { q: query = '', type = 'all', limit = 10 } = req.query;

    if (!query.trim()) {
      return res.json([]);
    }

    // This would implement autocomplete/suggestions based on:
    // - Repository names
    // - Tags
    // - Template names
    // - Common search terms
    const suggestions = await getSearchSuggestions({
      query: query.trim(),
      type,
      limit: Math.min(parseInt(limit), 50)
    });

    res.json(suggestions);

  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json([]);
  }
});

/**
 * POST /api/v2/search/export
 * Export search results in various formats
 */
router.post('/export', logActivity('export_search_results'), async (req, res) => {
  try {
    const { 
      searchParams, 
      format = 'json', 
      includeDetails = true,
      filename 
    } = req.body;

    if (!searchParams) {
      return res.status(400).json({
        error: 'Missing search parameters',
        message: 'Search parameters are required for export'
      });
    }

    const exportResult = await exportSearchResults({
      searchParams,
      format,
      includeDetails,
      filename: filename || `search-results-${Date.now()}`,
      userId: req.user?.id
    });

    if (format === 'json') {
      res.json(exportResult.data);
    } else {
      // For CSV/Excel exports, return file download
      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.send(exportResult.data);
    }

  } catch (error) {
    console.error('Export search results error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

module.exports = router;
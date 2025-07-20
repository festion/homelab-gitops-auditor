import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  SearchCriteria, 
  SearchResponse, 
  SearchState, 
  SavedView, 
  BulkAction, 
  QuickActionResult,
  SearchConfig
} from '../types/search';
import { useDebounce } from './useDebounce';

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  debounceMs: 300,
  maxResults: 100,
  enableFuzzySearch: true,
  enableHighlighting: true,
  cacheResults: true,
  cacheDurationMs: 5 * 60 * 1000 // 5 minutes
};

const DEFAULT_CRITERIA: SearchCriteria = {
  query: '',
  filters: {},
  sort: { field: 'name', direction: 'asc' }
};

interface UseSearchOptions {
  config?: Partial<SearchConfig>;
  apiEndpoint?: string;
  autoSearch?: boolean;
}

export function useSearch(options: UseSearchOptions = {}) {
  const {
    config = {},
    apiEndpoint = '/api/v2/search',
    autoSearch = true
  } = options;

  const searchConfig = { ...DEFAULT_SEARCH_CONFIG, ...config };
  
  const [state, setState] = useState<SearchState>({
    criteria: DEFAULT_CRITERIA,
    results: null,
    isLoading: false,
    error: null,
    selectedRepositories: [],
    viewMode: 'grid',
    savedViews: []
  });

  const cacheRef = useRef<Map<string, { data: SearchResponse; timestamp: number }>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce the search query
  const debouncedQuery = useDebounce(state.criteria.query, searchConfig.debounceMs);

  // Generate cache key for search criteria
  const getCacheKey = useCallback((criteria: SearchCriteria): string => {
    return JSON.stringify(criteria);
  }, []);

  // Check if cached result is still valid
  const getCachedResult = useCallback((key: string): SearchResponse | null => {
    if (!searchConfig.cacheResults) return null;
    
    const cached = cacheRef.current.get(key);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > searchConfig.cacheDurationMs;
    if (isExpired) {
      cacheRef.current.delete(key);
      return null;
    }
    
    return cached.data;
  }, [searchConfig.cacheResults, searchConfig.cacheDurationMs]);

  // Cache search result
  const setCachedResult = useCallback((key: string, data: SearchResponse) => {
    if (!searchConfig.cacheResults) return;
    
    cacheRef.current.set(key, { data, timestamp: Date.now() });
    
    // Clean up old cache entries (keep only last 10)
    if (cacheRef.current.size > 10) {
      const entries = Array.from(cacheRef.current.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      cacheRef.current.clear();
      entries.slice(0, 10).forEach(([key, value]) => {
        cacheRef.current.set(key, value);
      });
    }
  }, [searchConfig.cacheResults]);

  // Perform search API call
  const performSearch = useCallback(async (criteria: SearchCriteria): Promise<SearchResponse | null> => {
    const cacheKey = getCacheKey(criteria);
    
    // Check cache first
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const searchParams = new URLSearchParams();
      
      if (criteria.query) {
        searchParams.append('q', criteria.query);
      }
      
      if (criteria.filters.status?.length) {
        searchParams.append('status', criteria.filters.status.join(','));
      }
      
      if (criteria.filters.compliance?.length) {
        searchParams.append('compliance', criteria.filters.compliance.join(','));
      }
      
      if (criteria.filters.pipelineStatus?.length) {
        searchParams.append('pipeline_status', criteria.filters.pipelineStatus.join(','));
      }
      
      if (criteria.filters.hasUncommittedChanges !== undefined) {
        searchParams.append('uncommitted_changes', criteria.filters.hasUncommittedChanges.toString());
      }
      
      if (criteria.filters.hasStaleTags !== undefined) {
        searchParams.append('stale_tags', criteria.filters.hasStaleTags.toString());
      }
      
      if (criteria.filters.lastActivityDays !== undefined) {
        searchParams.append('last_activity_days', criteria.filters.lastActivityDays.toString());
      }
      
      if (criteria.filters.templates?.length) {
        searchParams.append('templates', criteria.filters.templates.join(','));
      }
      
      if (criteria.filters.tags?.length) {
        searchParams.append('tags', criteria.filters.tags.join(','));
      }
      
      if (criteria.sort) {
        searchParams.append('sort_field', criteria.sort.field);
        searchParams.append('sort_direction', criteria.sort.direction);
      }
      
      searchParams.append('limit', searchConfig.maxResults.toString());
      searchParams.append('fuzzy', searchConfig.enableFuzzySearch.toString());
      searchParams.append('highlight', searchConfig.enableHighlighting.toString());

      const response = await fetch(`${apiEndpoint}?${searchParams.toString()}`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data: SearchResponse = await response.json();
      
      // Cache the result
      setCachedResult(cacheKey, data);
      
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null; // Request was cancelled
      }
      throw error;
    }
  }, [apiEndpoint, getCacheKey, getCachedResult, setCachedResult, searchConfig]);

  // Execute search with error handling
  const executeSearch = useCallback(async (criteria: SearchCriteria) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const results = await performSearch(criteria);
      if (results) {
        setState(prev => ({ 
          ...prev, 
          results, 
          isLoading: false 
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        isLoading: false 
      }));
    }
  }, [performSearch]);

  // Update search criteria
  const updateCriteria = useCallback((newCriteria: Partial<SearchCriteria>) => {
    setState(prev => ({
      ...prev,
      criteria: { ...prev.criteria, ...newCriteria }
    }));
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setState(prev => ({
      ...prev,
      criteria: DEFAULT_CRITERIA,
      results: null,
      selectedRepositories: []
    }));
  }, []);

  // Repository selection methods
  const selectRepository = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      selectedRepositories: [...prev.selectedRepositories, id]
    }));
  }, []);

  const deselectRepository = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      selectedRepositories: prev.selectedRepositories.filter(repo => repo !== id)
    }));
  }, []);

  const selectAllRepositories = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedRepositories: prev.results?.items.map(item => item.id) || []
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({ ...prev, selectedRepositories: [] }));
  }, []);

  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  // Saved views management
  const saveView = useCallback(async (name: string, criteria: SearchCriteria) => {
    try {
      const response = await fetch('/api/v2/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, criteria })
      });
      
      if (!response.ok) throw new Error('Failed to save view');
      
      const savedView: SavedView = await response.json();
      setState(prev => ({
        ...prev,
        savedViews: [...prev.savedViews, savedView]
      }));
    } catch (error) {
      throw new Error('Failed to save view');
    }
  }, []);

  const deleteView = useCallback(async (viewId: string) => {
    try {
      const response = await fetch(`/api/v2/views/${viewId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete view');
      
      setState(prev => ({
        ...prev,
        savedViews: prev.savedViews.filter(view => view.id !== viewId)
      }));
    } catch (error) {
      throw new Error('Failed to delete view');
    }
  }, []);

  const applyView = useCallback((criteria: SearchCriteria) => {
    setState(prev => ({ ...prev, criteria }));
  }, []);

  // Bulk actions
  const performBulkAction = useCallback(async (action: BulkAction): Promise<QuickActionResult> => {
    try {
      const response = await fetch('/api/v2/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      
      if (!response.ok) throw new Error('Bulk action failed');
      
      const result: QuickActionResult = await response.json();
      
      // Refresh search results after bulk action
      if (result.success) {
        await executeSearch(state.criteria);
        clearSelection();
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Bulk action failed',
        affectedRepositories: []
      };
    }
  }, [executeSearch, state.criteria, clearSelection]);

  const refreshSearch = useCallback(() => {
    // Clear cache and re-execute search
    cacheRef.current.clear();
    executeSearch(state.criteria);
  }, [executeSearch, state.criteria]);

  // Load saved views on mount
  useEffect(() => {
    const loadSavedViews = async () => {
      try {
        const response = await fetch('/api/v2/views');
        if (response.ok) {
          const views: SavedView[] = await response.json();
          setState(prev => ({ ...prev, savedViews: views }));
        }
      } catch (error) {
        console.warn('Failed to load saved views:', error);
      }
    };
    
    loadSavedViews();
  }, []);

  // Auto-search when criteria changes
  useEffect(() => {
    if (autoSearch && (debouncedQuery !== state.criteria.query || state.criteria.filters !== DEFAULT_CRITERIA.filters)) {
      const criteriaWithDebouncedQuery = {
        ...state.criteria,
        query: debouncedQuery
      };
      executeSearch(criteriaWithDebouncedQuery);
    }
  }, [debouncedQuery, state.criteria.filters, state.criteria.sort, autoSearch, executeSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    updateCriteria,
    clearSearch,
    selectRepository,
    deselectRepository,
    selectAllRepositories,
    clearSelection,
    setViewMode,
    saveView,
    deleteView,
    applyView,
    performBulkAction,
    refreshSearch,
    executeSearch
  };
}
/**
 * Search and Filter Type Definitions
 */

export interface SearchFilters {
  status?: ('clean' | 'dirty' | 'missing' | 'extra')[];
  compliance?: ('compliant' | 'non-compliant')[];
  hasUncommittedChanges?: boolean;
  hasStaleTags?: boolean;
  lastActivityDays?: number;
  pipelineStatus?: ('success' | 'failure' | 'pending' | 'running')[];
  templates?: string[];
  tags?: string[];
}

export interface SearchSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SearchCriteria {
  query: string;
  filters: SearchFilters;
  sort?: SearchSort;
}

export interface SavedView {
  id: string;
  name: string;
  criteria: SearchCriteria;
  createdAt: string;
  isDefault?: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  status: 'clean' | 'dirty' | 'missing' | 'extra';
  compliance: 'compliant' | 'non-compliant';
  lastActivity: string;
  pipelineStatus: 'success' | 'failure' | 'pending' | 'running' | null;
  templates: string[];
  tags: string[];
  hasUncommittedChanges: boolean;
  hasStaleTags: boolean;
  clone_url?: string;
  local_path?: string;
  dashboard_link?: string;
  branch?: string;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
  };
  issues?: {
    count: number;
    critical: number;
    warnings: number;
  };
}

export interface SearchResponse {
  total: number;
  items: SearchResult[];
  facets?: {
    status: Record<string, number>;
    compliance: Record<string, number>;
    pipelineStatus: Record<string, number>;
    templates: Record<string, number>;
    tags: Record<string, number>;
  };
  took?: number; // Search time in milliseconds
}

export interface QuickActionResult {
  success: boolean;
  message: string;
  affectedRepositories: string[];
  errors?: string[];
}

export interface BulkAction {
  type: 'apply_templates' | 'run_audit' | 'export_data' | 'tag_repositories' | 'remove_tags';
  repositories: string[];
  params?: Record<string, any>;
}

export interface SearchState {
  criteria: SearchCriteria;
  results: SearchResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedRepositories: string[];
  viewMode: 'grid' | 'list';
  savedViews: SavedView[];
}

export interface SearchContextType extends SearchState {
  updateCriteria: (criteria: Partial<SearchCriteria>) => void;
  clearSearch: () => void;
  selectRepository: (id: string) => void;
  deselectRepository: (id: string) => void;
  selectAllRepositories: () => void;
  clearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  saveView: (name: string, criteria: SearchCriteria) => Promise<void>;
  deleteView: (viewId: string) => Promise<void>;
  applyView: (criteria: SearchCriteria) => void;
  performBulkAction: (action: BulkAction) => Promise<QuickActionResult>;
  refreshSearch: () => void;
}

// Extended repository type with search-specific fields
export interface RepositoryWithSearchData {
  name: string;
  status: 'clean' | 'dirty' | 'missing' | 'extra';
  clone_url?: string;
  local_path?: string;
  dashboard_link?: string;
  // Search-specific additions
  compliance: 'compliant' | 'non-compliant';
  lastActivity: string;
  pipelineStatus: 'success' | 'failure' | 'pending' | 'running' | null;
  templates: string[];
  tags: string[];
  hasUncommittedChanges: boolean;
  hasStaleTags: boolean;
  branch?: string;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
  };
  issues?: {
    count: number;
    critical: number;
    warnings: number;
  };
  searchScore?: number; // Relevance score for search results
}

export interface SearchConfig {
  debounceMs: number;
  maxResults: number;
  enableFuzzySearch: boolean;
  enableHighlighting: boolean;
  cacheResults: boolean;
  cacheDurationMs: number;
}
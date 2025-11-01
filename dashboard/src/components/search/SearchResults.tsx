import React, { useState } from 'react';
import { SearchResponse, SearchResult, SearchCriteria } from '../../types/search';

// Simple SVG icons
const ViewGridIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const ViewListIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ExclamationIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Status badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clean':
        return 'bg-green-100 text-green-800';
      case 'dirty':
        return 'bg-yellow-100 text-yellow-800';
      case 'missing':
        return 'bg-red-100 text-red-800';
      case 'extra':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {status === 'clean' && <CheckIcon />}
      {(status === 'dirty' || status === 'missing') && <ExclamationIcon />}
      <span className="ml-1 capitalize">{status}</span>
    </span>
  );
};

// Pipeline status badge
const PipelineStatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failure':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {status === 'running' && (
        <div className="w-2 h-2 mr-1 rounded-full bg-blue-500 animate-pulse"></div>
      )}
      <span className="capitalize">{status}</span>
    </span>
  );
};

// Repository card for grid view
const RepositoryCard: React.FC<{
  repository: SearchResult;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
}> = ({ repository, isSelected, onSelect, onDeselect }) => {
  const handleSelectionChange = (checked: boolean) => {
    if (checked) {
      onSelect(repository.id);
    } else {
      onDeselect(repository.id);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className={`bg-white rounded-lg border-2 transition-all hover:shadow-md ${
      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="p-4">
        {/* Header with checkbox and name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleSelectionChange(e.target.checked)}
              className="mt-1 rounded text-blue-600 focus:ring-blue-500"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 truncate">{repository.name}</h3>
              {repository.dashboard_link && (
                <a
                  href={repository.dashboard_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mt-1"
                >
                  View Dashboard
                  <ExternalLinkIcon />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <StatusBadge status={repository.status} />
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            repository.compliance === 'compliant' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {repository.compliance === 'compliant' ? 'Compliant' : 'Non-compliant'}
          </span>
          <PipelineStatusBadge status={repository.pipelineStatus} />
        </div>

        {/* Issues indicators */}
        {(repository.hasUncommittedChanges || repository.hasStaleTags || repository.issues) && (
          <div className="mb-3 space-y-1">
            {repository.hasUncommittedChanges && (
              <div className="flex items-center text-sm text-orange-600">
                <ExclamationIcon />
                <span className="ml-1">Uncommitted changes</span>
              </div>
            )}
            {repository.hasStaleTags && (
              <div className="flex items-center text-sm text-red-600">
                <ExclamationIcon />
                <span className="ml-1">Stale tags</span>
              </div>
            )}
            {repository.issues && repository.issues.count > 0 && (
              <div className="flex items-center text-sm text-gray-600">
                <span>{repository.issues.count} issues</span>
                {repository.issues.critical > 0 && (
                  <span className="ml-2 text-red-600">({repository.issues.critical} critical)</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {repository.tags.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {repository.tags.slice(0, 3).map(tag => (
                <span key={tag} className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                  {tag}
                </span>
              ))}
              {repository.tags.length > 3 && (
                <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded">
                  +{repository.tags.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Last activity */}
        <div className="flex items-center text-sm text-gray-500">
          <ClockIcon />
          <span className="ml-1">Last activity: {formatDate(repository.lastActivity)}</span>
        </div>

        {/* Last commit info */}
        {repository.lastCommit && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
            <div className="font-medium text-gray-700 truncate">
              {repository.lastCommit.message}
            </div>
            <div className="text-gray-500 text-xs mt-1">
              by {repository.lastCommit.author} • {repository.lastCommit.sha.substring(0, 7)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Repository list item for list view
const RepositoryListItem: React.FC<{
  repository: SearchResult;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
}> = ({ repository, isSelected, onSelect, onDeselect }) => {
  const handleSelectionChange = (checked: boolean) => {
    if (checked) {
      onSelect(repository.id);
    } else {
      onDeselect(repository.id);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className={`bg-white rounded-lg border transition-all hover:shadow-sm ${
      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 min-w-0 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleSelectionChange(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="font-semibold text-gray-900 truncate">{repository.name}</h3>
                {repository.dashboard_link && (
                  <a
                    href={repository.dashboard_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLinkIcon />
                  </a>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={repository.status} />
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  repository.compliance === 'compliant' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {repository.compliance === 'compliant' ? 'Compliant' : 'Non-compliant'}
                </span>
                <PipelineStatusBadge status={repository.pipelineStatus} />
                
                {repository.hasUncommittedChanges && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                    Uncommitted
                  </span>
                )}
                {repository.hasStaleTags && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                    Stale tags
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="text-right text-sm text-gray-500 ml-4">
            <div className="flex items-center">
              <ClockIcon />
              <span className="ml-1">{formatDate(repository.lastActivity)}</span>
            </div>
            {repository.issues && repository.issues.count > 0 && (
              <div className="mt-1">
                {repository.issues.count} issues
                {repository.issues.critical > 0 && (
                  <span className="text-red-600"> ({repository.issues.critical} critical)</span>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Tags row */}
        {repository.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {repository.tags.slice(0, 5).map(tag => (
              <span key={tag} className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                {tag}
              </span>
            ))}
            {repository.tags.length > 5 && (
              <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded">
                +{repository.tags.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Loading skeleton
const SearchResultsSkeleton: React.FC<{ viewMode: 'grid' | 'list' }> = ({ viewMode }) => {
  const skeletonItems = Array.from({ length: 6 }, (_, i) => i);

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skeletonItems.map(i => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {skeletonItems.map(i => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

interface SearchResultsProps {
  criteria: SearchCriteria;
  results: SearchResponse | null;
  isLoading: boolean;
  selectedRepositories: string[];
  viewMode: 'grid' | 'list';
  onSelectRepository: (id: string) => void;
  onDeselectRepository: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onClearSearch: () => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  criteria,
  results,
  isLoading,
  selectedRepositories,
  viewMode,
  onSelectRepository,
  onDeselectRepository,
  onSelectAll,
  onClearSelection,
  onSetViewMode,
  onClearSearch
}) => {
  const [showFacets, setShowFacets] = useState(false);

  if (isLoading) {
    return <SearchResultsSkeleton viewMode={viewMode} />;
  }

  const hasQuery = criteria.query || Object.keys(criteria.filters).length > 0;
  const hasResults = results && results.total > 0;

  return (
    <div className="space-y-4">
      {/* Results header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {results?.total || 0} Results
            {results?.took && (
              <span className="text-sm text-gray-500 font-normal ml-2">
                ({results.took}ms)
              </span>
            )}
          </h3>
          {criteria.query && (
            <p className="text-sm text-gray-600">
              for "{criteria.query}"
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Selection controls */}
          {hasResults && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-600">
                {selectedRepositories.length} selected
              </span>
              {selectedRepositories.length < (results?.total || 0) ? (
                <button
                  onClick={onSelectAll}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Select all
                </button>
              ) : (
                <button
                  onClick={onClearSelection}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex border border-gray-300 rounded-lg">
            <button
              onClick={() => onSetViewMode('grid')}
              className={`p-2 rounded-l-lg transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700'
              }`}
              title="Grid view"
            >
              <ViewGridIcon />
            </button>
            <button
              onClick={() => onSetViewMode('list')}
              className={`p-2 rounded-r-lg transition-colors ${
                viewMode === 'list' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700'
              }`}
              title="List view"
            >
              <ViewListIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Facets (if available) */}
      {results?.facets && Object.keys(results.facets).length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <button
            onClick={() => setShowFacets(!showFacets)}
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Filter by category {showFacets ? '▼' : '▶'}
          </button>
          {showFacets && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(results.facets).map(([category, counts]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-gray-700 capitalize mb-2">
                    {category.replace('_', ' ')}
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(counts).map(([value, count]) => (
                      <div key={value} className="text-sm text-gray-600">
                        {value}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results display */}
      {hasResults ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results!.items.map(item => (
              <RepositoryCard
                key={item.id}
                repository={item}
                isSelected={selectedRepositories.includes(item.id)}
                onSelect={onSelectRepository}
                onDeselect={onDeselectRepository}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {results!.items.map(item => (
              <RepositoryListItem
                key={item.id}
                repository={item}
                isSelected={selectedRepositories.includes(item.id)}
                onSelect={onSelectRepository}
                onDeselect={onDeselectRepository}
              />
            ))}
          </div>
        )
      ) : (
        /* No results */
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {hasQuery ? 'No repositories found' : 'Start searching'}
          </h3>
          <p className="text-gray-500 mb-4">
            {hasQuery 
              ? 'No repositories match your search criteria'
              : 'Enter a search term or apply filters to find repositories'
            }
          </p>
          {hasQuery && (
            <button
              onClick={onClearSearch}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Clear search and filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};
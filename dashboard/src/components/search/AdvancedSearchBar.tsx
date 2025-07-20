import React, { useState } from 'react';
import { SearchCriteria } from '../../types/search';

// Using simpler icon alternatives since we don't have Heroicons installed
const SearchIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
  </svg>
);

const FilterIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
  </svg>
);

const SaveIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const XIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface FilterPanelProps {
  filters: SearchCriteria['filters'];
  onFiltersChange: (filters: SearchCriteria['filters']) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onFiltersChange }) => {
  const handleStatusChange = (status: string, checked: boolean) => {
    const currentStatus = filters.status || [];
    const newStatus = checked
      ? [...currentStatus, status as any]
      : currentStatus.filter(s => s !== status);
    onFiltersChange({ ...filters, status: newStatus.length > 0 ? newStatus : undefined });
  };

  const handleComplianceChange = (compliance: string, checked: boolean) => {
    const currentCompliance = filters.compliance || [];
    const newCompliance = checked
      ? [...currentCompliance, compliance as any]
      : currentCompliance.filter(c => c !== compliance);
    onFiltersChange({ ...filters, compliance: newCompliance.length > 0 ? newCompliance : undefined });
  };

  const handlePipelineStatusChange = (status: string, checked: boolean) => {
    const currentPipelineStatus = filters.pipelineStatus || [];
    const newPipelineStatus = checked
      ? [...currentPipelineStatus, status as any]
      : currentPipelineStatus.filter(s => s !== status);
    onFiltersChange({ ...filters, pipelineStatus: newPipelineStatus.length > 0 ? newPipelineStatus : undefined });
  };

  return (
    <div className="mt-4 p-4 border-t bg-gray-50 rounded-b-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Repository Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Repository Status
          </label>
          <div className="space-y-2">
            {['clean', 'dirty', 'missing', 'extra'].map(status => (
              <label key={status} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.status?.includes(status as any) || false}
                  onChange={(e) => handleStatusChange(status, e.target.checked)}
                  className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="capitalize text-sm">{status}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Compliance Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Compliance
          </label>
          <div className="space-y-2">
            {['compliant', 'non-compliant'].map(status => (
              <label key={status} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.compliance?.includes(status as any) || false}
                  onChange={(e) => handleComplianceChange(status, e.target.checked)}
                  className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="capitalize text-sm">{status.replace('-', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Pipeline Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pipeline Status
          </label>
          <div className="space-y-2">
            {['success', 'failure', 'pending', 'running'].map(status => (
              <label key={status} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.pipelineStatus?.includes(status as any) || false}
                  onChange={(e) => handlePipelineStatusChange(status, e.target.checked)}
                  className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="capitalize text-sm">{status}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Last Activity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Last Activity
          </label>
          <select
            value={filters.lastActivityDays || ''}
            onChange={(e) => onFiltersChange({
              ...filters,
              lastActivityDays: e.target.value ? parseInt(e.target.value) : undefined
            })}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Any time</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {/* Additional Issues */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Issues
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.hasUncommittedChanges || false}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  hasUncommittedChanges: e.target.checked || undefined
                })}
                className="mr-2 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Has uncommitted changes</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.hasStaleTags || false}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  hasStaleTags: e.target.checked || undefined
                })}
                className="mr-2 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Has stale tags</span>
            </label>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <input
            type="text"
            placeholder="Enter tags (comma separated)"
            value={filters.tags?.join(', ') || ''}
            onChange={(e) => {
              const tags = e.target.value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
              onFiltersChange({
                ...filters,
                tags: tags.length > 0 ? tags : undefined
              });
            }}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Filter summary and clear button */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {Object.keys(filters).length > 0 && (
            <span>
              {Object.keys(filters).length} filter{Object.keys(filters).length !== 1 ? 's' : ''} applied
            </span>
          )}
        </div>
        <button
          onClick={() => onFiltersChange({})}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          disabled={Object.keys(filters).length === 0}
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
};

interface SaveViewDialogProps {
  criteria: SearchCriteria;
  onSave: (name: string) => void;
  onClose: () => void;
}

const SaveViewDialog: React.FC<SaveViewDialogProps> = ({ criteria, onSave, onClose }) => {
  const [viewName, setViewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewName.trim()) {
      onSave(viewName.trim());
      setViewName('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Save Search View</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              View Name
            </label>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Enter a name for this view"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>

          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm text-gray-600 mb-2">This view will save:</p>
            <ul className="text-xs text-gray-500 space-y-1">
              {criteria.query && <li>• Search query: "{criteria.query}"</li>}
              {Object.keys(criteria.filters).length > 0 && (
                <li>• {Object.keys(criteria.filters).length} filter(s)</li>
              )}
              {criteria.sort && (
                <li>• Sort by: {criteria.sort.field} ({criteria.sort.direction})</li>
              )}
            </ul>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!viewName.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save View
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AdvancedSearchBarProps {
  criteria: SearchCriteria;
  onSearch: (criteria: SearchCriteria) => void;
  onSaveView?: (name: string, criteria: SearchCriteria) => void;
  isLoading?: boolean;
}

export const AdvancedSearchBar: React.FC<AdvancedSearchBarProps> = ({
  criteria,
  onSearch,
  onSaveView,
  isLoading = false
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleQueryChange = (query: string) => {
    const newCriteria = { ...criteria, query };
    onSearch(newCriteria);
  };

  const handleFiltersChange = (filters: SearchCriteria['filters']) => {
    const newCriteria = { ...criteria, filters };
    onSearch(newCriteria);
  };

  const handleSaveView = (name: string) => {
    onSaveView?.(name, criteria);
    setShowSaveDialog(false);
  };

  const hasActiveFilters = Object.keys(criteria.filters).length > 0;

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Main search input */}
      <div className="p-4">
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <SearchIcon />
            <input
              type="text"
              value={criteria.query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search repositories, files, commits..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3 rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <FilterIcon />
          </button>
          
          {onSaveView && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="p-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
              title="Save current search"
              disabled={!criteria.query && !hasActiveFilters}
            >
              <SaveIcon />
            </button>
          )}
        </div>

        {/* Quick filter chips */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap gap-2">
            {criteria.filters.status?.map(status => (
              <span
                key={`status-${status}`}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
              >
                Status: {status}
                <button
                  onClick={() => {
                    const newStatus = criteria.filters.status?.filter(s => s !== status);
                    handleFiltersChange({
                      ...criteria.filters,
                      status: newStatus?.length ? newStatus : undefined
                    });
                  }}
                  className="ml-1 hover:text-blue-600"
                >
                  <XIcon />
                </button>
              </span>
            ))}
            {criteria.filters.compliance?.map(compliance => (
              <span
                key={`compliance-${compliance}`}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
              >
                {compliance.replace('-', ' ')}
                <button
                  onClick={() => {
                    const newCompliance = criteria.filters.compliance?.filter(c => c !== compliance);
                    handleFiltersChange({
                      ...criteria.filters,
                      compliance: newCompliance?.length ? newCompliance : undefined
                    });
                  }}
                  className="ml-1 hover:text-green-600"
                >
                  <XIcon />
                </button>
              </span>
            ))}
            {criteria.filters.hasUncommittedChanges && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                Uncommitted changes
                <button
                  onClick={() => handleFiltersChange({
                    ...criteria.filters,
                    hasUncommittedChanges: undefined
                  })}
                  className="ml-1 hover:text-orange-600"
                >
                  <XIcon />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filters={criteria.filters}
          onFiltersChange={handleFiltersChange}
        />
      )}

      {/* Save view dialog */}
      {showSaveDialog && (
        <SaveViewDialog
          criteria={criteria}
          onSave={handleSaveView}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
};
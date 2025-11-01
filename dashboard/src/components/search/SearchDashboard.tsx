import React from 'react';
import { useSearch } from '../../hooks/useSearch';
import { AdvancedSearchBar } from './AdvancedSearchBar';
import { SavedViews } from './SavedViews';
import { SearchResults } from './SearchResults';
import { QuickActions } from './QuickActions';

interface SearchDashboardProps {
  className?: string;
}

export const SearchDashboard: React.FC<SearchDashboardProps> = ({ className = '' }) => {
  const {
    criteria,
    results,
    isLoading,
    error,
    selectedRepositories,
    viewMode,
    savedViews,
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
    refreshSearch
  } = useSearch();

  const handleSearch = (newCriteria: typeof criteria) => {
    updateCriteria(newCriteria);
  };

  const handleSaveView = async (name: string, viewCriteria: any) => {
    try {
      await saveView(name, viewCriteria);
    } catch (error) {
      console.error('Failed to save view:', error);
      // You could add a toast notification here
    }
  };

  const handleDeleteView = async (viewId: string) => {
    try {
      await deleteView(viewId);
    } catch (error) {
      console.error('Failed to delete view:', error);
      // You could add a toast notification here
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repository Search</h1>
          <p className="text-gray-600">
            Find and manage repositories with advanced filtering and bulk operations
          </p>
        </div>
        
        {/* Quick stats */}
        {results && (
          <div className="flex space-x-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.total}</div>
              <div className="text-sm text-gray-600">Total Results</div>
            </div>
            {selectedRepositories.length > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{selectedRepositories.length}</div>
                <div className="text-sm text-gray-600">Selected</div>
              </div>
            )}
            {results.took && (
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{results.took}ms</div>
                <div className="text-sm text-gray-600">Search Time</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-red-800">{error}</span>
            <button
              onClick={refreshSearch}
              className="ml-auto text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Search interface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main search and results */}
        <div className="lg:col-span-3 space-y-6">
          {/* Advanced search bar */}
          <AdvancedSearchBar
            criteria={criteria}
            onSearch={handleSearch}
            onSaveView={handleSaveView}
            isLoading={isLoading}
          />

          {/* Search results */}
          <SearchResults
            criteria={criteria}
            results={results}
            isLoading={isLoading}
            selectedRepositories={selectedRepositories}
            viewMode={viewMode}
            onSelectRepository={selectRepository}
            onDeselectRepository={deselectRepository}
            onSelectAll={selectAllRepositories}
            onClearSelection={clearSelection}
            onSetViewMode={setViewMode}
            onClearSearch={clearSearch}
          />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Saved views */}
          <SavedViews
            savedViews={savedViews}
            onApplyView={applyView}
            onDeleteView={handleDeleteView}
            isLoading={isLoading}
          />

          {/* Search tips */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Search Tips</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <div>• Use quotes for exact matches: "prod-env"</div>
              <div>• Filter by multiple statuses</div>
              <div>• Save frequent searches as views</div>
              <div>• Select multiple repos for bulk actions</div>
            </div>
          </div>

          {/* Quick filters */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Filters</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleSearch({ ...criteria, filters: { status: ['dirty'] } })}
                className="w-full text-left px-3 py-2 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
              >
                Dirty Repositories
              </button>
              <button
                onClick={() => handleSearch({ ...criteria, filters: { hasUncommittedChanges: true } })}
                className="w-full text-left px-3 py-2 text-sm bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 transition-colors"
              >
                Uncommitted Changes
              </button>
              <button
                onClick={() => handleSearch({ ...criteria, filters: { pipelineStatus: ['failure'] } })}
                className="w-full text-left px-3 py-2 text-sm bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
              >
                Failed Pipelines
              </button>
              <button
                onClick={() => handleSearch({ ...criteria, filters: { compliance: ['non-compliant'] } })}
                className="w-full text-left px-3 py-2 text-sm bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
              >
                Non-Compliant
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions (floating) */}
      <QuickActions
        selectedRepositories={selectedRepositories}
        onBulkAction={performBulkAction}
        onClearSelection={clearSelection}
      />
    </div>
  );
};
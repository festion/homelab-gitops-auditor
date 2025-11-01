import React, { useState } from 'react';
import { SavedView, SearchCriteria } from '../../types/search';

// Simple SVG icons
const TrashIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
  </svg>
);

// Helper function to generate a readable description of the search criteria
const getViewDescription = (criteria: SearchCriteria): string => {
  const parts: string[] = [];
  
  if (criteria.query) {
    parts.push(`"${criteria.query}"`);
  }
  
  const filterCount = Object.keys(criteria.filters).length;
  if (filterCount > 0) {
    parts.push(`${filterCount} filter${filterCount !== 1 ? 's' : ''}`);
  }
  
  if (criteria.sort && criteria.sort.field !== 'name') {
    parts.push(`sorted by ${criteria.sort.field}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'All repositories';
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  } catch {
    return 'Unknown';
  }
};

interface SavedViewsProps {
  savedViews: SavedView[];
  onApplyView: (criteria: SearchCriteria) => void;
  onDeleteView?: (viewId: string) => void;
  onSetDefaultView?: (viewId: string) => void;
  isLoading?: boolean;
}

export const SavedViews: React.FC<SavedViewsProps> = ({
  savedViews,
  onApplyView,
  onDeleteView,
  onSetDefaultView,
  isLoading = false
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDeleteClick = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(viewId);
  };

  const handleConfirmDelete = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteView?.(viewId);
    setConfirmDelete(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(null);
  };

  const handleSetDefault = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSetDefaultView?.(viewId);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold mb-4">Saved Views</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Saved Views</h3>
        <p className="text-sm text-gray-600 mt-1">
          Quick access to your saved search configurations
        </p>
      </div>
      
      <div className="p-4">
        {savedViews.length === 0 ? (
          <div className="text-center py-8">
            <SearchIcon />
            <p className="text-gray-500 mt-2">No saved views yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Save your current search to quickly access it later
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {savedViews.map(view => (
              <div
                key={view.id}
                className="group relative p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-all cursor-pointer"
                onClick={() => onApplyView(view.criteria)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-medium text-gray-900 truncate">
                        {view.name}
                      </h4>
                      {view.isDefault && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                          <StarIcon filled />
                          <span className="ml-1">Default</span>
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                      {getViewDescription(view.criteria)}
                    </p>
                    
                    <div className="flex items-center text-xs text-gray-500">
                      <ClockIcon />
                      <span className="ml-1">
                        Created {formatDate(view.createdAt)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!view.isDefault && onSetDefaultView && (
                      <button
                        onClick={(e) => handleSetDefault(view.id, e)}
                        className="p-1 text-gray-400 hover:text-yellow-500 transition-colors"
                        title="Set as default view"
                      >
                        <StarIcon />
                      </button>
                    )}
                    
                    {onDeleteView && (
                      <>
                        {confirmDelete === view.id ? (
                          <div className="flex space-x-1">
                            <button
                              onClick={(e) => handleConfirmDelete(view.id, e)}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              title="Confirm delete"
                            >
                              Delete
                            </button>
                            <button
                              onClick={handleCancelDelete}
                              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                              title="Cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => handleDeleteClick(view.id, e)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete view"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {/* Filter details */}
                {Object.keys(view.criteria.filters).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {view.criteria.filters.status && (
                        <span className="inline-block px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                          Status: {view.criteria.filters.status.join(', ')}
                        </span>
                      )}
                      {view.criteria.filters.compliance && (
                        <span className="inline-block px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                          Compliance: {view.criteria.filters.compliance.join(', ')}
                        </span>
                      )}
                      {view.criteria.filters.pipelineStatus && (
                        <span className="inline-block px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded">
                          Pipeline: {view.criteria.filters.pipelineStatus.join(', ')}
                        </span>
                      )}
                      {view.criteria.filters.hasUncommittedChanges && (
                        <span className="inline-block px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
                          Uncommitted changes
                        </span>
                      )}
                      {view.criteria.filters.hasStaleTags && (
                        <span className="inline-block px-2 py-1 text-xs bg-red-50 text-red-700 rounded">
                          Stale tags
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
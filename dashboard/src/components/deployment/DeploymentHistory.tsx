import React, { useState, useEffect, useCallback } from 'react';
import { 
  History, 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  User,
  GitBranch,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download
} from 'lucide-react';
import { useDeploymentService } from '../../services/deploymentService';
import type { DeploymentHistory as DeploymentHistoryType, DeploymentFilters, DeploymentHistoryItem } from '../../types/deployment';

interface DeploymentHistoryProps {
  repositoryName: string;
  className?: string;
}

export const DeploymentHistory: React.FC<DeploymentHistoryProps> = ({
  repositoryName,
  className = ''
}) => {
  const { getDeploymentHistory, isLoading } = useDeploymentService();
  const [history, setHistory] = useState<DeploymentHistoryType | null>(null);
  const [filters, setFilters] = useState<DeploymentFilters>({
    limit: 20,
    offset: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const historyData = await getDeploymentHistory(repositoryName, {
        ...filters,
        author: searchTerm || undefined
      });
      setHistory(historyData);
    } catch (err) {
      console.error('Failed to fetch deployment history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deployment history');
    }
  }, [repositoryName, filters, searchTerm, getDeploymentHistory]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFilterChange = (key: keyof DeploymentFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0 // Reset to first page when filters change
    }));
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    if (!history) return;
    
    const newOffset = direction === 'next' 
      ? (filters.offset || 0) + (filters.limit || 20)
      : Math.max(0, (filters.offset || 0) - (filters.limit || 20));
    
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  const toggleExpanded = (deploymentId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deploymentId)) {
        newSet.delete(deploymentId);
      } else {
        newSet.add(deploymentId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: DeploymentHistoryItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in-progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: DeploymentHistoryItem['status']) => {
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-700`;
      case 'failed':
        return `${baseClasses} bg-red-100 text-red-700`;
      case 'in-progress':
        return `${baseClasses} bg-blue-100 text-blue-700`;
      case 'queued':
        return `${baseClasses} bg-yellow-100 text-yellow-700`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-700`;
    }
  };

  const formatDuration = (duration: number) => {
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const exportHistory = () => {
    if (!history) return;
    
    const csvData = [
      ['Deployment ID', 'Repository', 'Branch', 'Author', 'Status', 'Start Time', 'Duration', 'Reason'].join(','),
      ...history.deployments.map(deployment => [
        deployment.deploymentId,
        deployment.repository,
        deployment.branch,
        deployment.author,
        deployment.status,
        new Date(deployment.startTime).toISOString(),
        deployment.duration ? formatDuration(deployment.duration) : 'N/A',
        `"${deployment.reason.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deployment-history-${repositoryName}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <History className="h-5 w-5 mr-2" />
            Deployment History
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {showFilters ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </button>
            <button
              onClick={fetchHistory}
              disabled={isLoading}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              title="Refresh history"
            >
              <RefreshCw className={`h-4 w-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportHistory}
              disabled={!history || history.deployments.length === 0}
              className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              title="Export to CSV"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </button>
          </div>
        </div>
        
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Author</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by author..."
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status?.[0] || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value ? [e.target.value] : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="queued">Queued</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <input
                  type="text"
                  value={filters.branch || ''}
                  onChange={(e) => handleFilterChange('branch', e.target.value || undefined)}
                  placeholder="Filter by branch..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-400 mr-2" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-gray-600">Loading deployment history...</span>
          </div>
        )}

        {!isLoading && history && history.deployments.length === 0 && (
          <div className="text-center py-8">
            <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No deployment history found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or check back later</p>
          </div>
        )}

        {history && history.deployments.length > 0 && (
          <div className="space-y-3">
            {history.deployments.map((deployment) => (
              <div 
                key={deployment.deploymentId}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <div 
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => toggleExpanded(deployment.deploymentId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(deployment.status)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm text-gray-900">
                            {deployment.deploymentId.substring(0, 8)}...
                          </span>
                          <span className={getStatusBadge(deployment.status)}>
                            {deployment.status}
                          </span>
                          {deployment.isRollback && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              Rollback
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {deployment.author}
                          </span>
                          <span className="flex items-center">
                            <GitBranch className="h-3 w-3 mr-1" />
                            {deployment.branch}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(deployment.startTime).toLocaleString()}
                          </span>
                          {deployment.duration && (
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDuration(deployment.duration)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      {expandedItems.has(deployment.deploymentId) ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
                
                {expandedItems.has(deployment.deploymentId) && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                    <div className="mt-3 space-y-3">
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-1">Deployment Reason</h5>
                        <p className="text-sm text-gray-700 bg-white p-2 rounded border">
                          {deployment.reason}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Full Deployment ID:</span>
                          <p className="font-mono text-xs text-gray-600 mt-1 break-all">
                            {deployment.deploymentId}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Repository:</span>
                          <p className="text-gray-600 mt-1">{deployment.repository}</p>
                        </div>
                        {deployment.version && (
                          <div>
                            <span className="font-medium text-gray-700">Version:</span>
                            <p className="text-gray-600 mt-1">{deployment.version}</p>
                          </div>
                        )}
                        {deployment.endTime && (
                          <div>
                            <span className="font-medium text-gray-700">Completed:</span>
                            <p className="text-gray-600 mt-1">
                              {new Date(deployment.endTime).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {history && (history.hasNext || history.hasPrevious) && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              Showing {(filters.offset || 0) + 1} - {Math.min((filters.offset || 0) + (filters.limit || 20), history.totalCount)} of {history.totalCount} deployments
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange('prev')}
                disabled={!history.hasPrevious || isLoading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange('next')}
                disabled={!history.hasNext || isLoading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
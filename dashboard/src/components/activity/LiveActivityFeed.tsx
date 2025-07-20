import React, { useState, useMemo, useCallback } from 'react';
import { Clock, Filter, X, ExternalLink, AlertCircle, CheckCircle, GitBranch, Play, Pause } from 'lucide-react';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';

interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: {
    repository?: string;
    branch?: string;
    workflow?: string;
    runId?: number;
    level?: 'info' | 'warning' | 'error' | 'success';
    url?: string;
  };
}

interface LiveActivityFeedProps {
  maxActivities?: number;
  autoScroll?: boolean;
  showFilters?: boolean;
  compact?: boolean;
  className?: string;
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  maxActivities = 50,
  autoScroll = true,
  showFilters = true,
  compact = false,
  className = ''
}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const generateActivityId = () => 
    `activity_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

  // Subscribe to all activity events
  useRealTimeUpdates('activity:new', useCallback((data: any) => {
    if (isPaused) return;

    const newActivity: Activity = {
      id: data.id || generateActivityId(),
      type: data.type || 'general',
      message: data.message || 'Unknown activity',
      timestamp: data.timestamp || new Date().toISOString(),
      metadata: data.metadata || {}
    };

    setActivities(prev => [newActivity, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  // Subscribe to various event types and convert them to activities
  useRealTimeUpdates('repo:push', useCallback((data: any) => {
    if (isPaused) return;
    
    setActivities(prev => [{
      id: generateActivityId(),
      type: 'repository',
      message: `New push to ${data.repository}/${data.branch} (${data.commits} commits)`,
      timestamp: new Date().toISOString(),
      metadata: {
        repository: data.repository,
        branch: data.branch,
        level: 'info' as const
      }
    }, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  useRealTimeUpdates('pipeline:started', useCallback((data: any) => {
    if (isPaused) return;
    
    setActivities(prev => [{
      id: generateActivityId(),
      type: 'pipeline',
      message: `Pipeline "${data.workflow}" started for ${data.repository}`,
      timestamp: new Date().toISOString(),
      metadata: {
        repository: data.repository,
        workflow: data.workflow,
        runId: data.runId,
        level: 'info' as const
      }
    }, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  useRealTimeUpdates('pipeline:completed', useCallback((data: any) => {
    if (isPaused) return;
    
    setActivities(prev => [{
      id: generateActivityId(),
      type: 'pipeline',
      message: `Pipeline "${data.workflow}" ${data.conclusion} for ${data.repository}`,
      timestamp: new Date().toISOString(),
      metadata: {
        repository: data.repository,
        workflow: data.workflow,
        runId: data.runId,
        level: data.conclusion === 'success' ? 'success' as const : 'error' as const
      }
    }, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  useRealTimeUpdates('audit:completed', useCallback((data: any) => {
    if (isPaused) return;
    
    setActivities(prev => [{
      id: generateActivityId(),
      type: 'audit',
      message: `Audit completed in ${data.duration}s`,
      timestamp: new Date().toISOString(),
      metadata: {
        level: 'success' as const
      }
    }, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  useRealTimeUpdates('system:alert', useCallback((data: any) => {
    if (isPaused) return;
    
    setActivities(prev => [{
      id: generateActivityId(),
      type: 'system',
      message: data.message,
      timestamp: new Date().toISOString(),
      metadata: {
        level: data.level as any
      }
    }, ...prev].slice(0, maxActivities));
  }, [isPaused, maxActivities]));

  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(activity => activity.type === filter);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(activity =>
        activity.message.toLowerCase().includes(term) ||
        activity.metadata?.repository?.toLowerCase().includes(term) ||
        activity.metadata?.workflow?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [activities, filter, searchTerm]);

  const activityTypes = useMemo(() => {
    const types = new Set(activities.map(a => a.type));
    return Array.from(types).sort();
  }, [activities]);

  const clearActivities = () => setActivities([]);

  return (
    <div className={`bg-white rounded-lg shadow-md ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Live Activity</h3>
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-500' : 'bg-green-500'}`} />
            <span className="text-sm text-gray-500">
              {isPaused ? 'Paused' : 'Live'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Pause/Resume Button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1 rounded ${isPaused ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Clear Button */}
          <button
            onClick={clearActivities}
            className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
            title="Clear activities"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border-b border-gray-200 space-y-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Type Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Activities ({activities.length})</option>
              {activityTypes.map(type => {
                const count = activities.filter(a => a.type === type).length;
                return (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className={`${compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto`}>
        {filteredActivities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>No activities {searchTerm || filter !== 'all' ? 'match your filters' : 'yet'}</p>
            {(searchTerm || filter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilter('all');
                }}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {filteredActivities.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex justify-between items-center">
          <span>
            Showing {filteredActivities.length} of {activities.length} activities
          </span>
          {isPaused && (
            <span className="text-orange-600 font-medium">
              ⏸ Updates paused
            </span>
          )}
        </div>
      )}
    </div>
  );
};

interface ActivityItemProps {
  activity: Activity;
  compact?: boolean;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, compact = false }) => {
  const getIcon = () => {
    switch (activity.type) {
      case 'repository':
        return <GitBranch className="w-4 h-4 text-blue-500" />;
      case 'pipeline':
        return <Play className="w-4 h-4 text-purple-500" />;
      case 'audit':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'system':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-400" />;
    }
  };

  const getLevelColor = () => {
    switch (activity.metadata?.level) {
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);

      if (diffSeconds < 60) return `${diffSeconds}s ago`;
      if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
      if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown time';
    }
  };

  return (
    <div className={`flex items-start space-x-3 p-3 hover:bg-gray-50 transition-colors duration-150 ${compact ? 'py-2' : ''}`}>
      <div className="flex-shrink-0 mt-0.5">
        {getIcon()}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={`${compact ? 'text-sm' : 'text-sm'} ${getLevelColor()}`}>
          {activity.message}
        </p>
        
        <div className="flex items-center space-x-3 mt-1">
          <span className="text-xs text-gray-500">
            {formatTime(activity.timestamp)}
          </span>
          
          {activity.metadata?.repository && (
            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
              {activity.metadata.repository}
            </span>
          )}
          
          {activity.metadata?.workflow && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {activity.metadata.workflow}
            </span>
          )}
        </div>
      </div>

      {activity.metadata?.url && (
        <button
          onClick={() => window.open(activity.metadata?.url, '_blank')}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-blue-600 transition-colors duration-150"
          title="Open external link"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
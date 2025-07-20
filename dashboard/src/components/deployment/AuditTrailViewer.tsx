import React, { useState, useEffect } from 'react';
import {
  Shield,
  Eye,
  Filter,
  Search,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Info,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useDeploymentService } from '../../services/deploymentService';
import { useDeploymentUpdates } from '../../hooks/useDeploymentUpdates';
import type { AuditEvent } from '../../types/deployment';

interface AuditTrailViewerProps {
  className?: string;
}

export const AuditTrailViewer: React.FC<AuditTrailViewerProps> = ({
  className = ''
}) => {
  const { getAuditEvents, isLoading } = useDeploymentService();
  const { subscribe } = useDeploymentUpdates();
  
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState({
    type: '',
    severity: '',
    user: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchAuditEvents = async () => {
    try {
      setError(null);
      const events = await getAuditEvents({
        limit: 100,
        ...filters
      });
      setAuditEvents(events);
    } catch (err) {
      console.error('Failed to fetch audit events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch audit events');
    }
  };

  useEffect(() => {
    fetchAuditEvents();
  }, []);

  // Subscribe to real-time audit events
  useEffect(() => {
    const unsubscribe = subscribe('audit_event', (event) => {
      setAuditEvents(prev => [event, ...prev].slice(0, 100)); // Keep last 100 events
    });

    return unsubscribe;
  }, [subscribe]);

  // Apply filters
  useEffect(() => {
    let filtered = auditEvents;

    if (filters.type) {
      filtered = filtered.filter(event => event.type === filters.type);
    }

    if (filters.severity) {
      filtered = filtered.filter(event => event.severity === filters.severity);
    }

    if (filters.user) {
      filtered = filtered.filter(event => 
        event.user.toLowerCase().includes(filters.user.toLowerCase())
      );
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(event => 
        event.action.toLowerCase().includes(searchLower) ||
        event.resource.toLowerCase().includes(searchLower) ||
        JSON.stringify(event.details).toLowerCase().includes(searchLower)
      );
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(event => new Date(event.timestamp) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo + 'T23:59:59');
      filtered = filtered.filter(event => new Date(event.timestamp) <= toDate);
    }

    setFilteredEvents(filtered);
  }, [auditEvents, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const getSeverityIcon = (severity: AuditEvent['severity']) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: AuditEvent['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getTypeIcon = (type: AuditEvent['type']) => {
    switch (type) {
      case 'deployment':
        return <Activity className="h-4 w-4 text-green-500" />;
      case 'rollback':
        return <Activity className="h-4 w-4 text-orange-500" />;
      case 'configuration':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'access':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'security':
        return <Shield className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const exportAuditTrail = () => {
    const csvData = [
      ['Timestamp', 'Type', 'Severity', 'User', 'Action', 'Resource', 'IP Address'].join(','),
      ...filteredEvents.map(event => [
        new Date(event.timestamp).toISOString(),
        event.type,
        event.severity,
        event.user,
        `"${event.action.replace(/"/g, '""')}"`,
        `"${event.resource.replace(/"/g, '""')}"`,
        event.ipAddress || 'N/A'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Audit Trail
          </h2>
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
              onClick={fetchAuditEvents}
              disabled={isLoading}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              title="Refresh audit trail"
            >
              <RefreshCw className={`h-4 w-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportAuditTrail}
              disabled={filteredEvents.length === 0}
              className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              title="Export audit trail"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All types</option>
                  <option value="deployment">Deployment</option>
                  <option value="rollback">Rollback</option>
                  <option value="configuration">Configuration</option>
                  <option value="access">Access</option>
                  <option value="security">Security</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={filters.severity}
                  onChange={(e) => handleFilterChange('severity', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={filters.user}
                    onChange={(e) => handleFilterChange('user', e.target.value)}
                    placeholder="Filter by user..."
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    placeholder="Search actions, resources..."
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-400 mr-2" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {isLoading && auditEvents.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-gray-600">Loading audit events...</span>
          </div>
        )}

        {!isLoading && filteredEvents.length === 0 && auditEvents.length === 0 && (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No audit events found</p>
            <p className="text-xs text-gray-400 mt-1">Events will appear here as they occur</p>
          </div>
        )}

        {!isLoading && filteredEvents.length === 0 && auditEvents.length > 0 && (
          <div className="text-center py-8">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No events match your filters</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search criteria</p>
          </div>
        )}

        {filteredEvents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
              <span>Showing {filteredEvents.length} of {auditEvents.length} events</span>
              <span>Live updates enabled</span>
            </div>

            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <div
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => toggleExpanded(event.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getSeverityIcon(event.severity)}
                      {getTypeIcon(event.type)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{event.action}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                            {event.severity}
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {event.type}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {event.user}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatRelativeTime(event.timestamp)}
                          </span>
                          <span>Resource: {event.resource}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      {expandedEvents.has(event.id) ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedEvents.has(event.id) && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Event ID:</span>
                          <p className="font-mono text-xs text-gray-600 mt-1">{event.id}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Timestamp:</span>
                          <p className="text-gray-600 mt-1">
                            {new Date(event.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {event.ipAddress && (
                          <div>
                            <span className="font-medium text-gray-700">IP Address:</span>
                            <p className="font-mono text-xs text-gray-600 mt-1">{event.ipAddress}</p>
                          </div>
                        )}
                        {event.userAgent && (
                          <div>
                            <span className="font-medium text-gray-700">User Agent:</span>
                            <p className="text-xs text-gray-600 mt-1 truncate" title={event.userAgent}>
                              {event.userAgent}
                            </p>
                          </div>
                        )}
                      </div>

                      {Object.keys(event.details).length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700 block mb-2">Event Details:</span>
                          <div className="bg-white border rounded p-3 max-h-48 overflow-y-auto">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </div>
                        </div>
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
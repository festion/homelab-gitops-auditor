import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import StatusIndicator from './shared/StatusIndicator';
import ProgressBar from './shared/ProgressBar';
import './styles/WikiAgent.css';

const SyncStatus = () => {
  const [syncState, setSyncState] = useState({
    status: 'idle',
    lastSync: null,
    nextScheduledSync: null,
    syncMode: 'automatic',
    isRunning: false,
    progress: 0,
    currentOperation: ''
  });

  const [syncHistory, setSyncHistory] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [loading, setLoading] = useState(true);

  const { lastMessage } = useWebSocket('/api/wiki-agent/ws');

  useEffect(() => {
    fetchSyncData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      switch (data.type) {
        case 'sync_update':
          setSyncState(prev => ({ ...prev, ...data.payload }));
          break;
        case 'sync_conflict':
          setConflicts(prev => [...prev, data.payload]);
          break;
        case 'sync_history':
          setSyncHistory(data.payload);
          break;
      }
    }
  }, [lastMessage]);

  const fetchSyncData = async () => {
    try {
      setLoading(true);
      const [stateRes, historyRes, conflictsRes] = await Promise.all([
        fetch('/api/wiki-agent/sync/status'),
        fetch('/api/wiki-agent/sync/history?limit=10'),
        fetch('/api/wiki-agent/sync/conflicts')
      ]);

      if (stateRes.ok) {
        const stateData = await stateRes.json();
        setSyncState(stateData);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setSyncHistory(historyData);
      }

      if (conflictsRes.ok) {
        const conflictsData = await conflictsRes.json();
        setConflicts(conflictsData);
      }
    } catch (error) {
      console.error('Error fetching sync data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAction = async (action) => {
    try {
      const response = await fetch(`/api/wiki-agent/sync/${action}`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchSyncData();
      }
    } catch (error) {
      console.error(`Error performing sync action ${action}:`, error);
    }
  };

  const handleConflictResolution = async (conflictId, resolution) => {
    try {
      const response = await fetch(`/api/wiki-agent/sync/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution })
      });

      if (response.ok) {
        setConflicts(prev => prev.filter(c => c.id !== conflictId));
        setShowConflictModal(false);
        setSelectedConflict(null);
      }
    } catch (error) {
      console.error('Error resolving conflict:', error);
    }
  };

  const changeSyncMode = async (mode) => {
    try {
      const response = await fetch('/api/wiki-agent/sync/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });

      if (response.ok) {
        setSyncState(prev => ({ ...prev, syncMode: mode }));
      }
    } catch (error) {
      console.error('Error changing sync mode:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeUntilNextSync = () => {
    if (!syncState.nextScheduledSync) return null;
    const now = Date.now();
    const next = new Date(syncState.nextScheduledSync).getTime();
    const diff = next - now;
    
    if (diff <= 0) return 'Any moment now';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getSyncStatusIcon = () => {
    if (syncState.isRunning) return 'syncing';
    if (syncState.status === 'error') return 'error';
    if (syncState.status === 'success') return 'online';
    return 'idle';
  };

  const getSyncOutcome = (outcome) => {
    const outcomes = {
      success: { class: 'wiki-agent-badge-success', label: 'Success' },
      partial: { class: 'wiki-agent-badge-warning', label: 'Partial' },
      failed: { class: 'wiki-agent-badge-error', label: 'Failed' },
      cancelled: { class: 'wiki-agent-badge-info', label: 'Cancelled' }
    };
    return outcomes[outcome] || outcomes.failed;
  };

  if (loading) {
    return (
      <div className="wiki-agent-panel">
        <div className="space-y-4">
          <div className="wiki-agent-skeleton h-32 w-full"></div>
          <div className="wiki-agent-skeleton h-64 w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Status Overview */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Synchronization Status</h2>
            <div className="mt-2 flex items-center space-x-4">
              <StatusIndicator 
                status={getSyncStatusIcon()} 
                size="medium"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Mode: {syncState.syncMode}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSyncAction('manual')}
              disabled={syncState.isRunning}
              className="wiki-agent-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sync Now
            </button>
            <select
              value={syncState.syncMode}
              onChange={(e) => changeSyncMode(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>

        {/* Sync Information */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last Sync</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {formatTimestamp(syncState.lastSync)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Next Scheduled</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {syncState.syncMode === 'automatic' || syncState.syncMode === 'scheduled' 
                ? getTimeUntilNextSync() || formatTimestamp(syncState.nextScheduledSync)
                : 'Manual mode'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Conflicts</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {conflicts.length > 0 ? (
                <span className="text-red-600 dark:text-red-400">{conflicts.length} pending</span>
              ) : (
                <span className="text-green-600 dark:text-green-400">None</span>
              )}
            </p>
          </div>
        </div>

        {/* Active Sync Progress */}
        {syncState.isRunning && (
          <div className="mt-6">
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {syncState.currentOperation || 'Synchronizing...'}
              </p>
            </div>
            <ProgressBar 
              progress={syncState.progress}
              color="blue"
              height="medium"
              animated={true}
            />
          </div>
        )}
      </div>

      {/* Conflict Management */}
      {conflicts.length > 0 && (
        <div className="wiki-agent-panel border-yellow-200 dark:border-yellow-800">
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-200 mb-4">
            Sync Conflicts ({conflicts.length})
          </h3>
          <div className="space-y-3">
            {conflicts.slice(0, 5).map((conflict) => (
              <div 
                key={conflict.id} 
                className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {conflict.documentPath}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Type: {conflict.type} | Detected: {new Date(conflict.detectedAt).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedConflict(conflict);
                    setShowConflictModal(true);
                  }}
                  className="wiki-agent-btn-secondary text-sm"
                >
                  Resolve
                </button>
              </div>
            ))}
            
            {conflicts.length > 5 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                And {conflicts.length - 5} more conflicts...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sync History */}
      <div className="wiki-agent-panel">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Sync Operations</h3>
        <div className="overflow-x-auto">
          <table className="wiki-agent-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Duration</th>
                <th>Documents</th>
                <th>Conflicts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {syncHistory.map((sync) => {
                const outcome = getSyncOutcome(sync.outcome);
                return (
                  <tr key={sync.id}>
                    <td>{new Date(sync.timestamp).toLocaleString()}</td>
                    <td className="capitalize">{sync.type}</td>
                    <td>{sync.duration ? `${Math.round(sync.duration / 1000)}s` : '-'}</td>
                    <td>
                      <span className="text-green-600">{sync.documentsAdded || 0}</span> / 
                      <span className="text-blue-600"> {sync.documentsUpdated || 0}</span> / 
                      <span className="text-red-600"> {sync.documentsRemoved || 0}</span>
                    </td>
                    <td>{sync.conflictsFound || 0}</td>
                    <td>
                      <span className={outcome.class}>{outcome.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {syncHistory.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No sync history available</p>
          </div>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      {showConflictModal && selectedConflict && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setShowConflictModal(false)}>
              <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Resolve Sync Conflict
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Document</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      {selectedConflict.documentPath}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Conflict Type</p>
                    <p className="text-base text-gray-900 dark:text-white">
                      {selectedConflict.type}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Description</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {selectedConflict.description}
                    </p>
                  </div>

                  {selectedConflict.localVersion && selectedConflict.remoteVersion && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Local Version
                        </p>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                          <p>Modified: {new Date(selectedConflict.localVersion.modified).toLocaleString()}</p>
                          <p>Size: {(selectedConflict.localVersion.size / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Remote Version
                        </p>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                          <p>Modified: {new Date(selectedConflict.remoteVersion.modified).toLocaleString()}</p>
                          <p>Size: {(selectedConflict.remoteVersion.size / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowConflictModal(false)}
                    className="wiki-agent-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConflictResolution(selectedConflict.id, 'keep-local')}
                    className="wiki-agent-btn-secondary"
                  >
                    Keep Local
                  </button>
                  <button
                    onClick={() => handleConflictResolution(selectedConflict.id, 'keep-remote')}
                    className="wiki-agent-btn-secondary"
                  >
                    Keep Remote
                  </button>
                  <button
                    onClick={() => handleConflictResolution(selectedConflict.id, 'merge')}
                    className="wiki-agent-btn-primary"
                  >
                    Merge Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncStatus;
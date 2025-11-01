import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import ProgressBar from './shared/ProgressBar';
import StatusIndicator from './shared/StatusIndicator';
import './styles/WikiAgent.css';

const UploadQueue = () => {
  const [queue, setQueue] = useState([]);
  const [queueStats, setQueueStats] = useState({
    total: 0,
    processing: 0,
    pending: 0,
    completed: 0,
    failed: 0
  });
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());

  const { lastMessage } = useWebSocket('/api/wiki-agent/ws');

  useEffect(() => {
    fetchQueueData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      if (data.type === 'queue_update') {
        updateQueueItem(data.payload);
      } else if (data.type === 'queue_stats') {
        setQueueStats(data.payload);
      }
    }
  }, [lastMessage]);

  const fetchQueueData = async () => {
    try {
      setLoading(true);
      const [queueRes, statsRes] = await Promise.all([
        fetch('/api/wiki-agent/queue'),
        fetch('/api/wiki-agent/queue/stats')
      ]);

      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setQueue(queueData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setQueueStats(statsData);
      }
    } catch (error) {
      console.error('Error fetching queue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateQueueItem = (updatedItem) => {
    setQueue(prev => prev.map(item => 
      item.id === updatedItem.id ? { ...item, ...updatedItem } : item
    ));
  };

  const handleQueueAction = async (action, itemId = null) => {
    try {
      const endpoint = itemId 
        ? `/api/wiki-agent/queue/${itemId}/${action}`
        : `/api/wiki-agent/queue/${action}`;
      
      const response = await fetch(endpoint, { method: 'POST' });
      
      if (response.ok) {
        fetchQueueData();
        if (action === 'pause') setIsPaused(true);
        if (action === 'resume') setIsPaused(false);
      }
    } catch (error) {
      console.error(`Error performing queue action ${action}:`, error);
    }
  };

  const handleReorderQueue = async (itemId, newPosition) => {
    try {
      const response = await fetch('/api/wiki-agent/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, newPosition })
      });

      if (response.ok) {
        fetchQueueData();
      }
    } catch (error) {
      console.error('Error reordering queue:', error);
    }
  };

  const handleBulkAction = async (action) => {
    try {
      const response = await fetch('/api/wiki-agent/queue/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          itemIds: Array.from(selectedItems)
        })
      });

      if (response.ok) {
        fetchQueueData();
        setSelectedItems(new Set());
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: '⏳',
      processing: '🔄',
      uploading: '📤',
      completed: '✅',
      failed: '❌',
      paused: '⏸️'
    };
    return icons[status] || '❓';
  };

  const getItemProgress = (item) => {
    if (item.status === 'completed') return 100;
    if (item.status === 'pending') return 0;
    return item.progress || 0;
  };

  const formatETA = (seconds) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const moveItemUp = (index) => {
    if (index > 0) {
      const item = queue[index];
      handleReorderQueue(item.id, index - 1);
    }
  };

  const moveItemDown = (index) => {
    if (index < queue.length - 1) {
      const item = queue[index];
      handleReorderQueue(item.id, index + 1);
    }
  };

  if (loading) {
    return (
      <div className="wiki-agent-panel">
        <div className="space-y-4">
          <div className="wiki-agent-skeleton h-20 w-full"></div>
          <div className="wiki-agent-skeleton h-96 w-full"></div>
        </div>
      </div>
    );
  }

  const overallProgress = queueStats.total > 0 
    ? Math.round(((queueStats.completed + queueStats.failed) / queueStats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Queue Stats and Controls */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload Queue</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Managing {queueStats.total} items in queue
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <StatusIndicator 
              status={isPaused ? 'idle' : 'processing'} 
              showLabel={true}
            />
            
            <div className="flex space-x-2">
              {isPaused ? (
                <button
                  onClick={() => handleQueueAction('resume')}
                  className="wiki-agent-btn-primary"
                >
                  Resume Queue
                </button>
              ) : (
                <button
                  onClick={() => handleQueueAction('pause')}
                  className="wiki-agent-btn-secondary"
                >
                  Pause Queue
                </button>
              )}
              <button
                onClick={() => handleQueueAction('clear')}
                className="wiki-agent-btn-danger"
                disabled={queue.length === 0}
              >
                Clear Queue
              </button>
            </div>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Overall Progress
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {queueStats.completed + queueStats.failed} / {queueStats.total}
            </span>
          </div>
          <ProgressBar 
            progress={queueStats.completed + queueStats.failed}
            total={queueStats.total}
            color="blue"
            height="medium"
          />
        </div>

        {/* Queue Statistics */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {queueStats.pending}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
              {queueStats.processing}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Processing</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {queueStats.completed}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
              {queueStats.failed}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
          </div>
        </div>
      </div>

      {/* Queue Items */}
      <div className="wiki-agent-panel">
        {selectedItems.size > 0 && (
          <div className="mb-4 flex items-center space-x-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedItems.size} items selected
            </span>
            <button
              onClick={() => handleBulkAction('retry')}
              className="wiki-agent-btn-secondary text-sm"
            >
              Retry Selected
            </button>
            <button
              onClick={() => handleBulkAction('cancel')}
              className="wiki-agent-btn-danger text-sm"
            >
              Cancel Selected
            </button>
          </div>
        )}

        <div className="space-y-4">
          {queue.map((item, index) => (
            <div 
              key={item.id} 
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => {
                      const newSelected = new Set(selectedItems);
                      if (newSelected.has(item.id)) {
                        newSelected.delete(item.id);
                      } else {
                        newSelected.add(item.id);
                      }
                      setSelectedItems(newSelected);
                    }}
                    className="mt-1 rounded border-gray-300 dark:border-gray-600"
                  />
                  
                  <div className="text-2xl">{getStatusIcon(item.status)}</div>
                  
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.title || item.path.split('/').pop()}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {item.path}
                    </p>
                    
                    {item.status === 'processing' || item.status === 'uploading' ? (
                      <div className="mt-3">
                        <ProgressBar 
                          progress={getItemProgress(item)}
                          height="small"
                          color="blue"
                          animated={true}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.currentStep || 'Processing...'}
                          </span>
                          {item.eta && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ETA: {formatETA(item.eta)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : item.status === 'failed' ? (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                        {item.error || 'Upload failed'}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {/* Priority Controls */}
                  {item.status === 'pending' && (
                    <div className="flex flex-col space-y-1">
                      <button
                        onClick={() => moveItemUp(index)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveItemDown(index)}
                        disabled={index === queue.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  )}

                  {/* Item Actions */}
                  <div className="flex space-x-2">
                    {item.status === 'failed' && (
                      <button
                        onClick={() => handleQueueAction('retry', item.id)}
                        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      >
                        Retry
                      </button>
                    )}
                    {(item.status === 'pending' || item.status === 'processing') && (
                      <button
                        onClick={() => handleQueueAction('cancel', item.id)}
                        className="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                <span>Size: {(item.size / 1024).toFixed(2)} KB</span>
                <span>•</span>
                <span>Added: {new Date(item.queuedAt).toLocaleTimeString()}</span>
                {item.priority && (
                  <>
                    <span>•</span>
                    <span>Priority: {item.priority}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {queue.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No items in queue</p>
          </div>
        )}
      </div>

      {/* Failed Uploads Management */}
      {queueStats.failed > 0 && (
        <div className="wiki-agent-panel border-red-200 dark:border-red-800">
          <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-4">
            Failed Uploads ({queueStats.failed})
          </h3>
          <div className="flex space-x-4">
            <button
              onClick={() => handleQueueAction('retry-all-failed')}
              className="wiki-agent-btn-primary"
            >
              Retry All Failed
            </button>
            <button
              onClick={() => handleQueueAction('clear-failed')}
              className="wiki-agent-btn-secondary"
            >
              Clear Failed
            </button>
            <button
              onClick={() => handleQueueAction('export-failed')}
              className="wiki-agent-btn-secondary"
            >
              Export Failed List
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadQueue;
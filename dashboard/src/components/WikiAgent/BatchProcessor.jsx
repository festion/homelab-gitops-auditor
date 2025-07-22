import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import ProgressBar from './shared/ProgressBar';
import StatusIndicator from './shared/StatusIndicator';
import './styles/WikiAgent.css';

const BatchProcessor = () => {
  const [batchStatus, setBatchStatus] = useState({
    isRunning: false,
    isPaused: false,
    currentBatch: null,
    totalBatches: 0,
    processedItems: 0,
    totalItems: 0,
    startTime: null,
    estimatedCompletion: null
  });

  const [batchConfig, setBatchConfig] = useState({
    batchSize: 10,
    concurrency: 3,
    retryAttempts: 3,
    retryDelay: 5000,
    processOrder: 'fifo', // fifo, lifo, priority
    filterCriteria: {
      status: 'all',
      type: 'all',
      dateRange: 'all'
    }
  });

  const [batchHistory, setBatchHistory] = useState([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const { lastMessage } = useWebSocket('/api/wiki-agent/ws');

  useEffect(() => {
    fetchBatchData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      if (data.type === 'batch_update') {
        setBatchStatus(prev => ({ ...prev, ...data.payload }));
      }
    }
  }, [lastMessage]);

  const fetchBatchData = async () => {
    try {
      setLoading(true);
      const [statusRes, configRes, historyRes] = await Promise.all([
        fetch('/api/wiki-agent/batch/status'),
        fetch('/api/wiki-agent/batch/config'),
        fetch('/api/wiki-agent/batch/history?limit=10')
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setBatchStatus(statusData);
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        setBatchConfig(configData);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setBatchHistory(historyData);
      }
    } catch (error) {
      console.error('Error fetching batch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchAction = async (action) => {
    try {
      const response = await fetch(`/api/wiki-agent/batch/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'start' ? batchConfig : {})
      });

      if (response.ok) {
        fetchBatchData();
      }
    } catch (error) {
      console.error(`Error performing batch action ${action}:`, error);
    }
  };

  const updateBatchConfig = async () => {
    try {
      const response = await fetch('/api/wiki-agent/batch/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchConfig)
      });

      if (response.ok) {
        setShowConfigModal(false);
      }
    } catch (error) {
      console.error('Error updating batch config:', error);
    }
  };

  const calculateTimeRemaining = () => {
    if (!batchStatus.isRunning || !batchStatus.startTime) return null;
    
    const elapsed = Date.now() - new Date(batchStatus.startTime).getTime();
    const itemsPerSecond = batchStatus.processedItems / (elapsed / 1000);
    const remainingItems = batchStatus.totalItems - batchStatus.processedItems;
    const remainingSeconds = remainingItems / itemsPerSecond;
    
    return Math.round(remainingSeconds);
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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

  const progress = batchStatus.totalItems > 0 
    ? (batchStatus.processedItems / batchStatus.totalItems) * 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* Batch Processing Status */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Batch Processor</h2>
            <div className="mt-2 flex items-center space-x-4">
              <StatusIndicator 
                status={batchStatus.isRunning ? (batchStatus.isPaused ? 'idle' : 'processing') : 'offline'} 
                size="medium"
              />
              {batchStatus.isRunning && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Batch {batchStatus.currentBatch} of {batchStatus.totalBatches}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!batchStatus.isRunning ? (
              <button
                onClick={() => handleBatchAction('start')}
                className="wiki-agent-btn-primary"
              >
                Start Batch Processing
              </button>
            ) : (
              <>
                {batchStatus.isPaused ? (
                  <button
                    onClick={() => handleBatchAction('resume')}
                    className="wiki-agent-btn-primary"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={() => handleBatchAction('pause')}
                    className="wiki-agent-btn-secondary"
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={() => handleBatchAction('stop')}
                  className="wiki-agent-btn-danger"
                >
                  Stop
                </button>
              </>
            )}
            <button
              onClick={() => setShowConfigModal(true)}
              className="wiki-agent-btn-secondary"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Progress Tracking */}
        {batchStatus.isRunning && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Overall Progress
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {batchStatus.processedItems} / {batchStatus.totalItems} items
                </span>
              </div>
              <ProgressBar 
                progress={progress}
                color="blue"
                height="large"
                animated={!batchStatus.isPaused}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Processing Rate</p>
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  {batchStatus.startTime ? 
                    `${(batchStatus.processedItems / ((Date.now() - new Date(batchStatus.startTime).getTime()) / 1000)).toFixed(1)} items/sec` 
                    : '0 items/sec'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Time Elapsed</p>
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  {batchStatus.startTime ? 
                    formatDuration(Date.now() - new Date(batchStatus.startTime).getTime()) 
                    : '0s'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Estimated Completion</p>
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  {calculateTimeRemaining() ? 
                    formatDuration(calculateTimeRemaining() * 1000) 
                    : 'Calculating...'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current Configuration */}
      <div className="wiki-agent-panel">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Current Configuration</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Batch Size</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">{batchConfig.batchSize} items</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Concurrency</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">{batchConfig.concurrency} threads</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Retry Attempts</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">{batchConfig.retryAttempts}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Process Order</p>
            <p className="text-base font-medium text-gray-900 dark:text-white capitalize">{batchConfig.processOrder}</p>
          </div>
        </div>
      </div>

      {/* Operation History */}
      <div className="wiki-agent-panel">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Batch Operations</h3>
        <div className="overflow-x-auto">
          <table className="wiki-agent-table">
            <thead>
              <tr>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Items Processed</th>
                <th>Success Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {batchHistory.map((batch) => (
                <tr key={batch.id}>
                  <td>{new Date(batch.startTime).toLocaleString()}</td>
                  <td>{formatDuration(batch.duration)}</td>
                  <td>{batch.processedItems}</td>
                  <td>
                    <span className={batch.successRate >= 95 ? 'text-green-600' : batch.successRate >= 80 ? 'text-yellow-600' : 'text-red-600'}>
                      {batch.successRate.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span className={`wiki-agent-badge ${
                      batch.status === 'completed' ? 'wiki-agent-badge-success' :
                      batch.status === 'stopped' ? 'wiki-agent-badge-warning' :
                      'wiki-agent-badge-error'
                    }`}>
                      {batch.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {batchHistory.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No batch operations yet</p>
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setShowConfigModal(false)}>
              <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Batch Processing Configuration
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Batch Size
                    </label>
                    <input
                      type="number"
                      value={batchConfig.batchSize}
                      onChange={(e) => setBatchConfig({ ...batchConfig, batchSize: parseInt(e.target.value) })}
                      min="1"
                      max="100"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Concurrency Level
                    </label>
                    <input
                      type="number"
                      value={batchConfig.concurrency}
                      onChange={(e) => setBatchConfig({ ...batchConfig, concurrency: parseInt(e.target.value) })}
                      min="1"
                      max="10"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Retry Attempts
                    </label>
                    <input
                      type="number"
                      value={batchConfig.retryAttempts}
                      onChange={(e) => setBatchConfig({ ...batchConfig, retryAttempts: parseInt(e.target.value) })}
                      min="0"
                      max="5"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Process Order
                    </label>
                    <select
                      value={batchConfig.processOrder}
                      onChange={(e) => setBatchConfig({ ...batchConfig, processOrder: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="fifo">First In, First Out (FIFO)</option>
                      <option value="lifo">Last In, First Out (LIFO)</option>
                      <option value="priority">Priority Based</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter by Status
                    </label>
                    <select
                      value={batchConfig.filterCriteria.status}
                      onChange={(e) => setBatchConfig({ 
                        ...batchConfig, 
                        filterCriteria: { ...batchConfig.filterCriteria, status: e.target.value }
                      })}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="all">All Documents</option>
                      <option value="discovered">Discovered Only</option>
                      <option value="failed">Failed Only</option>
                      <option value="pending">Pending Only</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="wiki-agent-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updateBatchConfig}
                    className="wiki-agent-btn-primary"
                  >
                    Save Configuration
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

export default BatchProcessor;
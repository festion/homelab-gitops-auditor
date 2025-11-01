import React, { useState, useEffect } from 'react';
import StatusIndicator from './shared/StatusIndicator';
import './styles/WikiAgent.css';

const ConfigurationPanel = () => {
  const [config, setConfig] = useState({
    discovery: {
      paths: ['/docs', '/wiki', '/documentation'],
      fileTypes: ['md', 'txt', 'pdf', 'html'],
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      maxFileSize: 10485760, // 10MB
      scanInterval: 3600, // seconds
      enabled: true
    },
    processing: {
      concurrentWorkers: 3,
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 5000,
      processingTimeout: 60000,
      enableOCR: false,
      extractMetadata: true
    },
    sync: {
      mode: 'automatic',
      interval: 300, // seconds
      conflictResolution: 'manual',
      validateBeforeSync: true,
      backupBeforeSync: true
    },
    performance: {
      maxCPUUsage: 80,
      maxMemoryUsage: 75,
      maxDiskUsage: 90,
      throttleOnHighLoad: true,
      pauseOnBattery: false
    },
    notifications: {
      emailEnabled: false,
      emailAddress: '',
      webhookEnabled: false,
      webhookURL: '',
      notifyOnErrors: true,
      notifyOnCompletion: false
    }
  });

  const [mpcServers, setMpcServers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('discovery');

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      const [configRes, mpcRes, schedulesRes] = await Promise.all([
        fetch('/api/wiki-agent/config'),
        fetch('/api/wiki-agent/mcp-servers'),
        fetch('/api/wiki-agent/schedules')
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (mpcRes.ok) {
        const mpcData = await mpcRes.json();
        setMpcServers(mpcData);
      }

      if (schedulesRes.ok) {
        const schedulesData = await schedulesRes.json();
        setSchedules(schedulesData);
      }
    } catch (error) {
      console.error('Error fetching configuration:', error);
    }
  };

  const saveConfiguration = async () => {
    try {
      setIsSaving(true);
      const response = await fetch('/api/wiki-agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setHasChanges(false);
        // Show success notification
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (section, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const addPath = () => {
    const newPath = prompt('Enter new discovery path:');
    if (newPath) {
      setConfig(prev => ({
        ...prev,
        discovery: {
          ...prev.discovery,
          paths: [...prev.discovery.paths, newPath]
        }
      }));
      setHasChanges(true);
    }
  };

  const removePath = (index) => {
    setConfig(prev => ({
      ...prev,
      discovery: {
        ...prev.discovery,
        paths: prev.discovery.paths.filter((_, i) => i !== index)
      }
    }));
    setHasChanges(true);
  };

  const testMpcConnection = async (serverId) => {
    try {
      const response = await fetch(`/api/wiki-agent/mcp-servers/${serverId}/test`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Connection ${result.success ? 'successful' : 'failed'}: ${result.message}`);
      }
    } catch (error) {
      console.error('Error testing MPC connection:', error);
    }
  };

  const tabs = [
    { id: 'discovery', label: 'Discovery', icon: '🔍' },
    { id: 'processing', label: 'Processing', icon: '⚙️' },
    { id: 'sync', label: 'Sync', icon: '🔄' },
    { id: 'performance', label: 'Performance', icon: '📊' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'mcp', label: 'MCP Servers', icon: '🖥️' },
    { id: 'schedules', label: 'Schedules', icon: '📅' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Agent Configuration
          </h2>
          {hasChanges && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-yellow-600 dark:text-yellow-400">
                You have unsaved changes
              </span>
              <button
                onClick={saveConfiguration}
                disabled={isSaving}
                className="wiki-agent-btn-primary disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="wiki-agent-panel p-0">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Discovery Tab */}
          {activeTab === 'discovery' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discovery Paths
                </label>
                <div className="space-y-2">
                  {config.discovery.paths.map((path, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={path}
                        onChange={(e) => {
                          const newPaths = [...config.discovery.paths];
                          newPaths[index] = e.target.value;
                          setConfig(prev => ({
                            ...prev,
                            discovery: { ...prev.discovery, paths: newPaths }
                          }));
                          setHasChanges(true);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => removePath(index)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addPath}
                    className="wiki-agent-btn-secondary text-sm"
                  >
                    Add Path
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  File Types
                </label>
                <input
                  type="text"
                  value={config.discovery.fileTypes.join(', ')}
                  onChange={(e) => updateConfig('discovery', 'fileTypes', e.target.value.split(',').map(t => t.trim()))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="md, txt, pdf, html"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max File Size (MB)
                </label>
                <input
                  type="number"
                  value={config.discovery.maxFileSize / 1048576}
                  onChange={(e) => updateConfig('discovery', 'maxFileSize', parseInt(e.target.value) * 1048576)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Scan Interval (minutes)
                </label>
                <input
                  type="number"
                  value={config.discovery.scanInterval / 60}
                  onChange={(e) => updateConfig('discovery', 'scanInterval', parseInt(e.target.value) * 60)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="discovery-enabled"
                  checked={config.discovery.enabled}
                  onChange={(e) => updateConfig('discovery', 'enabled', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="discovery-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enable automatic discovery
                </label>
              </div>
            </div>
          )}

          {/* Processing Tab */}
          {activeTab === 'processing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Concurrent Workers
                  </label>
                  <input
                    type="number"
                    value={config.processing.concurrentWorkers}
                    onChange={(e) => updateConfig('processing', 'concurrentWorkers', parseInt(e.target.value))}
                    min="1"
                    max="10"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Batch Size
                  </label>
                  <input
                    type="number"
                    value={config.processing.batchSize}
                    onChange={(e) => updateConfig('processing', 'batchSize', parseInt(e.target.value))}
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Retry Attempts
                  </label>
                  <input
                    type="number"
                    value={config.processing.retryAttempts}
                    onChange={(e) => updateConfig('processing', 'retryAttempts', parseInt(e.target.value))}
                    min="0"
                    max="5"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Processing Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.processing.processingTimeout / 1000}
                    onChange={(e) => updateConfig('processing', 'processingTimeout', parseInt(e.target.value) * 1000)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enable-ocr"
                    checked={config.processing.enableOCR}
                    onChange={(e) => updateConfig('processing', 'enableOCR', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="enable-ocr" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Enable OCR for images and PDFs
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="extract-metadata"
                    checked={config.processing.extractMetadata}
                    onChange={(e) => updateConfig('processing', 'extractMetadata', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="extract-metadata" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Extract document metadata
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Sync Tab */}
          {activeTab === 'sync' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sync Mode
                </label>
                <select
                  value={config.sync.mode}
                  onChange={(e) => updateConfig('sync', 'mode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="automatic">Automatic</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              {config.sync.mode !== 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Sync Interval (minutes)
                  </label>
                  <input
                    type="number"
                    value={config.sync.interval / 60}
                    onChange={(e) => updateConfig('sync', 'interval', parseInt(e.target.value) * 60)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Conflict Resolution
                </label>
                <select
                  value={config.sync.conflictResolution}
                  onChange={(e) => updateConfig('sync', 'conflictResolution', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="manual">Manual</option>
                  <option value="keep-local">Always Keep Local</option>
                  <option value="keep-remote">Always Keep Remote</option>
                  <option value="merge">Auto-merge</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="validate-before-sync"
                    checked={config.sync.validateBeforeSync}
                    onChange={(e) => updateConfig('sync', 'validateBeforeSync', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="validate-before-sync" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Validate documents before sync
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="backup-before-sync"
                    checked={config.sync.backupBeforeSync}
                    onChange={(e) => updateConfig('sync', 'backupBeforeSync', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="backup-before-sync" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Create backup before sync
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max CPU Usage (%)
                </label>
                <input
                  type="number"
                  value={config.performance.maxCPUUsage}
                  onChange={(e) => updateConfig('performance', 'maxCPUUsage', parseInt(e.target.value))}
                  min="10"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Memory Usage (%)
                </label>
                <input
                  type="number"
                  value={config.performance.maxMemoryUsage}
                  onChange={(e) => updateConfig('performance', 'maxMemoryUsage', parseInt(e.target.value))}
                  min="10"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Disk Usage (%)
                </label>
                <input
                  type="number"
                  value={config.performance.maxDiskUsage}
                  onChange={(e) => updateConfig('performance', 'maxDiskUsage', parseInt(e.target.value))}
                  min="50"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="throttle-on-high-load"
                    checked={config.performance.throttleOnHighLoad}
                    onChange={(e) => updateConfig('performance', 'throttleOnHighLoad', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="throttle-on-high-load" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Throttle processing on high system load
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="pause-on-battery"
                    checked={config.performance.pauseOnBattery}
                    onChange={(e) => updateConfig('performance', 'pauseOnBattery', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="pause-on-battery" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Pause processing on battery power
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* MCP Servers Tab */}
          {activeTab === 'mcp' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">MCP Server Connections</h3>
              
              <div className="space-y-4">
                {mpcServers.map((server) => (
                  <div key={server.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <StatusIndicator 
                          status={server.connected ? 'online' : 'offline'} 
                          size="small"
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{server.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{server.url}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => testMpcConnection(server.id)}
                        className="wiki-agent-btn-secondary text-sm"
                      >
                        Test Connection
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {mpcServers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No MCP servers configured</p>
                </div>
              )}
            </div>
          )}

          {/* Schedules Tab */}
          {activeTab === 'schedules' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Scheduled Tasks</h3>
                <button className="wiki-agent-btn-primary text-sm">
                  Add Schedule
                </button>
              </div>

              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{schedule.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {schedule.type} - {schedule.cron}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Next run: {new Date(schedule.nextRun).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={schedule.enabled}
                          onChange={() => {/* Toggle schedule */}}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                        <button className="text-red-600 hover:text-red-800 dark:text-red-400">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {schedules.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No scheduled tasks configured</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
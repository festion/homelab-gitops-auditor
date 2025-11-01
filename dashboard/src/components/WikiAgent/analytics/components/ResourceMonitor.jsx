import React, { useState, useEffect, useMemo } from 'react';
import { MetricsUtils, AlertThresholds } from '../types/metricsTypes';

const ResourceMonitor = ({ data, period, showDetails = false }) => {
  const [selectedResource, setSelectedResource] = useState('cpu');
  const [showThresholds, setShowThresholds] = useState(true);

  // Process resource data
  const resourceData = useMemo(() => {
    if (!data || data.length === 0) return {};
    
    const processed = {
      cpu: [],
      memory: [],
      disk: [],
      network: []
    };
    
    data.forEach(point => {
      processed.cpu.push({
        timestamp: point.timestamp,
        value: point.cpuUsage || 0,
        cores: point.cpuCores || 1
      });
      
      processed.memory.push({
        timestamp: point.timestamp,
        value: point.memoryUsage || 0,
        total: point.totalMemory || 0,
        available: point.availableMemory || 0
      });
      
      processed.disk.push({
        timestamp: point.timestamp,
        value: point.diskUsage || 0,
        io: point.diskIO || 0,
        available: point.diskAvailable || 0
      });
      
      processed.network.push({
        timestamp: point.timestamp,
        value: point.networkIO || 0,
        inbound: point.networkInbound || 0,
        outbound: point.networkOutbound || 0
      });
    });
    
    return processed;
  }, [data]);

  // Calculate current resource status
  const resourceStatus = useMemo(() => {
    const latest = {
      cpu: resourceData.cpu?.[resourceData.cpu.length - 1]?.value || 0,
      memory: resourceData.memory?.[resourceData.memory.length - 1]?.value || 0,
      disk: resourceData.disk?.[resourceData.disk.length - 1]?.value || 0,
      network: resourceData.network?.[resourceData.network.length - 1]?.value || 0
    };
    
    const status = {};
    Object.entries(latest).forEach(([resource, value]) => {
      const thresholds = AlertThresholds.RESOURCE_USAGE[resource] || { warning: 80, critical: 95 };
      
      if (value >= thresholds.critical) {
        status[resource] = { level: 'critical', color: 'text-red-600' };
      } else if (value >= thresholds.warning) {
        status[resource] = { level: 'warning', color: 'text-yellow-600' };
      } else {
        status[resource] = { level: 'good', color: 'text-green-600' };
      }
    });
    
    return { latest, status };
  }, [resourceData]);

  // Resource Gauge Component
  const ResourceGauge = ({ title, value, unit = '%', size = 'medium', color = 'blue', threshold }) => {
    const sizeClasses = {
      small: 'w-16 h-16',
      medium: 'w-24 h-24',
      large: 'w-32 h-32'
    };
    
    const colorClasses = {
      blue: 'text-blue-600',
      green: 'text-green-600',
      yellow: 'text-yellow-600',
      red: 'text-red-600'
    };
    
    // Determine color based on threshold
    const getColor = () => {
      if (threshold) {
        if (value >= threshold.critical) return 'red';
        if (value >= threshold.warning) return 'yellow';
        return 'green';
      }
      return color;
    };
    
    const gaugeColor = getColor();
    const circumference = 2 * Math.PI * 40; // radius = 40
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (value / 100) * circumference;
    
    return (
      <div className={`resource-gauge ${sizeClasses[size]} relative`}>
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r="40"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-200 dark:text-gray-700"
          />
          
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r="40"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className={`transition-all duration-1000 ${colorClasses[gaugeColor]}`}
          />
          
          {/* Threshold markers */}
          {threshold && showThresholds && (
            <>
              <circle
                cx="50%"
                cy="50%"
                r="40"
                fill="transparent"
                stroke="rgba(255, 193, 7, 0.5)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="4 4"
                strokeDashoffset={circumference - (threshold.warning / 100) * circumference}
                className="pointer-events-none"
              />
              <circle
                cx="50%"
                cy="50%"
                r="40"
                fill="transparent"
                stroke="rgba(220, 38, 38, 0.5)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="4 4"
                strokeDashoffset={circumference - (threshold.critical / 100) * circumference}
                className="pointer-events-none"
              />
            </>
          )}
        </svg>
        
        {/* Center text */}
        <div className="resource-gauge-text flex-col">
          <div className={`resource-gauge-value ${colorClasses[gaugeColor]}`}>
            {typeof value === 'number' ? value.toFixed(0) : '0'}{unit}
          </div>
          <div className="resource-gauge-label">{title}</div>
        </div>
      </div>
    );
  };

  // Time Series Chart for selected resource
  const ResourceChart = ({ resourceType }) => {
    const chartData = resourceData[resourceType] || [];
    if (chartData.length === 0) return <div className="chart-error">No data available</div>;
    
    const maxValue = Math.max(...chartData.map(d => d.value), 100);
    const minValue = Math.min(...chartData.map(d => d.value), 0);
    const range = maxValue - minValue || 1;
    
    const threshold = AlertThresholds.RESOURCE_USAGE[resourceType];
    
    return (
      <div className="chart-container chart-medium relative">
        <svg width="100%" height="100%" className="overflow-visible">
          {/* Background Grid */}
          <g className="opacity-20">
            {[...Array(5)].map((_, i) => (
              <line
                key={`h-${i}`}
                x1="0"
                y1={`${(i * 25)}%`}
                x2="100%"
                y2={`${(i * 25)}%`}
                stroke="currentColor"
                strokeWidth="0.5"
              />
            ))}
          </g>
          
          {/* Threshold lines */}
          {threshold && showThresholds && (
            <>
              <line
                x1="0"
                y1={`${100 - ((threshold.warning - minValue) / range) * 100}%`}
                x2="100%"
                y2={`${100 - ((threshold.warning - minValue) / range) * 100}%`}
                stroke="#fbbf24"
                strokeWidth="1"
                strokeDasharray="5,5"
                opacity="0.7"
              />
              <line
                x1="0"
                y1={`${100 - ((threshold.critical - minValue) / range) * 100}%`}
                x2="100%"
                y2={`${100 - ((threshold.critical - minValue) / range) * 100}%`}
                stroke="#ef4444"
                strokeWidth="1"
                strokeDasharray="5,5"
                opacity="0.7"
              />
            </>
          )}
          
          {/* Data line */}
          <polyline
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
            points={chartData.map((point, index) => {
              const x = (index / (chartData.length - 1 || 1)) * 100;
              const y = 100 - ((point.value - minValue) / range) * 100;
              return `${x},${y}`;
            }).join(' ')}
          />
          
          {/* Data points */}
          {chartData.map((point, index) => {
            const x = (index / (chartData.length - 1 || 1)) * 100;
            const y = 100 - ((point.value - minValue) / range) * 100;
            
            return (
              <circle
                key={index}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill="rgb(59, 130, 246)"
                className="hover:r-5 transition-all duration-200"
              >
                <title>
                  {new Date(point.timestamp).toLocaleString()}: {point.value.toFixed(1)}%
                </title>
              </circle>
            );
          })}
        </svg>
        
        {/* Legend */}
        {threshold && showThresholds && (
          <div className="absolute bottom-2 right-2 text-xs space-y-1">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-0.5 bg-yellow-400"></div>
              <span>Warning ({threshold.warning}%)</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-0.5 bg-red-500"></div>
              <span>Critical ({threshold.critical}%)</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Resource summary cards
  const ResourceSummary = ({ title, current, max, unit, trend, details }) => (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white">{title}</h4>
        <span className={`text-xs px-2 py-1 rounded-full ${
          trend > 0 ? 'bg-red-100 text-red-800' : 
          trend < 0 ? 'bg-green-100 text-green-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Current:</span>
          <span className="font-medium">{current.toFixed(1)} {unit}</span>
        </div>
        {max && (
          <div className="flex justify-between text-sm">
            <span>Maximum:</span>
            <span className="font-medium">{max.toFixed(1)} {unit}</span>
          </div>
        )}
        {details && (
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span>{typeof value === 'number' ? value.toFixed(1) : value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!data || data.length === 0) {
    return (
      <div className="chart-error">
        <div className="text-center">
          <p className="text-sm font-medium">No resource data available</p>
          <p className="text-xs text-gray-400 mt-1">Resource monitoring data will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resource Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ResourceGauge
          title="CPU"
          value={resourceStatus.latest.cpu}
          threshold={AlertThresholds.RESOURCE_USAGE.cpu}
        />
        <ResourceGauge
          title="Memory"
          value={resourceStatus.latest.memory}
          threshold={AlertThresholds.RESOURCE_USAGE.memory}
        />
        <ResourceGauge
          title="Disk"
          value={resourceStatus.latest.disk}
          threshold={AlertThresholds.RESOURCE_USAGE.disk}
        />
        <ResourceGauge
          title="Network"
          value={resourceStatus.latest.network}
          unit=" MB/s"
          threshold={{ warning: 100, critical: 200 }}
        />
      </div>

      {/* Resource Selection and Chart */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {['cpu', 'memory', 'disk', 'network'].map(resource => (
              <button
                key={resource}
                onClick={() => setSelectedResource(resource)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  selectedResource === resource
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {resource.toUpperCase()}
              </button>
            ))}
          </div>
          
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showThresholds}
              onChange={(e) => setShowThresholds(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span>Show Thresholds</span>
          </label>
        </div>
        
        <ResourceChart resourceType={selectedResource} />
      </div>

      {/* Detailed Resource Information */}
      {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ResourceSummary
            title="CPU Usage"
            current={resourceStatus.latest.cpu}
            max={Math.max(...resourceData.cpu.map(d => d.value))}
            unit="%"
            trend={5.2}
            details={{
              cores: resourceData.cpu[resourceData.cpu.length - 1]?.cores || 1,
              load: '1.2, 1.5, 1.8'
            }}
          />
          
          <ResourceSummary
            title="Memory Usage"
            current={resourceStatus.latest.memory}
            max={Math.max(...resourceData.memory.map(d => d.value))}
            unit="%"
            trend={-2.1}
            details={{
              available: MetricsUtils.formatBytes(
                resourceData.memory[resourceData.memory.length - 1]?.available || 0
              ),
              total: MetricsUtils.formatBytes(
                resourceData.memory[resourceData.memory.length - 1]?.total || 0
              )
            }}
          />
          
          <ResourceSummary
            title="Disk Usage"
            current={resourceStatus.latest.disk}
            max={Math.max(...resourceData.disk.map(d => d.value))}
            unit="%"
            trend={0.8}
            details={{
              available: MetricsUtils.formatBytes(
                resourceData.disk[resourceData.disk.length - 1]?.available || 0
              ),
              io: `${(resourceData.disk[resourceData.disk.length - 1]?.io || 0).toFixed(1)} MB/s`
            }}
          />
          
          <ResourceSummary
            title="Network I/O"
            current={resourceStatus.latest.network}
            max={Math.max(...resourceData.network.map(d => d.value))}
            unit="MB/s"
            trend={12.5}
            details={{
              inbound: `${(resourceData.network[resourceData.network.length - 1]?.inbound || 0).toFixed(1)} MB/s`,
              outbound: `${(resourceData.network[resourceData.network.length - 1]?.outbound || 0).toFixed(1)} MB/s`
            }}
          />
        </div>
      )}

      {/* Resource Alerts */}
      {Object.entries(resourceStatus.status).some(([_, status]) => status.level !== 'good') && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            Resource Warnings
          </h4>
          <div className="space-y-1">
            {Object.entries(resourceStatus.status).map(([resource, status]) => {
              if (status.level === 'good') return null;
              
              return (
                <div key={resource} className="flex items-center space-x-2 text-sm">
                  <span className={status.color}>●</span>
                  <span className="capitalize">{resource}</span>
                  <span>usage is at {resourceStatus.latest[resource].toFixed(1)}%</span>
                  <span className="text-yellow-600 dark:text-yellow-400">
                    ({status.level} threshold exceeded)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceMonitor;
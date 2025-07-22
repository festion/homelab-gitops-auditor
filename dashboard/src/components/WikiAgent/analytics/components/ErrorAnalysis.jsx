import React, { useState, useEffect, useMemo } from 'react';
import { ErrorCategories, MetricsUtils } from '../types/metricsTypes';
import analyticsService from '../utils/analyticsService';

const ErrorAnalysis = ({ data, period }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [timeGrouping, setTimeGrouping] = useState('hourly');
  const [showResolved, setShowResolved] = useState(false);
  const [sortBy, setSortBy] = useState('frequency');

  // Process error data by category
  const errorsByCategory = useMemo(() => {
    if (!data || data.length === 0) return {};
    
    const categorized = {};
    Object.keys(ErrorCategories).forEach(category => {
      categorized[category] = [];
    });
    
    data.forEach(error => {
      const category = error.category?.toUpperCase() || 'OTHER';
      if (categorized[category]) {
        categorized[category].push(error);
      } else {
        if (!categorized.OTHER) categorized.OTHER = [];
        categorized.OTHER.push(error);
      }
    });
    
    return categorized;
  }, [data]);

  // Calculate error statistics
  const errorStats = useMemo(() => {
    const stats = {};
    Object.entries(errorsByCategory).forEach(([category, errors]) => {
      const total = errors.length;
      const resolved = errors.filter(e => e.resolved).length;
      const recent = errors.filter(e => 
        Date.now() - new Date(e.timestamp).getTime() < 86400000 // Last 24 hours
      ).length;
      
      const errorTypes = {};
      errors.forEach(error => {
        errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
      });
      
      stats[category] = {
        total,
        resolved,
        unresolved: total - resolved,
        recent,
        resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
        errorTypes
      };
    });
    
    return stats;
  }, [errorsByCategory]);

  // Generate time series data for error frequency
  const errorTimeSeriesData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const intervalMs = timeGrouping === 'hourly' ? 3600000 : 86400000;
    const grouped = {};
    
    data.forEach(error => {
      if (selectedCategory !== 'all' && error.category?.toUpperCase() !== selectedCategory) {
        return;
      }
      
      const timeKey = Math.floor(new Date(error.timestamp).getTime() / intervalMs) * intervalMs;
      if (!grouped[timeKey]) grouped[timeKey] = [];
      grouped[timeKey].push(error);
    });
    
    return Object.entries(grouped)
      .map(([timestamp, errors]) => ({
        timestamp: parseInt(timestamp),
        count: errors.length,
        severity: {
          critical: errors.filter(e => e.severity === 'critical').length,
          high: errors.filter(e => e.severity === 'high').length,
          medium: errors.filter(e => e.severity === 'medium').length,
          low: errors.filter(e => e.severity === 'low').length
        }
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, selectedCategory, timeGrouping]);

  // Get most frequent errors
  const topErrors = useMemo(() => {
    const errorCounts = {};
    
    data.forEach(error => {
      if (selectedCategory !== 'all' && error.category?.toUpperCase() !== selectedCategory) {
        return;
      }
      
      const key = `${error.type}_${error.category}`;
      if (!errorCounts[key]) {
        errorCounts[key] = {
          type: error.type,
          category: error.category,
          count: 0,
          lastOccurrence: error.timestamp,
          severity: error.severity,
          examples: []
        };
      }
      
      errorCounts[key].count++;
      if (new Date(error.timestamp) > new Date(errorCounts[key].lastOccurrence)) {
        errorCounts[key].lastOccurrence = error.timestamp;
      }
      
      if (errorCounts[key].examples.length < 3) {
        errorCounts[key].examples.push(error.message || error.type);
      }
    });
    
    return Object.values(errorCounts)
      .sort((a, b) => {
        switch (sortBy) {
          case 'recent':
            return new Date(b.lastOccurrence) - new Date(a.lastOccurrence);
          case 'severity':
            const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
          default:
            return b.count - a.count;
        }
      })
      .slice(0, 10);
  }, [data, selectedCategory, sortBy]);

  // Generate error heatmap data
  const generateHeatmapData = () => {
    const heatmapData = [];
    const daysInPeriod = Math.ceil(
      (Date.now() - (Date.now() - 7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000)
    );
    
    for (let day = 0; day < daysInPeriod; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = Date.now() - (day * 24 * 60 * 60 * 1000) - (hour * 60 * 60 * 1000);
        const errorsInHour = data.filter(error => {
          const errorTime = new Date(error.timestamp).getTime();
          return errorTime >= timestamp && errorTime < timestamp + 3600000;
        }).length;
        
        heatmapData.push({
          day,
          hour,
          count: errorsInHour,
          intensity: Math.min(errorsInHour / 10, 1) // Normalize to 0-1
        });
      }
    }
    
    return heatmapData;
  };

  const heatmapData = generateHeatmapData();

  const CategoryCard = ({ categoryKey, categoryData }) => {
    const config = ErrorCategories[categoryKey] || {
      name: 'Other',
      color: '#6b7280',
      icon: '❓'
    };
    
    const stats = errorStats[categoryKey] || { total: 0, resolved: 0, recent: 0, resolutionRate: 0 };
    
    return (
      <div 
        className={`error-category cursor-pointer transition-all duration-200 ${
          selectedCategory === categoryKey ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={() => setSelectedCategory(selectedCategory === categoryKey ? 'all' : categoryKey)}
      >
        <div className="error-category-header">
          <div className="error-category-icon">{config.icon}</div>
          <div className="error-category-name">{config.name}</div>
          <div 
            className="error-category-count text-white px-2 py-1 rounded-full text-xs"
            style={{ backgroundColor: config.color }}
          >
            {stats.total}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="font-medium text-gray-900 dark:text-white">{stats.unresolved}</div>
            <div className="text-xs text-red-600 dark:text-red-400">Unresolved</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">{stats.recent}</div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">Recent (24h)</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">{stats.resolutionRate.toFixed(0)}%</div>
            <div className="text-xs text-green-600 dark:text-green-400">Resolved</div>
          </div>
        </div>
      </div>
    );
  };

  const ErrorFrequencyChart = () => {
    const maxCount = Math.max(...errorTimeSeriesData.map(d => d.count), 1);
    
    return (
      <div className="chart-container chart-medium">
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
          
          {/* Error Frequency Bars */}
          {errorTimeSeriesData.map((point, index) => {
            const x = (index / (errorTimeSeriesData.length - 1 || 1)) * 95;
            const height = (point.count / maxCount) * 90;
            const y = 90 - height;
            
            return (
              <g key={index}>
                <rect
                  x={`${x}%`}
                  y={`${y}%`}
                  width="2%"
                  height={`${height}%`}
                  fill="rgb(239, 68, 68)"
                  className="hover:opacity-80"
                >
                  <title>
                    {new Date(point.timestamp).toLocaleString()}: {point.count} errors
                  </title>
                </rect>
                
                {/* Severity Stack */}
                <rect
                  x={`${x + 0.1}%`}
                  y={`${y}%`}
                  width="1.8%"
                  height={`${(point.severity.critical / point.count) * height}%`}
                  fill="#dc2626"
                />
                <rect
                  x={`${x + 0.1}%`}
                  y={`${y + (point.severity.critical / point.count) * height}%`}
                  width="1.8%"
                  height={`${(point.severity.high / point.count) * height}%`}
                  fill="#ea580c"
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const ErrorHeatmap = () => (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Error Frequency by Hour (Last 7 Days)
      </div>
      <div className="grid grid-cols-24 gap-1 text-xs">
        {/* Hour headers */}
        {[...Array(24)].map((_, hour) => (
          <div key={hour} className="text-center text-gray-500 dark:text-gray-400">
            {hour % 6 === 0 ? hour : ''}
          </div>
        ))}
        
        {/* Heatmap grid */}
        {Array.from({ length: 7 }, (_, day) => (
          <React.Fragment key={day}>
            {[...Array(24)].map((_, hour) => {
              const dataPoint = heatmapData.find(d => d.day === day && d.hour === hour);
              const intensity = dataPoint?.intensity || 0;
              
              return (
                <div
                  key={`${day}-${hour}`}
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: `rgba(239, 68, 68, ${intensity})`,
                    border: '1px solid rgba(229, 231, 235, 0.3)'
                  }}
                  title={`${dataPoint?.count || 0} errors`}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Less</span>
        <div className="flex space-x-1">
          {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
            <div
              key={intensity}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: `rgba(239, 68, 68, ${intensity})` }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={timeGrouping}
          onChange={(e) => setTimeGrouping(e.target.value)}
          className="filter-select"
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="filter-select"
        >
          <option value="frequency">By Frequency</option>
          <option value="recent">By Recent</option>
          <option value="severity">By Severity</option>
        </select>
        
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          <span>Include Resolved</span>
        </label>
      </div>

      {/* Error Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(ErrorCategories).map(([key, config]) => (
          <CategoryCard
            key={key}
            categoryKey={key}
            categoryData={config}
          />
        ))}
      </div>

      {/* Error Frequency Chart */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h4 className="analytics-card-title">Error Frequency Over Time</h4>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedCategory === 'all' ? 'All Categories' : ErrorCategories[selectedCategory]?.name}
          </div>
        </div>
        <ErrorFrequencyChart />
      </div>

      {/* Top Errors Table */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h4 className="analytics-card-title">Most Frequent Errors</h4>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Top 10 by {sortBy}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Error Type</th>
                <th>Category</th>
                <th>Count</th>
                <th>Severity</th>
                <th>Last Seen</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {topErrors.map((error, index) => (
                <tr key={index}>
                  <td className="font-medium">
                    <div>
                      {error.type}
                      {error.examples.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {error.examples[0]}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span 
                      className="inline-flex items-center space-x-1 text-sm"
                      style={{ color: ErrorCategories[error.category?.toUpperCase()]?.color }}
                    >
                      <span>{ErrorCategories[error.category?.toUpperCase()]?.icon}</span>
                      <span>{error.category}</span>
                    </span>
                  </td>
                  <td className="font-semibold">{error.count}</td>
                  <td>
                    <span className={`status-badge ${
                      error.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      error.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                      error.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {error.severity}
                    </span>
                  </td>
                  <td className="text-sm">
                    {new Date(error.lastOccurrence).toLocaleDateString()}
                  </td>
                  <td className="text-sm">
                    {(error.count / data.length * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Heatmap */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <h4 className="analytics-card-title">Error Pattern Analysis</h4>
        </div>
        <ErrorHeatmap />
      </div>

      {/* Resolution Insights */}
      <div className="analytics-card">
        <h4 className="analytics-card-title mb-4">Resolution Insights</h4>
        <div className="space-y-4">
          {Object.entries(errorStats).map(([category, stats]) => {
            if (stats.total === 0) return null;
            
            return (
              <div key={category} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{ErrorCategories[category]?.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {ErrorCategories[category]?.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {stats.total} total errors
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {stats.resolutionRate.toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    resolved
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ErrorAnalysis;
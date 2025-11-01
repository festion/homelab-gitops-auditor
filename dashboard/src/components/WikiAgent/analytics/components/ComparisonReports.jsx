import React, { useState, useEffect, useMemo } from 'react';
import { TimePeriods, KPIDefinitions, MetricsUtils } from '../types/metricsTypes';
import analyticsService from '../utils/analyticsService';

const ComparisonReports = ({ currentData, comparisonPeriods = ['7d', '30d'] }) => {
  const [selectedComparison, setSelectedComparison] = useState('7d');
  const [comparisonData, setComparisonData] = useState({});
  const [selectedMetrics, setSelectedMetrics] = useState(['processingRate', 'uploadSuccess', 'errors', 'resources']);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('overview'); // overview, detailed, trends

  // Fetch comparison data
  useEffect(() => {
    fetchComparisonData();
  }, [selectedComparison]);

  const fetchComparisonData = async () => {
    setLoading(true);
    try {
      const period = TimePeriods[selectedComparison.toUpperCase()] || TimePeriods.LAST_7_DAYS;
      const endTime = Date.now() - period.duration;
      const startTime = endTime - period.duration;

      const data = await analyticsService.getHistoricalData(
        selectedComparison,
        ['performance', 'resources', 'errors']
      );

      setComparisonData(data);
    } catch (error) {
      console.error('Error fetching comparison data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate period comparisons
  const periodComparison = useMemo(() => {
    if (!currentData || !comparisonData || Object.keys(comparisonData).length === 0) {
      return {};
    }

    const comparison = {};
    
    // Performance metrics comparison
    if (currentData.performance && comparisonData.performance) {
      const currentPerf = currentData.performance;
      const comparisonPerf = comparisonData.performance;
      
      comparison.performance = {
        documentsProcessed: {
          current: MetricsUtils.aggregateMetrics(currentPerf.documentsProcessed || [], 'sum'),
          comparison: MetricsUtils.aggregateMetrics(comparisonPerf.documentsProcessed || [], 'sum'),
        },
        uploadSuccessRate: {
          current: calculateSuccessRate(currentPerf),
          comparison: calculateSuccessRate(comparisonPerf),
        },
        processingTime: {
          current: MetricsUtils.aggregateMetrics(currentPerf.processingTime || [], 'average'),
          comparison: MetricsUtils.aggregateMetrics(comparisonPerf.processingTime || [], 'average'),
        },
        queueDepth: {
          current: MetricsUtils.aggregateMetrics(currentPerf.queueDepth || [], 'average'),
          comparison: MetricsUtils.aggregateMetrics(comparisonPerf.queueDepth || [], 'average'),
        }
      };
    }

    // Resource metrics comparison
    if (currentData.resources && comparisonData.resources) {
      comparison.resources = {
        cpuUsage: {
          current: MetricsUtils.aggregateMetrics(currentData.resources.cpuUsage || [], 'average'),
          comparison: MetricsUtils.aggregateMetrics(comparisonData.resources.cpuUsage || [], 'average'),
        },
        memoryUsage: {
          current: MetricsUtils.aggregateMetrics(currentData.resources.memoryUsage || [], 'average'),
          comparison: MetricsUtils.aggregateMetrics(comparisonData.resources.memoryUsage || [], 'average'),
        },
        diskUsage: {
          current: MetricsUtils.aggregateMetrics(currentData.resources.diskUsage || [], 'average'),
          comparison: MetricsUtils.aggregateMetrics(comparisonData.resources.diskUsage || [], 'average'),
        }
      };
    }

    // Error metrics comparison
    if (currentData.errors && comparisonData.errors) {
      comparison.errors = {
        totalErrors: {
          current: currentData.errors.length || 0,
          comparison: comparisonData.errors.length || 0,
        },
        errorRate: {
          current: calculateErrorRate(currentData),
          comparison: calculateErrorRate(comparisonData),
        }
      };
    }

    return comparison;
  }, [currentData, comparisonData]);

  // Helper function to calculate success rate
  const calculateSuccessRate = (perfData) => {
    const uploads = perfData.uploadSuccess || [];
    const failures = perfData.uploadFailures || [];
    const totalUploads = uploads.length + failures.length;
    
    if (totalUploads === 0) return 0;
    return (uploads.length / totalUploads) * 100;
  };

  // Helper function to calculate error rate
  const calculateErrorRate = (data) => {
    const totalOperations = (data.performance?.documentsProcessed?.length || 0) + (data.errors?.length || 0);
    if (totalOperations === 0) return 0;
    return ((data.errors?.length || 0) / totalOperations) * 100;
  };

  // Calculate percentage change
  const calculateChange = (current, comparison) => {
    if (comparison === 0) return current > 0 ? 100 : 0;
    return ((current - comparison) / comparison) * 100;
  };

  // Get change color class
  const getChangeColor = (change, inverse = false) => {
    const isPositive = inverse ? change < 0 : change > 0;
    return isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  // Comparison metric card component
  const ComparisonCard = ({ title, current, comparison, unit = '', inverse = false, format = 'number' }) => {
    const change = calculateChange(current || 0, comparison || 0);
    const changeColor = getChangeColor(change, inverse);
    
    const formatValue = (value) => {
      switch (format) {
        case 'percentage':
          return `${(value || 0).toFixed(1)}%`;
        case 'duration':
          return MetricsUtils.formatDuration(value || 0);
        case 'bytes':
          return MetricsUtils.formatBytes(value || 0);
        default:
          return (value || 0).toFixed(0);
      }
    };

    return (
      <div className="comparison-container bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="comparison-title text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
          {title}
        </div>
        
        <div className="space-y-3">
          <div className="comparison-period">
            <div className="comparison-title text-xs text-gray-500 dark:text-gray-400">
              Current Period
            </div>
            <div className="comparison-value text-xl font-bold text-gray-900 dark:text-white">
              {formatValue(current)}{unit}
            </div>
          </div>
          
          <div className="comparison-period">
            <div className="comparison-title text-xs text-gray-500 dark:text-gray-400">
              Previous Period
            </div>
            <div className="comparison-value text-lg font-semibold text-gray-700 dark:text-gray-300">
              {formatValue(comparison)}{unit}
            </div>
          </div>
          
          <div className={`comparison-change text-sm font-medium ${changeColor}`}>
            <span className="mr-1">
              {change > 0 ? '↗' : change < 0 ? '↘' : '→'}
            </span>
            {Math.abs(change).toFixed(1)}% {change > 0 ? 'increase' : change < 0 ? 'decrease' : 'no change'}
          </div>
        </div>
      </div>
    );
  };

  // Trend visualization component
  const TrendVisualization = ({ data, title }) => {
    if (!data || data.length === 0) return null;
    
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h4>
        <div className="h-20 w-full relative">
          <svg width="100%" height="100%" className="overflow-visible">
            <polyline
              fill="none"
              stroke="rgb(59, 130, 246)"
              strokeWidth="2"
              points={data.map((point, index) => {
                const x = (index / (data.length - 1 || 1)) * 100;
                const y = 100 - ((point.value - minValue) / (maxValue - minValue || 1)) * 100;
                return `${x},${y}`;
              }).join(' ')}
            />
          </svg>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{minValue.toFixed(1)}</span>
          <span>{maxValue.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  // Performance summary component
  const PerformanceSummary = () => {
    const performance = periodComparison.performance || {};
    
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Performance Comparison</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ComparisonCard
            title="Documents Processed"
            current={performance.documentsProcessed?.current}
            comparison={performance.documentsProcessed?.comparison}
          />
          <ComparisonCard
            title="Upload Success Rate"
            current={performance.uploadSuccessRate?.current}
            comparison={performance.uploadSuccessRate?.comparison}
            format="percentage"
          />
          <ComparisonCard
            title="Avg Processing Time"
            current={performance.processingTime?.current}
            comparison={performance.processingTime?.comparison}
            format="duration"
            inverse={true}
          />
          <ComparisonCard
            title="Queue Depth"
            current={performance.queueDepth?.current}
            comparison={performance.queueDepth?.comparison}
            inverse={true}
          />
        </div>
      </div>
    );
  };

  // Resource comparison component
  const ResourceComparison = () => {
    const resources = periodComparison.resources || {};
    
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Resource Utilization</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComparisonCard
            title="CPU Usage"
            current={resources.cpuUsage?.current}
            comparison={resources.cpuUsage?.comparison}
            format="percentage"
            inverse={true}
          />
          <ComparisonCard
            title="Memory Usage"
            current={resources.memoryUsage?.current}
            comparison={resources.memoryUsage?.comparison}
            format="percentage"
            inverse={true}
          />
          <ComparisonCard
            title="Disk Usage"
            current={resources.diskUsage?.current}
            comparison={resources.diskUsage?.comparison}
            format="percentage"
            inverse={true}
          />
        </div>
      </div>
    );
  };

  // Error analysis component
  const ErrorComparison = () => {
    const errors = periodComparison.errors || {};
    
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Error Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ComparisonCard
            title="Total Errors"
            current={errors.totalErrors?.current}
            comparison={errors.totalErrors?.comparison}
            inverse={true}
          />
          <ComparisonCard
            title="Error Rate"
            current={errors.errorRate?.current}
            comparison={errors.errorRate?.comparison}
            format="percentage"
            inverse={true}
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="analytics-skeleton h-8 w-64"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="analytics-skeleton h-32"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Period-over-Period Analysis
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compare current performance against previous periods
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={selectedComparison}
            onChange={(e) => setSelectedComparison(e.target.value)}
            className="filter-select"
          >
            {comparisonPeriods.map(period => {
              const periodData = TimePeriods[period.toUpperCase()];
              return (
                <option key={period} value={period}>
                  vs Previous {periodData?.label}
                </option>
              );
            })}
          </select>
          
          <div className="flex space-x-1">
            {['overview', 'detailed', 'trends'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview Mode */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          <PerformanceSummary />
          <ResourceComparison />
          <ErrorComparison />
        </div>
      )}

      {/* Detailed Mode */}
      {viewMode === 'detailed' && (
        <div className="space-y-6">
          <PerformanceSummary />
          
          {/* Detailed Performance Metrics */}
          <div className="analytics-card">
            <h3 className="analytics-card-title mb-4">Detailed Performance Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current Period</th>
                    <th>Previous Period</th>
                    <th>Change</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(periodComparison.performance || {}).map(([key, data]) => {
                    const change = calculateChange(data.current, data.comparison);
                    return (
                      <tr key={key}>
                        <td className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</td>
                        <td>{data.current?.toFixed(2) || '0'}</td>
                        <td>{data.comparison?.toFixed(2) || '0'}</td>
                        <td className={getChangeColor(change, key.includes('time') || key.includes('queue'))}>
                          {change > 0 ? '+' : ''}{change.toFixed(1)}%
                        </td>
                        <td>
                          <span className={`status-badge ${
                            Math.abs(change) < 5 ? 'status-online' : 
                            Math.abs(change) < 15 ? 'status-warning' : 'status-offline'
                          }`}>
                            {Math.abs(change) < 5 ? 'Stable' : 
                             Math.abs(change) < 15 ? 'Changed' : 'Significant'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <ResourceComparison />
          <ErrorComparison />
        </div>
      )}

      {/* Trends Mode */}
      {viewMode === 'trends' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {currentData.performance && (
              <>
                <div className="analytics-card">
                  <TrendVisualization
                    data={currentData.performance.documentsProcessed || []}
                    title="Documents Processed Trend"
                  />
                </div>
                <div className="analytics-card">
                  <TrendVisualization
                    data={currentData.performance.processingTime || []}
                    title="Processing Time Trend"
                  />
                </div>
              </>
            )}
            
            {currentData.resources && (
              <>
                <div className="analytics-card">
                  <TrendVisualization
                    data={currentData.resources.cpuUsage || []}
                    title="CPU Usage Trend"
                  />
                </div>
                <div className="analytics-card">
                  <TrendVisualization
                    data={currentData.resources.memoryUsage || []}
                    title="Memory Usage Trend"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Key Insights */}
      <div className="analytics-card">
        <h3 className="analytics-card-title mb-4">Key Insights</h3>
        <div className="space-y-3">
          {Object.entries(periodComparison).map(([category, metrics]) => {
            const significantChanges = Object.entries(metrics).filter(([_, data]) => {
              const change = calculateChange(data.current, data.comparison);
              return Math.abs(change) >= 10;
            });
            
            return significantChanges.map(([metric, data]) => {
              const change = calculateChange(data.current, data.comparison);
              const isImprovement = metric.includes('success') || metric.includes('resolved') ? 
                change > 0 : change < 0;
              
              return (
                <div key={`${category}-${metric}`} className={`flex items-start space-x-3 p-3 rounded-lg ${
                  isImprovement ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                }`}>
                  <span className="text-lg">
                    {isImprovement ? '✅' : '⚠️'}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {metric.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isImprovement ? 'Improved' : 'Degraded'} by {Math.abs(change).toFixed(1)}% 
                      compared to previous {TimePeriods[selectedComparison.toUpperCase()]?.label.toLowerCase()}
                    </p>
                  </div>
                </div>
              );
            });
          }).flat()}
          
          {Object.values(periodComparison).every(metrics => 
            Object.values(metrics).every(data => 
              Math.abs(calculateChange(data.current, data.comparison)) < 10
            )
          ) && (
            <div className="flex items-start space-x-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <span className="text-lg">ℹ️</span>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">System Stable</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No significant changes detected in system performance
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComparisonReports;
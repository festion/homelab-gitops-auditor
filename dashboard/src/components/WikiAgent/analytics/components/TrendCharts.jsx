import React, { useState, useEffect, useMemo } from 'react';
import { TimePeriods, ChartTypes, MetricsUtils } from '../types/metricsTypes';
import analyticsService from '../utils/analyticsService';

const TrendCharts = ({ data, period, metric, height = 'medium', showControls = false }) => {
  const [chartType, setChartType] = useState('line');
  const [selectedMetric, setSelectedMetric] = useState(metric);
  const [aggregation, setAggregation] = useState('average');
  const [showForecast, setShowForecast] = useState(false);
  const [trendAnalysis, setTrendAnalysis] = useState(null);

  // Calculate trend analysis
  useEffect(() => {
    if (data && data.length > 0) {
      const analysis = analyticsService.calculateTrends(data);
      setTrendAnalysis(analysis);
    }
  }, [data, selectedMetric]);

  // Process data for visualization
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Group data by time intervals based on period
    const timePeriod = TimePeriods[period.toUpperCase()] || TimePeriods.LAST_24_HOURS;
    const intervalMs = timePeriod.duration < 86400000 ? 3600000 : 86400000; // 1 hour or 1 day
    
    const grouped = {};
    data.forEach(point => {
      const timeKey = Math.floor(point.timestamp / intervalMs) * intervalMs;
      if (!grouped[timeKey]) grouped[timeKey] = [];
      grouped[timeKey].push(point);
    });
    
    // Aggregate grouped data
    return Object.entries(grouped)
      .map(([timestamp, points]) => ({
        timestamp: parseInt(timestamp),
        value: MetricsUtils.aggregateMetrics(points, aggregation),
        count: points.length
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, period, aggregation]);

  // Generate SVG path for line chart
  const generatePath = (points, width, height) => {
    if (points.length === 0) return '';
    
    const maxValue = Math.max(...points.map(p => p.value));
    const minValue = Math.min(...points.map(p => p.value));
    const valueRange = maxValue - minValue || 1;
    
    const xStep = width / (points.length - 1);
    
    let path = '';
    points.forEach((point, index) => {
      const x = index * xStep;
      const y = height - ((point.value - minValue) / valueRange) * height;
      
      if (index === 0) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    
    return path;
  };

  // Generate bars for bar chart
  const generateBars = (points, width, height) => {
    if (points.length === 0) return [];
    
    const maxValue = Math.max(...points.map(p => p.value));
    const barWidth = (width - (points.length - 1) * 4) / points.length;
    
    return points.map((point, index) => {
      const x = index * (barWidth + 4);
      const barHeight = (point.value / maxValue) * height;
      const y = height - barHeight;
      
      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        value: point.value,
        timestamp: point.timestamp
      };
    });
  };

  // Format time labels
  const formatTimeLabel = (timestamp) => {
    const date = new Date(timestamp);
    const timePeriod = TimePeriods[period.toUpperCase()] || TimePeriods.LAST_24_HOURS;
    
    if (timePeriod.duration <= 86400000) { // 24 hours or less
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get chart height class
  const heightClass = {
    small: 'chart-small',
    medium: 'chart-medium',
    large: 'chart-large'
  }[height];

  // Get trend color
  const getTrendColor = () => {
    if (!trendAnalysis) return 'text-gray-500';
    switch (trendAnalysis.trend) {
      case 'increasing': return 'text-green-600 dark:text-green-400';
      case 'decreasing': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  };

  // Get trend icon
  const getTrendIcon = () => {
    if (!trendAnalysis) return '→';
    switch (trendAnalysis.trend) {
      case 'increasing': return '↗';
      case 'decreasing': return '↘';
      default: return '→';
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className={`chart-container ${heightClass}`}>
        <div className="chart-error">
          <div className="text-center">
            <p className="text-sm font-medium">No data available</p>
            <p className="text-xs text-gray-400 mt-1">Data will appear when metrics are collected</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart Controls */}
      {showControls && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="filter-select"
          >
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="area">Area Chart</option>
          </select>
          
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value)}
            className="filter-select"
          >
            <option value="average">Average</option>
            <option value="sum">Sum</option>
            <option value="max">Maximum</option>
            <option value="min">Minimum</option>
          </select>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showForecast}
              onChange={(e) => setShowForecast(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span>Show Forecast</span>
          </label>
        </div>
      )}

      {/* Trend Summary */}
      {trendAnalysis && (
        <div className="flex items-center justify-between text-sm">
          <div className={`flex items-center space-x-2 ${getTrendColor()}`}>
            <span className="text-lg">{getTrendIcon()}</span>
            <span className="font-medium capitalize">{trendAnalysis.trend} trend</span>
            <span>({trendAnalysis.confidence}% confidence)</span>
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            Change: {trendAnalysis.change > 0 ? '+' : ''}{trendAnalysis.change.toFixed(2)}
          </div>
        </div>
      )}

      {/* Chart Container */}
      <div className={`chart-container ${heightClass} relative`}>
        <svg width="100%" height="100%" className="overflow-visible">
          <defs>
            <linearGradient id={`gradient-${metric}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          
          {/* Chart Background Grid */}
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
            {[...Array(6)].map((_, i) => (
              <line
                key={`v-${i}`}
                x1={`${(i * 20)}%`}
                y1="0"
                x2={`${(i * 20)}%`}
                y2="100%"
                stroke="currentColor"
                strokeWidth="0.5"
              />
            ))}
          </g>
          
          {/* Render Chart Based on Type */}
          {chartType === 'line' && (
            <g>
              <path
                d={generatePath(processedData, 100, 100)}
                fill="none"
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {processedData.map((point, index) => (
                <circle
                  key={index}
                  cx={`${(index / (processedData.length - 1)) * 100}%`}
                  cy={`${100 - ((point.value - Math.min(...processedData.map(p => p.value))) / 
                    (Math.max(...processedData.map(p => p.value)) - Math.min(...processedData.map(p => p.value)) || 1)) * 100}%`}
                  r="3"
                  fill="rgb(59, 130, 246)"
                  className="hover:r-5 transition-all duration-200"
                >
                  <title>{`${formatTimeLabel(point.timestamp)}: ${point.value}`}</title>
                </circle>
              ))}
            </g>
          )}
          
          {chartType === 'area' && (
            <g>
              <path
                d={`${generatePath(processedData, 100, 100)} L 100 100 L 0 100 Z`}
                fill={`url(#gradient-${metric})`}
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          
          {chartType === 'bar' && (
            <g>
              {generateBars(processedData, 100, 100).map((bar, index) => (
                <rect
                  key={index}
                  x={`${bar.x}%`}
                  y={`${bar.y}%`}
                  width={`${bar.width}%`}
                  height={`${bar.height}%`}
                  fill="rgb(59, 130, 246)"
                  className="hover:opacity-80 transition-opacity duration-200"
                >
                  <title>{`${formatTimeLabel(bar.timestamp)}: ${bar.value}`}</title>
                </rect>
              ))}
            </g>
          )}
          
          {/* Forecast Line */}
          {showForecast && trendAnalysis && trendAnalysis.forecast && (
            <path
              d={generatePath(
                [...processedData, ...trendAnalysis.forecast],
                100,
                100
              )}
              fill="none"
              stroke="rgb(156, 163, 175)"
              strokeWidth="1"
              strokeDasharray="5,5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        
        {/* Hover Tooltip */}
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 dark:text-gray-400">
          {processedData.length} data points
        </div>
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 px-2">
        {processedData.slice(0, 6).map((point, index) => (
          <span key={index} className={index > 0 ? 'hidden sm:inline' : ''}>
            {formatTimeLabel(point.timestamp)}
          </span>
        ))}
      </div>

      {/* Chart Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500 dark:text-gray-400">Average</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {MetricsUtils.aggregateMetrics(processedData, 'average').toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Maximum</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {MetricsUtils.aggregateMetrics(processedData, 'max').toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Minimum</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {MetricsUtils.aggregateMetrics(processedData, 'min').toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Latest</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {processedData[processedData.length - 1]?.value.toFixed(2) || 0}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrendCharts;
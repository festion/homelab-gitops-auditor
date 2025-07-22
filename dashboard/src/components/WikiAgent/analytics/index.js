// WikiJS Agent Analytics Components Export Index

// Main Analytics Components
export { default as PerformanceDashboard } from './components/PerformanceDashboard';
export { default as TrendCharts } from './components/TrendCharts';
export { default as ErrorAnalysis } from './components/ErrorAnalysis';
export { default as ResourceMonitor } from './components/ResourceMonitor';
export { default as ComparisonReports } from './components/ComparisonReports';
export { default as ExportReports } from './components/ExportReports';
export { default as AlertingSystem } from './components/AlertingSystem';

// Analytics Utilities and Services
export { default as analyticsService } from './utils/analyticsService';

// Types and Constants
export * from './types/metricsTypes';

// Analytics Configuration
export const ANALYTICS_CONFIG = {
  // Default time periods for analytics
  DEFAULT_PERIOD: '24h',
  REFRESH_INTERVAL: 30000, // 30 seconds
  
  // Chart configuration
  CHART_CONFIG: {
    DEFAULT_HEIGHT: 'medium',
    ANIMATION_DURATION: 1000,
    MAX_DATA_POINTS: 1000
  },
  
  // Export configuration
  EXPORT_CONFIG: {
    DEFAULT_FORMAT: 'PDF',
    MAX_FILE_SIZE: 10485760, // 10MB
    SUPPORTED_FORMATS: ['PDF', 'CSV', 'JSON', 'EXCEL']
  },
  
  // Alert configuration
  ALERT_CONFIG: {
    CHECK_INTERVAL: 60000, // 1 minute
    SILENCE_DURATION: 3600000, // 1 hour
    MAX_ACTIVE_ALERTS: 50
  }
};

// Analytics Routes Configuration
export const ANALYTICS_ROUTES = {
  PERFORMANCE: '/analytics/performance',
  TRENDS: '/analytics/trends',
  ERRORS: '/analytics/errors',
  RESOURCES: '/analytics/resources',
  COMPARISONS: '/analytics/comparisons',
  EXPORTS: '/analytics/exports',
  ALERTS: '/analytics/alerts'
};

// Component Props Types (for TypeScript environments)
export const COMPONENT_PROP_TYPES = {
  PerformanceDashboard: {
    // No required props - fetches its own data
  },
  
  TrendCharts: {
    data: 'array', // Required: Array of data points
    period: 'string', // Optional: Time period
    metric: 'string', // Optional: Metric to display
    height: 'string', // Optional: Chart height
    showControls: 'boolean' // Optional: Show chart controls
  },
  
  ErrorAnalysis: {
    data: 'array', // Required: Array of error data
    period: 'string' // Required: Time period
  },
  
  ResourceMonitor: {
    data: 'array', // Required: Array of resource data
    period: 'string', // Required: Time period
    showDetails: 'boolean' // Optional: Show detailed resource info
  },
  
  ComparisonReports: {
    currentData: 'object', // Required: Current period data
    comparisonPeriods: 'array' // Optional: Periods to compare against
  },
  
  ExportReports: {
    currentData: 'object', // Required: Data to export
    onExportComplete: 'function' // Optional: Callback after export
  },
  
  AlertingSystem: {
    currentMetrics: 'object', // Required: Current metrics for alert checking
    onAlertConfigChange: 'function' // Optional: Callback when alert config changes
  }
};

// Analytics Hooks (if using React hooks pattern)
export const useAnalyticsHooks = {
  // Hook for fetching historical data
  useHistoricalData: (period, metricTypes) => {
    // Implementation would go here
    // Returns: { data, loading, error, refetch }
  },
  
  // Hook for real-time metrics
  useRealtimeMetrics: () => {
    // Implementation would go here
    // Returns: { metrics, isConnected, lastUpdate }
  },
  
  // Hook for alert management
  useAlertManagement: () => {
    // Implementation would go here
    // Returns: { alerts, rules, updateRule, resolveAlert }
  }
};

// Analytics Context Provider (for React Context pattern)
export const AnalyticsContext = {
  // Context configuration would go here
  // Provider component for sharing analytics state across components
};

// Utility Functions
export const analyticsUtils = {
  // Format display values
  formatMetricValue: (value, type) => {
    switch (type) {
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'duration':
        return formatDuration(value);
      case 'bytes':
        return formatBytes(value);
      case 'rate':
        return `${value.toFixed(1)}/hr`;
      default:
        return value.toString();
    }
  },
  
  // Calculate metric changes
  calculateChange: (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  },
  
  // Get trend direction
  getTrendDirection: (change) => {
    if (change > 1) return 'up';
    if (change < -1) return 'down';
    return 'stable';
  },
  
  // Color coding for metrics
  getMetricColor: (value, thresholds, inverse = false) => {
    if (!thresholds) return 'blue';
    
    const isHigh = value >= thresholds.critical;
    const isMedium = value >= thresholds.warning;
    
    if (inverse) {
      return isHigh ? 'red' : isMedium ? 'yellow' : 'green';
    } else {
      return isHigh ? 'green' : isMedium ? 'yellow' : 'red';
    }
  }
};

// Helper function imports from utils
const { formatDuration, formatBytes } = require('./types/metricsTypes');

// Default export - main analytics service
export default {
  service: analyticsService,
  components: {
    PerformanceDashboard,
    TrendCharts,
    ErrorAnalysis,
    ResourceMonitor,
    ComparisonReports,
    ExportReports,
    AlertingSystem
  },
  config: ANALYTICS_CONFIG,
  utils: analyticsUtils
};
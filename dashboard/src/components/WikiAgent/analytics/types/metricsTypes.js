// Analytics Data Models and Types for WikiJS Agent

export const MetricsSchema = {
  performance: {
    documentsDiscovered: 'number',
    documentsProcessed: 'number',
    uploadSuccess: 'number',
    uploadFailures: 'number',
    processingTime: 'number', // ms
    queueDepth: 'number',
    throughputRate: 'number', // docs/hour
    averageFileSize: 'number', // bytes
    totalDataProcessed: 'number' // bytes
  },
  errors: {
    errorType: 'string',
    errorCount: 'number',
    errorRate: 'number', // percentage
    resolution: 'string',
    severity: 'string', // low, medium, high, critical
    category: 'string', // network, processing, storage, etc.
    timestamp: 'date'
  },
  resources: {
    cpuUsage: 'number', // percentage
    memoryUsage: 'number', // bytes
    diskIO: 'number', // bytes/second
    networkIO: 'number', // bytes/second
    diskSpace: 'number', // bytes available
    activeThreads: 'number'
  }
};

export const KPIDefinitions = {
  DOCUMENT_PROCESSING_RATE: {
    name: 'Document Processing Rate',
    description: 'Documents processed per hour',
    target: 100,
    unit: 'docs/hour',
    type: 'throughput'
  },
  UPLOAD_SUCCESS_RATE: {
    name: 'Upload Success Rate',
    description: 'Percentage of successful uploads',
    target: 95,
    unit: '%',
    type: 'quality'
  },
  AVERAGE_PROCESSING_TIME: {
    name: 'Average Processing Time',
    description: 'Time from discovery to publication',
    target: 30000, // 30 seconds
    unit: 'ms',
    type: 'performance'
  },
  SYNC_ACCURACY: {
    name: 'Sync Accuracy',
    description: 'Percentage of successful syncs',
    target: 98,
    unit: '%',
    type: 'reliability'
  },
  SYSTEM_AVAILABILITY: {
    name: 'System Availability',
    description: 'Agent uptime percentage',
    target: 99.5,
    unit: '%',
    type: 'availability'
  },
  ERROR_RESOLUTION_TIME: {
    name: 'Error Resolution Time',
    description: 'Average time to resolve errors',
    target: 300000, // 5 minutes
    unit: 'ms',
    type: 'reliability'
  }
};

export const AlertThresholds = {
  UPLOAD_FAILURE_RATE: {
    warning: 5, // percentage
    critical: 10
  },
  PROCESSING_DELAY: {
    warning: 300000, // 5 minutes
    critical: 600000 // 10 minutes
  },
  RESOURCE_USAGE: {
    cpu: { warning: 80, critical: 95 },
    memory: { warning: 85, critical: 95 },
    disk: { warning: 85, critical: 95 }
  },
  QUEUE_DEPTH: {
    warning: 100,
    critical: 500
  },
  ERROR_RATE: {
    warning: 2, // percentage
    critical: 5
  }
};

export const ChartTypes = {
  LINE: 'line',
  BAR: 'bar',
  PIE: 'pie',
  AREA: 'area',
  SCATTER: 'scatter',
  HEATMAP: 'heatmap',
  GAUGE: 'gauge',
  SPARKLINE: 'sparkline'
};

export const TimePeriods = {
  LAST_HOUR: { label: '1 Hour', value: '1h', duration: 3600000 },
  LAST_4_HOURS: { label: '4 Hours', value: '4h', duration: 14400000 },
  LAST_24_HOURS: { label: '24 Hours', value: '24h', duration: 86400000 },
  LAST_7_DAYS: { label: '7 Days', value: '7d', duration: 604800000 },
  LAST_30_DAYS: { label: '30 Days', value: '30d', duration: 2592000000 },
  LAST_90_DAYS: { label: '90 Days', value: '90d', duration: 7776000000 }
};

export const ReportTypes = {
  DAILY: {
    name: 'Daily Report',
    metrics: ['documentsProcessed', 'uploadSuccess', 'errors', 'systemHealth'],
    schedule: 'daily at 9:00 AM',
    format: 'email',
    retention: 30 // days
  },
  WEEKLY: {
    name: 'Weekly Summary',
    metrics: ['trends', 'performance', 'resourceUsage', 'errorAnalysis'],
    schedule: 'weekly on Monday',
    format: 'PDF',
    retention: 52 // weeks
  },
  MONTHLY: {
    name: 'Monthly Analysis',
    metrics: ['comprehensive', 'yearOverYear', 'capacity', 'optimization'],
    schedule: 'monthly on 1st',
    format: 'comprehensive',
    retention: 24 // months
  },
  CUSTOM: {
    name: 'Custom Report',
    metrics: [], // user-defined
    schedule: 'on-demand',
    format: 'configurable',
    retention: 90 // days
  }
};

export const ErrorCategories = {
  NETWORK: {
    name: 'Network Errors',
    color: '#ef4444',
    icon: '🌐',
    examples: ['connection_timeout', 'dns_resolution', 'ssl_error']
  },
  PROCESSING: {
    name: 'Processing Errors',
    color: '#f59e0b',
    icon: '⚙️',
    examples: ['parsing_error', 'conversion_failed', 'metadata_extraction']
  },
  STORAGE: {
    name: 'Storage Errors',
    color: '#8b5cf6',
    icon: '💾',
    examples: ['disk_full', 'permission_denied', 'file_locked']
  },
  VALIDATION: {
    name: 'Validation Errors',
    color: '#06b6d4',
    icon: '✓',
    examples: ['invalid_format', 'size_limit', 'content_validation']
  },
  SYNC: {
    name: 'Synchronization Errors',
    color: '#10b981',
    icon: '🔄',
    examples: ['conflict_resolution', 'version_mismatch', 'remote_unavailable']
  }
};

export const AnalyticsConfig = {
  collection: {
    metricsInterval: 60000, // ms - collect metrics every minute
    retentionPeriod: 90, // days
    aggregationLevels: ['minutely', 'hourly', 'daily', 'weekly', 'monthly'],
    maxDataPoints: 1000
  },
  visualization: {
    defaultPeriod: '24h',
    refreshInterval: 30000, // ms
    chartAnimations: true,
    colorScheme: 'modern',
    responsiveBreakpoints: {
      mobile: 768,
      tablet: 1024,
      desktop: 1200
    }
  },
  alerts: {
    enabled: true,
    checkInterval: 60000, // ms
    escalationDelay: 300000, // ms - 5 minutes
    notifications: ['dashboard', 'email', 'webhook'],
    silencePeriod: 1800000 // ms - 30 minutes
  },
  reports: {
    defaultFormat: 'PDF',
    maxFileSize: 10485760, // 10MB
    compressionLevel: 9,
    watermark: true
  },
  performance: {
    enableCaching: true,
    cacheExpiration: 300000, // ms - 5 minutes
    maxConcurrentQueries: 10,
    queryTimeout: 30000 // ms - 30 seconds
  }
};

// Utility functions for metrics processing
export const MetricsUtils = {
  calculateRate: (current, previous, timeInterval) => {
    if (!previous || timeInterval === 0) return 0;
    return ((current - previous) / timeInterval) * 3600000; // per hour
  },
  
  calculatePercentage: (part, total) => {
    if (total === 0) return 0;
    return Math.round((part / total) * 100 * 100) / 100; // 2 decimal places
  },
  
  formatBytes: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  formatDuration: (milliseconds) => {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  },
  
  aggregateMetrics: (dataPoints, aggregationType) => {
    if (!dataPoints || dataPoints.length === 0) return null;
    
    switch (aggregationType) {
      case 'sum':
        return dataPoints.reduce((sum, point) => sum + point.value, 0);
      case 'average':
        return dataPoints.reduce((sum, point) => sum + point.value, 0) / dataPoints.length;
      case 'min':
        return Math.min(...dataPoints.map(point => point.value));
      case 'max':
        return Math.max(...dataPoints.map(point => point.value));
      case 'latest':
        return dataPoints[dataPoints.length - 1]?.value || 0;
      default:
        return dataPoints[dataPoints.length - 1]?.value || 0;
    }
  }
};
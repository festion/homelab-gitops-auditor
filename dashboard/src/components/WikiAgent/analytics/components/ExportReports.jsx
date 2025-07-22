import React, { useState, useEffect } from 'react';
import { TimePeriods, ReportTypes, MetricsUtils } from '../types/metricsTypes';
import analyticsService from '../utils/analyticsService';

const ExportReports = ({ currentData, onExportComplete }) => {
  const [exportConfig, setExportConfig] = useState({
    reportType: 'DAILY',
    format: 'PDF',
    period: '24h',
    includeCharts: true,
    includeSummary: true,
    includeRawData: false,
    customMetrics: []
  });

  const [availableMetrics, setAvailableMetrics] = useState([
    'documentsProcessed',
    'uploadSuccess',
    'processingTime',
    'queueDepth',
    'cpuUsage',
    'memoryUsage',
    'diskUsage',
    'errorCount',
    'syncStatus'
  ]);

  const [scheduledReports, setScheduledReports] = useState([]);
  const [recentExports, setRecentExports] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);

  // Fetch scheduled reports and recent exports
  useEffect(() => {
    fetchScheduledReports();
    fetchRecentExports();
  }, []);

  const fetchScheduledReports = async () => {
    try {
      const response = await fetch('/api/wiki-agent/reports/scheduled');
      if (response.ok) {
        const reports = await response.json();
        setScheduledReports(reports);
      }
    } catch (error) {
      console.error('Error fetching scheduled reports:', error);
    }
  };

  const fetchRecentExports = async () => {
    try {
      const response = await fetch('/api/wiki-agent/reports/recent');
      if (response.ok) {
        const exports = await response.json();
        setRecentExports(exports);
      }
    } catch (error) {
      console.error('Error fetching recent exports:', error);
    }
  };

  // Handle export configuration changes
  const updateConfig = (field, value) => {
    setExportConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleMetric = (metric) => {
    setExportConfig(prev => ({
      ...prev,
      customMetrics: prev.customMetrics.includes(metric)
        ? prev.customMetrics.filter(m => m !== metric)
        : [...prev.customMetrics, metric]
    }));
  };

  // Generate report
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const reportData = await analyticsService.generateReport(exportConfig.reportType, {
        format: exportConfig.format,
        period: exportConfig.period,
        includeCharts: exportConfig.includeCharts,
        includeSummary: exportConfig.includeSummary,
        includeRawData: exportConfig.includeRawData,
        customMetrics: exportConfig.customMetrics,
        data: currentData
      });

      // Trigger download
      const blob = new Blob([reportData.content], { 
        type: getContentType(exportConfig.format) 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wikijs-agent-report-${Date.now()}.${exportConfig.format.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Update recent exports
      fetchRecentExports();
      
      if (onExportComplete) {
        onExportComplete(reportData);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Get content type for download
  const getContentType = (format) => {
    switch (format.toLowerCase()) {
      case 'pdf': return 'application/pdf';
      case 'csv': return 'text/csv';
      case 'json': return 'application/json';
      case 'excel': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default: return 'text/plain';
    }
  };

  // Schedule a report
  const scheduleReport = async (scheduleConfig) => {
    try {
      const response = await fetch('/api/wiki-agent/reports/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig)
      });

      if (response.ok) {
        fetchScheduledReports();
        setShowScheduler(false);
      }
    } catch (error) {
      console.error('Error scheduling report:', error);
    }
  };

  // Delete scheduled report
  const deleteScheduledReport = async (reportId) => {
    try {
      const response = await fetch(`/api/wiki-agent/reports/scheduled/${reportId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchScheduledReports();
      }
    } catch (error) {
      console.error('Error deleting scheduled report:', error);
    }
  };

  // Report Configuration Panel
  const ConfigurationPanel = () => (
    <div className="analytics-card">
      <h3 className="analytics-card-title mb-6">Report Configuration</h3>
      
      <div className="space-y-6">
        {/* Report Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Report Type
          </label>
          <select
            value={exportConfig.reportType}
            onChange={(e) => updateConfig('reportType', e.target.value)}
            className="filter-select w-full"
          >
            {Object.entries(ReportTypes).map(([key, type]) => (
              <option key={key} value={key}>
                {type.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {ReportTypes[exportConfig.reportType]?.metrics?.join(', ') || 'Select report type for details'}
          </p>
        </div>

        {/* Format and Period */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Export Format
            </label>
            <select
              value={exportConfig.format}
              onChange={(e) => updateConfig('format', e.target.value)}
              className="filter-select w-full"
            >
              <option value="PDF">PDF Report</option>
              <option value="CSV">CSV Data</option>
              <option value="JSON">JSON Data</option>
              <option value="EXCEL">Excel Workbook</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Period
            </label>
            <select
              value={exportConfig.period}
              onChange={(e) => updateConfig('period', e.target.value)}
              className="filter-select w-full"
            >
              {Object.entries(TimePeriods).map(([key, period]) => (
                <option key={key} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Export Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Include in Report
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportConfig.includeSummary}
                onChange={(e) => updateConfig('includeSummary', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Executive Summary
              </span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportConfig.includeCharts}
                onChange={(e) => updateConfig('includeCharts', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Charts and Visualizations
              </span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportConfig.includeRawData}
                onChange={(e) => updateConfig('includeRawData', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Raw Data Tables
              </span>
            </label>
          </div>
        </div>

        {/* Custom Metrics Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Custom Metrics (Optional)
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {availableMetrics.map(metric => (
              <label key={metric} className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportConfig.customMetrics.includes(metric)}
                  onChange={() => toggleMetric(metric)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                  {metric.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Export Button */}
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="analytics-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <svg className="analytics-btn-icon animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Scheduled Reports Panel
  const ScheduledReportsPanel = () => (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">Scheduled Reports</h3>
        <button
          onClick={() => setShowScheduler(true)}
          className="analytics-btn-secondary text-sm"
        >
          <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Schedule New
        </button>
      </div>

      <div className="space-y-3">
        {scheduledReports.map(report => (
          <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">
                {ReportTypes[report.type]?.name || report.type}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {report.schedule} • {report.format} • Next: {new Date(report.nextRun).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`status-badge ${report.enabled ? 'status-online' : 'status-offline'}`}>
                {report.enabled ? 'Active' : 'Paused'}
              </span>
              <button
                onClick={() => deleteScheduledReport(report.id)}
                className="text-red-600 hover:text-red-800 dark:text-red-400 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {scheduledReports.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No scheduled reports configured
          </div>
        )}
      </div>
    </div>
  );

  // Recent Exports Panel
  const RecentExportsPanel = () => (
    <div className="analytics-card">
      <h3 className="analytics-card-title mb-4">Recent Exports</h3>
      
      <div className="overflow-x-auto">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Report Type</th>
              <th>Format</th>
              <th>Generated</th>
              <th>Size</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentExports.map(exportItem => (
              <tr key={exportItem.id}>
                <td className="font-medium">
                  {ReportTypes[exportItem.type]?.name || exportItem.type}
                </td>
                <td>
                  <span className="status-badge status-info">
                    {exportItem.format}
                  </span>
                </td>
                <td className="text-sm">
                  {new Date(exportItem.createdAt).toLocaleString()}
                </td>
                <td className="text-sm">
                  {MetricsUtils.formatBytes(exportItem.size || 0)}
                </td>
                <td>
                  <span className={`status-badge ${
                    exportItem.status === 'completed' ? 'status-online' :
                    exportItem.status === 'failed' ? 'status-offline' :
                    'status-warning'
                  }`}>
                    {exportItem.status}
                  </span>
                </td>
                <td>
                  {exportItem.status === 'completed' && exportItem.downloadUrl && (
                    <a
                      href={exportItem.downloadUrl}
                      download
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm"
                    >
                      Download
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {recentExports.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No recent exports
          </div>
        )}
      </div>
    </div>
  );

  // Quick Export Buttons
  const QuickExportButtons = () => (
    <div className="analytics-card">
      <h3 className="analytics-card-title mb-4">Quick Exports</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => {
            setExportConfig({
              reportType: 'DAILY',
              format: 'PDF',
              period: '24h',
              includeCharts: true,
              includeSummary: true,
              includeRawData: false,
              customMetrics: []
            });
            handleExport();
          }}
          className="analytics-btn-secondary flex flex-col items-center space-y-2 p-4"
          disabled={isExporting}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium">Daily Summary</span>
        </button>

        <button
          onClick={() => {
            setExportConfig({
              reportType: 'CUSTOM',
              format: 'CSV',
              period: '24h',
              includeCharts: false,
              includeSummary: false,
              includeRawData: true,
              customMetrics: availableMetrics
            });
            handleExport();
          }}
          className="analytics-btn-secondary flex flex-col items-center space-y-2 p-4"
          disabled={isExporting}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <span className="text-sm font-medium">Raw Data (CSV)</span>
        </button>

        <button
          onClick={() => {
            setExportConfig({
              reportType: 'WEEKLY',
              format: 'PDF',
              period: '7d',
              includeCharts: true,
              includeSummary: true,
              includeRawData: false,
              customMetrics: []
            });
            handleExport();
          }}
          className="analytics-btn-secondary flex flex-col items-center space-y-2 p-4"
          disabled={isExporting}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-medium">Weekly Report</span>
        </button>

        <button
          onClick={() => {
            setExportConfig({
              reportType: 'CUSTOM',
              format: 'JSON',
              period: '24h',
              includeCharts: false,
              includeSummary: false,
              includeRawData: true,
              customMetrics: availableMetrics
            });
            handleExport();
          }}
          className="analytics-btn-secondary flex flex-col items-center space-y-2 p-4"
          disabled={isExporting}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="text-sm font-medium">API Data (JSON)</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Quick Exports */}
      <QuickExportButtons />

      {/* Configuration and Scheduled Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConfigurationPanel />
        <ScheduledReportsPanel />
      </div>

      {/* Recent Exports */}
      <RecentExportsPanel />
    </div>
  );
};

export default ExportReports;
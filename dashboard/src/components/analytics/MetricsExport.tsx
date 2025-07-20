import React, { useState } from 'react';
import { Download, FileText, Database, FileImage, Calendar, Settings, CheckCircle } from 'lucide-react';

interface ExportOptions {
  format: 'csv' | 'json' | 'pdf' | 'xlsx';
  dateRange: '7d' | '30d' | '90d' | '1y' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  includeMetrics: {
    health: boolean;
    activity: boolean;
    compliance: boolean;
    predictions: boolean;
  };
  repositories: string[];
}

interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: string;
  fileName: string;
  downloadUrl?: string;
  createdAt: string;
  progress?: number;
}

const getAuthToken = (): string => {
  // In a real app, this would get the actual auth token
  return localStorage.getItem('authToken') || '';
};

export const MetricsExport: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    dateRange: '30d',
    includeMetrics: {
      health: true,
      activity: true,
      compliance: true,
      predictions: false,
    },
    repositories: [],
  });
  const [recentExports, setRecentExports] = useState<ExportJob[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const exportMetrics = async () => {
    setIsExporting(true);
    try {
      const exportPayload = {
        ...exportOptions,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch('/api/v2/metrics/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(exportPayload),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // For immediate download formats
      if (exportOptions.format === 'csv' || exportOptions.format === 'json') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `repository-metrics-${exportOptions.format}-${new Date().toISOString().split('T')[0]}.${exportOptions.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // For complex formats, get job ID for tracking
        const result = await response.json();
        const newJob: ExportJob = {
          id: result.jobId,
          status: 'processing',
          format: exportOptions.format,
          fileName: result.fileName,
          createdAt: new Date().toISOString(),
          progress: 0,
        };
        setRecentExports(prev => [newJob, ...prev.slice(0, 4)]);
        
        // Poll for completion
        pollExportStatus(result.jobId);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const pollExportStatus = async (jobId: string) => {
    const maxPolls = 30; // 5 minutes max
    let polls = 0;
    
    const poll = async () => {
      if (polls >= maxPolls) return;
      
      try {
        const response = await fetch(`/api/v2/metrics/export/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
        });
        
        if (response.ok) {
          const job = await response.json();
          setRecentExports(prev => 
            prev.map(exp => exp.id === jobId ? { ...exp, ...job } : exp)
          );
          
          if (job.status === 'completed' || job.status === 'failed') {
            return;
          }
        }
        
        polls++;
        setTimeout(poll, 10000); // Poll every 10 seconds
      } catch (error) {
        console.error('Failed to poll export status:', error);
      }
    };
    
    setTimeout(poll, 2000); // Start polling after 2 seconds
  };

  const downloadExport = async (job: ExportJob) => {
    if (!job.downloadUrl) return;
    
    try {
      const response = await fetch(job.downloadUrl, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = job.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const formatIcons = {
    csv: <FileText className="w-4 h-4" />,
    json: <Database className="w-4 h-4" />,
    pdf: <FileImage className="w-4 h-4" />,
    xlsx: <FileText className="w-4 h-4" />,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed': return <Download className="w-4 h-4 text-red-600" />;
      case 'processing': return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      default: return <Calendar className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Download className="w-5 h-5 text-blue-600" />
        <h3 className="text-xl font-semibold">Export Metrics</h3>
      </div>

      {/* Quick Export Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(formatIcons).map(([format, icon]) => (
          <button
            key={format}
            onClick={() => {
              setExportOptions(prev => ({ ...prev, format: format as any }));
              if (format === 'csv' || format === 'json') {
                exportMetrics();
              }
            }}
            disabled={isExporting}
            className="flex items-center space-x-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {icon}
            <span className="font-medium text-sm uppercase">{format}</span>
          </button>
        ))}
      </div>

      {/* Advanced Options Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 mb-4"
      >
        <Settings className="w-4 h-4" />
        <span className="text-sm">Advanced Options</span>
      </button>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 space-y-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(['7d', '30d', '90d', '1y', 'custom'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setExportOptions(prev => ({ ...prev, dateRange: range }))}
                  className={`px-3 py-2 text-sm rounded ${
                    exportOptions.dateRange === range
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {range === 'custom' ? 'Custom' : range.toUpperCase()}
                </button>
              ))}
            </div>
            
            {exportOptions.dateRange === 'custom' && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={exportOptions.customStartDate || ''}
                    onChange={(e) => setExportOptions(prev => ({
                      ...prev,
                      customStartDate: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={exportOptions.customEndDate || ''}
                    onChange={(e) => setExportOptions(prev => ({
                      ...prev,
                      customEndDate: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Metrics Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Include Metrics
            </label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(exportOptions.includeMetrics).map(([metric, included]) => (
                <label key={metric} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => setExportOptions(prev => ({
                      ...prev,
                      includeMetrics: {
                        ...prev.includeMetrics,
                        [metric]: e.target.checked
                      }
                    }))}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">
                    {metric.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Export Button */}
          <button
            onClick={exportMetrics}
            disabled={isExporting}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Export with Options</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Recent Exports */}
      {recentExports.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Recent Exports</h4>
          <div className="space-y-2">
            {recentExports.map(job => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.fileName}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className={`text-sm ${getStatusColor(job.status)}`}>
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </span>
                  
                  {job.status === 'processing' && job.progress && (
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  
                  {job.status === 'completed' && (
                    <button
                      onClick={() => downloadExport(job)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h5 className="font-medium text-blue-900 mb-2">Export Information</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• CSV/JSON: Immediate download for quick data access</li>
          <li>• PDF: Formatted report with charts and visualizations</li>
          <li>• XLSX: Spreadsheet format with multiple sheets for analysis</li>
          <li>• Large exports may take several minutes to process</li>
        </ul>
      </div>
    </div>
  );
};
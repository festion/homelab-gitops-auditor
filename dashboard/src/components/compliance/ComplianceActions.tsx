import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Download, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

interface ComplianceActionsProps {
  repository: string;
  missingTemplates?: string[];
  onSuccess?: () => void;
}

interface ApplyResult {
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  jobId?: string;
}

export const ComplianceActions: React.FC<ComplianceActionsProps> = ({ 
  repository, 
  missingTemplates = [],
  onSuccess 
}) => {
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [generateReport, setGenerateReport] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyResult | null>(null);
  const queryClient = useQueryClient();

  const applyTemplates = async (templates: string[], createPR: boolean = true) => {
    setApplyingTemplate(true);
    setLastResult(null);
    
    try {
      const response = await fetch('/api/v2/compliance/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repository, 
          templates, 
          createPR,
          dryRun: false 
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setLastResult({
          success: true,
          message: `Successfully applied ${templates.length} template(s)`,
          pullRequestUrl: result.pullRequestUrl,
          jobId: result.jobId
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['compliance'] });
        onSuccess?.();
      } else {
        setLastResult({
          success: false,
          message: result.error || 'Failed to apply templates'
        });
      }
    } catch (error) {
      setLastResult({
        success: false,
        message: 'Network error - please try again'
      });
    } finally {
      setApplyingTemplate(false);
    }
  };

  const downloadComplianceReport = async () => {
    setGenerateReport(true);
    
    try {
      const response = await fetch(`/api/v2/compliance/repository/${repository}?includeHistory=true`);
      if (response.ok) {
        const data = await response.json();
        
        // Create and download report
        const reportContent = JSON.stringify(data, null, 2);
        const blob = new Blob([reportContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${repository}-compliance-report.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setGenerateReport(false);
    }
  };

  const triggerComplianceCheck = async () => {
    try {
      await fetch('/api/v2/compliance/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repositories: [repository],
          priority: 'high'
        })
      });
      
      // Refresh compliance data after check
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['compliance'] });
      }, 5000);
    } catch (error) {
      console.error('Failed to trigger compliance check:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Results */}
      {lastResult && (
        <div className={`p-4 rounded-lg border ${
          lastResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start space-x-2">
            {lastResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${
                lastResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {lastResult.message}
              </p>
              
              {lastResult.pullRequestUrl && (
                <a 
                  href={lastResult.pullRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline text-sm mt-1 inline-block"
                >
                  View Pull Request →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-wrap gap-3">
        {missingTemplates.length > 0 && (
          <button
            onClick={() => applyTemplates(missingTemplates, true)}
            disabled={applyingTemplate}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Play className="w-4 h-4" />
            <span>
              {applyingTemplate 
                ? 'Applying Templates...' 
                : `Apply ${missingTemplates.length} Missing Template${missingTemplates.length !== 1 ? 's' : ''}`
              }
            </span>
          </button>
        )}

        <button
          onClick={triggerComplianceCheck}
          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center space-x-2"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Re-check Compliance</span>
        </button>

        <button
          onClick={downloadComplianceReport}
          disabled={generateReport}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>
            {generateReport ? 'Generating...' : 'Download Report'}
          </span>
        </button>
      </div>

      {/* Missing Templates Details */}
      {missingTemplates.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Templates to Apply</span>
          </h4>
          <div className="space-y-2">
            {missingTemplates.map((template, index) => (
              <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                <span className="text-sm text-gray-700">{template}</span>
                <button
                  onClick={() => applyTemplates([template], true)}
                  disabled={applyingTemplate}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 disabled:opacity-50"
                >
                  Apply Individual
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
        <p>
          <strong>Apply Templates:</strong> Creates a pull request with the missing templates applied to your repository.
        </p>
        <p className="mt-1">
          <strong>Re-check Compliance:</strong> Triggers a fresh compliance scan to detect any recent changes.
        </p>
        <p className="mt-1">
          <strong>Download Report:</strong> Generates a detailed compliance report including history and recommendations.
        </p>
      </div>
    </div>
  );
};
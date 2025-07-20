import React from 'react';
import { X, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { ComplianceScoreIndicator } from './ComplianceScoreIndicator';

interface ComplianceIssue {
  type: 'missing' | 'outdated' | 'conflict';
  template: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

interface RepositoryCompliance {
  name: string;
  compliant: boolean;
  score: number;
  appliedTemplates: string[];
  missingTemplates: string[];
  lastChecked: string;
  issues: ComplianceIssue[];
}

interface ComplianceDetailModalProps {
  repository: RepositoryCompliance;
  onClose: () => void;
}

export const ComplianceDetailModal: React.FC<ComplianceDetailModalProps> = ({ 
  repository, 
  onClose 
}) => {
  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'missing': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'outdated': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'conflict': return <X className="w-4 h-4 text-red-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold">{repository.name}</h2>
              <ComplianceScoreIndicator score={repository.score} size="small" showLabel={false} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          {/* Overview */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-2">Status</h3>
              <div className="flex items-center space-x-2">
                {repository.compliant ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-green-600 font-medium">Compliant</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="text-red-600 font-medium">Non-Compliant</span>
                  </>
                )}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-2">Last Checked</h3>
              <p className="text-sm text-gray-600">
                {new Date(repository.lastChecked).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Applied Templates */}
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Applied Templates</h3>
            {repository.appliedTemplates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {repository.appliedTemplates.map((template, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {template}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No templates applied</p>
            )}
          </div>

          {/* Missing Templates */}
          {repository.missingTemplates.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-gray-700 mb-3">Missing Templates</h3>
              <div className="flex flex-wrap gap-2">
                {repository.missingTemplates.map((template, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm"
                  >
                    {template}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Issues */}
          {repository.issues.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-gray-700 mb-3">Issues</h3>
              <div className="space-y-3">
                {repository.issues.map((issue, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-start space-x-3">
                      {getIssueIcon(issue.type)}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-gray-900">{issue.template}</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getSeverityColor(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{issue.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
            {!repository.compliant && (
              <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Fix Issues
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
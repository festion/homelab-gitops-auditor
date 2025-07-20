import React from 'react';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';
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

interface RepositoryComplianceCardProps {
  repository: RepositoryCompliance;
  onClick: () => void;
}

export const RepositoryComplianceCard: React.FC<RepositoryComplianceCardProps> = ({ 
  repository, 
  onClick 
}) => {
  const getStatusIcon = () => {
    if (repository.compliant) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    
    const highIssues = repository.issues.filter(issue => issue.severity === 'high').length;
    if (highIssues > 0) {
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
    
    return <Clock className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusText = () => {
    if (repository.compliant) return 'Compliant';
    
    const highIssues = repository.issues.filter(issue => issue.severity === 'high').length;
    if (highIssues > 0) return `${highIssues} Critical Issues`;
    
    return `${repository.issues.length} Issues`;
  };

  const getStatusColor = () => {
    if (repository.compliant) return 'text-green-600';
    
    const highIssues = repository.issues.filter(issue => issue.severity === 'high').length;
    if (highIssues > 0) return 'text-red-600';
    
    return 'text-yellow-600';
  };

  return (
    <div 
      className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium text-gray-900">{repository.name}</h4>
            <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
          </div>
        </div>
        <ComplianceScoreIndicator 
          score={repository.score} 
          size="small" 
          showLabel={false}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Applied Templates:</span>
          <p className="font-medium">{repository.appliedTemplates.length}</p>
        </div>
        <div>
          <span className="text-gray-600">Missing Templates:</span>
          <p className="font-medium text-red-600">{repository.missingTemplates.length}</p>
        </div>
      </div>

      {repository.missingTemplates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Missing:</p>
          <div className="flex flex-wrap gap-1">
            {repository.missingTemplates.slice(0, 3).map((template, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs"
              >
                {template}
              </span>
            ))}
            {repository.missingTemplates.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                +{repository.missingTemplates.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Last checked: {new Date(repository.lastChecked).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
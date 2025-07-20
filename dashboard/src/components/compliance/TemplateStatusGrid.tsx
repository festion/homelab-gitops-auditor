import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface TemplateStatus {
  name: string;
  description: string;
  totalRepos: number;
  applied: number;
  missing: number;
  outdated: number;
  version: string;
  lastUpdated: string;
}

const fetchTemplateStatus = async (): Promise<TemplateStatus[]> => {
  const response = await fetch('/api/v2/compliance/templates');
  if (!response.ok) {
    throw new Error('Failed to fetch template status');
  }
  
  const data = await response.json();
  return data.templates || [];
};

const TemplateStatusSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="border rounded-lg p-4 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-2 bg-gray-200 rounded"></div>
        </div>
      </div>
    ))}
  </div>
);

export const TemplateStatusGrid: React.FC = () => {
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['compliance', 'templates'],
    queryFn: fetchTemplateStatus,
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <AlertCircle size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Template Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold mb-6">Template Coverage</h3>
        <TemplateStatusSkeleton />
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold mb-6">Template Coverage</h3>
        <div className="text-center py-8 text-gray-500">
          <FileText size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Templates Available</h3>
          <p>No templates have been configured for compliance monitoring</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-6">Template Coverage</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => {
          const coveragePercentage = template.totalRepos > 0 
            ? (template.applied / template.totalRepos) * 100 
            : 0;
          
          const getCoverageColor = (percentage: number) => {
            if (percentage >= 90) return 'bg-green-600';
            if (percentage >= 70) return 'bg-yellow-500';
            return 'bg-red-500';
          };

          const getStatusIcon = () => {
            if (coveragePercentage >= 90) return <CheckCircle className="w-5 h-5 text-green-500" />;
            if (template.outdated > 0) return <Clock className="w-5 h-5 text-yellow-500" />;
            return <AlertCircle className="w-5 h-5 text-red-500" />;
          };

          return (
            <div key={template.name} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    {getStatusIcon()}
                    <h4 className="font-semibold text-gray-900">{template.name}</h4>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{template.description}</p>
                </div>
              </div>
              
              {/* Coverage Statistics */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Applied</span>
                  <span className="font-medium">
                    {template.applied}/{template.totalRepos}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${getCoverageColor(coveragePercentage)}`}
                    style={{ width: `${coveragePercentage}%` }}
                  />
                </div>
                
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    coveragePercentage >= 90 ? 'text-green-600' :
                    coveragePercentage >= 70 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {coveragePercentage.toFixed(1)}% coverage
                  </span>
                </div>

                {/* Additional Stats */}
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  {template.missing > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Missing</span>
                      <span className="text-red-600 font-medium">{template.missing}</span>
                    </div>
                  )}
                  
                  {template.outdated > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Outdated</span>
                      <span className="text-yellow-600 font-medium">{template.outdated}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Version</span>
                    <span className="text-gray-700 font-medium">{template.version}</span>
                  </div>
                </div>

                {/* Warning Messages */}
                {template.outdated > 0 && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <span className="text-yellow-800">
                      {template.outdated} repositories have outdated version
                    </span>
                  </div>
                )}
                
                {template.missing > 0 && coveragePercentage < 70 && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                    <span className="text-red-800">
                      Low coverage - consider enforcing template
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
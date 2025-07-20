import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ComplianceData {
  totalRepos: number;
  compliantRepos: number;
  complianceRate: number;
  byTemplate: {
    [template: string]: {
      applied: number;
      missing: number;
      outdated: number;
    };
  };
}

const ComplianceSkeletonLoader: React.FC = () => (
  <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="h-64 bg-gray-200 rounded"></div>
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded"></div>
      </div>
    </div>
  </div>
);

const fetchComplianceOverview = async (): Promise<ComplianceData> => {
  const response = await fetch('/api/v2/compliance/status');
  if (!response.ok) {
    throw new Error('Failed to fetch compliance overview');
  }
  const data = await response.json();
  
  return {
    totalRepos: data.summary?.totalRepositories || 0,
    compliantRepos: data.summary?.compliantRepositories || 0,
    complianceRate: data.summary?.complianceRate || 0,
    byTemplate: data.summary?.byTemplate || {}
  };
};

export const ComplianceOverview: React.FC = () => {
  const { data: compliance, isLoading, error } = useQuery({
    queryKey: ['compliance', 'overview'],
    queryFn: fetchComplianceOverview,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) return <ComplianceSkeletonLoader />;
  
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <h3 className="text-lg font-medium mb-2">Error Loading Compliance Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (!compliance) return null;

  const chartData = [
    { name: 'Compliant', value: compliance.compliantRepos, color: '#10b981' },
    { name: 'Non-Compliant', value: compliance.totalRepos - compliance.compliantRepos, color: '#ef4444' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">Template Compliance</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-3xl font-bold">{compliance.complianceRate}%</p>
            <p className="text-gray-600 text-sm">Overall Compliance</p>
          </div>
        </div>

        {/* Statistics */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Repositories</span>
            <span className="font-semibold">{compliance.totalRepos}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Compliant</span>
            <span className="font-semibold text-green-600">{compliance.compliantRepos}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Non-Compliant</span>
            <span className="font-semibold text-red-600">
              {compliance.totalRepos - compliance.compliantRepos}
            </span>
          </div>
          
          {/* Template breakdown */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Template Coverage</h4>
            <div className="space-y-2">
              {Object.entries(compliance.byTemplate).map(([template, stats]) => (
                <div key={template} className="text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-600 capitalize">{template.replace('-', ' ')}</span>
                    <span className="font-medium">{stats.applied}/{stats.applied + stats.missing}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${(stats.applied / (stats.applied + stats.missing)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
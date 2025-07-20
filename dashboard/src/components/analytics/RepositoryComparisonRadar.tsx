import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Legend, Tooltip 
} from 'recharts';
import { GitCompare, Plus, X, BarChart3 } from 'lucide-react';

interface RepositoryMetrics {
  repository: string;
  codeQuality: number;
  testCoverage: number;
  documentation: number;
  security: number;
  performance: number;
  compliance: number;
  maintainability: number;
  reliability: number;
  lastUpdated: string;
}

interface RadarDataPoint {
  metric: string;
  fullMark: number;
  [repository: string]: string | number;
}

const fetchRepositoryMetrics = async (): Promise<RepositoryMetrics[]> => {
  const response = await fetch('/api/v2/metrics/repositories/comparison');
  if (!response.ok) {
    throw new Error('Failed to fetch repository metrics');
  }
  
  const data = await response.json();
  return data.repositories || [];
};

const metricConfig = {
  codeQuality: { label: 'Code Quality', color: '#3b82f6' },
  testCoverage: { label: 'Test Coverage', color: '#10b981' },
  documentation: { label: 'Documentation', color: '#f59e0b' },
  security: { label: 'Security', color: '#ef4444' },
  performance: { label: 'Performance', color: '#8b5cf6' },
  compliance: { label: 'Compliance', color: '#06b6d4' },
  maintainability: { label: 'Maintainability', color: '#84cc16' },
  reliability: { label: 'Reliability', color: '#f97316' }
};

const repositoryColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
];

const ComparisonRadarSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
    <div className="flex justify-between items-center mb-4">
      <div className="h-6 bg-gray-200 rounded w-48"></div>
      <div className="h-8 bg-gray-200 rounded w-32"></div>
    </div>
    <div className="mb-4 h-20 bg-gray-200 rounded"></div>
    <div className="h-80 bg-gray-200 rounded"></div>
  </div>
);

export const RepositoryComparisonRadar: React.FC = () => {
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    ['codeQuality', 'testCoverage', 'documentation', 'security', 'compliance']
  );

  const { data: repositories, isLoading, error } = useQuery({
    queryKey: ['analytics', 'comparison'],
    queryFn: fetchRepositoryMetrics,
    refetchInterval: 300000, // 5 minutes
  });

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <BarChart3 size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Comparison Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <ComparisonRadarSkeleton />;
  }

  if (!repositories || repositories.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold mb-4">Repository Comparison</h3>
        <div className="text-center py-8 text-gray-500">
          <GitCompare size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Repository Data</h3>
          <p>No repositories available for comparison</p>
        </div>
      </div>
    );
  }

  const radarData: RadarDataPoint[] = selectedMetrics.map(metric => {
    const dataPoint: RadarDataPoint = {
      metric: metricConfig[metric as keyof typeof metricConfig]?.label || metric,
      fullMark: 100
    };
    
    selectedRepos.forEach(repo => {
      const repoData = repositories.find(r => r.repository === repo);
      dataPoint[repo] = repoData?.[metric as keyof RepositoryMetrics] as number || 0;
    });
    
    return dataPoint;
  });

  const addRepository = (repo: string) => {
    if (!selectedRepos.includes(repo) && selectedRepos.length < 5) {
      setSelectedRepos([...selectedRepos, repo]);
    }
  };

  const removeRepository = (repo: string) => {
    setSelectedRepos(selectedRepos.filter(r => r !== repo));
  };

  const availableRepos = repositories.filter(r => !selectedRepos.includes(r.repository));

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-gray-600">{entry.dataKey}:</span>
                </div>
                <span className="font-medium">{entry.value}%</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold">Repository Comparison</h3>
        <div className="text-sm text-gray-600">
          {selectedRepos.length}/5 repositories selected
        </div>
      </div>
      
      {/* Repository selector */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-700 mb-3">Selected Repositories</h4>
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedRepos.map((repo, index) => (
            <div
              key={repo}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
            >
              <div 
                className="w-3 h-3 rounded"
                style={{ backgroundColor: repositoryColors[index] }}
              />
              <span className="text-sm font-medium text-blue-900">{repo}</span>
              <button
                onClick={() => removeRepository(repo)}
                className="text-blue-600 hover:text-blue-800"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {selectedRepos.length < 5 && availableRepos.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2">Add Repository</h5>
            <div className="flex flex-wrap gap-2">
              {availableRepos.slice(0, 10).map(repo => (
                <button
                  key={repo.repository}
                  onClick={() => addRepository(repo.repository)}
                  className="flex items-center space-x-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm transition-colors"
                >
                  <Plus size={14} />
                  <span>{repo.repository}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metrics selector */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-700 mb-3">Metrics to Compare</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(metricConfig).map(([metric, config]) => (
            <label key={metric} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMetrics.includes(metric)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMetrics([...selectedMetrics, metric]);
                  } else {
                    setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
                  }
                }}
                className="rounded"
              />
              <span className="text-sm">{config.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Radar chart */}
      {selectedRepos.length > 0 && selectedMetrics.length > 0 ? (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]} 
                tick={{ fontSize: 10 }}
                tickCount={6}
              />
              
              {selectedRepos.map((repo, index) => (
                <Radar
                  key={repo}
                  name={repo}
                  dataKey={repo}
                  stroke={repositoryColors[index]}
                  fill={repositoryColors[index]}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              ))}
              
              <Tooltip content={customTooltip} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-96 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <GitCompare size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">Select repositories to compare</p>
            <p className="text-sm">
              Choose {selectedRepos.length === 0 ? 'some repositories' : 'more repositories'} and metrics to see the comparison
            </p>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {selectedRepos.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-700 mb-3">Average Scores</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {selectedMetrics.map(metric => {
              const avg = selectedRepos.reduce((sum, repo) => {
                const repoData = repositories.find(r => r.repository === repo);
                return sum + (repoData?.[metric as keyof RepositoryMetrics] as number || 0);
              }, 0) / selectedRepos.length;

              return (
                <div key={metric} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{avg.toFixed(1)}%</p>
                  <p className="text-sm text-gray-600">
                    {metricConfig[metric as keyof typeof metricConfig]?.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
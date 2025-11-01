import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter } from 'lucide-react';
import { RepositoryComplianceCard } from './RepositoryComplianceCard';
import { ComplianceDetailModal } from './ComplianceDetailModal';

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

type FilterType = 'all' | 'compliant' | 'non-compliant';

const fetchRepositoryCompliance = async (filter: FilterType): Promise<RepositoryCompliance[]> => {
  const params = new URLSearchParams();
  if (filter !== 'all') {
    params.set('filter', filter === 'compliant' ? 'compliant' : 'non-compliant');
  }
  params.set('includeDetails', 'true');

  const response = await fetch(`/api/v2/compliance/status?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch repository compliance');
  }
  
  const data = await response.json();
  return data.repositories || [];
};

const ComplianceListSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="bg-white border rounded-lg p-4 animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 bg-gray-200 rounded"></div>
            <div>
              <div className="h-4 bg-gray-200 rounded w-32 mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            </div>
          </div>
          <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    ))}
  </div>
);

export const RepositoryComplianceList: React.FC = () => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: repositories, isLoading, error } = useQuery({
    queryKey: ['compliance', 'repositories', filter],
    queryFn: () => fetchRepositoryCompliance(filter),
    refetchInterval: 60000, // Refetch every minute
  });

  const filteredRepositories = repositories?.filter(repo =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const selectedRepository = repositories?.find(r => r.name === selectedRepo);

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <h3 className="text-lg font-medium mb-2">Error Loading Repository Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h3 className="text-xl font-semibold">Repository Compliance Status</h3>
        
        {/* Controls */}
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Filter buttons */}
          <div className="flex space-x-2">
            {(['all', 'compliant', 'non-compliant'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'compliant' ? 'Compliant' : 'Non-Compliant'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results summary */}
      {!isLoading && repositories && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {filteredRepositories.length} of {repositories.length} repositories
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}

      {/* Repository list */}
      {isLoading ? (
        <ComplianceListSkeleton />
      ) : filteredRepositories.length > 0 ? (
        <div className="space-y-4">
          {filteredRepositories.map(repo => (
            <RepositoryComplianceCard
              key={repo.name}
              repository={repo}
              onClick={() => setSelectedRepo(repo.name)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Filter size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Repositories Found</h3>
          <p>
            {searchTerm 
              ? `No repositories match "${searchTerm}"`
              : filter === 'all' 
                ? 'No repositories available'
                : `No ${filter.replace('-', ' ')} repositories found`
            }
          </p>
        </div>
      )}

      {/* Detail modal */}
      {selectedRepo && selectedRepository && (
        <ComplianceDetailModal
          repository={selectedRepository}
          onClose={() => setSelectedRepo(null)}
        />
      )}
    </div>
  );
};
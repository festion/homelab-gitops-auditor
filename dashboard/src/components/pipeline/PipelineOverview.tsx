import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pipeline } from '../../types/pipeline';
import { PipelineListItem } from './PipelineListItem';
import { PipelineDetails } from './PipelineDetails';

const fetchPipelineOverview = async (): Promise<Pipeline[]> => {
  const response = await fetch('/api/pipelines/overview');
  if (!response.ok) {
    throw new Error('Failed to fetch pipeline overview');
  }
  return response.json();
};

export const PipelineOverview: React.FC = () => {
  const { data: pipelines, isLoading, error } = useQuery({
    queryKey: ['pipelines', 'overview'],
    queryFn: fetchPipelineOverview,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <p className="text-red-600">Error loading pipelines: {error.message}</p>
      </div>
    );
  }

  const filteredPipelines = pipelines?.filter(p => 
    filterStatus === 'all' || p.status === filterStatus
  ) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Pipeline list */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Active Pipelines</h2>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border rounded px-3 py-1"
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="success">Success</option>
                <option value="failure">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="divide-y">
            {filteredPipelines.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No pipelines found
              </p>
            ) : (
              filteredPipelines.map((pipeline, index) => (
                <PipelineListItem
                  key={`${pipeline.repository}-${pipeline.runId}-${index}`}
                  pipeline={pipeline}
                  onClick={() => setSelectedPipeline(`${pipeline.repository}-${pipeline.runId}`)}
                  selected={selectedPipeline === `${pipeline.repository}-${pipeline.runId}`}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pipeline details */}
      <div className="lg:col-span-1">
        {selectedPipeline ? (
          <PipelineDetails pipelineId={selectedPipeline} />
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-500 text-center">
              Select a pipeline to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
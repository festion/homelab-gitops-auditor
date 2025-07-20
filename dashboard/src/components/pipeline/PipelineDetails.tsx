import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pipeline } from '../../types/pipeline';
import { Play, RotateCcw, ExternalLink, GitBranch, Clock, CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PipelineDetailsProps {
  pipelineId: string;
}

const fetchPipelineDetails = async (pipelineId: string): Promise<Pipeline> => {
  const response = await fetch(`/api/pipelines/${pipelineId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch pipeline details');
  }
  return response.json();
};

const triggerPipeline = async (pipelineId: string) => {
  const response = await fetch(`/api/pipelines/${pipelineId}/trigger`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to trigger pipeline');
  }
  return response.json();
};

export const PipelineDetails: React.FC<PipelineDetailsProps> = ({ pipelineId }) => {
  const queryClient = useQueryClient();
  
  const { data: pipeline, isLoading, error } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => fetchPipelineDetails(pipelineId),
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const triggerMutation = useMutation({
    mutationFn: () => triggerPipeline(pipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['pipelines', 'overview'] });
    }
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error || !pipeline) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error loading pipeline details</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'failure': return 'text-red-600 bg-red-50';
      case 'running': return 'text-blue-600 bg-blue-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failure':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{pipeline.repository}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <GitBranch className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">{pipeline.branch}</span>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(pipeline.status)}`}>
            {pipeline.status}
          </span>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || pipeline.status === 'running'}
            className="flex items-center space-x-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pipeline.status === 'running' ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>{pipeline.status === 'running' ? 'Running...' : 'Run Again'}</span>
          </button>
          
          {pipeline.url && (
            <a
              href={pipeline.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-3 py-1 border rounded hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View on GitHub</span>
            </a>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Workflow</h4>
            <p className="text-sm text-gray-900">{pipeline.workflowName}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Duration</h4>
            <div className="flex items-center space-x-2 text-sm text-gray-900">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>{Math.floor(pipeline.duration / 60)}m {pipeline.duration % 60}s</span>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Last Run</h4>
            <p className="text-sm text-gray-900">
              {formatDistanceToNow(new Date(pipeline.lastRun), { addSuffix: true })}
            </p>
          </div>

          {pipeline.commit && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Commit</h4>
              <div className="text-sm text-gray-900 space-y-1">
                <p>
                  <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">
                    {pipeline.commit.sha.substring(0, 7)}
                  </span>
                  <span className="ml-2">by {pipeline.commit.author}</span>
                </p>
                <p className="text-gray-600">{pipeline.commit.message}</p>
              </div>
            </div>
          )}

          {pipeline.steps && pipeline.steps.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Steps</h4>
              <div className="space-y-1">
                {pipeline.steps.map((step, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    {getStepIcon(step.status)}
                    <span className={step.status === 'skipped' ? 'text-gray-400' : ''}>
                      {step.name}
                    </span>
                    {step.duration > 0 && (
                      <span className="text-gray-500">({step.duration}s)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
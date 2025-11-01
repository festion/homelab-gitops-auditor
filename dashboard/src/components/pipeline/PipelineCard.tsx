import React from 'react';
import { Pipeline } from '../../types/pipeline';
import { formatDuration, formatRelativeTime } from './PipelineStatus';

interface PipelineCardProps {
  pipeline: Pipeline;
  onTrigger: (pipeline: Pipeline) => void;
  onViewDetails: (pipeline: Pipeline) => void;
}

export const PipelineCard: React.FC<PipelineCardProps> = ({ 
  pipeline, 
  onTrigger, 
  onViewDetails 
}) => {
  const statusColors = {
    success: 'bg-green-500',
    failure: 'bg-red-500',
    pending: 'bg-yellow-500',
    running: 'bg-blue-500'
  };

  const statusIcons = {
    success: '✓',
    failure: '✗',
    pending: '○',
    running: '◐'
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-700';
      case 'failure': return 'text-red-700';
      case 'pending': return 'text-yellow-700';
      case 'running': return 'text-blue-700';
      default: return 'text-gray-700';
    }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case 'success': return 'border-l-green-500';
      case 'failure': return 'border-l-red-500';
      case 'pending': return 'border-l-yellow-500';
      case 'running': return 'border-l-blue-500';
      default: return 'border-l-gray-500';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-l-4 ${getBorderColor(pipeline.status)} ${pipeline.status === 'running' ? 'pipeline-running' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 truncate pr-2">
          {pipeline.repository}
        </h3>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-white text-sm font-medium ${statusColors[pipeline.status]}`}>
          <span className="mr-1">{statusIcons[pipeline.status]}</span>
          {pipeline.status}
        </span>
      </div>
      
      {/* Pipeline details */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <span className="font-medium">Branch:</span>
          <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
            {pipeline.branch}
          </span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="font-medium">Workflow:</span>
          <span className="ml-1 truncate">{pipeline.workflowName}</span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Duration:</span>
          <span className="ml-1">{formatDuration(pipeline.duration)}</span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium">Last run:</span>
          <span className="ml-1">{formatRelativeTime(pipeline.lastRun)}</span>
        </div>

        {/* Commit info if available */}
        {pipeline.commit && (
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2" />
            </svg>
            <span className="font-medium">Commit:</span>
            <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {pipeline.commit.sha.substring(0, 7)}
            </span>
          </div>
        )}

        {/* Trigger info if available */}
        {pipeline.triggeredBy && (
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="font-medium">Triggered by:</span>
            <span className="ml-1">{pipeline.triggeredBy}</span>
          </div>
        )}
      </div>

      {/* Progress bar for running pipelines */}
      {pipeline.status === 'running' && pipeline.steps && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Progress</span>
            <span>
              {pipeline.steps.filter(s => s.status === 'success').length} / {pipeline.steps.length} steps
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(pipeline.steps.filter(s => s.status === 'success').length / pipeline.steps.length) * 100}%`
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex space-x-2">
        <button
          onClick={() => onViewDetails(pipeline)}
          className="flex-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
        >
          View Details
        </button>
        <button
          onClick={() => onTrigger(pipeline)}
          disabled={pipeline.status === 'running'}
          className={`flex-1 px-3 py-2 rounded transition-colors text-sm font-medium ${
            pipeline.status === 'running'
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-500 text-white hover:bg-gray-600'
          }`}
        >
          {pipeline.status === 'running' ? 'Running...' : 'Trigger Run'}
        </button>
      </div>

      {/* External link if available */}
      {pipeline.url && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <a
            href={pipeline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View in CI/CD
          </a>
        </div>
      )}
    </div>
  );
};
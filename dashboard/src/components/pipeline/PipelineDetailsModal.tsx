import React from 'react';
import { Pipeline, PipelineStep } from '../../types/pipeline';
import { formatDuration, formatRelativeTime } from './PipelineStatus';

interface PipelineDetailsModalProps {
  pipeline: Pipeline;
  isOpen: boolean;
  onClose: () => void;
}

export const PipelineDetailsModal: React.FC<PipelineDetailsModalProps> = ({
  pipeline,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const getStepStatusColor = (status: string): string => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'failure': return 'text-red-600 bg-red-50 border-red-200';
      case 'running': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'skipped': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStepStatusIcon = (status: string): string => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'running': return '◐';
      case 'pending': return '○';
      case 'skipped': return '⊘';
      default: return '?';
    }
  };

  const getOverallStatusColor = (status: string): string => {
    switch (status) {
      case 'success': return 'bg-green-500';
      case 'failure': return 'bg-red-500';
      case 'running': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900">{pipeline.repository}</h2>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-white text-sm font-medium ${getOverallStatusColor(pipeline.status)}`}>
              {pipeline.status.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pipeline Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Pipeline Information</h3>
            
            <div className="space-y-3">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="text-sm text-gray-600">Workflow:</span>
                <span className="ml-2 font-medium">{pipeline.workflowName}</span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-sm text-gray-600">Branch:</span>
                <span className="ml-2 font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                  {pipeline.branch}
                </span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a1.994 1.994 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="text-sm text-gray-600">Run ID:</span>
                <span className="ml-2 font-mono text-sm">{pipeline.runId}</span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-gray-600">Duration:</span>
                <span className="ml-2 font-medium">{formatDuration(pipeline.duration)}</span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-600">Started:</span>
                <span className="ml-2">{formatRelativeTime(pipeline.lastRun)}</span>
              </div>

              {pipeline.triggeredBy && (
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm text-gray-600">Triggered by:</span>
                  <span className="ml-2">{pipeline.triggeredBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Commit Information */}
          {pipeline.commit && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Commit Information</h3>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="font-mono text-sm bg-white px-3 py-1 rounded border">
                    {pipeline.commit.sha.substring(0, 7)}
                  </span>
                  <span className="text-sm text-gray-600">by {pipeline.commit.author}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {pipeline.commit.message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pipeline Steps */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Pipeline Steps</h3>
            <span className="text-sm text-gray-600">
              {pipeline.steps.filter(s => s.status === 'success').length} / {pipeline.steps.length} completed
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${
                pipeline.status === 'success' ? 'bg-green-500' :
                pipeline.status === 'failure' ? 'bg-red-500' :
                pipeline.status === 'running' ? 'bg-blue-500' :
                'bg-yellow-500'
              }`}
              style={{
                width: `${(pipeline.steps.filter(s => s.status === 'success').length / pipeline.steps.length) * 100}%`
              }}
            ></div>
          </div>

          {/* Steps list */}
          <div className="space-y-3">
            {pipeline.steps.map((step: PipelineStep, index: number) => (
              <div key={index} className={`border rounded-lg p-4 ${getStepStatusColor(step.status)}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold">
                      {getStepStatusIcon(step.status)}
                    </span>
                    <span className="font-medium text-gray-900">{step.name}</span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm">
                    <span className={`font-medium ${step.status === 'success' ? 'text-green-600' : step.status === 'failure' ? 'text-red-600' : step.status === 'running' ? 'text-blue-600' : 'text-gray-600'}`}>
                      {step.conclusion || step.status}
                    </span>
                    <span className="text-gray-600">
                      {formatDuration(step.duration)}
                    </span>
                  </div>
                </div>
                
                {/* Step timing */}
                {(step.startedAt || step.completedAt) && (
                  <div className="text-xs text-gray-600 space-x-4">
                    {step.startedAt && (
                      <span>Started: {formatRelativeTime(step.startedAt)}</span>
                    )}
                    {step.completedAt && (
                      <span>Completed: {formatRelativeTime(step.completedAt)}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* External Links */}
        {pipeline.url && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <a
              href={pipeline.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Full Pipeline in CI/CD
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
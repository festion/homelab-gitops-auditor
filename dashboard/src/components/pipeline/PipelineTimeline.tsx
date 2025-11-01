import React from 'react';
import { Pipeline } from '../../types/pipeline';
import { formatRelativeTime } from './PipelineStatus';

interface PipelineTimelineProps {
  pipelines: Pipeline[];
}

export const PipelineTimeline: React.FC<PipelineTimelineProps> = ({ pipelines }) => {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'success': return 'bg-green-500';
      case 'failure': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      case 'running': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'pending': return '○';
      case 'running': return '◐';
      default: return '?';
    }
  };

  const getStatusTextColor = (status: string): string => {
    switch (status) {
      case 'success': return 'text-green-700';
      case 'failure': return 'text-red-700';
      case 'pending': return 'text-yellow-700';
      case 'running': return 'text-blue-700';
      default: return 'text-gray-700';
    }
  };

  if (pipelines.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No recent pipeline activity</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4 text-gray-900">Recent Pipeline Runs</h3>
      
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-300"></div>
        
        <div className="space-y-6">
          {pipelines.map((pipeline, index) => (
            <div key={`${pipeline.repository}-${pipeline.runId}`} className="relative flex items-start">
              {/* Timeline dot */}
              <div className="relative flex-shrink-0">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-4 border-white ${getStatusColor(pipeline.status)} text-white font-bold text-sm shadow-lg`}>
                  {getStatusIcon(pipeline.status)}
                </div>
                {/* Connecting line to next item */}
                {index < pipelines.length - 1 && (
                  <div className="absolute top-12 left-1/2 transform -translate-x-1/2 w-0.5 h-6 bg-gray-300"></div>
                )}
              </div>
              
              {/* Content */}
              <div className="ml-6 flex-1 min-w-0">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-semibold text-gray-900 truncate">
                      {pipeline.repository}
                    </h4>
                    <span className={`text-sm font-medium ${getStatusTextColor(pipeline.status)}`}>
                      {pipeline.status.toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    <div>
                      <div className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <span className="font-medium">{pipeline.workflowName}</span>
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        <span className="font-mono text-xs bg-white px-2 py-1 rounded border">
                          {pipeline.branch}
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center mb-1">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formatRelativeTime(pipeline.lastRun)}</span>
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{Math.floor(pipeline.duration / 60)}m {pipeline.duration % 60}s</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Commit info */}
                  {pipeline.commit && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-start">
                        <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-mono text-xs bg-white px-2 py-1 rounded border">
                              {pipeline.commit.sha.substring(0, 7)}
                            </span>
                            <span className="text-xs text-gray-500">by {pipeline.commit.author}</span>
                          </div>
                          <p className="text-sm text-gray-700 truncate">
                            {pipeline.commit.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Running pipeline progress */}
                  {pipeline.status === 'running' && pipeline.steps && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                        <span>Pipeline Progress</span>
                        <span>
                          {pipeline.steps.filter(s => s.status === 'success').length} / {pipeline.steps.length} steps completed
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
import React from 'react';
import { Pipeline } from '../../types/pipeline';
import { GitBranch, Clock, User, CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PipelineListItemProps {
  pipeline: Pipeline;
  onClick: () => void;
  selected: boolean;
}

export const PipelineListItem: React.FC<PipelineListItemProps> = ({ pipeline, onClick, selected }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failure':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <Loader className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
        selected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            {getStatusIcon(pipeline.status)}
            <h3 className="font-medium text-gray-900">{pipeline.repository}</h3>
            <span className="text-sm text-gray-500">#{pipeline.runId}</span>
          </div>
          
          <div className="text-sm text-gray-600 space-y-1">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1">
                <GitBranch className="h-3 w-3" />
                <span>{pipeline.branch}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(pipeline.duration)}</span>
              </span>
              {pipeline.triggeredBy && (
                <span className="flex items-center space-x-1">
                  <User className="h-3 w-3" />
                  <span>{pipeline.triggeredBy}</span>
                </span>
              )}
            </div>
            
            {pipeline.commit && (
              <p className="truncate">
                <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {pipeline.commit.sha.substring(0, 7)}
                </span>
                <span className="ml-2">{pipeline.commit.message}</span>
              </p>
            )}
          </div>
        </div>
        
        <div className="text-right text-sm text-gray-500 ml-4">
          <div>{formatDistanceToNow(new Date(pipeline.lastRun), { addSuffix: true })}</div>
          <div className="text-xs">{pipeline.workflowName}</div>
        </div>
      </div>
    </div>
  );
};
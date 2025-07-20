import React from 'react';
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import type { DeploymentStage } from '../../types/deployment';

interface DeploymentProgressProps {
  deploymentId: string;
  currentStage?: string;
  stages: DeploymentStage[];
  progress?: number;
}

export const DeploymentProgress: React.FC<DeploymentProgressProps> = ({
  deploymentId,
  currentStage,
  stages,
  progress
}) => {
  const getStageIcon = (stage: DeploymentStage) => {
    switch (stage.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStageStatus = (stage: DeploymentStage) => {
    switch (stage.status) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'pending':
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return '';
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  const completedStages = stages.filter(s => s.status === 'completed').length;
  const totalStages = stages.length;
  const overallProgress = progress !== undefined ? progress : (totalStages > 0 ? (completedStages / totalStages) * 100 : 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-900">Deployment Progress</h4>
          <span className="text-sm text-gray-500">{Math.round(overallProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{completedStages} of {totalStages} stages completed</span>
          {currentStage && (
            <span>Current: {currentStage}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-medium text-gray-900">Stage Details</h5>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {stages.map((stage, index) => (
            <div 
              key={`${deploymentId}-stage-${index}`}
              className={`flex items-center justify-between p-3 rounded-md border ${getStageStatus(stage)}`}
            >
              <div className="flex items-center space-x-3">
                {getStageIcon(stage)}
                <div>
                  <p className="text-sm font-medium">{stage.name}</p>
                  {stage.startTime && (
                    <p className="text-xs text-gray-600">
                      Started: {new Date(stage.startTime).toLocaleTimeString()}
                      {stage.duration && ` • ${formatDuration(stage.startTime, stage.endTime)}`}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="text-right">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                  stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                  stage.status === 'failed' ? 'bg-red-100 text-red-700' :
                  stage.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {stage.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {stages.some(stage => stage.error) && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-red-900">Stage Errors</h5>
          <div className="space-y-1">
            {stages
              .filter(stage => stage.error)
              .map((stage, index) => (
                <div key={`error-${index}`} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                  <span className="font-medium text-red-800">{stage.name}:</span>
                  <span className="text-red-700 ml-1">{stage.error}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
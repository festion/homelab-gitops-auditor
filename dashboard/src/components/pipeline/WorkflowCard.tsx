import React from 'react';
import { WorkflowConfig } from './PipelineWorkflows';
import { GitBranch, Clock, PlayCircle, Edit2, Trash2, Calendar, GitPullRequest, GitCommit } from 'lucide-react';

interface WorkflowCardProps {
  workflow: WorkflowConfig;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => void;
}

export const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, onEdit, onDelete, onTrigger }) => {
  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'push':
        return <GitCommit className="h-4 w-4" />;
      case 'pull_request':
        return <GitPullRequest className="h-4 w-4" />;
      case 'schedule':
        return <Calendar className="h-4 w-4" />;
      case 'manual':
        return <PlayCircle className="h-4 w-4" />;
      default:
        return <GitBranch className="h-4 w-4" />;
    }
  };

  const getTriggerLabel = (trigger: WorkflowConfig['trigger']) => {
    switch (trigger.type) {
      case 'push':
        return `Push to ${trigger.branches?.join(', ') || 'all branches'}`;
      case 'pull_request':
        return `Pull request to ${trigger.branches?.join(', ') || 'all branches'}`;
      case 'schedule':
        return `Schedule: ${trigger.schedule || 'Not configured'}`;
      case 'manual':
        return 'Manual trigger';
      default:
        return 'Unknown trigger';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
            <p className="text-sm text-gray-600 mt-1">{workflow.repository}</p>
          </div>
          <div className="flex space-x-1">
            <button
              onClick={onEdit}
              className="p-1 hover:bg-gray-100 rounded"
              title="Edit workflow"
            >
              <Edit2 className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-50 rounded"
              title="Delete workflow"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            {getTriggerIcon(workflow.trigger.type)}
            <span>{getTriggerLabel(workflow.trigger)}</span>
          </div>

          <div className="text-sm text-gray-600">
            <span className="font-medium">{workflow.steps.length}</span> workflow steps
          </div>

          {workflow.environment && Object.keys(workflow.environment).length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{Object.keys(workflow.environment).length}</span> environment variables
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <button
            onClick={onTrigger}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <PlayCircle className="h-4 w-4" />
            <span>Trigger Workflow</span>
          </button>
        </div>
      </div>
    </div>
  );
};
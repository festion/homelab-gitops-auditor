import React from 'react';
import { WorkflowConfig } from './PipelineWorkflows';
import { GitCommit, GitPullRequest, Calendar, PlayCircle } from 'lucide-react';

interface TriggerConfigProps {
  trigger: WorkflowConfig['trigger'];
  onChange: (trigger: WorkflowConfig['trigger']) => void;
}

export const TriggerConfig: React.FC<TriggerConfigProps> = ({ trigger, onChange }) => {
  const triggerTypes = [
    { value: 'push', label: 'Push', icon: GitCommit },
    { value: 'pull_request', label: 'Pull Request', icon: GitPullRequest },
    { value: 'schedule', label: 'Schedule', icon: Calendar },
    { value: 'manual', label: 'Manual', icon: PlayCircle }
  ];

  const handleBranchesChange = (value: string) => {
    const branches = value
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);
    onChange({ ...trigger, branches });
  };

  return (
    <div className="space-y-4">
      {/* Trigger type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trigger Type
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {triggerTypes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onChange({ ...trigger, type: value as any })}
              className={`flex items-center justify-center space-x-2 p-3 rounded-lg border transition-colors ${
                trigger.type === value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration based on trigger type */}
      {(trigger.type === 'push' || trigger.type === 'pull_request') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Branches (comma-separated)
          </label>
          <input
            type="text"
            value={trigger.branches?.join(', ') || ''}
            onChange={(e) => handleBranchesChange(e.target.value)}
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="main, develop, feature/*"
          />
          <p className="mt-1 text-sm text-gray-500">
            Leave empty to trigger on all branches. Use patterns like feature/* for wildcards.
          </p>
        </div>
      )}

      {trigger.type === 'schedule' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cron Schedule
          </label>
          <input
            type="text"
            value={trigger.schedule || ''}
            onChange={(e) => onChange({ ...trigger, schedule: e.target.value })}
            className="w-full p-2 border rounded font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0 0 * * *"
          />
          <p className="mt-1 text-sm text-gray-500">
            Use cron syntax. Example: "0 0 * * *" runs daily at midnight UTC.
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-600">Common schedules:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Every hour', value: '0 * * * *' },
                { label: 'Daily at midnight', value: '0 0 * * *' },
                { label: 'Weekly on Monday', value: '0 0 * * 1' },
                { label: 'Monthly', value: '0 0 1 * *' }
              ].map(schedule => (
                <button
                  key={schedule.value}
                  onClick={() => onChange({ ...trigger, schedule: schedule.value })}
                  className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  {schedule.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {trigger.type === 'manual' && (
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            This workflow can only be triggered manually from the GitHub Actions tab or via API.
          </p>
        </div>
      )}
    </div>
  );
};
import React from 'react';
import { ScheduledPipeline } from './PipelineScheduler';
import { Calendar, Clock, GitBranch, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import cronstrue from 'cronstrue';

interface ScheduleItemProps {
  schedule: ScheduledPipeline;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export const ScheduleItem: React.FC<ScheduleItemProps> = ({ schedule, onEdit, onDelete, onToggle }) => {
  const getHumanReadableCron = (cron: string) => {
    try {
      return cronstrue.toString(cron);
    } catch {
      return cron;
    }
  };

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <h4 className="font-medium text-gray-900">{schedule.workflowName}</h4>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              schedule.enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {schedule.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="mt-1 text-sm text-gray-600 space-y-1">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1">
                <GitBranch className="h-3 w-3" />
                <span>{schedule.repository}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>{getHumanReadableCron(schedule.cronExpression)}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{schedule.timezone}</span>
              </span>
            </div>

            {schedule.description && (
              <p className="text-gray-500">{schedule.description}</p>
            )}

            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>
                Next run: {format(parseISO(schedule.nextRun), 'MMM dd, yyyy HH:mm')}
                {' '}({formatDistanceToNow(parseISO(schedule.nextRun), { addSuffix: true })})
              </span>
              {schedule.lastRun && (
                <span>
                  Last run: {formatDistanceToNow(parseISO(schedule.lastRun), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <button
            onClick={() => onToggle(!schedule.enabled)}
            className={`p-2 rounded ${
              schedule.enabled
                ? 'hover:bg-red-50 text-red-600'
                : 'hover:bg-green-50 text-green-600'
            }`}
            title={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
          >
            {schedule.enabled ? (
              <PowerOff className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded"
            title="Edit schedule"
          >
            <Edit2 className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded"
            title="Delete schedule"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
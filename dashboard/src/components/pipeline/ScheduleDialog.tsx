import React, { useState, useEffect } from 'react';
import { ScheduledPipeline } from './PipelineScheduler';
import { X, Clock, Calendar, Info } from 'lucide-react';
import cronstrue from 'cronstrue';

interface ScheduleDialogProps {
  schedule?: ScheduledPipeline | null;
  onClose: () => void;
  onCreate: (schedule: Omit<ScheduledPipeline, 'id' | 'nextRun' | 'lastRun'>) => void;
  onUpdate?: (id: string, updates: Partial<ScheduledPipeline>) => void;
}

const commonSchedules = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at 9 AM', value: '0 9 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'Every weekday at 9 AM', value: '0 9 * * 1-5' },
  { label: 'First day of month', value: '0 0 1 * *' },
];

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

export const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ schedule, onClose, onCreate, onUpdate }) => {
  const [formData, setFormData] = useState({
    workflowId: schedule?.workflowId || '',
    workflowName: schedule?.workflowName || '',
    repository: schedule?.repository || '',
    cronExpression: schedule?.cronExpression || '0 0 * * *',
    enabled: schedule?.enabled ?? true,
    description: schedule?.description || '',
    timezone: schedule?.timezone || 'UTC',
  });

  const [cronDescription, setCronDescription] = useState('');
  const [cronError, setCronError] = useState('');

  // Mock data - replace with actual API call
  const [workflows, setWorkflows] = useState([
    { id: 'wf1', name: 'CI/CD Pipeline', repository: 'repo1' },
    { id: 'wf2', name: 'Security Scan', repository: 'repo2' },
    { id: 'wf3', name: 'Deploy to Production', repository: 'repo1' },
  ]);

  useEffect(() => {
    try {
      const description = cronstrue.toString(formData.cronExpression);
      setCronDescription(description);
      setCronError('');
    } catch (error) {
      setCronDescription('');
      setCronError('Invalid cron expression');
    }
  }, [formData.cronExpression]);

  const handleWorkflowChange = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (workflow) {
      setFormData({
        ...formData,
        workflowId,
        workflowName: workflow.name,
        repository: workflow.repository,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cronError) return;

    if (schedule && onUpdate) {
      onUpdate(schedule.id, formData);
    } else {
      onCreate(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-semibold">
              {schedule ? 'Edit Schedule' : 'Create Pipeline Schedule'}
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Workflow selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow
            </label>
            <select
              value={formData.workflowId}
              onChange={(e) => handleWorkflowChange(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select a workflow</option>
              {workflows.map(workflow => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name} ({workflow.repository})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Daily deployment to staging"
            />
          </div>

          {/* Cron expression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule (Cron Expression)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={formData.cronExpression}
                onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                className={`flex-1 p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  cronError ? 'border-red-500' : ''
                }`}
                placeholder="0 0 * * *"
                required
              />
              <select
                onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                className="p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value=""
              >
                <option value="" disabled>Common schedules</option>
                {commonSchedules.map(schedule => (
                  <option key={schedule.value} value={schedule.value}>
                    {schedule.label}
                  </option>
                ))}
              </select>
            </div>
            {cronDescription && (
              <p className="mt-1 text-sm text-green-600 flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {cronDescription}
              </p>
            )}
            {cronError && (
              <p className="mt-1 text-sm text-red-600">{cronError}</p>
            )}
            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <p className="font-medium mb-1">Cron Expression Format:</p>
                  <code className="bg-blue-100 px-1 py-0.5 rounded">* * * * *</code>
                  <span className="ml-2">minute hour day month weekday</span>
                  <p className="mt-1">
                    Example: <code className="bg-blue-100 px-1 py-0.5 rounded">0 9 * * 1-5</code> = Every weekday at 9 AM
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {timezones.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
              Enable schedule immediately
            </label>
          </div>
        </form>

        <div className="p-6 border-t flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.workflowId || !formData.cronExpression || !!cronError}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {schedule ? 'Update Schedule' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PipelineCalendar } from './PipelineCalendar';
import { ScheduleItem } from './ScheduleItem';
import { ScheduleDialog } from './ScheduleDialog';
import { Plus, Calendar } from 'lucide-react';

export interface ScheduledPipeline {
  id: string;
  workflowId: string;
  workflowName: string;
  repository: string;
  cronExpression: string;
  nextRun: string;
  lastRun?: string;
  enabled: boolean;
  description?: string;
  timezone: string;
}

const fetchPipelineSchedules = async (): Promise<ScheduledPipeline[]> => {
  const response = await fetch('/api/pipeline-schedules');
  if (!response.ok) {
    throw new Error('Failed to fetch pipeline schedules');
  }
  return response.json();
};

const createSchedule = async (schedule: Omit<ScheduledPipeline, 'id' | 'nextRun' | 'lastRun'>): Promise<void> => {
  const response = await fetch('/api/pipeline-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedule)
  });
  if (!response.ok) {
    throw new Error('Failed to create schedule');
  }
};

const updateSchedule = async (id: string, updates: Partial<ScheduledPipeline>): Promise<void> => {
  const response = await fetch(`/api/pipeline-schedules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) {
    throw new Error('Failed to update schedule');
  }
};

const deleteSchedule = async (id: string): Promise<void> => {
  const response = await fetch(`/api/pipeline-schedules/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete schedule');
  }
};

export const PipelineScheduler: React.FC = () => {
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledPipeline | null>(null);
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['pipeline-schedules'],
    queryFn: fetchPipelineSchedules,
    refetchInterval: 60000 // Refresh every minute
  });

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-schedules'] });
      setShowScheduleDialog(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ScheduledPipeline> }) =>
      updateSchedule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-schedules'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-schedules'] });
    }
  });

  const toggleSchedule = (id: string, enabled: boolean) => {
    updateMutation.mutate({ id, updates: { enabled } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Scheduled Pipelines</h2>
        <button
          onClick={() => setShowScheduleDialog(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" />
          <span>Create Schedule</span>
        </button>
      </div>

      {/* Calendar view */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Calendar className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold">Schedule Calendar</h3>
        </div>
        <PipelineCalendar schedules={schedules || []} />
      </div>

      {/* Schedule list */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Active Schedules</h3>
        </div>
        
        {!schedules || schedules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No scheduled pipelines. Create a schedule to automate your workflows.
          </div>
        ) : (
          <div className="divide-y">
            {schedules.map(schedule => (
              <ScheduleItem
                key={schedule.id}
                schedule={schedule}
                onEdit={() => {
                  setEditingSchedule(schedule);
                  setShowScheduleDialog(true);
                }}
                onDelete={() => {
                  if (confirm('Are you sure you want to delete this schedule?')) {
                    deleteMutation.mutate(schedule.id);
                  }
                }}
                onToggle={(enabled) => toggleSchedule(schedule.id, enabled)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Schedule dialog */}
      {showScheduleDialog && (
        <ScheduleDialog
          schedule={editingSchedule}
          onClose={() => {
            setShowScheduleDialog(false);
            setEditingSchedule(null);
          }}
          onCreate={(schedule) => createMutation.mutate(schedule)}
          onUpdate={(id, updates) => {
            updateMutation.mutate({ id, updates });
            setShowScheduleDialog(false);
            setEditingSchedule(null);
          }}
        />
      )}
    </div>
  );
};
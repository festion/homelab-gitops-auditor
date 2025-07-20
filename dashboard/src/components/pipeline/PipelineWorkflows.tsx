import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkflowCard } from './WorkflowCard';
import { WorkflowEditor } from './WorkflowEditor';
import { CreateWorkflowDialog } from './CreateWorkflowDialog';
import { Plus } from 'lucide-react';

export interface WorkflowStep {
  id: string;
  name: string;
  uses?: string;
  run?: string;
  with?: Record<string, any>;
  env?: Record<string, string>;
  if?: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  repository: string;
  trigger: {
    type: 'push' | 'pull_request' | 'schedule' | 'manual';
    branches?: string[];
    schedule?: string;
  };
  steps: WorkflowStep[];
  environment?: Record<string, string>;
}

const fetchWorkflows = async (): Promise<WorkflowConfig[]> => {
  const response = await fetch('/api/workflows');
  if (!response.ok) {
    throw new Error('Failed to fetch workflows');
  }
  return response.json();
};

const saveWorkflow = async (workflow: WorkflowConfig): Promise<void> => {
  const response = await fetch(`/api/workflows/${workflow.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
  if (!response.ok) {
    throw new Error('Failed to save workflow');
  }
};

const createWorkflow = async (workflow: Omit<WorkflowConfig, 'id'>): Promise<void> => {
  const response = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
  if (!response.ok) {
    throw new Error('Failed to create workflow');
  }
};

const deleteWorkflow = async (id: string): Promise<void> => {
  const response = await fetch(`/api/workflows/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete workflow');
  }
};

const triggerWorkflow = async (id: string): Promise<void> => {
  const response = await fetch(`/api/workflows/${id}/trigger`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to trigger workflow');
  }
};

export const PipelineWorkflows: React.FC = () => {
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: workflows, isLoading, error } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows
  });

  const saveMutation = useMutation({
    mutationFn: saveWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setEditingWorkflow(null);
    }
  });

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setShowCreateDialog(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  });

  const triggerMutation = useMutation({
    mutationFn: triggerWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <p className="text-red-600">Error loading workflows: {error.message}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Workflow Configuration</h2>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" />
          <span>Create Workflow</span>
        </button>
      </div>

      {/* Workflow grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows?.map(workflow => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            onEdit={() => setEditingWorkflow(workflow)}
            onDelete={() => {
              if (confirm('Are you sure you want to delete this workflow?')) {
                deleteMutation.mutate(workflow.id);
              }
            }}
            onTrigger={() => triggerMutation.mutate(workflow.id)}
          />
        ))}
      </div>

      {/* Workflow editor */}
      {editingWorkflow && (
        <WorkflowEditor
          workflow={editingWorkflow}
          onSave={(updated) => saveMutation.mutate(updated)}
          onClose={() => setEditingWorkflow(null)}
        />
      )}

      {/* Create workflow dialog */}
      {showCreateDialog && (
        <CreateWorkflowDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={(workflow) => createMutation.mutate(workflow)}
        />
      )}
    </div>
  );
};
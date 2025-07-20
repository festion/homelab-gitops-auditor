import React from 'react';
import { WorkflowConfig, WorkflowStep } from './PipelineWorkflows';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { StepEditor } from './StepEditor';
import { TriggerConfig } from './TriggerConfig';
import { EnvironmentEditor } from './EnvironmentEditor';
import { Plus, GripVertical } from 'lucide-react';

interface VisualWorkflowEditorProps {
  workflow: WorkflowConfig;
  onChange: (workflow: WorkflowConfig) => void;
}

const generateId = () => `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const VisualWorkflowEditor: React.FC<VisualWorkflowEditorProps> = ({ workflow, onChange }) => {
  const addStep = () => {
    const newStep: WorkflowStep = {
      id: generateId(),
      name: 'New Step',
      run: ''
    };
    onChange({
      ...workflow,
      steps: [...workflow.steps, newStep]
    });
  };

  const updateStep = (index: number, step: WorkflowStep) => {
    const newSteps = [...workflow.steps];
    newSteps[index] = step;
    onChange({ ...workflow, steps: newSteps });
  };

  const removeStep = (index: number) => {
    onChange({
      ...workflow,
      steps: workflow.steps.filter((_, i) => i !== index)
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(workflow.steps);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onChange({ ...workflow, steps: items });
  };

  const fetchRepositories = async (): Promise<string[]> => {
    // This would be replaced with actual API call
    return ['repo1', 'repo2', 'repo3'];
  };

  const [repositories, setRepositories] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetchRepositories().then(setRepositories);
  }, []);

  return (
    <div className="space-y-6">
      {/* Basic configuration */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-lg font-semibold mb-4">Basic Configuration</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name
            </label>
            <input
              type="text"
              value={workflow.name}
              onChange={(e) => onChange({ ...workflow, name: e.target.value })}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="My Workflow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repository
            </label>
            <select
              value={workflow.repository}
              onChange={(e) => onChange({ ...workflow, repository: e.target.value })}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a repository</option>
              {repositories.map(repo => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Trigger configuration */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-lg font-semibold mb-4">Trigger Configuration</h4>
        <TriggerConfig
          trigger={workflow.trigger}
          onChange={(trigger) => onChange({ ...workflow, trigger })}
        />
      </div>

      {/* Workflow steps */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-semibold">Workflow Steps</h4>
          <button
            onClick={addStep}
            className="flex items-center space-x-1 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
          >
            <Plus className="h-4 w-4" />
            <span>Add Step</span>
          </button>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="steps">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {workflow.steps.map((step, index) => (
                  <Draggable key={step.id} draggableId={step.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`bg-white rounded-lg shadow-sm ${
                          snapshot.isDragging ? 'shadow-lg' : ''
                        }`}
                      >
                        <div className="flex items-start p-4">
                          <div
                            {...provided.dragHandleProps}
                            className="mr-3 mt-1 cursor-move"
                          >
                            <GripVertical className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="flex-1">
                            <StepEditor
                              step={step}
                              onChange={(updated) => updateStep(index, updated)}
                              onRemove={() => removeStep(index)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {workflow.steps.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No steps defined. Click "Add Step" to create your first workflow step.
          </div>
        )}
      </div>

      {/* Environment variables */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-lg font-semibold mb-4">Environment Variables</h4>
        <EnvironmentEditor
          environment={workflow.environment || {}}
          onChange={(env) => onChange({ ...workflow, environment: env })}
        />
      </div>
    </div>
  );
};
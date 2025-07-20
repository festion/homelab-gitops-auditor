import React, { useState } from 'react';
import { WorkflowConfig } from './PipelineWorkflows';
import { VisualWorkflowEditor } from './VisualWorkflowEditor';
import { YamlEditor } from './YamlEditor';
import { X, Code, Eye } from 'lucide-react';
import * as yaml from 'js-yaml';

interface WorkflowEditorProps {
  workflow: WorkflowConfig;
  onSave: (workflow: WorkflowConfig) => void;
  onClose: () => void;
}

const workflowToYaml = (workflow: WorkflowConfig): string => {
  const yamlWorkflow = {
    name: workflow.name,
    on: workflow.trigger.type === 'push' ? {
      push: {
        branches: workflow.trigger.branches || ['main']
      }
    } : workflow.trigger.type === 'pull_request' ? {
      pull_request: {
        branches: workflow.trigger.branches || ['main']
      }
    } : workflow.trigger.type === 'schedule' ? {
      schedule: [{
        cron: workflow.trigger.schedule || '0 0 * * *'
      }]
    } : {
      workflow_dispatch: {}
    },
    env: workflow.environment,
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: workflow.steps.map(step => {
          const stepObj: any = { name: step.name };
          if (step.uses) stepObj.uses = step.uses;
          if (step.run) stepObj.run = step.run;
          if (step.with) stepObj.with = step.with;
          if (step.env) stepObj.env = step.env;
          if (step.if) stepObj.if = step.if;
          return stepObj;
        })
      }
    }
  };

  return yaml.dump(yamlWorkflow, { indent: 2 });
};

const yamlToWorkflow = (yamlStr: string, originalWorkflow: WorkflowConfig): WorkflowConfig => {
  try {
    const parsed = yaml.load(yamlStr) as any;
    const workflow: WorkflowConfig = {
      ...originalWorkflow,
      name: parsed.name || originalWorkflow.name,
      environment: parsed.env || {}
    };

    // Parse trigger
    if (parsed.on) {
      if (parsed.on.push) {
        workflow.trigger = {
          type: 'push',
          branches: parsed.on.push.branches || ['main']
        };
      } else if (parsed.on.pull_request) {
        workflow.trigger = {
          type: 'pull_request',
          branches: parsed.on.pull_request.branches || ['main']
        };
      } else if (parsed.on.schedule) {
        workflow.trigger = {
          type: 'schedule',
          schedule: parsed.on.schedule[0]?.cron || '0 0 * * *'
        };
      } else if (parsed.on.workflow_dispatch) {
        workflow.trigger = { type: 'manual' };
      }
    }

    // Parse steps
    if (parsed.jobs?.build?.steps) {
      workflow.steps = parsed.jobs.build.steps.map((step: any, index: number) => ({
        id: `step-${index}`,
        name: step.name || `Step ${index + 1}`,
        uses: step.uses,
        run: step.run,
        with: step.with,
        env: step.env,
        if: step.if
      }));
    }

    return workflow;
  } catch (error) {
    console.error('Failed to parse YAML:', error);
    return originalWorkflow;
  }
};

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflow, onSave, onClose }) => {
  const [editedWorkflow, setEditedWorkflow] = useState(workflow);
  const [yamlView, setYamlView] = useState(false);
  const [yamlContent, setYamlContent] = useState(workflowToYaml(workflow));

  const handleSave = () => {
    if (yamlView) {
      const updatedWorkflow = yamlToWorkflow(yamlContent, editedWorkflow);
      onSave(updatedWorkflow);
    } else {
      onSave(editedWorkflow);
    }
  };

  const toggleView = () => {
    if (yamlView) {
      // Switching from YAML to visual
      const updatedWorkflow = yamlToWorkflow(yamlContent, editedWorkflow);
      setEditedWorkflow(updatedWorkflow);
    } else {
      // Switching from visual to YAML
      setYamlContent(workflowToYaml(editedWorkflow));
    }
    setYamlView(!yamlView);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-semibold">Edit Workflow</h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleView}
                className="flex items-center space-x-2 text-sm text-blue-600 hover:underline"
              >
                {yamlView ? (
                  <>
                    <Eye className="h-4 w-4" />
                    <span>Visual Editor</span>
                  </>
                ) : (
                  <>
                    <Code className="h-4 w-4" />
                    <span>YAML View</span>
                  </>
                )}
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {yamlView ? (
            <YamlEditor
              value={yamlContent}
              onChange={setYamlContent}
            />
          ) : (
            <VisualWorkflowEditor
              workflow={editedWorkflow}
              onChange={setEditedWorkflow}
            />
          )}
        </div>

        <div className="p-6 border-t flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save Workflow
          </button>
        </div>
      </div>
    </div>
  );
};
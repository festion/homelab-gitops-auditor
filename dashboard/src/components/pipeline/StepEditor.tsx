import React, { useState } from 'react';
import { WorkflowStep } from './PipelineWorkflows';
import { ChevronDown, ChevronUp, Trash2, Code, Package } from 'lucide-react';

interface StepEditorProps {
  step: WorkflowStep;
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
}

export const StepEditor: React.FC<StepEditorProps> = ({ step, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const [stepType, setStepType] = useState<'run' | 'uses'>(step.uses ? 'uses' : 'run');

  const handleTypeChange = (newType: 'run' | 'uses') => {
    setStepType(newType);
    if (newType === 'run') {
      onChange({ ...step, run: step.run || '', uses: undefined });
    } else {
      onChange({ ...step, uses: step.uses || '', run: undefined });
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Step name"
        />
        <div className="flex items-center space-x-2 ml-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 hover:bg-gray-100 rounded"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onRemove}
            className="p-2 hover:bg-red-50 rounded text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 pl-2">
          {/* Step type selector */}
          <div className="flex space-x-2">
            <button
              onClick={() => handleTypeChange('run')}
              className={`flex items-center space-x-1 px-3 py-1 rounded ${
                stepType === 'run'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Code className="h-4 w-4" />
              <span>Run Command</span>
            </button>
            <button
              onClick={() => handleTypeChange('uses')}
              className={`flex items-center space-x-1 px-3 py-1 rounded ${
                stepType === 'uses'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Use Action</span>
            </button>
          </div>

          {/* Step content */}
          {stepType === 'run' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shell Commands
              </label>
              <textarea
                value={step.run || ''}
                onChange={(e) => onChange({ ...step, run: e.target.value })}
                className="w-full p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                placeholder="echo 'Hello, World!'"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action
              </label>
              <input
                type="text"
                value={step.uses || ''}
                onChange={(e) => onChange({ ...step, uses: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="actions/checkout@v3"
              />
            </div>
          )}

          {/* Conditional execution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition (optional)
            </label>
            <input
              type="text"
              value={step.if || ''}
              onChange={(e) => onChange({ ...step, if: e.target.value || undefined })}
              className="w-full p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="success() && github.ref == 'refs/heads/main'"
            />
          </div>

          {/* Action inputs (for 'uses' type) */}
          {stepType === 'uses' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                With (Action Inputs)
              </label>
              <textarea
                value={JSON.stringify(step.with || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    onChange({ ...step, with: parsed });
                  } catch (err) {
                    // Invalid JSON, don't update
                  }
                }}
                className="w-full p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder='{&#10;  "node-version": "16"&#10;}'
              />
            </div>
          )}

          {/* Environment variables */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Environment Variables (optional)
            </label>
            <textarea
              value={JSON.stringify(step.env || {}, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange({ ...step, env: parsed });
                } catch (err) {
                  // Invalid JSON, don't update
                }
              }}
              className="w-full p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder='{&#10;  "NODE_ENV": "production"&#10;}'
            />
          </div>
        </div>
      )}
    </div>
  );
};
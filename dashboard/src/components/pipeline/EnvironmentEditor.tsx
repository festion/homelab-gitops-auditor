import React, { useState } from 'react';
import { Plus, Trash2, Key } from 'lucide-react';

interface EnvironmentEditorProps {
  environment: Record<string, string>;
  onChange: (environment: Record<string, string>) => void;
}

export const EnvironmentEditor: React.FC<EnvironmentEditorProps> = ({ environment, onChange }) => {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const addVariable = () => {
    if (newKey && newValue) {
      onChange({
        ...environment,
        [newKey]: newValue
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeVariable = (key: string) => {
    const updated = { ...environment };
    delete updated[key];
    onChange(updated);
  };

  const updateVariable = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...environment };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    updated[newKey] = value;
    onChange(updated);
  };

  const entries = Object.entries(environment);

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center space-x-2">
              <Key className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={key}
                onChange={(e) => updateVariable(key, e.target.value, value)}
                className="flex-1 p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="VARIABLE_NAME"
              />
              <span className="text-gray-500">=</span>
              <input
                type="text"
                value={value}
                onChange={(e) => updateVariable(key, key, e.target.value)}
                className="flex-1 p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="value"
              />
              <button
                onClick={() => removeVariable(key)}
                className="p-2 hover:bg-red-50 rounded text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center space-x-2 pt-2 border-t">
        <Key className="h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
          className="flex-1 p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="NEW_VARIABLE"
          onKeyPress={(e) => e.key === 'Enter' && addVariable()}
        />
        <span className="text-gray-500">=</span>
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="flex-1 p-2 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="value"
          onKeyPress={(e) => e.key === 'Enter' && addVariable()}
        />
        <button
          onClick={addVariable}
          disabled={!newKey || !newValue}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {entries.length === 0 && !newKey && (
        <p className="text-center text-gray-500 text-sm py-4">
          No environment variables defined. Add variables to be available during workflow execution.
        </p>
      )}
    </div>
  );
};
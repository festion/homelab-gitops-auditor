import React from 'react';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({ value, onChange }) => {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[500px] p-4 font-mono text-sm bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        spellCheck={false}
        placeholder="# Enter your workflow YAML here..."
      />
      <div className="absolute top-2 right-2 text-xs text-gray-500">
        YAML Editor
      </div>
    </div>
  );
};
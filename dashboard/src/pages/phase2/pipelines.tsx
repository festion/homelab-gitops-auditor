import React from 'react';
import { PipelineStatus } from '../../components/pipeline/PipelineStatus';
import { Activity, GitBranch, Clock, Settings } from 'lucide-react';

const PipelinesPage: React.FC = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-4">
        <h1 className="text-2xl font-bold mb-2">CI/CD Pipelines</h1>
        <p className="text-gray-600">Monitor and manage your continuous integration pipelines</p>
      </div>

      {/* Main Pipeline Status Component */}
      <div className="flex-1 overflow-auto px-6">
        <PipelineStatus />
      </div>
    </div>
  );
};

export default PipelinesPage;

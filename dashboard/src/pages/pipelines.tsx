import React, { useState } from 'react';
import { PipelineOverview } from '../components/pipeline/PipelineOverview';
import { PipelineWorkflows } from '../components/pipeline/PipelineWorkflows';
import { PipelineScheduler } from '../components/pipeline/PipelineScheduler';
import { PipelineMetrics } from '../components/pipeline/PipelineMetrics';

export const PipelinesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'workflows' | 'schedule' | 'metrics'>('overview');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pipeline Management</h1>
          <p className="mt-2 text-gray-600">
            Manage CI/CD pipelines across all repositories
          </p>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'workflows', label: 'Workflows' },
              { id: 'schedule', label: 'Schedule' },
              { id: 'metrics', label: 'Metrics' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  py-2 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'overview' && <PipelineOverview />}
          {activeTab === 'workflows' && <PipelineWorkflows />}
          {activeTab === 'schedule' && <PipelineScheduler />}
          {activeTab === 'metrics' && <PipelineMetrics />}
        </div>
      </div>
    </div>
  );
};

export default PipelinesPage;
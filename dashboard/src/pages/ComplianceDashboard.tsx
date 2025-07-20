import React from 'react';
import { 
  ComplianceOverview, 
  TemplateStatusGrid, 
  ComplianceTrends, 
  RepositoryComplianceList 
} from '../components/compliance';

export const ComplianceDashboard: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Template Compliance Dashboard</h1>
        <p className="text-gray-600">
          Monitor repository compliance with DevOps templates, track coverage, and manage template applications.
        </p>
      </div>

      {/* Top Row - Overview and Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplianceOverview />
        <ComplianceTrends />
      </div>

      {/* Middle Row - Template Status */}
      <TemplateStatusGrid />

      {/* Bottom Row - Repository List */}
      <RepositoryComplianceList />
    </div>
  );
};
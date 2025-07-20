import React from 'react';
import { DeploymentDashboard } from '../components/deployment';

const DeploymentPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <DeploymentDashboard
          repositoryName="festion/home-assistant-config"
          className="w-full"
        />
      </div>
    </div>
  );
};

export default DeploymentPage;
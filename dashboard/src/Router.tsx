/**
 * Simple Router Component for Testing
 */

import React from 'react';

// Import the main App component
import App from './App';

// Import test pages
import TestPipelineDesigner from './pages/test/pipeline-designer';

const Router: React.FC = () => {
  const currentPath = window.location.pathname;

  // Simple routing based on pathname
  switch (currentPath) {
    case '/test/pipeline-designer':
      return <TestPipelineDesigner />;
    default:
      return <App />;
  }
};

export default Router;
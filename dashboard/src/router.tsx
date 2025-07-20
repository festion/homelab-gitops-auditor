// File: dashboard/src/router.tsx

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import AuditPage from './pages/audit';
import Home from './pages/home';
import Roadmap from './pages/roadmap';
// Phase 2 imports
import TemplatesPage from './pages/phase2/templates';
import TemplatesSimple from './pages/phase2/templates-simple';
import TemplatesDebug from './pages/phase2/templates-debug';
import TemplatesApiTest from './pages/phase2/templates-api-test';
import TemplatesMinimal from './pages/phase2/templates-minimal';
import TemplatesNoFetch from './pages/phase2/templates-no-fetch';
import TemplatesWorking from './pages/phase2/templates-working';
import TemplatesTestApi from './pages/phase2/templates-test-api';
import SimpleTestPage from './pages/phase2/simple-test';
import TemplatesFixed from './pages/phase2/templates-fixed';
import TemplatesSimpleWorking from './pages/phase2/templates-simple-working';
import PipelinesPagePhase2 from './pages/phase2/pipelines';
import PipelinesPage from './pages/pipelines';
import DependenciesPage from './pages/phase2/dependencies';
import QualityPage from './pages/phase2/quality';
import SimpleTest from './pages/SimpleTest';
import TestPipelineDesigner from './pages/test/pipeline-designer';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import SearchPage from './pages/search';

const router = createBrowserRouter([
  {
    path: '/direct-test',
    element: <div><h1>DIRECT TEST WORKING!</h1></div>
  },
  {
    path: '/',
    element: <SidebarLayout />,
    errorElement: <div className="p-6"><h1 className="text-xl text-red-600">Route Error</h1><p>Route not found or error occurred.</p></div>,
    children: [
      { index: true, element: <Home /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'audit/:repo', element: <AuditPage /> },
      { path: 'roadmap', element: <Roadmap /> },
      { path: 'search', element: <SearchPage /> },
      // Phase 2 routes - temporarily disabled due to syntax errors
      { path: 'phase2/templates', element: <TemplatesPage /> },
      { path: 'compliance', element: <ComplianceDashboard /> },
      { path: 'analytics', element: <AnalyticsDashboard /> },
      { path: 'phase2/pipelines', element: <PipelinesPagePhase2 /> },
      { path: 'phase2/dependencies', element: <div className="p-6"><h1>Dependencies - Under Development</h1></div> },
      { path: 'phase2/quality', element: <div className="p-6"><h1>Quality - Under Development</h1></div> },
      // Legacy redirects for old navigation links  
      { path: 'templates', element: <TemplatesSimple /> },
      { path: 'templates-full', element: <TemplatesPage /> },
      { path: 'templates-debug', element: <TemplatesDebug /> },
      { path: 'templates-api', element: <TemplatesApiTest /> },
      { path: 'templates-minimal', element: <TemplatesMinimal /> },
      { path: 'templates-no-fetch', element: <TemplatesNoFetch /> },
      { path: 'templates-working', element: <TemplatesWorking /> },
      { path: 'templates-test-api', element: <TemplatesTestApi /> },
      { path: 'simple-test', element: <SimpleTestPage /> },
      { path: 'pipelines', element: <PipelinesPage /> },
      { path: 'dependencies', element: <DependenciesPage /> },
      { path: 'quality', element: <QualityPage /> },
      // Test routes
      { path: 'test', element: <div className="p-6"><h1>Test Route Working!</h1></div> },
      { path: 'test/pipeline-designer', element: <TestPipelineDesigner /> },
      { path: 'simple', element: <SimpleTest /> },
    ],
  },
]);

export default function RouterRoot() {
  return <RouterProvider router={router} />;
}
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './generated.css';

// Import our test component
import TestPipelineDesigner from './pages/test/pipeline-designer';

// Test router with actual component
const testRouter = createBrowserRouter([
  {
    path: '/',
    element: <div style={{padding: '20px'}}>
      <h1 style={{color: 'green', fontSize: '24px'}}>ROUTER TEST - SUCCESS!</h1>
      <p>React Router is working. <a href="/test/pipeline-designer" style={{color: 'blue'}}>Test Pipeline Designer →</a></p>
    </div>
  },
  {
    path: '/test/pipeline-designer',
    element: <TestPipelineDesigner />
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={testRouter} />
  </StrictMode>
);

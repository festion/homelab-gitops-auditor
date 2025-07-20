// File: dashboard/src/components/SidebarLayout.tsx

import { Link, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  Home as HomeIcon,
  FileSearch as AuditIcon,
  ListTodo as RoadmapIcon,
  Search as SearchIcon,
  FileText as TemplatesIcon,
  GitBranch as PipelinesIcon,
  Network as DependenciesIcon,
  Shield as QualityIcon,
  CheckCircle as ComplianceIcon,
  BarChart3 as AnalyticsIcon,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: <HomeIcon size={18} />, to: '/', section: 'core' },
  { label: 'Audit', icon: <AuditIcon size={18} />, to: '/audit', section: 'core' },
  { label: 'Search', icon: <SearchIcon size={18} />, to: '/search', section: 'core' },
  { label: 'Roadmap', icon: <RoadmapIcon size={18} />, to: '/roadmap', section: 'core' },
];

const phase2Items = [
  { label: 'Templates', icon: <TemplatesIcon size={18} />, to: '/phase2/templates', section: 'devops' },
  { label: 'Pipelines', icon: <PipelinesIcon size={18} />, to: '/phase2/pipelines', section: 'devops' },
  { label: 'Dependencies', icon: <DependenciesIcon size={18} />, to: '/phase2/dependencies', section: 'devops' },
  { label: 'Quality Gates', icon: <QualityIcon size={18} />, to: '/phase2/quality', section: 'devops' },
  { label: 'Compliance', icon: <ComplianceIcon size={18} />, to: '/compliance', section: 'devops' },
  { label: 'Analytics', icon: <AnalyticsIcon size={18} />, to: '/analytics', section: 'devops' },
];

const SidebarLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={`transition-all duration-200 p-2 bg-gray-900 text-white ${
          collapsed ? 'w-16' : 'w-48'
        }`}
      >
        <div className="flex justify-between items-center px-2 mb-4">
          {!collapsed && <h1 className="text-xl font-bold">GitOps</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-sm text-gray-300 hover:text-white"
          >
            {collapsed ? '⮞' : '⮜'}
          </button>
        </div>

        <nav className="space-y-1">
          {/* Core Features */}
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-700 transition ${
                location.pathname === item.to ? 'bg-gray-800 font-bold' : ''
              }`}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
          
          {/* DevOps Platform Section */}
          {!collapsed && (
            <div className="pt-4 pb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">
                DevOps Platform
              </h3>
            </div>
          )}
          
          {phase2Items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-700 transition ${
                location.pathname === item.to ? 'bg-gray-800 font-bold' : ''
              }`}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
          
          {/* Status Indicator */}
          {!collapsed && (
            <div className="pt-4">
              <div className="px-2 py-2 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Phase 2 Active</span>
                </div>
              </div>
            </div>
          )}
        </nav>
      </aside>

      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;

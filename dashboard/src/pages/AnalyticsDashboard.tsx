import React, { useState } from 'react';
import { 
  RepositoryHealthTimeline, 
  ActivityHeatmap, 
  RepositoryComparisonRadar, 
  PredictiveInsights,
  MetricsExport
} from '../components/analytics';
import { BarChart3, Activity, TrendingUp, Brain, Download, Eye, Grid } from 'lucide-react';

type ViewMode = 'grid' | 'detailed';

export const AnalyticsDashboard: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeSection, setActiveSection] = useState<string>('overview');

  const sections = [
    { id: 'overview', label: 'Overview', icon: <Eye size={18} /> },
    { id: 'health', label: 'Health Trends', icon: <TrendingUp size={18} /> },
    { id: 'activity', label: 'Activity Patterns', icon: <Activity size={18} /> },
    { id: 'comparison', label: 'Repository Comparison', icon: <BarChart3 size={18} /> },
    { id: 'predictions', label: 'Predictive Insights', icon: <Brain size={18} /> },
    { id: 'export', label: 'Data Export', icon: <Download size={18} /> },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'health':
        return <RepositoryHealthTimeline />;
      case 'activity':
        return <ActivityHeatmap />;
      case 'comparison':
        return <RepositoryComparisonRadar />;
      case 'predictions':
        return <PredictiveInsights />;
      case 'export':
        return <MetricsExport />;
      case 'overview':
      default:
        return viewMode === 'grid' ? (
          <div className="space-y-6">
            {/* Top Row - Health and Activity */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <RepositoryHealthTimeline />
              <ActivityHeatmap />
            </div>
            
            {/* Middle Row - Comparison and Predictions */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <RepositoryComparisonRadar />
              <div className="space-y-6">
                <PredictiveInsights />
              </div>
            </div>
            
            {/* Bottom Row - Export */}
            <MetricsExport />
          </div>
        ) : (
          <div className="space-y-8">
            <RepositoryHealthTimeline />
            <ActivityHeatmap />
            <RepositoryComparisonRadar />
            <PredictiveInsights />
            <MetricsExport />
          </div>
        );
    }
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Repository Analytics</h1>
            <p className="text-gray-600">
              Advanced analytics and insights for repository health, activity patterns, and predictive trends.
            </p>
          </div>
          
          {activeSection === 'overview' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${
                  viewMode === 'grid' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Grid View"
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`p-2 rounded ${
                  viewMode === 'detailed' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Detailed View"
              >
                <BarChart3 size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 overflow-x-auto">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeSection === section.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {renderSection()}
    </div>
  );
};
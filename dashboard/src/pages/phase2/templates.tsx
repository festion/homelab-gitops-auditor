import React, { useState, useEffect } from 'react';
import { TemplateWizard } from '../../components/phase2/TemplateWizard';
import { FileText, Play, History, TrendingUp, Package, Download, Star, Tag, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { ComplianceOverview, TemplateStatusGrid, ComplianceTrends, RepositoryComplianceList } from '../../components/compliance';

interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  files: string[];
  lastUpdated: string;
  downloads: number;
  tags: string[];
}

interface Operation {
  id: string;
  type: string;
  status: 'in_progress' | 'success' | 'failed';
  template: string;
  repository: string;
  startedAt: string;
  completedAt?: string;
  files?: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'browse' | 'wizard' | 'history' | 'compliance'>('browse');
  const [loading, setLoading] = useState(true);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'downloads' | 'name' | 'lastUpdated'>('downloads');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, auditRes] = await Promise.all([
        fetch('/api/v2/templates'),
        fetch('/audit')
      ]);
      
      const templatesData = await templatesRes.json();
      const auditData = await auditRes.json();
      
      setTemplates(templatesData.templates || []);
      setRepositories(auditData.repos?.map((r: any) => r.name) || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      // Fallback data
      setTemplates([]);
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async (templateId: string, repos: string[], options: any) => {
    try {
      const response = await fetch('/api/v2/templates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: templateId,
          repositoryPath: repos[0], // Single repo for now
          dryRun: options.dryRun,
          options: options
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Template application started:', result);
        
        // Poll for operation status
        pollOperationStatus(result.operationId);
        
        // Switch to history tab to show progress
        setActiveTab('history');
      }
    } catch (error) {
      console.error('Failed to apply template:', error);
    }
  };

  const pollOperationStatus = (operationId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/v2/templates/operations/${operationId}`);
        if (response.ok) {
          const operation = await response.json();
          setOperations(prev => {
            const existing = prev.find(op => op.id === operationId);
            if (existing) {
              return prev.map(op => op.id === operationId ? operation : op);
            } else {
              return [operation, ...prev];
            }
          });
          
          // Continue polling if still in progress
          if (operation.status === 'in_progress') {
            setTimeout(poll, 2000);
          }
        }
      } catch (error) {
        console.error('Failed to poll operation status:', error);
      }
    };
    
    poll();
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => template.tags.includes(tag));
    return matchesSearch && matchesTags;
  });

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    switch (sortBy) {
      case 'downloads':
        return b.downloads - a.downloads;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'lastUpdated':
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      default:
        return 0;
    }
  });

  const allTags = [...new Set(templates.flatMap(t => t.tags))];

  const renderBrowseTab = () => (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex-1 min-w-64">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="downloads">Sort by Downloads</option>
          <option value="name">Sort by Name</option>
          <option value="lastUpdated">Sort by Last Updated</option>
        </select>
        
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => {
                setSelectedTags(prev => 
                  prev.includes(tag) 
                    ? prev.filter(t => t !== tag)
                    : [...prev, tag]
                );
              }}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedTags.includes(tag)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Tag size={12} className="inline mr-1" />
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedTemplates.map(template => (
          <div key={template.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center">
                <Package className="text-blue-500 mr-2" size={20} />
                <h3 className="font-semibold text-lg">{template.name}</h3>
              </div>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                v{template.version}
              </span>
            </div>
            
            <p className="text-gray-600 text-sm mb-4">{template.description}</p>
            
            <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
              <div className="flex items-center">
                <Download size={14} className="mr-1" />
                {template.downloads} downloads
              </div>
              <div className="flex items-center">
                <Clock size={14} className="mr-1" />
                {new Date(template.lastUpdated).toLocaleDateString()}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mb-4">
              {template.tags.map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
            
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Pre-select template and switch to wizard
                  setActiveTab('wizard');
                }}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
              >
                <Play size={16} className="inline mr-2" />
                Apply Template
              </button>
              <button className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded hover:bg-gray-200 transition-colors">
                <FileText size={16} className="inline mr-2" />
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent Operations</h3>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-4">
        {operations.map(operation => (
          <div key={operation.id} className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                {operation.status === 'success' && <CheckCircle className="text-green-500 mr-2" size={20} />}
                {operation.status === 'failed' && <XCircle className="text-red-500 mr-2" size={20} />}
                {operation.status === 'in_progress' && <AlertCircle className="text-yellow-500 mr-2" size={20} />}
                <span className="font-medium">{operation.template}</span>
              </div>
              <span className={`px-2 py-1 rounded text-sm ${
                operation.status === 'success' ? 'bg-green-100 text-green-800' :
                operation.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {operation.status.replace('_', ' ')}
              </span>
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              Applied to: <span className="font-medium">{operation.repository}</span>
            </div>
            
            <div className="text-xs text-gray-500">
              Started: {new Date(operation.startedAt).toLocaleString()}
              {operation.completedAt && (
                <> • Completed: {new Date(operation.completedAt).toLocaleString()}</>
              )}
            </div>
            
            {operation.files && (
              <div className="mt-3 text-sm">
                <div className="flex gap-4">
                  {operation.files.added.length > 0 && (
                    <span className="text-green-600">+{operation.files.added.length} added</span>
                  )}
                  {operation.files.modified.length > 0 && (
                    <span className="text-blue-600">~{operation.files.modified.length} modified</span>
                  )}
                  {operation.files.deleted.length > 0 && (
                    <span className="text-red-600">-{operation.files.deleted.length} deleted</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {operations.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No template operations yet. Apply a template to see history here.
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Template Management</h1>
        <p className="text-gray-600">Apply standardized templates across your repositories</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'browse', label: 'Browse Templates', icon: Package },
            { id: 'wizard', label: 'Apply Template', icon: Play },
            { id: 'history', label: 'Operation History', icon: History },
            { id: 'compliance', label: 'Compliance', icon: TrendingUp },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={16} className="mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'browse' && renderBrowseTab()}
      {activeTab === 'wizard' && (
        <TemplateWizard
          templates={templates.map(t => t.id)}
          repositories={repositories}
          onApply={handleApplyTemplate}
        />
      )}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <ComplianceOverview />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TemplateStatusGrid />
            <ComplianceTrends />
          </div>
          <RepositoryComplianceList />
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Settings,
  Play,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  Code,
  TestTube,
  GitCommit,
  GitMerge,
  Rocket,
  Plus,
  RefreshCw,
  Filter,
  Search
} from 'lucide-react';

interface QualityGate {
  id: string;
  name: string;
  type: 'pre_commit' | 'pre_merge' | 'pre_deploy';
  description: string;
  status: 'active' | 'inactive';
  passRate: number;
  lastRun: string;
  threshold: number;
  rules?: string[];
  metrics?: any;
}

interface ValidationResult {
  validationId: string;
  repository: string;
  gateType: string;
  status: 'running' | 'passed' | 'failed';
  score: number;
  checks: Array<{
    name: string;
    status: 'passed' | 'failed' | 'pending' | 'running';
    score: number;
    issues: any[];
  }>;
  summary?: {
    totalChecks: number;
    passed: number;
    failed: number;
    score: number;
  };
  startedAt: string;
  completedAt?: string;
}

const QualityPage: React.FC = () => {
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'gates' | 'results' | 'config'>('overview');
  const [runningValidation, setRunningValidation] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v2/quality/gates');
      const data = await response.json();
      setGates(data.gates || []);
    } catch (error) {
      console.error('Failed to load quality gates:', error);
    } finally {
      setLoading(false);
    }
  };

  const runValidation = async (repository: string, gateType: string) => {
    try {
      const response = await fetch('/api/v2/quality/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository,
          gateType,
          files: ['src/index.js', 'src/utils.js'] // Mock files
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setRunningValidation(result.validationId);
        
        // Poll for results
        pollValidationResult(result.validationId);
      }
    } catch (error) {
      console.error('Failed to run validation:', error);
    }
  };

  const pollValidationResult = (validationId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/v2/quality/validations/${validationId}`);
        if (response.ok) {
          const validation = await response.json();
          
          setValidations(prev => {
            const existing = prev.find(v => v.validationId === validationId);
            if (existing) {
              return prev.map(v => v.validationId === validationId ? validation : v);
            } else {
              return [validation, ...prev];
            }
          });
          
          if (validation.status === 'running') {
            setTimeout(poll, 2000);
          } else {
            setRunningValidation(null);
          }
        }
      } catch (error) {
        console.error('Failed to poll validation result:', error);
        setRunningValidation(null);
      }
    };
    
    poll();
  };

  const getGateTypeIcon = (type: string) => {
    switch (type) {
      case 'pre_commit': return <GitCommit className="text-blue-500" size={20} />;
      case 'pre_merge': return <GitMerge className="text-purple-500" size={20} />;
      case 'pre_deploy': return <Rocket className="text-green-500" size={20} />;
      default: return <Shield className="text-gray-500" size={20} />;
    }
  };

  const getStatusIcon = (status: string, passRate?: number) => {
    if (passRate !== undefined) {
      if (passRate >= 95) return <CheckCircle className="text-green-500" size={20} />;
      if (passRate >= 80) return <AlertCircle className="text-yellow-500" size={20} />;
      return <XCircle className="text-red-500" size={20} />;
    }
    
    switch (status) {
      case 'passed': return <CheckCircle className="text-green-500" size={20} />;
      case 'failed': return <XCircle className="text-red-500" size={20} />;
      case 'running': return <Clock className="text-blue-500 animate-pulse" size={20} />;
      default: return <AlertCircle className="text-gray-500" size={20} />;
    }
  };

  const filteredGates = gates.filter(gate => {
    const matchesType = filterType === 'all' || gate.type === filterType;
    const matchesStatus = filterStatus === 'all' || gate.status === filterStatus;
    return matchesType && matchesStatus;
  });

  const gateTypeLabels = {
    pre_commit: 'Pre-Commit',
    pre_merge: 'Pre-Merge', 
    pre_deploy: 'Pre-Deploy'
  };

  const renderOverviewTab = () => {
    const totalGates = gates.length;
    const activeGates = gates.filter(g => g.status === 'active').length;
    const avgPassRate = totalGates > 0 ? Math.round(gates.reduce((sum, g) => sum + g.passRate, 0) / totalGates) : 0;
    const recentValidations = validations.slice(0, 5);

    return (
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Gates</p>
                <p className="text-2xl font-bold text-gray-900">{totalGates}</p>
              </div>
              <Shield className="text-blue-500" size={24} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Gates</p>
                <p className="text-2xl font-bold text-green-600">{activeGates}</p>
              </div>
              <CheckCircle className="text-green-500" size={24} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overall Pass Rate</p>
                <p className="text-2xl font-bold text-blue-600">{avgPassRate}%</p>
              </div>
              <Target className="text-blue-500" size={24} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recent Checks</p>
                <p className="text-2xl font-bold text-purple-600">{validations.length}</p>
              </div>
              <BarChart3 className="text-purple-500" size={24} />
            </div>
          </div>
        </div>

        {/* Gate Type Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Quality Gates by Type</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(gateTypeLabels).map(([type, label]) => {
              const typeGates = gates.filter(g => g.type === type);
              const avgRate = typeGates.length > 0 ? Math.round(typeGates.reduce((sum, g) => sum + g.passRate, 0) / typeGates.length) : 0;
              
              return (
                <div key={type} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      {getGateTypeIcon(type)}
                      <span className="ml-2 font-medium">{label}</span>
                    </div>
                    <span className="text-sm text-gray-500">{typeGates.length} gates</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Pass Rate</span>
                      <span className={`font-medium ${
                        avgRate >= 95 ? 'text-green-600' :
                        avgRate >= 80 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>{avgRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          avgRate >= 95 ? 'bg-green-500' :
                          avgRate >= 80 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${avgRate}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Validations */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Quality Checks</h3>
            <button
              onClick={() => setActiveTab('results')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All →
            </button>
          </div>
          
          <div className="space-y-3">
            {recentValidations.map(validation => (
              <div key={validation.validationId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center">
                  {getStatusIcon(validation.status)}
                  <div className="ml-3">
                    <p className="font-medium">{validation.repository}</p>
                    <p className="text-sm text-gray-600">{gateTypeLabels[validation.gateType as keyof typeof gateTypeLabels]}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-medium">{validation.score || 0}%</p>
                  <p className="text-sm text-gray-500">
                    {new Date(validation.startedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            
            {recentValidations.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                No recent quality checks. Run a validation to see results here.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => runValidation('homelab-gitops-auditor', 'pre_commit')}
              disabled={!!runningValidation}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <Code className="text-blue-500 mb-2" size={24} />
              <h4 className="font-medium">Run Pre-Commit Check</h4>
              <p className="text-sm text-gray-600">Code linting and formatting</p>
            </button>
            
            <button
              onClick={() => runValidation('homelab-gitops-auditor', 'pre_merge')}
              disabled={!!runningValidation}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <TestTube className="text-purple-500 mb-2" size={24} />
              <h4 className="font-medium">Run Pre-Merge Check</h4>
              <p className="text-sm text-gray-600">Tests and coverage</p>
            </button>
            
            <button
              onClick={() => runValidation('homelab-gitops-auditor', 'pre_deploy')}
              disabled={!!runningValidation}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <Shield className="text-green-500 mb-2" size={24} />
              <h4 className="font-medium">Run Shield Scan</h4>
              <p className="text-sm text-gray-600">Shield and deployment checks</p>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGatesTab = () => (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          <option value="pre_commit">Pre-Commit</option>
          <option value="pre_merge">Pre-Merge</option>
          <option value="pre_deploy">Pre-Deploy</option>
        </select>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center"
        >
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </button>
        
        <button className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors flex items-center">
          <Plus size={16} className="mr-2" />
          New Gate
        </button>
      </div>

      {/* Gates List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredGates.map(gate => (
          <div key={gate.id} className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                {getGateTypeIcon(gate.type)}
                <div className="ml-3">
                  <h3 className="font-semibold text-lg">{gate.name}</h3>
                  <p className="text-sm text-gray-600">{gateTypeLabels[gate.type]}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm ${
                  gate.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {gate.status}
                </span>
                <button className="p-2 text-gray-400 hover:text-gray-600">
                  <Settings size={16} />
                </button>
              </div>
            </div>
            
            <p className="text-gray-600 mb-4">{gate.description}</p>
            
            {/* Pass Rate Visualization */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Pass Rate</span>
                <span className={`font-medium ${
                  gate.passRate >= 95 ? 'text-green-600' :
                  gate.passRate >= 80 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>{gate.passRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    gate.passRate >= 95 ? 'bg-green-500' :
                    gate.passRate >= 80 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${gate.passRate}%` }}
                ></div>
              </div>
            </div>
            
            {/* Gate Metrics */}
            {gate.metrics && (
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <h4 className="text-sm font-medium mb-2">Current Metrics</h4>
                <div className="space-y-1 text-sm">
                  {Object.entries(gate.metrics).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Threshold: {gate.threshold}%</span>
              <span>Last run: {new Date(gate.lastRun).toLocaleString()}</span>
            </div>
            
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => runValidation('homelab-gitops-auditor', gate.type)}
                disabled={!!runningValidation}
                className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                <Play size={16} className="mr-1" />
                {runningValidation ? 'Running...' : 'Run Check'}
              </button>
              <button className="bg-gray-100 text-gray-700 py-2 px-4 rounded hover:bg-gray-200 transition-colors">
                <Settings size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {filteredGates.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Shield size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No quality gates found</h3>
          <p className="mb-4">Create your first quality gate to start enforcing quality standards.</p>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
            Create Quality Gate
          </button>
        </div>
      )}
    </div>
  );

  const renderResultsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Validation Results</h3>
        <button
          onClick={() => runValidation('homelab-gitops-auditor', 'pre_commit')}
          disabled={!!runningValidation}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center"
        >
          <Play size={16} className="mr-2" />
          {runningValidation ? 'Running...' : 'New Validation'}
        </button>
      </div>
      
      <div className="space-y-4">
        {validations.map(validation => (
          <div key={validation.validationId} className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                {getStatusIcon(validation.status, validation.score)}
                <div className="ml-3">
                  <h4 className="font-semibold">{validation.repository}</h4>
                  <p className="text-sm text-gray-600">
                    {gateTypeLabels[validation.gateType as keyof typeof gateTypeLabels]} • 
                    Started {new Date(validation.startedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <div className={`text-2xl font-bold ${
                  validation.score >= 95 ? 'text-green-600' :
                  validation.score >= 80 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {validation.score || 0}%
                </div>
                <div className={`text-sm px-2 py-1 rounded ${
                  validation.status === 'passed' ? 'bg-green-100 text-green-800' :
                  validation.status === 'failed' ? 'bg-red-100 text-red-800' :
                  validation.status === 'running' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {validation.status}
                </div>
              </div>
            </div>
            
            {/* Check Details */}
            <div className="space-y-2">
              {validation.checks.map((check, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center">
                    {getStatusIcon(check.status)}
                    <span className="ml-2 font-medium">{check.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{check.score}%</span>
                    {check.issues.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        {check.issues.length} issues
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {validation.summary && (
              <div className="mt-4 p-3 bg-blue-50 rounded">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-green-600">{validation.summary.passed}</div>
                    <div className="text-gray-600">Passed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-red-600">{validation.summary.failed}</div>
                    <div className="text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-blue-600">{validation.summary.totalChecks}</div>
                    <div className="text-gray-600">Total</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {validations.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <TestTube size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">No validation results</h3>
            <p className="mb-4">Run a quality validation to see detailed results here.</p>
            <button
              onClick={() => runValidation('homelab-gitops-auditor', 'pre_commit')}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Run First Validation
            </button>
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
          <p>Loading quality gates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Quality Gates</h1>
        <p className="text-gray-600">Enforce quality standards across your development lifecycle</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'gates', label: 'Quality Gates', icon: Shield },
            { id: 'results', label: 'Validation Results', icon: TestTube },
            { id: 'config', label: 'Configuration', icon: Settings },
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
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'gates' && renderGatesTab()}
      {activeTab === 'results' && renderResultsTab()}
      {activeTab === 'config' && (
        <div className="text-center py-8 text-gray-500">
          <Settings size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">Quality Configuration</h3>
          <p>Global quality gate configuration and threshold management coming soon.</p>
        </div>
      )}
    </div>
  );
};

export default QualityPage;
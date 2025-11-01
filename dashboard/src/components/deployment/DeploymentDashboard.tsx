import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Activity, 
  History, 
  RotateCcw, 
  Shield, 
  Eye,
  Settings,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { DeploymentStatusWidget } from './DeploymentStatusWidget';
import { ManualDeployment } from './ManualDeployment';
import { DeploymentHistory } from './DeploymentHistory';
import { RollbackInterface } from './RollbackInterface';
import { HealthMonitoringDashboard } from './HealthMonitoringDashboard';
import { AuditTrailViewer } from './AuditTrailViewer';
import { useDeploymentService } from '../../services/deploymentService';
import type { DeploymentPermissions } from '../../types/deployment';

// Mock auth hook - replace with actual auth implementation
const useAuth = () => ({
  user: { 
    username: 'admin', 
    role: 'admin',
    email: 'admin@homelab.local'
  },
  isLoading: false
});

interface DeploymentDashboardProps {
  repositoryName?: string;
  className?: string;
}

export const DeploymentDashboard: React.FC<DeploymentDashboardProps> = ({
  repositoryName = 'festion/home-assistant-config',
  className = ''
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const { getPermissions } = useDeploymentService();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [permissions, setPermissions] = useState<DeploymentPermissions | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [lastDeploymentId, setLastDeploymentId] = useState<string | null>(null);

  // Fetch user permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      if (!user) return;
      
      try {
        setPermissionsLoading(true);
        const userPermissions = await getPermissions();
        setPermissions(userPermissions);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
        // Set default permissions for graceful degradation
        setPermissions({
          canView: true,
          canDeploy: false,
          canRollback: false,
          canViewLogs: false,
          canManageSettings: false,
          repositories: []
        });
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, [user, getPermissions]);

  const handleDeploymentStarted = (deploymentId: string) => {
    setLastDeploymentId(deploymentId);
    // Switch to overview tab to show deployment progress
    setActiveTab('overview');
  };

  const handleRollbackStarted = (rollbackId: string) => {
    setLastDeploymentId(rollbackId);
    // Switch to overview tab to show rollback progress
    setActiveTab('overview');
  };

  const tabs = [
    {
      id: 'overview',
      name: 'Overview',
      icon: Activity,
      description: 'Deployment status and system health',
      requiresPermission: 'canView'
    },
    {
      id: 'deploy',
      name: 'Deploy',
      icon: GitBranch,
      description: 'Manual deployment controls',
      requiresPermission: 'canDeploy'
    },
    {
      id: 'history',
      name: 'History',
      icon: History,
      description: 'Deployment history and logs',
      requiresPermission: 'canView'
    },
    {
      id: 'rollback',
      name: 'Rollback',
      icon: RotateCcw,
      description: 'Rollback management',
      requiresPermission: 'canRollback'
    },
    {
      id: 'health',
      name: 'Health',
      icon: Activity,
      description: 'System health monitoring',
      requiresPermission: 'canView'
    },
    {
      id: 'audit',
      name: 'Audit',
      icon: Shield,
      description: 'Security and compliance tracking',
      requiresPermission: 'canViewLogs'
    }
  ];

  const availableTabs = tabs.filter(tab => {
    if (!permissions) return false;
    return permissions[tab.requiresPermission as keyof DeploymentPermissions];
  });

  if (authLoading || permissionsLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
          <span className="text-lg text-gray-600">Loading deployment dashboard...</span>
        </div>
      </div>
    );
  }

  if (!permissions?.canView) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="p-8 text-center">
          <Lock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have permission to access the deployment dashboard.
          </p>
          <div className="text-sm text-gray-500">
            <p>User: <strong>{user?.username}</strong></p>
            <p>Role: <strong>{user?.role}</strong></p>
            <p className="mt-2">Contact your administrator to request access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <GitBranch className="h-6 w-6 mr-3" />
                Deployment Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Repository: <strong>{repositoryName}</strong>
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right text-sm">
                <p className="text-gray-600">Logged in as</p>
                <p className="font-medium text-gray-900">{user?.username}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-700">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6">
          <nav className="flex space-x-8 -mb-px">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  title={tab.description}
                >
                  <Icon className={`mr-2 h-4 w-4 ${
                    isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`} />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Permission Summary */}
      {user?.role !== 'admin' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <Eye className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Access Level: {user?.role}</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>Available permissions:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {permissions?.canView && <li>View deployment status and history</li>}
                  {permissions?.canDeploy && <li>Trigger manual deployments</li>}
                  {permissions?.canRollback && <li>Perform rollbacks</li>}
                  {permissions?.canViewLogs && <li>View audit logs</li>}
                  {permissions?.canManageSettings && <li>Manage system settings</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DeploymentStatusWidget 
              repositoryName={repositoryName}
              className="xl:col-span-1"
            />
            <HealthMonitoringDashboard className="xl:col-span-1" />
          </div>
        )}

        {activeTab === 'deploy' && permissions?.canDeploy && (
          <div className="max-w-2xl">
            <ManualDeployment
              onDeploymentStarted={handleDeploymentStarted}
              className="w-full"
            />
          </div>
        )}

        {activeTab === 'history' && permissions?.canView && (
          <DeploymentHistory
            repositoryName={repositoryName}
            className="w-full"
          />
        )}

        {activeTab === 'rollback' && permissions?.canRollback && (
          <div className="max-w-2xl">
            <RollbackInterface
              repositoryName={repositoryName}
              onRollbackStarted={handleRollbackStarted}
              className="w-full"
            />
          </div>
        )}

        {activeTab === 'health' && permissions?.canView && (
          <HealthMonitoringDashboard className="w-full" />
        )}

        {activeTab === 'audit' && permissions?.canViewLogs && (
          <AuditTrailViewer className="w-full" />
        )}

        {/* Access Denied Message for Restricted Tabs */}
        {!permissions?.[tabs.find(t => t.id === activeTab)?.requiresPermission as keyof DeploymentPermissions] && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-8 text-center">
              <Lock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
              <p className="text-gray-600">
                You don't have permission to access this section.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity Alert */}
      {lastDeploymentId && (
        <div className="fixed bottom-4 right-4 bg-white border border-green-200 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">Operation Started</p>
              <p className="text-xs text-green-700 mt-1">
                ID: {lastDeploymentId.substring(0, 8)}...
              </p>
            </div>
            <button
              onClick={() => setLastDeploymentId(null)}
              className="text-green-400 hover:text-green-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Quick Stats Footer */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">Live</p>
            <p className="text-xs text-gray-600">Real-time Updates</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{availableTabs.length}</p>
            <p className="text-xs text-gray-600">Available Features</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {permissions?.repositories?.length || 0}
            </p>
            <p className="text-xs text-gray-600">Accessible Repos</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-600">
              {user?.role === 'admin' ? 'Full' : 'Limited'}
            </p>
            <p className="text-xs text-gray-600">Access Level</p>
          </div>
        </div>
      </div>
    </div>
  );
};
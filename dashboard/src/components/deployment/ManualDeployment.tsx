import React, { useState, useEffect } from 'react';
import { 
  Loader2, 
  GitBranch, 
  FileText, 
  User, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield
} from 'lucide-react';
import { useDeploymentService } from '../../services/deploymentService';
import type { DeploymentRequest } from '../../types/deployment';

// Mock auth context - replace with actual implementation
const useAuth = () => ({
  user: { username: 'admin', role: 'admin' },
  hasPermission: (permission: string) => true
});

interface ManualDeploymentProps {
  onDeploymentStarted?: (deploymentId: string) => void;
  disabled?: boolean;
  className?: string;
}

export const ManualDeployment: React.FC<ManualDeploymentProps> = ({
  onDeploymentStarted,
  disabled = false,
  className = ''
}) => {
  const { user, hasPermission } = useAuth();
  const { triggerDeployment, isLoading } = useDeploymentService();
  
  const [formData, setFormData] = useState<DeploymentRequest>({
    repository: 'festion/home-assistant-config',
    branch: 'main',
    reason: '',
    createBackup: true,
    skipHealthCheck: false,
    triggeredBy: user?.username || 'unknown'
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deploymentResult, setDeploymentResult] = useState<{
    success: boolean;
    deploymentId?: string;
    error?: string;
  } | null>(null);

  const canDeploy = hasPermission('deployment:write') && !disabled;
  const branches = ['main', 'develop', 'staging', 'feature/updates'];

  // Update triggeredBy when user changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      triggeredBy: user?.username || 'unknown'
    }));
  }, [user?.username]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.repository.trim()) {
      newErrors.repository = 'Repository is required';
    } else if (!/^[\w.-]+\/[\w.-]+$/.test(formData.repository)) {
      newErrors.repository = 'Invalid repository format (owner/repo)';
    }
    
    if (!formData.branch.trim()) {
      newErrors.branch = 'Branch is required';
    }
    
    if (!formData.reason.trim()) {
      newErrors.reason = 'Deployment reason is required';
    } else if (formData.reason.length < 10) {
      newErrors.reason = 'Reason must be at least 10 characters';
    } else if (formData.reason.length > 500) {
      newErrors.reason = 'Reason must be less than 500 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !canDeploy) return;
    
    setDeploymentResult(null);
    
    try {
      const result = await triggerDeployment(formData);
      
      if (result.success) {
        setDeploymentResult({
          success: true,
          deploymentId: result.deploymentId
        });
        
        // Reset form but keep repository and branch
        setFormData(prev => ({
          ...prev,
          reason: '',
          skipHealthCheck: false
        }));
        
        onDeploymentStarted?.(result.deploymentId);
      } else {
        setDeploymentResult({
          success: false,
          error: result.error || 'Deployment failed'
        });
      }
    } catch (error) {
      setDeploymentResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const handleInputChange = (field: keyof DeploymentRequest, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!canDeploy) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 opacity-60 ${className}`}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Manual Deployment
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <Shield className="h-5 w-5 text-yellow-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Access Restricted</p>
              <p className="text-sm text-yellow-700 mt-1">
                You don't have permission to trigger deployments. Contact your administrator for access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <GitBranch className="h-5 w-5 mr-2" />
          Manual Deployment
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Trigger a manual deployment to the Home Assistant configuration
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6">
        {deploymentResult && (
          <div className={`mb-6 p-4 border rounded-md ${
            deploymentResult.success 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center">
              {deploymentResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
              )}
              <div>
                {deploymentResult.success ? (
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Deployment started successfully!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      ID: <code className="font-mono bg-green-100 px-1 rounded">
                        {deploymentResult.deploymentId}
                      </code>
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-red-800">Deployment Failed</p>
                    <p className="text-sm text-red-700 mt-1">{deploymentResult.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="repository" className="block text-sm font-medium text-gray-700 mb-2">
                Repository
              </label>
              <input
                type="text"
                id="repository"
                value={formData.repository}
                onChange={(e) => handleInputChange('repository', e.target.value)}
                placeholder="owner/repository"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.repository ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
              />
              {errors.repository && (
                <p className="mt-1 text-sm text-red-600">{errors.repository}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-2">
                Branch
              </label>
              <select 
                id="branch"
                value={formData.branch} 
                onChange={(e) => handleInputChange('branch', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.branch ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
              >
                {branches.map(branch => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              {errors.branch && (
                <p className="mt-1 text-sm text-red-600">{errors.branch}</p>
              )}
            </div>
          </div>
          
          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              <FileText className="h-4 w-4 mr-1" />
              Deployment Reason *
            </label>
            <textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value)}
              placeholder="Describe why you're triggering this deployment..."
              rows={3}
              maxLength={500}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                errors.reason ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
            />
            <div className="flex justify-between mt-1">
              {errors.reason ? (
                <p className="text-sm text-red-600">{errors.reason}</p>
              ) : (
                <p className="text-xs text-gray-500">This will be recorded in the audit trail</p>
              )}
              <span className="text-xs text-gray-500">{formData.reason.length}/500</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="createBackup"
                checked={formData.createBackup}
                onChange={(e) => handleInputChange('createBackup', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isLoading}
              />
              <label htmlFor="createBackup" className="ml-2 text-sm text-gray-700">
                Create backup before deployment
                <span className="text-xs text-gray-500 block">Recommended for production deployments</span>
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="skipHealthCheck"
                checked={formData.skipHealthCheck}
                onChange={(e) => handleInputChange('skipHealthCheck', e.target.checked)}
                className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                disabled={isLoading}
              />
              <label htmlFor="skipHealthCheck" className="ml-2 text-sm">
                <span className="text-orange-700 font-medium">Skip pre-deployment health check</span>
                <span className="text-xs text-orange-600 block flex items-center">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Not recommended - may cause deployment failures
                </span>
              </label>
            </div>
          </div>
          
          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <User className="h-4 w-4 text-gray-500 mr-2" />
            <span className="text-sm text-gray-600">
              Deploying as: <strong className="text-gray-900">{user?.username}</strong>
            </span>
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading || disabled}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Starting Deployment...
              </>
            ) : (
              <>
                <GitBranch className="h-4 w-4 mr-2" />
                Start Deployment
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
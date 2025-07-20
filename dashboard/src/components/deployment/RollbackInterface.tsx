import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Clock,
  History,
  FileText,
  User,
  Shield
} from 'lucide-react';
import { useDeploymentService } from '../../services/deploymentService';
import type { RollbackRequest, DeploymentHistoryItem } from '../../types/deployment';

// Mock auth context - replace with actual implementation
const useAuth = () => ({
  user: { username: 'admin', role: 'admin' },
  hasPermission: (permission: string) => true
});

interface RollbackInterfaceProps {
  repositoryName: string;
  onRollbackStarted?: (rollbackId: string) => void;
  className?: string;
}

export const RollbackInterface: React.FC<RollbackInterfaceProps> = ({
  repositoryName,
  onRollbackStarted,
  className = ''
}) => {
  const { user, hasPermission } = useAuth();
  const { triggerRollback, getDeploymentHistory, isLoading } = useDeploymentService();
  
  const [availableVersions, setAvailableVersions] = useState<DeploymentHistoryItem[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<string>('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rollbackResult, setRollbackResult] = useState<{
    success: boolean;
    rollbackId?: string;
    error?: string;
  } | null>(null);

  const canRollback = hasPermission('deployment:rollback');

  // Fetch available versions for rollback
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const history = await getDeploymentHistory(repositoryName, {
          status: ['completed'],
          limit: 10
        });
        
        // Filter out rollbacks to show only original deployments
        const originalDeployments = history.deployments.filter(d => !d.isRollback);
        setAvailableVersions(originalDeployments);
        
        // Auto-select the most recent successful deployment (usually for rollback)
        if (originalDeployments.length > 1) {
          setSelectedDeployment(originalDeployments[1].deploymentId); // Second most recent
        }
      } catch (error) {
        console.error('Failed to fetch deployment history:', error);
      }
    };

    if (canRollback) {
      fetchVersions();
    }
  }, [repositoryName, getDeploymentHistory, canRollback]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!selectedDeployment) {
      newErrors.deployment = 'Please select a deployment to rollback to';
    }
    
    if (!rollbackReason.trim()) {
      newErrors.reason = 'Rollback reason is required';
    } else if (rollbackReason.length < 10) {
      newErrors.reason = 'Reason must be at least 10 characters';
    } else if (rollbackReason.length > 500) {
      newErrors.reason = 'Reason must be less than 500 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInitiateRollback = () => {
    if (!validateForm()) return;
    setShowConfirmation(true);
  };

  const handleConfirmRollback = async () => {
    if (!validateForm() || !canRollback) return;
    
    setRollbackResult(null);
    setShowConfirmation(false);
    
    const rollbackRequest: RollbackRequest = {
      deploymentId: selectedDeployment,
      reason: rollbackReason
    };
    
    try {
      const result = await triggerRollback(rollbackRequest);
      
      if (result.success) {
        setRollbackResult({
          success: true,
          rollbackId: result.rollbackId
        });
        
        // Reset form
        setRollbackReason('');
        setSelectedDeployment(availableVersions.length > 1 ? availableVersions[1].deploymentId : '');
        
        onRollbackStarted?.(result.rollbackId);
      } else {
        setRollbackResult({
          success: false,
          error: result.error || 'Rollback failed'
        });
      }
    } catch (error) {
      setRollbackResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'deployment') {
      setSelectedDeployment(value);
    } else if (field === 'reason') {
      setRollbackReason(value);
    }
    
    // Clear error when user makes changes
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const selectedDeploymentDetails = availableVersions.find(d => d.deploymentId === selectedDeployment);

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const deploymentTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - deploymentTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  if (!canRollback) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 opacity-60 ${className}`}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Rollback Management
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <Shield className="h-5 w-5 text-yellow-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Access Restricted</p>
              <p className="text-sm text-yellow-700 mt-1">
                You don't have permission to perform rollbacks. Contact your administrator for access.
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
          <RotateCcw className="h-5 w-5 mr-2" />
          Rollback Management
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Rollback to a previous successful deployment
        </p>
      </div>

      <div className="p-6">
        {rollbackResult && (
          <div className={`mb-6 p-4 border rounded-md ${
            rollbackResult.success 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center">
              {rollbackResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
              )}
              <div>
                {rollbackResult.success ? (
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Rollback started successfully!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Rollback ID: <code className="font-mono bg-green-100 px-1 rounded">
                        {rollbackResult.rollbackId}
                      </code>
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-red-800">Rollback Failed</p>
                    <p className="text-sm text-red-700 mt-1">{rollbackResult.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {availableVersions.length === 0 && (
          <div className="text-center py-8">
            <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No deployment history available</p>
            <p className="text-xs text-gray-400 mt-1">You need at least one successful deployment to perform a rollback</p>
          </div>
        )}

        {availableVersions.length > 0 && (
          <div className="space-y-6">
            <div>
              <label htmlFor="deployment" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                <History className="h-4 w-4 mr-1" />
                Select Deployment to Rollback To *
              </label>
              <select
                id="deployment"
                value={selectedDeployment}
                onChange={(e) => handleInputChange('deployment', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.deployment ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
              >
                <option value="">Select a deployment...</option>
                {availableVersions.map((deployment, index) => (
                  <option key={deployment.deploymentId} value={deployment.deploymentId}>
                    {index === 0 ? '(Current) ' : ''}
                    {deployment.deploymentId.substring(0, 8)}... - {deployment.branch} - {formatRelativeTime(deployment.startTime)}
                  </option>
                ))}
              </select>
              {errors.deployment && (
                <p className="mt-1 text-sm text-red-600">{errors.deployment}</p>
              )}
            </div>

            {selectedDeploymentDetails && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Selected Deployment Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">ID:</span>
                    <p className="font-mono text-xs text-blue-800 mt-1">{selectedDeploymentDetails.deploymentId}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Author:</span>
                    <p className="text-blue-800 mt-1">{selectedDeploymentDetails.author}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Branch:</span>
                    <p className="text-blue-800 mt-1">{selectedDeploymentDetails.branch}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Deployed:</span>
                    <p className="text-blue-800 mt-1">{new Date(selectedDeploymentDetails.startTime).toLocaleString()}</p>
                  </div>
                </div>
                {selectedDeploymentDetails.reason && (
                  <div className="mt-3">
                    <span className="text-blue-700 font-medium">Original Reason:</span>
                    <p className="text-blue-800 text-sm mt-1 italic">"{selectedDeploymentDetails.reason}"</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                <FileText className="h-4 w-4 mr-1" />
                Rollback Reason *
              </label>
              <textarea
                id="reason"
                value={rollbackReason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                placeholder="Describe why you're performing this rollback..."
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
                <span className="text-xs text-gray-500">{rollbackReason.length}/500</span>
              </div>
            </div>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-md">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-orange-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Rollback Warning</p>
                  <ul className="text-sm text-orange-700 mt-1 space-y-1">
                    <li>• This will revert your system to a previous state</li>
                    <li>• Any changes made after the selected deployment will be lost</li>
                    <li>• A backup will be created before the rollback</li>
                    <li>• This action cannot be undone easily</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex items-center p-3 bg-gray-50 rounded-md">
              <User className="h-4 w-4 text-gray-500 mr-2" />
              <span className="text-sm text-gray-600">
                Rollback will be performed by: <strong className="text-gray-900">{user?.username}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleInitiateRollback}
              disabled={isLoading || !selectedDeployment || !rollbackReason.trim()}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Initiate Rollback
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-orange-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Confirm Rollback</h3>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to rollback to deployment{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">
                {selectedDeployment.substring(0, 8)}...
              </code>?
            </p>
            
            <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded mb-4">
              This action will revert your system and cannot be easily undone.
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRollback}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Rolling Back...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Confirm Rollback
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
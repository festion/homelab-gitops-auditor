import { useState, useCallback } from 'react';
import type {
  DeploymentRequest,
  DeploymentResponse,
  RollbackRequest,
  RollbackResponse,
  DeploymentStatus,
  DeploymentHistory,
  DeploymentFilters,
  HealthMetrics,
  AuditEvent,
  DeploymentPermissions
} from '../types/deployment';

// Mock auth context - replace with actual auth implementation
const useAuth = () => ({
  token: 'mock-token',
  user: { username: 'admin', role: 'admin' },
  hasPermission: (permission: string) => true
});

export const useDeploymentService = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  
  const apiUrl = process.env.VITE_API_URL || 'http://localhost:3001';

  const makeRequest = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  const triggerDeployment = useCallback(async (request: DeploymentRequest): Promise<DeploymentResponse> => {
    setIsLoading(true);
    try {
      const result = await makeRequest('/api/deployments/home-assistant-config/deploy', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      return {
        success: true,
        deploymentId: result.data.deploymentId
      };
    } catch (error) {
      return {
        success: false,
        deploymentId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setIsLoading(false);
    }
  }, [token, apiUrl]);

  const triggerRollback = useCallback(async (request: RollbackRequest): Promise<RollbackResponse> => {
    setIsLoading(true);
    try {
      const result = await makeRequest('/api/deployments/home-assistant-config/rollback', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      return {
        success: true,
        rollbackId: result.data.rollbackId
      };
    } catch (error) {
      return {
        success: false,
        rollbackId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setIsLoading(false);
    }
  }, [token, apiUrl]);

  const getDeploymentStatus = useCallback(async (repositoryName: string): Promise<DeploymentStatus | null> => {
    try {
      const result = await makeRequest(`/api/deployments/${repositoryName}/status`);
      return result.data;
    } catch (error) {
      console.error('Failed to get deployment status:', error);
      return null;
    }
  }, [token, apiUrl]);

  const getDeploymentHistory = useCallback(async (
    repositoryName: string, 
    filters: DeploymentFilters = {}
  ): Promise<DeploymentHistory> => {
    const searchParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v.toString()));
        } else {
          searchParams.set(key, value.toString());
        }
      }
    });

    const result = await makeRequest(`/api/deployments/${repositoryName}/history?${searchParams}`);
    return result.data;
  }, [token, apiUrl]);

  const getDeploymentLogs = useCallback(async (deploymentId: string): Promise<string[]> => {
    const result = await makeRequest(`/api/deployments/logs/${deploymentId}`);
    return result.data.logs;
  }, [token, apiUrl]);

  const getHealthMetrics = useCallback(async (): Promise<HealthMetrics> => {
    const result = await makeRequest('/api/health/metrics');
    return result.data;
  }, [token, apiUrl]);

  const getAuditEvents = useCallback(async (filters: Record<string, any> = {}): Promise<AuditEvent[]> => {
    const searchParams = new URLSearchParams(filters);
    const result = await makeRequest(`/api/audit/events?${searchParams}`);
    return result.data;
  }, [token, apiUrl]);

  const getPermissions = useCallback(async (): Promise<DeploymentPermissions> => {
    const result = await makeRequest('/api/auth/permissions');
    return result.data;
  }, [token, apiUrl]);

  const cancelDeployment = useCallback(async (deploymentId: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      await makeRequest(`/api/deployments/${deploymentId}/cancel`, {
        method: 'POST',
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setIsLoading(false);
    }
  }, [token, apiUrl]);

  return {
    triggerDeployment,
    triggerRollback,
    getDeploymentStatus,
    getDeploymentHistory,
    getDeploymentLogs,
    getHealthMetrics,
    getAuditEvents,
    getPermissions,
    cancelDeployment,
    isLoading
  };
};

// Export individual functions for testing
export {
  useAuth
};
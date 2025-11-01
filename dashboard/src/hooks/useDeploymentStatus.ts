import { useState, useEffect, useCallback } from 'react';
import { useDeploymentService } from '../services/deploymentService';
import { useDeploymentUpdates } from './useDeploymentUpdates';
import type { DeploymentStatus, DeploymentMetrics } from '../types/deployment';

interface UseDeploymentStatusReturn {
  status: DeploymentStatus | null;
  metrics: DeploymentMetrics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useDeploymentStatus = (repositoryName: string): UseDeploymentStatusReturn => {
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [metrics, setMetrics] = useState<DeploymentMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getDeploymentStatus } = useDeploymentService();
  const { subscribe } = useDeploymentUpdates();

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const deploymentStatus = await getDeploymentStatus(repositoryName);
      setStatus(deploymentStatus);
      
      // Fetch metrics if deployment is active
      if (deploymentStatus?.state === 'in-progress') {
        // Mock metrics for now - replace with actual API call
        setMetrics({
          cpuUsage: Math.random() * 100,
          memoryUsage: Math.random() * 100,
          diskUsage: Math.random() * 100,
          networkIO: Math.random() * 1000,
          deploymentDuration: deploymentStatus.startTime ? 
            Math.floor((Date.now() - new Date(deploymentStatus.startTime).getTime()) / 1000) : 0
        });
      } else {
        setMetrics(null);
      }
    } catch (err) {
      console.error('Failed to fetch deployment status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deployment status');
    } finally {
      setIsLoading(false);
    }
  }, [repositoryName, getDeploymentStatus]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribeDeployment = subscribe('deployment_event', (event) => {
      if (event.type === 'deployment_started' || 
          event.type === 'deployment_progress' || 
          event.type === 'deployment_completed' || 
          event.type === 'deployment_failed') {
        
        // Update status based on event
        setStatus(prevStatus => {
          if (!prevStatus || prevStatus.deploymentId !== event.deploymentId) {
            fetchStatus(); // Fetch full status if it's a new deployment
            return prevStatus;
          }

          // Update existing status
          return {
            ...prevStatus,
            state: event.type === 'deployment_started' ? 'in-progress' :
                   event.type === 'deployment_progress' ? 'in-progress' :
                   event.type === 'deployment_completed' ? 'completed' :
                   'failed',
            currentStage: event.data?.currentStage || prevStatus.currentStage,
            progress: event.data?.progress || prevStatus.progress,
            error: event.type === 'deployment_failed' ? event.data?.error : undefined,
            endTime: (event.type === 'deployment_completed' || event.type === 'deployment_failed') ? 
                     event.timestamp : undefined
          };
        });

        // Update metrics if provided
        if (event.data?.metrics) {
          setMetrics(event.data.metrics);
        }
      }
    });

    const unsubscribeHealth = subscribe('health_event', (event) => {
      // Update metrics based on health events
      if (event.metrics) {
        setMetrics(prevMetrics => ({
          ...prevMetrics,
          ...event.metrics
        }));
      }
    });

    return () => {
      unsubscribeDeployment();
      unsubscribeHealth();
    };
  }, [subscribe, fetchStatus]);

  const refetch = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    metrics,
    isLoading,
    error,
    refetch
  };
};
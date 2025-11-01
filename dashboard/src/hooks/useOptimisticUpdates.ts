import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';
import { useCallback, useRef } from 'react';

interface OptimisticUpdateOptions {
  timeout?: number;
  rollbackOnError?: boolean;
  showToast?: boolean;
  mutationKey?: (string | number)[];
}

interface OptimisticAction {
  id: string;
  timestamp: number;
  rollback: () => void;
  mutation?: () => Promise<void>;
}

export const useOptimisticUpdates = () => {
  const queryClient = useQueryClient();
  const { emit, socket } = useWebSocketContext();
  const pendingActions = useRef<Map<string, OptimisticAction>>(new Map());

  /**
   * Execute an optimistic update with automatic rollback on failure
   */
  const updateWithOptimism = useCallback(async <T>(
    action: string,
    data: any,
    optimisticUpdate: () => T,
    options: OptimisticUpdateOptions = {}
  ): Promise<T> => {
    const {
      timeout = 10000,
      rollbackOnError = true,
      showToast = true,
      mutationKey
    } = options;

    const actionId = `${action}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    let rollbackData: T;
    let hasRolledBack = false;

    try {
      // Execute optimistic update and store rollback data
      rollbackData = optimisticUpdate();

      // Create rollback function
      const rollback = () => {
        if (hasRolledBack) return;
        hasRolledBack = true;

        // Invalidate affected queries to force refetch
        if (mutationKey) {
          queryClient.invalidateQueries({ queryKey: mutationKey });
        } else {
          // Invalidate all queries as fallback
          queryClient.invalidateQueries();
        }

        if (showToast) {
          toast.error('Update failed, changes rolled back');
        }

        pendingActions.current.delete(actionId);
      };

      // Store pending action
      pendingActions.current.set(actionId, {
        id: actionId,
        timestamp: Date.now(),
        rollback
      });

      // Emit action via WebSocket
      emit(action, { ...data, actionId });

      // Wait for confirmation or timeout
      await new Promise<void>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          if (rollbackOnError) {
            rollback();
          }
          reject(new Error(`Action ${action} timed out after ${timeout}ms`));
        }, timeout);

        const successHandler = (response: any) => {
          if (response.actionId === actionId && response.success) {
            clearTimeout(timeoutHandle);
            pendingActions.current.delete(actionId);
            
            if (showToast) {
              toast.success(response.message || 'Update successful');
            }
            
            resolve();
          }
        };

        const errorHandler = (response: any) => {
          if (response.actionId === actionId && !response.success) {
            clearTimeout(timeoutHandle);
            
            if (rollbackOnError) {
              rollback();
            }
            
            if (showToast) {
              toast.error(response.error || 'Update failed');
            }
            
            reject(new Error(response.error || 'Action failed'));
          }
        };

        // Listen for response
        socket?.once(`${action}:success`, successHandler);
        socket?.once(`${action}:error`, errorHandler);

        // Cleanup listeners on completion
        const cleanup = () => {
          socket?.off(`${action}:success`, successHandler);
          socket?.off(`${action}:error`, errorHandler);
        };

        // Add cleanup to both resolve and reject
        const originalResolve = resolve;
        const originalReject = reject;
        
        resolve = (...args) => {
          cleanup();
          originalResolve(...args);
        };
        
        reject = (...args) => {
          cleanup();
          originalReject(...args);
        };
      });

      return rollbackData;
    } catch (error) {
      // Ensure rollback happens on any error
      if (rollbackOnError && !hasRolledBack) {
        const pendingAction = pendingActions.current.get(actionId);
        pendingAction?.rollback();
      }
      throw error;
    }
  }, [emit, socket, queryClient]);

  /**
   * Optimistic repository update
   */
  const updateRepository = useCallback(async (
    repository: string,
    updates: any,
    options?: OptimisticUpdateOptions
  ) => {
    return updateWithOptimism(
      'repository:update',
      { repository, updates },
      () => {
        const queryKey = ['repositories', repository];
        const previousData = queryClient.getQueryData(queryKey);
        
        queryClient.setQueryData(queryKey, (old: any) => ({
          ...old,
          ...updates,
          lastUpdated: new Date().toISOString()
        }));

        return () => {
          queryClient.setQueryData(queryKey, previousData);
        };
      },
      {
        ...options,
        mutationKey: ['repositories', repository]
      }
    );
  }, [updateWithOptimism, queryClient]);

  /**
   * Optimistic compliance status update
   */
  const updateComplianceStatus = useCallback(async (
    repository: string,
    compliant: boolean,
    options?: OptimisticUpdateOptions
  ) => {
    return updateWithOptimism(
      'compliance:update',
      { repository, compliant },
      () => {
        const queryKey = ['compliance'];
        const previousData = queryClient.getQueryData(queryKey);
        
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old?.repositories) return old;
          
          const updatedRepos = old.repositories.map((repo: any) =>
            repo.name === repository
              ? { ...repo, compliant, lastChecked: new Date().toISOString() }
              : repo
          );
          
          return { ...old, repositories: updatedRepos };
        });

        return () => {
          queryClient.setQueryData(queryKey, previousData);
        };
      },
      {
        ...options,
        mutationKey: ['compliance']
      }
    );
  }, [updateWithOptimism, queryClient]);

  /**
   * Optimistic template application
   */
  const applyTemplate = useCallback(async (
    repository: string,
    templateId: string,
    options?: OptimisticUpdateOptions
  ) => {
    return updateWithOptimism(
      'template:apply',
      { repository, templateId },
      () => {
        const repoQueryKey = ['repositories', repository];
        const previousRepoData = queryClient.getQueryData(repoQueryKey);
        
        // Update repository status to show template is being applied
        queryClient.setQueryData(repoQueryKey, (old: any) => ({
          ...old,
          templateStatus: 'applying',
          currentTemplate: templateId,
          lastUpdated: new Date().toISOString()
        }));

        return () => {
          queryClient.setQueryData(repoQueryKey, previousRepoData);
        };
      },
      {
        ...options,
        mutationKey: ['repositories', repository],
        showToast: true
      }
    );
  }, [updateWithOptimism, queryClient]);

  /**
   * Optimistic pipeline trigger
   */
  const triggerPipeline = useCallback(async (
    repository: string,
    workflow: string,
    options?: OptimisticUpdateOptions
  ) => {
    return updateWithOptimism(
      'pipeline:trigger',
      { repository, workflow },
      () => {
        const queryKey = ['pipelines', repository];
        const previousData = queryClient.getQueryData(queryKey);
        
        // Add optimistic pipeline run
        queryClient.setQueryData(queryKey, (old: any) => {
          const optimisticRun = {
            id: `optimistic-${Date.now()}`,
            workflow,
            status: 'queued',
            triggeredAt: new Date().toISOString(),
            isOptimistic: true
          };

          return {
            ...old,
            runs: [optimisticRun, ...(old?.runs || [])]
          };
        });

        return () => {
          queryClient.setQueryData(queryKey, previousData);
        };
      },
      {
        ...options,
        mutationKey: ['pipelines', repository]
      }
    );
  }, [updateWithOptimism, queryClient]);

  /**
   * Optimistic bulk operation
   */
  const executeBulkOperation = useCallback(async (
    operation: string,
    targets: string[],
    data: any,
    options?: OptimisticUpdateOptions
  ) => {
    return updateWithOptimism(
      'bulk:operation',
      { operation, targets, data },
      () => {
        const rollbacks: (() => void)[] = [];

        // Apply optimistic updates to all targets
        targets.forEach(target => {
          const queryKey = ['repositories', target];
          const previousData = queryClient.getQueryData(queryKey);
          
          queryClient.setQueryData(queryKey, (old: any) => ({
            ...old,
            ...data,
            bulkOperationPending: true,
            lastUpdated: new Date().toISOString()
          }));

          rollbacks.push(() => {
            queryClient.setQueryData(queryKey, previousData);
          });
        });

        return () => {
          rollbacks.forEach(rollback => rollback());
        };
      },
      {
        ...options,
        mutationKey: ['repositories'],
        timeout: 30000 // Longer timeout for bulk operations
      }
    );
  }, [updateWithOptimism, queryClient]);

  /**
   * Cancel all pending optimistic updates
   */
  const cancelAllPendingUpdates = useCallback(() => {
    pendingActions.current.forEach(action => {
      action.rollback();
    });
    pendingActions.current.clear();
    toast('All pending updates cancelled', { icon: 'ℹ️' });
  }, []);

  /**
   * Get information about pending updates
   */
  const getPendingUpdates = useCallback(() => {
    return Array.from(pendingActions.current.values()).map(action => ({
      id: action.id,
      timestamp: action.timestamp,
      age: Date.now() - action.timestamp
    }));
  }, []);

  /**
   * Check if there are any pending updates
   */
  const hasPendingUpdates = useCallback(() => {
    return pendingActions.current.size > 0;
  }, []);

  return {
    updateWithOptimism,
    updateRepository,
    updateComplianceStatus,
    applyTemplate,
    triggerPipeline,
    executeBulkOperation,
    cancelAllPendingUpdates,
    getPendingUpdates,
    hasPendingUpdates
  };
};
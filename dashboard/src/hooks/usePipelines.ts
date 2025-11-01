import { useState, useCallback, useEffect } from 'react';
import { Pipeline, TriggerParams } from '../types/pipeline';

// Development configuration
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3070';

interface UsePipelinesOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UsePipelinesReturn {
  pipelines: Pipeline[];
  loading: boolean;
  error: string | null;
  refreshPipelines: () => Promise<void>;
  triggerPipeline: (params: TriggerParams) => Promise<void>;
  getPipelineById: (runId: number) => Pipeline | undefined;
  getPipelinesByRepository: (repository: string) => Pipeline[];
  getRunningPipelines: () => Pipeline[];
  getRecentPipelines: (limit?: number) => Pipeline[];
}

export const usePipelines = (options: UsePipelinesOptions = {}): UsePipelinesReturn => {
  const { autoRefresh = false, refreshInterval = 30000 } = options;
  
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch pipelines from API
  const refreshPipelines = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/v2/pipelines`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPipelines(data.pipelines || []);
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger a pipeline run
  const triggerPipeline = useCallback(async (params: TriggerParams) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/pipelines/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Pipeline triggered successfully:', result);
      
      // Refresh pipelines after successful trigger
      setTimeout(refreshPipelines, 2000);
      
      return result;
    } catch (err) {
      console.error('Failed to trigger pipeline:', err);
      throw err;
    }
  }, [refreshPipelines]);

  // Get pipeline by run ID
  const getPipelineById = useCallback((runId: number): Pipeline | undefined => {
    return pipelines.find(p => p.runId === runId);
  }, [pipelines]);

  // Get pipelines by repository
  const getPipelinesByRepository = useCallback((repository: string): Pipeline[] => {
    return pipelines.filter(p => p.repository === repository);
  }, [pipelines]);

  // Get running pipelines
  const getRunningPipelines = useCallback((): Pipeline[] => {
    return pipelines.filter(p => p.status === 'running');
  }, [pipelines]);

  // Get recent pipelines (sorted by lastRun)
  const getRecentPipelines = useCallback((limit: number = 10): Pipeline[] => {
    return pipelines
      .sort((a, b) => new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime())
      .slice(0, limit);
  }, [pipelines]);

  // Load initial data
  useEffect(() => {
    refreshPipelines();
  }, [refreshPipelines]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(refreshPipelines, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, refreshPipelines]);

  return {
    pipelines,
    loading,
    error,
    refreshPipelines,
    triggerPipeline,
    getPipelineById,
    getPipelinesByRepository,
    getRunningPipelines,
    getRecentPipelines
  };
};

// Hook for managing pipeline subscriptions via WebSocket
export const usePipelineSubscription = (
  onPipelineUpdate: (pipeline: Pipeline) => void,
  onPipelineStatusChange: (pipelines: Pipeline[]) => void
) => {
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = useCallback((sendMessage: (message: any) => void) => {
    if (!subscribed) {
      sendMessage({ 
        type: 'subscribe', 
        channel: 'pipelines',
        events: ['status', 'update', 'complete']
      });
      setSubscribed(true);
    }
  }, [subscribed]);

  const unsubscribe = useCallback((sendMessage: (message: any) => void) => {
    if (subscribed) {
      sendMessage({ 
        type: 'unsubscribe', 
        channel: 'pipelines' 
      });
      setSubscribed(false);
    }
  }, [subscribed]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'pipeline:update':
        onPipelineUpdate(message.data);
        break;
      case 'pipeline:status':
        onPipelineStatusChange(message.data || []);
        break;
      case 'pipeline:complete':
        onPipelineUpdate(message.data);
        break;
      default:
        // Ignore unknown message types
        break;
    }
  }, [onPipelineUpdate, onPipelineStatusChange]);

  return {
    subscribed,
    subscribe,
    unsubscribe,
    handleMessage
  };
};

// Hook for pipeline analytics and statistics
export const usePipelineAnalytics = (pipelines: Pipeline[]) => {
  const getSuccessRate = useCallback((repository?: string): number => {
    const relevantPipelines = repository 
      ? pipelines.filter(p => p.repository === repository)
      : pipelines;
    
    if (relevantPipelines.length === 0) return 0;
    
    const successfulPipelines = relevantPipelines.filter(p => p.status === 'success');
    return (successfulPipelines.length / relevantPipelines.length) * 100;
  }, [pipelines]);

  const getAverageDuration = useCallback((repository?: string): number => {
    const relevantPipelines = repository 
      ? pipelines.filter(p => p.repository === repository && p.status !== 'running')
      : pipelines.filter(p => p.status !== 'running');
    
    if (relevantPipelines.length === 0) return 0;
    
    const totalDuration = relevantPipelines.reduce((sum, p) => sum + p.duration, 0);
    return totalDuration / relevantPipelines.length;
  }, [pipelines]);

  const getStatusCounts = useCallback(() => {
    return pipelines.reduce((counts, pipeline) => {
      counts[pipeline.status] = (counts[pipeline.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }, [pipelines]);

  const getRepositoryStats = useCallback(() => {
    const repoStats: Record<string, {
      total: number;
      running: number;
      success: number;
      failure: number;
      pending: number;
      successRate: number;
      avgDuration: number;
    }> = {};

    pipelines.forEach(pipeline => {
      if (!repoStats[pipeline.repository]) {
        repoStats[pipeline.repository] = {
          total: 0,
          running: 0,
          success: 0,
          failure: 0,
          pending: 0,
          successRate: 0,
          avgDuration: 0
        };
      }

      const stats = repoStats[pipeline.repository];
      stats.total++;
      stats[pipeline.status as keyof typeof stats]++;
    });

    // Calculate success rates and average durations
    Object.keys(repoStats).forEach(repo => {
      const stats = repoStats[repo];
      stats.successRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
      stats.avgDuration = getAverageDuration(repo);
    });

    return repoStats;
  }, [pipelines, getAverageDuration]);

  return {
    getSuccessRate,
    getAverageDuration,
    getStatusCounts,
    getRepositoryStats
  };
};
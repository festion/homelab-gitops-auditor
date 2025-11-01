import { QueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Socket } from 'socket.io-client';

export const setupGlobalEventHandlers = (socket: Socket, queryClient: QueryClient) => {
  // Repository events
  socket.on('repo:updated', (data: { repository: string; changes: any }) => {
    queryClient.invalidateQueries({ queryKey: ['repositories'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
    
    toast(`Repository ${data.repository} updated`, {
      icon: '📦'
    });
  });

  socket.on('repo:push', (data: { repository: string; branch: string; commits: number }) => {
    queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    
    toast(`New push to ${data.repository}/${data.branch}`, {
      icon: '🚀',
      duration: 4000
    });
  });

  // Pipeline events
  socket.on('pipeline:started', (data: { repository: string; workflow: string; runId: number }) => {
    queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    queryClient.setQueryData(['pipeline-status', data.repository], (old: any) => ({
      ...old,
      status: 'running',
      runId: data.runId
    }));

    toast(`Pipeline ${data.workflow} started`, {
      icon: '⏳',
      duration: 3000
    });
  });

  socket.on('pipeline:completed', (data: { 
    repository: string; 
    workflow: string; 
    status: string; 
    conclusion: string 
  }) => {
    queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    
    const icon = data.conclusion === 'success' ? '✅' : '❌';
    toast(`Pipeline ${data.workflow} ${data.conclusion}`, {
      icon,
      duration: 5000
    });
  });

  socket.on('pipeline:failed', (data: { 
    repository: string; 
    workflow: string; 
    error: string; 
    failedStep: string 
  }) => {
    queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    
    toast.error(`Pipeline ${data.workflow} failed at ${data.failedStep}`, {
      duration: 8000
    });
  });

  socket.on('pipeline:step-update', (data: { 
    repository: string; 
    workflow: string; 
    stepName: string; 
    stepStatus: string 
  }) => {
    // Update step-specific query data
    queryClient.setQueryData(['pipeline-steps', data.repository, data.workflow], (old: any) => {
      if (!old) return { steps: [{ name: data.stepName, status: data.stepStatus }] };
      
      const updatedSteps = old.steps.map((step: any) => 
        step.name === data.stepName ? { ...step, status: data.stepStatus } : step
      );
      
      return { ...old, steps: updatedSteps };
    });
  });

  // Audit events
  socket.on('audit:started', (data: { timestamp: string }) => {
    queryClient.setQueryData(['audit-status'], { running: true, startedAt: data.timestamp });
    
    toast('Audit scan started', {
      icon: '🔍',
      duration: 3000
    });
  });

  socket.on('audit:completed', (data: { results: any; duration: number }) => {
    queryClient.invalidateQueries({ queryKey: ['audit'] });
    queryClient.setQueryData(['audit-status'], { running: false });
    
    toast.success(`Audit completed in ${data.duration}s`, {
      duration: 5000
    });
  });

  socket.on('audit:progress', (data: { progress: number; currentRepo: string }) => {
    queryClient.setQueryData(['audit-progress'], data);
  });

  // Compliance events
  socket.on('compliance:changed', (data: { repository: string; compliant: boolean; details?: any }) => {
    queryClient.invalidateQueries({ queryKey: ['compliance'] });
    queryClient.invalidateQueries({ queryKey: ['repositories'] });
    
    const message = data.compliant 
      ? `${data.repository} is now compliant` 
      : `${data.repository} compliance issue detected`;
    
    toast(message, {
      icon: data.compliant ? '✅' : '⚠️',
      duration: 6000
    });
  });

  socket.on('compliance:bulk-update', (data: { updated: string[]; issues: string[] }) => {
    queryClient.invalidateQueries({ queryKey: ['compliance'] });
    
    if (data.updated.length > 0) {
      toast.success(`${data.updated.length} repositories updated`, {
        duration: 4000
      });
    }
    
    if (data.issues.length > 0) {
      toast.error(`${data.issues.length} compliance issues detected`, {
        duration: 6000
      });
    }
  });

  // System events
  socket.on('system:alert', (data: { level: string; message: string; details?: any }) => {
    const toastFn = data.level === 'error' ? toast.error : 
                    data.level === 'warning' ? toast : 
                    toast.success;
    
    toastFn(data.message, {
      duration: 6000
    });
  });

  socket.on('system:health', (data: { status: string; services: any[] }) => {
    queryClient.setQueryData(['system-health'], data);
    
    if (data.status === 'unhealthy') {
      toast.error('System health issues detected', {
        duration: 8000
      });
    }
  });

  // Metrics events
  socket.on('metrics:update', (data: { metric: string; value: any; timestamp: string }) => {
    queryClient.setQueryData(['metrics', data.metric], {
      value: data.value,
      timestamp: data.timestamp
    });
  });

  socket.on('metrics:bulk-update', (data: { metrics: Record<string, any> }) => {
    Object.entries(data.metrics).forEach(([metric, value]) => {
      queryClient.setQueryData(['metrics', metric], value);
    });
  });

  // Real-time activity events
  socket.on('activity:new', (data: { 
    id: string; 
    type: string; 
    message: string; 
    timestamp: string; 
    metadata?: any 
  }) => {
    // Update activity feed
    queryClient.setQueryData(['activity-feed'], (old: any) => {
      const activities = old?.activities || [];
      return {
        activities: [data, ...activities].slice(0, 100), // Keep last 100 activities
        lastUpdated: new Date().toISOString()
      };
    });
  });

  // Template events
  socket.on('template:updated', (data: { templateId: string; changes: any }) => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['compliance'] });
    
    toast(`Template updated`, {
      icon: '📝',
      duration: 3000
    });
  });

  socket.on('template:applied', (data: { templateId: string; repository: string; success: boolean }) => {
    queryClient.invalidateQueries({ queryKey: ['compliance'] });
    
    const message = data.success 
      ? `Template applied to ${data.repository}` 
      : `Failed to apply template to ${data.repository}`;
    
    const toastFn = data.success ? toast.success : toast.error;
    toastFn(message, {
      duration: 5000
    });
  });

  // Webhook events
  socket.on('webhook:received', (data: { 
    repository: string; 
    event: string; 
    payload: any 
  }) => {
    // Trigger relevant data refreshes based on webhook type
    if (data.event === 'push') {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
    } else if (data.event === 'workflow_run') {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    }
  });

  // Error handling
  socket.on('error', (error: any) => {
    console.error('WebSocket error:', error);
    toast.error('Connection error occurred', {
      duration: 5000
    });
  });

  // Connection status events
  socket.on('connect', () => {
    console.log('WebSocket connected');
    queryClient.invalidateQueries(); // Refresh all data on reconnect
  });

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    queryClient.setQueryData(['connection-status'], { connected: false });
  });

  socket.on('reconnect', (attemptNumber: number) => {
    console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
    toast.success('Connection restored', {
      duration: 3000
    });
    queryClient.invalidateQueries(); // Refresh all data
  });

  socket.on('reconnect_error', (error: any) => {
    console.error('WebSocket reconnection failed:', error);
    toast.error('Failed to reconnect', {
      duration: 5000
    });
  });
};
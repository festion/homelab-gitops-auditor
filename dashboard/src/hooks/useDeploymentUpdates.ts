import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { DeploymentEvent } from '../types/deployment';

// Mock auth hook - replace with actual implementation
const useAuth = () => ({
  token: 'mock-token'
});

interface UseDeploymentUpdatesReturn {
  isConnected: boolean;
  lastUpdate: string | null;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  unsubscribe: (event: string) => void;
  emit: (event: string, data: any) => void;
}

export const useDeploymentUpdates = (): UseDeploymentUpdatesReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const apiUrl = process.env.VITE_API_URL || 'http://localhost:3001';
    const newSocket = io(apiUrl, {
      auth: {
        token: token
      },
      transports: ['websocket']
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    });

    // Listen for deployment events
    newSocket.on('deployment_event', (event: DeploymentEvent) => {
      console.log('Deployment event received:', event);
      setLastUpdate(event.timestamp);
      
      // Dispatch custom event for components to listen to
      window.dispatchEvent(new CustomEvent('deployment_event', { detail: event }));
    });

    // Listen for health events
    newSocket.on('health_event', (event: any) => {
      console.log('Health event received:', event);
      setLastUpdate(new Date().toISOString());
      
      window.dispatchEvent(new CustomEvent('health_event', { detail: event }));
    });

    // Listen for audit events
    newSocket.on('audit_event', (event: any) => {
      console.log('Audit event received:', event);
      setLastUpdate(new Date().toISOString());
      
      window.dispatchEvent(new CustomEvent('audit_event', { detail: event }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    const handleEvent = (e: CustomEvent) => {
      callback(e.detail);
    };

    window.addEventListener(event, handleEvent as EventListener);
    
    return () => {
      window.removeEventListener(event, handleEvent as EventListener);
    };
  }, []);

  const unsubscribe = useCallback((event: string) => {
    // Remove all listeners for this event
    window.removeEventListener(event, () => {});
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [socket, isConnected]);

  return {
    isConnected,
    lastUpdate,
    subscribe,
    unsubscribe,
    emit
  };
};
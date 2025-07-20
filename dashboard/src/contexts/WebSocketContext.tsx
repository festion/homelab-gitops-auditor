import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { setupGlobalEventHandlers } from '../services/websocketHandlers';

interface WebSocketContextType {
  socket: Socket | null;
  connected: boolean;
  subscribe: (event: string, handler: (data: any) => void) => void;
  unsubscribe: (event: string, handler: (data: any) => void) => void;
  emit: (event: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    const newSocket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    // Connection handlers
    newSocket.on('connect', () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      toast.success('Real-time updates connected');
      console.log('WebSocket connected:', newSocket.id);
    });

    newSocket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('WebSocket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, attempt reconnection
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      reconnectAttempts.current++;
      console.error('WebSocket connection error:', error);
      
      if (reconnectAttempts.current > 5) {
        toast.error('Unable to establish real-time connection');
      }
    });

    // Global event handlers
    setupGlobalEventHandlers(newSocket, queryClient);

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [queryClient]);

  const subscribe = (event: string, handler: (data: any) => void) => {
    socket?.on(event, handler);
  };

  const unsubscribe = (event: string, handler: (data: any) => void) => {
    socket?.off(event, handler);
  };

  const emit = (event: string, data: any) => {
    socket?.emit(event, data);
  };

  return (
    <WebSocketContext.Provider value={{ socket, connected, subscribe, unsubscribe, emit }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
};


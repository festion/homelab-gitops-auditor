import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { WebSocketProvider, useWebSocketContext } from '../../contexts/WebSocketContext';

// Mock Socket.io
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    close: jest.fn(),
    id: 'mock-socket-id',
    connected: true
  };

  return {
    io: jest.fn(() => mockSocket),
    __mockSocket: mockSocket
  };
});

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

const { io } = require('socket.io-client');
const mockSocket = require('socket.io-client').__mockSocket;

describe('WebSocketContext', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    jest.clearAllMocks();
  });

  const TestComponent = () => {
    const { socket, connected, subscribe, unsubscribe, emit } = useWebSocketContext();
    
    return (
      <div>
        <div data-testid="connection-status">
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        <div data-testid="socket-id">
          {socket?.id || 'No socket'}
        </div>
        <button 
          data-testid="emit-button"
          onClick={() => emit('test-event', { data: 'test' })}
        >
          Emit Test
        </button>
      </div>
    );
  };

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          {component}
        </WebSocketProvider>
      </QueryClientProvider>
    );
  };

  test('should create socket connection on mount', () => {
    renderWithProviders(<TestComponent />);
    
    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      })
    );
  });

  test('should show connected status when socket connects', async () => {
    renderWithProviders(<TestComponent />);
    
    // Simulate socket connection
    const connectHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect'
    )?.[1];
    
    if (connectHandler) {
      connectHandler();
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
    });
    
    expect(toast.success).toHaveBeenCalledWith('Real-time updates connected');
  });

  test('should show socket ID when connected', async () => {
    renderWithProviders(<TestComponent />);
    
    const connectHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect'
    )?.[1];
    
    if (connectHandler) {
      connectHandler();
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('socket-id')).toHaveTextContent('mock-socket-id');
    });
  });

  test('should emit events through socket', async () => {
    renderWithProviders(<TestComponent />);
    
    const connectHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect'
    )?.[1];
    
    if (connectHandler) {
      connectHandler();
    }
    
    await waitFor(() => {
      screen.getByTestId('emit-button').click();
    });
    
    expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
  });

  test('should handle disconnect events', async () => {
    renderWithProviders(<TestComponent />);
    
    // First connect
    const connectHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect'
    )?.[1];
    
    if (connectHandler) {
      connectHandler();
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
    });
    
    // Then disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'disconnect'
    )?.[1];
    
    if (disconnectHandler) {
      disconnectHandler('transport close');
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected');
    });
  });

  test('should handle connection errors', async () => {
    renderWithProviders(<TestComponent />);
    
    const errorHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect_error'
    )?.[1];
    
    if (errorHandler) {
      // Simulate multiple connection errors
      for (let i = 0; i < 6; i++) {
        errorHandler(new Error('Connection failed'));
      }
    }
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to establish real-time connection');
    });
  });

  test('should setup global event handlers', () => {
    renderWithProviders(<TestComponent />);
    
    // Check that global event handlers are registered
    const eventHandlers = mockSocket.on.mock.calls.map(call => call[0]);
    
    expect(eventHandlers).toContain('repo:updated');
    expect(eventHandlers).toContain('repo:push');
    expect(eventHandlers).toContain('pipeline:started');
    expect(eventHandlers).toContain('pipeline:completed');
    expect(eventHandlers).toContain('audit:started');
    expect(eventHandlers).toContain('audit:completed');
    expect(eventHandlers).toContain('compliance:changed');
    expect(eventHandlers).toContain('system:alert');
    expect(eventHandlers).toContain('metrics:update');
  });

  test('should cleanup socket on unmount', () => {
    const { unmount } = renderWithProviders(<TestComponent />);
    
    unmount();
    
    expect(mockSocket.close).toHaveBeenCalled();
  });

  test('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = jest.fn();
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useWebSocketContext must be used within WebSocketProvider');
    
    console.error = originalError;
  });
});

describe('Global Event Handlers', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    jest.clearAllMocks();
  });

  const renderWithProviders = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <div>Test</div>
        </WebSocketProvider>
      </QueryClientProvider>
    );
  };

  test('should handle repo:updated events', async () => {
    renderWithProviders();
    
    const repoHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'repo:updated'
    )?.[1];
    
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    
    if (repoHandler) {
      repoHandler({
        repository: 'test-repo',
        changes: { files: ['README.md'] }
      });
    }
    
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith(['repositories', 'test-repo']);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith(['audit']);
    });
    
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('Repository test-repo updated')
    );
  });

  test('should handle pipeline:started events', async () => {
    renderWithProviders();
    
    const pipelineHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'pipeline:started'
    )?.[1];
    
    const setQueryDataSpy = jest.spyOn(queryClient, 'setQueryData');
    
    if (pipelineHandler) {
      pipelineHandler({
        repository: 'test-repo',
        workflow: 'CI',
        runId: 12345
      });
    }
    
    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        ['pipeline-status', 'test-repo'],
        expect.any(Function)
      );
    });
  });

  test('should handle audit:completed events', async () => {
    renderWithProviders();
    
    const auditHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'audit:completed'
    )?.[1];
    
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = jest.spyOn(queryClient, 'setQueryData');
    
    if (auditHandler) {
      auditHandler({
        results: { compliant: 5, nonCompliant: 2 },
        duration: 45
      });
    }
    
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith(['audit']);
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        ['audit-status'],
        { running: false }
      );
    });
    
    expect(toast.success).toHaveBeenCalledWith('Audit completed in 45s');
  });

  test('should handle system:alert events', async () => {
    renderWithProviders();
    
    const alertHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'system:alert'
    )?.[1];
    
    if (alertHandler) {
      alertHandler({
        level: 'error',
        message: 'System error occurred',
        details: { code: 500 }
      });
    }
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('System error occurred');
    });
  });
});
import { renderHook, act } from '@testing-library/react';
import { 
  useRealTimeUpdates, 
  useMultipleRealTimeUpdates,
  useRepositoryRealTimeUpdates,
  usePipelineRealTimeUpdates 
} from '../../hooks/useRealTimeUpdates';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

// Mock the WebSocket context
jest.mock('../../contexts/WebSocketContext', () => ({
  useWebSocketContext: jest.fn()
}));

const mockUseWebSocketContext = useWebSocketContext as jest.MockedFunction<typeof useWebSocketContext>;

describe('useRealTimeUpdates', () => {
  const mockSubscribe = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocketContext.mockReturnValue({
      socket: null,
      connected: true,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      emit: jest.fn()
    });
  });

  test('should subscribe to event on mount', () => {
    const handler = jest.fn();
    
    renderHook(() => useRealTimeUpdates('test-event', handler));
    
    expect(mockSubscribe).toHaveBeenCalledWith('test-event', expect.any(Function));
  });

  test('should unsubscribe on unmount', () => {
    const handler = jest.fn();
    
    const { unmount } = renderHook(() => useRealTimeUpdates('test-event', handler));
    
    const subscribedHandler = mockSubscribe.mock.calls[0][1];
    
    unmount();
    
    expect(mockUnsubscribe).toHaveBeenCalledWith('test-event', subscribedHandler);
  });

  test('should call handler when event is received', () => {
    const handler = jest.fn();
    
    renderHook(() => useRealTimeUpdates('test-event', handler));
    
    const subscribedHandler = mockSubscribe.mock.calls[0][1];
    const testData = { message: 'test data' };
    
    act(() => {
      subscribedHandler(testData);
    });
    
    expect(handler).toHaveBeenCalledWith(testData);
  });

  test('should update subscription when event changes', () => {
    const handler = jest.fn();
    let event = 'event1';
    
    const { rerender } = renderHook(() => useRealTimeUpdates(event, handler));
    
    expect(mockSubscribe).toHaveBeenCalledWith('event1', expect.any(Function));
    
    const firstHandler = mockSubscribe.mock.calls[0][1];
    
    event = 'event2';
    rerender();
    
    expect(mockUnsubscribe).toHaveBeenCalledWith('event1', firstHandler);
    expect(mockSubscribe).toHaveBeenCalledWith('event2', expect.any(Function));
  });

  test('should use latest handler reference', () => {
    let handlerCallCount = 0;
    let handler = () => { handlerCallCount = 1; };
    
    const { rerender } = renderHook(() => useRealTimeUpdates('test-event', handler));
    
    // Change handler
    handler = () => { handlerCallCount = 2; };
    rerender();
    
    const subscribedHandler = mockSubscribe.mock.calls[0][1];
    
    act(() => {
      subscribedHandler({ data: 'test' });
    });
    
    expect(handlerCallCount).toBe(2);
  });
});

describe('useMultipleRealTimeUpdates', () => {
  const mockSubscribe = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocketContext.mockReturnValue({
      socket: null,
      connected: true,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      emit: jest.fn()
    });
  });

  test('should subscribe to multiple events', () => {
    const handlers = {
      'event1': jest.fn(),
      'event2': jest.fn(),
      'event3': jest.fn()
    };
    
    renderHook(() => useMultipleRealTimeUpdates(handlers));
    
    expect(mockSubscribe).toHaveBeenCalledWith('event1', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('event2', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('event3', expect.any(Function));
  });

  test('should call correct handler for each event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handlers = {
      'event1': handler1,
      'event2': handler2
    };
    
    renderHook(() => useMultipleRealTimeUpdates(handlers));
    
    const event1Handler = mockSubscribe.mock.calls.find(call => call[0] === 'event1')?.[1];
    const event2Handler = mockSubscribe.mock.calls.find(call => call[0] === 'event2')?.[1];
    
    act(() => {
      event1Handler?.({ data: 'event1-data' });
      event2Handler?.({ data: 'event2-data' });
    });
    
    expect(handler1).toHaveBeenCalledWith({ data: 'event1-data' });
    expect(handler2).toHaveBeenCalledWith({ data: 'event2-data' });
  });

  test('should unsubscribe from all events on unmount', () => {
    const handlers = {
      'event1': jest.fn(),
      'event2': jest.fn()
    };
    
    const { unmount } = renderHook(() => useMultipleRealTimeUpdates(handlers));
    
    unmount();
    
    expect(mockUnsubscribe).toHaveBeenCalledWith('event1', expect.any(Function));
    expect(mockUnsubscribe).toHaveBeenCalledWith('event2', expect.any(Function));
  });
});

describe('useRepositoryRealTimeUpdates', () => {
  const mockSubscribe = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocketContext.mockReturnValue({
      socket: null,
      connected: true,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      emit: jest.fn()
    });
  });

  test('should subscribe to repository events', () => {
    const handler = jest.fn();
    const events = ['repo:updated', 'repo:push'];
    
    renderHook(() => useRepositoryRealTimeUpdates('test-repo', events, handler));
    
    expect(mockSubscribe).toHaveBeenCalledWith('repo:updated', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('repo:push', expect.any(Function));
  });

  test('should filter events by repository', () => {
    const handler = jest.fn();
    const events = ['repo:updated'];
    
    renderHook(() => useRepositoryRealTimeUpdates('test-repo', events, handler));
    
    const eventHandler = mockSubscribe.mock.calls.find(call => call[0] === 'repo:updated')?.[1];
    
    act(() => {
      // Event for correct repository
      eventHandler?.({
        repository: 'test-repo',
        data: 'correct-repo-data'
      });
      
      // Event for different repository
      eventHandler?.({
        repository: 'other-repo',
        data: 'other-repo-data'
      });
    });
    
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('repo:updated', {
      repository: 'test-repo',
      data: 'correct-repo-data'
    });
  });

  test('should not subscribe if repository is empty', () => {
    const handler = jest.fn();
    const events = ['repo:updated'];
    
    renderHook(() => useRepositoryRealTimeUpdates('', events, handler));
    
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('usePipelineRealTimeUpdates', () => {
  const mockMultipleRealTimeUpdates = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocketContext.mockReturnValue({
      socket: null,
      connected: true,
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      emit: jest.fn()
    });

    // Mock useMultipleRealTimeUpdates since it's used internally
    jest.doMock('../../hooks/useRealTimeUpdates', () => ({
      ...jest.requireActual('../../hooks/useRealTimeUpdates'),
      useMultipleRealTimeUpdates: mockMultipleRealTimeUpdates
    }));
  });

  test('should subscribe to pipeline events', () => {
    const handler = jest.fn();
    
    renderHook(() => usePipelineRealTimeUpdates('test-repo', 'CI', handler));
    
    expect(mockMultipleRealTimeUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        'pipeline:started': expect.any(Function),
        'pipeline:completed': expect.any(Function),
        'pipeline:failed': expect.any(Function),
        'pipeline:step-update': expect.any(Function)
      }),
      ['test-repo', 'CI']
    );
  });

  test('should work without workflow filter', () => {
    const handler = jest.fn();
    
    renderHook(() => usePipelineRealTimeUpdates('test-repo', undefined, handler));
    
    expect(mockMultipleRealTimeUpdates).toHaveBeenCalledWith(
      expect.any(Object),
      ['test-repo', undefined]
    );
  });
});
import { useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

/**
 * Hook for subscribing to real-time WebSocket events
 * @param event - The event name to subscribe to
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array (similar to useEffect)
 */
export const useRealTimeUpdates = (
  event: string,
  handler: (data: any) => void,
  deps: any[] = []
) => {
  const { subscribe, unsubscribe } = useWebSocketContext();
  const handlerRef = useRef(handler);

  // Update handler ref on each render
  handlerRef.current = handler;

  useEffect(() => {
    const eventHandler = (data: any) => {
      handlerRef.current(data);
    };

    subscribe(event, eventHandler);

    return () => {
      unsubscribe(event, eventHandler);
    };
  }, [event, subscribe, unsubscribe, ...deps]);
};

/**
 * Hook for subscribing to multiple real-time events
 * @param eventHandlers - Object mapping event names to handler functions
 * @param deps - Dependencies array
 */
export const useMultipleRealTimeUpdates = (
  eventHandlers: Record<string, (data: any) => void>,
  deps: any[] = []
) => {
  const { subscribe, unsubscribe } = useWebSocketContext();
  const handlersRef = useRef(eventHandlers);

  // Update handlers ref on each render
  handlersRef.current = eventHandlers;

  useEffect(() => {
    const wrappedHandlers: Record<string, (data: any) => void> = {};

    // Create wrapped handlers that use the ref
    Object.keys(eventHandlers).forEach(event => {
      wrappedHandlers[event] = (data: any) => {
        handlersRef.current[event]?.(data);
      };
      subscribe(event, wrappedHandlers[event]);
    });

    return () => {
      // Cleanup all subscriptions
      Object.keys(eventHandlers).forEach(event => {
        unsubscribe(event, wrappedHandlers[event]);
      });
    };
  }, [Object.keys(eventHandlers).join(','), subscribe, unsubscribe, ...deps]);
};

/**
 * Hook for one-time event subscription
 * @param event - The event name to subscribe to
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array
 */
export const useRealTimeOnce = (
  event: string,
  handler: (data: any) => void,
  deps: any[] = []
) => {
  const { socket } = useWebSocketContext();
  const handlerRef = useRef(handler);

  // Update handler ref on each render
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    const eventHandler = (data: any) => {
      handlerRef.current(data);
    };

    socket.once(event, eventHandler);

    return () => {
      socket.off(event, eventHandler);
    };
  }, [event, socket, ...deps]);
};

/**
 * Hook for conditional real-time subscriptions
 * @param event - The event name to subscribe to
 * @param handler - The handler function to call when event is received
 * @param condition - Condition that determines if subscription should be active
 * @param deps - Dependencies array
 */
export const useConditionalRealTimeUpdates = (
  event: string,
  handler: (data: any) => void,
  condition: boolean,
  deps: any[] = []
) => {
  const { subscribe, unsubscribe } = useWebSocketContext();
  const handlerRef = useRef(handler);

  // Update handler ref on each render
  handlerRef.current = handler;

  useEffect(() => {
    if (!condition) return;

    const eventHandler = (data: any) => {
      handlerRef.current(data);
    };

    subscribe(event, eventHandler);

    return () => {
      unsubscribe(event, eventHandler);
    };
  }, [event, condition, subscribe, unsubscribe, ...deps]);
};

/**
 * Hook for repository-specific real-time updates
 * @param repository - The repository name to filter events for
 * @param events - Array of event types to subscribe to
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array
 */
export const useRepositoryRealTimeUpdates = (
  repository: string,
  events: string[],
  handler: (event: string, data: any) => void,
  deps: any[] = []
) => {
  const { subscribe, unsubscribe } = useWebSocketContext();
  const handlerRef = useRef(handler);

  handlerRef.current = handler;

  useEffect(() => {
    if (!repository) return;

    const eventHandlers: Record<string, (data: any) => void> = {};

    events.forEach(event => {
      eventHandlers[event] = (data: any) => {
        // Filter events for specific repository
        if (data.repository === repository) {
          handlerRef.current(event, data);
        }
      };
      subscribe(event, eventHandlers[event]);
    });

    return () => {
      events.forEach(event => {
        unsubscribe(event, eventHandlers[event]);
      });
    };
  }, [repository, events.join(','), subscribe, unsubscribe, ...deps]);
};

/**
 * Hook for pipeline-specific real-time updates
 * @param repository - The repository name
 * @param workflow - The workflow name (optional)
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array
 */
export const usePipelineRealTimeUpdates = (
  repository: string,
  handler: (event: string, data: any) => void,
  workflow?: string,
  deps: any[] = []
) => {
  const pipelineEvents = [
    'pipeline:started',
    'pipeline:completed',
    'pipeline:failed',
    'pipeline:step-update'
  ];

  useMultipleRealTimeUpdates(
    Object.fromEntries(
      pipelineEvents.map(event => [
        event,
        (data: any) => {
          // Filter for specific repository and optionally workflow
          if (data.repository === repository) {
            if (!workflow || data.workflow === workflow) {
              handler(event, data);
            }
          }
        }
      ])
    ),
    [repository, workflow, ...deps]
  );
};

/**
 * Hook for audit-specific real-time updates
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array
 */
export const useAuditRealTimeUpdates = (
  handler: (event: string, data: any) => void,
  deps: any[] = []
) => {
  const auditEvents = [
    'audit:started',
    'audit:progress',
    'audit:completed'
  ];

  useMultipleRealTimeUpdates(
    Object.fromEntries(
      auditEvents.map(event => [
        event,
        (data: any) => handler(event, data)
      ])
    ),
    deps
  );
};

/**
 * Hook for system health real-time updates
 * @param handler - The handler function to call when event is received
 * @param deps - Dependencies array
 */
export const useSystemHealthRealTimeUpdates = (
  handler: (event: string, data: any) => void,
  deps: any[] = []
) => {
  const systemEvents = [
    'system:alert',
    'system:health',
    'metrics:update',
    'metrics:bulk-update'
  ];

  useMultipleRealTimeUpdates(
    Object.fromEntries(
      systemEvents.map(event => [
        event,
        (data: any) => handler(event, data)
      ])
    ),
    deps
  );
};
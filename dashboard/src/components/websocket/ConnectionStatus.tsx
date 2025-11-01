import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, RotateCcw, Activity } from 'lucide-react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

export const ConnectionStatus: React.FC = () => {
  const { socket, connected } = useWebSocketContext();
  const [showDetails, setShowDetails] = useState(false);
  const [latency, setLatency] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<Date>(new Date());
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  // Monitor socket events for additional status info
  useEffect(() => {
    if (!socket) return;

    const pingStart = Date.now();
    
    // Ping the server to measure latency
    const measureLatency = () => {
      const startTime = Date.now();
      socket.emit('ping', startTime);
    };

    // Listen for pong response
    const handlePong = () => {
      const latency = Date.now() - pingStart;
      setLatency(latency);
      setLastActivity(new Date());
    };

    // Listen for any message to update last activity
    const handleAnyMessage = () => {
      setLastActivity(new Date());
    };

    // Track reconnection attempts
    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempts(attempt);
    };

    const handleConnect = () => {
      setReconnectAttempts(0);
      measureLatency();
    };

    socket.on('pong', handlePong);
    socket.on('connect', handleConnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.onAny(handleAnyMessage);

    // Measure latency periodically
    const latencyInterval = setInterval(measureLatency, 30000);

    return () => {
      socket.off('pong', handlePong);
      socket.off('connect', handleConnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.offAny(handleAnyMessage);
      clearInterval(latencyInterval);
    };
  }, [socket]);

  const getConnectionStatus = () => {
    if (!socket) return 'disconnected';
    if (connected) return 'connected';
    if ((socket as any).connecting) return 'connecting';
    return 'disconnected';
  };

  const status = getConnectionStatus();

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          color: 'text-green-500',
          bgColor: 'bg-green-500',
          label: 'Connected',
          dotClass: 'bg-green-500'
        };
      case 'connecting':
        return {
          icon: Wifi,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500',
          label: 'Connecting...',
          dotClass: 'bg-yellow-500 animate-pulse'
        };
      case 'disconnected':
        return {
          icon: WifiOff,
          color: 'text-red-500',
          bgColor: 'bg-red-500',
          label: 'Disconnected',
          dotClass: 'bg-red-500'
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500',
          label: 'Error',
          dotClass: 'bg-orange-500'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const getLatencyQuality = () => {
    if (latency < 100) return { label: 'Excellent', color: 'text-green-600' };
    if (latency < 300) return { label: 'Good', color: 'text-yellow-600' };
    if (latency < 1000) return { label: 'Poor', color: 'text-orange-600' };
    return { label: 'Very Poor', color: 'text-red-600' };
  };

  const handleReconnect = () => {
    if (socket && !connected) {
      socket.connect();
    }
  };

  const timeSinceLastActivity = () => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastActivity.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center space-x-2 px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200"
        title={`WebSocket ${config.label}`}
      >
        <div className={`w-2 h-2 rounded-full ${config.dotClass}`} />
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium text-gray-700">
          {config.label}
        </span>
        {connected && latency > 0 && (
          <span className={`text-xs ${getLatencyQuality().color}`}>
            {latency}ms
          </span>
        )}
      </button>

      {showDetails && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Connection Details</h4>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-3">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${config.dotClass}`} />
                <span className={`text-sm font-medium ${config.color}`}>
                  {config.label}
                </span>
              </div>
            </div>

            {/* Protocol */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Protocol:</span>
              <span className="text-sm text-gray-900">
                {socket?.io?.engine?.transport?.name || 'WebSocket'}
              </span>
            </div>

            {/* Endpoint */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Endpoint:</span>
              <span className="text-sm text-gray-900 font-mono text-xs">
                {(socket?.io as any)?.uri || 'N/A'}
              </span>
            </div>

            {connected && (
              <>
                {/* Latency */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Latency:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-900">{latency}ms</span>
                    <span className={`text-xs ${getLatencyQuality().color}`}>
                      {getLatencyQuality().label}
                    </span>
                  </div>
                </div>

                {/* Last Activity */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Activity:</span>
                  <div className="flex items-center space-x-1">
                    <Activity className="w-3 h-3 text-gray-500" />
                    <span className="text-sm text-gray-900">
                      {timeSinceLastActivity()}
                    </span>
                  </div>
                </div>

                {/* Socket ID */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Socket ID:</span>
                  <span className="text-sm text-gray-900 font-mono text-xs">
                    {socket?.id?.substring(0, 8) || 'N/A'}...
                  </span>
                </div>
              </>
            )}

            {!connected && reconnectAttempts > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Reconnect Attempts:</span>
                <span className="text-sm text-orange-600">
                  {reconnectAttempts}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-gray-200">
              {!connected && (
                <button
                  onClick={handleReconnect}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200"
                  disabled={status === 'connecting'}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {status === 'connecting' ? 'Connecting...' : 'Reconnect'}
                  </span>
                </button>
              )}

              {connected && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => socket?.disconnect()}
                    className="flex-1 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors duration-200"
                  >
                    Disconnect
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors duration-200"
                  >
                    Refresh Page
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
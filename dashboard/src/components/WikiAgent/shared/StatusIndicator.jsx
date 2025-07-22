import React from 'react';
import PropTypes from 'prop-types';

const StatusIndicator = ({ status, size = 'medium', showLabel = true, className = '' }) => {
  const statusConfigs = {
    online: {
      color: 'bg-green-500',
      pulseColor: 'bg-green-400',
      label: 'Online',
      icon: '✓'
    },
    offline: {
      color: 'bg-red-500',
      pulseColor: 'bg-red-400',
      label: 'Offline',
      icon: '✗'
    },
    processing: {
      color: 'bg-yellow-500',
      pulseColor: 'bg-yellow-400',
      label: 'Processing',
      icon: '↻'
    },
    idle: {
      color: 'bg-gray-500',
      pulseColor: 'bg-gray-400',
      label: 'Idle',
      icon: '•'
    },
    error: {
      color: 'bg-red-600',
      pulseColor: 'bg-red-500',
      label: 'Error',
      icon: '!'
    },
    syncing: {
      color: 'bg-blue-500',
      pulseColor: 'bg-blue-400',
      label: 'Syncing',
      icon: '↔'
    }
  };

  const sizeConfigs = {
    small: {
      dotSize: 'w-2 h-2',
      fontSize: 'text-xs',
      spacing: 'space-x-1'
    },
    medium: {
      dotSize: 'w-3 h-3',
      fontSize: 'text-sm',
      spacing: 'space-x-2'
    },
    large: {
      dotSize: 'w-4 h-4',
      fontSize: 'text-base',
      spacing: 'space-x-3'
    }
  };

  const config = statusConfigs[status] || statusConfigs.offline;
  const sizeConfig = sizeConfigs[size];

  return (
    <div className={`flex items-center ${sizeConfig.spacing} ${className}`}>
      <div className="relative">
        <div className={`${sizeConfig.dotSize} ${config.color} rounded-full animate-pulse`}>
          <div className={`absolute inset-0 ${config.pulseColor} rounded-full animate-ping opacity-75`}></div>
        </div>
      </div>
      {showLabel && (
        <span className={`${sizeConfig.fontSize} font-medium text-gray-700 dark:text-gray-300`}>
          {config.label}
        </span>
      )}
    </div>
  );
};

StatusIndicator.propTypes = {
  status: PropTypes.oneOf(['online', 'offline', 'processing', 'idle', 'error', 'syncing']).isRequired,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  showLabel: PropTypes.bool,
  className: PropTypes.string
};

export default StatusIndicator;
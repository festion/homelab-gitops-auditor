import React from 'react';
import PropTypes from 'prop-types';

const MetricsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend, 
  trendValue,
  color = 'blue',
  className = '' 
}) => {
  const colorConfigs = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      icon: 'text-blue-500 dark:text-blue-400'
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      icon: 'text-green-500 dark:text-green-400'
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      text: 'text-yellow-600 dark:text-yellow-400',
      icon: 'text-yellow-500 dark:text-yellow-400'
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-500 dark:text-red-400'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      icon: 'text-purple-500 dark:text-purple-400'
    }
  };

  const config = colorConfigs[color] || colorConfigs.blue;

  const getTrendIcon = () => {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-500';
    if (trend === 'down') return 'text-red-500';
    return 'text-gray-500';
  };

  return (
    <div className={`p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <div className="mt-2 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
            {trend && trendValue && (
              <div className={`ml-2 flex items-center text-sm ${getTrendColor()}`}>
                <span>{getTrendIcon()}</span>
                <span className="ml-1">{trendValue}</span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`p-3 ${config.bg} rounded-lg`}>
            <div className={`text-2xl ${config.icon}`}>{icon}</div>
          </div>
        )}
      </div>
    </div>
  );
};

MetricsCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  trend: PropTypes.oneOf(['up', 'down', 'neutral']),
  trendValue: PropTypes.string,
  color: PropTypes.oneOf(['blue', 'green', 'yellow', 'red', 'purple']),
  className: PropTypes.string
};

export default MetricsCard;
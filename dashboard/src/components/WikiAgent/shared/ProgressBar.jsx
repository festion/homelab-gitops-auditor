import React from 'react';
import PropTypes from 'prop-types';

const ProgressBar = ({ 
  progress, 
  total = 100, 
  showPercentage = true, 
  showNumbers = false,
  height = 'medium',
  color = 'blue',
  animated = true,
  className = ''
}) => {
  const percentage = Math.min(Math.round((progress / total) * 100), 100);
  
  const heightConfigs = {
    small: 'h-2',
    medium: 'h-4',
    large: 'h-6'
  };

  const colorConfigs = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    indigo: 'bg-indigo-500'
  };

  const heightClass = heightConfigs[height] || heightConfigs.medium;
  const colorClass = colorConfigs[color] || colorConfigs.blue;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1">
        {showNumbers && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {progress} / {total}
          </span>
        )}
        {showPercentage && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {percentage}%
          </span>
        )}
      </div>
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${heightClass} overflow-hidden`}>
        <div 
          className={`${colorClass} ${heightClass} rounded-full transition-all duration-300 ease-out ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax={total}
        >
          {height === 'large' && (
            <span className="flex items-center justify-center h-full text-xs font-medium text-white">
              {percentage}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

ProgressBar.propTypes = {
  progress: PropTypes.number.isRequired,
  total: PropTypes.number,
  showPercentage: PropTypes.bool,
  showNumbers: PropTypes.bool,
  height: PropTypes.oneOf(['small', 'medium', 'large']),
  color: PropTypes.oneOf(['blue', 'green', 'yellow', 'red', 'purple', 'indigo']),
  animated: PropTypes.bool,
  className: PropTypes.string
};

export default ProgressBar;
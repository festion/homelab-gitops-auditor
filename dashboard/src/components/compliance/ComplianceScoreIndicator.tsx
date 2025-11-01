import React from 'react';

interface ComplianceScoreProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export const ComplianceScoreIndicator: React.FC<ComplianceScoreProps> = ({ 
  score, 
  size = 'medium', 
  showLabel = true 
}) => {
  const getColor = (score: number) => {
    if (score >= 90) return 'text-green-600 border-green-600';
    if (score >= 70) return 'text-yellow-600 border-yellow-600';
    return 'text-red-600 border-red-600';
  };

  const sizeClasses = {
    small: 'w-12 h-12 text-sm',
    medium: 'w-16 h-16 text-base',
    large: 'w-20 h-20 text-lg'
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`
        ${sizeClasses[size]} 
        ${getColor(score)}
        border-4 rounded-full flex items-center justify-center font-bold
      `}>
        {score}%
      </div>
      {showLabel && (
        <span className="text-sm text-gray-600 mt-1">Compliance Score</span>
      )}
    </div>
  );
};
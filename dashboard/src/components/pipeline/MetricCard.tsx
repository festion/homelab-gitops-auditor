import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  changeIcon?: React.ReactNode;
  negative?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'text-gray-600',
  changeIcon,
  negative = false
}) => {
  const getChangeColor = () => {
    if (change === undefined || change === 0) return 'text-gray-500';
    if (negative) {
      return change > 0 ? 'text-red-600' : 'text-green-600';
    }
    return change > 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {change !== undefined && changeLabel && (
        <div className={`flex items-center mt-2 text-sm ${getChangeColor()}`}>
          {changeIcon}
          <span className="ml-1">{changeLabel}</span>
        </div>
      )}
    </div>
  );
};
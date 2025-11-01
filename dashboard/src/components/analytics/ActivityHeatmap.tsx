import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, BarChart3, Activity, RefreshCw } from 'lucide-react';

interface ActivityData {
  repository: string;
  hour: number;
  day: number; // 0 = Sunday, 6 = Saturday
  commits: number;
  pullRequests: number;
  issues: number;
  date: string;
}

interface HeatmapCell {
  hour: number;
  day: number;
  value: number;
  date: string;
  details: {
    commits: number;
    pullRequests: number;
    issues: number;
    repositories: string[];
  };
}

type ActivityMetric = 'commits' | 'pullRequests' | 'issues' | 'total';

const fetchActivityData = async (weeks: number = 4): Promise<ActivityData[]> => {
  const response = await fetch(`/api/v2/metrics/activity?weeks=${weeks}`);
  if (!response.ok) {
    throw new Error('Failed to fetch activity data');
  }
  
  const data = await response.json();
  return data.activity || [];
};

const processActivityData = (activity: ActivityData[], metric: ActivityMetric): HeatmapCell[] => {
  const cellMap = new Map<string, HeatmapCell>();
  
  // Initialize all cells
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`;
      cellMap.set(key, {
        hour,
        day,
        value: 0,
        date: '',
        details: {
          commits: 0,
          pullRequests: 0,
          issues: 0,
          repositories: []
        }
      });
    }
  }
  
  // Aggregate activity data
  activity.forEach(item => {
    const key = `${item.day}-${item.hour}`;
    const cell = cellMap.get(key);
    if (cell) {
      cell.details.commits += item.commits;
      cell.details.pullRequests += item.pullRequests;
      cell.details.issues += item.issues;
      
      if (!cell.details.repositories.includes(item.repository)) {
        cell.details.repositories.push(item.repository);
      }
      
      // Calculate value based on selected metric
      switch (metric) {
        case 'commits':
          cell.value = cell.details.commits;
          break;
        case 'pullRequests':
          cell.value = cell.details.pullRequests;
          break;
        case 'issues':
          cell.value = cell.details.issues;
          break;
        case 'total':
          cell.value = cell.details.commits + cell.details.pullRequests + cell.details.issues;
          break;
      }
    }
  });
  
  return Array.from(cellMap.values());
};

const getIntensityColor = (value: number, maxValue: number): string => {
  if (value === 0) return '#f3f4f6'; // gray-100
  
  const intensity = value / maxValue;
  if (intensity <= 0.25) return '#dcfce7'; // green-100
  if (intensity <= 0.5) return '#bbf7d0';  // green-200
  if (intensity <= 0.75) return '#86efac'; // green-300
  return '#22c55e'; // green-500
};

const ActivityHeatmapSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
    <div className="flex justify-between items-center mb-4">
      <div className="h-6 bg-gray-200 rounded w-48"></div>
      <div className="h-8 bg-gray-200 rounded w-32"></div>
    </div>
    <div className="space-y-2">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex space-x-1">
          <div className="w-12 h-6 bg-gray-200 rounded"></div>
          {Array.from({ length: 24 }, (_, j) => (
            <div key={j} className="w-8 h-6 bg-gray-200 rounded"></div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const ActivityHeatmap: React.FC = () => {
  const [selectedMetric, setSelectedMetric] = useState<ActivityMetric>('total');
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [weeks, setWeeks] = useState(4);

  const { data: activity, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics', 'activity', weeks],
    queryFn: () => fetchActivityData(weeks),
    refetchInterval: 600000, // 10 minutes
  });

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <Activity size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Activity Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <ActivityHeatmapSkeleton />;
  }

  const processedData = activity ? processActivityData(activity, selectedMetric) : [];
  const maxValue = Math.max(...processedData.map(cell => cell.value), 1);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const metricLabels = {
    total: 'Total Activity',
    commits: 'Commits',
    pullRequests: 'Pull Requests',
    issues: 'Issues'
  };

  const totalActivity = processedData.reduce((sum, cell) => sum + cell.value, 0);
  const peakHour = processedData.reduce((peak, cell) => 
    cell.value > peak.value ? cell : peak, { value: 0, hour: 0, day: 0 }
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <h3 className="text-xl font-semibold">Repository Activity Patterns</h3>
          <button
            onClick={() => refetch()}
            className="p-1 text-gray-500 hover:text-gray-700"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          {/* Weeks selector */}
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={2}>2 weeks</option>
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>

          {/* Metric selector */}
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as ActivityMetric)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {Object.entries(metricLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{totalActivity}</p>
          <p className="text-sm text-gray-600">Total {metricLabels[selectedMetric]}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{maxValue}</p>
          <p className="text-sm text-gray-600">Peak Activity</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">
            {days[peakHour.day]} {peakHour.hour}:00
          </p>
          <p className="text-sm text-gray-600">Most Active Time</p>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour labels */}
          <div className="flex">
            <div className="w-16"></div> {/* Space for day labels */}
            {hours.map(hour => (
              <div key={hour} className="w-8 text-xs text-center text-gray-600 mb-2">
                {hour % 4 === 0 ? hour : ''}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="space-y-1">
            {days.map((day, dayIndex) => (
              <div key={day} className="flex items-center">
                <div className="w-16 text-sm text-gray-600 pr-2">{day}</div>
                <div className="flex space-x-1">
                  {hours.map(hour => {
                    const cell = processedData.find(
                      c => c.day === dayIndex && c.hour === hour
                    );
                    const value = cell?.value || 0;
                    
                    return (
                      <div
                        key={`${day}-${hour}`}
                        className="w-8 h-8 border border-gray-200 rounded cursor-pointer transition-all hover:border-gray-400"
                        style={{
                          backgroundColor: getIntensityColor(value, maxValue)
                        }}
                        onMouseEnter={() => setHoveredCell(cell || null)}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${day} ${hour}:00 - ${value} ${selectedMetric}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Less</span>
              <div className="flex space-x-1">
                {[0, 25, 50, 75, 100].map(percent => (
                  <div
                    key={percent}
                    className="w-4 h-4 border border-gray-200 rounded"
                    style={{
                      backgroundColor: getIntensityColor(
                        (percent / 100) * maxValue,
                        maxValue
                      )
                    }}
                  />
                ))}
              </div>
              <span className="text-sm text-gray-600">More</span>
            </div>
            
            <div className="text-sm text-gray-600">
              Past {weeks} weeks
            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredCell && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="font-medium text-blue-900">
            {days[hoveredCell.day]} {hoveredCell.hour}:00 - {hoveredCell.hour + 1}:00
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Commits:</span>
              <span className="font-medium">{hoveredCell.details.commits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Pull Requests:</span>
              <span className="font-medium">{hoveredCell.details.pullRequests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Issues:</span>
              <span className="font-medium">{hoveredCell.details.issues}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active Repos:</span>
              <span className="font-medium">{hoveredCell.details.repositories.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
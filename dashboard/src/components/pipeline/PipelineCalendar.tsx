import React, { useMemo } from 'react';
import { ScheduledPipeline } from './PipelineScheduler';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PipelineCalendarProps {
  schedules: ScheduledPipeline[];
}

export const PipelineCalendar: React.FC<PipelineCalendarProps> = ({ schedules }) => {
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate which days have scheduled runs
  const scheduledDays = useMemo(() => {
    const dayMap = new Map<string, ScheduledPipeline[]>();
    
    schedules.forEach(schedule => {
      if (schedule.enabled && schedule.nextRun) {
        const runDate = parseISO(schedule.nextRun);
        const dayKey = format(runDate, 'yyyy-MM-dd');
        
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, []);
        }
        dayMap.get(dayKey)!.push(schedule);
      }
    });

    return dayMap;
  }, [schedules]);

  const previousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Calculate the first day of the week to start the calendar
  const firstDayOfWeek = monthStart.getDay();
  const emptyDays = Array(firstDayOfWeek).fill(null);

  return (
    <div className="w-full">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={previousMonth}
          className="p-2 hover:bg-gray-100 rounded"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold">
            {format(currentDate, 'MMMM yyyy')}
          </h3>
          <button
            onClick={goToToday}
            className="text-sm text-blue-600 hover:underline"
          >
            Today
          </button>
        </div>
        
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-gray-100 rounded"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month starts */}
        {emptyDays.map((_, index) => (
          <div key={`empty-${index}`} className="h-20" />
        ))}

        {/* Days of the month */}
        {days.map(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const daySchedules = scheduledDays.get(dayKey) || [];
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={dayKey}
              className={`
                h-20 p-2 border rounded-lg
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
                ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
              `}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-medium ${
                  isToday ? 'text-blue-600' : 'text-gray-900'
                }`}>
                  {format(day, 'd')}
                </span>
                {daySchedules.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {daySchedules.length}
                  </span>
                )}
              </div>
              
              {/* Show up to 2 schedules */}
              <div className="space-y-1">
                {daySchedules.slice(0, 2).map((schedule, index) => (
                  <div
                    key={index}
                    className="text-xs truncate text-gray-600"
                    title={`${schedule.workflowName} - ${schedule.repository}`}
                  >
                    {format(parseISO(schedule.nextRun), 'HH:mm')} - {schedule.workflowName}
                  </div>
                ))}
                {daySchedules.length > 2 && (
                  <div className="text-xs text-gray-500">
                    +{daySchedules.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar legend */}
      <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-blue-500 rounded"></div>
          <span>Today</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-100 rounded"></div>
          <span>Scheduled runs</span>
        </div>
      </div>
    </div>
  );
};
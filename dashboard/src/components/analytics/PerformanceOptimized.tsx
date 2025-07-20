import React, { memo, useMemo, useCallback } from 'react';
import { ResponsiveContainer } from 'recharts';

// HOC for performance optimization
export const withPerformanceOptimization = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  displayName?: string
) => {
  const OptimizedComponent = memo((props: P) => {
    return <WrappedComponent {...props} />;
  });

  OptimizedComponent.displayName = displayName || `withPerformanceOptimization(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return OptimizedComponent;
};

// Virtualized container for large datasets
interface VirtualizedContainerProps {
  data: any[];
  itemHeight: number;
  renderItem: (item: any, index: number) => React.ReactNode;
  className?: string;
}

export const VirtualizedContainer: React.FC<VirtualizedContainerProps> = memo(({
  data,
  itemHeight,
  renderItem,
  className = ''
}) => {
  const [startIndex, setStartIndex] = React.useState(0);
  const [endIndex, setEndIndex] = React.useState(10);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const containerHeight = containerRef.current.clientHeight;
    
    const newStartIndex = Math.floor(scrollTop / itemHeight);
    const newEndIndex = Math.min(
      data.length - 1,
      newStartIndex + Math.ceil(containerHeight / itemHeight) + 2
    );
    
    setStartIndex(newStartIndex);
    setEndIndex(newEndIndex);
  }, [data.length, itemHeight]);

  const visibleItems = useMemo(() => {
    return data.slice(startIndex, endIndex + 1);
  }, [data, startIndex, endIndex]);

  const totalHeight = data.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onScroll={handleScroll}
      style={{ height: '400px' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => 
            renderItem(item, startIndex + index)
          )}
        </div>
      </div>
    </div>
  );
});

VirtualizedContainer.displayName = 'VirtualizedContainer';

// Debounced input for performance
interface DebouncedInputProps {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
  placeholder?: string;
  className?: string;
}

export const DebouncedInput: React.FC<DebouncedInputProps> = memo(({
  value,
  onChange,
  delay = 300,
  placeholder,
  className = ''
}) => {
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, delay);
  }, [onChange, delay]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
});

DebouncedInput.displayName = 'DebouncedInput';

// Chart wrapper with animation controls
interface AnimatedChartWrapperProps {
  children: React.ReactNode;
  isVisible?: boolean;
  animationDuration?: number;
  className?: string;
}

export const AnimatedChartWrapper: React.FC<AnimatedChartWrapperProps> = memo(({
  children,
  isVisible = true,
  animationDuration = 750,
  className = ''
}) => {
  const [shouldRender, setShouldRender] = React.useState(isVisible);

  React.useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), animationDuration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, animationDuration]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div 
      className={`transition-all duration-${animationDuration} ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      } ${className}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
});

AnimatedChartWrapper.displayName = 'AnimatedChartWrapper';

// Intersection Observer hook for lazy loading
export const useIntersectionObserver = (
  elementRef: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = React.useState(false);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting),
      { threshold: 0.1, ...options }
    );

    observer.observe(element);

    return () => observer.unobserve(element);
  }, [elementRef, options]);

  return isIntersecting;
};

// Lazy loaded chart component
interface LazyChartProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

export const LazyChart: React.FC<LazyChartProps> = memo(({
  children,
  fallback = <div className="animate-pulse bg-gray-200 h-64 rounded" />,
  className = ''
}) => {
  const elementRef = React.useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(elementRef, { rootMargin: '50px' });
  const [hasLoaded, setHasLoaded] = React.useState(false);

  React.useEffect(() => {
    if (isVisible && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [isVisible, hasLoaded]);

  return (
    <div ref={elementRef} className={className}>
      {hasLoaded ? children : fallback}
    </div>
  );
});

LazyChart.displayName = 'LazyChart';

// Data sampling for large datasets
export const useSampledData = <T extends any>(
  data: T[],
  maxPoints: number = 1000
) => {
  return useMemo(() => {
    if (data.length <= maxPoints) {
      return data;
    }
    
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, index) => index % step === 0);
  }, [data, maxPoints]);
};

// Custom hook for chart animations
export const useChartAnimation = (isVisible: boolean, duration: number = 1000) => {
  const [animationProgress, setAnimationProgress] = React.useState(0);

  React.useEffect(() => {
    if (!isVisible) {
      setAnimationProgress(0);
      return;
    }

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(easedProgress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, duration]);

  return animationProgress;
};
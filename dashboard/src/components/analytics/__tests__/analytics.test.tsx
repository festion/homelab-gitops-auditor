import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import { RepositoryHealthTimeline } from '../RepositoryHealthTimeline';
import { ActivityHeatmap } from '../ActivityHeatmap';
import { RepositoryComparisonRadar } from '../RepositoryComparisonRadar';
import { PredictiveInsights } from '../PredictiveInsights';
import { MetricsExport } from '../MetricsExport';

// Mock fetch globally
global.fetch = jest.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock data
const mockHealthData = [
  {
    timestamp: '2024-01-01T00:00:00Z',
    clean: 15,
    dirty: 5,
    missing: 2,
    extra: 1,
    totalIssues: 8,
    totalRepos: 23
  },
  {
    timestamp: '2024-01-02T00:00:00Z',
    clean: 16,
    dirty: 4,
    missing: 2,
    extra: 1,
    totalIssues: 7,
    totalRepos: 23
  }
];

const mockActivityData = [
  {
    repository: 'repo1',
    hour: 9,
    day: 1,
    commits: 5,
    pullRequests: 2,
    issues: 1,
    date: '2024-01-01'
  },
  {
    repository: 'repo2',
    hour: 14,
    day: 2,
    commits: 3,
    pullRequests: 1,
    issues: 0,
    date: '2024-01-01'
  }
];

const mockRepositoryMetrics = [
  {
    repository: 'repo1',
    codeQuality: 85,
    testCoverage: 75,
    documentation: 60,
    security: 90,
    performance: 80,
    compliance: 70,
    maintainability: 85,
    reliability: 88,
    lastUpdated: '2024-01-01T00:00:00Z'
  },
  {
    repository: 'repo2',
    codeQuality: 78,
    testCoverage: 82,
    documentation: 55,
    security: 85,
    performance: 75,
    compliance: 80,
    maintainability: 80,
    reliability: 82,
    lastUpdated: '2024-01-01T00:00:00Z'
  }
];

const mockPredictions = {
  healthScore: {
    current: 85,
    predicted: 88,
    trend: 'improving' as const,
    confidence: 80
  },
  riskAnalysis: {
    highRiskRepos: [
      {
        name: 'risky-repo',
        riskScore: 75,
        riskFactors: ['Low test coverage', 'High complexity'],
        timeToIssue: 7
      }
    ],
    totalRisk: 25
  },
  growthForecast: {
    currentRepos: 23,
    predictedRepos: 28,
    growthRate: 22,
    timeframe: 30
  },
  complianceForecast: {
    currentRate: 70,
    targetRate: 90,
    estimatedDays: 45,
    confidence: 75,
    blockers: ['Missing templates', 'Manual processes']
  },
  recommendations: [
    {
      type: 'urgent' as const,
      title: 'Increase test coverage',
      description: 'Several repositories have low test coverage',
      impact: 'high' as const,
      effort: 'medium' as const,
      timeframe: '2 weeks'
    }
  ],
  lastUpdated: '2024-01-01T12:00:00Z'
};

describe('RepositoryHealthTimeline', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ metrics: mockHealthData })
    });
  });

  it('renders health timeline chart', async () => {
    render(<RepositoryHealthTimeline />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Repository Health Trends')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Clean')).toBeInTheDocument();
      expect(screen.getByText('Dirty')).toBeInTheDocument();
    });
  });

  it('handles time range selection', async () => {
    render(<RepositoryHealthTimeline />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('30d')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('7d'));
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('handles chart type toggle', async () => {
    render(<RepositoryHealthTimeline />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Line')).toBeInTheDocument();
      expect(screen.getByText('Area')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Area'));
    
    // Chart type should change (visual test would verify chart rendering)
    expect(screen.getByText('Area')).toHaveClass('bg-white');
  });
});

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ activity: mockActivityData })
    });
  });

  it('renders activity heatmap', async () => {
    render(<ActivityHeatmap />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Repository Activity Patterns')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Total Activity')).toBeInTheDocument();
    });
  });

  it('handles metric selection', async () => {
    render(<ActivityHeatmap />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      const select = screen.getByDisplayValue('Total Activity');
      expect(select).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Total Activity');
    fireEvent.change(select, { target: { value: 'commits' } });
    
    expect(select).toHaveValue('commits');
  });

  it('shows correct day labels', async () => {
    render(<ActivityHeatmap />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText('Tue')).toBeInTheDocument();
      expect(screen.getByText('Wed')).toBeInTheDocument();
    });
  });
});

describe('RepositoryComparisonRadar', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ repositories: mockRepositoryMetrics })
    });
  });

  it('renders comparison radar chart', async () => {
    render(<RepositoryComparisonRadar />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Repository Comparison')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('repo1')).toBeInTheDocument();
      expect(screen.getByText('repo2')).toBeInTheDocument();
    });
  });

  it('allows repository selection', async () => {
    render(<RepositoryComparisonRadar />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      const addButton = screen.getAllByText('repo1')[0];
      expect(addButton).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('repo1')[0]);
    
    await waitFor(() => {
      expect(screen.getByText('1/5 repositories selected')).toBeInTheDocument();
    });
  });

  it('handles metric selection', async () => {
    render(<RepositoryComparisonRadar />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      const codeQualityCheckbox = screen.getByLabelText(/Code Quality/i);
      expect(codeQualityCheckbox).toBeChecked();
    });

    const securityCheckbox = screen.getByLabelText(/Security/i);
    fireEvent.click(securityCheckbox);
    
    expect(securityCheckbox).not.toBeChecked();
  });
});

describe('PredictiveInsights', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ predictions: mockPredictions })
    });
  });

  it('renders predictive insights', async () => {
    render(<PredictiveInsights />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Predictive Insights')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Health Score Forecast')).toBeInTheDocument();
      expect(screen.getByText('Risk Analysis')).toBeInTheDocument();
    });
  });

  it('displays current and predicted scores', async () => {
    render(<PredictiveInsights />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('88%')).toBeInTheDocument();
    });
  });

  it('shows high-risk repositories', async () => {
    render(<PredictiveInsights />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('risky-repo')).toBeInTheDocument();
      expect(screen.getByText('Low test coverage')).toBeInTheDocument();
    });
  });

  it('displays recommendations', async () => {
    render(<PredictiveInsights />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Increase test coverage')).toBeInTheDocument();
    });
  });
});

describe('MetricsExport', () => {
  it('renders export options', () => {
    render(<MetricsExport />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Export Metrics')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('XLSX')).toBeInTheDocument();
  });

  it('handles format selection', () => {
    render(<MetricsExport />, { wrapper: createWrapper() });
    
    const csvButton = screen.getByText('CSV');
    fireEvent.click(csvButton);
    
    // Should trigger export (would be verified by monitoring fetch calls)
    expect(csvButton).toBeInTheDocument();
  });

  it('shows advanced options', () => {
    render(<MetricsExport />, { wrapper: createWrapper() });
    
    const advancedButton = screen.getByText('Advanced Options');
    fireEvent.click(advancedButton);
    
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByText('Include Metrics')).toBeInTheDocument();
  });
});

describe('Error Handling', () => {
  it('handles fetch errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    render(<RepositoryHealthTimeline />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Error Loading Health Data')).toBeInTheDocument();
    });
  });

  it('handles empty data gracefully', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ repositories: [] })
    });
    
    render(<RepositoryComparisonRadar />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('No Repository Data')).toBeInTheDocument();
    });
  });
});

describe('Responsive Design', () => {
  it('adapts to mobile viewport', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(<ActivityHeatmap />, { wrapper: createWrapper() });
    
    // Mobile-specific elements should be present
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('works with tablet viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    render(<PredictiveInsights />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Predictive Insights')).toBeInTheDocument();
  });
});
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Brain, TrendingUp, TrendingDown, AlertTriangle, Clock, 
  Target, Zap, Shield, ArrowRight, RefreshCw, Info 
} from 'lucide-react';

interface PredictionData {
  healthScore: {
    current: number;
    predicted: number;
    trend: 'improving' | 'stable' | 'declining';
    confidence: number;
  };
  riskAnalysis: {
    highRiskRepos: Array<{
      name: string;
      riskScore: number;
      riskFactors: string[];
      timeToIssue: number; // days
    }>;
    totalRisk: number;
  };
  growthForecast: {
    currentRepos: number;
    predictedRepos: number;
    growthRate: number;
    timeframe: number; // days
  };
  complianceForecast: {
    currentRate: number;
    targetRate: number;
    estimatedDays: number;
    confidence: number;
    blockers: string[];
  };
  recommendations: Array<{
    type: 'urgent' | 'important' | 'optimization';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    timeframe: string;
  }>;
  lastUpdated: string;
}

const fetchPredictions = async (): Promise<PredictionData> => {
  const response = await fetch('/api/v2/analytics/predictions');
  if (!response.ok) {
    throw new Error('Failed to fetch predictions');
  }
  
  const data = await response.json();
  return data.predictions;
};

const PredictiveInsightsSkeleton: React.FC = () => (
  <div className="space-y-6">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-6 h-6 bg-gray-200 rounded"></div>
          <div className="h-5 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    ))}
  </div>
);

const RiskScoreBar: React.FC<{ score: number; max?: number }> = ({ score, max = 100 }) => {
  const percentage = (score / max) * 100;
  const getColor = () => {
    if (percentage <= 30) return 'bg-green-500';
    if (percentage <= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div 
        className={`h-2 rounded-full transition-all ${getColor()}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const ConfidenceIndicator: React.FC<{ confidence: number }> = ({ confidence }) => {
  const getColor = () => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLabel = () => {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Medium';
    return 'Low';
  };

  return (
    <div className={`flex items-center space-x-1 ${getColor()}`}>
      <Info size={14} />
      <span className="text-sm font-medium">
        {getLabel()} confidence ({confidence}%)
      </span>
    </div>
  );
};

export const PredictiveInsights: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);

  const { data: predictions, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics', 'predictions'],
    queryFn: fetchPredictions,
    refetchInterval: 600000, // 10 minutes
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <Brain size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Predictions</h3>
          <p className="text-sm">AI predictions are temporarily unavailable</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <PredictiveInsightsSkeleton />;
  }

  if (!predictions) return null;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'declining': return <TrendingDown className="w-5 h-5 text-red-500" />;
      default: return <ArrowRight className="w-5 h-5 text-gray-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-purple-600" />
          <h3 className="text-xl font-semibold">Predictive Insights</h3>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            Updated: {new Date(predictions.lastUpdated).toLocaleString()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:text-gray-700 disabled:animate-spin"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Health Score Prediction */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 mb-4">
          {getTrendIcon(predictions.healthScore.trend)}
          <h4 className="text-lg font-semibold">Health Score Forecast</h4>
          <ConfidenceIndicator confidence={predictions.healthScore.confidence} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">{predictions.healthScore.current}%</p>
            <p className="text-sm text-gray-600">Current Score</p>
          </div>
          <div className="text-center">
            <p className={`text-3xl font-bold ${
              predictions.healthScore.predicted > predictions.healthScore.current 
                ? 'text-green-600' : 'text-red-600'
            }`}>
              {predictions.healthScore.predicted}%
            </p>
            <p className="text-sm text-gray-600">Predicted (30 days)</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              predictions.healthScore.trend === 'improving' ? 'text-green-600' :
              predictions.healthScore.trend === 'declining' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {predictions.healthScore.trend === 'improving' ? '+' : predictions.healthScore.trend === 'declining' ? '-' : ''}
              {Math.abs(predictions.healthScore.predicted - predictions.healthScore.current)}%
            </p>
            <p className="text-sm text-gray-600 capitalize">{predictions.healthScore.trend}</p>
          </div>
        </div>
      </div>

      {/* Risk Analysis */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h4 className="text-lg font-semibold">Risk Analysis</h4>
        </div>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Risk Level</span>
            <span className="text-lg font-bold text-red-600">{predictions.riskAnalysis.totalRisk}%</span>
          </div>
          <RiskScoreBar score={predictions.riskAnalysis.totalRisk} />
        </div>

        {predictions.riskAnalysis.highRiskRepos.length > 0 && (
          <div>
            <h5 className="font-medium text-gray-700 mb-3">
              High-Risk Repositories ({predictions.riskAnalysis.highRiskRepos.length})
            </h5>
            <div className="space-y-3">
              {predictions.riskAnalysis.highRiskRepos.slice(0, 5).map((repo, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{repo.name}</p>
                      <p className="text-sm text-gray-600">
                        Risk score: {repo.riskScore}% • 
                        Estimated issue in {repo.timeToIssue} days
                      </p>
                    </div>
                    <Clock className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {repo.riskFactors.map((factor, factorIndex) => (
                      <span
                        key={factorIndex}
                        className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Growth Forecast */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Target className="w-5 h-5 text-blue-500" />
          <h4 className="text-lg font-semibold">Growth Forecast</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{predictions.growthForecast.currentRepos}</p>
            <p className="text-sm text-gray-600">Current Repos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{predictions.growthForecast.predictedRepos}</p>
            <p className="text-sm text-gray-600">Predicted ({predictions.growthForecast.timeframe} days)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">+{predictions.growthForecast.growthRate}%</p>
            <p className="text-sm text-gray-600">Growth Rate</p>
          </div>
        </div>
      </div>

      {/* Compliance Forecast */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-5 h-5 text-green-500" />
          <h4 className="text-lg font-semibold">Compliance Forecast</h4>
          <ConfidenceIndicator confidence={predictions.complianceForecast.confidence} />
        </div>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress to Target</span>
            <span className="text-sm text-gray-600">
              {predictions.complianceForecast.currentRate}% → {predictions.complianceForecast.targetRate}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-green-500 h-3 rounded-full"
              style={{ width: `${(predictions.complianceForecast.currentRate / predictions.complianceForecast.targetRate) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Estimated completion</p>
            <p className="text-lg font-bold text-green-600">
              {predictions.complianceForecast.estimatedDays} days
            </p>
          </div>
          {predictions.complianceForecast.blockers.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Potential blockers</p>
              <div className="flex flex-wrap gap-1">
                {predictions.complianceForecast.blockers.map((blocker, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
                  >
                    {blocker}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h4 className="text-lg font-semibold">AI Recommendations</h4>
        </div>
        
        <div className="space-y-4">
          {predictions.recommendations.map((rec, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h5 className="font-medium text-gray-900">{rec.title}</h5>
                    <span className={`px-2 py-1 rounded-full text-xs border ${getImpactColor(rec.impact)}`}>
                      {rec.impact} impact
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className={getEffortColor(rec.effort)}>
                      {rec.effort} effort
                    </span>
                    <span>{rec.timeframe}</span>
                  </div>
                </div>
                <div className={`p-2 rounded ${
                  rec.type === 'urgent' ? 'bg-red-100' :
                  rec.type === 'important' ? 'bg-yellow-100' : 'bg-blue-100'
                }`}>
                  {rec.type === 'urgent' ? (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  ) : rec.type === 'important' ? (
                    <Clock className="w-4 h-4 text-yellow-600" />
                  ) : (
                    <Target className="w-4 h-4 text-blue-600" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
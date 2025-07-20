/**
 * Test Node Component for Pipeline Designer
 * Represents a test execution step
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { TestTube, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface TestNodeData {
  label: string;
  testCommand: string;
  framework: 'jest' | 'mocha' | 'pytest' | 'junit' | 'phpunit' | 'rspec' | 'go-test' | 'custom';
  testPattern?: string;
  coverage?: boolean;
  coverageThreshold?: number;
  parallel?: boolean;
  timeout?: number;
  workingDirectory?: string;
  environment?: Record<string, string>;
  status?: 'idle' | 'running' | 'success' | 'failed' | 'timeout';
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage?: number;
  };
}

export const TestNode: React.FC<NodeProps<TestNodeData>> = ({ data, selected }) => {
  const getStatusColor = () => {
    switch (data.status) {
      case 'running':
        return '#3b82f6'; // blue
      case 'success':
        return '#10b981'; // green
      case 'failed':
        return '#ef4444'; // red
      case 'timeout':
        return '#f59e0b'; // amber
      default:
        return '#8b5cf6'; // purple (default for tests)
    }
  };

  const getStatusIcon = () => {
    switch (data.status) {
      case 'running':
        return <Clock className="w-3 h-3" />;
      case 'success':
        return <CheckCircle className="w-3 h-3" />;
      case 'failed':
        return <XCircle className="w-3 h-3" />;
      case 'timeout':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return <TestTube className="w-3 h-3" />;
    }
  };

  const getFrameworkColor = () => {
    switch (data.framework) {
      case 'jest':
        return '#c53030';
      case 'mocha':
        return '#8d4004';
      case 'pytest':
        return '#3776ab';
      case 'junit':
        return '#ed8936';
      case 'phpunit':
        return '#4f46e5';
      case 'rspec':
        return '#dc2626';
      case 'go-test':
        return '#00add8';
      default:
        return '#6b7280';
    }
  };

  const getFrameworkIcon = () => {
    switch (data.framework) {
      case 'jest':
        return '🃏';
      case 'mocha':
        return '☕';
      case 'pytest':
        return '🐍';
      case 'junit':
        return '☕';
      case 'phpunit':
        return '🐘';
      case 'rspec':
        return '💎';
      case 'go-test':
        return '🐹';
      default:
        return '🧪';
    }
  };

  const formatCommand = (cmd: string) => {
    if (cmd.length > 30) {
      return cmd.substring(0, 30) + '...';
    }
    return cmd;
  };

  const getSuccessRate = () => {
    if (!data.testResults) return null;
    const { total, passed } = data.testResults;
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  };

  return (
    <div
      className={`pipeline-node test-node ${selected ? 'selected' : ''}`}
      style={{
        background: '#ffffff',
        border: `2px solid ${selected ? '#3b82f6' : getStatusColor()}`,
        borderRadius: '8px',
        padding: '12px',
        minWidth: '200px',
        boxShadow: selected ? '0 4px 12px rgba(59, 130, 246, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Header */}
      <div className="node-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <div
          className="node-icon"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            backgroundColor: getStatusColor(),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '8px',
          }}
        >
          {getStatusIcon()}
        </div>
        <div style={{ flex: 1 }}>
          <div className="node-title" style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
            {data.label}
          </div>
        </div>
        <div
          className="framework-badge"
          style={{
            backgroundColor: getFrameworkColor(),
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{getFrameworkIcon()}</span>
          {data.framework}
        </div>
      </div>

      {/* Command Preview */}
      <div className="node-content" style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
        <div
          className="command-preview"
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '6px 8px',
            fontFamily: 'Monaco, Consolas, monospace',
            fontSize: '11px',
            marginBottom: '6px',
          }}
        >
          {formatCommand(data.testCommand)}
        </div>

        {/* Test Results */}
        {data.testResults && (
          <div
            className="test-results"
            style={{
              backgroundColor: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '6px 8px',
              marginBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontWeight: '600', fontSize: '11px' }}>Results</span>
              <span style={{ fontSize: '11px', color: (getSuccessRate() ?? 0) >= 90 ? '#10b981' : '#ef4444' }}>
                {getSuccessRate() ?? 0}% passed
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
              <span style={{ color: '#10b981' }}>✓ {data.testResults.passed}</span>
              <span style={{ color: '#ef4444' }}>✗ {data.testResults.failed}</span>
              <span style={{ color: '#6b7280' }}>⊘ {data.testResults.skipped}</span>
            </div>
            {data.testResults.coverage !== undefined && (
              <div style={{ marginTop: '4px', fontSize: '10px' }}>
                <strong>Coverage:</strong> {data.testResults.coverage}%
              </div>
            )}
          </div>
        )}

        {/* Test Info */}
        <div className="test-info" style={{ fontSize: '11px' }}>
          {data.testPattern && (
            <div style={{ marginBottom: '2px' }}>
              <strong>Pattern:</strong> {data.testPattern}
            </div>
          )}
          
          {data.workingDirectory && (
            <div style={{ marginBottom: '2px' }}>
              <strong>Dir:</strong> {data.workingDirectory}
            </div>
          )}
          
          {data.timeout && (
            <div style={{ marginBottom: '2px' }}>
              <strong>Timeout:</strong> {data.timeout}s
            </div>
          )}
          
          {Object.keys(data.environment || {}).length > 0 && (
            <div style={{ marginBottom: '2px' }}>
              <strong>Env vars:</strong> {Object.keys(data.environment || {}).length}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="node-options" style={{ fontSize: '10px', color: '#9ca3af' }}>
        {data.coverage && (
          <span
            className="option-tag"
            style={{
              backgroundColor: '#ecfccb',
              color: '#365314',
              padding: '2px 6px',
              borderRadius: '10px',
              marginRight: '4px',
            }}
          >
            📊 Coverage
            {data.coverageThreshold && `: ${data.coverageThreshold}%`}
          </span>
        )}
        
        {data.parallel && (
          <span
            className="option-tag"
            style={{
              backgroundColor: '#e0e7ff',
              color: '#3730a3',
              padding: '2px 6px',
              borderRadius: '10px',
              marginRight: '4px',
            }}
          >
            ⚡ Parallel
          </span>
        )}
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: getStatusColor(),
          border: '2px solid white',
          width: '12px',
          height: '12px',
        }}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: getStatusColor(),
          border: '2px solid white',
          width: '12px',
          height: '12px',
        }}
      />
    </div>
  );
};
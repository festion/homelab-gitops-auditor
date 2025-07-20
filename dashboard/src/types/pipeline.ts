/**
 * Pipeline Type Definitions
 */

export interface PipelineNode {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  config: any;
  dependencies: string[];
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface PipelineConfig {
  name: string;
  description?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  config?: {
    autoLayout?: boolean;
    showGrid?: boolean;
    showMiniMap?: boolean;
  };
}

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  issues?: ValidationIssue[];
}

// Pipeline Status Types
export interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  conclusion: string;
  duration: number;
  startedAt?: string;
  completedAt?: string;
}

export interface Pipeline {
  repository: string;
  branch: string;
  status: 'success' | 'failure' | 'pending' | 'running';
  lastRun: string;
  duration: number;
  workflowName: string;
  runId: number;
  conclusion: string;
  steps: PipelineStep[];
  url?: string;
  triggeredBy?: string;
  commit?: {
    sha: string;
    message: string;
    author: string;
  };
}

export interface TriggerParams {
  repository: string;
  branch?: string;
  workflowName?: string;
}
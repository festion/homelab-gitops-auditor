export interface DeploymentStatus {
  deploymentId: string;
  repository: string;
  branch: string;
  author?: string;
  state: 'idle' | 'queued' | 'in-progress' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  currentStage?: string;
  stages: DeploymentStage[];
  error?: string;
  progress?: number;
}

export interface DeploymentStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  duration?: number;
  output?: string;
  error?: string;
}

export interface DeploymentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;
  deploymentDuration?: number;
  testsRun?: number;
  testsPassed?: number;
  testsFailed?: number;
}

export interface DeploymentRequest {
  repository: string;
  branch: string;
  reason: string;
  createBackup?: boolean;
  skipHealthCheck?: boolean;
  triggeredBy: string;
}

export interface DeploymentResponse {
  success: boolean;
  deploymentId: string;
  error?: string;
}

export interface RollbackRequest {
  deploymentId: string;
  reason: string;
  targetVersion?: string;
}

export interface RollbackResponse {
  success: boolean;
  rollbackId: string;
  error?: string;
}

export interface DeploymentHistory {
  deployments: DeploymentHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface DeploymentHistoryItem {
  deploymentId: string;
  repository: string;
  branch: string;
  author: string;
  status: DeploymentStatus['state'];
  startTime: string;
  endTime?: string;
  duration?: number;
  reason: string;
  version?: string;
  rollbackId?: string;
  isRollback: boolean;
}

export interface DeploymentEvent {
  type: 'deployment_started' | 'deployment_progress' | 'deployment_completed' | 'deployment_failed' | 'health_check' | 'rollback_started' | 'rollback_completed';
  deploymentId: string;
  data: any;
  timestamp: string;
}

export interface DeploymentFilters {
  status?: DeploymentStatus['state'][];
  author?: string;
  repository?: string;
  branch?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface HealthMetrics {
  timestamp: string;
  services: ServiceHealth[];
  overall: OverallHealth;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  response_time: number;
  uptime: number;
  version?: string;
  lastCheck: string;
  details?: Record<string, any>;
}

export interface OverallHealth {
  status: 'healthy' | 'warning' | 'critical';
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: 'deployment' | 'rollback' | 'configuration' | 'access' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  user: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface DeploymentPermissions {
  canView: boolean;
  canDeploy: boolean;
  canRollback: boolean;
  canViewLogs: boolean;
  canManageSettings: boolean;
  repositories: string[];
}
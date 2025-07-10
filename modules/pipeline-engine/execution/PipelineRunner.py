#!/usr/bin/env python3
"""
Pipeline Runner - Core pipeline execution orchestration

Handles pipeline execution scheduling, coordination, and monitoring.
Manages the execution flow, parallel processing, and error handling.
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import json
from concurrent.futures import ThreadPoolExecutor

# Assume these are imported from the designer module
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from designer.PipelineBuilder import Pipeline, PipelineNode, NodeType


class ExecutionStatus(Enum):
    """Pipeline and node execution statuses"""
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


@dataclass
class NodeExecution:
    """Individual node execution state"""
    node_id: str
    node_name: str
    status: ExecutionStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration: Optional[float] = None  # seconds
    logs: List[str] = None
    outputs: Dict[str, Any] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    
    def __post_init__(self):
        if self.logs is None:
            self.logs = []
        if self.outputs is None:
            self.outputs = {}
    
    @property
    def is_running(self) -> bool:
        return self.status == ExecutionStatus.RUNNING
    
    @property
    def is_completed(self) -> bool:
        return self.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, 
                              ExecutionStatus.CANCELLED, ExecutionStatus.SKIPPED, ExecutionStatus.TIMEOUT]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            **asdict(self),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'status': self.status.value
        }


@dataclass
class PipelineExecution:
    """Complete pipeline execution state"""
    execution_id: str
    pipeline_id: str
    pipeline_name: str
    status: ExecutionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration: Optional[float] = None
    trigger: str = "manual"
    triggered_by: str = "system"
    node_executions: Dict[str, NodeExecution] = None
    execution_order: List[List[str]] = None  # Stages of parallel execution
    current_stage: int = 0
    total_stages: int = 0
    environment: Dict[str, str] = None
    error_message: Optional[str] = None
    cancelled_by: Optional[str] = None
    
    def __post_init__(self):
        if self.node_executions is None:
            self.node_executions = {}
        if self.execution_order is None:
            self.execution_order = []
        if self.environment is None:
            self.environment = {}
    
    @property
    def progress_percentage(self) -> float:
        if self.total_stages == 0:
            return 0.0
        return (self.current_stage / self.total_stages) * 100
    
    @property
    def completed_nodes(self) -> int:
        return sum(1 for exec in self.node_executions.values() if exec.is_completed)
    
    @property
    def total_nodes(self) -> int:
        return len(self.node_executions)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'execution_id': self.execution_id,
            'pipeline_id': self.pipeline_id,
            'pipeline_name': self.pipeline_name,
            'status': self.status.value,
            'started_at': self.started_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration': self.duration,
            'trigger': self.trigger,
            'triggered_by': self.triggered_by,
            'current_stage': self.current_stage,
            'total_stages': self.total_stages,
            'progress_percentage': self.progress_percentage,
            'completed_nodes': self.completed_nodes,
            'total_nodes': self.total_nodes,
            'node_executions': {k: v.to_dict() for k, v in self.node_executions.items()},
            'environment': self.environment,
            'error_message': self.error_message,
            'cancelled_by': self.cancelled_by
        }


class PipelineRunner:
    """Main pipeline execution orchestrator"""
    
    def __init__(self, max_concurrent_pipelines: int = 5, max_concurrent_nodes: int = 10):
        self.max_concurrent_pipelines = max_concurrent_pipelines
        self.max_concurrent_nodes = max_concurrent_nodes
        self.active_executions: Dict[str, PipelineExecution] = {}
        self.execution_queue: List[str] = []
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_nodes)
        self.logger = logging.getLogger(__name__)
        self._running = False
        self._stop_event = asyncio.Event()
        
        # Event callbacks
        self.on_execution_started = None
        self.on_execution_completed = None
        self.on_node_started = None
        self.on_node_completed = None
        self.on_execution_failed = None
        
    async def start(self):
        """Start the pipeline runner"""
        self._running = True
        self._stop_event.clear()
        self.logger.info("Pipeline runner started")
        
        # Start background tasks
        asyncio.create_task(self._execution_scheduler())
        asyncio.create_task(self._monitoring_loop())
    
    async def stop(self):
        """Stop the pipeline runner"""
        self._running = False
        self._stop_event.set()
        
        # Cancel all active executions
        for execution_id in list(self.active_executions.keys()):
            await self.cancel_execution(execution_id, "System shutdown")
        
        self.executor.shutdown(wait=True)
        self.logger.info("Pipeline runner stopped")
    
    async def execute_pipeline(self, pipeline: Pipeline, trigger: str = "manual", 
                             triggered_by: str = "system", 
                             environment: Dict[str, str] = None) -> str:
        """Queue a pipeline for execution"""
        execution_id = str(uuid.uuid4())
        
        # Create execution state
        execution = PipelineExecution(
            execution_id=execution_id,
            pipeline_id=pipeline.config.id,
            pipeline_name=pipeline.config.name,
            status=ExecutionStatus.QUEUED,
            started_at=datetime.now(),
            trigger=trigger,
            triggered_by=triggered_by,
            environment=environment or {}
        )
        
        # Initialize node executions
        for node in pipeline.nodes:
            execution.node_executions[node.id] = NodeExecution(
                node_id=node.id,
                node_name=node.name,
                status=ExecutionStatus.PENDING
            )
        
        # Calculate execution order
        execution.execution_order = self._calculate_execution_order(pipeline)
        execution.total_stages = len(execution.execution_order)
        
        # Store execution and queue it
        self.active_executions[execution_id] = execution
        self.execution_queue.append(execution_id)
        
        self.logger.info(f"Pipeline {pipeline.config.name} queued for execution (ID: {execution_id})")
        
        return execution_id
    
    async def cancel_execution(self, execution_id: str, cancelled_by: str = "system") -> bool:
        """Cancel a running or queued execution"""
        execution = self.active_executions.get(execution_id)
        if not execution:
            return False
        
        execution.status = ExecutionStatus.CANCELLED
        execution.cancelled_by = cancelled_by
        execution.completed_at = datetime.now()
        execution.duration = (execution.completed_at - execution.started_at).total_seconds()
        
        # Remove from queue if not started
        if execution_id in self.execution_queue:
            self.execution_queue.remove(execution_id)
        
        # Cancel running nodes
        for node_exec in execution.node_executions.values():
            if node_exec.status == ExecutionStatus.RUNNING:
                node_exec.status = ExecutionStatus.CANCELLED
                node_exec.completed_at = datetime.now()
        
        self.logger.info(f"Execution {execution_id} cancelled by {cancelled_by}")
        return True
    
    def get_execution_status(self, execution_id: str) -> Optional[Dict[str, Any]]:
        """Get current execution status"""
        execution = self.active_executions.get(execution_id)
        return execution.to_dict() if execution else None
    
    def list_active_executions(self) -> List[Dict[str, Any]]:
        """List all active executions"""
        return [exec.to_dict() for exec in self.active_executions.values()]
    
    async def _execution_scheduler(self):
        """Background task to schedule queued executions"""
        while self._running:
            try:
                # Check if we can start new executions
                running_count = sum(1 for exec in self.active_executions.values() 
                                  if exec.status == ExecutionStatus.RUNNING)
                
                if running_count < self.max_concurrent_pipelines and self.execution_queue:
                    execution_id = self.execution_queue.pop(0)
                    await self._start_execution(execution_id)
                
                await asyncio.sleep(1)  # Check every second
                
            except Exception as e:
                self.logger.error(f"Error in execution scheduler: {e}")
    
    async def _monitoring_loop(self):
        """Background task to monitor and cleanup completed executions"""
        while self._running:
            try:
                # Clean up old completed executions (older than 1 hour)
                cutoff_time = datetime.now() - timedelta(hours=1)
                to_remove = []
                
                for execution_id, execution in self.active_executions.items():
                    if (execution.is_completed and execution.completed_at and 
                        execution.completed_at < cutoff_time):
                        to_remove.append(execution_id)
                
                for execution_id in to_remove:
                    del self.active_executions[execution_id]
                    self.logger.debug(f"Cleaned up old execution: {execution_id}")
                
                await asyncio.sleep(60)  # Check every minute
                
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {e}")
    
    async def _start_execution(self, execution_id: str):
        """Start executing a pipeline"""
        execution = self.active_executions.get(execution_id)
        if not execution:
            return
        
        try:
            execution.status = ExecutionStatus.RUNNING
            execution.started_at = datetime.now()
            
            self.logger.info(f"Starting execution: {execution_id}")
            
            # Fire event
            if self.on_execution_started:
                await self._fire_event(self.on_execution_started, execution)
            
            # Load pipeline (would come from database/storage in real implementation)
            pipeline = await self._load_pipeline(execution.pipeline_id)
            if not pipeline:
                raise Exception(f"Pipeline {execution.pipeline_id} not found")
            
            # Execute stages sequentially
            for stage_index, node_ids in enumerate(execution.execution_order):
                execution.current_stage = stage_index
                
                self.logger.info(f"Executing stage {stage_index + 1}/{execution.total_stages} "
                               f"with {len(node_ids)} nodes")
                
                # Execute nodes in this stage in parallel
                await self._execute_stage(execution, pipeline, node_ids)
                
                # Check if execution was cancelled
                if execution.status == ExecutionStatus.CANCELLED:
                    return
                
                # Check if any node failed and should stop execution
                stage_failed = any(
                    execution.node_executions[node_id].status == ExecutionStatus.FAILED
                    for node_id in node_ids
                )
                
                if stage_failed:
                    # Check if any failed node should continue on error
                    pipeline_nodes = {n.id: n for n in pipeline.nodes}
                    continue_execution = any(
                        pipeline_nodes[node_id].continue_on_error 
                        for node_id in node_ids
                        if execution.node_executions[node_id].status == ExecutionStatus.FAILED
                    )
                    
                    if not continue_execution:
                        execution.status = ExecutionStatus.FAILED
                        execution.error_message = "Pipeline failed due to node failures"
                        break
            
            # Determine final status
            if execution.status == ExecutionStatus.RUNNING:
                execution.status = ExecutionStatus.COMPLETED
            
            execution.completed_at = datetime.now()
            execution.duration = (execution.completed_at - execution.started_at).total_seconds()
            
            self.logger.info(f"Execution {execution_id} completed with status: {execution.status.value}")
            
            # Fire completion event
            if execution.status == ExecutionStatus.COMPLETED and self.on_execution_completed:
                await self._fire_event(self.on_execution_completed, execution)
            elif execution.status == ExecutionStatus.FAILED and self.on_execution_failed:
                await self._fire_event(self.on_execution_failed, execution)
            
        except Exception as e:
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = datetime.now()
            execution.duration = (execution.completed_at - execution.started_at).total_seconds()
            
            self.logger.error(f"Execution {execution_id} failed: {e}")
            
            if self.on_execution_failed:
                await self._fire_event(self.on_execution_failed, execution)
    
    async def _execute_stage(self, execution: PipelineExecution, pipeline: Pipeline, node_ids: List[str]):
        """Execute a stage (parallel nodes)"""
        tasks = []
        
        for node_id in node_ids:
            node = next(n for n in pipeline.nodes if n.id == node_id)
            task = asyncio.create_task(self._execute_node(execution, node))
            tasks.append(task)
        
        # Wait for all nodes in stage to complete
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _execute_node(self, execution: PipelineExecution, node: PipelineNode):
        """Execute a single node"""
        node_exec = execution.node_executions[node.id]
        
        try:
            # Check dependencies
            if not self._are_dependencies_satisfied(execution, node):
                node_exec.status = ExecutionStatus.SKIPPED
                node_exec.error_message = "Dependencies not satisfied"
                return
            
            node_exec.status = ExecutionStatus.RUNNING
            node_exec.started_at = datetime.now()
            
            self.logger.info(f"Starting node: {node.name} ({node.id})")
            
            # Fire event
            if self.on_node_started:
                await self._fire_event(self.on_node_started, execution, node_exec)
            
            # Execute node with timeout
            try:
                await asyncio.wait_for(
                    self._run_node_logic(execution, node, node_exec),
                    timeout=node.timeout
                )
                
                node_exec.status = ExecutionStatus.COMPLETED
                
            except asyncio.TimeoutError:
                node_exec.status = ExecutionStatus.TIMEOUT
                node_exec.error_message = f"Node timed out after {node.timeout} seconds"
                
            except Exception as e:
                node_exec.status = ExecutionStatus.FAILED
                node_exec.error_message = str(e)
                
                # Retry if configured
                if node_exec.retry_count < node.retry_count:
                    node_exec.retry_count += 1
                    self.logger.info(f"Retrying node {node.name} (attempt {node_exec.retry_count}/{node.retry_count})")
                    await asyncio.sleep(2 ** node_exec.retry_count)  # Exponential backoff
                    await self._execute_node(execution, node)
                    return
            
            node_exec.completed_at = datetime.now()
            node_exec.duration = (node_exec.completed_at - node_exec.started_at).total_seconds()
            
            self.logger.info(f"Node {node.name} completed with status: {node_exec.status.value}")
            
            # Fire completion event
            if self.on_node_completed:
                await self._fire_event(self.on_node_completed, execution, node_exec)
                
        except Exception as e:
            node_exec.status = ExecutionStatus.FAILED
            node_exec.error_message = str(e)
            node_exec.completed_at = datetime.now()
            
            self.logger.error(f"Node {node.name} failed: {e}")
    
    async def _run_node_logic(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute the actual node logic based on node type"""
        # This would integrate with StepExecutor in a real implementation
        # For now, simulate based on node type
        
        node_exec.logs.append(f"Starting {node.type.value} node: {node.name}")
        
        if node.type == NodeType.SOURCE:
            await self._execute_source_node(execution, node, node_exec)
        elif node.type == NodeType.BUILD:
            await self._execute_build_node(execution, node, node_exec)
        elif node.type == NodeType.TEST:
            await self._execute_test_node(execution, node, node_exec)
        elif node.type == NodeType.DEPLOY:
            await self._execute_deploy_node(execution, node, node_exec)
        elif node.type == NodeType.NOTIFICATION:
            await self._execute_notification_node(execution, node, node_exec)
        elif node.type == NodeType.CONDITION:
            await self._execute_condition_node(execution, node, node_exec)
        else:
            raise Exception(f"Unknown node type: {node.type}")
        
        node_exec.logs.append(f"Completed {node.type.value} node: {node.name}")
    
    async def _execute_source_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute source/checkout node"""
        # Simulate source checkout
        repository = node.config.get('repository', '')
        branch = node.config.get('branch', 'main')
        
        node_exec.logs.append(f"Checking out {repository}:{branch}")
        await asyncio.sleep(2)  # Simulate checkout time
        
        node_exec.outputs['source_path'] = f"/tmp/source/{repository.replace('/', '_')}"
        node_exec.logs.append("Source checkout completed")
    
    async def _execute_build_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute build node"""
        build_command = node.config.get('build_command', '')
        
        node_exec.logs.append(f"Running build command: {build_command}")
        await asyncio.sleep(3)  # Simulate build time
        
        node_exec.outputs['build_artifacts'] = node.config.get('artifacts', [])
        node_exec.logs.append("Build completed successfully")
    
    async def _execute_test_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute test node"""
        test_command = node.config.get('test_command', '')
        coverage_threshold = node.config.get('coverage_threshold', 0)
        
        node_exec.logs.append(f"Running tests: {test_command}")
        await asyncio.sleep(4)  # Simulate test time
        
        # Simulate test results
        coverage = 85  # Mock coverage
        node_exec.outputs['test_results'] = {
            'passed': 45,
            'failed': 2,
            'coverage': coverage
        }
        
        if coverage < coverage_threshold:
            raise Exception(f"Coverage {coverage}% below threshold {coverage_threshold}%")
        
        node_exec.logs.append(f"Tests passed with {coverage}% coverage")
    
    async def _execute_deploy_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute deployment node"""
        environment = node.config.get('target_environment', '')
        deploy_command = node.config.get('deploy_command', '')
        health_check_url = node.config.get('health_check_url', '')
        
        node_exec.logs.append(f"Deploying to {environment}")
        node_exec.logs.append(f"Running: {deploy_command}")
        await asyncio.sleep(5)  # Simulate deployment time
        
        if health_check_url:
            node_exec.logs.append(f"Health check: {health_check_url}")
            await asyncio.sleep(1)
            node_exec.logs.append("Health check passed")
        
        node_exec.outputs['deployment_url'] = f"https://{environment}.example.com"
        node_exec.logs.append("Deployment completed successfully")
    
    async def _execute_notification_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute notification node"""
        notification_type = node.config.get('notification_type', 'email')
        recipients = node.config.get('recipients', [])
        
        node_exec.logs.append(f"Sending {notification_type} notification to {len(recipients)} recipients")
        await asyncio.sleep(1)  # Simulate notification time
        
        node_exec.logs.append("Notification sent successfully")
    
    async def _execute_condition_node(self, execution: PipelineExecution, node: PipelineNode, node_exec: NodeExecution):
        """Execute conditional node"""
        condition = node.config.get('condition_expression', 'true')
        
        node_exec.logs.append(f"Evaluating condition: {condition}")
        await asyncio.sleep(0.5)
        
        # Simple condition evaluation (would be more sophisticated in real implementation)
        result = eval(condition.replace('true', 'True').replace('false', 'False'))
        
        node_exec.outputs['condition_result'] = result
        node_exec.logs.append(f"Condition evaluated to: {result}")
    
    def _are_dependencies_satisfied(self, execution: PipelineExecution, node: PipelineNode) -> bool:
        """Check if all node dependencies are satisfied"""
        for dep_id in node.dependencies:
            dep_exec = execution.node_executions.get(dep_id)
            if not dep_exec or dep_exec.status != ExecutionStatus.COMPLETED:
                return False
        return True
    
    def _calculate_execution_order(self, pipeline: Pipeline) -> List[List[str]]:
        """Calculate execution order for pipeline nodes (topological sort)"""
        # Build adjacency list and in-degree count
        graph = {node.id: [] for node in pipeline.nodes}
        in_degree = {node.id: 0 for node in pipeline.nodes}
        
        for connection in pipeline.connections:
            from_id, to_id = connection['from'], connection['to']
            graph[from_id].append(to_id)
            in_degree[to_id] += 1
        
        # Topological sort with level tracking (Kahn's algorithm)
        stages = []
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        
        while queue:
            # Current stage contains all nodes with no dependencies
            current_stage = list(queue)
            stages.append(current_stage)
            queue = []
            
            # Process current stage
            for node_id in current_stage:
                for neighbor in graph[node_id]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)
        
        return stages
    
    async def _load_pipeline(self, pipeline_id: str) -> Optional[Pipeline]:
        """Load pipeline from storage (mock implementation)"""
        # In real implementation, this would load from database
        # For now, return None to simulate pipeline not found
        return None
    
    async def _fire_event(self, callback, *args):
        """Fire an event callback safely"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(*args)
            else:
                callback(*args)
        except Exception as e:
            self.logger.error(f"Error firing event: {e}")


# Example usage
if __name__ == "__main__":
    import asyncio
    from designer.PipelineBuilder import PipelineBuilder, NodeType
    
    async def main():
        # Create a test pipeline
        builder = PipelineBuilder()
        pipeline = builder.create_pipeline(
            "Test Pipeline",
            "Test execution",
            "test/repo"
        )
        
        # Add nodes
        source_id = builder.add_node(
            pipeline, NodeType.SOURCE, "Checkout",
            {"repository": "test/repo", "branch": "main"},
            {"x": 0, "y": 0}
        )
        
        build_id = builder.add_node(
            pipeline, NodeType.BUILD, "Build",
            {"build_command": "npm run build"},
            {"x": 200, "y": 0}
        )
        
        test_id = builder.add_node(
            pipeline, NodeType.TEST, "Test",
            {"test_command": "npm test", "coverage_threshold": 80},
            {"x": 400, "y": 0}
        )
        
        # Connect nodes
        builder.connect_nodes(pipeline, source_id, build_id)
        builder.connect_nodes(pipeline, build_id, test_id)
        
        # Create runner and execute
        runner = PipelineRunner()
        
        # Set up event handlers
        def on_started(execution):
            print(f"Pipeline started: {execution.pipeline_name}")
        
        def on_completed(execution):
            print(f"Pipeline completed: {execution.pipeline_name} in {execution.duration:.2f}s")
        
        runner.on_execution_started = on_started
        runner.on_execution_completed = on_completed
        
        await runner.start()
        
        # Execute pipeline
        execution_id = await runner.execute_pipeline(pipeline)
        print(f"Execution started: {execution_id}")
        
        # Monitor execution
        while True:
            status = runner.get_execution_status(execution_id)
            if status and status['status'] in ['completed', 'failed', 'cancelled']:
                print(f"Final status: {status['status']}")
                break
            await asyncio.sleep(1)
        
        await runner.stop()
    
    # Run the example
    asyncio.run(main())
"""
Pipeline API Integration Module for Pipeline Management Backend Engine
Integrates the pipeline engine with the main API endpoints
"""

import asyncio
import json
import logging
from typing import Dict, Any, List, Optional, Union
from datetime import datetime
from uuid import UUID, uuid4
from pathlib import Path
import traceback

# Import pipeline engine components
from ..designer.PipelineBuilder import PipelineBuilder, Pipeline as PipelineConfig
from ..designer.NodeValidator import NodeValidator, ValidationResult
from ..designer.TemplateManager import TemplateManager
from ..execution.PipelineRunner import PipelineRunner, ExecutionResult
from ..execution.StepExecutor import StepExecutor, StepResult
from ..execution.LogStreamer import LogStreamer, LogLevel, get_log_streamer
from ..github.ActionsGenerator import ActionsGenerator
from ..github.WorkflowManager import WorkflowManager
from ..storage.DatabaseSchema import (
    DatabaseManager, Pipeline, PipelineExecution, StepExecution,
    PipelineStatus, ExecutionStatus, StepStatus, QualityResult
)

class PipelineAPIError(Exception):
    """Pipeline API specific error"""
    pass

class PipelineAPI:
    def __init__(self, database_manager: DatabaseManager, 
                 workspace_dir: str = "/tmp/pipeline-workspace",
                 github_token: str = None,
                 github_repo_owner: str = None,
                 github_repo_name: str = None):
        """Initialize Pipeline API with required components"""
        self.db_manager = database_manager
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize pipeline engine components
        self.pipeline_builder = PipelineBuilder()
        self.node_validator = NodeValidator()
        self.template_manager = TemplateManager()
        self.step_executor = StepExecutor(str(self.workspace_dir))
        self.log_streamer = get_log_streamer()
        self.actions_generator = ActionsGenerator()
        
        # GitHub integration (optional)
        self.workflow_manager = None
        if github_token and github_repo_owner and github_repo_name:
            self.workflow_manager = WorkflowManager(
                github_token, github_repo_owner, github_repo_name
            )
        
        # Active pipeline runners
        self.active_runners: Dict[str, PipelineRunner] = {}
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
    
    async def create_pipeline(self, pipeline_data: Dict[str, Any], 
                             created_by: str) -> Dict[str, Any]:
        """Create a new pipeline"""
        try:
            # Validate pipeline configuration
            validation_result = await self.validate_pipeline_config(pipeline_data)
            if not validation_result['is_valid']:
                raise PipelineAPIError(f"Invalid pipeline configuration: {validation_result['errors']}")
            
            # Create pipeline configuration
            pipeline_config = self.pipeline_builder.create_pipeline(
                name=pipeline_data['name'],
                description=pipeline_data.get('description', ''),
                nodes=pipeline_data.get('nodes', []),
                config=pipeline_data.get('config', {})
            )
            
            # Save to database
            db_session = self.db_manager.get_session()
            try:
                db_pipeline = Pipeline(
                    id=uuid4(),
                    name=pipeline_data['name'],
                    description=pipeline_data.get('description', ''),
                    configuration=pipeline_config.to_dict(),
                    created_by=created_by,
                    status=PipelineStatus.DRAFT,
                    tags=pipeline_data.get('tags', [])
                )
                
                db_session.add(db_pipeline)
                db_session.commit()
                
                result = {
                    'id': str(db_pipeline.id),
                    'name': db_pipeline.name,
                    'description': db_pipeline.description,
                    'status': db_pipeline.status.value,
                    'created_at': db_pipeline.created_at.isoformat(),
                    'configuration': db_pipeline.configuration,
                    'validation': validation_result
                }
                
                await self.log_streamer.log(
                    LogLevel.INFO, 'pipeline_api', 
                    f"Pipeline '{pipeline_data['name']}' created successfully",
                    metadata={'pipeline_id': str(db_pipeline.id), 'created_by': created_by}
                )
                
                return result
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error creating pipeline: {str(e)}")
            raise PipelineAPIError(f"Failed to create pipeline: {str(e)}")
    
    async def update_pipeline(self, pipeline_id: str, pipeline_data: Dict[str, Any], 
                             updated_by: str) -> Dict[str, Any]:
        """Update an existing pipeline"""
        try:
            db_session = self.db_manager.get_session()
            try:
                db_pipeline = db_session.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
                if not db_pipeline:
                    raise PipelineAPIError(f"Pipeline {pipeline_id} not found")
                
                # Validate updated configuration
                validation_result = await self.validate_pipeline_config(pipeline_data)
                if not validation_result['is_valid']:
                    raise PipelineAPIError(f"Invalid pipeline configuration: {validation_result['errors']}")
                
                # Update pipeline
                if 'name' in pipeline_data:
                    db_pipeline.name = pipeline_data['name']
                if 'description' in pipeline_data:
                    db_pipeline.description = pipeline_data['description']
                if 'configuration' in pipeline_data:
                    db_pipeline.configuration = pipeline_data['configuration']
                if 'tags' in pipeline_data:
                    db_pipeline.tags = pipeline_data['tags']
                if 'status' in pipeline_data:
                    db_pipeline.status = PipelineStatus(pipeline_data['status'])
                
                db_pipeline.version += 1
                db_pipeline.updated_at = datetime.utcnow()
                
                db_session.commit()
                
                result = {
                    'id': str(db_pipeline.id),
                    'name': db_pipeline.name,
                    'description': db_pipeline.description,
                    'status': db_pipeline.status.value,
                    'version': db_pipeline.version,
                    'updated_at': db_pipeline.updated_at.isoformat(),
                    'configuration': db_pipeline.configuration,
                    'validation': validation_result
                }
                
                await self.log_streamer.log(
                    LogLevel.INFO, 'pipeline_api', 
                    f"Pipeline '{db_pipeline.name}' updated successfully",
                    metadata={'pipeline_id': pipeline_id, 'updated_by': updated_by}
                )
                
                return result
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error updating pipeline {pipeline_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to update pipeline: {str(e)}")
    
    async def execute_pipeline(self, pipeline_id: str, trigger_type: str = "manual",
                              trigger_data: Dict[str, Any] = None,
                              triggered_by: str = "system") -> Dict[str, Any]:
        """Execute a pipeline"""
        try:
            db_session = self.db_manager.get_session()
            try:
                # Get pipeline from database
                db_pipeline = db_session.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
                if not db_pipeline:
                    raise PipelineAPIError(f"Pipeline {pipeline_id} not found")
                
                if db_pipeline.status != PipelineStatus.ACTIVE:
                    raise PipelineAPIError(f"Pipeline {pipeline_id} is not active")
                
                # Create execution record
                execution_id = uuid4()
                db_execution = PipelineExecution(
                    id=execution_id,
                    pipeline_id=pipeline_id,
                    status=ExecutionStatus.PENDING,
                    trigger_type=trigger_type,
                    trigger_data=trigger_data or {},
                    created_by=triggered_by
                )
                
                db_session.add(db_execution)
                db_session.commit()
                
                # Create pipeline configuration from stored data
                pipeline_config = PipelineConfig.from_dict(db_pipeline.configuration)
                
                # Create pipeline runner
                runner = PipelineRunner(
                    pipeline_config=pipeline_config,
                    workspace_dir=str(self.workspace_dir / str(execution_id)),
                    step_executor=self.step_executor,
                    log_callback=self._create_log_callback(str(execution_id))
                )
                
                # Store runner for monitoring
                self.active_runners[str(execution_id)] = runner
                
                # Start execution asynchronously
                asyncio.create_task(self._execute_pipeline_async(
                    runner, str(execution_id), db_pipeline.name
                ))
                
                result = {
                    'execution_id': str(execution_id),
                    'pipeline_id': pipeline_id,
                    'pipeline_name': db_pipeline.name,
                    'status': ExecutionStatus.PENDING.value,
                    'trigger_type': trigger_type,
                    'created_at': db_execution.created_at.isoformat(),
                    'created_by': triggered_by
                }
                
                await self.log_streamer.log(
                    LogLevel.INFO, 'pipeline_api', 
                    f"Pipeline execution started for '{db_pipeline.name}'",
                    pipeline_id=pipeline_id,
                    metadata={'execution_id': str(execution_id), 'triggered_by': triggered_by}
                )
                
                return result
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error executing pipeline {pipeline_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to execute pipeline: {str(e)}")
    
    async def cancel_execution(self, execution_id: str) -> Dict[str, Any]:
        """Cancel a pipeline execution"""
        try:
            # Cancel the runner if active
            if execution_id in self.active_runners:
                runner = self.active_runners[execution_id]
                await runner.cancel()
                del self.active_runners[execution_id]
            
            # Update database
            db_session = self.db_manager.get_session()
            try:
                db_execution = db_session.query(PipelineExecution).filter(
                    PipelineExecution.id == execution_id
                ).first()
                
                if not db_execution:
                    raise PipelineAPIError(f"Execution {execution_id} not found")
                
                db_execution.status = ExecutionStatus.CANCELLED
                db_execution.completed_at = datetime.utcnow()
                
                db_session.commit()
                
                await self.log_streamer.log(
                    LogLevel.WARNING, 'pipeline_api', 
                    f"Pipeline execution cancelled",
                    pipeline_id=str(db_execution.pipeline_id),
                    metadata={'execution_id': execution_id}
                )
                
                return {
                    'execution_id': execution_id,
                    'status': ExecutionStatus.CANCELLED.value,
                    'cancelled_at': db_execution.completed_at.isoformat()
                }
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error cancelling execution {execution_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to cancel execution: {str(e)}")
    
    async def get_pipeline(self, pipeline_id: str) -> Dict[str, Any]:
        """Get pipeline details"""
        try:
            db_session = self.db_manager.get_session()
            try:
                db_pipeline = db_session.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
                if not db_pipeline:
                    raise PipelineAPIError(f"Pipeline {pipeline_id} not found")
                
                return {
                    'id': str(db_pipeline.id),
                    'name': db_pipeline.name,
                    'description': db_pipeline.description,
                    'status': db_pipeline.status.value,
                    'configuration': db_pipeline.configuration,
                    'created_by': db_pipeline.created_by,
                    'created_at': db_pipeline.created_at.isoformat(),
                    'updated_at': db_pipeline.updated_at.isoformat(),
                    'version': db_pipeline.version,
                    'tags': db_pipeline.tags
                }
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error getting pipeline {pipeline_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to get pipeline: {str(e)}")
    
    async def get_execution(self, execution_id: str) -> Dict[str, Any]:
        """Get execution details"""
        try:
            db_session = self.db_manager.get_session()
            try:
                db_execution = db_session.query(PipelineExecution).filter(
                    PipelineExecution.id == execution_id
                ).first()
                
                if not db_execution:
                    raise PipelineAPIError(f"Execution {execution_id} not found")
                
                # Get steps
                steps = db_session.query(StepExecution).filter(
                    StepExecution.execution_id == execution_id
                ).all()
                
                return {
                    'id': str(db_execution.id),
                    'pipeline_id': str(db_execution.pipeline_id),
                    'status': db_execution.status.value,
                    'trigger_type': db_execution.trigger_type,
                    'trigger_data': db_execution.trigger_data,
                    'started_at': db_execution.started_at.isoformat() if db_execution.started_at else None,
                    'completed_at': db_execution.completed_at.isoformat() if db_execution.completed_at else None,
                    'duration_seconds': db_execution.duration_seconds,
                    'error_message': db_execution.error_message,
                    'output': db_execution.output,
                    'metrics': db_execution.metrics,
                    'created_by': db_execution.created_by,
                    'created_at': db_execution.created_at.isoformat(),
                    'steps': [
                        {
                            'id': str(step.id),
                            'step_id': step.step_id,
                            'step_name': step.step_name,
                            'step_type': step.step_type,
                            'status': step.status.value,
                            'started_at': step.started_at.isoformat() if step.started_at else None,
                            'completed_at': step.completed_at.isoformat() if step.completed_at else None,
                            'duration_seconds': step.duration_seconds,
                            'exit_code': step.exit_code,
                            'error_message': step.error_message,
                            'artifacts': step.artifacts,
                            'metrics': step.metrics,
                            'retry_count': step.retry_count
                        }
                        for step in steps
                    ]
                }
                
            finally:
                db_session.close()
                
        except Exception as e:
            self.logger.error(f"Error getting execution {execution_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to get execution: {str(e)}")
    
    async def validate_pipeline_config(self, pipeline_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate pipeline configuration"""
        try:
            # Extract nodes from pipeline data
            nodes = pipeline_data.get('nodes', [])
            
            all_results = []
            is_valid = True
            
            for node in nodes:
                # Validate each node
                result = self.node_validator.validate_node(node)
                all_results.append({
                    'node_id': node.get('id', 'unknown'),
                    'node_name': node.get('name', 'unknown'),
                    'is_valid': result.is_valid,
                    'errors': [issue.message for issue in result.issues if issue.severity == 'ERROR'],
                    'warnings': [issue.message for issue in result.issues if issue.severity == 'WARNING'],
                    'info': [issue.message for issue in result.issues if issue.severity == 'INFO']
                })
                
                if not result.is_valid:
                    is_valid = False
            
            # Validate overall pipeline structure
            structure_errors = []
            if not pipeline_data.get('name'):
                structure_errors.append("Pipeline name is required")
            if not nodes:
                structure_errors.append("Pipeline must have at least one node")
            
            if structure_errors:
                is_valid = False
            
            return {
                'is_valid': is_valid,
                'structure_errors': structure_errors,
                'node_validations': all_results,
                'summary': {
                    'total_nodes': len(nodes),
                    'valid_nodes': len([r for r in all_results if r['is_valid']]),
                    'invalid_nodes': len([r for r in all_results if not r['is_valid']])
                }
            }
            
        except Exception as e:
            self.logger.error(f"Error validating pipeline configuration: {str(e)}")
            return {
                'is_valid': False,
                'structure_errors': [f"Validation error: {str(e)}"],
                'node_validations': [],
                'summary': {'total_nodes': 0, 'valid_nodes': 0, 'invalid_nodes': 0}
            }
    
    async def get_templates(self, category: str = None) -> List[Dict[str, Any]]:
        """Get available pipeline templates"""
        try:
            templates = self.template_manager.get_available_templates()
            
            if category:
                templates = [t for t in templates if t.get('category') == category]
            
            return templates
            
        except Exception as e:
            self.logger.error(f"Error getting templates: {str(e)}")
            raise PipelineAPIError(f"Failed to get templates: {str(e)}")
    
    async def create_from_template(self, template_name: str, parameters: Dict[str, Any],
                                  pipeline_name: str, created_by: str) -> Dict[str, Any]:
        """Create pipeline from template"""
        try:
            # Generate pipeline from template
            pipeline_config = self.template_manager.create_from_template(
                template_name, parameters, pipeline_name
            )
            
            # Convert to pipeline data format
            pipeline_data = {
                'name': pipeline_name,
                'description': f"Pipeline created from template: {template_name}",
                'nodes': pipeline_config.nodes,
                'config': pipeline_config.config,
                'tags': ['template-generated', template_name]
            }
            
            # Create the pipeline
            return await self.create_pipeline(pipeline_data, created_by)
            
        except Exception as e:
            self.logger.error(f"Error creating pipeline from template {template_name}: {str(e)}")
            raise PipelineAPIError(f"Failed to create pipeline from template: {str(e)}")
    
    async def generate_github_workflow(self, pipeline_id: str) -> Dict[str, Any]:
        """Generate GitHub Actions workflow from pipeline"""
        try:
            # Get pipeline
            pipeline = await self.get_pipeline(pipeline_id)
            
            # Generate GitHub Actions workflow
            workflow = self.actions_generator.generate_workflow(
                pipeline['configuration'], 
                pipeline['name']
            )
            
            # Convert to YAML
            yaml_content = self.actions_generator.workflow_to_yaml(workflow)
            
            return {
                'pipeline_id': pipeline_id,
                'workflow_name': workflow.name,
                'yaml_content': yaml_content,
                'workflow_path': f".github/workflows/{pipeline['name'].lower().replace(' ', '-')}.yml"
            }
            
        except Exception as e:
            self.logger.error(f"Error generating GitHub workflow for pipeline {pipeline_id}: {str(e)}")
            raise PipelineAPIError(f"Failed to generate GitHub workflow: {str(e)}")
    
    async def _execute_pipeline_async(self, runner: PipelineRunner, 
                                     execution_id: str, pipeline_name: str):
        """Execute pipeline asynchronously"""
        try:
            # Update status to running
            await self._update_execution_status(execution_id, ExecutionStatus.RUNNING)
            
            # Execute pipeline
            result = await runner.execute()
            
            # Update execution with results
            await self._complete_execution(execution_id, result)
            
            await self.log_streamer.log(
                LogLevel.INFO, 'pipeline_api', 
                f"Pipeline execution completed for '{pipeline_name}' with status: {result.status.value}",
                metadata={'execution_id': execution_id, 'status': result.status.value}
            )
            
        except Exception as e:
            await self._fail_execution(execution_id, str(e))
            await self.log_streamer.log(
                LogLevel.ERROR, 'pipeline_api', 
                f"Pipeline execution failed for '{pipeline_name}': {str(e)}",
                metadata={'execution_id': execution_id, 'error': str(e)}
            )
        finally:
            # Clean up runner
            self.active_runners.pop(execution_id, None)
    
    async def _update_execution_status(self, execution_id: str, status: ExecutionStatus):
        """Update execution status in database"""
        db_session = self.db_manager.get_session()
        try:
            db_execution = db_session.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()
            
            if db_execution:
                db_execution.status = status
                if status == ExecutionStatus.RUNNING and not db_execution.started_at:
                    db_execution.started_at = datetime.utcnow()
                db_session.commit()
        finally:
            db_session.close()
    
    async def _complete_execution(self, execution_id: str, result: ExecutionResult):
        """Complete execution with results"""
        db_session = self.db_manager.get_session()
        try:
            db_execution = db_session.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()
            
            if db_execution:
                db_execution.status = ExecutionStatus.SUCCESS if result.status.value == 'success' else ExecutionStatus.FAILED
                db_execution.completed_at = datetime.utcnow()
                if db_execution.started_at:
                    duration = (db_execution.completed_at - db_execution.started_at).total_seconds()
                    db_execution.duration_seconds = int(duration)
                db_execution.output = result.output
                db_execution.metrics = result.metrics
                
                # Save step results
                for step_result in result.step_results:
                    db_step = StepExecution(
                        execution_id=execution_id,
                        step_id=step_result.step_id,
                        step_name=step_result.step_id,  # Could be enhanced with actual step names
                        step_type='unknown',  # Could be enhanced with step type detection
                        status=StepStatus(step_result.status.value),
                        started_at=step_result.start_time,
                        completed_at=step_result.end_time,
                        duration_seconds=int(step_result.duration or 0),
                        exit_code=step_result.exit_code,
                        stdout=step_result.stdout,
                        stderr=step_result.stderr,
                        error_message=step_result.error_message,
                        artifacts=step_result.artifacts,
                        metrics=step_result.metrics
                    )
                    db_session.add(db_step)
                
                db_session.commit()
        finally:
            db_session.close()
    
    async def _fail_execution(self, execution_id: str, error_message: str):
        """Mark execution as failed"""
        db_session = self.db_manager.get_session()
        try:
            db_execution = db_session.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()
            
            if db_execution:
                db_execution.status = ExecutionStatus.FAILED
                db_execution.completed_at = datetime.utcnow()
                db_execution.error_message = error_message
                if db_execution.started_at:
                    duration = (db_execution.completed_at - db_execution.started_at).total_seconds()
                    db_execution.duration_seconds = int(duration)
                db_session.commit()
        finally:
            db_session.close()
    
    def _create_log_callback(self, execution_id: str):
        """Create log callback for pipeline execution"""
        async def log_callback(step_id: str, level: str, message: str, timestamp: datetime):
            await self.log_streamer.log(
                LogLevel(level), 'pipeline_execution', message,
                step_id=step_id, pipeline_id=execution_id,
                metadata={'execution_id': execution_id}
            )
        return log_callback
"""
Workflow Manager Module for Pipeline Management Backend Engine
Manages GitHub Actions workflows, monitors execution, and handles webhook events
"""

import asyncio
import json
import aiohttp
import logging
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
import hmac
import hashlib
import base64

class WorkflowStatus(Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILURE = "failure"
    TIMED_OUT = "timed_out"
    ACTION_REQUIRED = "action_required"

class JobStatus(Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILURE = "failure"
    SKIPPED = "skipped"

@dataclass
class WorkflowRun:
    id: int
    name: str
    status: WorkflowStatus
    conclusion: Optional[str]
    created_at: datetime
    updated_at: datetime
    run_number: int
    head_branch: str
    head_sha: str
    event: str
    actor: str
    workflow_id: int
    html_url: str
    jobs_url: str
    logs_url: str
    artifacts_url: str
    
    @classmethod
    def from_github_data(cls, data: Dict[str, Any]) -> 'WorkflowRun':
        return cls(
            id=data['id'],
            name=data['name'],
            status=WorkflowStatus(data['status']),
            conclusion=data.get('conclusion'),
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            updated_at=datetime.fromisoformat(data['updated_at'].replace('Z', '+00:00')),
            run_number=data['run_number'],
            head_branch=data['head_branch'],
            head_sha=data['head_sha'],
            event=data['event'],
            actor=data['actor']['login'],
            workflow_id=data['workflow_id'],
            html_url=data['html_url'],
            jobs_url=data['jobs_url'],
            logs_url=data['logs_url'],
            artifacts_url=data['artifacts_url']
        )

@dataclass
class WorkflowJob:
    id: int
    run_id: int
    name: str
    status: JobStatus
    conclusion: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    steps: List[Dict[str, Any]]
    runner_name: Optional[str]
    runner_group_name: Optional[str]
    
    @classmethod
    def from_github_data(cls, data: Dict[str, Any]) -> 'WorkflowJob':
        return cls(
            id=data['id'],
            run_id=data['run_id'],
            name=data['name'],
            status=JobStatus(data['status']),
            conclusion=data.get('conclusion'),
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            started_at=datetime.fromisoformat(data['started_at'].replace('Z', '+00:00')) if data.get('started_at') else None,
            completed_at=datetime.fromisoformat(data['completed_at'].replace('Z', '+00:00')) if data.get('completed_at') else None,
            steps=data.get('steps', []),
            runner_name=data.get('runner_name'),
            runner_group_name=data.get('runner_group_name')
        )

class WorkflowManager:
    def __init__(self, github_token: str, repo_owner: str, repo_name: str,
                 webhook_secret: Optional[str] = None):
        self.github_token = github_token
        self.repo_owner = repo_owner
        self.repo_name = repo_name
        self.webhook_secret = webhook_secret
        self.base_url = "https://api.github.com"
        
        # Event handlers
        self.event_handlers: Dict[str, List[Callable]] = {}
        
        # Monitoring
        self.active_runs: Dict[int, WorkflowRun] = {}
        self.monitoring_task: Optional[asyncio.Task] = None
        self.monitoring_interval = 30  # seconds
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
        # Session for HTTP requests
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.stop()
    
    async def start(self):
        """Start the workflow manager"""
        self.session = aiohttp.ClientSession(
            headers={'Authorization': f'token {self.github_token}'},
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        # Start monitoring task
        if not self.monitoring_task or self.monitoring_task.done():
            self.monitoring_task = asyncio.create_task(self._monitor_workflows())
        
        self.logger.info("Workflow manager started")
    
    async def stop(self):
        """Stop the workflow manager"""
        # Stop monitoring
        if self.monitoring_task and not self.monitoring_task.done():
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        
        # Close session
        if self.session:
            await self.session.close()
        
        self.logger.info("Workflow manager stopped")
    
    def add_event_handler(self, event_type: str, handler: Callable):
        """Add event handler for workflow events"""
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)
    
    def remove_event_handler(self, event_type: str, handler: Callable):
        """Remove event handler"""
        if event_type in self.event_handlers:
            try:
                self.event_handlers[event_type].remove(handler)
            except ValueError:
                pass
    
    async def trigger_workflow(self, workflow_id: str, ref: str = "main", 
                              inputs: Dict[str, Any] = None) -> Dict[str, Any]:
        """Trigger a workflow run"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/workflows/{workflow_id}/dispatches"
        
        payload = {"ref": ref}
        if inputs:
            payload["inputs"] = inputs
        
        async with self.session.post(url, json=payload) as response:
            if response.status == 204:
                self.logger.info(f"Workflow {workflow_id} triggered successfully")
                return {"status": "triggered", "workflow_id": workflow_id}
            else:
                error_text = await response.text()
                self.logger.error(f"Failed to trigger workflow {workflow_id}: {error_text}")
                raise Exception(f"Failed to trigger workflow: {error_text}")
    
    async def get_workflow_runs(self, workflow_id: Optional[str] = None, 
                               status: Optional[str] = None,
                               branch: Optional[str] = None,
                               limit: int = 50) -> List[WorkflowRun]:
        """Get workflow runs with optional filtering"""
        if workflow_id:
            url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/workflows/{workflow_id}/runs"
        else:
            url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs"
        
        params = {"per_page": limit}
        if status:
            params["status"] = status
        if branch:
            params["branch"] = branch
        
        async with self.session.get(url, params=params) as response:
            if response.status == 200:
                data = await response.json()
                return [WorkflowRun.from_github_data(run) for run in data['workflow_runs']]
            else:
                error_text = await response.text()
                self.logger.error(f"Failed to get workflow runs: {error_text}")
                return []
    
    async def get_workflow_run(self, run_id: int) -> Optional[WorkflowRun]:
        """Get a specific workflow run"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                data = await response.json()
                return WorkflowRun.from_github_data(data)
            else:
                self.logger.error(f"Failed to get workflow run {run_id}")
                return None
    
    async def get_workflow_jobs(self, run_id: int) -> List[WorkflowJob]:
        """Get jobs for a workflow run"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/jobs"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                data = await response.json()
                return [WorkflowJob.from_github_data(job) for job in data['jobs']]
            else:
                self.logger.error(f"Failed to get jobs for run {run_id}")
                return []
    
    async def cancel_workflow_run(self, run_id: int) -> bool:
        """Cancel a workflow run"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/cancel"
        
        async with self.session.post(url) as response:
            if response.status == 202:
                self.logger.info(f"Workflow run {run_id} cancelled")
                return True
            else:
                error_text = await response.text()
                self.logger.error(f"Failed to cancel run {run_id}: {error_text}")
                return False
    
    async def rerun_workflow(self, run_id: int, failed_jobs_only: bool = False) -> bool:
        """Rerun a workflow"""
        if failed_jobs_only:
            url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/rerun-failed-jobs"
        else:
            url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/rerun"
        
        async with self.session.post(url) as response:
            if response.status == 201:
                self.logger.info(f"Workflow run {run_id} rerun initiated")
                return True
            else:
                error_text = await response.text()
                self.logger.error(f"Failed to rerun {run_id}: {error_text}")
                return False
    
    async def get_workflow_logs(self, run_id: int) -> Optional[bytes]:
        """Download workflow logs"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/logs"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                return await response.read()
            else:
                self.logger.error(f"Failed to get logs for run {run_id}")
                return None
    
    async def get_job_logs(self, job_id: int) -> Optional[str]:
        """Get logs for a specific job"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/jobs/{job_id}/logs"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                return await response.text()
            else:
                self.logger.error(f"Failed to get logs for job {job_id}")
                return None
    
    async def get_workflow_artifacts(self, run_id: int) -> List[Dict[str, Any]]:
        """Get artifacts for a workflow run"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/artifacts"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                data = await response.json()
                return data['artifacts']
            else:
                self.logger.error(f"Failed to get artifacts for run {run_id}")
                return []
    
    async def download_artifact(self, artifact_id: int) -> Optional[bytes]:
        """Download a specific artifact"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/artifacts/{artifact_id}/zip"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                return await response.read()
            else:
                self.logger.error(f"Failed to download artifact {artifact_id}")
                return None
    
    async def get_workflow_usage(self, run_id: int) -> Optional[Dict[str, Any]]:
        """Get workflow run usage (billing information)"""
        url = f"{self.base_url}/repos/{self.repo_owner}/{self.repo_name}/actions/runs/{run_id}/timing"
        
        async with self.session.get(url) as response:
            if response.status == 200:
                return await response.json()
            else:
                self.logger.error(f"Failed to get usage for run {run_id}")
                return None
    
    async def handle_webhook(self, headers: Dict[str, str], payload: bytes) -> bool:
        """Handle GitHub webhook payload"""
        # Verify webhook signature if secret is configured
        if self.webhook_secret:
            if not self._verify_webhook_signature(headers, payload):
                self.logger.warning("Invalid webhook signature")
                return False
        
        try:
            data = json.loads(payload.decode('utf-8'))
            event_type = headers.get('X-GitHub-Event', '')
            
            # Handle workflow run events
            if event_type == 'workflow_run':
                await self._handle_workflow_run_event(data)
            elif event_type == 'workflow_job':
                await self._handle_workflow_job_event(data)
            
            # Notify event handlers
            await self._notify_event_handlers(event_type, data)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error handling webhook: {e}")
            return False
    
    def _verify_webhook_signature(self, headers: Dict[str, str], payload: bytes) -> bool:
        """Verify GitHub webhook signature"""
        signature = headers.get('X-Hub-Signature-256', '')
        if not signature.startswith('sha256='):
            return False
        
        expected_signature = hmac.new(
            self.webhook_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(f"sha256={expected_signature}", signature)
    
    async def _handle_workflow_run_event(self, data: Dict[str, Any]):
        """Handle workflow run webhook event"""
        action = data.get('action', '')
        run_data = data.get('workflow_run', {})
        
        if run_data:
            run = WorkflowRun.from_github_data(run_data)
            
            if action in ['requested', 'in_progress']:
                self.active_runs[run.id] = run
            elif action in ['completed', 'cancelled']:
                self.active_runs.pop(run.id, None)
            
            self.logger.info(f"Workflow run {run.id} {action}: {run.name}")
    
    async def _handle_workflow_job_event(self, data: Dict[str, Any]):
        """Handle workflow job webhook event"""
        action = data.get('action', '')
        job_data = data.get('workflow_job', {})
        
        if job_data:
            job = WorkflowJob.from_github_data(job_data)
            self.logger.info(f"Workflow job {job.id} {action}: {job.name}")
    
    async def _notify_event_handlers(self, event_type: str, data: Dict[str, Any]):
        """Notify registered event handlers"""
        handlers = self.event_handlers.get(event_type, [])
        
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(data)
                else:
                    handler(data)
            except Exception as e:
                self.logger.error(f"Error in event handler for {event_type}: {e}")
    
    async def _monitor_workflows(self):
        """Background task to monitor active workflow runs"""
        while True:
            try:
                await asyncio.sleep(self.monitoring_interval)
                
                if not self.active_runs:
                    continue
                
                # Check status of active runs
                for run_id in list(self.active_runs.keys()):
                    try:
                        updated_run = await self.get_workflow_run(run_id)
                        if updated_run:
                            old_run = self.active_runs[run_id]
                            
                            # Check if status changed
                            if old_run.status != updated_run.status:
                                self.logger.info(
                                    f"Workflow run {run_id} status changed: "
                                    f"{old_run.status.value} -> {updated_run.status.value}"
                                )
                                
                                # Notify handlers of status change
                                await self._notify_event_handlers('status_change', {
                                    'run_id': run_id,
                                    'old_status': old_run.status.value,
                                    'new_status': updated_run.status.value,
                                    'run': asdict(updated_run)
                                })
                            
                            # Update stored run
                            self.active_runs[run_id] = updated_run
                            
                            # Remove if completed
                            if updated_run.status in [WorkflowStatus.COMPLETED, 
                                                    WorkflowStatus.CANCELLED, 
                                                    WorkflowStatus.FAILURE]:
                                self.active_runs.pop(run_id, None)
                        
                    except Exception as e:
                        self.logger.error(f"Error monitoring run {run_id}: {e}")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in monitoring task: {e}")
    
    async def get_workflow_statistics(self, days: int = 30) -> Dict[str, Any]:
        """Get workflow execution statistics"""
        since = datetime.now() - timedelta(days=days)
        
        # Get recent runs
        runs = await self.get_workflow_runs(limit=100)
        
        # Filter by date
        recent_runs = [
            run for run in runs 
            if run.created_at >= since
        ]
        
        # Calculate statistics
        total_runs = len(recent_runs)
        successful_runs = len([r for r in recent_runs if r.conclusion == 'success'])
        failed_runs = len([r for r in recent_runs if r.conclusion == 'failure'])
        cancelled_runs = len([r for r in recent_runs if r.conclusion == 'cancelled'])
        
        # Calculate average duration for completed runs
        completed_runs = [r for r in recent_runs if r.conclusion in ['success', 'failure']]
        if completed_runs:
            durations = [(r.updated_at - r.created_at).total_seconds() for r in completed_runs]
            avg_duration = sum(durations) / len(durations)
        else:
            avg_duration = 0
        
        return {
            'period_days': days,
            'total_runs': total_runs,
            'successful_runs': successful_runs,
            'failed_runs': failed_runs,
            'cancelled_runs': cancelled_runs,
            'success_rate': successful_runs / total_runs if total_runs > 0 else 0,
            'average_duration_seconds': avg_duration,
            'runs_per_day': total_runs / days
        }
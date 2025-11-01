"""
Step Executor Module for Pipeline Management Backend Engine
Handles individual step execution with comprehensive logging and error handling
"""

import asyncio
import logging
import subprocess
import json
import os
import shlex
import signal
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum

class StepStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"

@dataclass
class StepResult:
    step_id: str
    status: StepStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    error_message: Optional[str] = None
    artifacts: List[str] = None
    metrics: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.artifacts is None:
            self.artifacts = []
        if self.metrics is None:
            self.metrics = {}
    
    @property
    def duration(self) -> Optional[float]:
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['status'] = self.status.value
        data['start_time'] = self.start_time.isoformat() if self.start_time else None
        data['end_time'] = self.end_time.isoformat() if self.end_time else None
        data['duration'] = self.duration
        return data

class StepExecutor:
    def __init__(self, workspace_dir: str = "/tmp/pipeline-workspace", 
                 timeout: int = 3600, log_callback: Optional[Callable] = None):
        self.workspace_dir = Path(workspace_dir)
        self.timeout = timeout
        self.log_callback = log_callback
        self.active_processes: Dict[str, subprocess.Popen] = {}
        self.cancelled_steps: set = set()
        
        # Ensure workspace directory exists
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
    
    async def execute_step(self, step_id: str, step_config: Dict[str, Any], 
                          context: Dict[str, Any] = None) -> StepResult:
        """Execute a single pipeline step with comprehensive monitoring"""
        if context is None:
            context = {}
        
        result = StepResult(
            step_id=step_id,
            status=StepStatus.PENDING,
            start_time=datetime.now()
        )
        
        try:
            self.logger.info(f"Starting execution of step: {step_id}")
            await self._emit_log(step_id, "info", f"Starting step execution: {step_id}")
            
            # Update status to running
            result.status = StepStatus.RUNNING
            await self._emit_log(step_id, "info", "Step status: RUNNING")
            
            # Get step type and execute accordingly
            step_type = step_config.get('type', 'command')
            
            if step_type == 'command':
                await self._execute_command_step(result, step_config, context)
            elif step_type == 'script':
                await self._execute_script_step(result, step_config, context)
            elif step_type == 'docker':
                await self._execute_docker_step(result, step_config, context)
            elif step_type == 'api':
                await self._execute_api_step(result, step_config, context)
            elif step_type == 'test':
                await self._execute_test_step(result, step_config, context)
            else:
                raise ValueError(f"Unknown step type: {step_type}")
            
            # Collect artifacts if specified
            await self._collect_artifacts(result, step_config)
            
            # Calculate metrics
            await self._calculate_metrics(result, step_config)
            
            if result.status == StepStatus.RUNNING:
                result.status = StepStatus.SUCCESS
                await self._emit_log(step_id, "info", "Step completed successfully")
            
        except asyncio.CancelledError:
            result.status = StepStatus.CANCELLED
            result.error_message = "Step execution was cancelled"
            await self._emit_log(step_id, "warning", "Step execution cancelled")
            await self._cleanup_step(step_id)
        except asyncio.TimeoutError:
            result.status = StepStatus.TIMEOUT
            result.error_message = f"Step execution timed out after {self.timeout} seconds"
            await self._emit_log(step_id, "error", f"Step timed out after {self.timeout}s")
            await self._cleanup_step(step_id)
        except Exception as e:
            result.status = StepStatus.FAILED
            result.error_message = str(e)
            await self._emit_log(step_id, "error", f"Step failed: {str(e)}")
            self.logger.error(f"Step {step_id} failed: {str(e)}")
        finally:
            result.end_time = datetime.now()
            await self._emit_log(step_id, "info", 
                               f"Step finished with status: {result.status.value}")
        
        return result
    
    async def _execute_command_step(self, result: StepResult, step_config: Dict[str, Any], 
                                   context: Dict[str, Any]):
        """Execute a command-based step"""
        command = step_config.get('command', '')
        if not command:
            raise ValueError("Command step requires 'command' parameter")
        
        # Substitute context variables
        command = self._substitute_variables(command, context)
        
        # Setup working directory
        working_dir = step_config.get('working_dir', str(self.workspace_dir))
        working_dir = self._substitute_variables(working_dir, context)
        
        # Setup environment variables
        env = os.environ.copy()
        step_env = step_config.get('environment', {})
        for key, value in step_env.items():
            env[key] = self._substitute_variables(str(value), context)
        
        await self._emit_log(result.step_id, "debug", f"Executing command: {command}")
        await self._emit_log(result.step_id, "debug", f"Working directory: {working_dir}")
        
        # Execute command
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
                env=env
            )
            
            self.active_processes[result.step_id] = process
            
            # Wait for completion with timeout
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), 
                timeout=self.timeout
            )
            
            result.stdout = stdout.decode('utf-8', errors='replace')
            result.stderr = stderr.decode('utf-8', errors='replace')
            result.exit_code = process.returncode
            
            if result.exit_code != 0:
                result.status = StepStatus.FAILED
                result.error_message = f"Command failed with exit code {result.exit_code}"
                await self._emit_log(result.step_id, "error", 
                                   f"Command failed with exit code {result.exit_code}")
            
        finally:
            self.active_processes.pop(result.step_id, None)
    
    async def _execute_script_step(self, result: StepResult, step_config: Dict[str, Any], 
                                  context: Dict[str, Any]):
        """Execute a script-based step"""
        script_content = step_config.get('script', '')
        script_type = step_config.get('script_type', 'bash')
        
        if not script_content:
            raise ValueError("Script step requires 'script' parameter")
        
        # Create temporary script file
        script_file = self.workspace_dir / f"step_{result.step_id}.{script_type}"
        
        # Substitute variables in script content
        script_content = self._substitute_variables(script_content, context)
        
        # Write script to file
        script_file.write_text(script_content)
        script_file.chmod(0o755)
        
        try:
            # Execute script
            interpreter = self._get_script_interpreter(script_type)
            command = f"{interpreter} {script_file}"
            
            # Update step config for command execution
            script_step_config = {
                'command': command,
                'working_dir': step_config.get('working_dir', str(self.workspace_dir)),
                'environment': step_config.get('environment', {})
            }
            
            await self._execute_command_step(result, script_step_config, context)
            
        finally:
            # Cleanup script file
            if script_file.exists():
                script_file.unlink()
    
    async def _execute_docker_step(self, result: StepResult, step_config: Dict[str, Any], 
                                  context: Dict[str, Any]):
        """Execute a Docker-based step"""
        image = step_config.get('image', '')
        if not image:
            raise ValueError("Docker step requires 'image' parameter")
        
        command = step_config.get('command', '')
        volumes = step_config.get('volumes', [])
        environment = step_config.get('environment', {})
        
        # Build docker command
        docker_cmd = ['docker', 'run', '--rm']
        
        # Add volumes
        for volume in volumes:
            volume = self._substitute_variables(volume, context)
            docker_cmd.extend(['-v', volume])
        
        # Add environment variables
        for key, value in environment.items():
            value = self._substitute_variables(str(value), context)
            docker_cmd.extend(['-e', f"{key}={value}"])
        
        # Add image
        docker_cmd.append(image)
        
        # Add command if specified
        if command:
            command = self._substitute_variables(command, context)
            docker_cmd.extend(shlex.split(command))
        
        # Execute docker command
        docker_step_config = {
            'command': ' '.join(shlex.quote(arg) for arg in docker_cmd),
            'working_dir': step_config.get('working_dir', str(self.workspace_dir))
        }
        
        await self._execute_command_step(result, docker_step_config, context)
    
    async def _execute_api_step(self, result: StepResult, step_config: Dict[str, Any], 
                               context: Dict[str, Any]):
        """Execute an API-based step"""
        import aiohttp
        
        url = step_config.get('url', '')
        method = step_config.get('method', 'GET').upper()
        headers = step_config.get('headers', {})
        data = step_config.get('data', {})
        
        if not url:
            raise ValueError("API step requires 'url' parameter")
        
        # Substitute variables
        url = self._substitute_variables(url, context)
        
        for key, value in headers.items():
            headers[key] = self._substitute_variables(str(value), context)
        
        if isinstance(data, dict):
            for key, value in data.items():
                data[key] = self._substitute_variables(str(value), context)
        
        await self._emit_log(result.step_id, "debug", f"Making {method} request to: {url}")
        
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, headers=headers, json=data) as response:
                result.stdout = await response.text()
                result.exit_code = response.status
                
                if response.status >= 400:
                    result.status = StepStatus.FAILED
                    result.error_message = f"API request failed with status {response.status}"
    
    async def _execute_test_step(self, result: StepResult, step_config: Dict[str, Any], 
                                context: Dict[str, Any]):
        """Execute a test-based step"""
        test_command = step_config.get('test_command', '')
        test_framework = step_config.get('test_framework', 'generic')
        
        if not test_command:
            raise ValueError("Test step requires 'test_command' parameter")
        
        # Execute test command
        test_step_config = {
            'command': test_command,
            'working_dir': step_config.get('working_dir', str(self.workspace_dir)),
            'environment': step_config.get('environment', {})
        }
        
        await self._execute_command_step(result, test_step_config, context)
        
        # Parse test results if framework is specified
        if test_framework != 'generic' and result.status == StepStatus.SUCCESS:
            await self._parse_test_results(result, test_framework)
    
    async def _collect_artifacts(self, result: StepResult, step_config: Dict[str, Any]):
        """Collect artifacts specified in step configuration"""
        artifacts = step_config.get('artifacts', [])
        
        for artifact_pattern in artifacts:
            # Use glob to find matching files
            artifact_files = list(self.workspace_dir.glob(artifact_pattern))
            result.artifacts.extend([str(f) for f in artifact_files])
        
        if result.artifacts:
            await self._emit_log(result.step_id, "info", 
                               f"Collected {len(result.artifacts)} artifacts")
    
    async def _calculate_metrics(self, result: StepResult, step_config: Dict[str, Any]):
        """Calculate step execution metrics"""
        result.metrics = {
            'duration_seconds': result.duration or 0,
            'exit_code': result.exit_code,
            'stdout_lines': len(result.stdout.splitlines()) if result.stdout else 0,
            'stderr_lines': len(result.stderr.splitlines()) if result.stderr else 0,
            'artifacts_count': len(result.artifacts)
        }
    
    async def cancel_step(self, step_id: str):
        """Cancel a running step"""
        self.cancelled_steps.add(step_id)
        
        if step_id in self.active_processes:
            process = self.active_processes[step_id]
            try:
                process.terminate()
                await asyncio.sleep(5)  # Wait for graceful termination
                if process.poll() is None:
                    process.kill()  # Force kill if still running
            except ProcessLookupError:
                pass  # Process already terminated
        
        await self._emit_log(step_id, "warning", "Step execution cancelled")
    
    async def _cleanup_step(self, step_id: str):
        """Cleanup resources for a step"""
        if step_id in self.active_processes:
            process = self.active_processes.pop(step_id)
            try:
                if process.poll() is None:
                    process.terminate()
            except ProcessLookupError:
                pass
    
    def _substitute_variables(self, text: str, context: Dict[str, Any]) -> str:
        """Substitute variables in text using context"""
        import re
        
        def replace_var(match):
            var_name = match.group(1)
            return str(context.get(var_name, match.group(0)))
        
        # Replace ${VAR_NAME} patterns
        return re.sub(r'\$\{([^}]+)\}', replace_var, text)
    
    def _get_script_interpreter(self, script_type: str) -> str:
        """Get interpreter for script type"""
        interpreters = {
            'bash': 'bash',
            'sh': 'sh',
            'python': 'python3',
            'node': 'node',
            'powershell': 'pwsh'
        }
        return interpreters.get(script_type, 'bash')
    
    async def _parse_test_results(self, result: StepResult, test_framework: str):
        """Parse test results based on framework"""
        # This could be extended to parse specific test result formats
        # For now, just add basic test metrics
        if 'test' in result.stdout.lower():
            result.metrics['test_framework'] = test_framework
            result.metrics['test_output_present'] = True
    
    async def _emit_log(self, step_id: str, level: str, message: str):
        """Emit log message through callback if available"""
        if self.log_callback:
            await self.log_callback(step_id, level, message, datetime.now())
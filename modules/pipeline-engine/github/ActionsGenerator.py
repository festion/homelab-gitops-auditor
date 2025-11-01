"""
GitHub Actions Generator Module for Pipeline Management Backend Engine
Converts pipeline configurations to GitHub Actions workflows
"""

import yaml
import json
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
import re

@dataclass
class GitHubActionsJob:
    name: str
    runs_on: str = "ubuntu-latest"
    needs: List[str] = None
    if_condition: str = None
    timeout_minutes: int = 60
    strategy: Dict[str, Any] = None
    steps: List[Dict[str, Any]] = None
    env: Dict[str, str] = None
    outputs: Dict[str, str] = None
    services: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.needs is None:
            self.needs = []
        if self.steps is None:
            self.steps = []
        if self.env is None:
            self.env = {}
        if self.outputs is None:
            self.outputs = {}
        if self.services is None:
            self.services = {}

@dataclass
class GitHubActionsWorkflow:
    name: str
    on: Dict[str, Any]
    jobs: Dict[str, GitHubActionsJob]
    env: Dict[str, str] = None
    permissions: Dict[str, str] = None
    concurrency: Dict[str, Any] = None
    defaults: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.env is None:
            self.env = {}
        if self.permissions is None:
            self.permissions = {}

class ActionsGenerator:
    def __init__(self):
        self.step_converters = {
            'command': self._convert_command_step,
            'script': self._convert_script_step,
            'docker': self._convert_docker_step,
            'api': self._convert_api_step,
            'test': self._convert_test_step,
            'checkout': self._convert_checkout_step,
            'cache': self._convert_cache_step,
            'upload_artifacts': self._convert_upload_artifacts_step,
            'download_artifacts': self._convert_download_artifacts_step,
            'deploy': self._convert_deploy_step
        }
    
    def generate_workflow(self, pipeline_config: Dict[str, Any], 
                         workflow_name: str = None) -> GitHubActionsWorkflow:
        """Generate GitHub Actions workflow from pipeline configuration"""
        
        workflow_name = workflow_name or pipeline_config.get('name', 'Pipeline Workflow')
        
        # Extract trigger configuration
        triggers = self._extract_triggers(pipeline_config)
        
        # Convert pipeline jobs to GitHub Actions jobs
        jobs = {}
        
        if 'stages' in pipeline_config:
            jobs = self._convert_stages_to_jobs(pipeline_config['stages'])
        elif 'nodes' in pipeline_config:
            jobs = self._convert_nodes_to_jobs(pipeline_config['nodes'])
        else:
            # Single job pipeline
            jobs['build'] = self._create_default_job(pipeline_config)
        
        # Extract global environment variables
        global_env = pipeline_config.get('environment', {})
        
        # Extract permissions
        permissions = pipeline_config.get('permissions', {
            'contents': 'read',
            'actions': 'read'
        })
        
        # Extract concurrency settings
        concurrency = pipeline_config.get('concurrency')
        
        return GitHubActionsWorkflow(
            name=workflow_name,
            on=triggers,
            jobs=jobs,
            env=global_env,
            permissions=permissions,
            concurrency=concurrency
        )
    
    def _extract_triggers(self, pipeline_config: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and convert pipeline triggers to GitHub Actions triggers"""
        triggers = pipeline_config.get('triggers', {})
        
        github_triggers = {}
        
        # Handle push triggers
        if 'push' in triggers:
            push_config = triggers['push']
            github_triggers['push'] = {}
            
            if 'branches' in push_config:
                github_triggers['push']['branches'] = push_config['branches']
            if 'paths' in push_config:
                github_triggers['push']['paths'] = push_config['paths']
            if 'tags' in push_config:
                github_triggers['push']['tags'] = push_config['tags']
        
        # Handle pull request triggers
        if 'pull_request' in triggers:
            pr_config = triggers['pull_request']
            github_triggers['pull_request'] = {}
            
            if 'branches' in pr_config:
                github_triggers['pull_request']['branches'] = pr_config['branches']
            if 'paths' in pr_config:
                github_triggers['pull_request']['paths'] = pr_config['paths']
            if 'types' in pr_config:
                github_triggers['pull_request']['types'] = pr_config['types']
        
        # Handle schedule triggers
        if 'schedule' in triggers:
            schedule_config = triggers['schedule']
            if isinstance(schedule_config, str):
                github_triggers['schedule'] = [{'cron': schedule_config}]
            elif isinstance(schedule_config, list):
                github_triggers['schedule'] = [{'cron': cron} for cron in schedule_config]
            elif isinstance(schedule_config, dict) and 'cron' in schedule_config:
                github_triggers['schedule'] = [schedule_config]
        
        # Handle manual triggers
        if 'manual' in triggers and triggers['manual']:
            github_triggers['workflow_dispatch'] = {}
            manual_config = triggers.get('manual', {})
            if isinstance(manual_config, dict) and 'inputs' in manual_config:
                github_triggers['workflow_dispatch']['inputs'] = manual_config['inputs']
        
        # Default trigger if none specified
        if not github_triggers:
            github_triggers = {'push': {'branches': ['main', 'master']}}
        
        return github_triggers
    
    def _convert_stages_to_jobs(self, stages: List[Dict[str, Any]]) -> Dict[str, GitHubActionsJob]:
        """Convert pipeline stages to GitHub Actions jobs"""
        jobs = {}
        previous_stage_jobs = []
        
        for stage_idx, stage in enumerate(stages):
            stage_name = stage.get('name', f'stage-{stage_idx}')
            stage_jobs = self._convert_stage_to_jobs(stage, stage_name, previous_stage_jobs)
            jobs.update(stage_jobs)
            previous_stage_jobs = list(stage_jobs.keys())
        
        return jobs
    
    def _convert_stage_to_jobs(self, stage: Dict[str, Any], stage_name: str, 
                              depends_on: List[str]) -> Dict[str, GitHubActionsJob]:
        """Convert a single stage to one or more GitHub Actions jobs"""
        jobs = {}
        
        # Check if stage has parallel jobs
        if 'jobs' in stage:
            for job_idx, job in enumerate(stage['jobs']):
                job_name = job.get('name', f'{stage_name}-job-{job_idx}')
                job_id = self._sanitize_job_id(job_name)
                
                github_job = self._convert_job_to_github_job(job, job_name, depends_on)
                jobs[job_id] = github_job
        else:
            # Single job stage
            job_id = self._sanitize_job_id(stage_name)
            github_job = self._convert_job_to_github_job(stage, stage_name, depends_on)
            jobs[job_id] = github_job
        
        return jobs
    
    def _convert_nodes_to_jobs(self, nodes: List[Dict[str, Any]]) -> Dict[str, GitHubActionsJob]:
        """Convert pipeline nodes to GitHub Actions jobs"""
        jobs = {}
        node_dependencies = {}
        
        # First pass: create jobs
        for node in nodes:
            node_id = node.get('id', node.get('name', 'unnamed'))
            job_id = self._sanitize_job_id(node_id)
            
            github_job = self._convert_job_to_github_job(node, node_id, [])
            jobs[job_id] = github_job
            
            # Track dependencies
            node_dependencies[job_id] = [
                self._sanitize_job_id(dep) for dep in node.get('depends_on', [])
            ]
        
        # Second pass: set up dependencies
        for job_id, deps in node_dependencies.items():
            if deps and job_id in jobs:
                jobs[job_id].needs = [dep for dep in deps if dep in jobs]
        
        return jobs
    
    def _convert_job_to_github_job(self, job_config: Dict[str, Any], 
                                  job_name: str, depends_on: List[str]) -> GitHubActionsJob:
        """Convert a job configuration to GitHub Actions job"""
        
        # Extract job configuration
        runs_on = job_config.get('runs_on', 'ubuntu-latest')
        timeout_minutes = job_config.get('timeout', 60)
        if_condition = job_config.get('if')
        strategy = job_config.get('strategy')
        env = job_config.get('environment', {})
        outputs = job_config.get('outputs', {})
        services = job_config.get('services', {})
        
        # Convert steps
        steps = []
        job_steps = job_config.get('steps', [])
        
        for step in job_steps:
            github_step = self._convert_step(step)
            if github_step:
                steps.append(github_step)
        
        return GitHubActionsJob(
            name=job_name,
            runs_on=runs_on,
            needs=depends_on if depends_on else None,
            if_condition=if_condition,
            timeout_minutes=timeout_minutes,
            strategy=strategy,
            steps=steps,
            env=env,
            outputs=outputs,
            services=services
        )
    
    def _create_default_job(self, pipeline_config: Dict[str, Any]) -> GitHubActionsJob:
        """Create a default job from pipeline configuration"""
        steps = []
        
        # Add checkout step by default
        steps.append({
            'name': 'Checkout code',
            'uses': 'actions/checkout@v4'
        })
        
        # Convert pipeline steps
        pipeline_steps = pipeline_config.get('steps', [])
        for step in pipeline_steps:
            github_step = self._convert_step(step)
            if github_step:
                steps.append(github_step)
        
        return GitHubActionsJob(
            name='Build',
            runs_on=pipeline_config.get('runs_on', 'ubuntu-latest'),
            steps=steps,
            env=pipeline_config.get('environment', {}),
            timeout_minutes=pipeline_config.get('timeout', 60)
        )
    
    def _convert_step(self, step_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Convert a pipeline step to GitHub Actions step"""
        step_type = step_config.get('type', 'command')
        
        if step_type in self.step_converters:
            return self.step_converters[step_type](step_config)
        else:
            # Generic command step
            return self._convert_command_step(step_config)
    
    def _convert_command_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert command step to GitHub Actions step"""
        step = {
            'name': step_config.get('name', 'Run command'),
            'run': step_config.get('command', '')
        }
        
        if 'working_directory' in step_config:
            step['working-directory'] = step_config['working_directory']
        
        if 'environment' in step_config:
            step['env'] = step_config['environment']
        
        if 'if' in step_config:
            step['if'] = step_config['if']
        
        if 'continue_on_error' in step_config:
            step['continue-on-error'] = step_config['continue_on_error']
        
        return step
    
    def _convert_script_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert script step to GitHub Actions step"""
        script_content = step_config.get('script', '')
        script_type = step_config.get('script_type', 'bash')
        
        step = {
            'name': step_config.get('name', 'Run script'),
            'shell': script_type,
            'run': script_content
        }
        
        if 'working_directory' in step_config:
            step['working-directory'] = step_config['working_directory']
        
        if 'environment' in step_config:
            step['env'] = step_config['environment']
        
        return step
    
    def _convert_docker_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Docker step to GitHub Actions step"""
        image = step_config.get('image', '')
        command = step_config.get('command', '')
        
        if command:
            run_command = f"docker run --rm {image} {command}"
        else:
            run_command = f"docker run --rm {image}"
        
        # Add volume mounts
        volumes = step_config.get('volumes', [])
        for volume in volumes:
            run_command = f"docker run --rm -v {volume} {image}"
            break  # Reconstruct with all volumes
        
        if volumes:
            volume_args = ' '.join([f'-v {v}' for v in volumes])
            run_command = f"docker run --rm {volume_args} {image}"
            if command:
                run_command += f" {command}"
        
        step = {
            'name': step_config.get('name', 'Run Docker container'),
            'run': run_command
        }
        
        if 'environment' in step_config:
            step['env'] = step_config['environment']
        
        return step
    
    def _convert_api_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert API step to GitHub Actions step"""
        url = step_config.get('url', '')
        method = step_config.get('method', 'GET')
        headers = step_config.get('headers', {})
        data = step_config.get('data', {})
        
        # Build curl command
        curl_cmd = f"curl -X {method}"
        
        for key, value in headers.items():
            curl_cmd += f" -H '{key}: {value}'"
        
        if data and method in ['POST', 'PUT', 'PATCH']:
            if isinstance(data, dict):
                curl_cmd += f" -d '{json.dumps(data)}'"
            else:
                curl_cmd += f" -d '{data}'"
            curl_cmd += " -H 'Content-Type: application/json'"
        
        curl_cmd += f" '{url}'"
        
        return {
            'name': step_config.get('name', 'API call'),
            'run': curl_cmd
        }
    
    def _convert_test_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert test step to GitHub Actions step"""
        test_command = step_config.get('test_command', 'npm test')
        
        step = {
            'name': step_config.get('name', 'Run tests'),
            'run': test_command
        }
        
        if 'working_directory' in step_config:
            step['working-directory'] = step_config['working_directory']
        
        if 'environment' in step_config:
            step['env'] = step_config['environment']
        
        return step
    
    def _convert_checkout_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert checkout step to GitHub Actions step"""
        step = {
            'name': step_config.get('name', 'Checkout code'),
            'uses': 'actions/checkout@v4'
        }
        
        with_params = {}
        if 'ref' in step_config:
            with_params['ref'] = step_config['ref']
        if 'fetch_depth' in step_config:
            with_params['fetch-depth'] = step_config['fetch_depth']
        if 'token' in step_config:
            with_params['token'] = step_config['token']
        
        if with_params:
            step['with'] = with_params
        
        return step
    
    def _convert_cache_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert cache step to GitHub Actions step"""
        step = {
            'name': step_config.get('name', 'Cache dependencies'),
            'uses': 'actions/cache@v3',
            'with': {
                'path': step_config.get('path', '~/.cache'),
                'key': step_config.get('key', '${{ runner.os }}-cache-${{ hashFiles(\'**/package-lock.json\') }}')
            }
        }
        
        if 'restore_keys' in step_config:
            step['with']['restore-keys'] = step_config['restore_keys']
        
        return step
    
    def _convert_upload_artifacts_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert upload artifacts step to GitHub Actions step"""
        return {
            'name': step_config.get('name', 'Upload artifacts'),
            'uses': 'actions/upload-artifact@v3',
            'with': {
                'name': step_config.get('artifact_name', 'build-artifacts'),
                'path': step_config.get('path', 'dist/')
            }
        }
    
    def _convert_download_artifacts_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert download artifacts step to GitHub Actions step"""
        return {
            'name': step_config.get('name', 'Download artifacts'),
            'uses': 'actions/download-artifact@v3',
            'with': {
                'name': step_config.get('artifact_name', 'build-artifacts'),
                'path': step_config.get('path', '.')
            }
        }
    
    def _convert_deploy_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert deploy step to GitHub Actions step"""
        deploy_type = step_config.get('deploy_type', 'custom')
        
        if deploy_type == 'pages':
            return {
                'name': step_config.get('name', 'Deploy to GitHub Pages'),
                'uses': 'peaceiris/actions-gh-pages@v3',
                'with': {
                    'github_token': '${{ secrets.GITHUB_TOKEN }}',
                    'publish_dir': step_config.get('source_dir', './dist')
                }
            }
        elif deploy_type == 'heroku':
            return {
                'name': step_config.get('name', 'Deploy to Heroku'),
                'uses': 'akhileshns/heroku-deploy@v3.12.12',
                'with': {
                    'heroku_api_key': '${{ secrets.HEROKU_API_KEY }}',
                    'heroku_app_name': step_config.get('app_name', ''),
                    'heroku_email': step_config.get('email', '')
                }
            }
        else:
            # Custom deploy command
            return {
                'name': step_config.get('name', 'Deploy'),
                'run': step_config.get('command', 'echo "No deploy command specified"')
            }
    
    def _sanitize_job_id(self, name: str) -> str:
        """Sanitize job name for use as GitHub Actions job ID"""
        # Replace invalid characters with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
        # Ensure it starts with letter or underscore
        if sanitized and not sanitized[0].isalpha() and sanitized[0] != '_':
            sanitized = f'job_{sanitized}'
        return sanitized.lower()
    
    def workflow_to_yaml(self, workflow: GitHubActionsWorkflow) -> str:
        """Convert workflow to YAML string"""
        workflow_dict = {
            'name': workflow.name,
            'on': workflow.on
        }
        
        if workflow.env:
            workflow_dict['env'] = workflow.env
        
        if workflow.permissions:
            workflow_dict['permissions'] = workflow.permissions
        
        if workflow.concurrency:
            workflow_dict['concurrency'] = workflow.concurrency
        
        if workflow.defaults:
            workflow_dict['defaults'] = workflow.defaults
        
        # Convert jobs
        jobs_dict = {}
        for job_id, job in workflow.jobs.items():
            job_dict = {
                'name': job.name,
                'runs-on': job.runs_on
            }
            
            if job.needs:
                job_dict['needs'] = job.needs
            
            if job.if_condition:
                job_dict['if'] = job.if_condition
            
            if job.timeout_minutes != 60:
                job_dict['timeout-minutes'] = job.timeout_minutes
            
            if job.strategy:
                job_dict['strategy'] = job.strategy
            
            if job.env:
                job_dict['env'] = job.env
            
            if job.outputs:
                job_dict['outputs'] = job.outputs
            
            if job.services:
                job_dict['services'] = job.services
            
            if job.steps:
                job_dict['steps'] = job.steps
            
            jobs_dict[job_id] = job_dict
        
        workflow_dict['jobs'] = jobs_dict
        
        return yaml.dump(workflow_dict, default_flow_style=False, sort_keys=False)
    
    def save_workflow(self, workflow: GitHubActionsWorkflow, 
                     output_path: str = None) -> str:
        """Save workflow to file and return the file path"""
        if output_path is None:
            # Generate filename from workflow name
            safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', workflow.name.lower())
            output_path = f".github/workflows/{safe_name}.yml"
        
        yaml_content = self.workflow_to_yaml(workflow)
        
        # Ensure directory exists
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to file
        output_file.write_text(yaml_content)
        
        return str(output_file)
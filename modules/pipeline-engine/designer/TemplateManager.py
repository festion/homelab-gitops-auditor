#!/usr/bin/env python3
"""
Template Manager - Pipeline template management and application

Manages pipeline templates, template library, and template application
to new repositories with customization capabilities.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import yaml
from PipelineBuilder import Pipeline, PipelineBuilder, NodeType


@dataclass
class TemplateMetadata:
    """Pipeline template metadata"""
    id: str
    name: str
    description: str
    version: str
    author: str
    tags: List[str]
    created_at: datetime
    updated_at: datetime
    downloads: int = 0
    rating: float = 0.0
    language: Optional[str] = None
    framework: Optional[str] = None
    deployment_target: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            **asdict(self),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TemplateMetadata':
        return cls(
            **{k: v for k, v in data.items() if k not in ['created_at', 'updated_at']},
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at'])
        )


@dataclass
class PipelineTemplate:
    """Complete pipeline template"""
    metadata: TemplateMetadata
    pipeline: Pipeline
    parameters: Dict[str, Any]  # Template parameters for customization
    documentation: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'metadata': self.metadata.to_dict(),
            'pipeline': self.pipeline.to_dict(),
            'parameters': self.parameters,
            'documentation': self.documentation
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PipelineTemplate':
        return cls(
            metadata=TemplateMetadata.from_dict(data['metadata']),
            pipeline=Pipeline.from_dict(data['pipeline']),
            parameters=data['parameters'],
            documentation=data.get('documentation', '')
        )


class TemplateManager:
    """Main template management class"""
    
    def __init__(self, templates_dir: str = "templates"):
        self.templates_dir = templates_dir
        self.builder = PipelineBuilder()
        self._ensure_templates_directory()
        self._load_builtin_templates()
    
    def _ensure_templates_directory(self):
        """Create templates directory if it doesn't exist"""
        os.makedirs(self.templates_dir, exist_ok=True)
        os.makedirs(os.path.join(self.templates_dir, "builtin"), exist_ok=True)
        os.makedirs(os.path.join(self.templates_dir, "custom"), exist_ok=True)
    
    def _load_builtin_templates(self):
        """Load built-in pipeline templates"""
        builtin_templates = [
            self._create_nodejs_template(),
            self._create_python_template(),
            self._create_docker_template(),
            self._create_static_site_template(),
            self._create_microservice_template()
        ]
        
        for template in builtin_templates:
            self.save_template(template, builtin=True)
    
    def _create_nodejs_template(self) -> PipelineTemplate:
        """Create Node.js CI/CD template"""
        # Create pipeline
        pipeline = self.builder.create_pipeline(
            name="Node.js CI/CD",
            description="Complete Node.js build, test, and deployment pipeline",
            repository="{{repository}}"
        )
        
        # Add trigger configuration
        pipeline.config.triggers = ["push", "pull_request"]
        pipeline.config.environment_variables = {
            "NODE_VERSION": "{{node_version}}",
            "NPM_REGISTRY": "{{npm_registry}}"
        }
        
        # Source node
        source_id = self.builder.add_node(
            pipeline,
            NodeType.SOURCE,
            "Checkout Source",
            {
                "repository": "{{repository}}",
                "branch": "{{branch}}",
                "checkout_path": "."
            },
            {"x": 100, "y": 100}
        )
        
        # Install dependencies
        install_id = self.builder.add_node(
            pipeline,
            NodeType.BUILD,
            "Install Dependencies",
            {
                "build_command": "{{package_manager}} install",
                "cache_key": "{{package_manager}}-{{arch}}-{{hash_files('package-lock.json', 'yarn.lock')}}"
            },
            {"x": 300, "y": 100}
        )
        
        # Lint code
        lint_id = self.builder.add_node(
            pipeline,
            NodeType.TEST,
            "Lint Code",
            {
                "test_command": "{{package_manager}} run lint",
                "test_results_format": "junit"
            },
            {"x": 500, "y": 50}
        )
        
        # Run tests
        test_id = self.builder.add_node(
            pipeline,
            NodeType.TEST,
            "Run Tests",
            {
                "test_command": "{{package_manager}} test",
                "coverage_threshold": 80,
                "test_results_format": "junit"
            },
            {"x": 500, "y": 150}
        )
        
        # Build application
        build_id = self.builder.add_node(
            pipeline,
            NodeType.BUILD,
            "Build Application",
            {
                "build_command": "{{package_manager}} run build",
                "artifacts": ["dist/", "build/"]
            },
            {"x": 700, "y": 100}
        )
        
        # Deploy to staging
        staging_deploy_id = self.builder.add_node(
            pipeline,
            NodeType.DEPLOY,
            "Deploy to Staging",
            {
                "target_environment": "staging",
                "deploy_command": "{{deploy_command_staging}}",
                "health_check_url": "{{staging_url}}/health"
            },
            {"x": 900, "y": 50}
        )
        
        # Deploy to production
        prod_deploy_id = self.builder.add_node(
            pipeline,
            NodeType.DEPLOY,
            "Deploy to Production",
            {
                "target_environment": "production",
                "deploy_command": "{{deploy_command_prod}}",
                "health_check_url": "{{prod_url}}/health",
                "rollback_enabled": True,
                "strategy": "rolling"
            },
            {"x": 900, "y": 150}
        )
        
        # Notification
        notify_id = self.builder.add_node(
            pipeline,
            NodeType.NOTIFICATION,
            "Notify Team",
            {
                "notification_type": "{{notification_type}}",
                "recipients": "{{notification_recipients}}",
                "conditions": ["on_failure", "on_success"]
            },
            {"x": 1100, "y": 100}
        )
        
        # Connect nodes
        self.builder.connect_nodes(pipeline, source_id, install_id)
        self.builder.connect_nodes(pipeline, install_id, lint_id)
        self.builder.connect_nodes(pipeline, install_id, test_id)
        self.builder.connect_nodes(pipeline, lint_id, build_id)
        self.builder.connect_nodes(pipeline, test_id, build_id)
        self.builder.connect_nodes(pipeline, build_id, staging_deploy_id)
        self.builder.connect_nodes(pipeline, staging_deploy_id, prod_deploy_id)
        self.builder.connect_nodes(pipeline, prod_deploy_id, notify_id)
        
        # Template metadata
        metadata = TemplateMetadata(
            id="nodejs-cicd",
            name="Node.js CI/CD",
            description="Complete CI/CD pipeline for Node.js applications with testing, building, and deployment",
            version="1.0.0",
            author="DevOps Platform",
            tags=["nodejs", "javascript", "cicd", "testing", "deployment"],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            language="javascript",
            framework="nodejs"
        )
        
        # Template parameters
        parameters = {
            "repository": {
                "type": "string",
                "description": "Repository name (owner/repo)",
                "required": True,
                "example": "myorg/myapp"
            },
            "branch": {
                "type": "string", 
                "description": "Main branch name",
                "default": "main",
                "example": "main"
            },
            "node_version": {
                "type": "string",
                "description": "Node.js version",
                "default": "18",
                "options": ["16", "18", "20"]
            },
            "package_manager": {
                "type": "string",
                "description": "Package manager to use",
                "default": "npm",
                "options": ["npm", "yarn", "pnpm"]
            },
            "npm_registry": {
                "type": "string",
                "description": "NPM registry URL",
                "default": "https://registry.npmjs.org"
            },
            "staging_url": {
                "type": "string",
                "description": "Staging environment URL",
                "required": True,
                "example": "https://staging.myapp.com"
            },
            "prod_url": {
                "type": "string",
                "description": "Production environment URL", 
                "required": True,
                "example": "https://myapp.com"
            },
            "deploy_command_staging": {
                "type": "string",
                "description": "Staging deployment command",
                "default": "npm run deploy:staging"
            },
            "deploy_command_prod": {
                "type": "string",
                "description": "Production deployment command",
                "default": "npm run deploy:prod"
            },
            "notification_type": {
                "type": "string",
                "description": "Notification method",
                "default": "email",
                "options": ["email", "slack", "teams", "webhook"]
            },
            "notification_recipients": {
                "type": "array",
                "description": "Notification recipients",
                "default": [],
                "example": ["team@company.com"]
            }
        }
        
        documentation = """
# Node.js CI/CD Pipeline Template

This template provides a complete CI/CD pipeline for Node.js applications including:

## Features
- Source code checkout
- Dependency installation with caching
- Code linting (ESLint)
- Unit testing with coverage
- Application building
- Staging deployment with health checks
- Production deployment with rollback capability
- Team notifications

## Prerequisites
- Node.js application with package.json
- Test scripts configured (npm test)
- Build scripts configured (npm run build)
- Deployment scripts configured

## Configuration
The template supports multiple package managers (npm, yarn, pnpm) and deployment strategies.
Configure the parameters according to your project requirements.

## Usage
1. Apply the template to your repository
2. Configure the required parameters
3. Customize deployment commands
4. Set up notification preferences
5. Run the pipeline

## Best Practices
- Use specific Node.js versions for consistency
- Configure proper test coverage thresholds
- Set up health checks for deployments
- Enable rollback for production deployments
"""
        
        return PipelineTemplate(
            metadata=metadata,
            pipeline=pipeline,
            parameters=parameters,
            documentation=documentation
        )
    
    def _create_python_template(self) -> PipelineTemplate:
        """Create Python CI/CD template"""
        pipeline = self.builder.create_pipeline(
            name="Python CI/CD",
            description="Python application with testing and deployment",
            repository="{{repository}}"
        )
        
        # Source
        source_id = self.builder.add_node(
            pipeline, NodeType.SOURCE, "Checkout Source",
            {"repository": "{{repository}}", "branch": "{{branch}}"},
            {"x": 100, "y": 100}
        )
        
        # Setup Python
        setup_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Setup Python",
            {"build_command": "python -m pip install --upgrade pip && pip install -r requirements.txt"},
            {"x": 300, "y": 100}
        )
        
        # Lint
        lint_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Lint Code",
            {"test_command": "{{linter}} {{source_path}}"},
            {"x": 500, "y": 50}
        )
        
        # Test
        test_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Run Tests",
            {"test_command": "{{test_runner}} {{test_path}}", "coverage_threshold": 85},
            {"x": 500, "y": 150}
        )
        
        # Package
        package_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Package Application",
            {"build_command": "python setup.py sdist bdist_wheel"},
            {"x": 700, "y": 100}
        )
        
        # Deploy
        deploy_id = self.builder.add_node(
            pipeline, NodeType.DEPLOY, "Deploy",
            {"target_environment": "{{environment}}", "deploy_command": "{{deploy_command}}"},
            {"x": 900, "y": 100}
        )
        
        # Connect
        self.builder.connect_nodes(pipeline, source_id, setup_id)
        self.builder.connect_nodes(pipeline, setup_id, lint_id)
        self.builder.connect_nodes(pipeline, setup_id, test_id)
        self.builder.connect_nodes(pipeline, lint_id, package_id)
        self.builder.connect_nodes(pipeline, test_id, package_id)
        self.builder.connect_nodes(pipeline, package_id, deploy_id)
        
        metadata = TemplateMetadata(
            id="python-cicd",
            name="Python CI/CD",
            description="CI/CD pipeline for Python applications",
            version="1.0.0",
            author="DevOps Platform",
            tags=["python", "cicd", "testing"],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            language="python"
        )
        
        parameters = {
            "repository": {"type": "string", "required": True},
            "branch": {"type": "string", "default": "main"},
            "python_version": {"type": "string", "default": "3.9"},
            "linter": {"type": "string", "default": "flake8", "options": ["flake8", "pylint", "black"]},
            "test_runner": {"type": "string", "default": "pytest", "options": ["pytest", "unittest"]},
            "source_path": {"type": "string", "default": "src/"},
            "test_path": {"type": "string", "default": "tests/"},
            "environment": {"type": "string", "default": "staging"},
            "deploy_command": {"type": "string", "default": "pip install dist/*.whl"}
        }
        
        return PipelineTemplate(metadata=metadata, pipeline=pipeline, parameters=parameters)
    
    def _create_docker_template(self) -> PipelineTemplate:
        """Create Docker-based deployment template"""
        pipeline = self.builder.create_pipeline(
            name="Docker CI/CD",
            description="Docker-based containerized application pipeline",
            repository="{{repository}}"
        )
        
        # Source
        source_id = self.builder.add_node(
            pipeline, NodeType.SOURCE, "Checkout Source",
            {"repository": "{{repository}}", "branch": "{{branch}}"},
            {"x": 100, "y": 100}
        )
        
        # Build Docker image
        build_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Build Docker Image",
            {
                "build_command": "docker build -t {{image_name}}:{{tag}} .",
                "artifacts": ["{{image_name}}:{{tag}}"]
            },
            {"x": 300, "y": 100}
        )
        
        # Test image
        test_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Test Docker Image",
            {"test_command": "docker run --rm {{image_name}}:{{tag}} {{test_command}}"},
            {"x": 500, "y": 100}
        )
        
        # Push to registry
        push_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Push to Registry",
            {"build_command": "docker push {{image_name}}:{{tag}}"},
            {"x": 700, "y": 100}
        )
        
        # Deploy
        deploy_id = self.builder.add_node(
            pipeline, NodeType.DEPLOY, "Deploy Container",
            {
                "target_environment": "{{environment}}",
                "deploy_command": "{{deploy_command}}",
                "health_check_url": "{{health_check_url}}"
            },
            {"x": 900, "y": 100}
        )
        
        # Connect
        self.builder.connect_nodes(pipeline, source_id, build_id)
        self.builder.connect_nodes(pipeline, build_id, test_id)
        self.builder.connect_nodes(pipeline, test_id, push_id)
        self.builder.connect_nodes(pipeline, push_id, deploy_id)
        
        metadata = TemplateMetadata(
            id="docker-cicd",
            name="Docker CI/CD",
            description="Containerized application deployment pipeline",
            version="1.0.0",
            author="DevOps Platform",
            tags=["docker", "containers", "cicd"],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deployment_target="docker"
        )
        
        parameters = {
            "repository": {"type": "string", "required": True},
            "branch": {"type": "string", "default": "main"},
            "image_name": {"type": "string", "required": True},
            "tag": {"type": "string", "default": "latest"},
            "test_command": {"type": "string", "default": "npm test"},
            "environment": {"type": "string", "default": "staging"},
            "deploy_command": {"type": "string", "required": True},
            "health_check_url": {"type": "string", "required": False}
        }
        
        return PipelineTemplate(metadata=metadata, pipeline=pipeline, parameters=parameters)
    
    def _create_static_site_template(self) -> PipelineTemplate:
        """Create static site deployment template"""
        pipeline = self.builder.create_pipeline(
            name="Static Site CI/CD",
            description="Static site generation and deployment",
            repository="{{repository}}"
        )
        
        # Source
        source_id = self.builder.add_node(
            pipeline, NodeType.SOURCE, "Checkout Source",
            {"repository": "{{repository}}", "branch": "{{branch}}"},
            {"x": 100, "y": 100}
        )
        
        # Install dependencies
        install_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Install Dependencies",
            {"build_command": "{{package_manager}} install"},
            {"x": 300, "y": 100}
        )
        
        # Build site
        build_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Build Site",
            {"build_command": "{{build_command}}", "artifacts": ["{{output_dir}}"]},
            {"x": 500, "y": 100}
        )
        
        # Deploy
        deploy_id = self.builder.add_node(
            pipeline, NodeType.DEPLOY, "Deploy Site",
            {
                "target_environment": "{{environment}}",
                "deploy_command": "{{deploy_command}}"
            },
            {"x": 700, "y": 100}
        )
        
        # Connect
        self.builder.connect_nodes(pipeline, source_id, install_id)
        self.builder.connect_nodes(pipeline, install_id, build_id)
        self.builder.connect_nodes(pipeline, build_id, deploy_id)
        
        metadata = TemplateMetadata(
            id="static-site-cicd",
            name="Static Site CI/CD", 
            description="Static site generation and deployment pipeline",
            version="1.0.0",
            author="DevOps Platform",
            tags=["static-site", "jamstack", "cicd"],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deployment_target="static"
        )
        
        parameters = {
            "repository": {"type": "string", "required": True},
            "branch": {"type": "string", "default": "main"},
            "package_manager": {"type": "string", "default": "npm", "options": ["npm", "yarn"]},
            "build_command": {"type": "string", "default": "npm run build"},
            "output_dir": {"type": "string", "default": "dist"},
            "environment": {"type": "string", "default": "production"},
            "deploy_command": {"type": "string", "required": True}
        }
        
        return PipelineTemplate(metadata=metadata, pipeline=pipeline, parameters=parameters)
    
    def _create_microservice_template(self) -> PipelineTemplate:
        """Create microservice deployment template"""
        pipeline = self.builder.create_pipeline(
            name="Microservice CI/CD",
            description="Microservice with testing, building, and Kubernetes deployment",
            repository="{{repository}}"
        )
        
        # Source
        source_id = self.builder.add_node(
            pipeline, NodeType.SOURCE, "Checkout Source",
            {"repository": "{{repository}}", "branch": "{{branch}}"},
            {"x": 100, "y": 100}
        )
        
        # Unit tests
        unit_test_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Unit Tests",
            {"test_command": "{{unit_test_command}}", "coverage_threshold": 90},
            {"x": 300, "y": 50}
        )
        
        # Integration tests
        integration_test_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Integration Tests",
            {"test_command": "{{integration_test_command}}"},
            {"x": 300, "y": 150}
        )
        
        # Build service
        build_id = self.builder.add_node(
            pipeline, NodeType.BUILD, "Build Service",
            {"build_command": "{{build_command}}"},
            {"x": 500, "y": 100}
        )
        
        # Security scan
        security_id = self.builder.add_node(
            pipeline, NodeType.TEST, "Security Scan",
            {"test_command": "{{security_scan_command}}"},
            {"x": 700, "y": 50}
        )
        
        # Deploy to K8s
        deploy_id = self.builder.add_node(
            pipeline, NodeType.DEPLOY, "Deploy to Kubernetes",
            {
                "target_environment": "{{environment}}",
                "deploy_command": "kubectl apply -f k8s/{{environment}}/",
                "health_check_url": "{{service_url}}/health",
                "rollback_enabled": True
            },
            {"x": 700, "y": 150}
        )
        
        # Connect
        self.builder.connect_nodes(pipeline, source_id, unit_test_id)
        self.builder.connect_nodes(pipeline, source_id, integration_test_id)
        self.builder.connect_nodes(pipeline, unit_test_id, build_id)
        self.builder.connect_nodes(pipeline, integration_test_id, build_id)
        self.builder.connect_nodes(pipeline, build_id, security_id)
        self.builder.connect_nodes(pipeline, build_id, deploy_id)
        
        metadata = TemplateMetadata(
            id="microservice-cicd",
            name="Microservice CI/CD",
            description="Complete microservice pipeline with K8s deployment",
            version="1.0.0",
            author="DevOps Platform",
            tags=["microservice", "kubernetes", "cicd", "security"],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deployment_target="kubernetes"
        )
        
        parameters = {
            "repository": {"type": "string", "required": True},
            "branch": {"type": "string", "default": "main"},
            "unit_test_command": {"type": "string", "default": "npm run test:unit"},
            "integration_test_command": {"type": "string", "default": "npm run test:integration"},
            "build_command": {"type": "string", "default": "docker build -t {{service_name}} ."},
            "security_scan_command": {"type": "string", "default": "npm audit"},
            "environment": {"type": "string", "default": "staging"},
            "service_name": {"type": "string", "required": True},
            "service_url": {"type": "string", "required": True}
        }
        
        return PipelineTemplate(metadata=metadata, pipeline=pipeline, parameters=parameters)
    
    def save_template(self, template: PipelineTemplate, builtin: bool = False) -> bool:
        """Save template to disk"""
        try:
            subdir = "builtin" if builtin else "custom"
            filepath = os.path.join(self.templates_dir, subdir, f"{template.metadata.id}.json")
            
            with open(filepath, 'w') as f:
                json.dump(template.to_dict(), f, indent=2)
            
            return True
        except Exception as e:
            print(f"Error saving template: {e}")
            return False
    
    def load_template(self, template_id: str) -> Optional[PipelineTemplate]:
        """Load template from disk"""
        for subdir in ["custom", "builtin"]:
            filepath = os.path.join(self.templates_dir, subdir, f"{template_id}.json")
            if os.path.exists(filepath):
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                    return PipelineTemplate.from_dict(data)
                except Exception as e:
                    print(f"Error loading template {template_id}: {e}")
        return None
    
    def list_templates(self, tags: List[str] = None, language: str = None) -> List[TemplateMetadata]:
        """List available templates with optional filtering"""
        templates = []
        
        for subdir in ["builtin", "custom"]:
            template_dir = os.path.join(self.templates_dir, subdir)
            if not os.path.exists(template_dir):
                continue
                
            for filename in os.listdir(template_dir):
                if filename.endswith('.json'):
                    try:
                        with open(os.path.join(template_dir, filename), 'r') as f:
                            data = json.load(f)
                        
                        metadata = TemplateMetadata.from_dict(data['metadata'])
                        
                        # Apply filters
                        if tags and not any(tag in metadata.tags for tag in tags):
                            continue
                        if language and metadata.language != language:
                            continue
                        
                        templates.append(metadata)
                    except Exception as e:
                        print(f"Error reading template {filename}: {e}")
        
        return sorted(templates, key=lambda t: (t.downloads, t.rating), reverse=True)
    
    def apply_template(self, template_id: str, target_repository: str, 
                      parameters: Dict[str, Any]) -> Optional[Pipeline]:
        """Apply template to create a new pipeline"""
        template = self.load_template(template_id)
        if not template:
            return None
        
        # Clone the template pipeline
        new_pipeline = self.builder.clone_pipeline(
            template.pipeline,
            f"{target_repository} Pipeline"
        )
        
        # Update repository in config
        new_pipeline.config.repository = target_repository
        
        # Apply parameter substitution
        self._apply_parameters(new_pipeline, template.parameters, parameters)
        
        # Update metadata
        template.metadata.downloads += 1
        template.metadata.updated_at = datetime.now()
        self.save_template(template, template_id.startswith('builtin'))
        
        return new_pipeline
    
    def _apply_parameters(self, pipeline: Pipeline, template_params: Dict[str, Any], 
                         user_params: Dict[str, Any]):
        """Apply parameter substitution to pipeline"""
        # Merge with defaults
        final_params = {}
        for param_name, param_config in template_params.items():
            if param_name in user_params:
                final_params[param_name] = user_params[param_name]
            elif 'default' in param_config:
                final_params[param_name] = param_config['default']
            elif param_config.get('required', False):
                raise ValueError(f"Required parameter '{param_name}' not provided")
        
        # Apply substitution to pipeline config
        pipeline.config.repository = self._substitute_string(
            pipeline.config.repository, final_params
        )
        
        # Apply to environment variables
        for key, value in pipeline.config.environment_variables.items():
            pipeline.config.environment_variables[key] = self._substitute_string(
                str(value), final_params
            )
        
        # Apply to nodes
        for node in pipeline.nodes:
            for config_key, config_value in node.config.items():
                if isinstance(config_value, str):
                    node.config[config_key] = self._substitute_string(config_value, final_params)
                elif isinstance(config_value, list):
                    node.config[config_key] = [
                        self._substitute_string(str(item), final_params) if isinstance(item, str) else item
                        for item in config_value
                    ]
    
    def _substitute_string(self, template_str: str, params: Dict[str, Any]) -> str:
        """Substitute template variables in string"""
        import re
        
        def replace_var(match):
            var_name = match.group(1)
            return str(params.get(var_name, match.group(0)))
        
        return re.sub(r'\{\{(\w+)\}\}', replace_var, template_str)
    
    def create_custom_template(self, pipeline: Pipeline, metadata: TemplateMetadata,
                              parameters: Dict[str, Any], documentation: str = "") -> PipelineTemplate:
        """Create a custom template from an existing pipeline"""
        template = PipelineTemplate(
            metadata=metadata,
            pipeline=pipeline,
            parameters=parameters,
            documentation=documentation
        )
        
        if self.save_template(template, builtin=False):
            return template
        else:
            raise Exception("Failed to save custom template")
    
    def delete_template(self, template_id: str) -> bool:
        """Delete a custom template"""
        filepath = os.path.join(self.templates_dir, "custom", f"{template_id}.json")
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                return True
            except Exception as e:
                print(f"Error deleting template: {e}")
        return False
    
    def export_template(self, template_id: str, export_format: str = "json") -> Optional[str]:
        """Export template in various formats"""
        template = self.load_template(template_id)
        if not template:
            return None
        
        if export_format == "json":
            return json.dumps(template.to_dict(), indent=2)
        elif export_format == "yaml":
            return yaml.dump(template.to_dict(), default_flow_style=False)
        else:
            return None
    
    def import_template(self, template_data: str, format_type: str = "json") -> Optional[PipelineTemplate]:
        """Import template from external source"""
        try:
            if format_type == "json":
                data = json.loads(template_data)
            elif format_type == "yaml":
                data = yaml.safe_load(template_data)
            else:
                return None
            
            template = PipelineTemplate.from_dict(data)
            
            # Ensure unique ID
            original_id = template.metadata.id
            counter = 1
            while self.load_template(template.metadata.id):
                template.metadata.id = f"{original_id}-{counter}"
                counter += 1
            
            if self.save_template(template, builtin=False):
                return template
            
        except Exception as e:
            print(f"Error importing template: {e}")
        
        return None


# Example usage
if __name__ == "__main__":
    manager = TemplateManager()
    
    # List available templates
    templates = manager.list_templates()
    print(f"Available templates: {len(templates)}")
    for template in templates:
        print(f"  - {template.name} ({template.id})")
    
    # Apply a template
    pipeline = manager.apply_template(
        "nodejs-cicd",
        "myorg/myapp", 
        {
            "repository": "myorg/myapp",
            "node_version": "18",
            "package_manager": "npm",
            "staging_url": "https://staging.myapp.com",
            "prod_url": "https://myapp.com",
            "notification_recipients": ["team@myorg.com"]
        }
    )
    
    if pipeline:
        print(f"Created pipeline: {pipeline.config.name}")
        print(f"Nodes: {len(pipeline.nodes)}")
        print(f"Connections: {len(pipeline.connections)}")
#!/usr/bin/env python3
"""
Node Validator - Pipeline node validation and type checking

Provides comprehensive validation for pipeline nodes including configuration
validation, dependency checking, and runtime environment verification.
"""

import re
import json
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass
from enum import Enum
from PipelineBuilder import PipelineNode, NodeType, Pipeline


class ValidationLevel(Enum):
    """Validation severity levels"""
    ERROR = "error"
    WARNING = "warning"  
    INFO = "info"


@dataclass
class ValidationResult:
    """Individual validation result"""
    level: ValidationLevel
    message: str
    field: Optional[str] = None
    suggestion: Optional[str] = None


@dataclass
class NodeValidationReport:
    """Complete validation report for a node"""
    node_id: str
    node_name: str
    is_valid: bool
    results: List[ValidationResult]
    
    @property
    def errors(self) -> List[ValidationResult]:
        return [r for r in self.results if r.level == ValidationLevel.ERROR]
    
    @property 
    def warnings(self) -> List[ValidationResult]:
        return [r for r in self.results if r.level == ValidationLevel.WARNING]
    
    @property
    def infos(self) -> List[ValidationResult]:
        return [r for r in self.results if r.level == ValidationLevel.INFO]


class NodeValidator:
    """Main node validation class"""
    
    def __init__(self):
        self.validation_rules = self._load_validation_rules()
        self.field_validators = self._setup_field_validators()
    
    def _load_validation_rules(self) -> Dict[str, Dict[str, Any]]:
        """Load validation rules for each node type"""
        return {
            NodeType.SOURCE.value: {
                "required_fields": ["repository", "branch"],
                "optional_fields": ["checkout_path", "submodules", "depth", "token"],
                "field_types": {
                    "repository": str,
                    "branch": str,
                    "checkout_path": str,
                    "submodules": bool,
                    "depth": int,
                    "token": str
                },
                "field_patterns": {
                    "repository": r"^[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)*$",
                    "branch": r"^[a-zA-Z0-9._/-]+$"
                },
                "dependencies": {
                    "min_inputs": 0,
                    "max_inputs": 0,
                    "min_outputs": 1,
                    "max_outputs": 1
                }
            },
            NodeType.BUILD.value: {
                "required_fields": ["build_command"],
                "optional_fields": ["build_path", "artifacts", "cache_key", "environment"],
                "field_types": {
                    "build_command": str,
                    "build_path": str,
                    "artifacts": list,
                    "cache_key": str,
                    "environment": dict
                },
                "field_patterns": {
                    "build_command": r".+",  # Non-empty string
                    "build_path": r"^[a-zA-Z0-9._/-]+$"
                },
                "dependencies": {
                    "min_inputs": 1,
                    "max_inputs": 5,
                    "min_outputs": 0,
                    "max_outputs": 3
                }
            },
            NodeType.TEST.value: {
                "required_fields": ["test_command"],
                "optional_fields": ["test_path", "coverage_threshold", "test_results_format", "parallel"],
                "field_types": {
                    "test_command": str,
                    "test_path": str,
                    "coverage_threshold": (int, float),
                    "test_results_format": str,
                    "parallel": bool
                },
                "field_patterns": {
                    "test_command": r".+",
                    "test_path": r"^[a-zA-Z0-9._/-]*$",
                    "test_results_format": r"^(junit|tap|json)$"
                },
                "field_ranges": {
                    "coverage_threshold": (0, 100)
                },
                "dependencies": {
                    "min_inputs": 1,
                    "max_inputs": 3,
                    "min_outputs": 0,
                    "max_outputs": 2
                }
            },
            NodeType.DEPLOY.value: {
                "required_fields": ["target_environment", "deploy_command"],
                "optional_fields": ["health_check_url", "rollback_enabled", "timeout", "strategy"],
                "field_types": {
                    "target_environment": str,
                    "deploy_command": str,
                    "health_check_url": str,
                    "rollback_enabled": bool,
                    "timeout": int,
                    "strategy": str
                },
                "field_patterns": {
                    "target_environment": r"^(dev|staging|prod|production)$",
                    "deploy_command": r".+",
                    "health_check_url": r"^https?://[a-zA-Z0-9.-]+",
                    "strategy": r"^(rolling|blue-green|canary)$"
                },
                "field_ranges": {
                    "timeout": (30, 3600)
                },
                "dependencies": {
                    "min_inputs": 1,
                    "max_inputs": 2,
                    "min_outputs": 0,
                    "max_outputs": 1
                }
            },
            NodeType.NOTIFICATION.value: {
                "required_fields": ["notification_type", "recipients"],
                "optional_fields": ["message_template", "conditions", "webhook_url"],
                "field_types": {
                    "notification_type": str,
                    "recipients": list,
                    "message_template": str,
                    "conditions": list,
                    "webhook_url": str
                },
                "field_patterns": {
                    "notification_type": r"^(email|slack|webhook|teams)$",
                    "webhook_url": r"^https?://[a-zA-Z0-9.-]+"
                },
                "dependencies": {
                    "min_inputs": 0,
                    "max_inputs": 10,
                    "min_outputs": 0,
                    "max_outputs": 0
                }
            },
            NodeType.CONDITION.value: {
                "required_fields": ["condition_expression"],
                "optional_fields": ["true_branch", "false_branch", "timeout"],
                "field_types": {
                    "condition_expression": str,
                    "true_branch": str,
                    "false_branch": str,
                    "timeout": int
                },
                "field_patterns": {
                    "condition_expression": r".+"
                },
                "dependencies": {
                    "min_inputs": 0,
                    "max_inputs": 5,
                    "min_outputs": 0,
                    "max_outputs": 5
                }
            }
        }
    
    def _setup_field_validators(self) -> Dict[str, callable]:
        """Setup custom field validation functions"""
        return {
            "email_list": self._validate_email_list,
            "url": self._validate_url,
            "json_string": self._validate_json_string,
            "command": self._validate_command,
            "environment_vars": self._validate_environment_vars
        }
    
    def validate_node(self, node: PipelineNode, pipeline_context: Optional[Pipeline] = None) -> NodeValidationReport:
        """Validate a single pipeline node"""
        results = []
        
        # Get validation rules for this node type
        rules = self.validation_rules.get(node.type.value, {})
        
        # Validate required fields
        results.extend(self._validate_required_fields(node, rules))
        
        # Validate field types
        results.extend(self._validate_field_types(node, rules))
        
        # Validate field patterns
        results.extend(self._validate_field_patterns(node, rules))
        
        # Validate field ranges
        results.extend(self._validate_field_ranges(node, rules))
        
        # Validate dependencies if pipeline context provided
        if pipeline_context:
            results.extend(self._validate_node_dependencies(node, pipeline_context, rules))
        
        # Validate node-specific logic
        results.extend(self._validate_node_specific(node))
        
        # Validate timeout settings
        results.extend(self._validate_timeout_settings(node))
        
        # Check for unused configuration
        results.extend(self._validate_unused_config(node, rules))
        
        # Determine if node is valid (no errors)
        has_errors = any(r.level == ValidationLevel.ERROR for r in results)
        
        return NodeValidationReport(
            node_id=node.id,
            node_name=node.name,
            is_valid=not has_errors,
            results=results
        )
    
    def _validate_required_fields(self, node: PipelineNode, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Validate that all required fields are present"""
        results = []
        required_fields = rules.get("required_fields", [])
        
        for field in required_fields:
            if field not in node.config:
                results.append(ValidationResult(
                    level=ValidationLevel.ERROR,
                    message=f"Required field '{field}' is missing",
                    field=field,
                    suggestion=f"Add '{field}' to node configuration"
                ))
            elif not node.config[field]:  # Check for empty values
                results.append(ValidationResult(
                    level=ValidationLevel.ERROR,
                    message=f"Required field '{field}' cannot be empty",
                    field=field
                ))
        
        return results
    
    def _validate_field_types(self, node: PipelineNode, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Validate field data types"""
        results = []
        field_types = rules.get("field_types", {})
        
        for field, expected_type in field_types.items():
            if field in node.config:
                value = node.config[field]
                
                # Handle tuple of types (multiple allowed types)
                if isinstance(expected_type, tuple):
                    if not isinstance(value, expected_type):
                        type_names = [t.__name__ for t in expected_type]
                        results.append(ValidationResult(
                            level=ValidationLevel.ERROR,
                            message=f"Field '{field}' must be one of types: {', '.join(type_names)}",
                            field=field
                        ))
                else:
                    if not isinstance(value, expected_type):
                        results.append(ValidationResult(
                            level=ValidationLevel.ERROR,
                            message=f"Field '{field}' must be of type {expected_type.__name__}",
                            field=field
                        ))
        
        return results
    
    def _validate_field_patterns(self, node: PipelineNode, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Validate field patterns using regex"""
        results = []
        field_patterns = rules.get("field_patterns", {})
        
        for field, pattern in field_patterns.items():
            if field in node.config:
                value = str(node.config[field])
                if not re.match(pattern, value):
                    results.append(ValidationResult(
                        level=ValidationLevel.ERROR,
                        message=f"Field '{field}' does not match required pattern",
                        field=field,
                        suggestion=f"Value must match pattern: {pattern}"
                    ))
        
        return results
    
    def _validate_field_ranges(self, node: PipelineNode, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Validate numeric field ranges"""
        results = []
        field_ranges = rules.get("field_ranges", {})
        
        for field, (min_val, max_val) in field_ranges.items():
            if field in node.config:
                value = node.config[field]
                try:
                    num_value = float(value)
                    if num_value < min_val or num_value > max_val:
                        results.append(ValidationResult(
                            level=ValidationLevel.ERROR,
                            message=f"Field '{field}' must be between {min_val} and {max_val}",
                            field=field
                        ))
                except (ValueError, TypeError):
                    results.append(ValidationResult(
                        level=ValidationLevel.ERROR,
                        message=f"Field '{field}' must be a numeric value",
                        field=field
                    ))
        
        return results
    
    def _validate_node_dependencies(self, node: PipelineNode, pipeline: Pipeline, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Validate node dependencies and connections"""
        results = []
        deps = rules.get("dependencies", {})
        
        # Count input and output connections
        input_count = len(node.dependencies)
        output_count = len([c for c in pipeline.connections if c['from'] == node.id])
        
        # Validate input count
        min_inputs = deps.get("min_inputs", 0)
        max_inputs = deps.get("max_inputs", float('inf'))
        
        if input_count < min_inputs:
            results.append(ValidationResult(
                level=ValidationLevel.ERROR,
                message=f"Node requires at least {min_inputs} input connection(s), but has {input_count}",
                suggestion="Connect required input nodes"
            ))
        elif input_count > max_inputs:
            results.append(ValidationResult(
                level=ValidationLevel.WARNING,
                message=f"Node has {input_count} input connections, maximum recommended is {max_inputs}"
            ))
        
        # Validate output count
        min_outputs = deps.get("min_outputs", 0)
        max_outputs = deps.get("max_outputs", float('inf'))
        
        if output_count < min_outputs:
            results.append(ValidationResult(
                level=ValidationLevel.WARNING,
                message=f"Node should have at least {min_outputs} output connection(s), but has {output_count}",
                suggestion="Connect output nodes or add notification nodes"
            ))
        elif output_count > max_outputs:
            results.append(ValidationResult(
                level=ValidationLevel.INFO,
                message=f"Node has {output_count} output connections, which may impact performance"
            ))
        
        return results
    
    def _validate_node_specific(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate node-specific business logic"""
        results = []
        
        if node.type == NodeType.SOURCE:
            results.extend(self._validate_source_node(node))
        elif node.type == NodeType.BUILD:
            results.extend(self._validate_build_node(node))
        elif node.type == NodeType.TEST:
            results.extend(self._validate_test_node(node))
        elif node.type == NodeType.DEPLOY:
            results.extend(self._validate_deploy_node(node))
        elif node.type == NodeType.NOTIFICATION:
            results.extend(self._validate_notification_node(node))
        
        return results
    
    def _validate_source_node(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate source node specific requirements"""
        results = []
        
        # Check repository format
        if "repository" in node.config:
            repo = node.config["repository"]
            if "/" not in repo:
                results.append(ValidationResult(
                    level=ValidationLevel.WARNING,
                    message="Repository should include owner/name format",
                    field="repository",
                    suggestion="Use format: owner/repository-name"
                ))
        
        # Check branch naming
        if "branch" in node.config:
            branch = node.config["branch"]
            if branch in ["master", "main"]:
                results.append(ValidationResult(
                    level=ValidationLevel.INFO,
                    message=f"Using production branch '{branch}'",
                    field="branch"
                ))
        
        return results
    
    def _validate_build_node(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate build node specific requirements"""
        results = []
        
        # Check build command for common patterns
        if "build_command" in node.config:
            command = node.config["build_command"]
            
            # Check for package manager commands
            package_managers = ["npm", "yarn", "pnpm", "pip", "mvn", "gradle", "make"]
            has_package_manager = any(pm in command for pm in package_managers)
            
            if not has_package_manager:
                results.append(ValidationResult(
                    level=ValidationLevel.WARNING,
                    message="Build command doesn't use a recognized package manager",
                    field="build_command",
                    suggestion="Consider using npm, yarn, pip, maven, etc."
                ))
        
        # Validate artifacts configuration
        if "artifacts" in node.config:
            artifacts = node.config["artifacts"]
            if isinstance(artifacts, list) and len(artifacts) > 10:
                results.append(ValidationResult(
                    level=ValidationLevel.WARNING,
                    message="Large number of artifacts may impact performance",
                    field="artifacts"
                ))
        
        return results
    
    def _validate_test_node(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate test node specific requirements"""
        results = []
        
        # Check coverage threshold
        if "coverage_threshold" in node.config:
            threshold = node.config["coverage_threshold"]
            if threshold > 95:
                results.append(ValidationResult(
                    level=ValidationLevel.INFO,
                    message="Very high coverage threshold may slow down development",
                    field="coverage_threshold"
                ))
            elif threshold < 50:
                results.append(ValidationResult(
                    level=ValidationLevel.WARNING,
                    message="Low coverage threshold may miss bugs",
                    field="coverage_threshold"
                ))
        
        return results
    
    def _validate_deploy_node(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate deploy node specific requirements"""
        results = []
        
        # Check environment
        if "target_environment" in node.config:
            env = node.config["target_environment"]
            if env == "prod" or env == "production":
                # Production deployment should have health checks
                if "health_check_url" not in node.config:
                    results.append(ValidationResult(
                        level=ValidationLevel.WARNING,
                        message="Production deployment should include health checks",
                        suggestion="Add health_check_url configuration"
                    ))
                
                # Production should have rollback enabled
                if node.config.get("rollback_enabled") is not True:
                    results.append(ValidationResult(
                        level=ValidationLevel.WARNING,
                        message="Production deployment should enable rollback",
                        suggestion="Set rollback_enabled to true"
                    ))
        
        return results
    
    def _validate_notification_node(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate notification node specific requirements"""
        results = []
        
        # Validate recipients
        if "recipients" in node.config:
            recipients = node.config["recipients"]
            if isinstance(recipients, list):
                for recipient in recipients:
                    if "@" in str(recipient) and not self._is_valid_email(str(recipient)):
                        results.append(ValidationResult(
                            level=ValidationLevel.WARNING,
                            message=f"Invalid email format: {recipient}",
                            field="recipients"
                        ))
        
        return results
    
    def _validate_timeout_settings(self, node: PipelineNode) -> List[ValidationResult]:
        """Validate timeout configuration"""
        results = []
        
        if node.timeout <= 0:
            results.append(ValidationResult(
                level=ValidationLevel.ERROR,
                message="Timeout must be greater than 0",
                field="timeout"
            ))
        elif node.timeout > 7200:  # 2 hours
            results.append(ValidationResult(
                level=ValidationLevel.WARNING,
                message="Very long timeout may indicate inefficient process",
                field="timeout"
            ))
        
        return results
    
    def _validate_unused_config(self, node: PipelineNode, rules: Dict[str, Any]) -> List[ValidationResult]:
        """Check for unused configuration keys"""
        results = []
        
        required_fields = set(rules.get("required_fields", []))
        optional_fields = set(rules.get("optional_fields", []))
        allowed_fields = required_fields | optional_fields
        
        for config_key in node.config.keys():
            if config_key not in allowed_fields:
                results.append(ValidationResult(
                    level=ValidationLevel.INFO,
                    message=f"Unknown configuration key: '{config_key}'",
                    field=config_key,
                    suggestion="Remove unused configuration or check spelling"
                ))
        
        return results
    
    # Helper validation functions
    def _validate_email_list(self, emails: List[str]) -> bool:
        """Validate list of email addresses"""
        return all(self._is_valid_email(email) for email in emails)
    
    def _validate_url(self, url: str) -> bool:
        """Validate URL format"""
        url_pattern = r"^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/.*)?$"
        return bool(re.match(url_pattern, url))
    
    def _validate_json_string(self, json_str: str) -> bool:
        """Validate JSON string format"""
        try:
            json.loads(json_str)
            return True
        except json.JSONDecodeError:
            return False
    
    def _validate_command(self, command: str) -> bool:
        """Validate command format"""
        # Basic validation - not empty and doesn't contain dangerous patterns
        dangerous_patterns = [";", "&&", "||", "|", ">", "<", "rm -rf"]
        return command.strip() and not any(pattern in command for pattern in dangerous_patterns)
    
    def _validate_environment_vars(self, env_vars: Dict[str, str]) -> bool:
        """Validate environment variables"""
        for key, value in env_vars.items():
            # Environment variable names should be uppercase and use underscores
            if not re.match(r"^[A-Z_][A-Z0-9_]*$", key):
                return False
        return True
    
    def _is_valid_email(self, email: str) -> bool:
        """Check if email address is valid"""
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(email_pattern, email))
    
    def validate_pipeline_nodes(self, pipeline: Pipeline) -> Dict[str, NodeValidationReport]:
        """Validate all nodes in a pipeline"""
        reports = {}
        
        for node in pipeline.nodes:
            report = self.validate_node(node, pipeline)
            reports[node.id] = report
        
        return reports
    
    def get_pipeline_validation_summary(self, pipeline: Pipeline) -> Dict[str, Any]:
        """Get overall pipeline validation summary"""
        reports = self.validate_pipeline_nodes(pipeline)
        
        total_nodes = len(reports)
        valid_nodes = sum(1 for report in reports.values() if report.is_valid)
        total_errors = sum(len(report.errors) for report in reports.values())
        total_warnings = sum(len(report.warnings) for report in reports.values())
        
        return {
            "pipeline_id": pipeline.config.id,
            "pipeline_name": pipeline.config.name,
            "total_nodes": total_nodes,
            "valid_nodes": valid_nodes,
            "invalid_nodes": total_nodes - valid_nodes,
            "total_errors": total_errors,
            "total_warnings": total_warnings,
            "overall_valid": total_errors == 0,
            "node_reports": {node_id: {
                "is_valid": report.is_valid,
                "error_count": len(report.errors),
                "warning_count": len(report.warnings)
            } for node_id, report in reports.items()}
        }


# Example usage
if __name__ == "__main__":
    from PipelineBuilder import PipelineBuilder, NodeType
    
    # Create test pipeline
    builder = PipelineBuilder()
    pipeline = builder.create_pipeline(
        "Test Pipeline",
        "Test validation",
        "test/repo"
    )
    
    # Add a source node with validation issues
    source_id = builder.add_node(
        pipeline,
        NodeType.SOURCE,
        "Invalid Source",
        {"repository": "invalid-repo", "branch": ""},  # Missing slash in repo, empty branch
        {"x": 0, "y": 0}
    )
    
    # Validate
    validator = NodeValidator()
    summary = validator.get_pipeline_validation_summary(pipeline)
    
    print("Validation Summary:")
    print(json.dumps(summary, indent=2))
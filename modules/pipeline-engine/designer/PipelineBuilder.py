#!/usr/bin/env python3
"""
Pipeline Builder - Core pipeline construction and management

Handles visual pipeline creation, validation, and serialization for the
Phase 2 DevOps platform pipeline engine.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum


class NodeType(Enum):
    """Pipeline node types"""
    SOURCE = "source"
    BUILD = "build"
    TEST = "test"
    DEPLOY = "deploy"
    NOTIFICATION = "notification"
    CONDITION = "condition"
    PARALLEL = "parallel"
    SEQUENTIAL = "sequential"


class TriggerType(Enum):
    """Pipeline trigger types"""
    MANUAL = "manual"
    PUSH = "push"
    PULL_REQUEST = "pull_request"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"


@dataclass
class PipelineNode:
    """Individual pipeline node/step"""
    id: str
    name: str
    type: NodeType
    config: Dict[str, Any]
    position: Dict[str, float]  # x, y coordinates for visual designer
    dependencies: List[str] = None  # List of node IDs this depends on
    timeout: int = 300  # Timeout in seconds
    retry_count: int = 0
    continue_on_error: bool = False
    environment: Dict[str, str] = None
    
    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []
        if self.environment is None:
            self.environment = {}


@dataclass
class PipelineConfig:
    """Pipeline configuration and metadata"""
    id: str
    name: str
    description: str
    repository: str
    triggers: List[TriggerType]
    environment_variables: Dict[str, str]
    secrets: List[str]
    notifications: Dict[str, Any]
    timeout: int = 3600  # Global timeout in seconds
    
    def __post_init__(self):
        if not self.environment_variables:
            self.environment_variables = {}
        if not self.notifications:
            self.notifications = {}


@dataclass
class Pipeline:
    """Complete pipeline definition"""
    config: PipelineConfig
    nodes: List[PipelineNode]
    connections: List[Dict[str, str]]  # [{from: node_id, to: node_id}]
    created_at: datetime
    updated_at: datetime
    version: str = "1.0.0"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert pipeline to dictionary for serialization"""
        return {
            'config': asdict(self.config),
            'nodes': [asdict(node) for node in self.nodes],
            'connections': self.connections,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'version': self.version
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Pipeline':
        """Create pipeline from dictionary"""
        config = PipelineConfig(**data['config'])
        nodes = [PipelineNode(**node_data) for node_data in data['nodes']]
        
        return cls(
            config=config,
            nodes=nodes,
            connections=data['connections'],
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            version=data.get('version', '1.0.0')
        )


class PipelineBuilder:
    """Main pipeline builder class"""
    
    def __init__(self):
        self.templates = {}
        self.node_definitions = self._load_node_definitions()
    
    def _load_node_definitions(self) -> Dict[str, Dict[str, Any]]:
        """Load available node type definitions"""
        return {
            NodeType.SOURCE.value: {
                "name": "Source Code",
                "description": "Checkout source code from repository",
                "required_config": ["repository", "branch"],
                "optional_config": ["checkout_path", "submodules"],
                "outputs": ["source_path"]
            },
            NodeType.BUILD.value: {
                "name": "Build",
                "description": "Build application or artifacts",
                "required_config": ["build_command"],
                "optional_config": ["build_path", "artifacts"],
                "inputs": ["source_path"],
                "outputs": ["build_artifacts"]
            },
            NodeType.TEST.value: {
                "name": "Test",
                "description": "Run tests and generate reports",
                "required_config": ["test_command"],
                "optional_config": ["test_path", "coverage_threshold"],
                "inputs": ["source_path"],
                "outputs": ["test_results"]
            },
            NodeType.DEPLOY.value: {
                "name": "Deploy",
                "description": "Deploy application to target environment",
                "required_config": ["target_environment", "deploy_command"],
                "optional_config": ["health_check_url", "rollback_enabled"],
                "inputs": ["build_artifacts"],
                "outputs": ["deployment_url"]
            },
            NodeType.NOTIFICATION.value: {
                "name": "Notification",
                "description": "Send notifications about pipeline status",
                "required_config": ["notification_type", "recipients"],
                "optional_config": ["message_template", "conditions"],
                "inputs": [],
                "outputs": []
            },
            NodeType.CONDITION.value: {
                "name": "Condition",
                "description": "Conditional execution based on criteria",
                "required_config": ["condition_expression"],
                "optional_config": ["true_branch", "false_branch"],
                "inputs": ["*"],
                "outputs": ["*"]
            }
        }
    
    def create_pipeline(self, name: str, description: str, repository: str) -> Pipeline:
        """Create a new empty pipeline"""
        pipeline_id = str(uuid.uuid4())
        
        config = PipelineConfig(
            id=pipeline_id,
            name=name,
            description=description,
            repository=repository,
            triggers=[TriggerType.MANUAL],
            environment_variables={},
            secrets=[],
            notifications={}
        )
        
        now = datetime.now()
        pipeline = Pipeline(
            config=config,
            nodes=[],
            connections=[],
            created_at=now,
            updated_at=now
        )
        
        return pipeline
    
    def add_node(self, pipeline: Pipeline, node_type: NodeType, name: str, 
                 config: Dict[str, Any], position: Dict[str, float]) -> str:
        """Add a node to the pipeline"""
        node_id = str(uuid.uuid4())
        
        node = PipelineNode(
            id=node_id,
            name=name,
            type=node_type,
            config=config,
            position=position
        )
        
        pipeline.nodes.append(node)
        pipeline.updated_at = datetime.now()
        
        return node_id
    
    def remove_node(self, pipeline: Pipeline, node_id: str) -> bool:
        """Remove a node from the pipeline"""
        # Remove the node
        pipeline.nodes = [node for node in pipeline.nodes if node.id != node_id]
        
        # Remove any connections involving this node
        pipeline.connections = [
            conn for conn in pipeline.connections 
            if conn['from'] != node_id and conn['to'] != node_id
        ]
        
        # Remove dependencies on this node
        for node in pipeline.nodes:
            if node_id in node.dependencies:
                node.dependencies.remove(node_id)
        
        pipeline.updated_at = datetime.now()
        return True
    
    def connect_nodes(self, pipeline: Pipeline, from_node_id: str, to_node_id: str) -> bool:
        """Connect two nodes in the pipeline"""
        # Check if nodes exist
        from_node = next((n for n in pipeline.nodes if n.id == from_node_id), None)
        to_node = next((n for n in pipeline.nodes if n.id == to_node_id), None)
        
        if not from_node or not to_node:
            return False
        
        # Check if connection already exists
        existing = next((c for c in pipeline.connections 
                        if c['from'] == from_node_id and c['to'] == to_node_id), None)
        if existing:
            return False
        
        # Add connection
        pipeline.connections.append({
            'from': from_node_id,
            'to': to_node_id
        })
        
        # Add dependency
        if from_node_id not in to_node.dependencies:
            to_node.dependencies.append(from_node_id)
        
        pipeline.updated_at = datetime.now()
        return True
    
    def disconnect_nodes(self, pipeline: Pipeline, from_node_id: str, to_node_id: str) -> bool:
        """Disconnect two nodes in the pipeline"""
        # Remove connection
        pipeline.connections = [
            conn for conn in pipeline.connections
            if not (conn['from'] == from_node_id and conn['to'] == to_node_id)
        ]
        
        # Remove dependency
        to_node = next((n for n in pipeline.nodes if n.id == to_node_id), None)
        if to_node and from_node_id in to_node.dependencies:
            to_node.dependencies.remove(from_node_id)
        
        pipeline.updated_at = datetime.now()
        return True
    
    def validate_pipeline(self, pipeline: Pipeline) -> Dict[str, Any]:
        """Validate pipeline configuration"""
        errors = []
        warnings = []
        
        # Check for nodes
        if not pipeline.nodes:
            errors.append("Pipeline must have at least one node")
        
        # Check for cycles
        if self._has_cycles(pipeline):
            errors.append("Pipeline contains circular dependencies")
        
        # Validate each node
        for node in pipeline.nodes:
            node_errors = self._validate_node(node)
            errors.extend(node_errors)
        
        # Check for disconnected nodes (warnings)
        disconnected = self._find_disconnected_nodes(pipeline)
        if disconnected:
            warnings.append(f"Disconnected nodes found: {', '.join(disconnected)}")
        
        # Check for required source node
        source_nodes = [n for n in pipeline.nodes if n.type == NodeType.SOURCE]
        if not source_nodes:
            warnings.append("Pipeline should have at least one source node")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'node_count': len(pipeline.nodes),
            'connection_count': len(pipeline.connections)
        }
    
    def _validate_node(self, node: PipelineNode) -> List[str]:
        """Validate individual node configuration"""
        errors = []
        
        node_def = self.node_definitions.get(node.type.value, {})
        required_config = node_def.get('required_config', [])
        
        for required_field in required_config:
            if required_field not in node.config:
                errors.append(f"Node '{node.name}' missing required config: {required_field}")
        
        return errors
    
    def _has_cycles(self, pipeline: Pipeline) -> bool:
        """Check for circular dependencies using DFS"""
        # Build adjacency list
        graph = {}
        for node in pipeline.nodes:
            graph[node.id] = []
        
        for conn in pipeline.connections:
            if conn['from'] in graph:
                graph[conn['from']].append(conn['to'])
        
        # DFS cycle detection
        visited = set()
        rec_stack = set()
        
        def dfs(node_id):
            if node_id in rec_stack:
                return True
            if node_id in visited:
                return False
            
            visited.add(node_id)
            rec_stack.add(node_id)
            
            for neighbor in graph.get(node_id, []):
                if dfs(neighbor):
                    return True
            
            rec_stack.remove(node_id)
            return False
        
        for node_id in graph:
            if node_id not in visited:
                if dfs(node_id):
                    return True
        
        return False
    
    def _find_disconnected_nodes(self, pipeline: Pipeline) -> List[str]:
        """Find nodes that are not connected to the main flow"""
        if not pipeline.nodes:
            return []
        
        # Build connection graph
        connected = set()
        connections = {}
        
        for node in pipeline.nodes:
            connections[node.id] = []
        
        for conn in pipeline.connections:
            connections[conn['from']].append(conn['to'])
            connections[conn['to']].append(conn['from'])
        
        # Find connected components starting from source nodes
        source_nodes = [n.id for n in pipeline.nodes if n.type == NodeType.SOURCE]
        if not source_nodes:
            source_nodes = [pipeline.nodes[0].id]  # Start from first node if no source
        
        def dfs(node_id):
            if node_id in connected:
                return
            connected.add(node_id)
            for neighbor in connections.get(node_id, []):
                dfs(neighbor)
        
        for source_id in source_nodes:
            dfs(source_id)
        
        # Return disconnected nodes
        all_nodes = {n.id for n in pipeline.nodes}
        disconnected = all_nodes - connected
        
        return [n.name for n in pipeline.nodes if n.id in disconnected]
    
    def get_execution_order(self, pipeline: Pipeline) -> List[List[str]]:
        """Get pipeline execution order as list of parallel stages"""
        if not pipeline.nodes:
            return []
        
        # Build dependency graph
        in_degree = {}
        graph = {}
        
        for node in pipeline.nodes:
            in_degree[node.id] = 0
            graph[node.id] = []
        
        for conn in pipeline.connections:
            graph[conn['from']].append(conn['to'])
            in_degree[conn['to']] += 1
        
        # Topological sort with level tracking
        stages = []
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        
        while queue:
            current_stage = list(queue)
            stages.append(current_stage)
            queue = []
            
            for node_id in current_stage:
                for neighbor in graph[node_id]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)
        
        return stages
    
    def clone_pipeline(self, pipeline: Pipeline, new_name: str) -> Pipeline:
        """Create a copy of an existing pipeline"""
        # Create new pipeline config
        new_config = PipelineConfig(
            id=str(uuid.uuid4()),
            name=new_name,
            description=f"Copy of {pipeline.config.description}",
            repository=pipeline.config.repository,
            triggers=pipeline.config.triggers.copy(),
            environment_variables=pipeline.config.environment_variables.copy(),
            secrets=pipeline.config.secrets.copy(),
            notifications=pipeline.config.notifications.copy(),
            timeout=pipeline.config.timeout
        )
        
        # Create new nodes with new IDs
        node_id_mapping = {}
        new_nodes = []
        
        for node in pipeline.nodes:
            new_id = str(uuid.uuid4())
            node_id_mapping[node.id] = new_id
            
            new_node = PipelineNode(
                id=new_id,
                name=node.name,
                type=node.type,
                config=node.config.copy(),
                position=node.position.copy(),
                dependencies=[],  # Will be updated below
                timeout=node.timeout,
                retry_count=node.retry_count,
                continue_on_error=node.continue_on_error,
                environment=node.environment.copy()
            )
            new_nodes.append(new_node)
        
        # Update connections and dependencies
        new_connections = []
        for conn in pipeline.connections:
            new_connections.append({
                'from': node_id_mapping[conn['from']],
                'to': node_id_mapping[conn['to']]
            })
        
        # Update node dependencies
        for i, old_node in enumerate(pipeline.nodes):
            new_deps = [node_id_mapping[dep_id] for dep_id in old_node.dependencies]
            new_nodes[i].dependencies = new_deps
        
        now = datetime.now()
        return Pipeline(
            config=new_config,
            nodes=new_nodes,
            connections=new_connections,
            created_at=now,
            updated_at=now,
            version=pipeline.version
        )
    
    def get_node_definitions(self) -> Dict[str, Dict[str, Any]]:
        """Get available node type definitions for the UI"""
        return self.node_definitions.copy()


# Example usage and testing
if __name__ == "__main__":
    builder = PipelineBuilder()
    
    # Create a simple CI/CD pipeline
    pipeline = builder.create_pipeline(
        name="Node.js CI/CD",
        description="Build, test, and deploy Node.js application",
        repository="homelab-gitops-auditor"
    )
    
    # Add source node
    source_id = builder.add_node(
        pipeline, 
        NodeType.SOURCE, 
        "Checkout Code",
        {"repository": "homelab-gitops-auditor", "branch": "main"},
        {"x": 100, "y": 100}
    )
    
    # Add build node
    build_id = builder.add_node(
        pipeline,
        NodeType.BUILD,
        "Build Application", 
        {"build_command": "npm run build"},
        {"x": 300, "y": 100}
    )
    
    # Add test node
    test_id = builder.add_node(
        pipeline,
        NodeType.TEST,
        "Run Tests",
        {"test_command": "npm test", "coverage_threshold": 80},
        {"x": 500, "y": 100}
    )
    
    # Connect nodes
    builder.connect_nodes(pipeline, source_id, build_id)
    builder.connect_nodes(pipeline, build_id, test_id)
    
    # Validate pipeline
    validation = builder.validate_pipeline(pipeline)
    print("Pipeline validation:", json.dumps(validation, indent=2))
    
    # Get execution order
    execution_order = builder.get_execution_order(pipeline)
    print("Execution order:", execution_order)
    
    # Export pipeline
    pipeline_json = json.dumps(pipeline.to_dict(), indent=2)
    print("Pipeline JSON:", pipeline_json[:500] + "...")
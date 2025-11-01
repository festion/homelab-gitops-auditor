#!/usr/bin/env python3
"""
GitHub Actions Template Selector
Analyzes repository and suggests appropriate workflow templates
"""

import os
import json
import yaml
import re
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional

class TemplateSelector:
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.config = self._load_template_config()
    
    def _load_template_config(self) -> Dict[str, Any]:
        """Load template configuration from meta/template-config.json"""
        config_path = Path(__file__).parent / "templates" / "github-actions" / "meta" / "template-config.json"
        try:
            with open(config_path) as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Warning: Template config not found at {config_path}")
            return {"templates": {}, "project_types": {}, "categories": {}}
    
    def analyze_repository(self) -> Dict[str, Any]:
        """Analyze repository to determine project type and requirements"""
        analysis = {
            "languages": [],
            "frameworks": [],
            "deployment_targets": [],
            "special_requirements": [],
            "detected_files": [],
            "confidence_scores": {}
        }
        
        # Check for different project types
        files_found = {}
        for file_pattern in ["package.json", "requirements.txt", "pyproject.toml", "setup.py", 
                           "configuration.yaml", "Dockerfile", "docker-compose.yml", 
                           "tsconfig.json", "Pipfile", "poetry.lock"]:
            if (self.repo_path / file_pattern).exists():
                files_found[file_pattern] = True
                analysis["detected_files"].append(file_pattern)
        
        # Node.js detection
        if "package.json" in files_found:
            analysis["languages"].append("node")
            analysis["confidence_scores"]["node"] = 0.9
            
            try:
                with open(self.repo_path / "package.json") as f:
                    package_json = json.load(f)
                
                # Check for TypeScript
                deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}
                if "typescript" in deps or "tsconfig.json" in files_found:
                    analysis["languages"].append("typescript")
                    analysis["confidence_scores"]["typescript"] = 0.8
                
                # Check for frameworks
                if "react" in deps:
                    analysis["frameworks"].append("react")
                if "vue" in deps:
                    analysis["frameworks"].append("vue")
                if "next" in deps:
                    analysis["frameworks"].append("nextjs")
                if "express" in deps:
                    analysis["frameworks"].append("express")
                
            except (json.JSONDecodeError, FileNotFoundError):
                pass
        
        # Python detection
        python_files = ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"]
        if any(f in files_found for f in python_files):
            analysis["languages"].append("python")
            analysis["confidence_scores"]["python"] = 0.9
            
            # Check for Django
            if (self.repo_path / "manage.py").exists():
                analysis["frameworks"].append("django")
            
            # Check for Flask in requirements
            if "requirements.txt" in files_found:
                try:
                    requirements = (self.repo_path / "requirements.txt").read_text()
                    if "flask" in requirements.lower():
                        analysis["frameworks"].append("flask")
                    if "fastapi" in requirements.lower():
                        analysis["frameworks"].append("fastapi")
                except FileNotFoundError:
                    pass
        
        # Home Assistant detection
        if "configuration.yaml" in files_found:
            analysis["special_requirements"].append("homeassistant")
            analysis["confidence_scores"]["homeassistant"] = 1.0
        
        # Docker detection
        if "Dockerfile" in files_found:
            analysis["deployment_targets"].append("docker")
            analysis["confidence_scores"]["docker"] = 0.8
        
        if "docker-compose.yml" in files_found:
            analysis["deployment_targets"].append("docker-compose")
            analysis["confidence_scores"]["docker-compose"] = 0.9
        
        # Infrastructure as Code detection
        terraform_files = list(self.repo_path.glob("*.tf"))
        if terraform_files:
            analysis["deployment_targets"].append("terraform")
            analysis["confidence_scores"]["terraform"] = len(terraform_files) / 10
        
        # Kubernetes detection
        k8s_files = list(self.repo_path.glob("*.k8s.yaml")) + list(self.repo_path.glob("k8s/**/*.yaml"))
        if k8s_files or (self.repo_path / "k8s").exists():
            analysis["deployment_targets"].append("kubernetes")
            analysis["confidence_scores"]["kubernetes"] = min(len(k8s_files) / 5, 1.0)
        
        return analysis
    
    def suggest_templates(self) -> List[Dict[str, Any]]:
        """Suggest appropriate templates based on repository analysis"""
        analysis = self.analyze_repository()
        suggestions = []
        
        # Map analysis results to project types
        detected_types = []
        
        if "homeassistant" in analysis["special_requirements"]:
            detected_types.append("homeassistant")
        
        if "node" in analysis["languages"]:
            detected_types.append("node")
        
        if "python" in analysis["languages"]:
            detected_types.append("python")
        
        if "docker-compose" in analysis["deployment_targets"]:
            detected_types.append("docker")
        
        # Get suggestions from config
        for project_type in detected_types:
            if project_type in self.config.get("project_types", {}):
                type_config = self.config["project_types"][project_type]
                for template_name in type_config.get("suggested_templates", []):
                    if template_name in self.config.get("templates", {}):
                        template_config = self.config["templates"][template_name]
                        
                        # Calculate priority based on confidence and compatibility
                        confidence = analysis["confidence_scores"].get(project_type, 0.5)
                        priority = "high" if confidence > 0.8 else "medium" if confidence > 0.5 else "low"
                        
                        suggestions.append({
                            "template": template_name,
                            "name": template_config.get("name", template_name),
                            "description": template_config.get("description", ""),
                            "category": template_config.get("category", "unknown"),
                            "priority": priority,
                            "confidence": confidence,
                            "reason": f"Detected {project_type} project",
                            "required_variables": self._get_required_variables(template_name),
                            "required_secrets": template_config.get("secrets", [])
                        })
        
        # Always suggest basic CI if no specific templates found
        if not suggestions:
            suggestions.append({
                "template": "ci-basic",
                "name": "Basic CI Pipeline",
                "description": "Essential CI pipeline for any project",
                "category": "base",
                "priority": "medium",
                "confidence": 0.5,
                "reason": "Fallback option for any project type",
                "required_variables": self._get_required_variables("ci-basic"),
                "required_secrets": []
            })
        
        # Remove duplicates and sort by priority and confidence
        seen = set()
        unique_suggestions = []
        for suggestion in suggestions:
            if suggestion["template"] not in seen:
                seen.add(suggestion["template"])
                unique_suggestions.append(suggestion)
        
        # Sort by priority (high > medium > low) then by confidence
        priority_order = {"high": 3, "medium": 2, "low": 1}
        unique_suggestions.sort(
            key=lambda x: (priority_order.get(x["priority"], 0), x["confidence"]), 
            reverse=True
        )
        
        return unique_suggestions
    
    def _get_required_variables(self, template_name: str) -> List[str]:
        """Get list of required variables for a template"""
        template_config = self.config.get("templates", {}).get(template_name, {})
        variables = template_config.get("variables", {})
        return [var for var, config in variables.items() if config.get("required", False)]
    
    def generate_workflow(self, template_name: str, variables: Dict[str, str] = None, 
                         output_path: Optional[str] = None) -> str:
        """Generate workflow file from template with variable substitution"""
        variables = variables or {}
        
        if template_name not in self.config.get("templates", {}):
            raise ValueError(f"Template '{template_name}' not found")
        
        template_info = self.config["templates"][template_name]
        template_file = template_info.get("file", f"{template_name}.yml")
        
        # Build template path
        template_path = (Path(__file__).parent / "templates" / "github-actions" / template_file)
        
        if not template_path.exists():
            raise FileNotFoundError(f"Template file not found: {template_path}")
        
        # Load template content
        with open(template_path) as f:
            content = f.read()
        
        # Apply variable substitution
        template_variables = template_info.get("variables", {})
        for var_name, var_config in template_variables.items():
            value = variables.get(var_name)
            
            # Use provided value or default
            if value is None:
                value = var_config.get("default", "")
            
            # Handle different substitution patterns
            # {{VAR}} - simple substitution
            content = content.replace(f"{{{{{var_name}}}}}", str(value))
            
            # {{VAR|default}} - substitution with fallback
            pattern = f"{{{{{var_name}\\|([^}}]*)}}}}"
            matches = re.findall(pattern, content)
            for default_val in matches:
                replacement = str(value) if value else default_val
                content = re.sub(pattern, replacement, content)
        
        # Save to file if output path provided
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w') as f:
                f.write(content)
            print(f"✅ Generated workflow: {output_file}")
        
        return content
    
    def validate_template(self, template_name: str, variables: Dict[str, str] = None) -> List[str]:
        """Validate template configuration and variables"""
        errors = []
        variables = variables or {}
        
        if template_name not in self.config.get("templates", {}):
            errors.append(f"Template '{template_name}' not found")
            return errors
        
        template_config = self.config["templates"][template_name]
        
        # Check required variables
        for var_name, var_config in template_config.get("variables", {}).items():
            if var_config.get("required", False) and var_name not in variables:
                errors.append(f"Required variable '{var_name}' not provided")
        
        # Check template file exists
        template_file = template_config.get("file", f"{template_name}.yml")
        template_path = Path(__file__).parent / "templates" / "github-actions" / template_file
        if not template_path.exists():
            errors.append(f"Template file not found: {template_path}")
        
        return errors
    
    def list_templates(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available templates, optionally filtered by category"""
        templates = []
        
        for template_name, template_config in self.config.get("templates", {}).items():
            if category and template_config.get("category") != category:
                continue
            
            templates.append({
                "name": template_name,
                "display_name": template_config.get("name", template_name),
                "description": template_config.get("description", ""),
                "category": template_config.get("category", "unknown"),
                "variables": list(template_config.get("variables", {}).keys()),
                "secrets": template_config.get("secrets", []),
                "compatible_with": template_config.get("compatibleWith", [])
            })
        
        return templates

def main():
    parser = argparse.ArgumentParser(description="GitHub Actions Template Selector")
    parser.add_argument("repo_path", help="Path to repository", default=".", nargs="?")
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Analyze repository")
    
    # Suggest command
    suggest_parser = subparsers.add_parser("suggest", help="Suggest templates")
    suggest_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Generate command
    generate_parser = subparsers.add_parser("generate", help="Generate workflow")
    generate_parser.add_argument("template", help="Template name")
    generate_parser.add_argument("--output", "-o", help="Output file path")
    generate_parser.add_argument("--var", action="append", help="Variable (key=value)")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List templates")
    list_parser.add_argument("--category", help="Filter by category")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate template")
    validate_parser.add_argument("template", help="Template name")
    validate_parser.add_argument("--var", action="append", help="Variable (key=value)")
    
    args = parser.parse_args()
    
    # Default to suggest if no command specified
    if not args.command:
        args.command = "suggest"
    
    selector = TemplateSelector(args.repo_path)
    
    try:
        if args.command == "analyze":
            analysis = selector.analyze_repository()
            print(json.dumps(analysis, indent=2))
        
        elif args.command == "suggest":
            suggestions = selector.suggest_templates()
            if args.json:
                print(json.dumps(suggestions, indent=2))
            else:
                print("🔍 Suggested GitHub Actions templates:")
                print("=" * 40)
                for suggestion in suggestions:
                    priority_emoji = {"high": "🔥", "medium": "⭐", "low": "💡"}
                    emoji = priority_emoji.get(suggestion["priority"], "📋")
                    
                    print(f"{emoji} {suggestion['name']} ({suggestion['priority']})")
                    print(f"   Category: {suggestion['category']}")
                    print(f"   Description: {suggestion['description']}")
                    print(f"   Reason: {suggestion['reason']}")
                    print(f"   Confidence: {suggestion['confidence']:.1%}")
                    
                    if suggestion['required_variables']:
                        print(f"   Required variables: {', '.join(suggestion['required_variables'])}")
                    if suggestion['required_secrets']:
                        print(f"   Required secrets: {', '.join(suggestion['required_secrets'])}")
                    print()
        
        elif args.command == "generate":
            # Parse variables
            variables = {}
            if args.var:
                for var in args.var:
                    if "=" in var:
                        key, value = var.split("=", 1)
                        variables[key] = value
            
            workflow = selector.generate_workflow(
                args.template, 
                variables, 
                args.output
            )
            
            if not args.output:
                print(workflow)
        
        elif args.command == "list":
            templates = selector.list_templates(args.category)
            print("📋 Available templates:")
            print("=" * 40)
            
            current_category = None
            for template in templates:
                if template["category"] != current_category:
                    current_category = template["category"]
                    print(f"\n📁 {current_category.title()}")
                    print("-" * 20)
                
                print(f"  • {template['display_name']} ({template['name']})")
                print(f"    {template['description']}")
                if template['variables']:
                    print(f"    Variables: {', '.join(template['variables'])}")
                print()
        
        elif args.command == "validate":
            # Parse variables
            variables = {}
            if args.var:
                for var in args.var:
                    if "=" in var:
                        key, value = var.split("=", 1)
                        variables[key] = value
            
            errors = selector.validate_template(args.template, variables)
            if errors:
                print("❌ Validation errors:")
                for error in errors:
                    print(f"  • {error}")
                exit(1)
            else:
                print("✅ Template validation passed")
    
    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)

if __name__ == "__main__":
    main()
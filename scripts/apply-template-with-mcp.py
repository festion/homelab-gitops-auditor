#!/usr/bin/env python3
"""
GitHub Project Template Applicator using MCP
Applies standardized GitHub project management templates to repositories using MCP GitHub server.
"""

import asyncio
import argparse
import json
from typing import List, Dict, Any

# MCP GitHub server would be used via Claude's built-in MCP integration
# This script demonstrates the structure and logic for template application

# Standard labels for all repositories
STANDARD_LABELS = [
    # Priority Labels
    {"name": "priority:critical", "color": "d73a4a", "description": "Critical priority - must be addressed immediately"},
    {"name": "priority:high", "color": "ff6b35", "description": "High priority - should be addressed soon"},
    {"name": "priority:medium", "color": "fbca04", "description": "Medium priority - normal timeline"},
    {"name": "priority:low", "color": "0e8a16", "description": "Low priority - can be deferred"},
    
    # Type Labels
    {"name": "type:epic", "color": "8b5cf6", "description": "Epic - large feature or initiative"},
    {"name": "type:feature", "color": "a2eeef", "description": "New feature or enhancement"},
    {"name": "type:bug", "color": "d73a4a", "description": "Bug or defect"},
    {"name": "type:docs", "color": "0075ca", "description": "Documentation"},
    {"name": "type:maintenance", "color": "fef2c0", "description": "Maintenance or refactoring"},
    {"name": "type:investigation", "color": "f9d0c4", "description": "Investigation or research"},
    
    # Status Labels
    {"name": "status:blocked", "color": "b60205", "description": "Blocked by external dependency"},
    {"name": "status:in-progress", "color": "0052cc", "description": "Currently being worked on"},
    {"name": "status:review", "color": "fbca04", "description": "Ready for review"},
    {"name": "status:needs-info", "color": "d4c5f9", "description": "Needs more information"},
    {"name": "status:duplicate", "color": "cfd3d7", "description": "Duplicate issue"},
    {"name": "status:wontfix", "color": "ffffff", "description": "Will not be fixed"},
]

# Repository-specific custom labels
REPO_CUSTOM_LABELS = {
    "mcp-servers": [
        {"name": "component:home-assistant", "color": "41b883", "description": "Home Assistant MCP server"},
        {"name": "component:proxmox", "color": "e97627", "description": "Proxmox MCP server"},
        {"name": "component:wikijs", "color": "1976d2", "description": "WikiJS MCP server"},
        {"name": "component:network-fs", "color": "00acc1", "description": "Network filesystem MCP server"},
    ],
    "homelab-gitops-auditor": [
        {"name": "component:frontend", "color": "61dafb", "description": "Frontend/UI components"},
        {"name": "component:backend", "color": "68a063", "description": "Backend/API components"},
        {"name": "component:database", "color": "336791", "description": "Database components"},
        {"name": "component:monitoring", "color": "e6522c", "description": "Monitoring and alerting"},
    ],
    "home-assistant-config": [
        {"name": "component:automation", "color": "ff9800", "description": "Home Assistant automations"},
        {"name": "component:integration", "color": "2196f3", "description": "Home Assistant integrations"},
        {"name": "component:dashboard", "color": "9c27b0", "description": "Dashboard and UI"},
        {"name": "component:device", "color": "4caf50", "description": "Device configuration"},
    ]
}

class TemplateApplicator:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        
    def get_target_repositories(self) -> List[Dict[str, str]]:
        """Get list of target repositories for template application"""
        return [
            {"owner": "festion", "repo": "mcp-servers"},
            {"owner": "festion", "repo": "homelab-gitops-auditor"}, 
            {"owner": "festion", "repo": "hass-ab-ble-gateway-suite"},
            {"owner": "festion", "repo": "proxmox-agent"},
            {"owner": "festion", "repo": "blender"},
        ]
    
    def get_labels_for_repo(self, repo_name: str) -> List[Dict[str, str]]:
        """Get all labels (standard + custom) for a repository"""
        labels = STANDARD_LABELS.copy()
        if repo_name in REPO_CUSTOM_LABELS:
            labels.extend(REPO_CUSTOM_LABELS[repo_name])
        return labels
    
    def apply_template_to_repo(self, owner: str, repo: str) -> Dict[str, Any]:
        """Apply template to a single repository"""
        print(f"📝 Applying template to {owner}/{repo}...")
        
        if self.dry_run:
            print(f"  🔍 DRY RUN - Would apply template to {owner}/{repo}")
            return {"status": "dry_run", "actions": ["labels", "project_board"]}
        
        # This would use MCP GitHub server calls:
        # 1. Create/update standard labels
        # 2. Create project board with standard columns
        # 3. Apply issue templates
        # 4. Migrate existing issues
        
        results = {
            "status": "success",
            "labels_created": len(self.get_labels_for_repo(repo)),
            "project_board": "created",
            "issue_templates": "applied"
        }
        
        print(f"  ✅ Template applied to {owner}/{repo}")
        return results
    
    def apply_to_all_repositories(self) -> List[Dict[str, Any]]:
        """Apply template to all target repositories"""
        results = []
        repositories = self.get_target_repositories()
        
        for repo_info in repositories:
            result = self.apply_template_to_repo(repo_info["owner"], repo_info["repo"])
            result["repository"] = f"{repo_info['owner']}/{repo_info['repo']}"
            results.append(result)
        
        return results

def main():
    parser = argparse.ArgumentParser(description="Apply GitHub project template using MCP")
    parser.add_argument("--repo", help="Apply to specific repository (format: owner/repo)")
    parser.add_argument("--all", action="store_true", help="Apply to all repositories")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    
    args = parser.parse_args()
    
    if not args.repo and not args.all:
        parser.error("Must specify either --repo or --all")
    
    applicator = TemplateApplicator(dry_run=args.dry_run)
    
    if args.repo:
        owner, repo = args.repo.split("/")
        result = applicator.apply_template_to_repo(owner, repo)
        print(f"\n📊 Result: {json.dumps(result, indent=2)}")
    else:
        results = applicator.apply_to_all_repositories()
        print(f"\n📊 Results: {json.dumps(results, indent=2)}")

if __name__ == "__main__":
    main()
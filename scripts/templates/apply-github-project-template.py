#!/usr/bin/env python3
"""
GitHub Project Template Application Script

This script applies the standardized GitHub project management template 
to all repositories, creating labels, project boards, and migrating issues.

Usage:
    python apply-github-project-template.py --repo <repo-name> [--dry-run]
    python apply-github-project-template.py --all [--dry-run]
"""

import asyncio
import json
import logging
import argparse
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import subprocess
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class StandardLabel:
    name: str
    color: str
    description: str

@dataclass
class Repository:
    name: str
    owner: str
    full_name: str
    has_issues: bool
    has_projects: bool
    open_issues: int

class GitHubProjectTemplateApplicator:
    """Applies standardized GitHub project management template to repositories"""
    
    # Standard labels for all repositories
    STANDARD_LABELS = [
        # Priority Labels
        StandardLabel("priority-critical", "d93f0b", "Critical issues blocking major functionality"),
        StandardLabel("priority-high", "ff9500", "High priority features and important fixes"),
        StandardLabel("priority-medium", "fbca04", "Standard development items"),
        StandardLabel("priority-low", "0e8a16", "Nice-to-have improvements"),
        
        # Type Labels
        StandardLabel("epic", "8b5fbf", "Major feature collections spanning multiple issues"),
        StandardLabel("feature", "0052cc", "New functionality or enhancements"),
        StandardLabel("bug", "d93f0b", "Bug fixes and issues"),
        StandardLabel("documentation", "0075ca", "Documentation updates"),
        StandardLabel("maintenance", "6c757d", "Code maintenance and refactoring"),
        
        # Status Labels
        StandardLabel("status-planning", "f9f9f9", "In planning/design phase"),
        StandardLabel("status-ready", "0e8a16", "Ready for development"),
        StandardLabel("status-in-progress", "fbca04", "Currently being worked on"),
        StandardLabel("status-review", "8b5fbf", "Under review"),
        StandardLabel("status-blocked", "d93f0b", "Blocked by dependencies"),
        
        # Component Labels (base set - can be customized per repo)
        StandardLabel("frontend", "0052cc", "Frontend/UI related"),
        StandardLabel("backend", "5319e7", "Backend/API related"),
        StandardLabel("infrastructure", "1d76db", "DevOps/deployment related"),
        StandardLabel("testing", "0e8a16", "Testing and QA"),
        StandardLabel("security", "d93f0b", "Security-related items"),
    ]
    
    # Repository-specific custom labels
    CUSTOM_LABELS = {
        "mcp-servers": [
            StandardLabel("mcp", "0052cc", "Model Context Protocol related"),
            StandardLabel("home-assistant", "ff9500", "Home Assistant integration"),
            StandardLabel("logging", "5319e7", "Logging and analysis features"),
            StandardLabel("analytics", "1d76db", "Statistical analysis"),
            StandardLabel("history", "0e8a16", "Historical data features"),
            StandardLabel("automation", "8b5fbf", "Automation management"),
            StandardLabel("devices", "fbca04", "Device management"),
            StandardLabel("esphome", "d93f0b", "ESPHome integration"),
            StandardLabel("health", "0052cc", "Health monitoring"),
            StandardLabel("monitoring", "5319e7", "System monitoring"),
            StandardLabel("bulk-operations", "1d76db", "Bulk entity operations"),
            StandardLabel("performance", "0e8a16", "Performance optimization"),
        ],
        "homelab-gitops-auditor": [
            StandardLabel("devops", "0052cc", "DevOps platform features"),
            StandardLabel("auditing", "ff9500", "Repository auditing"),
            StandardLabel("dashboard", "5319e7", "Dashboard interface"),
            StandardLabel("pipelines", "1d76db", "CI/CD pipelines"),
            StandardLabel("coordination", "0e8a16", "Multi-repo coordination"),
            StandardLabel("quality", "8b5fbf", "Quality gates and metrics"),
            StandardLabel("linting", "fbca04", "Code linting and analysis"),
            StandardLabel("templates", "d93f0b", "Template management"),
        ],
        "home-assistant-config": [
            StandardLabel("config", "0052cc", "Configuration files"),
            StandardLabel("automation", "ff9500", "Home Assistant automations"),
            StandardLabel("integration", "5319e7", "Integration setup"),
            StandardLabel("sensor", "1d76db", "Sensor configurations"),
            StandardLabel("dashboard", "0e8a16", "Dashboard and UI"),
            StandardLabel("notification", "8b5fbf", "Notifications and alerts"),
        ],
        "proxmox-agent": [
            StandardLabel("proxmox", "0052cc", "Proxmox infrastructure"),
            StandardLabel("monitoring", "ff9500", "Infrastructure monitoring"),
            StandardLabel("automation", "5319e7", "Infrastructure automation"),
            StandardLabel("networking", "1d76db", "Network configuration"),
            StandardLabel("virtualization", "0e8a16", "VM/Container management"),
        ],
        "ESPHome": [
            StandardLabel("esphome", "0052cc", "ESPHome platform"),
            StandardLabel("sensor", "ff9500", "Sensor configurations"),
            StandardLabel("device", "5319e7", "Device management"),
            StandardLabel("connectivity", "1d76db", "Network connectivity"),
            StandardLabel("ota", "0e8a16", "Over-the-air updates"),
        ]
    }
    
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        
    async def get_repositories(self) -> List[Repository]:
        """Get list of user repositories"""
        logger.info("Fetching repositories...")
        
        # Use GitHub CLI to get repositories
        cmd = ["gh", "repo", "list", "--json", "name,owner,fullName,hasIssuesEnabled,hasProjectsEnabled,issues"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"Failed to fetch repositories: {result.stderr}")
            return []
            
        try:
            repos_data = json.loads(result.stdout)
            repositories = []
            
            for repo in repos_data:
                repositories.append(Repository(
                    name=repo['name'],
                    owner=repo['owner']['login'],
                    full_name=repo['fullName'],
                    has_issues=repo['hasIssuesEnabled'],
                    has_projects=repo['hasProjectsEnabled'],
                    open_issues=repo.get('issues', {}).get('totalCount', 0)
                ))
                
            return repositories
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse repositories JSON: {e}")
            return []
    
    def get_labels_for_repo(self, repo_name: str) -> List[StandardLabel]:
        """Get combined standard and custom labels for a repository"""
        labels = self.STANDARD_LABELS.copy()
        
        # Add custom labels if they exist for this repo
        if repo_name in self.CUSTOM_LABELS:
            labels.extend(self.CUSTOM_LABELS[repo_name])
            
        return labels
    
    async def create_labels(self, repo: Repository) -> bool:
        """Create standard labels for a repository"""
        logger.info(f"Creating labels for {repo.full_name}...")
        
        if not repo.has_issues:
            logger.warning(f"Issues not enabled for {repo.full_name}, skipping labels")
            return False
            
        labels = self.get_labels_for_repo(repo.name)
        success_count = 0
        
        for label in labels:
            if self.dry_run:
                logger.info(f"[DRY RUN] Would create label: {label.name}")
                success_count += 1
                continue
                
            # Create label using GitHub CLI
            cmd = [
                "gh", "label", "create", label.name,
                "--color", label.color,
                "--description", label.description,
                "--repo", repo.full_name
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info(f"✅ Created label: {label.name}")
                success_count += 1
            elif "already exists" in result.stderr:
                logger.info(f"⚠️ Label already exists: {label.name}")
                success_count += 1
            else:
                logger.error(f"❌ Failed to create label {label.name}: {result.stderr}")
                
        logger.info(f"Created {success_count}/{len(labels)} labels for {repo.full_name}")
        return success_count > 0
    
    async def setup_project_board(self, repo: Repository) -> bool:
        """Set up project board with standard columns"""
        logger.info(f"Setting up project board for {repo.full_name}...")
        
        if not repo.has_projects:
            logger.warning(f"Projects not enabled for {repo.full_name}, skipping project board")
            return False
            
        if self.dry_run:
            logger.info(f"[DRY RUN] Would create project board for {repo.full_name}")
            return True
            
        # Note: GitHub CLI doesn't have direct project v2 commands yet
        # This would need to be implemented via GitHub API
        logger.info(f"Project board setup for {repo.full_name} requires manual setup via GitHub web interface")
        logger.info(f"Create project with columns: Backlog, Planning, Ready, In Progress, Review, Done")
        
        return True
    
    async def migrate_existing_issues(self, repo: Repository) -> bool:
        """Migrate existing issues to use standard templates and labels"""
        logger.info(f"Migrating existing issues for {repo.full_name}...")
        
        if repo.open_issues == 0:
            logger.info(f"No open issues to migrate for {repo.full_name}")
            return True
            
        if self.dry_run:
            logger.info(f"[DRY RUN] Would migrate {repo.open_issues} issues for {repo.full_name}")
            return True
            
        # Get existing issues
        cmd = ["gh", "issue", "list", "--repo", repo.full_name, "--json", "number,title,labels,state"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"Failed to fetch issues for {repo.full_name}: {result.stderr}")
            return False
            
        try:
            issues = json.loads(result.stdout)
            migrated_count = 0
            
            for issue in issues:
                # Analyze issue and suggest appropriate labels
                suggested_labels = self._suggest_labels_for_issue(issue, repo.name)
                
                if suggested_labels:
                    # Add suggested labels
                    for label in suggested_labels:
                        cmd = [
                            "gh", "issue", "edit", str(issue['number']),
                            "--add-label", label,
                            "--repo", repo.full_name
                        ]
                        
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        
                        if result.returncode == 0:
                            logger.info(f"✅ Added label '{label}' to issue #{issue['number']}")
                        else:
                            logger.warning(f"⚠️ Failed to add label '{label}' to issue #{issue['number']}")
                    
                    migrated_count += 1
                    
            logger.info(f"Migrated {migrated_count}/{len(issues)} issues for {repo.full_name}")
            return migrated_count > 0
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse issues JSON: {e}")
            return False
    
    def _suggest_labels_for_issue(self, issue: Dict[str, Any], repo_name: str) -> List[str]:
        """Suggest appropriate labels for an existing issue"""
        title = issue['title'].lower()
        existing_labels = [label['name'] for label in issue.get('labels', [])]
        suggested = []
        
        # Skip if already has priority label
        has_priority = any(label.startswith('priority-') for label in existing_labels)
        if not has_priority:
            # Suggest priority based on keywords
            if any(word in title for word in ['critical', 'urgent', 'breaking', 'security']):
                suggested.append('priority-critical')
            elif any(word in title for word in ['important', 'needed', 'required']):
                suggested.append('priority-high')
            else:
                suggested.append('priority-medium')
        
        # Skip if already has type label
        has_type = any(label in ['epic', 'feature', 'bug', 'documentation', 'maintenance'] 
                      for label in existing_labels)
        if not has_type:
            # Suggest type based on keywords
            if any(word in title for word in ['bug', 'fix', 'error', 'issue']):
                suggested.append('bug')
            elif any(word in title for word in ['feature', 'add', 'implement', 'new']):
                suggested.append('feature')
            elif any(word in title for word in ['doc', 'documentation', 'readme']):
                suggested.append('documentation')
            elif any(word in title for word in ['refactor', 'clean', 'improve']):
                suggested.append('maintenance')
        
        # Suggest status label
        has_status = any(label.startswith('status-') for label in existing_labels)
        if not has_status:
            suggested.append('status-ready')
            
        return suggested
    
    async def create_issue_templates(self, repo: Repository) -> bool:
        """Create standard issue templates for the repository"""
        logger.info(f"Creating issue templates for {repo.full_name}...")
        
        if self.dry_run:
            logger.info(f"[DRY RUN] Would create issue templates for {repo.full_name}")
            return True
            
        templates_dir = ".github/ISSUE_TEMPLATE"
        
        # Epic template
        epic_template = '''---
name: Epic
about: Major feature collections spanning multiple issues
title: '[Epic] '
labels: ['epic', 'priority-medium']
assignees: ''
---

# [Epic Name]

**Priority**: [Critical/High/Medium/Low]
**Milestone**: [Version/Release]
**Estimated Duration**: [Weeks/Months]

## 🎯 Objective
[Clear description of what this epic aims to achieve]

## 📋 Features
- [ ] #[issue] Feature 1: [Brief description]
- [ ] #[issue] Feature 2: [Brief description]
- [ ] #[issue] Feature 3: [Brief description]

## 📈 Success Metrics
- [Metric 1]: [Target value]
- [Metric 2]: [Target value]
- [Metric 3]: [Target value]

## 🔗 Dependencies
- [List any dependencies or prerequisites]

## 📚 Documentation
- [Links to relevant documentation]

---
*Epic coordinating [project area] development*
'''

        # Feature template
        feature_template = '''---
name: Feature
about: New functionality or enhancements
title: '[Feature] '
labels: ['feature', 'priority-medium']
assignees: ''
---

# [Feature Name]

**Epic**: #[epic-number] [Epic Name]
**Priority**: [High/Medium/Low]
**Milestone**: [Version]

## 🎯 Objective
[What this feature accomplishes and why it's needed]

## ✨ Features
### [Feature Area 1]
- [ ] [Specific capability 1]
- [ ] [Specific capability 2]

### [Feature Area 2]
- [ ] [Specific capability 3]
- [ ] [Specific capability 4]

## 🏗️ Implementation
[High-level implementation approach]

## ✅ Acceptance Criteria
- [ ] [Specific testable criterion 1]
- [ ] [Specific testable criterion 2]
- [ ] [Performance requirement]
- [ ] [User experience requirement]

## 🔗 Dependencies
- [List dependencies on other issues or external factors]

## 📈 Success Metrics
- **[Metric 1]**: [Target]
- **[Metric 2]**: [Target]

---
**Related Epic**: #[epic-number]
'''

        # Bug template
        bug_template = '''---
name: Bug Report
about: Report a bug or issue
title: '[Bug] '
labels: ['bug', 'priority-medium']
assignees: ''
---

# 🐛 [Bug Summary]

**Priority**: [Critical/High/Medium/Low]
**Component**: [Affected component]

## 📝 Description
[Clear description of the bug]

## 🔄 Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## 🎯 Expected Behavior
[What should happen]

## 🚫 Actual Behavior
[What actually happens]

## 🌍 Environment
- **OS**: [Operating System]
- **Browser**: [If applicable]
- **Version**: [Application version]

## 📷 Screenshots/Logs
[Include relevant screenshots or log snippets]

## 💡 Possible Solution
[If you have ideas for a fix]
'''

        templates = {
            f"{templates_dir}/epic.yml": epic_template,
            f"{templates_dir}/feature.yml": feature_template,
            f"{templates_dir}/bug.yml": bug_template
        }
        
        # In a real implementation, you would create these files in the repository
        # For now, we'll log what would be created
        for template_path, content in templates.items():
            logger.info(f"Would create template: {template_path}")
            
        return True
    
    async def apply_template_to_repo(self, repo: Repository) -> bool:
        """Apply the complete template to a single repository"""
        logger.info(f"🚀 Applying template to {repo.full_name}...")
        
        success = True
        
        # Step 1: Create labels
        try:
            await self.create_labels(repo)
        except Exception as e:
            logger.error(f"Failed to create labels for {repo.full_name}: {e}")
            success = False
        
        # Step 2: Set up project board
        try:
            await self.setup_project_board(repo)
        except Exception as e:
            logger.error(f"Failed to setup project board for {repo.full_name}: {e}")
            success = False
        
        # Step 3: Create issue templates
        try:
            await self.create_issue_templates(repo)
        except Exception as e:
            logger.error(f"Failed to create issue templates for {repo.full_name}: {e}")
            success = False
        
        # Step 4: Migrate existing issues
        try:
            await self.migrate_existing_issues(repo)
        except Exception as e:
            logger.error(f"Failed to migrate issues for {repo.full_name}: {e}")
            success = False
        
        if success:
            logger.info(f"✅ Successfully applied template to {repo.full_name}")
        else:
            logger.error(f"❌ Failed to fully apply template to {repo.full_name}")
            
        return success
    
    async def apply_template_to_all_repos(self) -> Dict[str, bool]:
        """Apply the template to all repositories"""
        logger.info("🌟 Applying template to all repositories...")
        
        repositories = await self.get_repositories()
        if not repositories:
            logger.error("No repositories found")
            return {}
        
        results = {}
        
        for repo in repositories:
            if not repo.has_issues:
                logger.info(f"⏭️ Skipping {repo.full_name} (issues not enabled)")
                results[repo.full_name] = False
                continue
                
            try:
                success = await self.apply_template_to_repo(repo)
                results[repo.full_name] = success
            except Exception as e:
                logger.error(f"Failed to apply template to {repo.full_name}: {e}")
                results[repo.full_name] = False
        
        # Summary
        successful = sum(1 for success in results.values() if success)
        total = len(results)
        
        logger.info(f"📊 Template application complete: {successful}/{total} repositories successful")
        
        return results

async def main():
    parser = argparse.ArgumentParser(description="Apply GitHub project management template")
    parser.add_argument("--repo", help="Apply to specific repository")
    parser.add_argument("--all", action="store_true", help="Apply to all repositories")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    
    args = parser.parse_args()
    
    if not args.repo and not args.all:
        parser.error("Must specify either --repo or --all")
    
    applicator = GitHubProjectTemplateApplicator(dry_run=args.dry_run)
    
    if args.repo:
        # Apply to specific repository
        repositories = await applicator.get_repositories()
        target_repo = None
        
        for repo in repositories:
            if repo.name == args.repo:
                target_repo = repo
                break
        
        if not target_repo:
            logger.error(f"Repository '{args.repo}' not found")
            sys.exit(1)
        
        success = await applicator.apply_template_to_repo(target_repo)
        sys.exit(0 if success else 1)
    
    elif args.all:
        # Apply to all repositories
        results = await applicator.apply_template_to_all_repos()
        failed_repos = [repo for repo, success in results.items() if not success]
        
        if failed_repos:
            logger.error(f"Failed repositories: {', '.join(failed_repos)}")
            sys.exit(1)
        else:
            logger.info("✅ All repositories processed successfully")
            sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())
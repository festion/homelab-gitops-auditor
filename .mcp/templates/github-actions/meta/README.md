# GitHub Actions Workflow Templates

This directory contains a comprehensive collection of GitHub Actions workflow templates designed for the homelab-gitops-auditor project. These templates integrate with the Phase 1B template engine to provide consistent CI/CD pipelines across all monitored repositories.

## 🚀 Quick Start

### 1. Analyze Your Repository
```bash
cd .mcp
python template-selector.py /path/to/your/repo suggest
```

### 2. Generate a Workflow
```bash
python template-selector.py /path/to/your/repo generate ci-basic \
  --var NODE_VERSION=20 \
  --var PYTHON_VERSION=3.12 \
  --output /path/to/your/repo/.github/workflows/ci.yml
```

### 3. List Available Templates
```bash
python template-selector.py . list
```

## 📂 Directory Structure

```
.mcp/templates/github-actions/
├── base/                           # Foundation CI/CD templates
│   ├── ci-basic.yml               # Basic CI pipeline
│   ├── ci-with-tests.yml          # Comprehensive CI with testing
│   └── cd-basic.yml               # Basic CD pipeline
├── languages/                      # Language-specific workflows
│   ├── node-js/
│   │   └── lint-test-build.yml    # Node.js complete pipeline
│   └── python/
│       └── pytest-coverage.yml    # Python testing with coverage
├── homelab/                        # Homelab-specific automation
│   ├── home-assistant-config.yml  # HA configuration validation
│   └── docker-compose-deploy.yml  # Docker Compose deployment
├── infrastructure/                 # Infrastructure as Code (planned)
├── actions/                        # Composite actions
│   └── setup-env/
│       └── action.yml             # Environment setup action
└── meta/                          # Configuration and documentation
    ├── template-config.json       # Template metadata
    └── README.md                  # This file
```

## 🛠️ Available Templates

### Foundation Templates (`base/`)

#### `ci-basic`
**Basic CI Pipeline** - Essential CI pipeline with linting, testing, and building

**Variables:**
- `NODE_VERSION` (default: 18) - Node.js version to use
- `PYTHON_VERSION` (default: 3.11) - Python version to use

**Best for:** Any project requiring basic CI/CD

#### `ci-with-tests`
**Comprehensive CI Pipeline** - Advanced CI with security scans, performance tests, and multi-version testing

**Variables:**
- `NODE_VERSION` (default: 18)
- `PYTHON_VERSION` (default: 3.11)
- `TEST_TIMEOUT` (default: 10m)

**Best for:** Production applications requiring thorough testing

#### `cd-basic`
**Basic CD Pipeline** - Continuous deployment with staging and production environments

**Variables:**
- `NODE_VERSION` (default: 18)
- `PYTHON_VERSION` (default: 3.11)
- `DOCKER_REGISTRY` (default: ghcr.io)
- `IMAGE_NAME` (required) - Docker image name

**Required Secrets:**
- `STAGING_HOST`, `STAGING_USERNAME`, `STAGING_SSH_KEY`
- `PROD_HOST`, `PROD_USERNAME`, `PROD_SSH_KEY`
- `SLACK_WEBHOOK_URL`

### Homelab Templates (`homelab/`)

#### `home-assistant-config`
**Home Assistant Config Validation** - Validates and deploys Home Assistant configuration files

**Variables:**
- `HA_VERSION` (default: 2024.1) - HA version for validation
- `PYTHON_VERSION` (default: 3.11)

**Required Secrets:**
- `HA_HOST`, `HA_USERNAME`, `HA_SSH_KEY`

**Features:**
- YAML linting and validation
- Configuration check before deployment
- Security scanning for exposed secrets
- Automated deployment with rollback
- Backup creation

#### `docker-compose-deploy`
**Docker Compose Deployment** - Builds, tests, and deploys Docker Compose applications

**Variables:**
- `DOCKER_REGISTRY` (default: ghcr.io)
- `COMPOSE_PROJECT_NAME` (required) - Project name

**Required Secrets:**
- `STAGING_HOST`, `STAGING_USERNAME`, `STAGING_SSH_KEY`
- `PROD_HOST`, `PROD_USERNAME`, `PROD_SSH_KEY`

**Features:**
- Docker security scanning
- Multi-platform builds
- Staged deployments
- Health checks and rollback

### Language-Specific Templates (`languages/`)

#### `node-js/lint-test-build`
**Node.js CI/CD Pipeline** - Complete Node.js pipeline with linting, testing, and building

**Variables:**
- `NODE_VERSION` (default: 18)
- `NPM_REGISTRY` (default: https://registry.npmjs.org/)

**Features:**
- Multi-version testing (Node 16, 18, 20)
- ESLint and Prettier
- Security auditing with Snyk
- E2E testing (Playwright/Cypress)
- Package manager detection (npm/yarn/pnpm)

#### `python/pytest-coverage`
**Python CI/CD Pipeline** - Complete Python pipeline with pytest, coverage, and security analysis

**Variables:**
- `PYTHON_VERSION` (default: 3.11)
- `POETRY_VERSION` (default: 1.6.1)

**Features:**
- Multi-version testing (Python 3.9-3.12)
- Code quality tools (flake8, black, isort, mypy)
- Security scanning (bandit, safety)
- Coverage reporting
- Poetry and pip support

## 🎯 Template Selector

The `template-selector.py` script provides intelligent template suggestions based on repository analysis.

### Commands

#### `suggest` - Get Template Recommendations
```bash
python template-selector.py /path/to/repo suggest [--json]
```

Analyzes the repository and suggests appropriate templates based on:
- Detected languages (package.json, requirements.txt, etc.)
- Frameworks (React, Django, Flask, etc.)
- Deployment targets (Docker, Kubernetes, etc.)
- Special requirements (Home Assistant, etc.)

#### `generate` - Create Workflow from Template
```bash
python template-selector.py /path/to/repo generate TEMPLATE_NAME \
  [--var KEY=VALUE] \
  [--output PATH]
```

Generates a workflow file with variable substitution.

**Example:**
```bash
python template-selector.py . generate home-assistant-config \
  --var HA_VERSION=2024.2 \
  --var PYTHON_VERSION=3.12 \
  --output .github/workflows/ha-config.yml
```

#### `list` - Show Available Templates
```bash
python template-selector.py . list [--category CATEGORY]
```

Lists all available templates, optionally filtered by category.

#### `validate` - Validate Template Configuration
```bash
python template-selector.py . validate TEMPLATE_NAME [--var KEY=VALUE]
```

Validates template configuration and checks for required variables.

#### `analyze` - Repository Analysis
```bash
python template-selector.py /path/to/repo analyze
```

Shows detailed repository analysis in JSON format.

## 🔧 Composite Actions

### `setup-env`
**Environment Setup Action** - Sets up Node.js and Python environments with intelligent caching

**Features:**
- Automatic package manager detection (npm/yarn/pnpm, pip/poetry/pipenv)
- Dependency caching
- Pre-commit hook installation
- Docker setup (optional)
- Environment information display

**Usage:**
```yaml
- name: Setup environment
  uses: ./.github/actions/setup-env
  with:
    node-version: '18'
    python-version: '3.11'
    install-dependencies: 'true'
    setup-docker: 'false'
```

## 🎨 Customization

### Variable Substitution

Templates support variable substitution using the following patterns:

1. **Simple substitution:** `{{VARIABLE_NAME}}`
2. **With default value:** `{{VARIABLE_NAME|default_value}}`

### Adding New Templates

1. Create the workflow file in the appropriate category directory
2. Add template configuration to `meta/template-config.json`
3. Update project type detection if needed
4. Test with the template selector

### Template Configuration Schema

```json
{
  "template_name": {
    "name": "Display Name",
    "description": "Template description",
    "category": "base|languages|homelab|infrastructure",
    "file": "path/to/template.yml",
    "variables": {
      "VARIABLE_NAME": {
        "type": "string",
        "default": "default_value",
        "description": "Variable description",
        "required": false
      }
    },
    "secrets": ["SECRET_NAME"],
    "dependencies": ["dependency_name"],
    "compatibleWith": ["project_type"]
  }
}
```

## 🔒 Security Considerations

### Secret Management
- Never commit actual secrets to templates
- Use GitHub repository secrets for sensitive data
- Templates include validation for exposed secrets

### Required Secrets by Template
- **home-assistant-config:** `HA_HOST`, `HA_USERNAME`, `HA_SSH_KEY`
- **docker-compose-deploy:** Staging and production SSH credentials
- **cd-basic:** Deployment credentials and notification webhooks

### Security Features
- CodeQL analysis in CI templates
- Dependency vulnerability scanning
- Docker image security scanning
- Pre-commit hooks for code quality

## 🚀 Integration with Phase 1B Template Engine

These GitHub Actions templates integrate seamlessly with the existing Phase 1B template system:

1. **Shared Configuration:** Uses the same `.mcp/` directory structure
2. **Batch Processing:** Compatible with the batch processor for multiple repositories
3. **Conflict Resolution:** Integrates with the conflict resolver for workflow updates
4. **Backup Management:** Leverages the backup manager for safe updates

### Usage with Batch Processor

```bash
# Apply CI template to multiple repositories
python .mcp/batch-processor.py apply-template \
  --template-type github-actions \
  --template-name ci-basic \
  --repos repo1,repo2,repo3 \
  --variables NODE_VERSION=20
```

## 📊 Monitoring and Reporting

Templates include features for monitoring CI/CD pipeline health:

- **Artifact retention:** Configurable retention periods
- **Notification integration:** Slack webhook support
- **Performance monitoring:** Lighthouse CI for web projects
- **Coverage reporting:** Codecov integration
- **Security alerts:** Integration with GitHub security features

## 🛣️ Roadmap

### Planned Templates (`infrastructure/`)
- Terraform plan/apply workflows
- Kubernetes deployment pipelines
- Ansible playbook execution
- AWS/Azure/GCP deployment templates

### Planned Features
- Template versioning and updates
- Custom template repositories
- Advanced repository analysis
- Integration with homelab monitoring systems
- Template marketplace integration

## 📚 Examples

### Basic Node.js Project
```bash
# Analyze project
python template-selector.py /path/to/node-project suggest

# Generate CI workflow
python template-selector.py /path/to/node-project generate ci-basic \
  --var NODE_VERSION=20 \
  --output .github/workflows/ci.yml
```

### Home Assistant Configuration
```bash
# Generate Home Assistant validation workflow
python template-selector.py /path/to/ha-config generate home-assistant-config \
  --var HA_VERSION=2024.2 \
  --output .github/workflows/ha-validation.yml
```

### Docker Compose Application
```bash
# Generate Docker Compose deployment workflow
python template-selector.py /path/to/compose-app generate docker-compose-deploy \
  --var COMPOSE_PROJECT_NAME=myapp \
  --var DOCKER_REGISTRY=ghcr.io \
  --output .github/workflows/deploy.yml
```

## 🆘 Troubleshooting

### Common Issues

1. **Template not found:** Check template name with `list` command
2. **Missing variables:** Use `validate` command to check requirements
3. **File not found:** Ensure you're running from the correct directory
4. **Permission denied:** Make sure the script is executable (`chmod +x`)

### Debug Mode
Set `DEBUG=1` environment variable for verbose output:
```bash
DEBUG=1 python template-selector.py . suggest
```

For additional support, check the homelab-gitops-auditor documentation or create an issue in the project repository.
# Pipeline Engine Module

Phase 2 Pipeline Management Backend Engine with designer, execution, and GitHub integration capabilities.

## Architecture

### Core Components

1. **Designer Module** (`designer/`)
   - `PipelineBuilder.py` - Visual pipeline construction logic
   - `NodeValidator.py` - Pipeline node validation
   - `TemplateManager.py` - Pipeline template management

2. **Execution Module** (`execution/`)
   - `PipelineRunner.py` - Pipeline execution orchestration
   - `StepExecutor.py` - Individual step execution
   - `LogStreamer.py` - Real-time log streaming

3. **GitHub Integration** (`github/`)
   - `ActionsClient.py` - GitHub Actions API integration
   - `WorkflowGenerator.py` - GitHub Workflows YAML generation
   - `SecretsManager.py` - Secrets and environment management

4. **Database** (`database/`)
   - SQLite schema for pipeline storage
   - Migration scripts
   - Data access layer

5. **API** (`api/`)
   - Express.js API endpoints
   - WebSocket handlers for real-time updates

## Features

- Visual pipeline designer with drag-and-drop interface
- Real-time pipeline execution with live logging
- GitHub Actions integration and workflow generation
- Template-based pipeline creation
- Pipeline validation and testing
- Comprehensive execution history and analytics

## Dependencies

- Python 3.8+
- Node.js 16+
- SQLite 3
- GitHub API access
- MCP server integration (Serena, GitHub MCP, Code Linter)

## Usage

See individual module documentation for detailed usage instructions.
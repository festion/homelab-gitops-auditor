import React, { useState } from 'react';
import { WorkflowConfig } from './PipelineWorkflows';
import { X, FileText, GitBranch, Package, Zap } from 'lucide-react';

interface CreateWorkflowDialogProps {
  onClose: () => void;
  onCreate: (workflow: Omit<WorkflowConfig, 'id'>) => void;
}

const workflowTemplates = [
  {
    name: 'CI/CD Pipeline',
    icon: GitBranch,
    description: 'Build, test, and deploy your application',
    template: {
      name: 'CI/CD Pipeline',
      repository: '',
      trigger: { type: 'push' as const, branches: ['main', 'develop'] },
      steps: [
        { id: 'checkout', name: 'Checkout code', uses: 'actions/checkout@v3' },
        { id: 'setup-node', name: 'Setup Node.js', uses: 'actions/setup-node@v3', with: { 'node-version': '18' } },
        { id: 'install', name: 'Install dependencies', run: 'npm ci' },
        { id: 'test', name: 'Run tests', run: 'npm test' },
        { id: 'build', name: 'Build application', run: 'npm run build' }
      ],
      environment: {}
    }
  },
  {
    name: 'Docker Build',
    icon: Package,
    description: 'Build and push Docker images',
    template: {
      name: 'Docker Build and Push',
      repository: '',
      trigger: { type: 'push' as const, branches: ['main'] },
      steps: [
        { id: 'checkout', name: 'Checkout code', uses: 'actions/checkout@v3' },
        { id: 'setup-buildx', name: 'Set up Docker Buildx', uses: 'docker/setup-buildx-action@v2' },
        { id: 'login', name: 'Login to DockerHub', uses: 'docker/login-action@v2', with: { username: '${{ secrets.DOCKERHUB_USERNAME }}', password: '${{ secrets.DOCKERHUB_TOKEN }}' } },
        { id: 'build-push', name: 'Build and push', uses: 'docker/build-push-action@v4', with: { push: true, tags: 'user/app:latest' } }
      ],
      environment: {}
    }
  },
  {
    name: 'Security Scan',
    icon: Zap,
    description: 'Run security scans on your codebase',
    template: {
      name: 'Security Scan',
      repository: '',
      trigger: { type: 'pull_request' as const },
      steps: [
        { id: 'checkout', name: 'Checkout code', uses: 'actions/checkout@v3' },
        { id: 'scan', name: 'Run security scan', uses: 'aquasecurity/trivy-action@master', with: { 'scan-type': 'fs', 'scan-ref': '.' } }
      ],
      environment: {}
    }
  },
  {
    name: 'Blank Workflow',
    icon: FileText,
    description: 'Start with an empty workflow',
    template: {
      name: 'My Workflow',
      repository: '',
      trigger: { type: 'push' as const, branches: ['main'] },
      steps: [],
      environment: {}
    }
  }
];

export const CreateWorkflowDialog: React.FC<CreateWorkflowDialogProps> = ({ onClose, onCreate }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<typeof workflowTemplates[0] | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [repository, setRepository] = useState('');

  const handleCreate = () => {
    if (selectedTemplate && workflowName && repository) {
      onCreate({
        ...selectedTemplate.template,
        name: workflowName,
        repository
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-semibold">Create New Workflow</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Template selection */}
          <div>
            <h4 className="text-lg font-medium mb-3">Choose a template</h4>
            <div className="grid grid-cols-2 gap-3">
              {workflowTemplates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.name}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setWorkflowName(template.template.name);
                    }}
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      selectedTemplate?.name === template.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <Icon className="h-5 w-5 text-gray-600 mt-0.5" />
                      <div>
                        <h5 className="font-medium">{template.name}</h5>
                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration */}
          {selectedTemplate && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workflow Name
                </label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="My Workflow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repository
                </label>
                <select
                  value={repository}
                  onChange={(e) => setRepository(e.target.value)}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a repository</option>
                  <option value="repo1">repo1</option>
                  <option value="repo2">repo2</option>
                  <option value="repo3">repo3</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplate || !workflowName || !repository}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Create Workflow
          </button>
        </div>
      </div>
    </div>
  );
};
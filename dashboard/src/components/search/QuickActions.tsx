import React, { useState } from 'react';
import { BulkAction, QuickActionResult } from '../../types/search';

// Simple SVG icons
const DocumentDuplicateIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const TagIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1M9 16v-2a4 4 0 118 0v2" />
  </svg>
);

const XIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ExclamationIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
);

interface ActionDialogProps {
  action: BulkAction;
  onConfirm: (action: BulkAction) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ActionDialog: React.FC<ActionDialogProps> = ({ action, onConfirm, onCancel, isLoading }) => {
  const [params, setParams] = useState<Record<string, any>>(action.params || {});

  const getActionConfig = (actionType: string) => {
    switch (actionType) {
      case 'apply_templates':
        return {
          title: 'Apply Templates',
          description: 'Apply configuration templates to selected repositories',
          icon: <DocumentDuplicateIcon />,
          color: 'blue',
          fields: [
            {
              key: 'templates',
              label: 'Templates to apply',
              type: 'multiselect',
              options: ['basic', 'security', 'ci-cd', 'documentation'],
              required: true
            },
            {
              key: 'overwrite',
              label: 'Overwrite existing configurations',
              type: 'checkbox',
              default: false
            }
          ]
        };
      
      case 'run_audit':
        return {
          title: 'Run Audit',
          description: 'Execute compliance audit on selected repositories',
          icon: <SearchIcon />,
          color: 'green',
          fields: [
            {
              key: 'type',
              label: 'Audit type',
              type: 'select',
              options: ['full', 'security', 'compliance'],
              default: 'full',
              required: true
            },
            {
              key: 'generateReport',
              label: 'Generate detailed report',
              type: 'checkbox',
              default: true
            }
          ]
        };
      
      case 'export_data':
        return {
          title: 'Export Data',
          description: 'Export repository data and audit results',
          icon: <DownloadIcon />,
          color: 'purple',
          fields: [
            {
              key: 'format',
              label: 'Export format',
              type: 'select',
              options: ['json', 'csv', 'excel'],
              default: 'json',
              required: true
            },
            {
              key: 'includeDetails',
              label: 'Include detailed information',
              type: 'checkbox',
              default: true
            }
          ]
        };
      
      case 'tag_repositories':
        return {
          title: 'Tag Repositories',
          description: 'Add or remove tags from selected repositories',
          icon: <TagIcon />,
          color: 'yellow',
          fields: [
            {
              key: 'operation',
              label: 'Operation',
              type: 'select',
              options: ['add', 'remove'],
              default: 'add',
              required: true
            },
            {
              key: 'tags',
              label: 'Tags (comma-separated)',
              type: 'text',
              placeholder: 'production, critical, legacy',
              required: true
            }
          ]
        };
      
      default:
        return {
          title: 'Bulk Action',
          description: 'Execute action on selected repositories',
          icon: <PlayIcon />,
          color: 'gray',
          fields: []
        };
    }
  };

  const config = getActionConfig(action.type);

  const handleParamChange = (key: string, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    const updatedAction: BulkAction = {
      ...action,
      params: { ...action.params, ...params }
    };
    onConfirm(updatedAction);
  };

  const isValid = config.fields.every(field => 
    !field.required || (params[field.key] !== undefined && params[field.key] !== '')
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg bg-${config.color}-100 text-${config.color}-600`}>
                {config.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
                <p className="text-sm text-gray-600">{config.description}</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
              disabled={isLoading}
            >
              <XIcon />
            </button>
          </div>

          {/* Repository count */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">
              This action will be applied to <strong>{action.repositories.length}</strong> repositor{action.repositories.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>

          {/* Parameters form */}
          {config.fields.length > 0 && (
            <div className="space-y-4 mb-6">
              {config.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  
                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={params[field.key] || ''}
                      onChange={(e) => handleParamChange(field.key, e.target.value)}
                      placeholder={(field as any).placeholder || ''}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      disabled={isLoading}
                    />
                  )}
                  
                  {field.type === 'select' && (
                    <select
                      value={params[field.key] || field.default || ''}
                      onChange={(e) => handleParamChange(field.key, e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      disabled={isLoading}
                    >
                      {field.options?.map(option => (
                        <option key={option} value={option}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {field.type === 'multiselect' && (
                    <div className="space-y-2">
                      {field.options?.map(option => (
                        <label key={option} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={(params[field.key] || []).includes(option)}
                            onChange={(e) => {
                              const current = params[field.key] || [];
                              const updated = e.target.checked
                                ? [...current, option]
                                : current.filter((item: string) => item !== option);
                              handleParamChange(field.key, updated);
                            }}
                            className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                            disabled={isLoading}
                          />
                          <span className="text-sm capitalize">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {field.type === 'checkbox' && (
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={params[field.key] !== undefined ? params[field.key] : field.default}
                        onChange={(e) => handleParamChange(field.key, e.target.checked)}
                        className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                        disabled={isLoading}
                      />
                      <span className="text-sm">Enable this option</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid || isLoading}
              className={`flex-1 px-4 py-2 rounded-md text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed
                bg-${config.color}-600 hover:bg-${config.color}-700 focus:ring-2 focus:ring-${config.color}-500`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Processing...
                </div>
              ) : (
                `Execute ${config.title}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultDialogProps {
  result: QuickActionResult;
  onClose: () => void;
}

const ResultDialog: React.FC<ResultDialogProps> = ({ result, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                result.success 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-red-100 text-red-600'
              }`}>
                {result.success ? <CheckIcon /> : <ExclamationIcon />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {result.success ? 'Action Completed' : 'Action Failed'}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XIcon />
            </button>
          </div>

          {/* Result message */}
          <div className="mb-4">
            <p className="text-gray-700">{result.message}</p>
          </div>

          {/* Affected repositories */}
          {result.affectedRepositories.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Affected Repositories ({result.affectedRepositories.length})
              </h4>
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                {result.affectedRepositories.map(repo => (
                  <div key={repo} className="text-sm text-gray-600 py-1">
                    {repo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {result.errors && result.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-red-700 mb-2">
                Errors ({result.errors.length})
              </h4>
              <div className="max-h-32 overflow-y-auto bg-red-50 rounded p-2">
                {result.errors.map((error, index) => (
                  <div key={index} className="text-sm text-red-600 py-1">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface QuickActionsProps {
  selectedRepositories: string[];
  onBulkAction: (action: BulkAction) => Promise<QuickActionResult>;
  onClearSelection: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  selectedRepositories,
  onBulkAction,
  onClearSelection
}) => {
  const [currentAction, setCurrentAction] = useState<BulkAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QuickActionResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  if (selectedRepositories.length === 0) return null;

  const actions = [
    {
      type: 'apply_templates',
      label: 'Apply Templates',
      icon: <DocumentDuplicateIcon />,
      color: 'blue',
      description: 'Apply configuration templates'
    },
    {
      type: 'run_audit',
      label: 'Run Audit',
      icon: <SearchIcon />,
      color: 'green',
      description: 'Execute compliance audit'
    },
    {
      type: 'export_data',
      label: 'Export Data',
      icon: <DownloadIcon />,
      color: 'purple',
      description: 'Export repository data'
    },
    {
      type: 'tag_repositories',
      label: 'Manage Tags',
      icon: <TagIcon />,
      color: 'yellow',
      description: 'Add or remove tags'
    }
  ];

  const handleActionClick = (actionType: string) => {
    setCurrentAction({
      type: actionType as any,
      repositories: selectedRepositories,
      params: {}
    });
  };

  const handleConfirmAction = async (action: BulkAction) => {
    setIsLoading(true);
    try {
      const actionResult = await onBulkAction(action);
      setResult(actionResult);
      if (actionResult.success) {
        onClearSelection();
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Action failed',
        affectedRepositories: []
      });
    } finally {
      setIsLoading(false);
      setCurrentAction(null);
    }
  };

  const handleCancelAction = () => {
    setCurrentAction(null);
  };

  const handleCloseResult = () => {
    setResult(null);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 max-w-sm">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Quick Actions</h3>
                <p className="text-sm text-gray-600">
                  {selectedRepositories.length} repositor{selectedRepositories.length !== 1 ? 'ies' : 'y'} selected
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={onClearSelection}
                  className="text-gray-400 hover:text-gray-600"
                  title="Clear selection"
                >
                  <XIcon />
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          {isExpanded && (
            <div className="p-4">
              <div className="space-y-2">
                {actions.map(action => (
                  <button
                    key={action.type}
                    onClick={() => handleActionClick(action.type)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left`}
                  >
                    <div className={`p-1 rounded bg-${action.color}-100 text-${action.color}-600`}>
                      {action.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{action.label}</div>
                      <div className="text-sm text-gray-500">{action.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Collapsed view - show primary actions */}
          {!isExpanded && (
            <div className="p-4">
              <div className="flex space-x-2">
                {actions.slice(0, 2).map(action => (
                  <button
                    key={action.type}
                    onClick={() => handleActionClick(action.type)}
                    className={`flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-lg bg-${action.color}-100 text-${action.color}-700 hover:bg-${action.color}-200 transition-colors`}
                    title={action.description}
                  >
                    {action.icon}
                    <span className="text-sm font-medium">{action.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action dialog */}
      {currentAction && (
        <ActionDialog
          action={currentAction}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          isLoading={isLoading}
        />
      )}

      {/* Result dialog */}
      {result && (
        <ResultDialog
          result={result}
          onClose={handleCloseResult}
        />
      )}
    </>
  );
};
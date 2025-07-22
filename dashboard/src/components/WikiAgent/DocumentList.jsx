import React, { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import StatusIndicator from './shared/StatusIndicator';
import './styles/WikiAgent.css';

const DocumentList = () => {
  const [documents, setDocuments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    sortBy: 'discoveredAt',
    sortOrder: 'desc'
  });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const { lastMessage } = useWebSocket('/api/wiki-agent/ws');

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      if (data.type === 'document_update') {
        updateDocument(data.payload);
      }
    }
  }, [lastMessage]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/wiki-agent/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateDocument = (updatedDoc) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === updatedDoc.id ? { ...doc, ...updatedDoc } : doc
    ));
  };

  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = documents;

    // Apply status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(doc => doc.status === filters.status);
    }

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.path.toLowerCase().includes(searchLower) ||
        doc.title?.toLowerCase().includes(searchLower) ||
        doc.type?.toLowerCase().includes(searchLower)
      );
    }

    // Sort documents
    filtered.sort((a, b) => {
      let aVal = a[filters.sortBy];
      let bVal = b[filters.sortBy];
      
      if (filters.sortBy === 'discoveredAt' || filters.sortBy === 'uploadedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (filters.sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [documents, filters]);

  const handleSelectAll = () => {
    if (selectedDocuments.size === filteredAndSortedDocuments.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(filteredAndSortedDocuments.map(doc => doc.id)));
    }
  };

  const handleSelectDocument = (docId) => {
    const newSelected = new Set(selectedDocuments);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocuments(newSelected);
  };

  const handleBulkAction = async (action) => {
    try {
      const response = await fetch('/api/wiki-agent/documents/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          documentIds: Array.from(selectedDocuments)
        })
      });

      if (response.ok) {
        fetchDocuments();
        setSelectedDocuments(new Set());
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const showDocumentDetails = (doc) => {
    setSelectedDocument(doc);
    setShowDetailsModal(true);
  };

  const getStatusBadge = (status) => {
    const statusConfigs = {
      discovered: { class: 'wiki-agent-badge-info', label: 'Discovered' },
      processing: { class: 'wiki-agent-badge-warning', label: 'Processing' },
      uploaded: { class: 'wiki-agent-badge-success', label: 'Uploaded' },
      failed: { class: 'wiki-agent-badge-error', label: 'Failed' },
      queued: { class: 'wiki-agent-badge-info', label: 'Queued' }
    };

    const config = statusConfigs[status] || statusConfigs.discovered;
    return <span className={config.class}>{config.label}</span>;
  };

  const getDocumentIcon = (type) => {
    const icons = {
      markdown: '📝',
      pdf: '📄',
      image: '🖼️',
      video: '🎥',
      audio: '🎵',
      document: '📃',
      other: '📎'
    };
    return icons[type] || icons.other;
  };

  if (loading) {
    return (
      <div className="wiki-agent-panel">
        <div className="space-y-4">
          <div className="wiki-agent-skeleton h-10 w-full"></div>
          <div className="wiki-agent-skeleton h-96 w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Discovered Documents ({filteredAndSortedDocuments.length})
          </h2>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <input
              type="text"
              placeholder="Search documents..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="discovered">Discovered</option>
              <option value="processing">Processing</option>
              <option value="uploaded">Uploaded</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>

            {/* Sort */}
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                setFilters({ ...filters, sortBy, sortOrder });
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="discoveredAt-desc">Newest First</option>
              <option value="discoveredAt-asc">Oldest First</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedDocuments.size > 0 && (
          <div className="mt-4 flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedDocuments.size} selected
            </span>
            <button
              onClick={() => handleBulkAction('upload')}
              className="wiki-agent-btn-primary text-sm"
            >
              Upload Selected
            </button>
            <button
              onClick={() => handleBulkAction('retry')}
              className="wiki-agent-btn-secondary text-sm"
            >
              Retry Failed
            </button>
            <button
              onClick={() => handleBulkAction('remove')}
              className="wiki-agent-btn-danger text-sm"
            >
              Remove Selected
            </button>
          </div>
        )}
      </div>

      {/* Document Table */}
      <div className="wiki-agent-panel overflow-hidden">
        <div className="overflow-x-auto wiki-agent-scrollbar">
          <table className="wiki-agent-table">
            <thead>
              <tr>
                <th className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedDocuments.size === filteredAndSortedDocuments.length && filteredAndSortedDocuments.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <th>Document</th>
                <th>Type</th>
                <th>Size</th>
                <th>Status</th>
                <th>Discovered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAndSortedDocuments.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedDocuments.has(doc.id)}
                      onChange={() => handleSelectDocument(doc.id)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getDocumentIcon(doc.type)}</span>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {doc.title || doc.path.split('/').pop()}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {doc.path}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {doc.type}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {(doc.size / 1024).toFixed(2)} KB
                    </span>
                  </td>
                  <td>{getStatusBadge(doc.status)}</td>
                  <td>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(doc.discoveredAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => showDocumentDetails(doc)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedDocuments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No documents found</p>
          </div>
        )}
      </div>

      {/* Document Details Modal */}
      {showDetailsModal && selectedDocument && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setShowDetailsModal(false)}>
              <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Document Details
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Title</p>
                    <p className="text-base text-gray-900 dark:text-white">
                      {selectedDocument.title || 'Untitled'}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Path</p>
                    <p className="text-base text-gray-900 dark:text-white break-all">
                      {selectedDocument.path}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
                      <p className="text-base text-gray-900 dark:text-white">
                        {selectedDocument.type}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Size</p>
                      <p className="text-base text-gray-900 dark:text-white">
                        {(selectedDocument.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                    <div className="mt-1">{getStatusBadge(selectedDocument.status)}</div>
                  </div>
                  
                  {selectedDocument.error && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Error Message</p>
                      <p className="text-base text-red-600 dark:text-red-400">
                        {selectedDocument.error}
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Discovered</p>
                      <p className="text-base text-gray-900 dark:text-white">
                        {new Date(selectedDocument.discoveredAt).toLocaleString()}
                      </p>
                    </div>
                    {selectedDocument.uploadedAt && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Uploaded</p>
                        <p className="text-base text-gray-900 dark:text-white">
                          {new Date(selectedDocument.uploadedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {selectedDocument.processingHistory && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Processing History</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedDocument.processingHistory.map((entry, idx) => (
                          <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(entry.timestamp).toLocaleTimeString()} - {entry.action}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="wiki-agent-btn-secondary"
                  >
                    Close
                  </button>
                  {selectedDocument.status === 'failed' && (
                    <button
                      onClick={() => {
                        handleBulkAction('retry');
                        setShowDetailsModal(false);
                      }}
                      className="wiki-agent-btn-primary"
                    >
                      Retry Upload
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentList;
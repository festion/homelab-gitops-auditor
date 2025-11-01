// File: dashboard/src/pages/audit.tsx

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { PipelineStatus } from '../components/pipeline/PipelineStatus';

// Development configuration
const API_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? '' // In production, use relative paths
    : 'http://localhost:3070'; // In development, connect to local API

interface RepoEntry {
  name: string;
  status: 'missing' | 'extra' | 'dirty' | 'clean';
  clone_url?: string;
  local_path?: string;
  path?: string;
  remote?: string;
  uncommittedChanges?: boolean;
  missingFiles?: string[];
  dashboard_link?: string;
}

interface AuditReport {
  timestamp: string;
  health_status: 'green' | 'yellow' | 'red';
  summary: {
    total: number;
    missing: number;
    extra: number;
    dirty: number;
    clean: number;
  };
  repos: RepoEntry[];
}

const AuditPage = () => {
  const { repo } = useParams<{ repo: string }>();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');

  const [data, setData] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [expandedRepo, setExpandedRepo] = useState<string | null>(repo || null);

  // Handle repo parameter and action when component mounts or parameters change
  useEffect(() => {
    if (repo && data) {
      setExpandedRepo(repo);

      // Auto-load diff when action is 'view' and repo status is 'dirty'
      if (action === 'view') {
        const repoData = data.repos.find((r) => r.name === repo);
        if (
          repoData &&
          (repoData.status === 'dirty' || repoData.uncommittedChanges)
        ) {
          loadDiff(repo);
        }
      }

      // Scroll to the repository if it exists
      const repoElement = document.getElementById(`repo-${repo}`);
      if (repoElement) {
        repoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [repo, action, data]);

  useEffect(() => {
    const fetchAudit = () => {
      axios
        .get(`${API_BASE_URL}/audit`)
        .then((res: { data: AuditReport }) => {
          // Transform data if needed to match expected interface
          const reportData = res.data;

          // If repo objects don't have 'status' field but have 'uncommittedChanges',
          // derive status from other fields
          if (
            reportData.repos &&
            reportData.repos.length > 0 &&
            reportData.repos[0].status === undefined
          ) {
            reportData.repos = reportData.repos.map((repo) => ({
              ...repo,
              status: repo.uncommittedChanges ? 'dirty' : 'clean',
              local_path: repo.path, // Normalize field names
            }));
          }

          setData(reportData);
        })
        .catch((err: any) => {
          console.error('Failed to load audit data:', err);
          // Fallback to static file in development
          if (process.env.NODE_ENV !== 'production') {
            fetch('/GitRepoReport.json')
              .then((res) => res.json())
              .then((data) => {
                console.log('Using fallback data source');
                setData(data);
              })
              .catch((err) =>
                console.error('Failed to load fallback data:', err)
              )
              .finally(() => setLoading(false));
          }
        })
        .finally(() => setLoading(false));
    };

    fetchAudit();
    const interval = setInterval(fetchAudit, 60000);
    return () => clearInterval(interval);
  }, []);

  const triggerAction = async (action: string, repo: RepoEntry) => {
    try {
      const body: any = { repo: repo.name };
      if (action === 'clone') body['clone_url'] = repo.clone_url || repo.remote;

      const response = await axios.post(
        `${API_BASE_URL}/audit/${action}`,
        body
      );
      alert(response.data.status);
    } catch (err: any) {
      console.error(`Action failed:`, err);
      alert(`Failed to ${action} ${repo.name}`);
    }
  };

  const loadDiff = async (repo: string) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/audit/diff/${repo}`);
      setDiffs((prev) => ({ ...prev, [repo]: res.data.diff }));
    } catch (err: any) {
      console.error(`Load diff failed:`, err);
      alert(`Failed to load diff for ${repo}`);
    }
  };

  const getColor = (status: string) => {
    if (status === 'red') return 'bg-red-600';
    if (status === 'yellow') return 'bg-yellow-400';
    return 'bg-green-500';
  };

  if (loading) return <div className="p-4">Loading audit data...</div>;
  if (!data)
    return <div className="p-4 text-red-500">Failed to load audit report.</div>;

  return (
    <div className="p-4">
      <div className="flex items-center mb-6">
        <div
          className={`w-4 h-4 rounded-full mr-2 ${getColor(
            data.health_status
          )}`}
        />
        <h1 className="text-2xl font-bold">
          Repository Audit - {data.timestamp}
        </h1>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Repository audit section (left side) */}
        <div className="xl:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Repository Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.repos.map((repoItem, i) => (
          <div
            key={i}
            className={`border rounded-xl p-4 shadow ${
              expandedRepo === repoItem.name ? 'ring-2 ring-blue-500' : ''
            }`}
            id={`repo-${repoItem.name}`}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{repoItem.name}</h2>
              <span className="text-sm text-gray-500 capitalize">
                {repoItem.status}
              </span>
            </div>
            <div className="text-xs mt-2 text-gray-500">
              {repoItem.local_path && <div>📁 {repoItem.local_path}</div>}
              {repoItem.clone_url && <div>🌐 {repoItem.clone_url}</div>}
            </div>
            <div className="mt-4 space-x-2">
              {(repoItem.status === 'missing' ||
                (repoItem.status === undefined && repoItem.clone_url)) && (
                <button
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                  onClick={() => triggerAction('clone', repoItem)}
                >
                  Clone
                </button>
              )}
              {repoItem.status === 'extra' && (
                <button
                  className="bg-red-600 text-white px-3 py-1 rounded"
                  onClick={() => triggerAction('delete', repoItem)}
                >
                  Delete
                </button>
              )}
              {(repoItem.status === 'dirty' || repoItem.uncommittedChanges) && (
                <>
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded"
                    onClick={() => triggerAction('commit', repoItem)}
                  >
                    Commit
                  </button>
                  <button
                    className="bg-gray-600 text-white px-3 py-1 rounded"
                    onClick={() => triggerAction('discard', repoItem)}
                  >
                    Discard
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={() => loadDiff(repoItem.name)}
                  >
                    View Diff
                  </button>
                </>
              )}
            </div>
            {diffs[repoItem.name] && (
              <pre className="mt-4 p-2 bg-gray-100 text-xs overflow-x-auto whitespace-pre-wrap">
                {diffs[repoItem.name]}
              </pre>
            )}
          </div>
        ))}
          </div>
        </div>

        {/* Pipeline status section (right side) */}
        <div className="xl:col-span-1">
          <PipelineStatus />
        </div>
      </div>
    </div>
  );
};

export default AuditPage;

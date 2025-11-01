/**
 * Search Service
 * Handles repository search, filtering, and faceted search functionality
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class SearchService {
  constructor() {
    this.repositoryCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
  }

  /**
   * Load and cache repository data
   */
  async loadRepositoryData() {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheTimeout && this.repositoryCache.size > 0) {
      return Array.from(this.repositoryCache.values());
    }

    try {
      // Load from audit data
      const auditPath = path.join(process.cwd(), 'audit-history');
      const files = await fs.readdir(auditPath);
      const latestFile = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .pop();

      if (!latestFile) {
        throw new Error('No audit data found');
      }

      const auditData = JSON.parse(
        await fs.readFile(path.join(auditPath, latestFile), 'utf8')
      );

      // Transform audit data to search format
      const repositories = await this.transformAuditData(auditData);
      
      // Update cache
      this.repositoryCache.clear();
      repositories.forEach(repo => {
        this.repositoryCache.set(repo.id, repo);
      });
      this.lastCacheUpdate = now;

      return repositories;
    } catch (error) {
      console.error('Failed to load repository data:', error);
      return [];
    }
  }

  /**
   * Transform audit data to search-compatible format
   */
  async transformAuditData(auditData) {
    const repositories = [];

    for (const repo of auditData.repos || []) {
      try {
        const searchRepo = {
          id: repo.name,
          name: repo.name,
          status: repo.status || 'unknown',
          compliance: this.determineCompliance(repo),
          lastActivity: await this.getLastActivity(repo),
          pipelineStatus: await this.getPipelineStatus(repo),
          templates: await this.getAppliedTemplates(repo),
          tags: await this.getRepositoryTags(repo),
          hasUncommittedChanges: await this.hasUncommittedChanges(repo),
          hasStaleTags: await this.hasStaleTags(repo),
          clone_url: repo.clone_url,
          local_path: repo.local_path,
          dashboard_link: repo.dashboard_link,
          branch: await this.getCurrentBranch(repo),
          lastCommit: await this.getLastCommit(repo),
          issues: await this.getRepositoryIssues(repo),
          searchScore: 1.0 // Default relevance score
        };

        repositories.push(searchRepo);
      } catch (error) {
        console.warn(`Failed to process repository ${repo.name}:`, error);
      }
    }

    return repositories;
  }

  /**
   * Determine compliance status from repository data
   */
  determineCompliance(repo) {
    // Simple compliance check - in production this would be more sophisticated
    if (repo.status === 'clean') {
      return 'compliant';
    }
    return 'non-compliant';
  }

  /**
   * Get last activity timestamp for repository
   */
  async getLastActivity(repo) {
    try {
      if (!repo.local_path) {
        return new Date().toISOString();
      }

      // Check git log for last commit
      const { execSync } = require('child_process');
      const lastCommit = execSync(
        'git log -1 --format=%ci',
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim();

      return new Date(lastCommit).toISOString();
    } catch (error) {
      return new Date().toISOString();
    }
  }

  /**
   * Get pipeline status for repository
   */
  async getPipelineStatus(repo) {
    try {
      // This would integrate with GitHub Actions, GitLab CI, etc.
      // For now, return mock data based on repo status
      if (repo.status === 'clean') {
        return Math.random() > 0.8 ? 'success' : 'pending';
      } else {
        return Math.random() > 0.6 ? 'failure' : 'running';
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Get applied templates for repository
   */
  async getAppliedTemplates(repo) {
    try {
      if (!repo.local_path) {
        return [];
      }

      // Check for template marker files
      const templateFiles = [
        '.gitignore',
        '.github/workflows',
        'Dockerfile',
        'docker-compose.yml',
        '.pre-commit-config.yaml'
      ];

      const templates = [];
      for (const templateFile of templateFiles) {
        try {
          await fs.access(path.join(repo.local_path, templateFile));
          if (templateFile === '.gitignore') templates.push('basic');
          if (templateFile === '.github/workflows') templates.push('ci-cd');
          if (templateFile.includes('docker')) templates.push('container');
          if (templateFile === '.pre-commit-config.yaml') templates.push('quality');
        } catch (error) {
          // File doesn't exist, skip
        }
      }

      return [...new Set(templates)]; // Remove duplicates
    } catch (error) {
      return [];
    }
  }

  /**
   * Get repository tags
   */
  async getRepositoryTags(repo) {
    try {
      // This could come from git tags, metadata files, or external systems
      const tags = [];
      
      // Add tags based on repository characteristics
      if (repo.name.includes('prod')) tags.push('production');
      if (repo.name.includes('dev')) tags.push('development');
      if (repo.name.includes('test')) tags.push('testing');
      if (repo.status === 'clean') tags.push('healthy');
      if (repo.local_path?.includes('critical')) tags.push('critical');

      return tags;
    } catch (error) {
      return [];
    }
  }

  /**
   * Check for uncommitted changes
   */
  async hasUncommittedChanges(repo) {
    try {
      if (!repo.local_path) {
        return false;
      }

      const { execSync } = require('child_process');
      const status = execSync(
        'git status --porcelain',
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim();

      return status.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for stale tags
   */
  async hasStaleTags(repo) {
    try {
      if (!repo.local_path) {
        return false;
      }

      const { execSync } = require('child_process');
      const tags = execSync(
        'git tag --sort=-creatordate',
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim().split('\n').filter(Boolean);

      if (tags.length === 0) return false;

      // Check if latest tag is older than 6 months
      const latestTagDate = execSync(
        `git log -1 --format=%ci ${tags[0]}`,
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim();

      const tagAge = Date.now() - new Date(latestTagDate).getTime();
      const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;

      return tagAge > sixMonths;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current branch
   */
  async getCurrentBranch(repo) {
    try {
      if (!repo.local_path) {
        return 'main';
      }

      const { execSync } = require('child_process');
      return execSync(
        'git branch --show-current',
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim();
    } catch (error) {
      return 'main';
    }
  }

  /**
   * Get last commit information
   */
  async getLastCommit(repo) {
    try {
      if (!repo.local_path) {
        return null;
      }

      const { execSync } = require('child_process');
      const commitInfo = execSync(
        'git log -1 --format="%H|%s|%an|%ci"',
        { cwd: repo.local_path, encoding: 'utf8' }
      ).trim();

      const [sha, message, author, timestamp] = commitInfo.split('|');

      return {
        sha,
        message,
        author,
        timestamp: new Date(timestamp).toISOString()
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get repository issues/problems
   */
  async getRepositoryIssues(repo) {
    try {
      let issueCount = 0;
      let criticalCount = 0;

      // Count issues based on repository status
      if (repo.status === 'dirty') issueCount += 2;
      if (repo.status === 'missing') {
        issueCount += 1;
        criticalCount += 1;
      }

      // Add issues for uncommitted changes
      if (await this.hasUncommittedChanges(repo)) {
        issueCount += 1;
      }

      return issueCount > 0 ? {
        count: issueCount,
        critical: criticalCount,
        warnings: issueCount - criticalCount
      } : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Perform repository search with filters
   */
  async searchRepositories(searchParams) {
    const startTime = performance.now();
    
    try {
      const repositories = await this.loadRepositoryData();
      let filteredRepos = [...repositories];

      // Apply text search
      if (searchParams.query) {
        filteredRepos = this.applyTextSearch(filteredRepos, searchParams.query, {
          fuzzy: searchParams.options.fuzzySearch
        });
      }

      // Apply filters
      filteredRepos = this.applyFilters(filteredRepos, searchParams.filters);

      // Apply sorting
      filteredRepos = this.applySorting(filteredRepos, searchParams.sort);

      // Calculate facets if requested
      let facets = null;
      if (searchParams.options.includeFacets) {
        facets = this.calculateFacets(filteredRepos);
      }

      // Apply pagination
      const total = filteredRepos.length;
      const { limit, offset } = searchParams.pagination;
      const paginatedRepos = filteredRepos.slice(offset, offset + limit);

      // Apply highlighting if requested
      if (searchParams.options.highlighting && searchParams.query) {
        this.applyHighlighting(paginatedRepos, searchParams.query);
      }

      const endTime = performance.now();

      return {
        total,
        items: paginatedRepos,
        facets,
        took: Math.round(endTime - startTime)
      };
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Apply text search to repositories
   */
  applyTextSearch(repositories, query, options = {}) {
    if (!query) return repositories;

    const normalizedQuery = query.toLowerCase();
    const isExactMatch = query.startsWith('"') && query.endsWith('"');
    const searchTerm = isExactMatch ? query.slice(1, -1).toLowerCase() : normalizedQuery;

    return repositories.filter(repo => {
      let score = 0;
      const searchableText = [
        repo.name,
        repo.branch,
        ...(repo.tags || []),
        ...(repo.templates || []),
        repo.lastCommit?.message || '',
        repo.lastCommit?.author || ''
      ].join(' ').toLowerCase();

      if (isExactMatch) {
        if (searchableText.includes(searchTerm)) {
          score = 1.0;
        }
      } else {
        // Weighted scoring
        if (repo.name.toLowerCase().includes(searchTerm)) score += 0.5;
        if (repo.tags?.some(tag => tag.toLowerCase().includes(searchTerm))) score += 0.3;
        if (repo.templates?.some(template => template.toLowerCase().includes(searchTerm))) score += 0.2;
        if (searchableText.includes(searchTerm)) score += 0.1;

        // Fuzzy matching (simple implementation)
        if (options.fuzzy && score === 0) {
          const fuzzyScore = this.fuzzyMatch(searchTerm, searchableText);
          if (fuzzyScore > 0.6) score = fuzzyScore * 0.3;
        }
      }

      repo.searchScore = score;
      return score > 0;
    }).sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
  }

  /**
   * Simple fuzzy matching implementation
   */
  fuzzyMatch(pattern, text) {
    const patternLen = pattern.length;
    const textLen = text.length;
    
    if (patternLen === 0) return 0;
    if (textLen === 0) return 0;
    
    let matches = 0;
    let patternIdx = 0;
    
    for (let textIdx = 0; textIdx < textLen && patternIdx < patternLen; textIdx++) {
      if (text[textIdx] === pattern[patternIdx]) {
        matches++;
        patternIdx++;
      }
    }
    
    return matches / patternLen;
  }

  /**
   * Apply filters to repositories
   */
  applyFilters(repositories, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return repositories;
    }

    return repositories.filter(repo => {
      // Status filter
      if (filters.status && !filters.status.includes(repo.status)) {
        return false;
      }

      // Compliance filter
      if (filters.compliance && !filters.compliance.includes(repo.compliance)) {
        return false;
      }

      // Pipeline status filter
      if (filters.pipelineStatus && !filters.pipelineStatus.includes(repo.pipelineStatus)) {
        return false;
      }

      // Uncommitted changes filter
      if (filters.hasUncommittedChanges !== undefined && 
          repo.hasUncommittedChanges !== filters.hasUncommittedChanges) {
        return false;
      }

      // Stale tags filter
      if (filters.hasStaleTags !== undefined && 
          repo.hasStaleTags !== filters.hasStaleTags) {
        return false;
      }

      // Last activity filter
      if (filters.lastActivityDays !== undefined) {
        const daysSinceActivity = Math.floor(
          (Date.now() - new Date(repo.lastActivity).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceActivity > filters.lastActivityDays) {
          return false;
        }
      }

      // Templates filter
      if (filters.templates && filters.templates.length > 0) {
        const hasMatchingTemplate = filters.templates.some(template =>
          repo.templates.includes(template)
        );
        if (!hasMatchingTemplate) {
          return false;
        }
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const hasMatchingTag = filters.tags.some(tag =>
          repo.tags.includes(tag)
        );
        if (!hasMatchingTag) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Apply sorting to repositories
   */
  applySorting(repositories, sort) {
    if (!sort || !sort.field) {
      return repositories;
    }

    const { field, direction } = sort;
    const sortMultiplier = direction === 'desc' ? -1 : 1;

    return repositories.sort((a, b) => {
      let aValue, bValue;

      switch (field) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'lastActivity':
          aValue = new Date(a.lastActivity);
          bValue = new Date(b.lastActivity);
          break;
        case 'compliance':
          aValue = a.compliance;
          bValue = b.compliance;
          break;
        case 'relevance':
          aValue = a.searchScore || 0;
          bValue = b.searchScore || 0;
          break;
        default:
          aValue = a[field];
          bValue = b[field];
      }

      if (aValue < bValue) return -1 * sortMultiplier;
      if (aValue > bValue) return 1 * sortMultiplier;
      return 0;
    });
  }

  /**
   * Calculate search facets for filtering UI
   */
  calculateFacets(repositories) {
    const facets = {
      status: {},
      compliance: {},
      pipelineStatus: {},
      templates: {},
      tags: {}
    };

    repositories.forEach(repo => {
      // Status facets
      facets.status[repo.status] = (facets.status[repo.status] || 0) + 1;

      // Compliance facets
      facets.compliance[repo.compliance] = (facets.compliance[repo.compliance] || 0) + 1;

      // Pipeline status facets
      if (repo.pipelineStatus) {
        facets.pipelineStatus[repo.pipelineStatus] = (facets.pipelineStatus[repo.pipelineStatus] || 0) + 1;
      }

      // Template facets
      repo.templates?.forEach(template => {
        facets.templates[template] = (facets.templates[template] || 0) + 1;
      });

      // Tag facets
      repo.tags?.forEach(tag => {
        facets.tags[tag] = (facets.tags[tag] || 0) + 1;
      });
    });

    return facets;
  }

  /**
   * Apply search term highlighting
   */
  applyHighlighting(repositories, query) {
    if (!query) return;

    const normalizedQuery = query.toLowerCase();
    const highlightTag = (text, term) => {
      if (!text) return text;
      const regex = new RegExp(`(${term})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    };

    repositories.forEach(repo => {
      repo.highlightedName = highlightTag(repo.name, normalizedQuery);
      if (repo.lastCommit?.message) {
        repo.lastCommit.highlightedMessage = highlightTag(repo.lastCommit.message, normalizedQuery);
      }
    });
  }

  /**
   * Get search facets for filter options
   */
  async getSearchFacets() {
    try {
      const repositories = await this.loadRepositoryData();
      return this.calculateFacets(repositories);
    } catch (error) {
      console.error('Failed to get search facets:', error);
      return {};
    }
  }
}

// Export singleton instance
const searchService = new SearchService();

module.exports = {
  searchRepositories: (params) => searchService.searchRepositories(params),
  getSearchFacets: () => searchService.getSearchFacets()
};
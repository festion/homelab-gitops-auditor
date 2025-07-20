/**
 * Template Compliance Data Models
 * 
 * Defines data structures for template compliance tracking and scoring.
 */

/**
 * Compliance Issue Types
 */
const ComplianceIssueType = {
  MISSING: 'missing',
  OUTDATED: 'outdated', 
  MODIFIED: 'modified',
  INVALID: 'invalid'
};

/**
 * Compliance Severity Levels
 */
const ComplianceSeverity = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * Template Application Status
 */
const ApplicationStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Compliance Issue Model
 */
class ComplianceIssue {
  constructor(data = {}) {
    this.type = data.type || ComplianceIssueType.MISSING;
    this.template = data.template || '';
    this.file = data.file || '';
    this.severity = data.severity || ComplianceSeverity.MEDIUM;
    this.description = data.description || '';
    this.recommendation = data.recommendation || '';
    this.detectedAt = data.detectedAt || new Date().toISOString();
  }

  /**
   * Get severity weight for scoring
   */
  getSeverityWeight() {
    const weights = {
      [ComplianceSeverity.HIGH]: 1.0,
      [ComplianceSeverity.MEDIUM]: 0.6,
      [ComplianceSeverity.LOW]: 0.3
    };
    return weights[this.severity] || 0.5;
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      type: this.type,
      template: this.template,
      file: this.file,
      severity: this.severity,
      description: this.description,
      recommendation: this.recommendation,
      detectedAt: this.detectedAt
    };
  }
}

/**
 * Repository Compliance Status Model
 */
class RepositoryCompliance {
  constructor(data = {}) {
    this.name = data.name || '';
    this.compliant = data.compliant || false;
    this.score = data.score || 0;
    this.appliedTemplates = data.appliedTemplates || [];
    this.missingTemplates = data.missingTemplates || [];
    this.lastChecked = data.lastChecked || new Date().toISOString();
    this.issues = (data.issues || []).map(issue => 
      issue instanceof ComplianceIssue ? issue : new ComplianceIssue(issue)
    );
    this.templateVersions = data.templateVersions || {};
    this.complianceDetails = data.complianceDetails || {};
  }

  /**
   * Calculate compliance score based on issues and requirements
   */
  calculateScore() {
    if (this.issues.length === 0) {
      this.score = 100;
      this.compliant = true;
      return this.score;
    }

    // Calculate penalty based on issue severity
    let totalPenalty = 0;
    let maxPossiblePenalty = 0;

    this.issues.forEach(issue => {
      const weight = issue.getSeverityWeight();
      totalPenalty += weight;
      maxPossiblePenalty += 1.0; // Maximum penalty per issue
    });

    // Score calculation: 100 - (penalty percentage * 100)
    if (maxPossiblePenalty > 0) {
      this.score = Math.max(0, Math.round(100 - (totalPenalty / maxPossiblePenalty) * 100));
    } else {
      this.score = 100;
    }

    // Set compliance status (compliant if score >= 80)
    this.compliant = this.score >= 80;
    
    return this.score;
  }

  /**
   * Add compliance issue
   */
  addIssue(issue) {
    if (!(issue instanceof ComplianceIssue)) {
      issue = new ComplianceIssue(issue);
    }
    this.issues.push(issue);
    this.calculateScore();
  }

  /**
   * Remove issues by type or template
   */
  removeIssues(filter = {}) {
    this.issues = this.issues.filter(issue => {
      if (filter.type && issue.type !== filter.type) return true;
      if (filter.template && issue.template !== filter.template) return true;
      if (filter.file && issue.file !== filter.file) return true;
      return false;
    });
    this.calculateScore();
  }

  /**
   * Get issues by severity
   */
  getIssuesBySeverity(severity) {
    return this.issues.filter(issue => issue.severity === severity);
  }

  /**
   * Get high priority issues
   */
  getHighPriorityIssues() {
    return this.getIssuesBySeverity(ComplianceSeverity.HIGH);
  }

  /**
   * Check if specific template is applied
   */
  hasTemplate(templateName) {
    return this.appliedTemplates.includes(templateName);
  }

  /**
   * Check if template is missing
   */
  isMissingTemplate(templateName) {
    return this.missingTemplates.includes(templateName);
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      name: this.name,
      compliant: this.compliant,
      score: this.score,
      appliedTemplates: this.appliedTemplates,
      missingTemplates: this.missingTemplates,
      lastChecked: this.lastChecked,
      issues: this.issues.map(issue => issue.toJSON()),
      templateVersions: this.templateVersions,
      complianceDetails: this.complianceDetails
    };
  }
}

/**
 * Template Definition Model
 */
class Template {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.version = data.version || '1.0.0';
    this.description = data.description || '';
    this.type = data.type || 'generic';
    this.tags = data.tags || [];
    this.requirements = data.requirements || {};
    this.files = data.files || [];
    this.directories = data.directories || [];
    this.compliance = data.compliance || {};
    this.metadata = data.metadata || {};
  }

  /**
   * Get required files list
   */
  getRequiredFiles() {
    return this.files
      .filter(file => file.required)
      .map(file => file.path);
  }

  /**
   * Get required directories list
   */
  getRequiredDirectories() {
    return this.directories
      .filter(dir => dir.required)
      .map(dir => dir.path);
  }

  /**
   * Get compliance scoring weights
   */
  getScoringWeights() {
    return this.compliance.scoring_weights || {
      files: 0.6,
      directories: 0.2,
      content: 0.2
    };
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      type: this.type,
      tags: this.tags,
      requirements: this.requirements,
      files: this.files,
      directories: this.directories,
      compliance: this.compliance,
      metadata: this.metadata
    };
  }
}

/**
 * Template Application History Model
 */
class TemplateApplication {
  constructor(data = {}) {
    this.id = data.id || null;
    this.repository = data.repository || '';
    this.templateName = data.templateName || '';
    this.templateVersion = data.templateVersion || '';
    this.appliedAt = data.appliedAt || new Date().toISOString();
    this.appliedBy = data.appliedBy || 'system';
    this.status = data.status || ApplicationStatus.PENDING;
    this.prUrl = data.prUrl || null;
    this.backupPath = data.backupPath || null;
    this.filesModified = data.filesModified || [];
    this.filesAdded = data.filesAdded || [];
    this.error = data.error || null;
    this.duration = data.duration || null;
  }

  /**
   * Mark application as completed
   */
  markCompleted(duration = null) {
    this.status = ApplicationStatus.SUCCESS;
    this.duration = duration;
    return this;
  }

  /**
   * Mark application as failed
   */
  markFailed(error) {
    this.status = ApplicationStatus.FAILED;
    this.error = error;
    return this;
  }

  /**
   * Check if application was successful
   */
  isSuccessful() {
    return this.status === ApplicationStatus.SUCCESS;
  }

  /**
   * Check if application failed
   */
  isFailed() {
    return this.status === ApplicationStatus.FAILED;
  }

  /**
   * Get formatted duration
   */
  getFormattedDuration() {
    if (!this.duration) return 'N/A';
    
    if (this.duration < 60) {
      return `${this.duration}s`;
    }
    
    const minutes = Math.floor(this.duration / 60);
    const seconds = this.duration % 60;
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      id: this.id,
      repository: this.repository,
      templateName: this.templateName,
      templateVersion: this.templateVersion,
      appliedAt: this.appliedAt,
      appliedBy: this.appliedBy,
      status: this.status,
      prUrl: this.prUrl,
      backupPath: this.backupPath,
      filesModified: this.filesModified,
      filesAdded: this.filesAdded,
      error: this.error,
      duration: this.duration,
      durationFormatted: this.getFormattedDuration()
    };
  }
}

/**
 * Compliance Summary Model
 */
class ComplianceSummary {
  constructor(repositories = []) {
    this.repositories = repositories;
    this.calculate();
  }

  /**
   * Calculate summary statistics
   */
  calculate() {
    this.totalRepos = this.repositories.length;
    this.compliantRepos = this.repositories.filter(repo => repo.compliant).length;
    this.nonCompliantRepos = this.totalRepos - this.compliantRepos;
    this.complianceRate = this.totalRepos > 0 ? 
      Math.round((this.compliantRepos / this.totalRepos) * 100) : 0;
    
    // Average score
    if (this.totalRepos > 0) {
      const totalScore = this.repositories.reduce((sum, repo) => sum + repo.score, 0);
      this.averageScore = Math.round(totalScore / this.totalRepos);
    } else {
      this.averageScore = 0;
    }

    // Issue statistics
    this.totalIssues = this.repositories.reduce((sum, repo) => sum + repo.issues.length, 0);
    this.highSeverityIssues = this.repositories.reduce((sum, repo) => 
      sum + repo.getHighPriorityIssues().length, 0);

    return this;
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      totalRepos: this.totalRepos,
      compliantRepos: this.compliantRepos,
      nonCompliantRepos: this.nonCompliantRepos,
      complianceRate: this.complianceRate,
      averageScore: this.averageScore,
      totalIssues: this.totalIssues,
      highSeverityIssues: this.highSeverityIssues
    };
  }
}

module.exports = {
  ComplianceIssueType,
  ComplianceSeverity,
  ApplicationStatus,
  ComplianceIssue,
  RepositoryCompliance,
  Template,
  TemplateApplication,
  ComplianceSummary
};
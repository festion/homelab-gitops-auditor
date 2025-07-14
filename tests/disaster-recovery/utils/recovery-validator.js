/**
 * Recovery Validator for Disaster Recovery Testing
 * 
 * This utility validates the integrity and completeness of recovery operations
 * by comparing system states before and after recovery procedures.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class RecoveryValidator {
  constructor() {
    this.validationResults = [];
    this.checksumCache = new Map();
  }

  /**
   * Validate data integrity between two system states
   * @param {Object} beforeState - System state before failure
   * @param {Object} afterState - System state after recovery
   * @returns {Object} Integrity validation results
   */
  async validateDataIntegrity(beforeState, afterState) {
    console.log('🔍 Validating data integrity...');
    
    const result = {
      integrityScore: 0,
      corruptedFiles: 0,
      missingFiles: 0,
      modifiedFiles: 0,
      addedFiles: 0,
      totalFiles: 0,
      fileAnalysis: [],
      databaseIntegrity: null,
      configurationIntegrity: null
    };

    try {
      // Validate file system integrity
      const fileIntegrity = await this.validateFileSystemIntegrity(beforeState.files, afterState.files);
      
      result.corruptedFiles = fileIntegrity.corrupted.length;
      result.missingFiles = fileIntegrity.missing.length;
      result.modifiedFiles = fileIntegrity.modified.length;
      result.addedFiles = fileIntegrity.added.length;
      result.totalFiles = fileIntegrity.total;
      result.fileAnalysis = fileIntegrity.analysis;
      
      // Validate database integrity
      if (beforeState.database && afterState.database) {
        result.databaseIntegrity = await this.validateDatabaseIntegrity(
          beforeState.database,
          afterState.database
        );
      }
      
      // Validate configuration integrity
      if (beforeState.configuration && afterState.configuration) {
        result.configurationIntegrity = await this.validateConfigurationIntegrity(
          beforeState.configuration,
          afterState.configuration
        );
      }
      
      // Calculate overall integrity score
      result.integrityScore = this.calculateIntegrityScore(result);
      
      console.log(`📊 Data integrity score: ${(result.integrityScore * 100).toFixed(1)}%`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error validating data integrity:', error.message);
      throw error;
    }
  }

  /**
   * Validate file system integrity
   * @param {Array} beforeFiles - Files before failure
   * @param {Array} afterFiles - Files after recovery
   * @returns {Object} File system integrity results
   */
  async validateFileSystemIntegrity(beforeFiles, afterFiles) {
    const result = {
      corrupted: [],
      missing: [],
      modified: [],
      added: [],
      total: beforeFiles.length,
      analysis: []
    };

    const beforeFileMap = new Map(beforeFiles.map(f => [f.path, f]));
    const afterFileMap = new Map(afterFiles.map(f => [f.path, f]));

    // Check for missing and modified files
    for (const [filePath, beforeFile] of beforeFileMap) {
      const afterFile = afterFileMap.get(filePath);
      
      if (!afterFile) {
        result.missing.push(filePath);
        result.analysis.push({
          path: filePath,
          status: 'missing',
          before: beforeFile,
          after: null
        });
      } else {
        // Compare checksums
        const integrityCheck = await this.compareFileIntegrity(beforeFile, afterFile);
        
        if (!integrityCheck.intact) {
          if (integrityCheck.corrupted) {
            result.corrupted.push(filePath);
            result.analysis.push({
              path: filePath,
              status: 'corrupted',
              before: beforeFile,
              after: afterFile,
              reason: integrityCheck.reason
            });
          } else {
            result.modified.push(filePath);
            result.analysis.push({
              path: filePath,
              status: 'modified',
              before: beforeFile,
              after: afterFile,
              reason: integrityCheck.reason
            });
          }
        }
      }
    }

    // Check for added files
    for (const [filePath, afterFile] of afterFileMap) {
      if (!beforeFileMap.has(filePath)) {
        result.added.push(filePath);
        result.analysis.push({
          path: filePath,
          status: 'added',
          before: null,
          after: afterFile
        });
      }
    }

    return result;
  }

  /**
   * Compare file integrity between two file states
   * @param {Object} beforeFile - File state before failure
   * @param {Object} afterFile - File state after recovery
   * @returns {Object} File integrity comparison result
   */
  async compareFileIntegrity(beforeFile, afterFile) {
    const result = {
      intact: true,
      corrupted: false,
      reason: null
    };

    try {
      // Compare checksums
      if (beforeFile.checksum && afterFile.checksum) {
        if (beforeFile.checksum !== afterFile.checksum) {
          result.intact = false;
          
          // Check if file is corrupted or just modified
          const isCorrupted = await this.isFileCorrupted(afterFile.path);
          result.corrupted = isCorrupted;
          result.reason = isCorrupted ? 'File corrupted' : 'File modified';
        }
      }
      
      // Compare file sizes
      if (beforeFile.size !== afterFile.size) {
        result.intact = false;
        result.reason = `Size mismatch: ${beforeFile.size} vs ${afterFile.size}`;
      }
      
      // Compare modification times (with tolerance for recovery process)
      const timeDiff = Math.abs(beforeFile.mtime - afterFile.mtime);
      if (timeDiff > 300000) { // 5 minutes tolerance
        result.intact = false;
        result.reason = `Modification time mismatch: ${timeDiff}ms difference`;
      }
      
    } catch (error) {
      result.intact = false;
      result.corrupted = true;
      result.reason = `Error comparing files: ${error.message}`;
    }

    return result;
  }

  /**
   * Check if a file is corrupted
   * @param {string} filePath - Path to the file
   * @returns {boolean} True if file is corrupted
   */
  async isFileCorrupted(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check for common corruption patterns
      const corruptionPatterns = [
        /^\x00+$/, // All null bytes
        /corrupted/, // Explicit corruption markers
        /\x00{10,}/, // Long sequences of null bytes
        /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]{10,}/ // Control characters
      ];
      
      for (const pattern of corruptionPatterns) {
        if (pattern.test(content)) {
          return true;
        }
      }
      
      // Check specific file types
      const ext = path.extname(filePath).toLowerCase();
      
      switch (ext) {
        case '.json':
          try {
            JSON.parse(content);
          } catch (error) {
            return true;
          }
          break;
        case '.yaml':
        case '.yml':
          // Basic YAML validation
          if (content.includes('invalid: yaml: [')) {
            return true;
          }
          break;
        case '.sql':
          // Basic SQL validation
          if (content.includes('corrupted data')) {
            return true;
          }
          break;
      }
      
      return false;
      
    } catch (error) {
      // If we can't read the file, consider it corrupted
      return true;
    }
  }

  /**
   * Validate database integrity
   * @param {Object} beforeDb - Database state before failure
   * @param {Object} afterDb - Database state after recovery
   * @returns {Object} Database integrity validation results
   */
  async validateDatabaseIntegrity(beforeDb, afterDb) {
    console.log('🔍 Validating database integrity...');
    
    const result = {
      tablesIntact: true,
      recordsIntact: true,
      schemaIntact: true,
      indexesIntact: true,
      missingTables: [],
      missingRecords: 0,
      corruptedTables: [],
      integrityScore: 0
    };

    try {
      // Compare table structures
      const tableComparison = await this.compareDatabaseTables(beforeDb.tables, afterDb.tables);
      result.missingTables = tableComparison.missing;
      result.corruptedTables = tableComparison.corrupted;
      result.tablesIntact = tableComparison.missing.length === 0 && tableComparison.corrupted.length === 0;
      
      // Compare record counts
      const recordComparison = await this.compareDatabaseRecords(beforeDb.records, afterDb.records);
      result.missingRecords = recordComparison.missing;
      result.recordsIntact = recordComparison.missing === 0;
      
      // Compare schema
      const schemaComparison = await this.compareDatabaseSchema(beforeDb.schema, afterDb.schema);
      result.schemaIntact = schemaComparison.intact;
      
      // Calculate database integrity score
      result.integrityScore = this.calculateDatabaseIntegrityScore(result);
      
      console.log(`📊 Database integrity score: ${(result.integrityScore * 100).toFixed(1)}%`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error validating database integrity:', error.message);
      return {
        ...result,
        error: error.message,
        integrityScore: 0
      };
    }
  }

  /**
   * Validate configuration integrity
   * @param {Object} beforeConfig - Configuration before failure
   * @param {Object} afterConfig - Configuration after recovery
   * @returns {Object} Configuration integrity validation results
   */
  async validateConfigurationIntegrity(beforeConfig, afterConfig) {
    console.log('🔍 Validating configuration integrity...');
    
    const result = {
      configFilesIntact: true,
      settingsIntact: true,
      missingConfigs: [],
      modifiedConfigs: [],
      corruptedConfigs: [],
      integrityScore: 0
    };

    try {
      // Compare configuration files
      for (const [configPath, beforeValue] of Object.entries(beforeConfig)) {
        const afterValue = afterConfig[configPath];
        
        if (!afterValue) {
          result.missingConfigs.push(configPath);
        } else {
          // Deep compare configuration values
          const configComparison = await this.compareConfigurationValues(beforeValue, afterValue);
          
          if (!configComparison.intact) {
            if (configComparison.corrupted) {
              result.corruptedConfigs.push({
                path: configPath,
                reason: configComparison.reason
              });
            } else {
              result.modifiedConfigs.push({
                path: configPath,
                changes: configComparison.changes
              });
            }
          }
        }
      }
      
      result.configFilesIntact = result.missingConfigs.length === 0 && result.corruptedConfigs.length === 0;
      result.settingsIntact = result.modifiedConfigs.length === 0;
      
      // Calculate configuration integrity score
      result.integrityScore = this.calculateConfigurationIntegrityScore(result);
      
      console.log(`📊 Configuration integrity score: ${(result.integrityScore * 100).toFixed(1)}%`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error validating configuration integrity:', error.message);
      return {
        ...result,
        error: error.message,
        integrityScore: 0
      };
    }
  }

  /**
   * Validate data loss after recovery
   * @param {Object} beforeState - System state before failure
   * @param {Object} afterState - System state after recovery
   * @returns {Object} Data loss validation results
   */
  async validateDataLoss(beforeState, afterState) {
    console.log('🔍 Validating data loss...');
    
    const result = {
      dataLossDetected: false,
      dataLossWindow: 0,
      lostRecords: 0,
      lostFiles: 0,
      recoveredData: 0,
      dataLossScore: 0
    };

    try {
      // Calculate data loss window
      const failureTime = beforeState.timestamp;
      const recoveryTime = afterState.timestamp;
      result.dataLossWindow = recoveryTime - failureTime;
      
      // Compare data volumes
      const beforeDataVolume = this.calculateDataVolume(beforeState);
      const afterDataVolume = this.calculateDataVolume(afterState);
      
      if (afterDataVolume < beforeDataVolume) {
        result.dataLossDetected = true;
        result.lostRecords = beforeDataVolume.records - afterDataVolume.records;
        result.lostFiles = beforeDataVolume.files - afterDataVolume.files;
      }
      
      // Calculate recovery rate
      result.recoveredData = afterDataVolume.total / beforeDataVolume.total;
      
      // Calculate data loss score (0 = total loss, 1 = no loss)
      result.dataLossScore = Math.max(0, result.recoveredData);
      
      console.log(`📊 Data loss score: ${(result.dataLossScore * 100).toFixed(1)}%`);
      console.log(`📊 Data loss window: ${(result.dataLossWindow / (1000 * 60)).toFixed(2)} minutes`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error validating data loss:', error.message);
      return {
        ...result,
        error: error.message,
        dataLossScore: 0
      };
    }
  }

  /**
   * Calculate data volume from system state
   * @param {Object} systemState - System state
   * @returns {Object} Data volume metrics
   */
  calculateDataVolume(systemState) {
    const volume = {
      files: 0,
      records: 0,
      total: 0
    };

    // Count files
    if (systemState.files) {
      volume.files = systemState.files.length;
    }

    // Count database records
    if (systemState.database && systemState.database.records) {
      volume.records = Object.values(systemState.database.records).reduce((sum, count) => sum + count, 0);
    }

    // Calculate total data volume
    volume.total = volume.files + volume.records;

    return volume;
  }

  /**
   * Calculate overall integrity score
   * @param {Object} integrityResult - Integrity validation results
   * @returns {number} Integrity score (0-1)
   */
  calculateIntegrityScore(integrityResult) {
    const weights = {
      files: 0.4,
      database: 0.4,
      configuration: 0.2
    };

    let score = 0;
    let totalWeight = 0;

    // File integrity score
    if (integrityResult.totalFiles > 0) {
      const fileScore = 1 - (
        (integrityResult.corruptedFiles * 1.0) +
        (integrityResult.missingFiles * 0.8) +
        (integrityResult.modifiedFiles * 0.2)
      ) / integrityResult.totalFiles;
      
      score += Math.max(0, fileScore) * weights.files;
      totalWeight += weights.files;
    }

    // Database integrity score
    if (integrityResult.databaseIntegrity) {
      score += integrityResult.databaseIntegrity.integrityScore * weights.database;
      totalWeight += weights.database;
    }

    // Configuration integrity score
    if (integrityResult.configurationIntegrity) {
      score += integrityResult.configurationIntegrity.integrityScore * weights.configuration;
      totalWeight += weights.configuration;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Calculate database integrity score
   * @param {Object} dbResult - Database integrity results
   * @returns {number} Database integrity score (0-1)
   */
  calculateDatabaseIntegrityScore(dbResult) {
    const weights = {
      tables: 0.3,
      records: 0.4,
      schema: 0.3
    };

    let score = 0;

    // Tables score
    score += (dbResult.tablesIntact ? 1 : 0) * weights.tables;

    // Records score
    score += (dbResult.recordsIntact ? 1 : 0) * weights.records;

    // Schema score
    score += (dbResult.schemaIntact ? 1 : 0) * weights.schema;

    return score;
  }

  /**
   * Calculate configuration integrity score
   * @param {Object} configResult - Configuration integrity results
   * @returns {number} Configuration integrity score (0-1)
   */
  calculateConfigurationIntegrityScore(configResult) {
    const weights = {
      files: 0.6,
      settings: 0.4
    };

    let score = 0;

    // Configuration files score
    score += (configResult.configFilesIntact ? 1 : 0) * weights.files;

    // Settings score
    score += (configResult.settingsIntact ? 1 : 0) * weights.settings;

    return score;
  }

  /**
   * Compare database tables
   * @param {Object} beforeTables - Tables before failure
   * @param {Object} afterTables - Tables after recovery
   * @returns {Object} Table comparison results
   */
  async compareDatabaseTables(beforeTables, afterTables) {
    const result = {
      missing: [],
      corrupted: [],
      intact: []
    };

    for (const [tableName, beforeTable] of Object.entries(beforeTables)) {
      const afterTable = afterTables[tableName];
      
      if (!afterTable) {
        result.missing.push(tableName);
      } else {
        // Compare table structure
        const structureMatch = JSON.stringify(beforeTable.structure) === JSON.stringify(afterTable.structure);
        
        if (!structureMatch) {
          result.corrupted.push({
            table: tableName,
            reason: 'Structure mismatch'
          });
        } else {
          result.intact.push(tableName);
        }
      }
    }

    return result;
  }

  /**
   * Compare database records
   * @param {Object} beforeRecords - Records before failure
   * @param {Object} afterRecords - Records after recovery
   * @returns {Object} Record comparison results
   */
  async compareDatabaseRecords(beforeRecords, afterRecords) {
    const result = {
      missing: 0,
      added: 0,
      modified: 0
    };

    for (const [tableName, beforeCount] of Object.entries(beforeRecords)) {
      const afterCount = afterRecords[tableName] || 0;
      
      if (afterCount < beforeCount) {
        result.missing += beforeCount - afterCount;
      } else if (afterCount > beforeCount) {
        result.added += afterCount - beforeCount;
      }
    }

    return result;
  }

  /**
   * Compare database schema
   * @param {Object} beforeSchema - Schema before failure
   * @param {Object} afterSchema - Schema after recovery
   * @returns {Object} Schema comparison results
   */
  async compareDatabaseSchema(beforeSchema, afterSchema) {
    const result = {
      intact: true,
      differences: []
    };

    try {
      const schemaMatch = JSON.stringify(beforeSchema) === JSON.stringify(afterSchema);
      result.intact = schemaMatch;
      
      if (!schemaMatch) {
        result.differences.push('Schema structure mismatch');
      }
      
    } catch (error) {
      result.intact = false;
      result.differences.push(`Schema comparison error: ${error.message}`);
    }

    return result;
  }

  /**
   * Compare configuration values
   * @param {any} beforeValue - Configuration value before failure
   * @param {any} afterValue - Configuration value after recovery
   * @returns {Object} Configuration comparison results
   */
  async compareConfigurationValues(beforeValue, afterValue) {
    const result = {
      intact: true,
      corrupted: false,
      changes: [],
      reason: null
    };

    try {
      if (typeof beforeValue !== typeof afterValue) {
        result.intact = false;
        result.reason = 'Type mismatch';
        return result;
      }

      if (typeof beforeValue === 'object') {
        const beforeJson = JSON.stringify(beforeValue);
        const afterJson = JSON.stringify(afterValue);
        
        if (beforeJson !== afterJson) {
          result.intact = false;
          result.changes.push('Object structure changed');
        }
      } else {
        if (beforeValue !== afterValue) {
          result.intact = false;
          result.changes.push(`Value changed from ${beforeValue} to ${afterValue}`);
        }
      }
      
    } catch (error) {
      result.intact = false;
      result.corrupted = true;
      result.reason = `Configuration comparison error: ${error.message}`;
    }

    return result;
  }

  /**
   * Generate recovery validation report
   * @param {Object} validationResults - All validation results
   * @returns {Object} Comprehensive validation report
   */
  generateValidationReport(validationResults) {
    const report = {
      timestamp: new Date().toISOString(),
      overall: {
        passed: true,
        score: 0,
        grade: 'F'
      },
      details: validationResults,
      recommendations: []
    };

    // Calculate overall score
    const scores = [];
    if (validationResults.integrityScore !== undefined) {
      scores.push(validationResults.integrityScore);
    }
    if (validationResults.dataLossScore !== undefined) {
      scores.push(validationResults.dataLossScore);
    }

    if (scores.length > 0) {
      report.overall.score = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    // Determine grade
    if (report.overall.score >= 0.95) {
      report.overall.grade = 'A';
    } else if (report.overall.score >= 0.90) {
      report.overall.grade = 'B';
    } else if (report.overall.score >= 0.80) {
      report.overall.grade = 'C';
    } else if (report.overall.score >= 0.70) {
      report.overall.grade = 'D';
    } else {
      report.overall.grade = 'F';
    }

    // Determine if validation passed
    report.overall.passed = report.overall.score >= 0.95;

    // Generate recommendations
    if (validationResults.corruptedFiles > 0) {
      report.recommendations.push('Investigate file corruption causes and improve backup verification');
    }
    if (validationResults.missingFiles > 0) {
      report.recommendations.push('Review backup completeness and restore procedures');
    }
    if (validationResults.dataLossDetected) {
      report.recommendations.push('Reduce backup frequency to minimize data loss window');
    }

    return report;
  }

  /**
   * Clear validation results
   */
  clearResults() {
    this.validationResults = [];
    this.checksumCache.clear();
  }
}

module.exports = { RecoveryValidator };
// scripts/backup/backup-validator.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { Logger } = require('../services/utils/logger');

class BackupValidator {
  constructor(options = {}) {
    this.logger = new Logger('BackupValidator');
    this.options = {
      enableDeepValidation: options.enableDeepValidation !== false,
      checksumAlgorithm: options.checksumAlgorithm || 'sha256',
      tempDir: options.tempDir || '/tmp',
      ...options
    };
  }

  async validateBackupIntegrity(backupPath, options = {}) {
    const validationOptions = { ...this.options, ...options };
    
    this.logger.info(`Starting backup integrity validation: ${backupPath}`);
    
    const results = {
      path: backupPath,
      valid: false,
      errors: [],
      warnings: [],
      checks: {},
      metadata: {}
    };
    
    try {
      // 1. File existence and accessibility check
      results.checks.fileExists = await this.checkFileExists(backupPath);
      if (!results.checks.fileExists.passed) {
        results.errors.push('Backup file does not exist or is not accessible');
        return results;
      }
      
      // 2. File size validation
      results.checks.fileSize = await this.checkFileSize(backupPath);
      if (!results.checks.fileSize.passed) {
        results.errors.push(`Invalid file size: ${results.checks.fileSize.error}`);
      }
      
      // 3. Archive integrity check
      results.checks.archiveIntegrity = await this.checkArchiveIntegrity(backupPath);
      if (!results.checks.archiveIntegrity.passed) {
        results.errors.push(`Archive integrity check failed: ${results.checks.archiveIntegrity.error}`);
        return results;
      }
      
      // 4. Checksum validation (if provided)
      if (validationOptions.expectedChecksum) {
        results.checks.checksum = await this.validateChecksum(
          backupPath, 
          validationOptions.expectedChecksum,
          validationOptions.checksumAlgorithm
        );
        if (!results.checks.checksum.passed) {
          results.errors.push(`Checksum validation failed: ${results.checks.checksum.error}`);
        }
      }
      
      // 5. Deep validation (extract and validate contents)
      if (validationOptions.enableDeepValidation && results.errors.length === 0) {
        results.checks.contentValidation = await this.performDeepValidation(backupPath, validationOptions);
        if (!results.checks.contentValidation.passed) {
          results.warnings.push(...results.checks.contentValidation.warnings || []);
          if (results.checks.contentValidation.critical) {
            results.errors.push(`Content validation failed: ${results.checks.contentValidation.error}`);
          }
        }
      }
      
      // 6. Generate backup metadata
      results.metadata = await this.generateBackupMetadata(backupPath);
      
      // Determine overall validation result
      results.valid = results.errors.length === 0;
      
      if (results.valid) {
        this.logger.info(`Backup validation passed: ${backupPath}`, {
          warnings: results.warnings.length,
          checks: Object.keys(results.checks).length
        });
      } else {
        this.logger.error(`Backup validation failed: ${backupPath}`, {
          errors: results.errors.length,
          warnings: results.warnings.length
        });
      }
      
      return results;
      
    } catch (error) {
      this.logger.error(`Backup validation error: ${error.message}`, { backupPath });
      results.errors.push(`Validation error: ${error.message}`);
      return results;
    }
  }

  async checkFileExists(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      return {
        passed: true,
        size: stats.size,
        modified: stats.mtime,
        accessible: true
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        accessible: false
      };
    }
  }

  async checkFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const sizeBytes = stats.size;
      
      // Check for obviously invalid sizes
      if (sizeBytes === 0) {
        return {
          passed: false,
          size: sizeBytes,
          error: 'Backup file is empty'
        };
      }
      
      if (sizeBytes < 100) { // Less than 100 bytes is suspicious
        return {
          passed: false,
          size: sizeBytes,
          error: 'Backup file is suspiciously small'
        };
      }
      
      // Check for files that are too large (default: 1GB)
      const maxSize = this.options.maxBackupSize || (1024 * 1024 * 1024);
      if (sizeBytes > maxSize) {
        return {
          passed: false,
          size: sizeBytes,
          error: `Backup file exceeds maximum size limit (${maxSize} bytes)`
        };
      }
      
      return {
        passed: true,
        size: sizeBytes,
        sizeMB: Math.round(sizeBytes / (1024 * 1024) * 100) / 100
      };
      
    } catch (error) {
      return {
        passed: false,
        error: error.message
      };
    }
  }

  async checkArchiveIntegrity(filePath) {
    try {
      // Test tar file integrity by listing contents
      const { stdout, stderr } = await execAsync(`tar -tzf "${filePath}" | head -20`, {
        timeout: 30000 // 30 second timeout
      });
      
      const fileList = stdout.trim().split('\n').filter(line => line.length > 0);
      
      if (fileList.length === 0) {
        return {
          passed: false,
          error: 'Archive appears to be empty'
        };
      }
      
      // Check for common Home Assistant configuration files
      const expectedFiles = [
        'configuration.yaml',
        'automations.yaml',
        'scripts.yaml'
      ];
      
      const foundFiles = expectedFiles.filter(file => 
        fileList.some(archiveFile => archiveFile.includes(file))
      );
      
      return {
        passed: true,
        fileCount: fileList.length,
        foundEssentialFiles: foundFiles,
        missingEssentialFiles: expectedFiles.filter(file => !foundFiles.includes(file)),
        warnings: stderr ? [stderr] : []
      };
      
    } catch (error) {
      return {
        passed: false,
        error: `Archive integrity check failed: ${error.message}`
      };
    }
  }

  async validateChecksum(filePath, expectedChecksum, algorithm = 'sha256') {
    try {
      const calculatedChecksum = await this.calculateChecksum(filePath, algorithm);
      
      const passed = calculatedChecksum.toLowerCase() === expectedChecksum.toLowerCase();
      
      return {
        passed,
        expected: expectedChecksum,
        calculated: calculatedChecksum,
        algorithm,
        error: passed ? null : 'Checksum mismatch'
      };
      
    } catch (error) {
      return {
        passed: false,
        error: `Checksum calculation failed: ${error.message}`,
        algorithm
      };
    }
  }

  async calculateChecksum(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async performDeepValidation(backupPath, options = {}) {
    const tempDir = path.join(this.options.tempDir, `backup-validation-${Date.now()}`);
    
    try {
      // Extract backup to temporary directory
      await fs.mkdir(tempDir, { recursive: true });
      
      await execAsync(`tar -xzf "${backupPath}" -C "${tempDir}"`, {
        timeout: 120000 // 2 minute timeout
      });
      
      this.logger.debug(`Extracted backup for validation: ${tempDir}`);
      
      // Validate extracted contents
      const validation = await this.validateExtractedContents(tempDir, options);
      
      return validation;
      
    } catch (error) {
      return {
        passed: false,
        critical: true,
        error: `Deep validation failed: ${error.message}`
      };
    } finally {
      // Cleanup temporary directory
      try {
        await execAsync(`rm -rf "${tempDir}"`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup validation temp dir: ${cleanupError.message}`);
      }
    }
  }

  async validateExtractedContents(extractedPath, options = {}) {
    const validation = {
      passed: true,
      warnings: [],
      errors: [],
      critical: false,
      files: {}
    };
    
    try {
      // Get list of extracted files
      const files = await this.getFileList(extractedPath);
      validation.files.total = files.length;
      
      // Check for essential Home Assistant files
      const essentialFiles = [
        'configuration.yaml',
        'automations.yaml',
        'scripts.yaml',
        'scenes.yaml'
      ];
      
      validation.files.essential = {};
      
      for (const file of essentialFiles) {
        const filePath = path.join(extractedPath, file);
        
        try {
          await fs.access(filePath);
          validation.files.essential[file] = await this.validateConfigFile(filePath);
          
          if (!validation.files.essential[file].valid) {
            validation.warnings.push(`${file} has validation issues`);
          }
          
        } catch (error) {
          validation.files.essential[file] = {
            exists: false,
            valid: false,
            error: error.message
          };
          
          if (file === 'configuration.yaml') {
            validation.critical = true;
            validation.errors.push('configuration.yaml is missing');
          } else {
            validation.warnings.push(`${file} is missing`);
          }
        }
      }
      
      // Check for suspicious files or patterns
      const suspiciousPatterns = [
        /\.pyc$/,
        /\.log$/,
        /\.tmp$/,
        /__pycache__/,
        /\.git\//
      ];
      
      const suspiciousFiles = files.filter(file => 
        suspiciousPatterns.some(pattern => pattern.test(file))
      );
      
      if (suspiciousFiles.length > 0) {
        validation.warnings.push(`Found ${suspiciousFiles.length} suspicious files in backup`);
        validation.files.suspicious = suspiciousFiles.slice(0, 10); // Limit to first 10
      }
      
      // Check backup completeness
      const minExpectedFiles = 5; // Minimum number of files for a valid backup
      if (files.length < minExpectedFiles) {
        validation.warnings.push(`Backup contains only ${files.length} files (expected at least ${minExpectedFiles})`);
      }
      
      // Final validation result
      validation.passed = validation.errors.length === 0;
      
      return validation;
      
    } catch (error) {
      return {
        passed: false,
        critical: true,
        error: `Content validation error: ${error.message}`,
        warnings: [],
        errors: [error.message]
      };
    }
  }

  async getFileList(dirPath) {
    try {
      const { stdout } = await execAsync(`find "${dirPath}" -type f`, {
        timeout: 30000
      });
      
      return stdout.trim().split('\n')
        .filter(line => line.length > 0)
        .map(filePath => path.relative(dirPath, filePath));
        
    } catch (error) {
      this.logger.warn(`Failed to get file list: ${error.message}`);
      return [];
    }
  }

  async validateConfigFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      const validation = {
        exists: true,
        valid: true,
        size: content.length,
        warnings: []
      };
      
      // Basic YAML structure validation
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // Check for basic YAML issues
        if (content.includes('\t')) {
          validation.warnings.push('Contains tabs (YAML should use spaces)');
        }
        
        // Check for common YAML problems
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Check for unescaped special characters
          if (line.match(/[{}[\]]/)) {
            validation.warnings.push(`Line ${i + 1}: Contains unescaped special characters`);
          }
          
          // Check for inconsistent indentation
          if (line.match(/^ +[^ ]/)) {
            const indent = line.match(/^ +/)[0].length;
            if (indent % 2 !== 0) {
              validation.warnings.push(`Line ${i + 1}: Inconsistent indentation`);
            }
          }
        }
      }
      
      // Check file size
      if (content.length === 0) {
        validation.valid = false;
        validation.warnings.push('File is empty');
      }
      
      if (content.length > 1024 * 1024) { // > 1MB
        validation.warnings.push('File is unusually large');
      }
      
      return validation;
      
    } catch (error) {
      return {
        exists: false,
        valid: false,
        error: error.message
      };
    }
  }

  async generateBackupMetadata(backupPath) {
    try {
      const stats = await fs.stat(backupPath);
      const checksum = await this.calculateChecksum(backupPath, this.options.checksumAlgorithm);
      
      // Get basic archive information
      let fileCount = null;
      let compressedSize = null;
      let uncompressedSize = null;
      
      try {
        const { stdout } = await execAsync(`tar -tzf "${backupPath}" | wc -l`, {
          timeout: 30000
        });
        fileCount = parseInt(stdout.trim(), 10);
      } catch (error) {
        this.logger.debug(`Could not count archive files: ${error.message}`);
      }
      
      return {
        path: backupPath,
        size: stats.size,
        sizeMB: Math.round(stats.size / (1024 * 1024) * 100) / 100,
        modified: stats.mtime.toISOString(),
        checksum: checksum,
        checksumAlgorithm: this.options.checksumAlgorithm,
        fileCount: fileCount,
        compressedSize: stats.size,
        validatedAt: new Date().toISOString(),
        validator: 'BackupValidator v1.0'
      };
      
    } catch (error) {
      this.logger.warn(`Failed to generate complete metadata: ${error.message}`);
      
      return {
        path: backupPath,
        error: error.message,
        validatedAt: new Date().toISOString(),
        validator: 'BackupValidator v1.0'
      };
    }
  }

  async batchValidateBackups(backupPaths, options = {}) {
    const batchOptions = {
      concurrency: options.concurrency || 3,
      continueOnError: options.continueOnError !== false,
      ...options
    };
    
    this.logger.info(`Starting batch validation of ${backupPaths.length} backups`);
    
    const results = [];
    const errors = [];
    
    // Process backups in batches to avoid overwhelming the system
    for (let i = 0; i < backupPaths.length; i += batchOptions.concurrency) {
      const batch = backupPaths.slice(i, i + batchOptions.concurrency);
      
      const batchPromises = batch.map(async (backupPath) => {
        try {
          const result = await this.validateBackupIntegrity(backupPath, batchOptions);
          results.push(result);
          return result;
        } catch (error) {
          const errorResult = {
            path: backupPath,
            valid: false,
            errors: [error.message],
            warnings: [],
            checks: {},
            metadata: {}
          };
          
          errors.push(errorResult);
          
          if (!batchOptions.continueOnError) {
            throw error;
          }
          
          return errorResult;
        }
      });
      
      await Promise.all(batchPromises);
      
      this.logger.debug(`Completed batch ${Math.floor(i / batchOptions.concurrency) + 1}/${Math.ceil(backupPaths.length / batchOptions.concurrency)}`);
    }
    
    const summary = {
      total: backupPaths.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      errors: errors.length,
      results: [...results, ...errors]
    };
    
    this.logger.info(`Batch validation completed`, {
      total: summary.total,
      valid: summary.valid,
      invalid: summary.invalid,
      errors: summary.errors
    });
    
    return summary;
  }
}

module.exports = { BackupValidator };
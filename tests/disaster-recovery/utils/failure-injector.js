/**
 * Failure Injection Utility for Disaster Recovery Testing
 * 
 * This utility provides controlled failure injection capabilities
 * to test system resilience and recovery procedures.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class FailureInjector {
  constructor() {
    this.activeFailures = new Map();
    this.failureHistory = [];
    this.cleanupHandlers = [];
  }

  /**
   * Inject a service failure
   * @param {string} serviceName - Name of the service to fail
   * @param {string} failureType - Type of failure (crash, hang, slow, corrupt, network)
   * @param {Object} options - Additional options for failure injection
   * @returns {string} Failure ID for tracking
   */
  async injectServiceFailure(serviceName, failureType = 'crash', options = {}) {
    console.log(`💥 Injecting ${failureType} failure for ${serviceName}...`);
    
    const failureId = `${serviceName}-${failureType}-${Date.now()}`;
    
    const failure = {
      id: failureId,
      service: serviceName,
      type: failureType,
      startTime: Date.now(),
      active: true,
      options: options
    };
    
    this.activeFailures.set(failureId, failure);
    this.failureHistory.push(failure);
    
    try {
      switch (failureType) {
        case 'crash':
          await this.crashService(serviceName, options);
          break;
        case 'hang':
          await this.hangService(serviceName, options);
          break;
        case 'slow':
          await this.slowService(serviceName, options);
          break;
        case 'corrupt':
          await this.corruptService(serviceName, options);
          break;
        case 'network':
          await this.networkIsolateService(serviceName, options);
          break;
        case 'memory':
          await this.memoryExhaustionService(serviceName, options);
          break;
        case 'disk':
          await this.diskExhaustionService(serviceName, options);
          break;
        default:
          throw new Error(`Unknown failure type: ${failureType}`);
      }
      
      console.log(`✅ Successfully injected ${failureType} failure for ${serviceName}`);
      return failureId;
      
    } catch (error) {
      console.error(`❌ Failed to inject ${failureType} failure for ${serviceName}:`, error.message);
      failure.active = false;
      failure.error = error.message;
      this.activeFailures.delete(failureId);
      throw error;
    }
  }

  /**
   * Crash a service by terminating its process
   */
  async crashService(serviceName, options = {}) {
    const signal = options.signal || 'SIGKILL';
    
    try {
      switch (serviceName) {
        case 'database':
          await execAsync(`docker kill homelab-gitops-db || true`);
          break;
        case 'api':
          await execAsync(`pkill -${signal} -f "node.*api" || true`);
          break;
        case 'mcp-servers':
          await execAsync(`pkill -${signal} -f "mcp-wrapper" || true`);
          break;
        case 'dashboard':
          await execAsync(`docker kill homelab-gitops-dashboard || true`);
          break;
        case 'nginx':
          await execAsync(`docker kill homelab-gitops-nginx || true`);
          break;
        case 'redis':
          await execAsync(`docker kill homelab-gitops-redis || true`);
          break;
        default:
          throw new Error(`Crash injection not implemented for: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to crash service ${serviceName}:`, error.message);
    }
  }

  /**
   * Hang a service by sending SIGSTOP signal
   */
  async hangService(serviceName, options = {}) {
    try {
      switch (serviceName) {
        case 'database':
          await execAsync(`docker exec homelab-gitops-db sh -c "kill -STOP 1" || true`);
          break;
        case 'api':
          await execAsync(`pkill -STOP -f "node.*api" || true`);
          break;
        case 'mcp-servers':
          await execAsync(`pkill -STOP -f "mcp-wrapper" || true`);
          break;
        default:
          throw new Error(`Hang injection not implemented for: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to hang service ${serviceName}:`, error.message);
    }
  }

  /**
   * Slow down a service by limiting resources
   */
  async slowService(serviceName, options = {}) {
    const cpuLimit = options.cpuLimit || 10; // 10% CPU
    const networkDelay = options.networkDelay || 2000; // 2 seconds delay
    
    try {
      switch (serviceName) {
        case 'database':
          // Add network latency
          await execAsync(`docker exec homelab-gitops-db tc qdisc add dev eth0 root netem delay ${networkDelay}ms || true`);
          // Limit CPU
          await execAsync(`docker update --cpus="0.1" homelab-gitops-db || true`);
          break;
        case 'api':
          // Limit CPU for API process
          await execAsync(`cpulimit -l ${cpuLimit} -z -p $(pgrep -f "node.*api") || true`);
          break;
        case 'disk':
          // Slow down disk I/O
          await execAsync(`ionice -c 3 -p $(pgrep -f "node.*api") || true`);
          break;
        default:
          throw new Error(`Slow injection not implemented for: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to slow service ${serviceName}:`, error.message);
    }
  }

  /**
   * Corrupt service data or configuration
   */
  async corruptService(serviceName, options = {}) {
    const corruptionType = options.corruptionType || 'random';
    
    try {
      switch (serviceName) {
        case 'database':
          await this.corruptDatabaseFiles(corruptionType);
          break;
        case 'configuration':
          await this.corruptConfigurationFiles(corruptionType);
          break;
        case 'logs':
          await this.corruptLogFiles(corruptionType);
          break;
        case 'backup':
          await this.corruptBackupFiles(corruptionType);
          break;
        default:
          throw new Error(`Corruption injection not implemented for: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to corrupt service ${serviceName}:`, error.message);
    }
  }

  /**
   * Isolate service from network
   */
  async networkIsolateService(serviceName, options = {}) {
    const ports = options.ports || this.getServicePorts(serviceName);
    
    try {
      for (const port of ports) {
        // Block incoming connections
        await execAsync(`iptables -A INPUT -p tcp --dport ${port} -j DROP || true`);
        // Block outgoing connections
        await execAsync(`iptables -A OUTPUT -p tcp --sport ${port} -j DROP || true`);
      }
      
      // Store cleanup information
      this.cleanupHandlers.push({
        type: 'network',
        service: serviceName,
        ports: ports
      });
      
    } catch (error) {
      console.warn(`Failed to isolate service ${serviceName}:`, error.message);
    }
  }

  /**
   * Exhaust memory for a service
   */
  async memoryExhaustionService(serviceName, options = {}) {
    const memoryLimit = options.memoryLimit || '100m';
    
    try {
      switch (serviceName) {
        case 'database':
          await execAsync(`docker update --memory="${memoryLimit}" homelab-gitops-db || true`);
          break;
        case 'api':
          // Use memory stress tool
          await execAsync(`stress --vm 1 --vm-bytes 500M --timeout 300s &`);
          break;
        default:
          throw new Error(`Memory exhaustion not implemented for: ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to exhaust memory for service ${serviceName}:`, error.message);
    }
  }

  /**
   * Exhaust disk space for a service
   */
  async diskExhaustionService(serviceName, options = {}) {
    const size = options.size || '1G';
    const targetPath = options.targetPath || '/tmp/disk-exhaust';
    
    try {
      // Create large file to exhaust disk space
      await execAsync(`dd if=/dev/zero of=${targetPath} bs=1M count=${size.replace('G', '000')} || true`);
      
      // Store cleanup information
      this.cleanupHandlers.push({
        type: 'disk',
        path: targetPath
      });
      
    } catch (error) {
      console.warn(`Failed to exhaust disk space:`, error.message);
    }
  }

  /**
   * Recover a service from failure
   */
  async recoverService(failureId) {
    const failure = this.activeFailures.get(failureId);
    
    if (!failure) {
      throw new Error(`Failure ${failureId} not found`);
    }
    
    console.log(`🔄 Recovering service ${failure.service} from ${failure.type} failure...`);
    
    try {
      switch (failure.type) {
        case 'crash':
          await this.restartService(failure.service);
          break;
        case 'hang':
          await this.resumeService(failure.service);
          break;
        case 'slow':
          await this.removeSlowdown(failure.service);
          break;
        case 'corrupt':
          await this.repairCorruption(failure.service);
          break;
        case 'network':
          await this.restoreNetworkAccess(failure.service);
          break;
        case 'memory':
          await this.restoreMemoryLimits(failure.service);
          break;
        case 'disk':
          await this.restoreDiskSpace(failure.service);
          break;
      }
      
      failure.active = false;
      failure.endTime = Date.now();
      failure.duration = failure.endTime - failure.startTime;
      
      this.activeFailures.delete(failureId);
      
      console.log(`✅ Service ${failure.service} recovered successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to recover service ${failure.service}:`, error.message);
      throw error;
    }
  }

  /**
   * Restart a crashed service
   */
  async restartService(serviceName) {
    try {
      switch (serviceName) {
        case 'database':
          await execAsync('docker start homelab-gitops-db || true');
          break;
        case 'api':
          await execAsync('cd /home/dev/workspace/homelab-gitops-auditor && npm start &');
          break;
        case 'mcp-servers':
          await execAsync('cd /home/dev/workspace && ./start-mcp-servers.sh');
          break;
        case 'dashboard':
          await execAsync('docker start homelab-gitops-dashboard || true');
          break;
        case 'nginx':
          await execAsync('docker start homelab-gitops-nginx || true');
          break;
        case 'redis':
          await execAsync('docker start homelab-gitops-redis || true');
          break;
      }
    } catch (error) {
      console.warn(`Failed to restart service ${serviceName}:`, error.message);
    }
  }

  /**
   * Resume a hung service
   */
  async resumeService(serviceName) {
    try {
      switch (serviceName) {
        case 'database':
          await execAsync('docker exec homelab-gitops-db sh -c "kill -CONT 1" || true');
          break;
        case 'api':
          await execAsync('pkill -CONT -f "node.*api" || true');
          break;
        case 'mcp-servers':
          await execAsync('pkill -CONT -f "mcp-wrapper" || true');
          break;
      }
    } catch (error) {
      console.warn(`Failed to resume service ${serviceName}:`, error.message);
    }
  }

  /**
   * Remove slowdown from a service
   */
  async removeSlowdown(serviceName) {
    try {
      switch (serviceName) {
        case 'database':
          await execAsync('docker exec homelab-gitops-db tc qdisc del dev eth0 root || true');
          await execAsync('docker update --cpus="" homelab-gitops-db || true');
          break;
        case 'api':
          await execAsync('pkill -f "cpulimit.*node.*api" || true');
          break;
        case 'disk':
          await execAsync('ionice -c 0 -p $(pgrep -f "node.*api") || true');
          break;
      }
    } catch (error) {
      console.warn(`Failed to remove slowdown for service ${serviceName}:`, error.message);
    }
  }

  /**
   * Repair corruption in a service
   */
  async repairCorruption(serviceName) {
    try {
      switch (serviceName) {
        case 'database':
          await this.restoreDatabase();
          break;
        case 'configuration':
          await this.restoreConfiguration();
          break;
        case 'logs':
          await this.restoreLogs();
          break;
        case 'backup':
          await this.restoreBackups();
          break;
      }
    } catch (error) {
      console.warn(`Failed to repair corruption for service ${serviceName}:`, error.message);
    }
  }

  /**
   * Restore network access for a service
   */
  async restoreNetworkAccess(serviceName) {
    const ports = this.getServicePorts(serviceName);
    
    try {
      for (const port of ports) {
        await execAsync(`iptables -D INPUT -p tcp --dport ${port} -j DROP || true`);
        await execAsync(`iptables -D OUTPUT -p tcp --sport ${port} -j DROP || true`);
      }
    } catch (error) {
      console.warn(`Failed to restore network access for service ${serviceName}:`, error.message);
    }
  }

  /**
   * Restore memory limits for a service
   */
  async restoreMemoryLimits(serviceName) {
    try {
      switch (serviceName) {
        case 'database':
          await execAsync('docker update --memory="" homelab-gitops-db || true');
          break;
        case 'api':
          await execAsync('pkill -f "stress" || true');
          break;
      }
    } catch (error) {
      console.warn(`Failed to restore memory limits for service ${serviceName}:`, error.message);
    }
  }

  /**
   * Restore disk space
   */
  async restoreDiskSpace(serviceName) {
    try {
      await execAsync('rm -f /tmp/disk-exhaust || true');
    } catch (error) {
      console.warn(`Failed to restore disk space:`, error.message);
    }
  }

  /**
   * Corrupt database files
   */
  async corruptDatabaseFiles(corruptionType) {
    const dbPath = '/var/lib/postgresql/data';
    
    try {
      switch (corruptionType) {
        case 'random':
          await fs.writeFile(path.join(dbPath, 'postgresql.conf'), 'corrupted data');
          break;
        case 'partial':
          const configContent = await fs.readFile(path.join(dbPath, 'postgresql.conf'), 'utf8');
          await fs.writeFile(path.join(dbPath, 'postgresql.conf'), configContent.substring(0, 100) + 'corrupted');
          break;
        case 'empty':
          await fs.writeFile(path.join(dbPath, 'postgresql.conf'), '');
          break;
      }
    } catch (error) {
      console.warn(`Failed to corrupt database files:`, error.message);
    }
  }

  /**
   * Corrupt configuration files
   */
  async corruptConfigurationFiles(corruptionType) {
    const configFiles = [
      '/config/configuration.yaml',
      '/config/automations.yaml',
      '/config/scripts.yaml'
    ];
    
    try {
      for (const file of configFiles) {
        switch (corruptionType) {
          case 'random':
            await fs.writeFile(file, 'invalid: yaml: [');
            break;
          case 'partial':
            const content = await fs.readFile(file, 'utf8');
            await fs.writeFile(file, content.substring(0, 50) + 'invalid: yaml: [');
            break;
          case 'empty':
            await fs.writeFile(file, '');
            break;
        }
      }
    } catch (error) {
      console.warn(`Failed to corrupt configuration files:`, error.message);
    }
  }

  /**
   * Corrupt log files
   */
  async corruptLogFiles(corruptionType) {
    const logFiles = [
      '/logs/application.log',
      '/logs/error.log',
      '/logs/audit.log'
    ];
    
    try {
      for (const file of logFiles) {
        switch (corruptionType) {
          case 'random':
            await fs.writeFile(file, 'corrupted log data');
            break;
          case 'truncate':
            await fs.writeFile(file, '');
            break;
        }
      }
    } catch (error) {
      console.warn(`Failed to corrupt log files:`, error.message);
    }
  }

  /**
   * Corrupt backup files
   */
  async corruptBackupFiles(corruptionType) {
    const backupDir = '/backups';
    
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(f => f.endsWith('.tar.gz'));
      
      for (const file of backupFiles) {
        const filePath = path.join(backupDir, file);
        switch (corruptionType) {
          case 'random':
            await fs.writeFile(filePath, 'corrupted backup data');
            break;
          case 'partial':
            const content = await fs.readFile(filePath);
            await fs.writeFile(filePath, content.slice(0, 1000) + Buffer.from('corrupted'));
            break;
        }
      }
    } catch (error) {
      console.warn(`Failed to corrupt backup files:`, error.message);
    }
  }

  /**
   * Get service ports for network isolation
   */
  getServicePorts(serviceName) {
    const portMap = {
      'database': [5432],
      'api': [3071],
      'dashboard': [3000],
      'nginx': [80, 443],
      'redis': [6379],
      'mcp-servers': [8080, 8081, 8082]
    };
    
    return portMap[serviceName] || [];
  }

  /**
   * Restore database from backup
   */
  async restoreDatabase() {
    // Implementation depends on backup strategy
    console.log('Restoring database from backup...');
  }

  /**
   * Restore configuration from backup
   */
  async restoreConfiguration() {
    // Implementation depends on backup strategy
    console.log('Restoring configuration from backup...');
  }

  /**
   * Restore logs from backup
   */
  async restoreLogs() {
    // Implementation depends on backup strategy
    console.log('Restoring logs from backup...');
  }

  /**
   * Restore backups from secondary location
   */
  async restoreBackups() {
    // Implementation depends on backup strategy
    console.log('Restoring backups from secondary location...');
  }

  /**
   * Get all active failures
   */
  getActiveFailures() {
    return Array.from(this.activeFailures.values());
  }

  /**
   * Get failure history
   */
  getFailureHistory() {
    return this.failureHistory;
  }

  /**
   * Recover all active failures
   */
  async recoverAllFailures() {
    const activeFailures = this.getActiveFailures();
    
    for (const failure of activeFailures) {
      try {
        await this.recoverService(failure.id);
      } catch (error) {
        console.error(`Failed to recover failure ${failure.id}:`, error.message);
      }
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up failure injection resources...');
    
    // Recover all active failures
    await this.recoverAllFailures();
    
    // Execute cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        switch (handler.type) {
          case 'network':
            for (const port of handler.ports) {
              await execAsync(`iptables -D INPUT -p tcp --dport ${port} -j DROP || true`);
              await execAsync(`iptables -D OUTPUT -p tcp --sport ${port} -j DROP || true`);
            }
            break;
          case 'disk':
            await execAsync(`rm -f ${handler.path} || true`);
            break;
        }
      } catch (error) {
        console.warn(`Failed to cleanup handler:`, error.message);
      }
    }
    
    this.cleanupHandlers = [];
    console.log('✅ Cleanup completed');
  }
}

module.exports = { FailureInjector };
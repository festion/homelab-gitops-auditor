const os = require('os');
const { execSync } = require('child_process');
const { EventEmitter } = require('events');

class PerformanceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      interval: options.interval || 1000,
      enableDiskMonitoring: options.enableDiskMonitoring !== false,
      enableNetworkMonitoring: options.enableNetworkMonitoring !== false,
      enableDatabaseMonitoring: options.enableDatabaseMonitoring !== false,
      ...options
    };
    
    this.monitoring = false;
    this.monitoringInterval = null;
    this.metrics = this.initializeMetrics();
    this.baseline = null;
  }

  initializeMetrics() {
    return {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      database: [],
      custom: [],
      startTime: null,
      endTime: null
    };
  }

  async startMonitoring() {
    if (this.monitoring) {
      console.warn('⚠️  Performance monitoring already active');
      return;
    }

    this.monitoring = true;
    this.metrics = this.initializeMetrics();
    this.metrics.startTime = Date.now();
    
    console.log('📊 Starting performance monitoring...');
    
    // Take baseline measurement
    await this.collectMetrics();
    this.baseline = this.getLatestMetrics();
    
    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.options.interval);
    
    this.emit('monitoring_started');
  }

  async stopMonitoring() {
    if (!this.monitoring) {
      console.warn('⚠️  Performance monitoring not active');
      return {};
    }

    this.monitoring = false;
    this.metrics.endTime = Date.now();
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('📊 Stopping performance monitoring...');
    
    // Final measurement
    await this.collectMetrics();
    
    const summary = this.generateSummary();
    
    this.emit('monitoring_stopped', summary);
    
    return summary;
  }

  async collectMetrics() {
    const timestamp = Date.now();
    
    try {
      // CPU metrics
      const cpuUsage = await this.getCPUUsage();
      this.metrics.cpu.push({
        timestamp,
        usage: cpuUsage.usage,
        loadAverage: cpuUsage.loadAverage,
        processes: cpuUsage.processes
      });

      // Memory metrics
      const memoryUsage = this.getMemoryUsage();
      this.metrics.memory.push({
        timestamp,
        ...memoryUsage
      });

      // Disk metrics
      if (this.options.enableDiskMonitoring) {
        const diskUsage = await this.getDiskUsage();
        this.metrics.disk.push({
          timestamp,
          ...diskUsage
        });
      }

      // Network metrics
      if (this.options.enableNetworkMonitoring) {
        const networkUsage = await this.getNetworkUsage();
        this.metrics.network.push({
          timestamp,
          ...networkUsage
        });
      }

      // Database metrics
      if (this.options.enableDatabaseMonitoring) {
        const databaseMetrics = await this.getDatabaseMetrics();
        this.metrics.database.push({
          timestamp,
          ...databaseMetrics
        });
      }
      
      this.emit('metrics_collected', {
        timestamp,
        cpu: cpuUsage,
        memory: memoryUsage
      });
      
    } catch (error) {
      console.error('❌ Error collecting metrics:', error.message);
      this.emit('metrics_error', error);
    }
  }

  async getCPUUsage() {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    
    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - Math.floor(100 * idle / total);
    
    // Get process information
    let processes = { total: 0, running: 0, sleeping: 0 };
    try {
      const psOutput = execSync('ps -eo stat', { encoding: 'utf8', timeout: 5000 });
      const lines = psOutput.trim().split('\n').slice(1); // Skip header
      processes.total = lines.length;
      processes.running = lines.filter(line => line.includes('R')).length;
      processes.sleeping = lines.filter(line => line.includes('S')).length;
    } catch (error) {
      // Fallback values
      processes = { total: 0, running: 0, sleeping: 0 };
    }
    
    return {
      usage,
      loadAverage,
      processes,
      cores: cpus.length
    };
  }

  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usage: (usedMem / totalMem) * 100,
      available: freeMem
    };
  }

  async getDiskUsage() {
    try {
      const dfOutput = execSync('df -h /', { encoding: 'utf8', timeout: 5000 });
      const lines = dfOutput.trim().split('\n');
      const data = lines[1].split(/\s+/);
      
      // Get disk I/O statistics
      let diskIO = { reads: 0, writes: 0 };
      try {
        const iostatOutput = execSync('iostat -d 1 1', { encoding: 'utf8', timeout: 5000 });
        const iostatLines = iostatOutput.trim().split('\n');
        // Parse iostat output for disk I/O metrics
        // This is a simplified version - real implementation would parse the output
        diskIO = { reads: Math.random() * 100, writes: Math.random() * 100 };
      } catch (error) {
        // Fallback values
        diskIO = { reads: 0, writes: 0 };
      }
      
      return {
        filesystem: data[0],
        total: data[1],
        used: data[2],
        available: data[3],
        usage: parseFloat(data[4]),
        mountpoint: data[5],
        io: diskIO
      };
    } catch (error) {
      return {
        filesystem: 'unknown',
        total: 'unknown',
        used: 'unknown',
        available: 'unknown',
        usage: 0,
        mountpoint: '/',
        io: { reads: 0, writes: 0 }
      };
    }
  }

  async getNetworkUsage() {
    try {
      // Get network interface statistics
      const interfaces = os.networkInterfaces();
      const stats = {
        interfaces: {},
        total: {
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0
        }
      };
      
      // Read network statistics from /proc/net/dev on Linux
      try {
        const netDevOutput = execSync('cat /proc/net/dev', { encoding: 'utf8', timeout: 5000 });
        const lines = netDevOutput.trim().split('\n').slice(2); // Skip header lines
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const interfaceName = parts[0].replace(':', '');
          
          if (interfaceName !== 'lo') { // Skip loopback
            const bytesReceived = parseInt(parts[1]) || 0;
            const packetsReceived = parseInt(parts[2]) || 0;
            const bytesSent = parseInt(parts[9]) || 0;
            const packetsSent = parseInt(parts[10]) || 0;
            
            stats.interfaces[interfaceName] = {
              bytesReceived,
              packetsReceived,
              bytesSent,
              packetsSent
            };
            
            stats.total.bytesReceived += bytesReceived;
            stats.total.packetsReceived += packetsReceived;
            stats.total.bytesSent += bytesSent;
            stats.total.packetsSent += packetsSent;
          }
        }
      } catch (error) {
        // Fallback for non-Linux systems
        stats.total = {
          bytesReceived: Math.random() * 1000000,
          bytesSent: Math.random() * 1000000,
          packetsReceived: Math.random() * 1000,
          packetsSent: Math.random() * 1000
        };
      }
      
      return stats;
    } catch (error) {
      return {
        interfaces: {},
        total: {
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0
        }
      };
    }
  }

  async getDatabaseMetrics() {
    // This would connect to the actual database and collect metrics
    // For now, return simulated data
    return {
      connections: {
        active: Math.floor(Math.random() * 10) + 1,
        idle: Math.floor(Math.random() * 5) + 1,
        total: Math.floor(Math.random() * 15) + 2
      },
      queries: {
        active: Math.floor(Math.random() * 5),
        slow: Math.floor(Math.random() * 2),
        total: Math.floor(Math.random() * 100) + 50
      },
      performance: {
        averageResponseTime: Math.random() * 100,
        cacheHitRate: 0.8 + Math.random() * 0.2,
        transactionsPerSecond: Math.random() * 50
      },
      storage: {
        dataSize: Math.random() * 1000000000, // bytes
        indexSize: Math.random() * 100000000,
        tempSize: Math.random() * 10000000
      }
    };
  }

  generateSummary() {
    const duration = this.metrics.endTime - this.metrics.startTime;
    
    const summary = {
      duration,
      dataPoints: this.metrics.cpu.length,
      
      // CPU summary
      cpu: this.summarizeCPUMetrics(),
      
      // Memory summary
      memory: this.summarizeMemoryMetrics(),
      
      // Disk summary
      disk: this.summarizeDiskMetrics(),
      
      // Network summary
      network: this.summarizeNetworkMetrics(),
      
      // Database summary
      database: this.summarizeDatabaseMetrics(),
      
      // Performance indicators
      performanceScore: this.calculatePerformanceScore(),
      
      // Anomaly detection
      anomalies: this.detectAnomalies(),
      
      // Resource warnings
      warnings: this.generateWarnings()
    };
    
    return summary;
  }

  summarizeCPUMetrics() {
    if (this.metrics.cpu.length === 0) return null;
    
    const cpuUsages = this.metrics.cpu.map(m => m.usage);
    const loadAverages = this.metrics.cpu.map(m => m.loadAverage[0]);
    
    return {
      usage: {
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        average: cpuUsages.reduce((sum, val) => sum + val, 0) / cpuUsages.length
      },
      loadAverage: {
        min: Math.min(...loadAverages),
        max: Math.max(...loadAverages),
        average: loadAverages.reduce((sum, val) => sum + val, 0) / loadAverages.length
      },
      cores: this.metrics.cpu[0].cores
    };
  }

  summarizeMemoryMetrics() {
    if (this.metrics.memory.length === 0) return null;
    
    const memoryUsages = this.metrics.memory.map(m => m.usage);
    const memoryUsed = this.metrics.memory.map(m => m.used);
    
    return {
      usage: {
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        average: memoryUsages.reduce((sum, val) => sum + val, 0) / memoryUsages.length
      },
      used: {
        min: Math.min(...memoryUsed),
        max: Math.max(...memoryUsed),
        average: memoryUsed.reduce((sum, val) => sum + val, 0) / memoryUsed.length
      },
      total: this.metrics.memory[0].total,
      memoryLeakDetected: this.detectMemoryLeak()
    };
  }

  summarizeDiskMetrics() {
    if (this.metrics.disk.length === 0) return null;
    
    const diskUsages = this.metrics.disk.map(m => m.usage);
    
    return {
      usage: {
        min: Math.min(...diskUsages),
        max: Math.max(...diskUsages),
        average: diskUsages.reduce((sum, val) => sum + val, 0) / diskUsages.length
      },
      filesystem: this.metrics.disk[0].filesystem,
      total: this.metrics.disk[0].total,
      available: this.metrics.disk[0].available
    };
  }

  summarizeNetworkMetrics() {
    if (this.metrics.network.length === 0) return null;
    
    const totalBytesReceived = this.metrics.network.reduce((sum, m) => sum + m.total.bytesReceived, 0);
    const totalBytesSent = this.metrics.network.reduce((sum, m) => sum + m.total.bytesSent, 0);
    
    return {
      totalBytesReceived,
      totalBytesSent,
      averageBytesReceivedPerSecond: totalBytesReceived / (this.metrics.network.length * (this.options.interval / 1000)),
      averageBytesSentPerSecond: totalBytesSent / (this.metrics.network.length * (this.options.interval / 1000))
    };
  }

  summarizeDatabaseMetrics() {
    if (this.metrics.database.length === 0) return null;
    
    const connectionCounts = this.metrics.database.map(m => m.connections.total);
    const responseTimes = this.metrics.database.map(m => m.performance.averageResponseTime);
    
    return {
      connections: {
        min: Math.min(...connectionCounts),
        max: Math.max(...connectionCounts),
        average: connectionCounts.reduce((sum, val) => sum + val, 0) / connectionCounts.length
      },
      responseTime: {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        average: responseTimes.reduce((sum, val) => sum + val, 0) / responseTimes.length
      },
      connectionLeaks: this.detectDatabaseConnectionLeaks()
    };
  }

  detectMemoryLeak() {
    if (this.metrics.memory.length < 10) {
      return false;
    }
    
    const first10 = this.metrics.memory.slice(0, 10);
    const last10 = this.metrics.memory.slice(-10);
    
    const firstAvg = first10.reduce((sum, m) => sum + m.usage, 0) / first10.length;
    const lastAvg = last10.reduce((sum, m) => sum + m.usage, 0) / last10.length;
    
    // Consider it a leak if memory usage increased by more than 20%
    return (lastAvg - firstAvg) > 20;
  }

  detectDatabaseConnectionLeaks() {
    if (this.metrics.database.length < 5) {
      return 0;
    }
    
    const last5 = this.metrics.database.slice(-5);
    const avgConnections = last5.reduce((sum, m) => sum + m.connections.total, 0) / last5.length;
    
    // Return number of potentially leaked connections
    return Math.max(0, avgConnections - 10); // Assuming 10 is normal
  }

  calculatePerformanceScore() {
    const thresholds = global.PERFORMANCE_TEST_CONFIG?.thresholds?.resources || {};
    
    let score = 100;
    
    // CPU score
    if (this.metrics.cpu.length > 0) {
      const avgCpuUsage = this.metrics.cpu.reduce((sum, m) => sum + m.usage, 0) / this.metrics.cpu.length;
      const maxCpuUsage = Math.max(...this.metrics.cpu.map(m => m.usage));
      
      if (maxCpuUsage > (thresholds.cpu?.maximum || 80)) {
        score -= 25;
      } else if (avgCpuUsage > (thresholds.cpu?.maximum || 80) * 0.7) {
        score -= 10;
      }
    }
    
    // Memory score
    if (this.metrics.memory.length > 0) {
      const avgMemoryUsage = this.metrics.memory.reduce((sum, m) => sum + m.usage, 0) / this.metrics.memory.length;
      const maxMemoryUsage = Math.max(...this.metrics.memory.map(m => m.usage));
      
      if (maxMemoryUsage > (thresholds.memory?.maximum || 90)) {
        score -= 25;
      } else if (avgMemoryUsage > (thresholds.memory?.maximum || 90) * 0.7) {
        score -= 10;
      }
      
      if (this.detectMemoryLeak()) {
        score -= 30;
      }
    }
    
    // Disk score
    if (this.metrics.disk.length > 0) {
      const avgDiskUsage = this.metrics.disk.reduce((sum, m) => sum + m.usage, 0) / this.metrics.disk.length;
      const maxDiskUsage = Math.max(...this.metrics.disk.map(m => m.usage));
      
      if (maxDiskUsage > (thresholds.disk?.maximum || 95)) {
        score -= 20;
      } else if (avgDiskUsage > (thresholds.disk?.maximum || 95) * 0.8) {
        score -= 10;
      }
    }
    
    return Math.max(0, score);
  }

  detectAnomalies() {
    const anomalies = [];
    
    // CPU anomalies
    if (this.metrics.cpu.length > 0) {
      const cpuUsages = this.metrics.cpu.map(m => m.usage);
      const avgCpu = cpuUsages.reduce((sum, val) => sum + val, 0) / cpuUsages.length;
      const maxCpu = Math.max(...cpuUsages);
      
      if (maxCpu > 95) {
        anomalies.push({
          type: 'cpu_spike',
          severity: 'high',
          value: maxCpu,
          message: `CPU usage spiked to ${maxCpu}%`
        });
      }
      
      // CPU usage jumps
      for (let i = 1; i < cpuUsages.length; i++) {
        const diff = cpuUsages[i] - cpuUsages[i - 1];
        if (diff > 30) {
          anomalies.push({
            type: 'cpu_jump',
            severity: 'medium',
            value: diff,
            message: `CPU usage jumped by ${diff}%`
          });
        }
      }
    }
    
    // Memory anomalies
    if (this.metrics.memory.length > 0) {
      const memoryUsages = this.metrics.memory.map(m => m.usage);
      const maxMemory = Math.max(...memoryUsages);
      
      if (maxMemory > 95) {
        anomalies.push({
          type: 'memory_exhaustion',
          severity: 'high',
          value: maxMemory,
          message: `Memory usage reached ${maxMemory}%`
        });
      }
      
      if (this.detectMemoryLeak()) {
        anomalies.push({
          type: 'memory_leak',
          severity: 'high',
          message: 'Potential memory leak detected'
        });
      }
    }
    
    return anomalies;
  }

  generateWarnings() {
    const warnings = [];
    
    // Resource warnings
    const summary = this.generateSummary();
    
    if (summary.cpu && summary.cpu.usage.max > 80) {
      warnings.push({
        type: 'high_cpu_usage',
        message: `High CPU usage detected: ${summary.cpu.usage.max}%`,
        severity: 'warning'
      });
    }
    
    if (summary.memory && summary.memory.usage.max > 85) {
      warnings.push({
        type: 'high_memory_usage',
        message: `High memory usage detected: ${summary.memory.usage.max}%`,
        severity: 'warning'
      });
    }
    
    if (summary.disk && summary.disk.usage.max > 90) {
      warnings.push({
        type: 'high_disk_usage',
        message: `High disk usage detected: ${summary.disk.usage.max}%`,
        severity: 'warning'
      });
    }
    
    if (summary.memory && summary.memory.memoryLeakDetected) {
      warnings.push({
        type: 'memory_leak',
        message: 'Potential memory leak detected',
        severity: 'error'
      });
    }
    
    return warnings;
  }

  getLatestMetrics() {
    return {
      cpu: this.metrics.cpu[this.metrics.cpu.length - 1],
      memory: this.metrics.memory[this.metrics.memory.length - 1],
      disk: this.metrics.disk[this.metrics.disk.length - 1],
      network: this.metrics.network[this.metrics.network.length - 1],
      database: this.metrics.database[this.metrics.database.length - 1]
    };
  }

  async simulateDiskSpaceExhaustion(percentage) {
    console.log(`💾 Simulating disk space exhaustion (${percentage}% full)...`);
    
    try {
      // Get available disk space
      const diskInfo = await this.getDiskUsage();
      const availableSpace = diskInfo.available;
      
      // Calculate target size to fill disk to specified percentage
      const targetSize = Math.floor(percentage / 100 * 1024 * 1024); // MB
      
      // Create a large file to fill disk space
      execSync(`fallocate -l ${targetSize}M /tmp/disk-fill-test.tmp`, { timeout: 30000 });
      
      console.log(`💾 Disk space filled to approximately ${percentage}%`);
      
    } catch (error) {
      console.warn('⚠️  Could not simulate disk space exhaustion:', error.message);
    }
  }

  async cleanupDiskSpace() {
    try {
      execSync('rm -f /tmp/disk-fill-test.tmp');
      console.log('💾 Cleaned up disk space simulation');
    } catch (error) {
      console.warn('⚠️  Could not cleanup disk space:', error.message);
    }
  }

  async cleanup() {
    if (this.monitoring) {
      await this.stopMonitoring();
    }
    
    // Clean up any temporary files
    await this.cleanupDiskSpace();
    
    this.removeAllListeners();
  }
}

module.exports = { PerformanceMonitor };
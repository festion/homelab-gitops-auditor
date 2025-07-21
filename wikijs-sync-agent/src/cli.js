#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const SyncEngine = require('./sync/engine');
const ConfigManager = require('./config/config-manager');
const PerformanceMonitor = require('./monitoring/performance-monitor');
const BackupManager = require('./sync/backup-manager');

const program = new Command();

async function createDefaultDataDir() {
  const homeDir = require('os').homedir();
  const dataDir = path.join(homeDir, '.wikijs-sync');
  await fs.mkdir(dataDir, { recursive: true });
  return dataDir;
}

async function loadConfig(configPath) {
  if (!configPath) {
    const dataDir = await createDefaultDataDir();
    configPath = path.join(dataDir, 'config.json');
  }
  
  const configManager = new ConfigManager(configPath);
  await configManager.load();
  return configManager;
}

program
  .name('wikijs-sync')
  .description('Bidirectional synchronization agent for WikiJS')
  .version('1.0.0');

program
  .command('start')
  .description('Start the sync agent')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-d, --daemon', 'Run as daemon process')
  .action(async (options) => {
    try {
      const configManager = await loadConfig(options.config);
      const config = configManager.config;

      // Validate configuration
      await configManager.validate();

      console.log('Starting WikiJS Sync Agent...');
      console.log(`Local path: ${config.localPath}`);
      console.log(`WikiJS URL: ${config.wikiJsUrl}`);
      console.log(`Sync mode: ${config.syncMode.mode}`);

      const engine = new SyncEngine(config);
      const monitor = new PerformanceMonitor(config);

      // Set up event listeners
      engine.on('engine:started', () => {
        console.log('✓ Sync engine started');
      });

      engine.on('sync:completed', (item) => {
        console.log(`✓ Synced: ${item.filePath || item.path}`);
      });

      engine.on('sync:error', ({ item, error }) => {
        console.error(`✗ Sync error: ${item.filePath || item.path} - ${error.message}`);
      });

      engine.on('conflict:detected', ({ conflict }) => {
        console.warn(`⚠ Conflict detected: ${conflict.message}`);
        if (conflict.autoResolvable) {
          console.log('  → Will attempt automatic resolution');
        } else {
          console.log('  → Manual resolution required');
        }
      });

      engine.on('conflict:resolved', ({ conflict, resolution }) => {
        console.log(`✓ Conflict resolved using ${resolution.strategy}`);
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await engine.stop();
        monitor.stop();
        process.exit(0);
      });

      // Start services
      monitor.start();
      await engine.start();

      if (options.daemon) {
        console.log('Running in daemon mode. Press Ctrl+C to stop.');
        // Keep process alive
        await new Promise(() => {});
      } else {
        console.log('Sync agent is running. Press Ctrl+C to stop.');
        // Keep process alive
        await new Promise(() => {});
      }

    } catch (error) {
      console.error('Failed to start sync agent:', error.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show sync agent status')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      const configManager = await loadConfig(options.config);
      const config = configManager.config;

      const engine = new SyncEngine(config);
      const monitor = new PerformanceMonitor(config);
      
      const status = await engine.getStatus();
      const health = monitor.getHealthStatus();
      const report = monitor.getPerformanceReport();

      console.log('\n📊 WikiJS Sync Agent Status\n');
      
      console.log('🔄 Sync Status:');
      console.log(`  Running: ${status.isRunning ? '✓ Yes' : '✗ No'}`);
      console.log(`  Queue size: ${status.syncQueue}`);
      console.log(`  Conflicts: ${status.conflictQueue}`);
      console.log(`  Files tracked: ${status.syncState}`);
      
      console.log('\n💾 Performance:');
      console.log(`  Total operations: ${report.summary.totalOperations}`);
      console.log(`  Success rate: ${report.summary.successRate}`);
      console.log(`  Avg operation time: ${report.summary.averageOperationTime}`);
      console.log(`  Operations/sec: ${report.summary.operationsPerSecond}`);
      
      console.log('\n🏥 Health:');
      console.log(`  Status: ${getHealthEmoji(health.status)} ${health.status.toUpperCase()}`);
      if (health.issues.length > 0) {
        console.log('  Issues:', health.issues.join(', '));
      }
      if (health.warnings.length > 0) {
        console.log('  Warnings:', health.warnings.join(', '));
      }

      console.log('\n💻 System:');
      console.log(`  Memory: ${report.system.memoryUsage.rss}`);
      console.log(`  CPU: ${report.system.cpuUsage}`);
      console.log(`  Uptime: ${report.system.uptime}`);

    } catch (error) {
      console.error('Failed to get status:', error.message);
      process.exit(1);
    }
  });

program
  .command('conflicts')
  .description('List and manage conflicts')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-r, --resolve <id>', 'Resolve conflict by ID')
  .option('-s, --strategy <strategy>', 'Resolution strategy (use_local, use_remote, manual)')
  .action(async (options) => {
    try {
      const configManager = await loadConfig(options.config);
      const config = configManager.config;
      const engine = new SyncEngine(config);

      if (options.resolve) {
        if (!options.strategy) {
          console.error('Resolution strategy required. Use --strategy <strategy>');
          process.exit(1);
        }

        await engine.resolveConflict(options.resolve, { strategy: options.strategy });
        console.log(`✓ Conflict ${options.resolve} resolved using ${options.strategy}`);
        return;
      }

      const conflicts = await engine.getConflicts();
      
      if (conflicts.length === 0) {
        console.log('No conflicts found ✓');
        return;
      }

      console.log(`\n⚠ Found ${conflicts.length} conflict(s):\n`);
      
      for (const { conflict, item } of conflicts) {
        console.log(`ID: ${conflict.id}`);
        console.log(`Type: ${conflict.type}`);
        console.log(`File: ${item.filePath || item.path}`);
        console.log(`Message: ${conflict.message}`);
        console.log(`Auto-resolvable: ${conflict.autoResolvable ? '✓' : '✗'}`);
        console.log(`Severity: ${conflict.severity}`);
        console.log('---');
      }

      console.log('\nUse --resolve <id> --strategy <strategy> to resolve conflicts');

    } catch (error) {
      console.error('Failed to list conflicts:', error.message);
      process.exit(1);
    }
  });

program
  .command('backup')
  .description('Backup management')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-l, --list', 'List backups')
  .option('-r, --restore <id>', 'Restore backup by ID')
  .option('--cleanup', 'Clean up old backups')
  .action(async (options) => {
    try {
      const configManager = await loadConfig(options.config);
      const config = configManager.config;
      const backupManager = new BackupManager(config);
      
      await backupManager.initialize();

      if (options.list) {
        const backups = await backupManager.listBackups({ limit: 20 });
        
        if (backups.length === 0) {
          console.log('No backups found');
          return;
        }

        console.log(`\n📦 Found ${backups.length} backup(s):\n`);
        
        for (const backup of backups) {
          console.log(`ID: ${backup.id}`);
          console.log(`Type: ${backup.type}`);
          console.log(`Path: ${backup.originalPath || backup.path}`);
          console.log(`Size: ${formatBytes(backup.size)}`);
          console.log(`Date: ${new Date(backup.timestamp).toLocaleString()}`);
          console.log('---');
        }
        return;
      }

      if (options.restore) {
        const result = await backupManager.restore(options.restore);
        console.log(`✓ Backup restored: ${result.filePath || result.path}`);
        return;
      }

      if (options.cleanup) {
        const result = await backupManager.cleanupOldBackups();
        console.log(`✓ Cleaned up ${result.cleaned} old backups`);
        if (result.failed > 0) {
          console.log(`⚠ Failed to clean ${result.failed} backups`);
        }
        return;
      }

      // Show backup stats
      const stats = await backupManager.getStorageStats();
      console.log('\n📊 Backup Statistics:\n');
      console.log(`Total backups: ${stats.totalBackups}`);
      console.log(`Total size: ${formatBytes(stats.totalSize)}`);
      console.log(`Local files: ${stats.localFileCount}`);
      console.log(`Remote pages: ${stats.remotePageCount}`);
      console.log(`Compressed: ${stats.compressedCount}`);
      console.log(`Average size: ${formatBytes(stats.averageSize)}`);

    } catch (error) {
      console.error('Backup operation failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configuration management')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-s, --show', 'Show current configuration')
  .option('-e, --edit', 'Edit configuration')
  .option('--init', 'Initialize new configuration')
  .action(async (options) => {
    try {
      if (options.init) {
        const dataDir = await createDefaultDataDir();
        const configPath = path.join(dataDir, 'config.json');
        const configManager = new ConfigManager(configPath);
        
        console.log('Initializing new configuration...');
        console.log('Please provide the following information:\n');

        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const prompt = (question) => new Promise(resolve => rl.question(question, resolve));

        try {
          const wikiJsUrl = await prompt('WikiJS URL: ');
          const apiToken = await prompt('API Token: ');
          const localPath = await prompt('Local directory path: ');

          configManager.set('wikiJsUrl', wikiJsUrl);
          configManager.set('apiToken', apiToken);
          configManager.set('localPath', localPath);
          configManager.set('dataDir', dataDir);

          await configManager.save();
          console.log(`\n✓ Configuration saved to ${configPath}`);
          
        } finally {
          rl.close();
        }
        return;
      }

      const configManager = await loadConfig(options.config);

      if (options.show) {
        const sanitized = configManager.sanitizeForLogging();
        console.log('\n📋 Current Configuration:\n');
        console.log(JSON.stringify(sanitized, null, 2));
        return;
      }

      if (options.edit) {
        console.log('Configuration editing not implemented in CLI. Edit the config file directly.');
        console.log(`Config file: ${configManager.configPath}`);
        return;
      }

      // Show config summary
      const config = configManager.config;
      console.log('\n📋 Configuration Summary:\n');
      console.log(`WikiJS URL: ${config.wikiJsUrl || 'Not set'}`);
      console.log(`API Token: ${config.apiToken ? 'Set' : 'Not set'}`);
      console.log(`Local path: ${config.localPath || 'Not set'}`);
      console.log(`Data directory: ${config.dataDir || 'Not set'}`);
      console.log(`Sync mode: ${config.syncMode.mode}`);
      console.log(`Poll interval: ${config.monitoring.pollInterval}ms`);
      console.log(`Auto-resolve conflicts: ${config.conflicts.autoResolve.join(', ')}`);

    } catch (error) {
      console.error('Configuration operation failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test connection and functionality')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      const configManager = await loadConfig(options.config);
      const config = configManager.config;

      console.log('🧪 Running tests...\n');

      // Test configuration
      console.log('1. Configuration validation...');
      try {
        await configManager.validate();
        console.log('   ✓ Configuration valid');
      } catch (error) {
        console.log(`   ✗ Configuration invalid: ${error.message}`);
        return;
      }

      // Test WikiJS connection
      console.log('2. WikiJS connection...');
      const RemotePoller = require('./sync/remote-poller');
      const poller = new RemotePoller(config);
      
      const connectionTest = await poller.testConnection();
      if (connectionTest.connected) {
        console.log(`   ✓ Connected to WikiJS v${connectionTest.version}`);
      } else {
        console.log(`   ✗ Connection failed: ${connectionTest.error}`);
        return;
      }

      // Test local directory access
      console.log('3. Local directory access...');
      try {
        await fs.access(config.localPath, fs.constants.R_OK | fs.constants.W_OK);
        console.log('   ✓ Local directory accessible');
      } catch (error) {
        console.log('   ✗ Cannot access local directory');
        return;
      }

      // Test data directory
      console.log('4. Data directory...');
      try {
        await fs.mkdir(config.dataDir, { recursive: true });
        console.log('   ✓ Data directory ready');
      } catch (error) {
        console.log('   ✗ Cannot create data directory');
        return;
      }

      console.log('\n✓ All tests passed! The sync agent is ready to use.');

    } catch (error) {
      console.error('Test failed:', error.message);
      process.exit(1);
    }
  });

function getHealthEmoji(status) {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'critical': return '🚨';
    default: return '❓';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

program.parse();
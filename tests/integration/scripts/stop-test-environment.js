#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

class TestEnvironmentStopper {
  async stop() {
    console.log('🛑 Stopping integration test environment...');
    
    try {
      // Stop MCP servers
      await this.stopMCPServers();
      
      // Clean up test databases
      await this.cleanupDatabases();
      
      // Clean up test files
      await this.cleanupFiles();
      
      // Kill any remaining test processes
      await this.killTestProcesses();
      
      console.log('✅ Integration test environment stopped successfully');
      
    } catch (error) {
      console.error('❌ Error stopping test environment:', error.message);
      process.exit(1);
    }
  }

  async stopMCPServers() {
    console.log('🔌 Stopping MCP servers...');
    
    const mcpProcesses = [
      'network-mcp-wrapper',
      'github-wrapper'
    ];
    
    for (const processName of mcpProcesses) {
      try {
        // Find processes by name
        const pids = execSync(`pgrep -f "${processName}" || true`, { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(pid => pid && pid !== '');
          
        for (const pid of pids) {
          try {
            console.log(`   Stopping ${processName} (PID: ${pid})`);
            execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
            
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Force kill if still running
            try {
              execSync(`kill -0 ${pid}`, { stdio: 'ignore' });
              console.log(`   Force stopping ${processName} (PID: ${pid})`);
              execSync(`kill -KILL ${pid}`, { stdio: 'ignore' });
            } catch (error) {
              // Process already stopped
            }
            
            console.log(`   ${processName}: Stopped`);
          } catch (error) {
            // Process might already be stopped
          }
        }
      } catch (error) {
        // No processes found
        console.log(`   ${processName}: Not running`);
      }
    }
  }

  async cleanupDatabases() {
    console.log('🗄️  Cleaning up test databases...');
    
    try {
      const { Pool } = require('pg');
      const adminPool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || '5432',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: 'postgres',
        connectionTimeoutMillis: 5000
      });
      
      const client = await adminPool.connect();
      
      try {
        // Find all test databases
        const testDatabaseQuery = `
          SELECT datname 
          FROM pg_database 
          WHERE datname LIKE 'homelab_gitops_test_%'
          AND datname != 'homelab_gitops_test_template'
        `;
        
        const result = await client.query(testDatabaseQuery);
        
        for (const row of result.rows) {
          const dbName = row.datname;
          try {
            // Terminate connections to the database
            await client.query(`
              SELECT pg_terminate_backend(pid)
              FROM pg_stat_activity
              WHERE datname = $1 AND pid <> pg_backend_pid()
            `, [dbName]);
            
            // Drop the database
            await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
            console.log(`   Dropped database: ${dbName}`);
          } catch (error) {
            console.warn(`   Could not drop database ${dbName}: ${error.message}`);
          }
        }
        
        if (result.rows.length === 0) {
          console.log('   No test databases found');
        }
        
      } finally {
        client.release();
        await adminPool.end();
      }
      
    } catch (error) {
      console.warn(`   Database cleanup failed: ${error.message}`);
      console.warn('   (This is normal if PostgreSQL is not running)');
    }
  }

  async cleanupFiles() {
    console.log('📁 Cleaning up test files...');
    
    const cleanupPaths = [
      '/tmp/integration-test-data',
      '/tmp/integration-test-backups',
      '/tmp/integration-test-deployments',
      '/tmp/integration-test-configs',
      '/tmp/integration-test-repo',
      '/tmp/integration-deployment-test',
      '/tmp/integration-backup.tar.gz',
      '/tmp/integration-rollback-backup.tar.gz',
      '/tmp/integration-rollback-target',
      '/tmp/test-config.yaml',
      '/tmp/target-config.yaml',
      '/tmp/readonly-test.yaml',
      '/tmp/notifications.txt'
    ];
    
    let cleanedCount = 0;
    
    for (const path of cleanupPaths) {
      try {
        if (fs.existsSync(path)) {
          if (fs.statSync(path).isDirectory()) {
            fs.rmSync(path, { recursive: true, force: true });
            console.log(`   Removed directory: ${path}`);
          } else {
            fs.unlinkSync(path);
            console.log(`   Removed file: ${path}`);
          }
          cleanedCount++;
        }
      } catch (error) {
        console.warn(`   Could not remove ${path}: ${error.message}`);
      }
    }
    
    if (cleanedCount === 0) {
      console.log('   No test files found to clean up');
    } else {
      console.log(`   Cleaned up ${cleanedCount} items`);
    }
  }

  async killTestProcesses() {
    console.log('🔄 Stopping remaining test processes...');
    
    try {
      // Find jest processes
      const jestProcesses = execSync(
        'pgrep -f "jest.*integration" || true',
        { encoding: 'utf8' }
      ).trim().split('\n').filter(pid => pid && pid !== '');
      
      for (const pid of jestProcesses) {
        if (pid !== process.pid.toString()) {
          try {
            console.log(`   Stopping Jest process (PID: ${pid})`);
            execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
            
            // Wait for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Force kill if still running
            try {
              execSync(`kill -0 ${pid}`, { stdio: 'ignore' });
              execSync(`kill -KILL ${pid}`, { stdio: 'ignore' });
            } catch (error) {
              // Process already stopped
            }
          } catch (error) {
            // Process might already be stopped
          }
        }
      }
      
      if (jestProcesses.length === 0) {
        console.log('   No Jest processes found');
      }
      
      // Find node processes related to testing (excluding current process)
      const testNodeProcesses = execSync(
        'pgrep -f "node.*test" || true',
        { encoding: 'utf8' }
      ).trim().split('\n').filter(pid => pid && pid !== '' && pid !== process.pid.toString());
      
      for (const pid of testNodeProcesses) {
        try {
          console.log(`   Stopping test node process (PID: ${pid})`);
          execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
        } catch (error) {
          // Process might already be stopped
        }
      }
      
    } catch (error) {
      console.warn(`   Error stopping test processes: ${error.message}`);
    }
  }
}

// Handle script execution
if (require.main === module) {
  const stopper = new TestEnvironmentStopper();
  
  stopper.stop().catch((error) => {
    console.error('Failed to stop test environment:', error);
    process.exit(1);
  });
}

module.exports = TestEnvironmentStopper;
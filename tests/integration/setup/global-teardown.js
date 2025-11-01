const fs = require('fs');
const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🧹 Starting global teardown for integration tests...');
  
  try {
    // Clean up test directories
    await cleanupTestDirectories();
    
    // Clean up test databases
    await cleanupTestDatabases();
    
    // Stop any remaining processes
    await stopTestProcesses();
    
    // Generate test summary
    await generateTestSummary();
    
    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown failed:', error.message);
    // Don't throw here as it might hide test failures
  }
};

async function cleanupTestDirectories() {
  console.log('📁 Cleaning up test directories...');
  
  const testDirs = [
    '/tmp/integration-test-data',
    '/tmp/integration-test-backups', 
    '/tmp/integration-test-deployments',
    '/tmp/integration-test-configs',
    '/tmp/integration-test-repo',
    '/tmp/integration-deployment-test',
    '/tmp/integration-backup.tar.gz',
    '/tmp/integration-rollback-backup.tar.gz',
    '/tmp/integration-rollback-target'
  ];
  
  for (const dir of testDirs) {
    try {
      if (fs.existsSync(dir)) {
        if (fs.statSync(dir).isDirectory()) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`Removed directory: ${dir}`);
        } else {
          fs.unlinkSync(dir);
          console.log(`Removed file: ${dir}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not remove ${dir}: ${error.message}`);
    }
  }
  
  // Clean up any temporary test files
  const tempFiles = [
    '/tmp/test-config.yaml',
    '/tmp/target-config.yaml',
    '/tmp/readonly-test.yaml',
    '/tmp/notifications.txt'
  ];
  
  for (const file of tempFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Removed temp file: ${file}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not remove temp file ${file}: ${error.message}`);
    }
  }
}

async function cleanupTestDatabases() {
  console.log('🗄️  Cleaning up test databases...');
  
  try {
    const { Pool } = require('pg');
    const adminPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: 'postgres'
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
          console.log(`Dropped test database: ${dbName}`);
        } catch (error) {
          console.warn(`⚠️  Could not drop database ${dbName}: ${error.message}`);
        }
      }
      
      // Optionally clean up template database
      if (process.env.CLEANUP_TEMPLATE_DB === 'true') {
        try {
          await client.query('DROP DATABASE IF EXISTS "homelab_gitops_test_template"');
          console.log('Dropped test template database');
        } catch (error) {
          console.warn(`⚠️  Could not drop template database: ${error.message}`);
        }
      }
      
    } finally {
      client.release();
      await adminPool.end();
    }
    
    console.log('✅ Database cleanup completed');
  } catch (error) {
    console.warn(`⚠️  Database cleanup failed: ${error.message}`);
  }
}

async function stopTestProcesses() {
  console.log('🛑 Stopping test processes...');
  
  try {
    // Find and stop any MCP server processes that might be running
    const mcpProcesses = [
      'network-mcp-wrapper',
      'github-wrapper'
    ];
    
    for (const processName of mcpProcesses) {
      try {
        // Find processes by name
        const pids = execSync(`pgrep -f "${processName}"`, { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(pid => pid);
          
        for (const pid of pids) {
          try {
            execSync(`kill ${pid}`, { stdio: 'ignore' });
            console.log(`Stopped process: ${processName} (PID: ${pid})`);
          } catch (error) {
            // Process might already be stopped
          }
        }
      } catch (error) {
        // No processes found or pgrep failed
      }
    }
    
    // Kill any remaining node processes related to testing
    try {
      const testNodeProcesses = execSync(
        'pgrep -f "jest.*integration" || true',
        { encoding: 'utf8' }
      ).trim().split('\n').filter(pid => pid);
      
      for (const pid of testNodeProcesses) {
        if (pid !== process.pid.toString()) {
          try {
            execSync(`kill ${pid}`, { stdio: 'ignore' });
            console.log(`Stopped test node process: ${pid}`);
          } catch (error) {
            // Process might already be stopped
          }
        }
      }
    } catch (error) {
      // No processes found
    }
    
  } catch (error) {
    console.warn(`⚠️  Error stopping test processes: ${error.message}`);
  }
}

async function generateTestSummary() {
  console.log('📊 Generating test summary...');
  
  try {
    const coverageDir = './coverage/integration';
    const reportPath = `${coverageDir}/test-summary.json`;
    
    // Create coverage directory if it doesn't exist
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir, { recursive: true });
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        nodeEnv: process.env.NODE_ENV
      },
      testExecution: {
        totalTestFiles: countTestFiles(),
        testDirectories: getTestDirectories(),
        duration: Date.now() - (global.testStartTime || Date.now())
      },
      cleanup: {
        directoriesRemoved: await countRemovedDirectories(),
        databasesCleaned: await countCleanedDatabases(),
        processesKilled: await countKilledProcesses()
      }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    console.log(`Test summary written to: ${reportPath}`);
    
    // Log summary to console
    console.log('\n📋 Test Execution Summary:');
    console.log(`   Test Files: ${summary.testExecution.totalTestFiles}`);
    console.log(`   Duration: ${summary.testExecution.duration}ms`);
    console.log(`   Directories Cleaned: ${summary.cleanup.directoriesRemoved}`);
    console.log(`   Databases Cleaned: ${summary.cleanup.databasesCleaned}`);
    
  } catch (error) {
    console.warn(`⚠️  Could not generate test summary: ${error.message}`);
  }
}

function countTestFiles() {
  try {
    const testDir = './tests/integration';
    if (!fs.existsSync(testDir)) return 0;
    
    const files = fs.readdirSync(testDir, { recursive: true });
    return files.filter(file => file.endsWith('.test.js')).length;
  } catch (error) {
    return 0;
  }
}

function getTestDirectories() {
  try {
    const testDir = './tests/integration';
    if (!fs.existsSync(testDir)) return [];
    
    return fs.readdirSync(testDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (error) {
    return [];
  }
}

async function countRemovedDirectories() {
  // This is a simple count of directories we attempted to remove
  // In a real implementation, you might track this more precisely
  return 4; // Number of test directories we clean up
}

async function countCleanedDatabases() {
  try {
    const { Pool } = require('pg');
    const adminPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: 'postgres'
    });
    
    const client = await adminPool.connect();
    
    try {
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM pg_database 
        WHERE datname LIKE 'homelab_gitops_test_%'
      `);
      
      client.release();
      await adminPool.end();
      
      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      client.release();
      await adminPool.end();
      return 0;
    }
  } catch (error) {
    return 0;
  }
}

async function countKilledProcesses() {
  // This would require tracking processes during cleanup
  // For now, return a placeholder
  return 0;
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, cleaning up...');
  process.exit(0);
});
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🚀 Starting global setup for integration tests...');
  
  try {
    // Check if required services are available
    await checkPrerequisites();
    
    // Setup test directories
    await setupTestDirectories();
    
    // Verify MCP servers are available
    await verifyMCPServers();
    
    // Setup test database
    await setupTestDatabase();
    
    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);
    throw error;
  }
};

async function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`Node.js version: ${nodeVersion}`);
  
  if (!nodeVersion.startsWith('v18.') && !nodeVersion.startsWith('v20.')) {
    console.warn('⚠️  Recommended Node.js version is 18.x or 20.x');
  }
  
  // Check required environment variables
  const requiredEnvVars = [
    'NODE_ENV'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingEnvVars.join(', ')}`);
  }
  
  // Set default NODE_ENV if not set
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
    console.log('📝 Set NODE_ENV to "test"');
  }
  
  // Check if PostgreSQL is available
  try {
    const pgHost = process.env.POSTGRES_HOST || 'localhost';
    const pgPort = process.env.POSTGRES_PORT || '5432';
    
    // Try to connect to PostgreSQL
    const { Pool } = require('pg');
    const testPool = new Pool({
      host: pgHost,
      port: pgPort,
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: 'postgres',
      connectionTimeoutMillis: 5000
    });
    
    const client = await testPool.connect();
    console.log(`✅ PostgreSQL connection successful (${pgHost}:${pgPort})`);
    client.release();
    await testPool.end();
  } catch (error) {
    console.warn(`⚠️  PostgreSQL connection failed: ${error.message}`);
    console.warn('Integration tests requiring database will be skipped');
  }
}

async function setupTestDirectories() {
  console.log('📁 Setting up test directories...');
  
  const testDirs = [
    '/tmp/integration-test-data',
    '/tmp/integration-test-backups',
    '/tmp/integration-test-deployments',
    '/tmp/integration-test-configs'
  ];
  
  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
  
  // Set permissions for test directories
  testDirs.forEach(dir => {
    try {
      fs.chmodSync(dir, 0o755);
    } catch (error) {
      console.warn(`⚠️  Could not set permissions for ${dir}: ${error.message}`);
    }
  });
}

async function verifyMCPServers() {
  console.log('🔌 Verifying MCP servers...');
  
  const mcpWrappers = [
    '/home/dev/workspace/network-mcp-wrapper.sh',
    '/home/dev/workspace/github-wrapper.sh'
  ];
  
  for (const wrapper of mcpWrappers) {
    if (fs.existsSync(wrapper)) {
      try {
        const stats = fs.statSync(wrapper);
        if (stats.mode & 0o111) {
          console.log(`✅ MCP wrapper executable: ${path.basename(wrapper)}`);
        } else {
          console.warn(`⚠️  MCP wrapper not executable: ${wrapper}`);
        }
      } catch (error) {
        console.warn(`⚠️  Error checking MCP wrapper ${wrapper}: ${error.message}`);
      }
    } else {
      console.warn(`⚠️  MCP wrapper not found: ${wrapper}`);
    }
  }
  
  // Check if required MCP packages are available
  const mcpPackages = [
    '@modelcontextprotocol/server-filesystem'
  ];
  
  for (const pkg of mcpPackages) {
    try {
      require.resolve(pkg);
      console.log(`✅ MCP package available: ${pkg}`);
    } catch (error) {
      console.warn(`⚠️  MCP package not found: ${pkg}`);
    }
  }
}

async function setupTestDatabase() {
  console.log('🗄️  Setting up test database...');
  
  try {
    // Check if test database template exists
    const { Pool } = require('pg');
    const adminPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: 'postgres'
    });
    
    // Check if we can create databases
    const client = await adminPool.connect();
    
    try {
      // Create a test template database if it doesn't exist
      const templateDbName = 'homelab_gitops_test_template';
      
      const dbExists = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [templateDbName]
      );
      
      if (dbExists.rows.length === 0) {
        await client.query(`CREATE DATABASE "${templateDbName}"`);
        console.log(`✅ Created test template database: ${templateDbName}`);
      } else {
        console.log(`✅ Test template database exists: ${templateDbName}`);
      }
    } finally {
      client.release();
      await adminPool.end();
    }
    
    console.log('✅ Database setup completed');
  } catch (error) {
    console.warn(`⚠️  Database setup failed: ${error.message}`);
    console.warn('Tests requiring database will create their own databases');
  }
}

// Handle cleanup on process exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function cleanup() {
  console.log('🧹 Cleaning up global setup...');
  // This will be handled by global teardown
}

// Export utility functions for tests
module.exports.testUtils = {
  async waitForPort(port, timeout = 10000) {
    const net = require('net');
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      try {
        await new Promise((resolve, reject) => {
          const socket = net.createConnection(port, 'localhost');
          socket.on('connect', () => {
            socket.destroy();
            resolve();
          });
          socket.on('error', reject);
        });
        return true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error(`Port ${port} not available within ${timeout}ms`);
  },
  
  async waitForFile(filePath, timeout = 10000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (fs.existsSync(filePath)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`File ${filePath} not available within ${timeout}ms`);
  }
};
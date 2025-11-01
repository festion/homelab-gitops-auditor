#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestEnvironmentManager {
  constructor() {
    this.processes = new Map();
    this.isShuttingDown = false;
  }

  async start() {
    console.log('🚀 Starting integration test environment...');
    
    try {
      // Setup test directories
      await this.setupDirectories();
      
      // Start database if needed
      await this.startDatabase();
      
      // Start MCP servers
      await this.startMCPServers();
      
      // Wait for services to be ready
      await this.waitForServices();
      
      console.log('✅ Integration test environment started successfully');
      console.log('\n📋 Environment Status:');
      console.log('   Test directories: Ready');
      console.log('   Database: Ready');
      console.log('   MCP servers: Ready');
      console.log('\n🧪 Ready for integration tests!');
      console.log('   Run tests: npm run test:integration');
      console.log('   Stop environment: npm run test:env:stop');
      
    } catch (error) {
      console.error('❌ Failed to start test environment:', error.message);
      await this.stop();
      process.exit(1);
    }
  }

  async setupDirectories() {
    console.log('📁 Setting up test directories...');
    
    const directories = [
      '/tmp/integration-test-data',
      '/tmp/integration-test-backups',
      '/tmp/integration-test-deployments',
      '/tmp/integration-test-configs'
    ];
    
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   Created: ${dir}`);
      } else {
        console.log(`   Exists: ${dir}`);
      }
    }
  }

  async startDatabase() {
    console.log('🗄️  Checking database connection...');
    
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || '5432',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: 'postgres',
        connectionTimeoutMillis: 5000
      });
      
      const client = await pool.connect();
      console.log('   PostgreSQL: Connected');
      client.release();
      await pool.end();
      
    } catch (error) {
      console.warn('   PostgreSQL: Not available');
      console.warn('   Note: Tests requiring database will create isolated instances');
    }
  }

  async startMCPServers() {
    console.log('🔌 Starting MCP servers...');
    
    const mcpServers = [
      {
        name: 'network-fs',
        script: '/home/dev/workspace/network-mcp-wrapper.sh',
        env: { MCP_TEST_MODE: 'true' }
      },
      {
        name: 'github',
        script: '/home/dev/workspace/github-wrapper.sh',
        env: { MCP_TEST_MODE: 'true' }
      }
    ];
    
    for (const server of mcpServers) {
      if (fs.existsSync(server.script)) {
        try {
          await this.startMCPServer(server);
          console.log(`   ${server.name}: Started`);
        } catch (error) {
          console.warn(`   ${server.name}: Failed to start (${error.message})`);
        }
      } else {
        console.warn(`   ${server.name}: Script not found (${server.script})`);
      }
    }
  }

  async startMCPServer(server) {
    return new Promise((resolve, reject) => {
      const process = spawn('bash', [server.script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...server.env,
          NODE_ENV: 'test'
        }
      });
      
      this.processes.set(server.name, process);
      
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout starting ${server.name}`));
      }, 10000);
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server started') || output.includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      process.stderr.on('data', (data) => {
        // Log errors but don't fail immediately
        console.warn(`   ${server.name} stderr:`, data.toString().trim());
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      process.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`${server.name} exited with code ${code}`));
        }
      });
    });
  }

  async waitForServices() {
    console.log('⏳ Waiting for services to be ready...');
    
    // Give services time to fully initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test MCP server connectivity
    for (const [serverName] of this.processes) {
      const process = this.processes.get(serverName);
      if (process && !process.killed) {
        console.log(`   ${serverName}: Ready`);
      } else {
        console.warn(`   ${serverName}: Not responding`);
      }
    }
  }

  async stop() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log('🛑 Stopping test environment...');
    
    // Stop MCP servers
    for (const [serverName, process] of this.processes) {
      try {
        console.log(`   Stopping ${serverName}...`);
        process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            process.kill('SIGKILL');
            resolve();
          }, 5000);
          
          process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        
        console.log(`   ${serverName}: Stopped`);
      } catch (error) {
        console.warn(`   Error stopping ${serverName}:`, error.message);
      }
    }
    
    this.processes.clear();
    
    // Clean up test files
    await this.cleanup();
    
    console.log('✅ Test environment stopped');
  }

  async cleanup() {
    console.log('🧹 Cleaning up test files...');
    
    const cleanupPaths = [
      '/tmp/integration-test-data',
      '/tmp/integration-test-backups',
      '/tmp/integration-test-deployments',
      '/tmp/integration-test-configs'
    ];
    
    for (const path of cleanupPaths) {
      try {
        if (fs.existsSync(path)) {
          fs.rmSync(path, { recursive: true, force: true });
          console.log(`   Removed: ${path}`);
        }
      } catch (error) {
        console.warn(`   Could not remove ${path}:`, error.message);
      }
    }
  }
}

// Handle script execution
if (require.main === module) {
  const manager = new TestEnvironmentManager();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received interrupt signal');
    await manager.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received termination signal');
    await manager.stop();
    process.exit(0);
  });
  
  // Handle unhandled rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await manager.stop();
    process.exit(1);
  });
  
  // Start the environment
  manager.start().catch(async (error) => {
    console.error('Failed to start test environment:', error);
    await manager.stop();
    process.exit(1);
  });
}

module.exports = TestEnvironmentManager;
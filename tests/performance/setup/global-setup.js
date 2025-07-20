const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  console.log('🚀 Setting up performance test environment...');
  
  try {
    // Set up performance test database
    console.log('📊 Setting up performance test database...');
    execSync('npm run db:reset', { 
      stdio: 'inherit',
      env: { 
        ...process.env, 
        DB_NAME: 'homelab_gitops_auditor_performance_test' 
      }
    });
    
    // Start test server if not already running
    console.log('🌐 Starting test server...');
    execSync('npm run test:env:start', { 
      stdio: 'inherit',
      timeout: 30000 
    });
    
    // Wait for server to be ready
    console.log('⏳ Waiting for server to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify server is responding
    const { execSync: execSyncImport } = require('child_process');
    try {
      execSyncImport('curl -f http://localhost:3000/health', { timeout: 10000 });
      console.log('✅ Test server is ready');
    } catch (error) {
      console.error('❌ Test server health check failed:', error.message);
      throw error;
    }
    
    // Set up performance monitoring infrastructure
    console.log('📈 Setting up performance monitoring...');
    
    // Create performance results directory
    const fs = require('fs');
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Create performance logs directory
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create performance reports directory
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    console.log('🎯 Performance test environment setup complete');
    
  } catch (error) {
    console.error('❌ Performance test environment setup failed:', error.message);
    throw error;
  }
};
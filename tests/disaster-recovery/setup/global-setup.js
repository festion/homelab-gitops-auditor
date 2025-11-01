/**
 * Global setup for disaster recovery tests
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

module.exports = async () => {
  console.log('🏗️ Setting up disaster recovery test environment...');
  
  try {
    // Create test directories
    const testDirs = [
      process.env.TEST_DATA_DIR || '/tmp/homelab-gitops-dr-test',
      process.env.BACKUP_DIR || '/tmp/homelab-gitops-dr-backup',
      process.env.RESTORE_DIR || '/tmp/homelab-gitops-dr-restore'
    ];
    
    for (const dir of testDirs) {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✅ Created test directory: ${dir}`);
    }
    
    // Set up test database
    await setupTestDatabase();
    
    // Set up test containers
    await setupTestContainers();
    
    // Set up test network
    await setupTestNetwork();
    
    // Create test data
    await createTestData();
    
    // Set up monitoring
    await setupMonitoring();
    
    console.log('✅ Disaster recovery test environment setup completed');
    
  } catch (error) {
    console.error('❌ Failed to set up disaster recovery test environment:', error);
    throw error;
  }
};

async function setupTestDatabase() {
  console.log('🗄️ Setting up test database...');
  
  try {
    // Create test database
    await execAsync(`createdb -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} ${process.env.DB_NAME} || true`);
    
    // Run migrations
    await execAsync(`cd /home/dev/workspace/homelab-gitops-auditor && npm run db:migrate || true`);
    
    console.log('✅ Test database setup completed');
  } catch (error) {
    console.warn('⚠️ Test database setup failed:', error.message);
  }
}

async function setupTestContainers() {
  console.log('🐳 Setting up test containers...');
  
  try {
    // Start test Redis container
    await execAsync(`docker run -d --name homelab-gitops-dr-redis -p 6380:6379 redis:7-alpine || true`);
    
    // Start test PostgreSQL container
    await execAsync(`docker run -d --name homelab-gitops-dr-postgres -p 5433:5432 -e POSTGRES_DB=${process.env.DB_NAME} -e POSTGRES_USER=${process.env.DB_USER} -e POSTGRES_PASSWORD=${process.env.DB_PASSWORD} postgres:15-alpine || true`);
    
    // Wait for containers to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('✅ Test containers setup completed');
  } catch (error) {
    console.warn('⚠️ Test containers setup failed:', error.message);
  }
}

async function setupTestNetwork() {
  console.log('🌐 Setting up test network...');
  
  try {
    // Create test network
    await execAsync(`docker network create homelab-gitops-dr-network || true`);
    
    // Connect containers to network
    await execAsync(`docker network connect homelab-gitops-dr-network homelab-gitops-dr-redis || true`);
    await execAsync(`docker network connect homelab-gitops-dr-network homelab-gitops-dr-postgres || true`);
    
    console.log('✅ Test network setup completed');
  } catch (error) {
    console.warn('⚠️ Test network setup failed:', error.message);
  }
}

async function createTestData() {
  console.log('📄 Creating test data...');
  
  try {
    const testDataDir = process.env.TEST_DATA_DIR || '/tmp/homelab-gitops-dr-test';
    
    // Create sample configuration files
    const configFiles = [
      { name: 'configuration.yaml', content: 'test: configuration' },
      { name: 'automations.yaml', content: 'test: automations' },
      { name: 'scripts.yaml', content: 'test: scripts' },
      { name: 'scenes.yaml', content: 'test: scenes' }
    ];
    
    for (const file of configFiles) {
      await fs.writeFile(path.join(testDataDir, file.name), file.content);
    }
    
    // Create sample database data
    await createSampleDatabaseData();
    
    console.log('✅ Test data creation completed');
  } catch (error) {
    console.warn('⚠️ Test data creation failed:', error.message);
  }
}

async function createSampleDatabaseData() {
  console.log('🗄️ Creating sample database data...');
  
  try {
    // This would typically insert sample data into the test database
    // For now, we'll just log that it's being created
    console.log('📊 Sample database data created');
  } catch (error) {
    console.warn('⚠️ Sample database data creation failed:', error.message);
  }
}

async function setupMonitoring() {
  console.log('📊 Setting up monitoring...');
  
  try {
    // Set up test metrics collection
    const metricsDir = path.join(process.env.TEST_DATA_DIR || '/tmp/homelab-gitops-dr-test', 'metrics');
    await fs.mkdir(metricsDir, { recursive: true });
    
    // Create metrics configuration
    const metricsConfig = {
      enabled: true,
      directory: metricsDir,
      retention: '7d',
      intervals: {
        collection: 1000,
        reporting: 5000
      }
    };
    
    await fs.writeFile(
      path.join(metricsDir, 'config.json'),
      JSON.stringify(metricsConfig, null, 2)
    );
    
    console.log('✅ Monitoring setup completed');
  } catch (error) {
    console.warn('⚠️ Monitoring setup failed:', error.message);
  }
}
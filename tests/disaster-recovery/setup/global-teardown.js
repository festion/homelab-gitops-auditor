/**
 * Global teardown for disaster recovery tests
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

module.exports = async () => {
  console.log('🧹 Tearing down disaster recovery test environment...');
  
  try {
    // Clean up test containers
    await cleanupTestContainers();
    
    // Clean up test network
    await cleanupTestNetwork();
    
    // Clean up test database
    await cleanupTestDatabase();
    
    // Clean up test directories
    await cleanupTestDirectories();
    
    // Generate final test report
    await generateFinalReport();
    
    console.log('✅ Disaster recovery test environment teardown completed');
    
  } catch (error) {
    console.error('❌ Failed to tear down disaster recovery test environment:', error);
    // Don't throw - we want tests to complete even if cleanup fails
  }
};

async function cleanupTestContainers() {
  console.log('🐳 Cleaning up test containers...');
  
  try {
    // Stop and remove test containers
    const containers = [
      'homelab-gitops-dr-redis',
      'homelab-gitops-dr-postgres'
    ];
    
    for (const container of containers) {
      await execAsync(`docker stop ${container} || true`);
      await execAsync(`docker rm ${container} || true`);
      console.log(`✅ Cleaned up container: ${container}`);
    }
    
    console.log('✅ Test containers cleanup completed');
  } catch (error) {
    console.warn('⚠️ Test containers cleanup failed:', error.message);
  }
}

async function cleanupTestNetwork() {
  console.log('🌐 Cleaning up test network...');
  
  try {
    // Remove test network
    await execAsync(`docker network rm homelab-gitops-dr-network || true`);
    
    console.log('✅ Test network cleanup completed');
  } catch (error) {
    console.warn('⚠️ Test network cleanup failed:', error.message);
  }
}

async function cleanupTestDatabase() {
  console.log('🗄️ Cleaning up test database...');
  
  try {
    // Drop test database
    await execAsync(`dropdb -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} ${process.env.DB_NAME} || true`);
    
    console.log('✅ Test database cleanup completed');
  } catch (error) {
    console.warn('⚠️ Test database cleanup failed:', error.message);
  }
}

async function cleanupTestDirectories() {
  console.log('📁 Cleaning up test directories...');
  
  try {
    const testDirs = [
      process.env.TEST_DATA_DIR || '/tmp/homelab-gitops-dr-test',
      process.env.BACKUP_DIR || '/tmp/homelab-gitops-dr-backup',
      process.env.RESTORE_DIR || '/tmp/homelab-gitops-dr-restore'
    ];
    
    for (const dir of testDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
        console.log(`✅ Cleaned up directory: ${dir}`);
      } catch (error) {
        console.warn(`⚠️ Failed to clean up directory ${dir}:`, error.message);
      }
    }
    
    console.log('✅ Test directories cleanup completed');
  } catch (error) {
    console.warn('⚠️ Test directories cleanup failed:', error.message);
  }
}

async function generateFinalReport() {
  console.log('📊 Generating final disaster recovery report...');
  
  try {
    const reportDir = './coverage/disaster-recovery';
    
    // Ensure report directory exists
    await fs.mkdir(reportDir, { recursive: true });
    
    // Generate summary report
    const summary = {
      timestamp: new Date().toISOString(),
      environment: 'disaster-recovery',
      testSuite: 'Disaster Recovery Tests',
      status: 'completed',
      metrics: {
        collected: true,
        location: './tests/disaster-recovery/metrics.json'
      },
      cleanup: {
        containers: 'completed',
        network: 'completed',
        database: 'completed',
        directories: 'completed'
      },
      nextSteps: [
        'Review test results in coverage/disaster-recovery/',
        'Check metrics in tests/disaster-recovery/metrics.json',
        'Analyze RTO/RPO compliance',
        'Review failure scenarios and recovery procedures'
      ]
    };
    
    await fs.writeFile(
      path.join(reportDir, 'teardown-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('✅ Final report generated');
    console.log(`📄 Report location: ${reportDir}/teardown-summary.json`);
    
  } catch (error) {
    console.warn('⚠️ Final report generation failed:', error.message);
  }
}
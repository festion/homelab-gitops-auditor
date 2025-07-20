const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class DatabaseSetup {
  constructor() {
    this.pool = null;
    this.testDbName = `homelab_gitops_test_${Date.now()}`;
    this.adminPool = null;
  }

  async initialize() {
    console.log('Initializing test database...');
    
    // Create admin connection
    this.adminPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: 'postgres'
    });
    
    // Create test database
    await this.createTestDatabase();
    
    // Create test connection
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: this.testDbName
    });
    
    // Run migrations
    await this.runMigrations();
    
    console.log(`Test database ${this.testDbName} initialized`);
  }

  async createTestDatabase() {
    try {
      await this.adminPool.query(`CREATE DATABASE "${this.testDbName}"`);
      console.log(`Created test database: ${this.testDbName}`);
    } catch (error) {
      if (error.code !== '42P04') { // Database already exists
        throw error;
      }
    }
  }

  async runMigrations() {
    // Read and execute migration files
    const migrationsDir = path.join(__dirname, '../../../database/migrations');
    
    try {
      const migrationFiles = await fs.readdir(migrationsDir);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      for (const file of sqlFiles) {
        const migrationPath = path.join(migrationsDir, file);
        const migration = await fs.readFile(migrationPath, 'utf8');
        
        console.log(`Running migration: ${file}`);
        await this.pool.query(migration);
      }
    } catch (error) {
      console.warn('No migrations found, creating basic schema...');
      await this.createBasicSchema();
    }
  }

  async createBasicSchema() {
    // Create basic schema for testing
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id SERIAL PRIMARY KEY,
        deployment_id VARCHAR(255) UNIQUE NOT NULL,
        repository VARCHAR(255) NOT NULL,
        branch VARCHAR(255) NOT NULL,
        commit_sha VARCHAR(255),
        state VARCHAR(50) NOT NULL DEFAULT 'queued',
        config_validation JSONB,
        deployment_steps JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT
      );
    `);
    
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS deployment_status_history (
        id SERIAL PRIMARY KEY,
        deployment_id VARCHAR(255) NOT NULL,
        state VARCHAR(50) NOT NULL,
        message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        FOREIGN KEY (deployment_id) REFERENCES deployments(deployment_id)
      );
    `);
    
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rollbacks (
        id SERIAL PRIMARY KEY,
        rollback_id VARCHAR(255) UNIQUE NOT NULL,
        target_deployment_id VARCHAR(255) NOT NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'queued',
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        FOREIGN KEY (target_deployment_id) REFERENCES deployments(deployment_id)
      );
    `);
    
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('Basic schema created');
  }

  async cleanup() {
    console.log('Cleaning up test database...');
    
    if (this.pool) {
      await this.pool.end();
    }
    
    if (this.adminPool) {
      try {
        await this.adminPool.query(`DROP DATABASE IF EXISTS "${this.testDbName}"`);
        console.log(`Dropped test database: ${this.testDbName}`);
      } catch (error) {
        console.warn(`Failed to drop test database: ${error.message}`);
      }
      
      await this.adminPool.end();
    }
  }

  async clearData() {
    // Clear all test data
    await this.pool.query('TRUNCATE TABLE audit_logs CASCADE');
    await this.pool.query('TRUNCATE TABLE rollbacks CASCADE');
    await this.pool.query('TRUNCATE TABLE deployment_status_history CASCADE');
    await this.pool.query('TRUNCATE TABLE deployments CASCADE');
  }

  async seedTestData() {
    // Seed basic test data
    const testDeployment = {
      deploymentId: 'deploy-20250713-120000',
      repository: 'festion/home-assistant-config',
      branch: 'main',
      commitSha: 'abc123def456',
      state: 'completed'
    };
    
    await this.pool.query(`
      INSERT INTO deployments (deployment_id, repository, branch, commit_sha, state, created_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')
    `, [
      testDeployment.deploymentId,
      testDeployment.repository,
      testDeployment.branch,
      testDeployment.commitSha,
      testDeployment.state
    ]);
    
    // Add status history
    await this.pool.query(`
      INSERT INTO deployment_status_history (deployment_id, state, created_at)
      VALUES 
        ($1, 'queued', NOW() - INTERVAL '1 hour'),
        ($1, 'in-progress', NOW() - INTERVAL '45 minutes'),
        ($1, 'completed', NOW() - INTERVAL '30 minutes')
    `, [testDeployment.deploymentId]);
  }

  async seedDeploymentHistory() {
    // Create multiple deployments for history testing
    const deployments = [
      {
        id: 'deploy-20250713-100000',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        state: 'completed',
        offset: '3 hours'
      },
      {
        id: 'deploy-20250713-110000',
        repository: 'festion/home-assistant-config',
        branch: 'develop',
        state: 'failed',
        offset: '2 hours'
      },
      {
        id: 'deploy-20250713-115000',
        repository: 'festion/home-assistant-config',
        branch: 'main',
        state: 'completed',
        offset: '1 hour'
      }
    ];
    
    for (const deployment of deployments) {
      await this.pool.query(`
        INSERT INTO deployments (deployment_id, repository, branch, state, created_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${deployment.offset}')
      `, [deployment.id, deployment.repository, deployment.branch, deployment.state]);
    }
  }

  async createCompletedDeployment() {
    const deploymentId = `deploy-${Date.now()}`;
    
    await this.pool.query(`
      INSERT INTO deployments (deployment_id, repository, branch, state, created_at, completed_at)
      VALUES ($1, 'festion/home-assistant-config', 'main', 'completed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')
    `, [deploymentId]);
    
    return deploymentId;
  }

  async findDeploymentById(deploymentId) {
    const result = await this.pool.query(
      'SELECT * FROM deployments WHERE deployment_id = $1',
      [deploymentId]
    );
    
    return result.rows[0] || null;
  }

  getConnection() {
    return this.pool;
  }

  async query(sql, params = []) {
    return await this.pool.query(sql, params);
  }
}

module.exports = { DatabaseSetup };
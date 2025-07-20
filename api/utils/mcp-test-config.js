// MCP Integration Test Configuration and Examples
// ==============================================

const MCPTestConfig = {
  // Test deployment configuration for Network-FS + GitHub integration
  sampleDeploymentConfig: {
    source: {
      type: 'github',
      repository: 'homeassistant/core',
      branch: 'dev',
      files: [
        'homeassistant/components/example/manifest.json',
        'homeassistant/components/example/__init__.py'
      ]
    },
    target: {
      type: 'network-fs',
      shareName: 'home-assistant-config',
      path: '/config/custom_components/example'
    },
    validation: {
      enabled: true,
      checks: [
        { type: 'file-exists', file: 'manifest.json' },
        { type: 'file-exists', file: '__init__.py' }
      ]
    },
    verification: {
      enabled: true,
      checks: [
        { type: 'file-exists', file: 'manifest.json' }
      ]
    }
  },

  // Test Network-FS operations
  networkFsTests: {
    shareInfo: async (mcpWrapper) => {
      return await mcpWrapper.executeNetworkFSOperation('get_share_info', {});
    },
    
    listDirectory: async (mcpWrapper, shareName = 'test-share') => {
      return await mcpWrapper.listNetworkDirectory(shareName, '');
    },
    
    createTestFile: async (mcpWrapper, shareName = 'test-share') => {
      const testContent = `Test file created at ${new Date().toISOString()}`;
      return await mcpWrapper.writeNetworkFile(
        shareName, 
        'test-mcp-integration.txt', 
        testContent
      );
    },
    
    readTestFile: async (mcpWrapper, shareName = 'test-share') => {
      return await mcpWrapper.readNetworkFile(
        shareName, 
        'test-mcp-integration.txt'
      );
    },
    
    deleteTestFile: async (mcpWrapper, shareName = 'test-share') => {
      return await mcpWrapper.deleteNetworkFile(
        shareName, 
        'test-mcp-integration.txt'
      );
    }
  },

  // Test GitHub operations
  githubTests: {
    publicRepo: {
      owner: 'octocat',
      repo: 'Hello-World'
    },
    
    getFileContent: async (mcpWrapper, owner = 'octocat', repo = 'Hello-World') => {
      return await mcpWrapper.getGitHubFileContents(owner, repo, 'README');
    },
    
    listBranches: async (mcpWrapper, owner = 'octocat', repo = 'Hello-World') => {
      return await mcpWrapper.listGitHubBranches(owner, repo);
    },
    
    listCommits: async (mcpWrapper, owner = 'octocat', repo = 'Hello-World') => {
      return await mcpWrapper.listGitHubCommits(owner, repo);
    },
    
    listTags: async (mcpWrapper, owner = 'octocat', repo = 'Hello-World') => {
      return await mcpWrapper.listGitHubTags(owner, repo);
    }
  },

  // Health check operations
  healthChecks: {
    mcpCoordinatorStatus: async (coordinator) => {
      return coordinator.getAllStatus();
    },
    
    networkFsHealth: async (coordinator) => {
      await coordinator.checkHealth();
      return coordinator.getHealthStatus('networkFs');
    },
    
    githubHealth: async (coordinator) => {
      await coordinator.checkHealth();
      return coordinator.getHealthStatus('github');
    }
  },

  // Test execution helper
  executeTests: async function(coordinator, mcpWrapper) {
    const results = {
      networkFs: [],
      github: [],
      health: []
    };

    // Network-FS Tests
    console.log('Testing Network-FS operations...');
    for (const [testName, testFunc] of Object.entries(this.networkFsTests)) {
      try {
        const result = await testFunc(mcpWrapper);
        results.networkFs.push({ test: testName, status: 'passed', result });
        console.log(`✅ ${testName}`);
      } catch (error) {
        results.networkFs.push({ test: testName, status: 'failed', error: error.message });
        console.log(`❌ ${testName}: ${error.message}`);
      }
    }

    // GitHub Tests
    console.log('\nTesting GitHub operations...');
    for (const [testName, testFunc] of Object.entries(this.githubTests)) {
      if (typeof testFunc === 'function') {
        try {
          const result = await testFunc(mcpWrapper);
          results.github.push({ test: testName, status: 'passed', result });
          console.log(`✅ ${testName}`);
        } catch (error) {
          results.github.push({ test: testName, status: 'failed', error: error.message });
          console.log(`❌ ${testName}: ${error.message}`);
        }
      }
    }

    // Health Checks
    console.log('\nTesting health monitoring...');
    for (const [testName, testFunc] of Object.entries(this.healthChecks)) {
      try {
        const result = await testFunc(coordinator);
        results.health.push({ test: testName, status: 'passed', result });
        console.log(`✅ ${testName}`);
      } catch (error) {
        results.health.push({ test: testName, status: 'failed', error: error.message });
        console.log(`❌ ${testName}: ${error.message}`);
      }
    }

    return results;
  }
};

module.exports = { MCPTestConfig };
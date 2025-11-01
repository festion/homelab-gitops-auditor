const { spawn } = require('child_process');
const { Logger } = require('./logger');

class MCPWrapper {
  constructor() {
    this.logger = new Logger('MCP-Wrapper');
  }

  static async executeNetworkFSOperation(operation, params) {
    const wrapper = '/home/dev/workspace/network-mcp-wrapper.sh';
    const command = {
      tool: 'network-fs',
      operation: operation,
      params: params
    };
    
    return await this.executeWrapper(wrapper, command);
  }

  static async executeGitHubOperation(operation, params) {
    const wrapper = '/home/dev/workspace/github-wrapper.sh';
    const command = {
      tool: 'github',
      operation: operation,
      params: params
    };
    
    return await this.executeWrapper(wrapper, command);
  }

  static async executeWrapper(wrapper, command) {
    const logger = new Logger('MCP-Wrapper');
    
    return new Promise((resolve, reject) => {
      const process = spawn(wrapper, [JSON.stringify(command)]);
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            resolve({ output: stdout });
          }
        } else {
          reject(new Error(`Wrapper exited with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        logger.error('Process execution error', error);
        reject(error);
      });
      
      // Set timeout
      setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('MCP operation timed out'));
      }, 30000);
    });
  }

  // Specific Network-FS operations
  static async createNetworkDirectory(shareName, directoryPath) {
    return await this.executeNetworkFSOperation('create_directory', {
      share_name: shareName,
      directory_path: directoryPath
    });
  }

  static async writeNetworkFile(shareName, filePath, content, encoding = 'utf-8') {
    return await this.executeNetworkFSOperation('write_file', {
      share_name: shareName,
      file_path: filePath,
      content: content,
      encoding: encoding
    });
  }

  static async readNetworkFile(shareName, filePath, encoding = 'utf-8') {
    return await this.executeNetworkFSOperation('read_file', {
      share_name: shareName,
      file_path: filePath,
      encoding: encoding
    });
  }

  static async listNetworkDirectory(shareName, path = '') {
    return await this.executeNetworkFSOperation('list_directory', {
      share_name: shareName,
      path: path
    });
  }

  static async deleteNetworkFile(shareName, filePath) {
    return await this.executeNetworkFSOperation('delete_file', {
      share_name: shareName,
      file_path: filePath
    });
  }

  static async getNetworkFileInfo(shareName, path) {
    return await this.executeNetworkFSOperation('get_file_info', {
      share_name: shareName,
      path: path
    });
  }

  // Specific GitHub operations
  static async getGitHubFileContents(owner, repo, path, ref = null) {
    return await this.executeGitHubOperation('get_file_contents', {
      owner: owner,
      repo: repo,
      path: path,
      ref: ref
    });
  }

  static async createGitHubFile(owner, repo, path, content, message, branch) {
    return await this.executeGitHubOperation('create_or_update_file', {
      owner: owner,
      repo: repo,
      path: path,
      content: content,
      message: message,
      branch: branch
    });
  }

  static async updateGitHubFile(owner, repo, path, content, message, branch, sha) {
    return await this.executeGitHubOperation('create_or_update_file', {
      owner: owner,
      repo: repo,
      path: path,
      content: content,
      message: message,
      branch: branch,
      sha: sha
    });
  }

  static async listGitHubBranches(owner, repo) {
    return await this.executeGitHubOperation('list_branches', {
      owner: owner,
      repo: repo
    });
  }

  static async listGitHubCommits(owner, repo, sha = null) {
    return await this.executeGitHubOperation('list_commits', {
      owner: owner,
      repo: repo,
      sha: sha
    });
  }

  static async getGitHubCommit(owner, repo, sha) {
    return await this.executeGitHubOperation('get_commit', {
      owner: owner,
      repo: repo,
      sha: sha
    });
  }

  static async listGitHubTags(owner, repo) {
    return await this.executeGitHubOperation('list_tags', {
      owner: owner,
      repo: repo
    });
  }

  static async getGitHubTag(owner, repo, tag) {
    return await this.executeGitHubOperation('get_tag', {
      owner: owner,
      repo: repo,
      tag: tag
    });
  }

  static async createGitHubBranch(owner, repo, branch, fromBranch = null) {
    return await this.executeGitHubOperation('create_branch', {
      owner: owner,
      repo: repo,
      branch: branch,
      from_branch: fromBranch
    });
  }

  static async createGitHubPullRequest(owner, repo, title, head, base, body = null, draft = false) {
    return await this.executeGitHubOperation('create_pull_request', {
      owner: owner,
      repo: repo,
      title: title,
      head: head,
      base: base,
      body: body,
      draft: draft
    });
  }

  static async listGitHubPullRequests(owner, repo, state = 'open') {
    return await this.executeGitHubOperation('list_pull_requests', {
      owner: owner,
      repo: repo,
      state: state
    });
  }
}

module.exports = { MCPWrapper };
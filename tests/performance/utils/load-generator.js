const http = require('http');
const https = require('https');
const { URL } = require('url');
const { EventEmitter } = require('events');

class LoadGenerator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConcurrency: options.maxConcurrency || 100,
      requestTimeout: options.requestTimeout || 30000,
      keepAlive: options.keepAlive !== false,
      ...options
    };
    
    this.agents = {
      http: new http.Agent({ 
        keepAlive: this.options.keepAlive,
        maxSockets: this.options.maxConcurrency
      }),
      https: new https.Agent({ 
        keepAlive: this.options.keepAlive,
        maxSockets: this.options.maxConcurrency
      })
    };
    
    this.activeRequests = new Set();
    this.results = {
      startTime: null,
      endTime: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: [],
      statusCodes: {},
      connectionErrors: 0,
      timeoutErrors: 0,
      bytes: {
        sent: 0,
        received: 0
      }
    };
  }

  async runLoadTest(config) {
    console.log(`🚀 Starting load test: ${config.endpoint}`);
    
    this.resetResults();
    this.results.startTime = Date.now();
    
    const {
      endpoint,
      method = 'GET',
      concurrency = 10,
      duration = 60000,
      rampUpTime = 10000,
      requestsPerSecond = null,
      requestBody = null,
      headers = {},
      queryParams = [],
      expectedResponseTime = 1000,
      expectedThroughput = 10
    } = config;
    
    // Prepare request variations
    const requestVariations = this.prepareRequestVariations(config);
    
    // Start load generation
    const loadPromise = this.generateLoad({
      endpoint,
      method,
      concurrency,
      duration,
      rampUpTime,
      requestsPerSecond,
      requestBody,
      headers,
      requestVariations
    });
    
    // Wait for completion
    await loadPromise;
    
    this.results.endTime = Date.now();
    
    // Calculate metrics
    return this.calculateMetrics(config);
  }

  async runStressTest(config) {
    console.log(`🔥 Starting stress test: ${config.endpoint}`);
    
    // Stress test with higher concurrency and longer duration
    const stressConfig = {
      ...config,
      concurrency: config.concurrency * 2,
      duration: config.duration * 1.5,
      rampUpTime: config.rampUpTime * 2
    };
    
    return this.runLoadTest(stressConfig);
  }

  async runLoadTestWithVariation(config) {
    console.log(`🎯 Starting load test with variations: ${config.endpoint}`);
    
    // Use query parameter variations if provided
    const variations = config.queryParams || [];
    const results = [];
    
    for (const variation of variations) {
      const variationConfig = {
        ...config,
        queryParams: [variation]
      };
      
      const result = await this.runLoadTest(variationConfig);
      results.push({
        variation,
        ...result
      });
      
      // Cool down between variations
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Return aggregated results
    return this.aggregateVariationResults(results);
  }

  resetResults() {
    this.results = {
      startTime: null,
      endTime: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: [],
      statusCodes: {},
      connectionErrors: 0,
      timeoutErrors: 0,
      conflictResponses: 0,
      unauthorizedResponses: 0,
      bytes: {
        sent: 0,
        received: 0
      }
    };
  }

  prepareRequestVariations(config) {
    if (!config.queryParams || config.queryParams.length === 0) {
      return [{ queryParams: {}, requestBody: config.requestBody }];
    }
    
    return config.queryParams.map(params => ({
      queryParams: params,
      requestBody: config.requestBody
    }));
  }

  async generateLoad(config) {
    const {
      endpoint,
      method,
      concurrency,
      duration,
      rampUpTime,
      requestsPerSecond,
      headers,
      requestVariations
    } = config;
    
    const baseUrl = global.PERFORMANCE_TEST_CONFIG?.baseUrl || 'http://localhost:3000';
    const fullUrl = new URL(endpoint, baseUrl);
    
    // Calculate request intervals
    const requestInterval = requestsPerSecond ? 1000 / requestsPerSecond : 0;
    
    // Start workers
    const workers = [];
    const rampUpInterval = rampUpTime / concurrency;
    
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker({
        url: fullUrl,
        method,
        headers,
        requestVariations,
        requestInterval,
        duration
      });
      
      workers.push(worker);
      
      // Ramp up gradually
      if (i < concurrency - 1) {
        await new Promise(resolve => setTimeout(resolve, rampUpInterval));
      }
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
  }

  createWorker({ url, method, headers, requestVariations, requestInterval, duration }) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let requestCount = 0;
      let variationIndex = 0;
      
      const makeRequest = () => {
        if (Date.now() - startTime >= duration) {
          resolve();
          return;
        }
        
        const variation = requestVariations[variationIndex % requestVariations.length];
        variationIndex++;
        
        this.makeHttpRequest(url, method, headers, variation)
          .then(() => {
            requestCount++;
            scheduleNextRequest();
          })
          .catch(() => {
            requestCount++;
            scheduleNextRequest();
          });
      };
      
      const scheduleNextRequest = () => {
        if (requestInterval > 0) {
          setTimeout(makeRequest, requestInterval);
        } else {
          setImmediate(makeRequest);
        }
      };
      
      // Start the worker
      makeRequest();
    });
  }

  makeHttpRequest(url, method, headers, variation) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // Add query parameters
      const requestUrl = new URL(url.toString());
      for (const [key, value] of Object.entries(variation.queryParams)) {
        requestUrl.searchParams.set(key, value);
      }
      
      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: this.options.requestTimeout,
        agent: url.protocol === 'https:' ? this.agents.https : this.agents.http
      };
      
      const requestBody = variation.requestBody ? JSON.stringify(variation.requestBody) : null;
      if (requestBody) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
        this.results.bytes.sent += Buffer.byteLength(requestBody);
      }
      
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(requestUrl, requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
          this.results.bytes.received += chunk.length;
        });
        
        res.on('end', () => {
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          
          this.results.totalRequests++;
          this.results.responseTimes.push(responseTime);
          
          // Track status codes
          this.results.statusCodes[res.statusCode] = (this.results.statusCodes[res.statusCode] || 0) + 1;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.results.successfulRequests++;
          } else {
            this.results.failedRequests++;
            
            if (res.statusCode === 409) {
              this.results.conflictResponses++;
            } else if (res.statusCode === 401 || res.statusCode === 403) {
              this.results.unauthorizedResponses++;
            }
          }
          
          this.emit('request_complete', {
            statusCode: res.statusCode,
            responseTime,
            responseSize: responseData.length
          });
          
          resolve({
            statusCode: res.statusCode,
            responseTime,
            responseData
          });
        });
      });
      
      req.on('error', (error) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        this.results.totalRequests++;
        this.results.failedRequests++;
        this.results.responseTimes.push(responseTime);
        
        if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
          this.results.connectionErrors++;
        } else if (error.code === 'ETIMEDOUT') {
          this.results.timeoutErrors++;
        }
        
        this.results.errors.push({
          error: error.message,
          code: error.code,
          timestamp: Date.now()
        });
        
        this.emit('request_error', {
          error: error.message,
          code: error.code,
          responseTime
        });
        
        reject(error);
      });
      
      req.on('timeout', () => {
        this.results.timeoutErrors++;
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      // Send request body if provided
      if (requestBody) {
        req.write(requestBody);
      }
      
      req.end();
      this.activeRequests.add(req);
      
      req.on('close', () => {
        this.activeRequests.delete(req);
      });
    });
  }

  calculateMetrics(config) {
    const duration = this.results.endTime - this.results.startTime;
    const totalRequests = this.results.totalRequests;
    const successfulRequests = this.results.successfulRequests;
    const failedRequests = this.results.failedRequests;
    
    // Calculate response time statistics
    const responseTimes = this.results.responseTimes.sort((a, b) => a - b);
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const medianResponseTime = responseTimes[Math.floor(responseTimes.length / 2)];
    const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
    const minResponseTime = responseTimes[0];
    const maxResponseTime = responseTimes[responseTimes.length - 1];
    
    // Calculate throughput
    const throughput = totalRequests / (duration / 1000);
    const successThroughput = successfulRequests / (duration / 1000);
    
    // Calculate error rates
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;
    const successRate = totalRequests > 0 ? successfulRequests / totalRequests : 0;
    const timeoutRate = totalRequests > 0 ? this.results.timeoutErrors / totalRequests : 0;
    
    // Calculate data transfer
    const totalBytesSent = this.results.bytes.sent;
    const totalBytesReceived = this.results.bytes.received;
    const averageResponseSize = successfulRequests > 0 ? totalBytesReceived / successfulRequests : 0;
    
    const metrics = {
      testName: config.testName || 'load-test',
      duration,
      totalRequests,
      successfulRequests,
      failedRequests,
      
      // Response time metrics
      averageResponseTime,
      medianResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      minResponseTime,
      maxResponseTime,
      
      // Throughput metrics
      throughput,
      successThroughput,
      
      // Error metrics
      errorRate,
      successRate,
      timeoutRate,
      connectionErrors: this.results.connectionErrors,
      timeoutErrors: this.results.timeoutErrors,
      conflictResponses: this.results.conflictResponses,
      unauthorizedResponses: this.results.unauthorizedResponses,
      
      // Data transfer metrics
      totalBytesSent,
      totalBytesReceived,
      averageResponseSize,
      
      // Status code distribution
      statusCodes: this.results.statusCodes,
      
      // Error details
      errors: this.results.errors,
      
      // Performance evaluation
      performanceScore: this.calculatePerformanceScore(config),
      systemCrash: this.detectSystemCrash(),
      
      // Timestamps
      startTime: this.results.startTime,
      endTime: this.results.endTime
    };
    
    return metrics;
  }

  calculatePerformanceScore(config) {
    const thresholds = global.PERFORMANCE_TEST_CONFIG?.thresholds || config.thresholds || {};
    
    let score = 100;
    
    // Response time score
    if (thresholds.responseTime) {
      const avgResponseTime = this.results.responseTimes.reduce((sum, time) => sum + time, 0) / this.results.responseTimes.length;
      if (avgResponseTime > thresholds.responseTime.average) {
        score -= 20;
      }
    }
    
    // Throughput score
    if (thresholds.throughput) {
      const throughput = this.results.totalRequests / ((this.results.endTime - this.results.startTime) / 1000);
      if (throughput < thresholds.throughput.minimum) {
        score -= 20;
      }
    }
    
    // Error rate score
    if (thresholds.errorRate) {
      const errorRate = this.results.failedRequests / this.results.totalRequests;
      if (errorRate > thresholds.errorRate.maximum) {
        score -= 30;
      }
    }
    
    // Connection issues score
    if (this.results.connectionErrors > 0) {
      score -= 15;
    }
    
    // Timeout issues score
    if (this.results.timeoutErrors > 0) {
      score -= 15;
    }
    
    return Math.max(0, score);
  }

  detectSystemCrash() {
    // System crash indicators
    const highConnectionErrors = this.results.connectionErrors > this.results.totalRequests * 0.1;
    const highTimeoutErrors = this.results.timeoutErrors > this.results.totalRequests * 0.1;
    const noSuccessfulRequests = this.results.successfulRequests === 0 && this.results.totalRequests > 0;
    
    return highConnectionErrors || highTimeoutErrors || noSuccessfulRequests;
  }

  aggregateVariationResults(results) {
    const aggregated = {
      testName: 'load-test-with-variations',
      variations: results.length,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      variations: results
    };
    
    // Aggregate metrics
    for (const result of results) {
      aggregated.totalRequests += result.totalRequests;
      aggregated.successfulRequests += result.successfulRequests;
      aggregated.failedRequests += result.failedRequests;
    }
    
    // Calculate averages
    aggregated.averageResponseTime = results.reduce((sum, r) => sum + r.averageResponseTime, 0) / results.length;
    aggregated.throughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
    aggregated.errorRate = aggregated.totalRequests > 0 ? aggregated.failedRequests / aggregated.totalRequests : 0;
    
    return aggregated;
  }

  async cleanup() {
    // Cancel all active requests
    for (const req of this.activeRequests) {
      req.destroy();
    }
    this.activeRequests.clear();
    
    // Destroy agents
    if (this.agents.http) {
      this.agents.http.destroy();
    }
    if (this.agents.https) {
      this.agents.https.destroy();
    }
  }
}

module.exports = { LoadGenerator };
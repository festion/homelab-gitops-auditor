/**
 * Path Traversal Prevention Tests
 * Tests protection against directory traversal attacks
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');
const { createTestApp } = require('../../integration/setup/test-environment');
const { AttackPayloads } = require('../utils/attack-payloads');
const { SecurityTestUtils } = require('../utils/security-utils');

describe('Path Traversal Prevention Tests', () => {
  let app;
  let authToken;
  let attackPayloads;
  let securityUtils;

  beforeAll(async () => {
    app = await createTestApp();
    securityUtils = new SecurityTestUtils();
    attackPayloads = new AttackPayloads();
    
    // Generate admin token for testing
    authToken = jwt.sign(
      { 
        sub: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: ['deployment:admin', 'system:admin']
      },
      process.env.JWT_SECRET || 'test-jwt-secret'
    );
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });

  describe('Path Traversal in File Operations', () => {
    it('should prevent path traversal in deployment paths', async () => {
      const pathTraversalPayloads = attackPayloads.getPathTraversalPayloads();

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/deploy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            repository: 'festion/home-assistant-config',
            branch: 'main',
            configPath: payload.payload,
            reason: 'Path traversal test'
          });

        // Should reject path traversal attempts
        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent path traversal in backup paths', async () => {
      const pathTraversalPayloads = [
        '../../../tmp/malicious',
        '..\\..\\..\\temp\\malicious',
        '....//....//tmp//malicious',
        '/etc/passwd',
        '\\windows\\system32\\config\\sam',
        '../../var/log/auth.log',
        '../../../root/.ssh/id_rsa',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/backup')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            backupPath: payload,
            reason: 'Path traversal test'
          });

        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent path traversal in template paths', async () => {
      const pathTraversalPayloads = [
        '../../../templates/malicious.yaml',
        '..\\..\\..\\templates\\malicious.yaml',
        '....//....//templates//malicious.yaml',
        '/etc/passwd',
        '../../var/log/syslog',
        '../../../proc/version',
        '..\\..\\..\\windows\\system32\\config\\sam'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/deployments/home-assistant-config/template')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            templatePath: payload,
            variables: { test: 'value' }
          });

        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent path traversal in file upload paths', async () => {
      const pathTraversalPayloads = [
        '../../../uploads/malicious.yaml',
        '..\\..\\..\\uploads\\malicious.yaml',
        '....//....//uploads//malicious.yaml',
        '/tmp/malicious.yaml',
        '../../var/www/html/malicious.php',
        '../../../etc/crontab',
        '..\\..\\..\\windows\\system32\\malicious.exe'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .field('path', payload)
          .attach('file', Buffer.from('test content'), 'test.yaml');

        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Path Traversal in File Access', () => {
    it('should prevent path traversal in log file access', async () => {
      const pathTraversalPayloads = [
        '../../../var/log/auth.log',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//etc//shadow',
        '/etc/passwd',
        '\\windows\\system32\\config\\sam',
        '../../proc/self/environ',
        '../../../root/.bash_history',
        '..\\..\\..\\users\\administrator\\desktop\\secrets.txt'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed|not.*found/i);
        }
      }
    });

    it('should prevent path traversal in configuration file access', async () => {
      const pathTraversalPayloads = [
        '../../../config/secrets.yaml',
        '..\\..\\..\\config\\secrets.yaml',
        '....//....//config//secrets.yaml',
        '/etc/passwd',
        '../../home/user/.ssh/id_rsa',
        '../../../var/lib/homeassistant/secrets.yaml',
        '..\\..\\..\\programdata\\secrets.yaml'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/api/config/file')
          .query({ path: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed|not.*found/i);
        }
      }
    });

    it('should prevent path traversal in backup file access', async () => {
      const pathTraversalPayloads = [
        '../../../backups/../../etc/passwd',
        '..\\..\\..\\backups\\..\\..\\windows\\system32\\config\\sam',
        '....//....//backups//....//....//etc//shadow',
        '/etc/passwd',
        '../../var/backup/../../../etc/passwd',
        '../../../tmp/../../../etc/passwd',
        '..\\..\\..\\backup\\..\\..\\..\\windows\\system32\\config\\sam'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/api/backups/download')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed|not.*found/i);
        }
      }
    });
  });

  describe('URL Encoding Path Traversal', () => {
    it('should prevent URL encoded path traversal', async () => {
      const urlEncodedPayloads = [
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5cconfig%5csam',
        '..%252f..%252f..%252fetc%252fpasswd',
        '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fvar%2flog%2fauth.log',
        '%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5cdrivers%5cetc%5chosts'
      ];

      for (const payload of urlEncodedPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent double URL encoded path traversal', async () => {
      const doubleEncodedPayloads = [
        '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
        '%252e%252e%255c%252e%252e%255c%252e%252e%255cwindows%255csystem32%255cconfig%255csam',
        '%25252e%25252e%25252f%25252e%25252e%25252f%25252e%25252e%25252fetc%25252fpasswd'
      ];

      for (const payload of doubleEncodedPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Unicode Path Traversal', () => {
    it('should prevent Unicode encoded path traversal', async () => {
      const unicodePayloads = [
        '\u002e\u002e\u002f\u002e\u002e\u002f\u002e\u002e\u002fetc\u002fpasswd',
        '\u002e\u002e\u005c\u002e\u002e\u005c\u002e\u002e\u005cwindows\u005csystem32\u005cconfig\u005csam',
        '..\\u002f..\\u002f..\\u002fetc\\u002fpasswd',
        '..\\u005c..\\u005c..\\u005cwindows\\u005csystem32\\u005cconfig\\u005csam'
      ];

      for (const payload of unicodePayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Null Byte Path Traversal', () => {
    it('should prevent null byte path traversal', async () => {
      const nullBytePayloads = [
        '../../../../../../../etc/passwd%00',
        '..\\..\\..\\..\\..\\..\\..\\windows\\system32\\config\\sam%00',
        '../../../../../../../etc/passwd\x00',
        '..\\..\\..\\..\\..\\..\\..\\windows\\system32\\config\\sam\x00',
        '../../../../../../../etc/passwd\u0000',
        '..\\..\\..\\..\\..\\..\\..\\windows\\system32\\config\\sam\u0000'
      ];

      for (const payload of nullBytePayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Path Normalization Bypass', () => {
    it('should prevent path traversal using dot segments', async () => {
      const dotSegmentPayloads = [
        '....//....//....//etc//passwd',
        '....\\\\....\\\\....\\\\windows\\\\system32\\\\config\\\\sam',
        '..../..../..../etc/passwd',
        '....\\....\\....\\windows\\system32\\config\\sam',
        './../../etc/passwd',
        '.\\..\\..\\windows\\system32\\config\\sam'
      ];

      for (const payload of dotSegmentPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent path traversal using UNC paths', async () => {
      const uncPathPayloads = [
        '\\\\..\\..\\..\\etc\\passwd',
        '\\\\..\\..\\..\\windows\\system32\\config\\sam',
        '//../../etc/passwd',
        '//../../windows/system32/config/sam',
        '\\\\.\\..\\..\\etc\\passwd',
        '\\\\.\\..\\..\\windows\\system32\\config\\sam'
      ];

      for (const payload of uncPathPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Absolute Path Prevention', () => {
    it('should prevent absolute path access', async () => {
      const absolutePathPayloads = [
        '/etc/passwd',
        '/var/log/auth.log',
        '/root/.ssh/id_rsa',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\sam',
        'C:\\Users\\Administrator\\Desktop\\secrets.txt',
        'D:\\confidential\\database.db',
        '/usr/bin/id',
        '/proc/version',
        '/sys/class/dmi/id/product_name'
      ];

      for (const payload of absolutePathPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed|absolute.*path/i);
        }
      }
    });
  });

  describe('Symbolic Link Prevention', () => {
    it('should prevent symbolic link traversal', async () => {
      const symlinkPayloads = [
        'logs/../../etc/passwd',
        'backups/../../../etc/passwd',
        'config/../../var/log/auth.log',
        'templates/../../../root/.ssh/id_rsa',
        'logs\\..\\..\\windows\\system32\\config\\sam',
        'backups\\..\\..\\..\\windows\\system32\\config\\sam'
      ];

      for (const payload of symlinkPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Path Validation and Sanitization', () => {
    it('should validate allowed file extensions', async () => {
      const invalidExtensionPayloads = [
        'config.exe',
        'script.sh',
        'malicious.php',
        'backdoor.asp',
        'virus.bat',
        'trojan.com',
        'malware.scr',
        'keylogger.pif'
      ];

      for (const payload of invalidExtensionPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*file|file.*type|not.*allowed/i);
        }
      }
    });

    it('should enforce path length limits', async () => {
      const longPath = 'a/'.repeat(1000) + 'test.log';
      const veryLongPath = 'a/'.repeat(10000) + 'test.log';

      const testPaths = [longPath, veryLongPath];

      for (const payload of testPaths) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 422]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/path.*too.*long|invalid.*path|path.*length/i);
        }
      }
    });

    it('should validate path characters', async () => {
      const invalidCharacterPayloads = [
        'config<script>alert(1)</script>.yaml',
        'config"malicious".yaml',
        'config|rm -rf /.yaml',
        'config&echo hacked.yaml',
        'config$(whoami).yaml',
        'config`id`.yaml',
        'config;rm -rf /.yaml',
        'config>malicious.yaml'
      ];

      for (const payload of invalidCharacterPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|invalid.*character|not.*allowed/i);
        }
      }
    });

    it('should normalize and validate paths correctly', async () => {
      const pathNormalizationTests = [
        {
          input: 'logs/./deployment.log',
          expected: 'logs/deployment.log'
        },
        {
          input: 'logs/../logs/deployment.log',
          expected: 'logs/deployment.log'
        },
        {
          input: 'logs//deployment.log',
          expected: 'logs/deployment.log'
        },
        {
          input: 'logs/deployment.log/',
          expected: 'logs/deployment.log'
        }
      ];

      for (const testCase of pathNormalizationTests) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: testCase.input })
          .set('Authorization', `Bearer ${authToken}`);

        // Should either normalize and succeed or reject invalid paths
        expect(response.status).toBeOneOf([200, 400, 403, 404]);
        
        if (response.status === 400) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });

  describe('Directory Listing Prevention', () => {
    it('should prevent directory listing attacks', async () => {
      const directoryListingPayloads = [
        '.',
        '..',
        '../',
        '../../',
        'logs/',
        'backups/',
        'config/',
        'templates/',
        '/etc/',
        '/var/',
        'C:\\',
        'C:\\Windows\\'
      ];

      for (const payload of directoryListingPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|directory.*listing|not.*allowed/i);
        }
      }
    });
  });

  describe('Platform-Specific Path Traversal', () => {
    it('should prevent Windows-specific path traversal', async () => {
      const windowsPathPayloads = [
        '..\\..\\..\\windows\\system32\\config\\sam',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
        '..\\..\\..\\users\\administrator\\desktop\\secrets.txt',
        '..\\..\\..\\programdata\\secrets.txt',
        '..\\..\\..\\windows\\temp\\malicious.exe',
        'C:\\Windows\\System32\\config\\sam',
        'C:\\Users\\Administrator\\Desktop\\secrets.txt',
        'D:\\confidential\\database.db'
      ];

      for (const payload of windowsPathPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });

    it('should prevent Unix-specific path traversal', async () => {
      const unixPathPayloads = [
        '../../../etc/passwd',
        '../../../etc/shadow',
        '../../../var/log/auth.log',
        '../../../root/.ssh/id_rsa',
        '../../../home/user/.bash_history',
        '../../../proc/version',
        '../../../sys/class/dmi/id/product_name',
        '/etc/passwd',
        '/var/log/auth.log',
        '/root/.ssh/id_rsa'
      ];

      for (const payload of unixPathPayloads) {
        const response = await request(app)
          .get('/api/deployments/home-assistant-config/logs/deploy-123')
          .query({ file: payload })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeOneOf([400, 403, 404]);
        
        if (response.body.error) {
          expect(response.body.error.message).toMatch(/invalid.*path|path.*traversal|not.*allowed/i);
        }
      }
    });
  });
});
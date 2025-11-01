# Security Testing Suite

Comprehensive security testing for the homelab-gitops-auditor automated deployment system.

## Overview

This directory contains security tests that validate authentication, authorization, input validation, and security controls throughout the system. The tests are designed to detect common vulnerabilities and ensure the system follows security best practices.

## Test Categories

### Authentication Testing (`authentication/`)
- Token validation and JWT security
- Session management and lifecycle
- Brute force protection
- Multi-factor authentication
- Token expiration and refresh

### Authorization Testing (`authorization/`)
- Role-based access control (RBAC)
- Permission boundaries
- Privilege escalation prevention
- Resource-level access controls
- Horizontal and vertical privilege escalation

### Input Validation Testing (`input-validation/`)
- SQL injection prevention
- Cross-site scripting (XSS) protection
- Path traversal prevention
- Command injection protection
- Data validation and sanitization

### API Security Testing (`api-security/`)
- Rate limiting enforcement
- CORS validation
- Security headers validation
- Webhook signature verification
- API versioning and deprecation

### Cryptographic Testing (`cryptographic/`)
- Token generation and validation
- Webhook signature verification
- Data encryption and decryption
- Key management and rotation
- Cryptographic algorithm validation

### Network Security Testing (`network/`)
- TLS configuration validation
- Certificate verification
- Network isolation testing
- Firewall rule validation
- Secure communication protocols

### Penetration Testing (`penetration/`)
- Attack scenario simulation
- Vulnerability assessment
- Security boundary testing
- Threat modeling validation
- Security policy enforcement

## Security Scanner Integration

The security scanner (`utils/security-scanner.js`) provides automated vulnerability detection:

- **Dependency Vulnerability Scanning**: Uses npm audit to detect known vulnerabilities
- **Static Code Analysis**: ESLint security rules for code quality
- **Secrets Detection**: Pattern matching for hardcoded credentials
- **Container Security**: Docker image vulnerability scanning
- **Security Reporting**: Comprehensive vulnerability reports

## Running Security Tests

```bash
# Run all security tests
npm run test:security

# Run specific security test category
npm run test:security:auth
npm run test:security:authz
npm run test:security:input
npm run test:security:api
npm run test:security:crypto
npm run test:security:network
npm run test:security:penetration

# Run security scanner
npm run security:scan

# Generate security report
npm run security:report

# Run security tests in CI/CD
npm run test:security:ci
```

## Security Test Configuration

### Environment Variables
```bash
# Security test configuration
SECURITY_TEST_ENVIRONMENT=test
SECURITY_TEST_TIMEOUT=30000
SECURITY_SCAN_ENABLED=true
SECURITY_REPORT_PATH=./security-report.json
```

### Test Data
- Test tokens and credentials are stored in `utils/test-data.js`
- Attack payloads are defined in `utils/attack-payloads.js`
- Security utilities are available in `utils/security-utils.js`

## Security Compliance

The security tests validate compliance with:
- OWASP Top 10 security risks
- NIST Cybersecurity Framework
- CIS Controls
- ISO 27001 security standards
- Industry-specific security requirements

## Continuous Security Monitoring

Security tests are integrated into the CI/CD pipeline to:
- Detect security regressions
- Monitor dependency vulnerabilities
- Validate security controls
- Generate security metrics
- Enforce security policies

## Contributing to Security Tests

When adding new security tests:
1. Follow the existing test structure and naming conventions
2. Include both positive and negative test cases
3. Test edge cases and boundary conditions
4. Document attack vectors and mitigation strategies
5. Update the security scanner with new detection rules

## Security Test Maintenance

Regular maintenance tasks:
- Update attack payloads and test data
- Review and update security patterns
- Validate test coverage and effectiveness
- Update security scanning tools
- Review and update security documentation
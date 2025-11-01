# Disaster Recovery Test Suite

This test suite validates the disaster recovery capabilities of the homelab-gitops-auditor system.

## Test Categories

### 1. Backup Validation Tests (`backup-validation/`)
- Backup creation and integrity validation
- Backup restoration procedures
- Backup retention policies
- Backup corruption detection

### 2. Data Recovery Tests (`data-recovery/`)
- Database recovery from backups
- Configuration file recovery
- Log file recovery
- Audit trail recovery

### 3. System Failure Tests (`system-failure/`)
- Complete system failure scenarios
- Service outage recovery
- Network partition handling
- Storage failure recovery

### 4. Corruption Recovery Tests (`corruption-recovery/`)
- Database corruption recovery
- Configuration file corruption
- Binary file corruption
- Filesystem corruption

### 5. Partial Failure Tests (`partial-failure/`)
- Component failure scenarios
- Degraded performance handling
- Cascading failure recovery
- Resource exhaustion recovery

### 6. Business Continuity Tests (`business-continuity/`)
- Service availability during recovery
- Data consistency validation
- Transaction integrity
- User experience continuity

### 7. Disaster Scenarios (`scenarios/`)
- Fire drill simulations
- Ransomware attack simulation
- Hardware failure scenarios
- Human error recovery

## Utilities

### Failure Injector (`utils/failure-injector.js`)
Injects various types of failures into the system for testing recovery procedures.

### Recovery Validator (`utils/recovery-validator.js`)
Validates the integrity and completeness of recovery operations.

### Metrics Collector (`utils/metrics-collector.js`)
Collects and analyzes disaster recovery metrics.

### Scenario Simulator (`utils/scenario-simulator.js`)
Simulates complex disaster scenarios for comprehensive testing.

## Running Tests

```bash
# Run all disaster recovery tests
npm run test:disaster-recovery

# Run specific test category
npm run test:disaster-recovery:backup
npm run test:disaster-recovery:system-failure
npm run test:disaster-recovery:corruption

# Run disaster recovery fire drill
npm run test:disaster-recovery:fire-drill

# Generate disaster recovery report
npm run test:disaster-recovery:report
```

## Recovery Objectives

- **Recovery Time Objective (RTO)**: 30 minutes for complete system restoration
- **Recovery Point Objective (RPO)**: 1 hour maximum data loss
- **Data Integrity**: 95% minimum integrity score
- **Success Rate**: 99% recovery success rate

## Test Environment

Tests use isolated test environments to prevent interference with production systems.
Each test category has its own dedicated test environment configuration.
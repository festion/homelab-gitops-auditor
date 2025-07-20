const TestHelpers = require('./helpers/testHelpers');

describe('Simple Test Suite', () => {
  it('should verify test environment is working', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(1 + 1).toBe(2);
  });

  it('should create test helpers', () => {
    const user = TestHelpers.createTestUser();
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('email');
  });

  it('should generate test tokens', () => {
    const token = TestHelpers.generateTestToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  it('should create test data', () => {
    const repo = TestHelpers.createTestRepository();
    const pipeline = TestHelpers.createTestPipeline();
    const compliance = TestHelpers.createTestCompliance();

    expect(repo).toHaveProperty('name');
    expect(pipeline).toHaveProperty('repository');
    expect(compliance).toHaveProperty('score');
  });
});
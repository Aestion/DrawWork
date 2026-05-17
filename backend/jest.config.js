module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/config/**'],
  coverageDirectory: 'coverage',
  verbose: true,
  maxWorkers: 1
}

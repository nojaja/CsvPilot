/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  runner: 'jest-runner-cli',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/spec/behavior'],
  testMatch: ['**/*.cli.test.js'],
  testTimeout: 60000,
};

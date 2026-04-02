module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetModules: true,
  testTimeout: 30000,
  maxWorkers: 1,
};

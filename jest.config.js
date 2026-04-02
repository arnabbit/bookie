module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          lib: ['ES2019'],
          module: 'CommonJS',
          moduleResolution: 'node',
          types: ['jest'],
          skipLibCheck: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,js}'],
};

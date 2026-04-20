import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.test.ts',
    '!**/index.ts',
    '!prisma/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterFramework: [],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;

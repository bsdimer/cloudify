import type { Config } from 'jest';

const config: Config = {
  displayName: 'gitops',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  passWithNoTests: true,
  moduleNameMapper: {
    '^@cloudify/common(.*)$': '<rootDir>/../../common/src$1',
    '^@cloudify/nats(.*)$': '<rootDir>/../nats/src$1',
  },
};

export default config;

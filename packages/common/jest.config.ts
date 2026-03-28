import type { Config } from 'jest';

const config: Config = {
  displayName: 'common',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  passWithNoTests: true,
};

export default config;

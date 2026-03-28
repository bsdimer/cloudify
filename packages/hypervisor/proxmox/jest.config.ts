import type { Config } from 'jest';

const config: Config = {
  displayName: 'hypervisor-proxmox',
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
    '^@cloudify/hypervisor-core(.*)$': '<rootDir>/../core/src$1',
  },
};

export default config;

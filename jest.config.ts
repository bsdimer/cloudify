import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/packages/*/jest.config.ts',
    '<rootDir>/packages/services/*/jest.config.ts',
    '<rootDir>/packages/hypervisor/*/jest.config.ts',
  ],
};

export default config;

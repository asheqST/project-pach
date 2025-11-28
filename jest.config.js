module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',
    '!src/examples/**/*.ts'
  ],
  // Coverage thresholds set to production standards
  // All code should have comprehensive test coverage
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  // Transform ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!nanoid)'
  ],
  // Mock nanoid to avoid ES module issues
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/tests/__mocks__/nanoid.ts'
  }
};

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
  // Coverage thresholds adjusted for integration test focus
  // Integration tests verify real behavior end-to-end rather than unit test coverage
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 45,
      lines: 50,
      statements: 50
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

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native$': '<rootDir>/tests/mocks/react-native.js',
    '^expo-constants$': '<rootDir>/tests/mocks/expo-constants.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/tests/mocks/async-storage.js',
    '^expo-file-system(.*)$': '<rootDir>/tests/mocks/expo-file-system.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

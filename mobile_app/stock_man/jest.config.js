// ============================================================
// Stock Man — Jest Configuration
//
// jest-expo preset'i React Native + Expo modüllerini transform
// eder. Aşağıdaki `transformIgnorePatterns` nativewind, zustand
// ve @testing-library paketlerini de dönüştürme listesine alır.
// `testEnvironment` jest-expo tarafından sağlanır (node + jest-mock
// RN köprüleri); burada explicit set etmeye gerek yok.
// ============================================================

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@react-native-async-storage/.*|zustand|nativewind|@testing-library))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};

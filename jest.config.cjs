module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'mjs'],
  collectCoverageFrom: ['genomes/**/*.js'],
  coverageDirectory: 'coverage',
  coverageProvider: 'babel'
};

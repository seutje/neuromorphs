module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'mjs'],
  collectCoverageFrom: ['genomes/**/*.js'],
  coverageDirectory: 'coverage',
  coverageProvider: 'babel'
};

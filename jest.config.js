module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true, module: 'commonjs', target: 'ES2020' } }] },
};

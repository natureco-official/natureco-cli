const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: ['node_modules', 'test'],
      thresholds: { lines: 16, statements: 16, functions: 13, branches: 11 },
    },
    // Windows'ta süreç başlatma yavaş; paralel yük altında spawn'lı testler
    // 10sn'yi aşabiliyor — flaky'liği önlemek için cömert tut
    testTimeout: 60000,
    hookTimeout: 30000,
    forceExit: true,
  },
});

import { defineConfig } from 'vitest/config';

// base './' → läuft unter jedem GitHub-Pages-Pfad (user.github.io/repo/) ohne Anpassung.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

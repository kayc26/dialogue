import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative asset paths: the app has no router, so './' works under any
  // GitHub Pages subpath (kayc26.github.io/harness/ or a renamed repo) and the
  // "wrong base → blank page" bug class cannot occur. See ADR-0002.
  base: './',
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})

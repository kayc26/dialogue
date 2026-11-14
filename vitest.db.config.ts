import { defineConfig } from 'vitest/config'

// Database tests hit a live Neon branch over the network, so they stay out of the
// offline gate (`npm run gate`) and run on demand with `npm run test:db`.
// See db/tests/rls.test.ts for the required environment variables.
export default defineConfig({
  test: {
    include: ['db/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    fileParallelism: false,
  },
})

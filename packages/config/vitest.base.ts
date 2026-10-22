import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { currentPackageSuffix, testDatabaseUrl } from '../db/test/test-url.ts'

const testUrl = testDatabaseUrl(currentPackageSuffix())

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { DATABASE_URL: testUrl ?? '' },
    globalSetup: [fileURLToPath(new URL('../db/test/global-setup.ts', import.meta.url))],
  },
})

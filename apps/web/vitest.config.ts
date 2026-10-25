import { fileURLToPath } from 'node:url'
import base from '@xo/config/vitest.base'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: { include: ['src/**/*.test.tsx'], setupFiles: ['./src/test/axe.ts'] },
  }),
)

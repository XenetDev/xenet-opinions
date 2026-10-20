import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import base from '@xo/config/vitest.base'

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: { include: ['src/**/*.test.tsx'] },
  }),
)

import { defineConfig, mergeConfig } from 'vitest/config'
import base from '@xo/config/vitest.base'

export default mergeConfig(base, defineConfig({ test: { include: ['src/**/*.test.ts', 'mock/**/*.test.ts'] } }))

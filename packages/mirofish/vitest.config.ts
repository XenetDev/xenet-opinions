import base from '@xo/config/vitest.base'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(base, defineConfig({ test: { include: ['src/**/*.test.ts', 'mock/**/*.test.ts'] } }))

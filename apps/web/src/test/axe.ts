import { expect } from 'vitest'
import { type AxeMatchers, configureAxe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends AxeMatchers {}
}

if (typeof document !== 'undefined') expect.extend(matchers)

// jsdom has no layout or canvas, so contrast cannot be computed here
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } })

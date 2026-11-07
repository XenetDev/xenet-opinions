import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { sharedReportHeaders } from './shared-report-headers'

describe('shared report response headers', () => {
  it('marks /r/* noindex with no referrer', async () => {
    const rules = await nextConfig.headers?.()
    expect(rules).toEqual(expect.arrayContaining(sharedReportHeaders))
    const headers = Object.fromEntries(sharedReportHeaders[0]!.headers.map((h) => [h.key, h.value]))
    expect(headers).toEqual({ 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' })
  })
})

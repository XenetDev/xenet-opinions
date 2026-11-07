export const sharedReportHeaders = [
  {
    source: '/r/:token',
    headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ],
  },
]

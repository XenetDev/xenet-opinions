import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@xo/db', '@xo/engine', '@xo/mirofish'],
}

export default nextConfig

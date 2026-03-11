/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: backendUrl + '/api/:path*',
      },
    ]
  },
  webpack: (config) => {
    // Fix for three.js
    config.externals = config.externals || {};
    config.externals['three'] = 'three';
    return config;
  },
}

module.exports = nextConfig

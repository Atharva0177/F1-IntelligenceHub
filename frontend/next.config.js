/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL + '/:path*',
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

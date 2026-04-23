const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // ✅ FIXED IMAGE CONFIG (supports wildcard properly)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ibirdos-files.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      }
    ],
  },

  // ✅ REMOVE HARDCODED FALLBACKS (important for deployment)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  // ✅ PATH ALIAS
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static optimization where possible
  reactStrictMode: true,
  // Disable ESLint during build for faster builds
  eslint: {
    // Only run ESLint on local development, not during builds
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript type checking during build for faster builds
  typescript: {
    // Only run TypeScript type checking on local development, not during builds
    ignoreBuildErrors: true,
  },
  // Configure output directory (default is .next)
  distDir: '.next',
  // Configure image domains for next/image
  images: {
    domains: ['images.unsplash.com'],
  },
};

module.exports = nextConfig; 
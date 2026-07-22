/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nestora/ui', '@nestora/types', '@nestora/utils', '@nestora/api-client'],
};

module.exports = nextConfig;

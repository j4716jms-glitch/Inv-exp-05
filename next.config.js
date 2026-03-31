/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Next.js to NEVER bundle xlsx — load it natively via Node.js require()
  // This is the #1 fix for xlsx on Vercel serverless functions
  serverExternalPackages: ['xlsx'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
        zlib: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

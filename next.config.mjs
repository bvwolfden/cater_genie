/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Prisma server-only (not bundled for the client).
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

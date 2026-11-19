/** @type {import('next').NextConfig} */
const nextConfig = {
  // Core uses Node built-ins (fs, child_process); keep it out of the bundler and load it at runtime.
  serverExternalPackages: ["@disappointed-dad/core", "postgres"],
  poweredByHeader: false,
};

export default nextConfig;

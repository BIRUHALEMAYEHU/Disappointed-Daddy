import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle the shared core into the server code (it's a workspace package, so it must not be left external:
  // externals from outside apps/web weren't traced into the deployed functions). Node built-ins stay external.
  transpilePackages: ["@disappointed-dad/core"],
  serverExternalPackages: ["postgres"],
  // Monorepo: trace files from the repo root so packages/core is included in the deployed functions.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  poweredByHeader: false,
};

export default nextConfig;

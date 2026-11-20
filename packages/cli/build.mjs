import { build } from "esbuild";

// Bundles the CLI, the shared core and the Anthropic SDK into one file,
// so `disappointed-dad` is a single npm package with no runtime dependencies.
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/index.js",
  // Some dependencies use require(); give the ESM bundle a working one.
  banner: { js: "import { createRequire as __dadCreateRequire } from 'node:module'; const require = __dadCreateRequire(import.meta.url);" },
  minify: process.argv.includes("--production"),
  sourcemap: !process.argv.includes("--production"),
  logLevel: "info",
});

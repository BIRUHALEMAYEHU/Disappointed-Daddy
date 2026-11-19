import { build } from "esbuild";

// Bundles the extension, the shared core and the Anthropic SDK into one file VS Code can load.
await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: !process.argv.includes("--production"),
  minify: process.argv.includes("--production"),
  logLevel: "info",
});

import type { NextConfig } from "next";

/**
 * The engine lives in `../dist`: compiled Node code shared with the CLI, which
 * reads data files by absolute path at run time. Turbopack cannot follow those
 * reads, so the engine is excluded from bundling and loaded as a real module.
 *
 * `../dist` must be built before this app (`npm run build` in the repo root);
 * `npm run dev` here does that for you through the `predev` script.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk", "zod"],
  outputFileTracingIncludes: {
    "/api/**": ["../data/**", "../demo-sample/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

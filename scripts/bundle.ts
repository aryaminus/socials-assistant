/**
 * Bundle socials-mcp into a standalone dist for npm publishing.
 * Output: apps/mcp/dist-bundle/ (single-file ESM, workspace deps inlined).
 * Run from anywhere: `tsx scripts/bundle.ts` (paths resolved from this file).
 */
import { build } from "esbuild";
import { rmSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = join(root, "apps", "mcp");

rmSync(join(mcp, "dist-bundle"), { recursive: true, force: true });
mkdirSync(join(mcp, "dist-bundle"), { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22.5",
  format: "esm",
  external: ["@modelcontextprotocol/sdk", "zod", "node:*"],
  minify: false,
  sourcemap: false,
  legalComments: "none" as const,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
};

await build({
  ...common,
  entryPoints: [join(mcp, "dist", "index.js")],
  outfile: join(mcp, "dist-bundle", "index.js"),
});

await build({
  ...common,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  entryPoints: [join(mcp, "dist", "snapshot.js")],
  outfile: join(mcp, "dist-bundle", "snapshot.js"),
});

// self-contained bin shim → imports the bundle in the same directory
writeFileSync(
  join(mcp, "dist-bundle", "socials-mcp.js"),
  "#!/usr/bin/env node\nimport(\"../dist-bundle/index.js\");\n"
);
chmodSync(join(mcp, "dist-bundle", "socials-mcp.js"), 0o755);
console.log("bundled → apps/mcp/dist-bundle/");

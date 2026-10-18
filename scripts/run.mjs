import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Keep runtime state inside the workspace on Windows and in restricted environments.
const runtime = resolve(".runtime");
mkdirSync(resolve(runtime, "tmp"), { recursive: true });
mkdirSync(resolve(runtime, "logs"), { recursive: true });
const binaries = {
  wrangler: "wrangler/bin/wrangler.js",
  vite: "vite/bin/vite.js",
  vitest: "vitest/vitest.mjs",
  playwright: "@playwright/test/cli.js",
};
const binary = binaries[process.argv[2]];
if (!binary) throw new Error("Unknown local tool.");
const result = spawnSync(
  process.execPath,
  [resolve("node_modules", binary), ...process.argv.slice(3)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TEMP: resolve(runtime, "tmp"),
      TMP: resolve(runtime, "tmp"),
      WRANGLER_LOG_PATH: resolve(runtime, "logs"),
      WRANGLER_SEND_METRICS: "false",
      CI: process.env.CI ?? "true",
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);

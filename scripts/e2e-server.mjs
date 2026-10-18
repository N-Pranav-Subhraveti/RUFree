import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
mkdirSync(".runtime", { recursive: true });
const state = mkdtempSync(resolve(".runtime/e2e-"));
const env = { ...process.env, RUFREE_TEST_STATE: state };
const migrate = spawnSync(
  process.execPath,
  [
    "scripts/run.mjs",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    state,
  ],
  { stdio: "inherit", env },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const server = spawnSync(
  process.execPath,
  ["scripts/run.mjs", "vite", "--host", "127.0.0.1"],
  { stdio: "inherit", env },
);
process.exit(server.status ?? 1);

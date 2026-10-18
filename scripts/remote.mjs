import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
const [action, environment] = process.argv.slice(2);
if (
  !["deploy", "migrate", "dry-run"].includes(action) ||
  environment !== "production"
)
  throw new Error(
    "Only the explicitly configured production preview is supported.",
  );
if (!existsSync("deployment.local.json"))
  throw new Error(
    "Missing operator release configuration. See docs/release.md.",
  );
const release = JSON.parse(readFileSync("deployment.local.json", "utf8"));
if (
  !["manual-preview", "public-beta"].includes(release.scope) ||
  release.freePlanConfirmed !== true ||
  release.name !== "rufree" ||
  release.origin !== "https://rufree.sn-pranav18.workers.dev" ||
  !/^[a-f0-9]{32}$/.test(release.accountId) ||
  !/^[a-f0-9-]{36}$/.test(release.databaseId)
)
  throw new Error(
    "Release configuration is incomplete or outside the approved preview scope.",
  );
const secrets = parseEnv(readFileSync(".dev.vars", "utf8"));
if (
  !secrets.GOOGLE_CLIENT_SECRET ||
  !secrets.GOOGLE_CLIENT_ID ||
  (release.scope !== "public-beta" && !secrets.ALLOWED_EMAILS)
)
  throw new Error(
    "Google configuration must be filled in .dev.vars before release.",
  );
const runtime = resolve(".runtime");
mkdirSync(resolve(runtime, "release"), { recursive: true });
mkdirSync(resolve(runtime, "tmp"), { recursive: true });
const processEnv = {
  ...process.env,
  TEMP: resolve(runtime, "tmp"),
  TMP: resolve(runtime, "tmp"),
  WRANGLER_SEND_METRICS: "false",
  CI: "true",
};
function run(args, input) {
  const result = spawnSync(process.execPath, args, {
    env: processEnv,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (action !== "migrate") run(["scripts/run.mjs", "vite", "build"]);
const config = {
  name: release.name,
  account_id: release.accountId,
  main: resolve("dist/rufree_local/index.js"),
  no_bundle: true,
  compatibility_date: "2026-10-06",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: false,
  assets: {
    directory: resolve("dist/client"),
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*"],
  },
  vars: {
    ENVIRONMENT: "production",
    SIGNUP_MODE:
      release.scope === "public-beta" ? "google-beta" : "invite-only",
    APP_ORIGIN: release.origin,
    GOOGLE_CLIENT_ID: secrets.GOOGLE_CLIENT_ID,
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "rufree-production",
      database_id: release.databaseId,
      migrations_dir: resolve("migrations"),
    },
  ],
  triggers: { crons: ["* * * * *"] },
  observability: {
    enabled: true,
    head_sampling_rate: 0.1,
    logs: { enabled: true, invocation_logs: false },
  },
};
const configPath = resolve(runtime, "release/wrangler.json");
writeFileSync(configPath, JSON.stringify(config, null, 2));
const wrangler = ["scripts/run.mjs", "wrangler"];
if (action === "migrate")
  run([
    ...wrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    configPath,
  ]);
else if (action === "dry-run")
  run([...wrangler, "deploy", "--dry-run", "--config", configPath]);
else {
  run([...wrangler, "deploy", "--config", configPath]);
  // Secrets travel only over stdin to Wrangler, never command arguments or a generated file.
  run(
    [...wrangler, "secret", "bulk", "--config", configPath],
    JSON.stringify({
      GOOGLE_CLIENT_SECRET: secrets.GOOGLE_CLIENT_SECRET,
      ALLOWED_EMAILS: secrets.ALLOWED_EMAILS ?? "",
    }),
  );
}

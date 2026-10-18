import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
const migrations = await readD1Migrations("./migrations");
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          ALLOWED_EMAILS: "",
        },
      },
      remoteBindings: false,
    }),
  ],
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
  },
});

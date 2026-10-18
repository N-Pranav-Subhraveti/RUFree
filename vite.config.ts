import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      persistState: process.env.RUFREE_TEST_STATE
        ? { path: process.env.RUFREE_TEST_STATE }
        : true,
    }),
  ],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});

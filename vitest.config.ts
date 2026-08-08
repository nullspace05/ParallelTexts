import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Separate from vite.config.ts to avoid the Cloudflare Workers plugin,
// which is incompatible with Vitest's SSR environment options.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
})

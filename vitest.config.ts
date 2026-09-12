import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Separate from vite.config.ts to avoid the Cloudflare Workers plugin,
// which is incompatible with Vitest's SSR environment options.
export default defineConfig({
  // Header reads this vite.config.ts define at render time; stub it here
  // since this config intentionally omits the Cloudflare/git-shelling setup
  // that produces the real value in dev/build.
  define: {
    __COMMIT_HASH__: JSON.stringify(""),
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: [resolve(__dirname, "src/i18n/i18n.ts")],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
})

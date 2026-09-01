import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { execSync } from "node:child_process"
import { defineConfig } from "vite"

import { cloudflare } from "@cloudflare/vite-plugin"

function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return ""
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __COMMIT_HASH__: JSON.stringify(getGitHash()),
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
    cloudflare({
      // SPA mode prerenders its shell through Vite's local preview server.
      // It does not need the sample-book bucket, so avoid requiring remote R2
      // credentials only for that build-time preview. Vite dev and the deployed
      // Worker retain the remote binding from wrangler.jsonc.
      // NOTE: CLOUDFLARE_VITE_BUILD = internal environment variable used by the Cloudflare Vite plugin.
      // you can verify yourself using strings node_modules/@cloudflare/vite-plugin/dist/index.mjs | rg CLOUDFLARE_VITE_BUILD
      // rg CLOUDFLARE_VITE_BUILD node_modules/@cloudflare/vite-plugin
      remoteBindings: process.env.CLOUDFLARE_VITE_BUILD !== "true",
      viteEnvironment: {
        name: "ssr",
      },
    }),
  ],
})

export default config

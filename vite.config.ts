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
    tanstackStart(),
    viteReact(),
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
    }),
  ],
})

export default config

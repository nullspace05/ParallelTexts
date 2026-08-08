import { existsSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

/** @param {string} dir */
function walk(dir) {
  if (!existsSync(dir)) return

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (!statSync(fullPath).isDirectory()) continue

    if (entry === "Xenova" && fullPath.includes(`${join("models", "Xenova")}`)) {
      rmSync(fullPath, { recursive: true, force: true })
      console.log(
        `Removed ${fullPath} from build output (served from R2 in production)`,
      )
      continue
    }

    walk(fullPath)
  }
}

for (const root of [".output", "dist"]) {
  walk(root)
}

// Strip browser-only heavy assets from the server (Worker) bundle.
// These files are already present in dist/client/assets/ and are served as
// Cloudflare static assets — the Worker script never loads them directly.
// Leaving them in dist/server/assets/ causes Wrangler to bundle them as
// "additional modules", which pushes the Worker past the size limit.
const SERVER_ASSETS = join("dist", "server", "assets")

if (existsSync(SERVER_ASSETS)) {
  for (const entry of readdirSync(SERVER_ASSETS)) {
    const isWasm = entry.endsWith(".wasm")
    const isWorker = /\.worker[-.\w]*\.(js|mjs)$/.test(entry)

    if (isWasm || isWorker) {
      const fullPath = join(SERVER_ASSETS, entry)
      rmSync(fullPath, { force: true })
      console.log(
        `Removed ${fullPath} from server bundle (browser-only asset, served as static file)`,
      )
    }
  }
}

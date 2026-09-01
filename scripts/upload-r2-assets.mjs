#!/usr/bin/env node
/**
 * Upload a local public/assets/<folder> directory to R2 (one object at a time
 * via wrangler). Files >300 MB cannot be uploaded with wrangler put — the
 * script prints the equivalent rclone command for those.
 *
 * Used for sample-book EPUBs (see src/server/serve-r2-assets.ts) and any other
 * static files you want R2-backed instead of bundled with the app. Embedding
 * models are fetched from the Hugging Face Hub in the browser (src/utils/model.ts).
 *
 * Usage:
 *   pnpm upload-assets --folder=sample_books
 *   node scripts/upload-r2-assets.mjs --folder=sample_books
 *   node scripts/upload-r2-assets.mjs --bucket parallel-texts-models --folder=sample_books
 *
 * Omit --folder to default to sample_books.
 */

import { execSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const bucket =
  process.argv.find((arg) => arg.startsWith("--bucket="))?.split("=")[1] ??
  "parallel-texts-models"

const folder =
  process.argv.find((arg) => arg.startsWith("--folder="))?.split("=")[1] ??
  "sample_books"

const assetRoot = join("public/assets", folder)

if (!existsSync(assetRoot)) {
  console.error(`Directory not found: ${assetRoot}`)
  console.error(`Place the files to upload there first.`)
  process.exit(1)
}

function walkFiles(dir) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkFiles(fullPath))
    } else if (entry !== ".DS_Store") {
      files.push(fullPath)
    }
  }
  return files
}

const r2Prefix = folder
const files = walkFiles(assetRoot)

for (const filePath of files) {
  const relativePath = relative(assetRoot, filePath)
  const key = `${r2Prefix}/${relativePath}`
  const sizeMb = (statSync(filePath).size / 1024 / 1024).toFixed(1)

  if (statSync(filePath).size > 300 * 1024 * 1024) {
    console.warn(
      `SKIP ${key} (${sizeMb} MB) — too large for wrangler put; use rclone instead:`
    )
    console.warn(
      `  rclone copy ${filePath} r2:${bucket}/${key.replace(/\/[^/]+$/, "/")}`
    )
    continue
  }

  console.log(`Uploading ${key} (${sizeMb} MB)...`)
  execSync(
    `wrangler r2 object put ${bucket}/${key} --file=${filePath} --content-type=${contentType(filePath)}`,
    { stdio: "inherit" }
  )
}

function contentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json"
  if (filePath.endsWith(".txt")) return "text/plain"
  if (filePath.endsWith(".epub")) return "application/epub+zip"
  return "application/octet-stream"
}

console.log("Done.")

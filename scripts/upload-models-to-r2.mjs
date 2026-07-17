#!/usr/bin/env node
/**
 * Upload local model files to R2 (one object at a time via wrangler).
 * Files >300 MB cannot be uploaded with wrangler put — the script prints
 * the equivalent rclone command for those.
 *
 * Usage:
 *   pnpm upload-models --model=Xenova/LaBSE
 *   node scripts/upload-models-to-r2.mjs --model=Xenova/LaBSE
 *   node scripts/upload-models-to-r2.mjs --model=onnx-community/embeddinggemma-300m-ONNX
 *   node scripts/upload-models-to-r2.mjs --bucket parallel-texts-models --model=Xenova/LaBSE
 *
 * Omit --model to default to Xenova/distiluse-base-multilingual-cased-v2.
 */

import { execSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const bucket =
  process.argv.find((arg) => arg.startsWith("--bucket="))?.split("=")[1] ??
  "parallel-texts-models"

const modelId =
  process.argv.find((arg) => arg.startsWith("--model="))?.split("=")[1] ??
  "Xenova/distiluse-base-multilingual-cased-v2"

const modelRoot = join("public/models", modelId)

if (!existsSync(modelRoot)) {
  console.error(`Model directory not found: ${modelRoot}`)
  console.error(
    `Download the model first (open the app in dev, go to Settings, click Download for "${modelId}").`
  )
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

const r2Prefix = modelId
const files = walkFiles(modelRoot)

for (const filePath of files) {
  const relativePath = relative(modelRoot, filePath)
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
  if (filePath.endsWith(".onnx")) return "application/octet-stream"
  if (filePath.endsWith(".txt")) return "text/plain"
  return "application/octet-stream"
}

console.log("Done.")

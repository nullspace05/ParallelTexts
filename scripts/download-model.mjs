#!/usr/bin/env node
/**
 * Download a model from HuggingFace Hub into public/models/ so it can be
 * served by Vite in local dev and uploaded to R2 for prod.
 *
 * Usage:
 *   node scripts/download-model.mjs --model=Xenova/LaBSE
 *   node scripts/download-model.mjs --model=onnx-community/embeddinggemma-300m-ONNX
 *   pnpm download-model --model=Xenova/distiluse-base-multilingual-cased-v2
 *
 * Downloads fp32 (onnx/model.onnx).
 *
 * After downloading, upload to R2 with:
 *   node scripts/upload-models-to-r2.mjs --model=<modelId>
 */

import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { env, pipeline } from "@huggingface/transformers"

const modelId =
  process.argv.find((arg) => arg.startsWith("--model="))?.split("=")[1]

if (!modelId) {
  console.error("Error: --model=<modelId> is required")
  console.error("")
  console.error("Examples:")
  console.error(
    "  node scripts/download-model.mjs --model=Xenova/LaBSE",
  )
  console.error(
    "  node scripts/download-model.mjs --model=Xenova/distiluse-base-multilingual-cased-v2",
  )
  process.exit(1)
}

// Direct downloads to public/models/ so Vite serves them at /models/ in dev
// and the upload script can find them for R2.
env.localModelPath = "./public/models/"
env.allowLocalModels = true
env.allowRemoteModels = true

console.log(`Downloading ${modelId} (fp32) → public/models/${modelId}/\n`)

let lastFile = ""

await pipeline("feature-extraction", modelId, {
  device: "cpu",
  dtype: "fp32",
  local_files_only: false,
  progress_callback: (info) => {
    if (info.status === "initiate") {
      lastFile = info.file ?? ""
      process.stdout.write(`  ${lastFile}\n`)
    } else if (info.status === "progress") {
      const pct = String((info.progress ?? 0).toFixed(1)).padStart(5)
      const file = info.file ?? lastFile
      process.stdout.write(`\r  ${file}: ${pct}%   `)
    } else if (info.status === "done") {
      process.stdout.write(`\r  ${info.file ?? lastFile}: 100.0% ✓\n`)
    }
  },
})

// Copy from the transformers.js Node cache to public/models/ so Vite serves
// them at /models/ in dev and the upload script can find them for R2.
const cacheDir = join(
  "node_modules/@huggingface/transformers/.cache",
  modelId,
)
const destDir = join("public/models", modelId)

if (!existsSync(cacheDir)) {
  console.error(`\nCache not found at ${cacheDir} — download may have failed.`)
  process.exit(1)
}

mkdirSync(dirname(destDir), { recursive: true })
cpSync(cacheDir, destDir, { recursive: true })

console.log(`\nCopied to public/models/${modelId}/`)
console.log(
  `Upload to R2: node scripts/upload-models-to-r2.mjs --model=${modelId}`,
)

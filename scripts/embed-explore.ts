import { embedSentences } from "@/lib/alignment-pipeline"
import { getSentenceTexts, splitIntoSentences } from "@/lib/sentence-splitter"
import { extractTxtContent } from "@/lib/txt"
import { DEFAULT_MODEL_ID } from "@/utils/model-registry"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const BOOKS = join(__dirname, "../books")
const SENTENCE_COUNT = 100

function L2Norm(vec: Float32Array, dim: number, row: number): number {
  let sum = 0
  const startOffset = row * dim // e.g. 1 * 768
  for (let j = 0; j < dim; j++) {
    sum += vec[startOffset + j] ** 2
  }
  return Math.sqrt(sum)
}

function dot(
  vecA: Float32Array,
  vecB: Float32Array,
  dim: number,
  rowA: number,
  rowB: number
) {
  let sum = 0
  const offsetA = rowA * dim
  const offsetB = rowB * dim
  for (let j = 0; j < dim; j++) {
    sum += vecA[offsetA + j] * vecB[offsetB + j]
  }
  return sum
}

async function main() {
  const enBlob = new Blob([readFileSync(join(BOOKS, "i-am-a-cat.txt"))])
  const jaBlob = new Blob([
    readFileSync(join(BOOKS, "i-cat-吾輩は猫である.txt")),
  ])

  const enParas = await extractTxtContent(enBlob)
  const jaParas = await extractTxtContent(jaBlob)

  const { records: enRecords } = splitIntoSentences(
    enParas,
    "en",
    SENTENCE_COUNT
  )
  const { records: jaRecords } = splitIntoSentences(
    jaParas,
    "ja",
    SENTENCE_COUNT
  )

  const enTexts = getSentenceTexts(enRecords)
  const jaTexts = getSentenceTexts(jaRecords)

  console.log(`model: ${DEFAULT_MODEL_ID}`)

  console.log("--- embedding (first run)")
  const src = await embedSentences(enTexts, DEFAULT_MODEL_ID)
  const tgt = await embedSentences(jaTexts, DEFAULT_MODEL_ID)

  console.log("\n---vectors ---")
  // sanity check that the norms are close to 1 as expected
  for (let i = 0; i < 10; i++) {
    console.log(
      `src[${i}] dim=${src.hiddenDim} norm=${L2Norm(src.data, src.hiddenDim, i)}`
    )
    console.log(
      `tgt[${i}] dim=${tgt.hiddenDim} norm=${L2Norm(tgt.data, tgt.hiddenDim, i)}`
    )
    console.log(
      `   dot(src[${i}], tgt[${i}]) = ${dot(src.data, tgt.data, src.hiddenDim, i, i)}`
    )
  }

  // another test
  const src2 = await embedSentences(
    ["the cat was running along"],
    DEFAULT_MODEL_ID
  )
  const tgt2 = await embedSentences(
    ["今日はいい天気ですね。パソコンを使いたいなああ。。。"],
    DEFAULT_MODEL_ID
  )
  const tgt3 = await embedSentences(
    ["猫はあそこで走っている。"],
    DEFAULT_MODEL_ID
  )
  console.log(src2)
  console.log("------- dot product for another test")
  console.log(
    `dot(should be low) = ${dot(src2.data, tgt2.data, src2.hiddenDim, 0, 0)}`
  )
  console.log(
    `dot(should be high) = ${dot(src2.data, tgt3.data, src2.hiddenDim, 0, 0)}`
  )

  console.log("\n ----- other stuff ------")
  console.log({
    srcFloats: src.data.length,
    tgtFloats: tgt.data.length,
    expectedPerSide: enTexts.length * src.hiddenDim,
  })
}

await main()

import type { ProgressCallback } from "@huggingface/transformers"

import { DEFAULT_MODEL_ID, loadExtractor } from "./model"

async function getSentenceEmbedding(text: string): Promise<number[]> {
  const extractor = await loadExtractor()
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  })
  return output.tolist()[0]
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0)
}

export async function checkAlignment(onProgress?: ProgressCallback) {
  await loadExtractor(DEFAULT_MODEL_ID, "auto", onProgress)

  const englishSentence = "The weather is lovely today."
  const japaneseTranslation = "今日はとてもいい天気ですね。"
  const completelyUnrelated = "何を見てるんだよ？"

  const vecEnglish = await getSentenceEmbedding(englishSentence)
  const vecJapanese = await getSentenceEmbedding(japaneseTranslation)
  const vecUnrelated = await getSentenceEmbedding(completelyUnrelated)

  const matchScore = cosineSimilarity(vecEnglish, vecJapanese)
  const badScore = cosineSimilarity(vecEnglish, vecUnrelated)

  console.log(`Translation Match Score: ${matchScore.toFixed(4)}`)
  console.log(`Unrelated Match Score: ${badScore.toFixed(4)}`)

  return { matchScore, badScore }
}

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  import.meta.url === `file://${process.argv[1]}`

if (isMainModule) {
  checkAlignment((info) => {
    if (info.status === "progress_total") {
      console.log(`Loading: ${info.progress.toFixed(1)}%`)
    }
  })
}

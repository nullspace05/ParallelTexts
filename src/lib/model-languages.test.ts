import { MODEL_REGISTRY } from "@/utils/model-registry"
import { describe, expect, it } from "vitest"
import {
  getModelLanguages,
  LANGUAGE_NAMES,
  MODEL_LANGUAGE_CODES,
  POPULAR_LANGUAGE_CODES,
  withSelectedCode,
} from "./model-languages"

const MPNET = "Xenova/paraphrase-multilingual-mpnet-base-v2"
const MINILM = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
const DISTILUSE = "Xenova/distiluse-base-multilingual-cased-v2"

describe("model-languages catalog", () => {
  it("names every code referenced anywhere", () => {
    for (const code of POPULAR_LANGUAGE_CODES) {
      expect(LANGUAGE_NAMES, `POPULAR code ${code}`).toHaveProperty(code)
    }
    for (const [modelId, codes] of Object.entries(MODEL_LANGUAGE_CODES)) {
      for (const code of codes) {
        expect(LANGUAGE_NAMES, `${modelId} code ${code}`).toHaveProperty(code)
      }
    }
  })

  it("keys MODEL_LANGUAGE_CODES by real model registry ids", () => {
    const known = new Set(MODEL_REGISTRY.map((m) => m.id))
    for (const modelId of Object.keys(MODEL_LANGUAGE_CODES)) {
      expect(known, modelId).toContain(modelId)
    }
  })

  it("keeps every historically-stored code selectable", () => {
    for (const code of [
      "ja",
      "en",
      "zh",
      "zh-tw",
      "ko",
      "fr",
      "de",
      "es",
      "und",
    ]) {
      expect(LANGUAGE_NAMES).toHaveProperty(code)
    }
  })
})

describe("per-model coverage (pinned to model cards, Step 5)", () => {
  it("gives the paraphrase-multilingual family the 53-code sbert.net list", () => {
    const codes = MODEL_LANGUAGE_CODES[MPNET]
    expect(codes).toHaveLength(53)
    // sbert.net docs list, with zh-cn folded into the app's zh
    expect(codes).toEqual(
      expect.arrayContaining(["zh", "zh-tw", "fr-ca", "pt-br"])
    )
    expect(codes).not.toContain("zh-cn")
  })

  it("treats EmbeddingGemma as the whole catalog", () => {
    const codes =
      MODEL_LANGUAGE_CODES["onnx-community/embeddinggemma-300m-ONNX"]
    expect([...codes].sort()).toEqual(
      Object.keys(LANGUAGE_NAMES)
        .filter((c) => c !== "und")
        .sort()
    )
  })
})

describe("getModelLanguages", () => {
  it("returns identical sets for the two paraphrase-multilingual models", () => {
    expect(getModelLanguages(MINILM)).toEqual(getModelLanguages(MPNET))
  })

  it("leads with und, then exactly the popular codes in order", () => {
    const opts = getModelLanguages(MPNET)
    expect(opts[0].code).toBe("und")
    expect(opts[0].popular).toBeUndefined()

    const popularBlock = opts.slice(1, 1 + POPULAR_LANGUAGE_CODES.length)
    expect(popularBlock.map((o) => o.code)).toEqual(POPULAR_LANGUAGE_CODES)
    expect(popularBlock.every((o) => o.popular)).toBe(true)

    // nothing after the block is flagged popular
    expect(
      opts.slice(1 + POPULAR_LANGUAGE_CODES.length).some((o) => o.popular)
    ).toBe(false)
  })

  it("sorts the non-popular tail A–Z by name", () => {
    const tail = getModelLanguages(MPNET)
      .slice(1 + POPULAR_LANGUAGE_CODES.length)
      .map((o) => o.label)
    expect(tail).toEqual([...tail].sort((a, b) => a.localeCompare(b)))
  })

  it("falls back to the full catalog for an unknown or missing model id", () => {
    const full = getModelLanguages(undefined)
    expect(full).toEqual(getModelLanguages("some/unknown-model"))
    expect(full.length).toBe(Object.keys(LANGUAGE_NAMES).length)
    expect(full.length).toBeGreaterThan(1)
  })
})

describe("withSelectedCode", () => {
  it("appends a code the model doesn't list, exactly once", () => {
    const base = getModelLanguages(DISTILUSE)
    const withFake = withSelectedCode(base, "xx-fake")
    expect(withFake.filter((o) => o.code === "xx-fake")).toHaveLength(1)
    expect(withFake).toHaveLength(base.length + 1)
    expect(withFake.at(-1)).toEqual({ code: "xx-fake", label: "xx-fake" })
  })

  it("is a no-op when the code is already present or empty", () => {
    const base = getModelLanguages(DISTILUSE)
    expect(withSelectedCode(base, "fr")).toBe(base)
    expect(withSelectedCode(base, "")).toBe(base)
  })
})

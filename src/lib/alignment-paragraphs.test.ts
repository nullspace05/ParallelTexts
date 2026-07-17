import { describe, expect, it } from "vitest"
import {
  buildAlignmentParagraphs,
  buildParagraphText,
  groupPairsByParagraph,
  numberParagraphPairs,
  searchAlignmentParagraphs,
} from "./alignment-paragraphs"
import type { AlignedPair, AlignmentResult } from "@/types/alignment"

function pair(overrides: Partial<AlignedPair>): AlignedPair {
  return {
    src_text: "",
    tgt_text: "",
    src_sent_idx: null,
    src_para_idx: null,
    src_global_idx: null,
    tgt_sent_idx: null,
    tgt_para_idx: null,
    tgt_global_idx: null,
    alignment_type: "1:1",
    confidence: null,
    src_images: null,
    tgt_images: null,
    ...overrides,
  }
}

describe("groupPairsByParagraph", () => {
  it("groups pairs by src_para_idx", () => {
    const pairs = [
      pair({ src_para_idx: 0, src_text: "a" }),
      pair({ src_para_idx: 1, src_text: "b" }),
      pair({ src_para_idx: 0, src_text: "c" }),
    ]
    const grouped = groupPairsByParagraph(pairs)
    expect(grouped.get(0)?.map((p) => p.src_text)).toEqual(["a", "c"])
    expect(grouped.get(1)?.map((p) => p.src_text)).toEqual(["b"])
  })

  it("defaults null src_para_idx to paragraph 0", () => {
    const pairs = [pair({ src_para_idx: null, src_text: "a" })]
    const grouped = groupPairsByParagraph(pairs)
    expect(grouped.get(0)?.map((p) => p.src_text)).toEqual(["a"])
  })
})

describe("buildParagraphText", () => {
  it("sorts by src_sent_idx and joins with a space", () => {
    const pairs = [
      pair({ src_sent_idx: 1, src_text: "world" }),
      pair({ src_sent_idx: 0, src_text: "hello" }),
    ]
    expect(buildParagraphText(pairs)).toBe("hello world")
  })

  it("filters out pairs with empty src_text", () => {
    const pairs = [
      pair({ src_sent_idx: 0, src_text: "hello" }),
      pair({ src_sent_idx: 1, src_text: "  " }),
      pair({ src_sent_idx: 2, src_text: "world" }),
    ]
    expect(buildParagraphText(pairs)).toBe("hello world")
  })
})

describe("buildAlignmentParagraphs", () => {
  function makeResult(overrides: Partial<AlignmentResult>): AlignmentResult {
    return {
      pairs: [],
      src_lang: "en",
      tgt_lang: "ja",
      total_src_sentences: 0,
      total_tgt_sentences: 0,
      aligned_count: 0,
      src_gap_count: 0,
      tgt_gap_count: 0,
      ...overrides,
    }
  }

  it("primary path: builds one ParagraphData per non-empty source_paragraph", () => {
    const result = makeResult({
      source_paragraphs: [
        { para_idx: 0, text: "Para one raw", images: [] },
        { para_idx: 1, text: "Para two raw", images: [] },
      ],
      pairs: [
        pair({
          src_para_idx: 0,
          src_sent_idx: 0,
          src_text: "Hello.",
          tgt_text: "こんにちは。",
        }),
        pair({
          src_para_idx: 1,
          src_sent_idx: 0,
          src_text: "World.",
          tgt_text: "世界。",
        }),
      ],
    })

    const paragraphs = buildAlignmentParagraphs(result, "none")
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("Hello.")
    expect(paragraphs[1].text).toBe("World.")
    expect(paragraphs[0].pairs).toHaveLength(1)
  })

  it("primary path: falls back to raw paragraph text when a paragraph has no pairs", () => {
    const result = makeResult({
      source_paragraphs: [
        { para_idx: 0, text: "Untranslated caption", images: [] },
      ],
      pairs: [],
    })
    const paragraphs = buildAlignmentParagraphs(result, "none")
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toBe("Untranslated caption")
    expect(paragraphs[0].pairs).toEqual([])
  })

  it("primary path: drops empty, imageless source paragraphs", () => {
    const result = makeResult({
      source_paragraphs: [
        { para_idx: 0, text: "   ", images: [] },
        { para_idx: 1, text: "Real paragraph", images: [] },
      ],
      pairs: [
        pair({ src_para_idx: 1, src_sent_idx: 0, src_text: "Real paragraph" }),
      ],
    })
    const paragraphs = buildAlignmentParagraphs(result, "none")
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toBe("Real paragraph")
  })

  it("imageMode controls which images attach to each paragraph", () => {
    const result = makeResult({
      source_paragraphs: [
        {
          para_idx: 0,
          text: "",
          images: [{ id: "src1", mime_type: "image/png", data_base64: "" }],
        },
      ],
      target_paragraphs: [
        {
          para_idx: 0,
          text: "",
          images: [{ id: "tgt1", mime_type: "image/png", data_base64: "" }],
        },
      ],
      pairs: [
        pair({
          src_para_idx: 0,
          tgt_para_idx: 0,
          src_sent_idx: 0,
          src_text: "Caption",
        }),
      ],
    })

    expect(
      buildAlignmentParagraphs(result, "source")[0].images.map((i) => i.id)
    ).toEqual(["src1"])
    expect(
      buildAlignmentParagraphs(result, "target")[0].images.map((i) => i.id)
    ).toEqual(["tgt1"])
    expect(
      buildAlignmentParagraphs(result, "both")[0].images.map((i) => i.id)
    ).toEqual(["src1", "tgt1"])
    expect(buildAlignmentParagraphs(result, "none")[0].images).toEqual([])
  })

  it("fallback path: groups by pairs when source_paragraphs is absent", () => {
    const result = makeResult({
      pairs: [
        pair({ src_para_idx: 1, src_sent_idx: 0, src_text: "Second." }),
        pair({ src_para_idx: 0, src_sent_idx: 0, src_text: "First." }),
      ],
    })
    const paragraphs = buildAlignmentParagraphs(result, "none")
    expect(paragraphs.map((p) => p.text)).toEqual(["First.", "Second."])
  })

  it("excludes 0:1 gap pairs (empty src_text) from the displayed paragraph", () => {
    const result = makeResult({
      source_paragraphs: [{ para_idx: 0, text: "Has source.", images: [] }],
      pairs: [
        pair({
          src_para_idx: 0,
          src_sent_idx: 0,
          src_text: "Has source.",
          tgt_text: "Has target.",
        }),
        pair({
          src_para_idx: 0,
          src_text: "",
          tgt_text: "Target-only orphan.",
          alignment_type: "0:1",
        }),
      ],
    })
    const paragraphs = buildAlignmentParagraphs(result, "none")
    expect(paragraphs[0].pairs).toHaveLength(1)
    expect(paragraphs[0].pairs[0].src_text).toBe("Has source.")
  })
})

describe("searchAlignmentParagraphs", () => {
  const paragraphs = [
    {
      text: "Hello world",
      images: [],
      pairs: [
        pair({ src_text: "Hello world", tgt_text: "Bonjour le monde" }),
        pair({ src_text: "Goodbye", tgt_text: "Au revoir" }),
      ],
    },
  ]

  it("returns no results for an empty query", () => {
    expect(searchAlignmentParagraphs(paragraphs, "  ", 10)).toEqual({
      results: [],
      pairKeys: [],
      hasMore: false,
    })
  })

  it("matches on source text", () => {
    const { results } = searchAlignmentParagraphs(paragraphs, "hello", 10)
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toBe("Hello world")
  })

  it("matches on target text when source doesn't match", () => {
    const { results } = searchAlignmentParagraphs(paragraphs, "revoir", 10)
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toBe("Au revoir")
  })

  it("caps results at maxResults and reports hasMore", () => {
    const many = [
      {
        text: "",
        images: [],
        pairs: Array.from({ length: 5 }, () =>
          pair({ src_text: "match", tgt_text: "" })
        ),
      },
    ]
    const { results, hasMore } = searchAlignmentParagraphs(many, "match", 3)
    expect(results).toHaveLength(3)
    expect(hasMore).toBe(true)
  })
})

describe("numberParagraphPairs", () => {
  it("assigns sequential numbers across all paragraphs", () => {
    const paragraphs = [
      { pairs: [{}, {}] },
      { pairs: [{}] },
      { pairs: [{}, {}, {}] },
    ]
    expect(numberParagraphPairs(paragraphs)).toEqual([[1, 2], [3], [4, 5, 6]])
  })

  it("handles empty paragraphs", () => {
    expect(numberParagraphPairs([{ pairs: [] }])).toEqual([[]])
    expect(numberParagraphPairs([])).toEqual([])
  })
})

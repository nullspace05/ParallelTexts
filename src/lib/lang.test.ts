import { describe, expect, it } from "vitest"

import { detectCjkLang, normalizeLang, resolveTextLang } from "./lang"

describe("normalizeLang", () => {
  it("lower-cases and keeps a plain code", () => {
    expect(normalizeLang("EN")).toBe("en")
    expect(normalizeLang("ja")).toBe("ja")
  })

  it("maps the legacy JP code to ja", () => {
    expect(normalizeLang("JP")).toBe("ja")
    expect(normalizeLang("jp")).toBe("ja")
    expect(normalizeLang("jp-JP")).toBe("ja-jp")
  })

  it("normalizes separators but keeps region/script subtags", () => {
    expect(normalizeLang("zh-TW")).toBe("zh-tw")
    expect(normalizeLang("zh_CN")).toBe("zh-cn")
  })

  it("treats empty / undetermined as no tag", () => {
    expect(normalizeLang("")).toBe("")
    expect(normalizeLang("  ")).toBe("")
    expect(normalizeLang("und")).toBe("")
    expect(normalizeLang(null)).toBe("")
    expect(normalizeLang(undefined)).toBe("")
  })
})

describe("detectCjkLang", () => {
  it("detects Japanese from kana even amid shared Han characters", () => {
    expect(detectCjkLang("彼は言った。大丈夫です。")).toBe("ja")
    expect(detectCjkLang("東京タワー")).toBe("ja")
  })

  it("detects Korean from Hangul", () => {
    expect(detectCjkLang("안녕하세요 세계")).toBe("ko")
  })

  it("treats Han-only text as Chinese", () => {
    expect(detectCjkLang("我是中国人")).toBe("zh")
    expect(detectCjkLang("直令骨")).toBe("zh")
  })

  it("returns empty for Latin-script text", () => {
    expect(detectCjkLang("Hello world, this is English.")).toBe("")
    expect(detectCjkLang("Bonjour le monde")).toBe("")
  })
})

describe("resolveTextLang", () => {
  it("prefers a declared code", () => {
    expect(resolveTextLang("JP", "我是中国人")).toBe("ja")
    expect(resolveTextLang("en", "")).toBe("en")
  })

  it("falls back to script detection when nothing is declared", () => {
    expect(resolveTextLang("", "彼は言った")).toBe("ja")
    expect(resolveTextLang("und", "我是中国人")).toBe("zh")
  })

  it("returns undefined when nothing is known", () => {
    expect(resolveTextLang("", "plain english")).toBeUndefined()
    expect(resolveTextLang(null, "")).toBeUndefined()
  })
})

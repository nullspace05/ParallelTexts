import { setStoredModelId } from "@/lib/user-settings"
import { DEFAULT_MODEL_ID } from "@/utils/model-registry"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useStoredModelId } from "./use-stored-model-id"

const MINILM = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
const GEMMA = "onnx-community/embeddinggemma-300m-ONNX"

afterEach(() => {
  localStorage.clear()
})

describe("useStoredModelId", () => {
  it("starts from the stored value, or the default when unset", () => {
    const { result } = renderHook(() => useStoredModelId())
    expect(result.current).toBe(DEFAULT_MODEL_ID)
  })

  it("re-renders when setStoredModelId is called in the same tab", () => {
    const { result } = renderHook(() => useStoredModelId())
    act(() => setStoredModelId(GEMMA))
    expect(result.current).toBe(GEMMA)
  })

  it("re-renders on a cross-tab storage event", () => {
    const { result } = renderHook(() => useStoredModelId())
    act(() => {
      localStorage.setItem("pt:modelId", MINILM)
      window.dispatchEvent(new StorageEvent("storage", { key: "pt:modelId" }))
    })
    expect(result.current).toBe(MINILM)
  })

  it("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useStoredModelId())
    unmount()
    act(() => setStoredModelId(GEMMA))
    // no assertion on result beyond "did not throw"; the snapshot is frozen
    expect(result.current).toBe(DEFAULT_MODEL_ID)
  })
})

import { afterEach, describe, expect, it } from "vitest"

import {
  clearModelRuntimeOverrides,
  getModelRuntimeOverride,
  setModelRuntimeOverride,
} from "./model-runtime"

afterEach(clearModelRuntimeOverrides)

describe("model runtime overrides", () => {
  it("keeps only the failed model on WASM for the current tab", () => {
    setModelRuntimeOverride("model-a", "wasm")

    expect(getModelRuntimeOverride("model-a")).toBe("wasm")
    expect(getModelRuntimeOverride("model-b")).toBeUndefined()
  })
})

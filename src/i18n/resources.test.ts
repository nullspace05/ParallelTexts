import en from "@/i18n/en.json"
import ja from "@/i18n/ja.json"
import { describe, expect, it } from "vitest"

function leafKinds(
  value: unknown,
  path = ""
): Record<string, "string" | "object"> {
  if (typeof value === "string") return { [path]: "string" }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      `Translation at ${path || "root"} must be an object or string`
    )
  }

  return Object.entries(value).reduce<Record<string, "string" | "object">>(
    (result, [key, child]) => ({
      ...result,
      ...leafKinds(child, path ? `${path}.${key}` : key),
    }),
    {}
  )
}

describe("translation resources", () => {
  it("keeps Japanese keys and value kinds aligned with English", () => {
    expect(leafKinds(ja)).toEqual(leafKinds(en))
  })
})

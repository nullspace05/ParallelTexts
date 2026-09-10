import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createSavedSelection,
  deleteSavedSelection,
  getSavedSelectionsForOwner,
  validateSavedSelection,
} from "./saved-selections"

const savedSelections = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  where: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: { savedSelections },
}))

const sourceSelection = {
  id: "source-selection",
  ownerType: "alignment" as const,
  ownerId: "alignment-1",
  selectedText: "Source text",
  createdAt: 2,
  segments: [
    {
      paraIdx: 1,
      pairIdx: 0,
      side: "source" as const,
      startOffset: 0,
      endOffset: 11,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("validateSavedSelection", () => {
  it("accepts a multi-paragraph book selection", () => {
    expect(() =>
      validateSavedSelection({
        id: "book-selection",
        ownerType: "book",
        ownerId: "book-1",
        selectedText: "First part\nSecond part",
        createdAt: 1,
        segments: [
          { paraIdx: 2, startOffset: 5, endOffset: 20 },
          { paraIdx: 3, startOffset: 0, endOffset: 11 },
        ],
      })
    ).not.toThrow()
  })

  it.each(["source", "target"] as const)(
    "accepts an alignment selection on the %s side",
    (side) => {
      expect(() =>
        validateSavedSelection({
          id: `${side}-selection`,
          ownerType: "alignment",
          ownerId: "alignment-1",
          selectedText: "Selected text",
          createdAt: 1,
          segments: [
            {
              paraIdx: 1,
              pairIdx: 2,
              side,
              startOffset: 0,
              endOffset: 13,
            },
          ],
        })
      ).not.toThrow()
    }
  )

  it("rejects alignment segments from different sides", () => {
    expect(() =>
      validateSavedSelection({
        id: "mixed-sides",
        ownerType: "alignment",
        ownerId: "alignment-1",
        selectedText: "Mixed text",
        createdAt: 1,
        segments: [
          {
            paraIdx: 1,
            pairIdx: 0,
            side: "source",
            startOffset: 0,
            endOffset: 5,
          },
          {
            paraIdx: 1,
            pairIdx: 1,
            side: "target",
            startOffset: 0,
            endOffset: 5,
          },
        ],
      })
    ).toThrow("invalid segments")
  })

  it("writes a validated book selection", async () => {
    const selection = {
      id: "book-selection",
      ownerType: "book" as const,
      ownerId: "book-1",
      selectedText: "Selected text",
      createdAt: 1,
      segments: [{ paraIdx: 0, startOffset: 0, endOffset: 13 }],
    }

    await createSavedSelection(selection)

    expect(savedSelections.add).toHaveBeenCalledWith(selection)
  })

  it("filters an alignment owner query by side and orders newest first", async () => {
    const targetSelection = {
      ...sourceSelection,
      id: "target-selection",
      createdAt: 4,
      segments: [{ ...sourceSelection.segments[0], side: "target" as const }],
    }
    const otherOwner = { ...sourceSelection, id: "other", ownerId: "other" }
    const toArray = vi
      .fn()
      .mockResolvedValue([sourceSelection, targetSelection, otherOwner])
    const equals = vi.fn().mockReturnValue({ toArray })
    savedSelections.where.mockReturnValue({ equals })

    const results = await getSavedSelectionsForOwner(
      "alignment",
      "alignment-1",
      "target"
    )

    expect(savedSelections.where).toHaveBeenCalledWith("[ownerType+ownerId]")
    expect(equals).toHaveBeenCalledWith(["alignment", "alignment-1"])
    expect(results).toEqual([targetSelection])
  })

  it("deletes only the requested selection ID", async () => {
    await deleteSavedSelection("selection-to-delete")

    expect(savedSelections.delete).toHaveBeenCalledWith("selection-to-delete")
  })
})

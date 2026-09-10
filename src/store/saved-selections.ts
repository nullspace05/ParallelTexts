import { db } from "@/lib/db"
import type {
  AlignmentSavedSelection,
  AlignmentSelectionSegment,
  BookSavedSelection,
  BookSelectionSegment,
  SavedSelection,
} from "@/types/saved-selection"

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validRange({ startOffset, endOffset }: BookSelectionSegment): boolean {
  return (
    isNonNegativeInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    endOffset > startOffset
  )
}

function orderedBookSegments(segments: BookSelectionSegment[]): boolean {
  return segments.every((segment, index) => {
    if (!isNonNegativeInteger(segment.paraIdx) || !validRange(segment))
      return false
    const previous = segments[index - 1]
    if (!previous) return true
    return (
      segment.paraIdx > previous.paraIdx ||
      (segment.paraIdx === previous.paraIdx &&
        segment.startOffset >= previous.endOffset)
    )
  })
}

function orderedAlignmentSegments(
  segments: AlignmentSelectionSegment[]
): boolean {
  const side = segments[0]?.side
  return segments.every((segment, index) => {
    if (
      !isNonNegativeInteger(segment.paraIdx) ||
      !isNonNegativeInteger(segment.pairIdx) ||
      !validRange(segment) ||
      segment.side !== side
    )
      return false
    const previous = segments[index - 1]
    if (!previous) return true
    return (
      segment.paraIdx > previous.paraIdx ||
      (segment.paraIdx === previous.paraIdx &&
        segment.pairIdx > previous.pairIdx)
    )
  })
}

/** Checks that a selection can reopen as one ordered stretch of text. */
export function validateSavedSelection(selection: SavedSelection): void {
  if (
    !selection.id ||
    !selection.ownerId ||
    !selection.selectedText.trim() ||
    !isNonNegativeInteger(selection.createdAt) ||
    selection.segments.length === 0
  )
    throw new Error("Saved selection has invalid required fields.")

  const valid =
    selection.ownerType === "book"
      ? orderedBookSegments(selection.segments)
      : orderedAlignmentSegments(selection.segments)
  if (!valid) throw new Error("Saved selection has invalid segments.")
}

/** Validates and writes one saved selection to IndexedDB. */
export async function createSavedSelection(
  selection: SavedSelection
): Promise<void> {
  validateSavedSelection(selection)
  await db.savedSelections.add(selection)
}

/**
 * Reads one owner's selections, newest first.
 *
 * @example
 * await getSavedSelectionsForOwner("alignment", "alignment-42", "source")
 */
export async function getSavedSelectionsForOwner(
  ownerType: "book",
  ownerId: string
): Promise<BookSavedSelection[]>
export async function getSavedSelectionsForOwner(
  ownerType: "alignment",
  ownerId: string,
  side?: "source" | "target"
): Promise<AlignmentSavedSelection[]>
export async function getSavedSelectionsForOwner(
  ownerType: SavedSelection["ownerType"],
  ownerId: string,
  side?: "source" | "target"
): Promise<SavedSelection[]> {
  const selections = await db.savedSelections
    .where("[ownerType+ownerId]")
    .equals([ownerType, ownerId])
    .toArray()

  const scoped =
    ownerType === "alignment" && side
      ? selections.filter(
          (selection): selection is AlignmentSavedSelection =>
            selection.ownerType === "alignment" &&
            selection.segments[0]?.side === side
        )
      : selections

  return scoped.sort((a, b) => b.createdAt - a.createdAt)
}

/** Removes exactly one saved selection by its ID. */
export async function deleteSavedSelection(id: string): Promise<void> {
  await db.savedSelections.delete(id)
}

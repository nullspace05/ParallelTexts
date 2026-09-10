export interface BookSelectionSegment {
  paraIdx: number
  startOffset: number
  endOffset: number
}

export interface AlignmentSelectionSegment {
  paraIdx: number
  pairIdx: number
  side: "source" | "target"
  startOffset: number
  endOffset: number
}

interface SavedSelectionBase {
  id: string
  ownerId: string
  selectedText: string
  createdAt: number
}

export interface BookSavedSelection extends SavedSelectionBase {
  ownerType: "book"
  segments: BookSelectionSegment[]
}

export interface AlignmentSavedSelection extends SavedSelectionBase {
  ownerType: "alignment"
  segments: AlignmentSelectionSegment[]
}

export type SavedSelection = BookSavedSelection | AlignmentSavedSelection

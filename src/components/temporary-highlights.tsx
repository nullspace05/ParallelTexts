import { BookmarkSimpleIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"

export interface TemporaryHighlightSegment {
  key: string
  startOffset: number
  endOffset: number
}

export interface TemporaryHighlight {
  segments: TemporaryHighlightSegment[]
}

interface PendingTemporaryHighlight extends TemporaryHighlight {
  text: string
  top: number
  left: number
}

function selectionRegion(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  return element?.closest<HTMLElement>("[data-temporary-highlight-key]") ?? null
}

function selectionStream(region: HTMLElement): string | undefined {
  return region.dataset.temporaryHighlightStream
}

function offsetWithin(
  region: HTMLElement,
  node: Node,
  offset: number
): number | null {
  try {
    const before = document.createRange()
    before.selectNodeContents(region)
    before.setEnd(node, offset)
    return before.toString().length
  } catch {
    return null
  }
}

function pendingHighlight(): PendingTemporaryHighlight | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null

  const range = selection.getRangeAt(0)
  const startRegion = selectionRegion(range.startContainer)
  const endRegion = selectionRegion(range.endContainer)
  if (!startRegion || !endRegion) return null

  const stream = selectionStream(startRegion)
  if (!stream || stream !== selectionStream(endRegion)) return null

  const text = range.toString()
  if (!text.trim()) return null

  const segments: TemporaryHighlightSegment[] = []
  const regions = document.querySelectorAll<HTMLElement>(
    `[data-temporary-highlight-stream="${CSS.escape(stream)}"]`
  )

  for (const region of regions) {
    if (!range.intersectsNode(region)) continue

    const regionRange = document.createRange()
    regionRange.selectNodeContents(region)
    const key = region.dataset.temporaryHighlightKey
    if (!key) continue

    const selectionStartsBeforeRegion =
      range.compareBoundaryPoints(Range.START_TO_START, regionRange) <= 0
    const selectionEndsAfterRegion =
      range.compareBoundaryPoints(Range.END_TO_END, regionRange) >= 0
    const startOffset = selectionStartsBeforeRegion
      ? 0
      : offsetWithin(region, range.startContainer, range.startOffset)
    const endOffset = selectionEndsAfterRegion
      ? (region.textContent?.length ?? 0)
      : offsetWithin(region, range.endContainer, range.endOffset)
    if (
      startOffset == null ||
      endOffset == null ||
      startOffset < 0 ||
      endOffset <= startOffset
    )
      continue

    segments.push({ key, startOffset, endOffset })
  }

  if (segments.length === 0) return null

  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return {
    segments,
    text,
    top: Math.min(rect.bottom + 8, window.innerHeight - 44),
    left: Math.min(Math.max(rect.left, 8), window.innerWidth - 148),
  }
}

export function highlightSegmentsForKey(
  highlights: TemporaryHighlight[],
  key: string
): TemporaryHighlightSegment[] {
  return highlights.flatMap((highlight) =>
    highlight.segments.filter((segment) => segment.key === key)
  )
}

export function TemporaryHighlightText({
  text,
  highlights,
}: {
  text: string
  highlights: TemporaryHighlightSegment[]
}) {
  if (highlights.length === 0) return text

  const boundaries = new Set([0, text.length])
  for (const highlight of highlights) {
    boundaries.add(Math.max(0, Math.min(highlight.startOffset, text.length)))
    boundaries.add(Math.max(0, Math.min(highlight.endOffset, text.length)))
  }
  const points = [...boundaries].sort((a, b) => a - b)

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    const segment = text.slice(start, end)
    const isHighlighted = highlights.some(
      (highlight) =>
        highlight.startOffset <= start && highlight.endOffset >= end
    )
    return isHighlighted ? (
      <mark
        key={`${start}-${end}`}
        className="rounded-sm bg-amber-200/80 px-px text-inherit dark:bg-amber-400/30"
      >
        {segment}
      </mark>
    ) : (
      segment
    )
  })
}

export function TemporaryHighlightController({
  children,
  onSave,
}: {
  children: ReactNode
  onSave: (highlight: TemporaryHighlight) => void
}) {
  const [pending, setPending] = useState<PendingTemporaryHighlight | null>(null)

  const inspectSelection = useCallback(() => {
    window.setTimeout(() => setPending(pendingHighlight()), 0)
  }, [])

  useEffect(() => {
    const handleMouseUp = () => inspectSelection()
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey) inspectSelection()
    }
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("keyup", handleKeyUp)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("keyup", handleKeyUp)
    }
  }, [inspectSelection])

  function savePending() {
    if (!pending) return
    onSave(pending)
    window.getSelection()?.removeAllRanges()
    setPending(null)
  }

  return (
    <div className="contents">
      {children}
      {pending && (
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={savePending}
          className="fixed z-40 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/80"
          style={{ top: pending.top, left: pending.left }}
        >
          <BookmarkSimpleIcon className="size-3.5" />
          Save highlight
        </button>
      )}
    </div>
  )
}

import { SAMPLE_CARD_DOT_COLORS } from "@/lib/equivalence-palette"
import { parsePtEpub } from "@/lib/pt-epub"
import { cn } from "@/lib/utils"
import { addAlignment } from "@/store/alignments"
import { BookOpen, CircleNotch } from "@phosphor-icons/react"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

const GALACTIC_RAILROAD_URL =
  "/pd-books/" +
  encodeURIComponent("銀河鉄道の夜-aozora_night-galactic_ja-en_align.epub")

function SampleDot({
  colorClass,
  loading,
}: {
  colorClass: string
  loading?: boolean
}) {
  if (loading) {
    return (
      <CircleNotch
        className="size-[1em] shrink-0 animate-spin text-primary"
        aria-hidden
      />
    )
  }

  return (
    <span
      className={cn("size-[1em] shrink-0 rounded-full", colorClass)}
      aria-hidden
    />
  )
}

function LangBadges() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        JP
      </span>
      <span className="text-[10px] text-muted-foreground/50">↔</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        EN
      </span>
    </span>
  )
}

export function SamplesSection() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openSample() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(GALACTIC_RAILROAD_URL)
      if (!resp.ok) throw new Error("Failed to download the sample file.")

      const rec = await parsePtEpub(await resp.blob())
      if (!rec) throw new Error("The sample file could not be read.")

      const id = await addAlignment(
        rec.sourceBookId,
        rec.targetBookId,
        "銀河鉄道の夜",
        "Night on the Galactic Railroad",
        rec.result,
        rec.meta,
        "epub"
      )

      navigate({
        to: "/alignment/$id",
        params: { id },
        search: {
          view: undefined,
          pageNumHidden: undefined,
          charCount: 0,
          totalChars: 0,
        },
      })
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Samples
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={openSample}
          disabled={loading}
          aria-label="View example"
          className="group cursor-pointer rounded-lg border bg-muted/20 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60"
        >
          <div className="flex w-full items-start justify-between gap-2">
            <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              <BookOpen className="size-3" />
              Example
            </span>
            <LangBadges />
          </div>
          <div className="mt-2.5 w-full min-w-0">
            <p className="truncate text-sm leading-snug font-medium">
              銀河鉄道の夜
            </p>
            <p className="mt-0.5 flex w-full min-w-0 items-center justify-between gap-2 text-sm leading-snug text-muted-foreground">
              <span className="min-w-0 truncate">
                Night on the Galactic Railroad
              </span>
              <SampleDot
                colorClass={SAMPLE_CARD_DOT_COLORS[0]}
                loading={loading}
              />
            </p>
          </div>
        </button>

        {["More examples coming soon", "More examples coming soon"].map(
          (label, i) => (
            <div
              key={i}
              className="rounded-lg border border-dashed border-muted-foreground/20 bg-transparent p-4 text-left"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Coming soon
              </span>
              <p className="mt-2.5 flex w-full min-w-0 items-center justify-between gap-2 text-sm leading-snug text-muted-foreground/80">
                <span className="min-w-0 truncate">{label}</span>
                <SampleDot colorClass={SAMPLE_CARD_DOT_COLORS[i + 1]} />
              </p>
            </div>
          )
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

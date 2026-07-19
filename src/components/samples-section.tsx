import { parsePtEpub } from "@/lib/pt-epub"
import { addAlignment } from "@/store/alignments"
import { ArrowRight, BookOpen } from "@phosphor-icons/react"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

const GALACTIC_RAILROAD_URL =
  "/pd-books/" +
  encodeURIComponent("銀河鉄道の夜-aozora_night-galactic_ja-en_align.epub")

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
    <div className="space-y-3 pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">Samples</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={openSample}
          disabled={loading}
          className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
            <BookOpen className="size-3" />
            Example
          </span>
          <p className="mt-1 font-medium">銀河鉄道の夜</p>
          <p className="text-sm text-muted-foreground">
            Night on the Galactic Railroad
          </p>
          <p className="text-xs text-muted-foreground/70">Japanese ↔ English</p>
          <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
            {loading ? "Opening…" : "View example"}
            <ArrowRight className="size-3" />
          </span>
        </button>

        {["More examples coming soon", "More examples coming soon"].map(
          (label, i) => (
            <div
              key={i}
              className="flex flex-col items-start gap-1.5 rounded-lg border border-dashed bg-muted/10 p-4 text-left opacity-60"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Coming soon
              </span>
              <p className="mt-1 font-medium text-muted-foreground">{label}</p>
            </div>
          )
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

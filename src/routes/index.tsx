import { AlignBooksForm } from "@/components/align-books-form"
import { ClickableSampleImage } from "@/components/clickable-sample-image"
import { DropZone } from "@/components/drop-zone"
import { SamplesSection } from "@/components/samples-section"
import { Devices, X } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/")({ component: App })

const INTRO_KEY = "intro-dismissed"

function AppBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/favicon-96x96.png"
        alt=""
        width={24}
        height={24}
        className="size-6 shrink-0 rounded-sm"
      />
      <span className="text-base font-semibold tracking-tight text-foreground">
        ParallelTexts
      </span>
    </div>
  )
}

function IntroBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(INTRO_KEY, "1")
          onDismiss()
        }}
        className="absolute top-4 right-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>

      <div className="border-b px-6 py-4 pr-12">
        <AppBrand />
      </div>

      {/* Hero */}
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:pr-12">
        <ClickableSampleImage
          src="/samples/tlp-01.png"
          alt="ParallelTexts side-by-side view of The Little Prince in Japanese and English"
          className="w-full sm:max-w-[55%] sm:shrink-0"
          imgClassName="h-44 w-full rounded-lg object-contain sm:h-72 sm:w-auto"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h1 className="text-xl leading-snug font-medium tracking-tight text-foreground sm:text-2xl">
            Align two books sentence-by-sentence.
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            To begin, upload two files below — a book and its translation, or
            try one of the examples below.
          </p>
          <Link
            to="/about"
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Read more →
          </Link>
        </div>
      </div>

      {/* Samples — part of the dismissible intro */}
      <div className="border-t px-6 pt-5 pb-6">
        <SamplesSection />
      </div>
    </div>
  )
}

function App() {
  const [introDismissed, setIntroDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(INTRO_KEY) === "1"
  })

  return (
    <div className="min-h-[calc(100svh-56px)] bg-muted/20 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Mobile notice — hidden on sm+ */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-800 md:hidden dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
          <Devices className="mt-0.5 size-4 shrink-0" />
          <span>
            Best on desktop — alignment is compute-intensive and works best with
            a full keyboard and more RAM.
          </span>
        </div>

        {!introDismissed && (
          <IntroBanner onDismiss={() => setIntroDismissed(true)} />
        )}

        {/* Workflow: upload → align (tighter gap = one unit) */}
        <div className="space-y-3">
          {introDismissed && <AppBrand />}
          <DropZone />
          <AlignBooksForm />
        </div>
      </div>
    </div>
  )
}

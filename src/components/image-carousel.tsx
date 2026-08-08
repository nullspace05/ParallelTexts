import type { SampleImage } from "@/lib/sample-images"
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

function NavButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next"
  onClick: () => void
}) {
  const Icon = direction === "prev" ? CaretLeft : CaretRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous image" : "Next image"}
      className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
    >
      <Icon className="size-5" />
    </button>
  )
}

export function ImageCarousel({
  images,
  initialIndex,
  onClose,
}: {
  images: SampleImage[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const hasMultiple = images.length > 1

  function goPrev() {
    setIndex((i) => (i - 1 + images.length) % images.length)
  }

  function goNext() {
    setIndex((i) => (i + 1) % images.length)
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const current = images[index]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {/* Side arrows — desktop only, to avoid overlapping the image on
          narrow screens */}
      {hasMultiple && (
        <>
          <div className="absolute top-1/2 left-4 hidden -translate-y-1/2 sm:block">
            <NavButton direction="prev" onClick={goPrev} />
          </div>
          <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 sm:block">
            <NavButton direction="next" onClick={goNext} />
          </div>
        </>
      )}

      <img
        src={current.src}
        alt={current.alt}
        className="max-h-[70vh] max-w-[92vw] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] sm:max-w-[85vw]"
      />

      {/* Prev / counter / next — mobile only, stacked below the image */}
      {hasMultiple && (
        <div className="flex items-center gap-6 sm:hidden">
          <NavButton direction="prev" onClick={goPrev} />
          <p className="text-sm text-white/70 tabular-nums">
            {index + 1} / {images.length}
          </p>
          <NavButton direction="next" onClick={goNext} />
        </div>
      )}

      {hasMultiple && (
        <p className="hidden text-sm text-white/70 tabular-nums sm:block">
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  )
}

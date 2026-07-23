import type { SampleImage } from "@/lib/sample-images"
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
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

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous image"
            className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-4"
          >
            <CaretLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next image"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-4"
          >
            <CaretRight className="size-5" />
          </button>
        </>
      )}

      <img
        src={current.src}
        alt={current.alt}
        className="max-h-[80vh] max-w-[92vw] rounded-lg object-contain shadow-2xl sm:max-w-[85vw]"
      />

      {images.length > 1 && (
        <p className="mt-4 text-sm text-white/70 tabular-nums">
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  )
}

import { ImageCarousel } from "@/components/image-carousel"
import { SAMPLE_IMAGES, sampleImageIndex } from "@/lib/sample-images"
import { cn } from "@/lib/utils"
import { useState } from "react"

export function ClickableSampleImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg"
        aria-label="View more samples"
      >
        <img src={src} alt={alt} className={cn(imgClassName)} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-sm font-medium text-white">
            Click to view more samples →
          </span>
        </span>
      </button>

      {open && (
        <ImageCarousel
          images={SAMPLE_IMAGES}
          initialIndex={sampleImageIndex(src)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

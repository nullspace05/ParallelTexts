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
        className="group block w-full cursor-zoom-in"
        aria-label="View more samples"
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            "transition-opacity group-hover:opacity-90",
            imgClassName
          )}
        />
      </button>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">
        Click to view more samples →
      </p>

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

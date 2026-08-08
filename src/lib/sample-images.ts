export interface SampleImage {
  src: string
  alt: string
}

// Order: The Little Prince, then Alice in Wonderland, then Harry Potter.
export const SAMPLE_IMAGES: SampleImage[] = [
  {
    src: "/samples/tlp-01.png",
    alt: "ParallelTexts side-by-side view of The Little Prince in Japanese and English",
  },
  {
    src: "/samples/tlp-02.png",
    alt: "ParallelTexts side-by-side view of The Little Prince in Japanese and English",
  },
  {
    src: "/samples/tlp-03.png",
    alt: "ParallelTexts side-by-side view of The Little Prince in Japanese and English",
  },
  {
    src: "/samples/aiw-01.png",
    alt: "ParallelTexts side-by-side view of Alice in Wonderland in Japanese and English",
  },
  {
    src: "/samples/aiw-02.png",
    alt: "ParallelTexts side-by-side view of Alice in Wonderland in Japanese and English",
  },
  {
    src: "/samples/hp-01.jpeg",
    alt: "ParallelTexts side-by-side view of Harry Potter in Japanese and English",
  },
  {
    src: "/samples/hp-02.jpeg",
    alt: "ParallelTexts side-by-side view of Harry Potter in Japanese and English",
  },
  {
    src: "/samples/hp-03.jpeg",
    alt: "ParallelTexts side-by-side view of Harry Potter in Japanese and English",
  },
]

export function sampleImageIndex(src: string): number {
  const i = SAMPLE_IMAGES.findIndex((img) => img.src === src)
  return i === -1 ? 0 : i
}

const SAMPLE_BOOKS_R2_PREFIX = "/models/sample_books/"

export interface SampleAlignment {
  id: string
  filename: string
  sourceTitle: string
  targetTitle: string
  sourceLang: string
  targetLang: string
}

export const SAMPLE_ALIGNMENTS: SampleAlignment[] = [
  {
    id: "galactic-railroad",
    filename: "銀河鉄道の夜-aozora_night-galactic_ja-en_align.epub",
    sourceTitle: "銀河鉄道の夜",
    targetTitle: "Night on the Galactic Railroad",
    sourceLang: "JP",
    targetLang: "EN",
  },
  {
    id: "alice",
    filename: "アリスはふしぎの国で_Alice_Advent_ja-en_align.epub",
    sourceTitle: "アリスはふしぎの国で",
    targetTitle: "Alice's Adventures in Wonderland",
    sourceLang: "JP",
    targetLang: "EN",
  },
  {
    id: "alice-fr",
    filename: "Aventures_Alice_Advent_fr-en_align.epub",
    sourceTitle: "Aventures d'Alice au pays des merveilles",
    targetTitle: "Alice's Adventures in Wonderland",
    sourceLang: "FR",
    targetLang: "EN",
  },
]

export function sampleAlignmentUrl(filename: string): string {
  return SAMPLE_BOOKS_R2_PREFIX + encodeURIComponent(filename)
}

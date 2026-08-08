export interface SampleCreditLink {
  label: string
  href: string
}

export interface SampleCredit {
  title: string
  subtitle: string
  original: string
  sources: { language: string; credit: string; links?: SampleCreditLink[] }[]
}

export const SAMPLE_CREDITS: SampleCredit[] = [
  {
    title: "アリスはふしぎの国で",
    subtitle: "Alice's Adventures in Wonderland",
    original: "Lewis Carroll (1865). Public domain.",
    sources: [
      {
        language: "English",
        credit: "Project Gutenberg",
        links: [
          {
            label: "Gutenberg #11",
            href: "https://www.gutenberg.org/ebooks/11",
          },
        ],
      },
      {
        language: "Japanese",
        credit:
          "Translation by 大久保ゆう (Yuu Okubo), Aozora Bunko (CC BY 4.0)",
        links: [
          {
            label: "Aozora Bunko",
            href: "https://www.aozora.gr.jp/cards/001393/card57320.html",
          },
          {
            label: "CC BY 4.0",
            href: "https://creativecommons.org/licenses/by/4.0/",
          },
        ],
      },
    ],
  },
  {
    title: "銀河鉄道の夜",
    subtitle: "Night on the Galactic Railroad",
    original: "宮沢賢治 Kenji Miyazawa (1924). Public domain.",
    sources: [
      {
        language: "Japanese",
        credit: "Aozora Bunko",
        links: [
          {
            label: "Aozora Bunko",
            href: "https://www.aozora.gr.jp/cards/000081/files/48222_59645.html",
          },
        ],
      },
      {
        language: "English",
        credit: "Translation by Composer 2.5",
      },
    ],
  },
  {
    title: "Aventures d'Alice au pays des merveilles",
    subtitle: "Alice's Adventures in Wonderland",
    original: "Lewis Carroll (1865). Public domain.",
    sources: [
      {
        language: "French",
        credit: "Translation by Henri Bué, Project Gutenberg",
        links: [
          {
            label: "Gutenberg #55456",
            href: "https://www.gutenberg.org/ebooks/55456",
          },
        ],
      },
      {
        language: "English",
        credit: "Project Gutenberg",
        links: [
          {
            label: "Gutenberg #11",
            href: "https://www.gutenberg.org/ebooks/11",
          },
        ],
      },
    ],
  },
]

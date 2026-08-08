// Hue order is fixed so adjacent pair numbers never land on two similar hues.
// The same hue always lands on both sides of a pair since both spans share
// the same global pair number.
export const EQUIVALENCE_PALETTE = [
  {
    base: "bg-pink-100 dark:bg-pink-900/40",
    hover: "bg-pink-300 dark:bg-pink-700/70",
  },
  {
    base: "bg-blue-100 dark:bg-blue-900/40",
    hover: "bg-blue-300 dark:bg-blue-700/70",
  },
  {
    base: "bg-orange-100 dark:bg-orange-900/40",
    hover: "bg-orange-300 dark:bg-orange-700/70",
  },
  {
    base: "bg-violet-100 dark:bg-violet-900/40",
    hover: "bg-violet-300 dark:bg-violet-700/70",
  },
  {
    base: "bg-amber-100 dark:bg-amber-900/40",
    hover: "bg-amber-300 dark:bg-amber-700/70",
  },
  {
    base: "bg-indigo-100 dark:bg-indigo-900/40",
    hover: "bg-indigo-300 dark:bg-indigo-700/70",
  },
  {
    base: "bg-red-100 dark:bg-red-900/40",
    hover: "bg-red-300 dark:bg-red-700/70",
  },
  {
    base: "bg-purple-100 dark:bg-purple-900/40",
    hover: "bg-purple-300 dark:bg-purple-700/70",
  },
  {
    base: "bg-rose-100 dark:bg-rose-900/40",
    hover: "bg-rose-300 dark:bg-rose-700/70",
  },
  {
    base: "bg-fuchsia-100 dark:bg-fuchsia-900/40",
    hover: "bg-fuchsia-300 dark:bg-fuchsia-700/70",
  },
] as const

/** Solid dots for sample cards — first three equivalence hues */
export const SAMPLE_CARD_DOT_COLORS = [
  "bg-pink-300 dark:bg-pink-600",
  "bg-blue-300 dark:bg-blue-600",
  "bg-orange-300 dark:bg-orange-600",
] as const

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import type { LanguageOption } from "@/lib/model-languages"
import { cn } from "@/lib/utils"
import { CaretUpDownIcon, PlusCircleIcon } from "@phosphor-icons/react"
import { useMemo } from "react"

export type { LanguageOption }

// ── Stand-in catalog ─────────────────────────────────────────────────────────
// Step 2 only: a hardcoded list so the combobox UX can be judged before the
// model-capability data layer (Step 4) exists. `getModelLanguages()` replaces
// this in Step 7.

const POPULAR_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh",
]

const STANDIN_NAMES: Record<string, string> = {
  und: "Any / undetermined",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  ar: "Arabic",
  bg: "Bulgarian",
  ca: "Catalan",
  cs: "Czech",
  da: "Danish",
  el: "Greek",
  et: "Estonian",
  fa: "Persian",
  fi: "Finnish",
  gl: "Galician",
  gu: "Gujarati",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  ka: "Georgian",
  lt: "Lithuanian",
  lv: "Latvian",
  mk: "Macedonian",
  mn: "Mongolian",
  mr: "Marathi",
  ms: "Malay",
  my: "Burmese",
  nb: "Norwegian Bokmål",
  nl: "Dutch",
  pl: "Polish",
  ro: "Romanian",
  sk: "Slovak",
  sl: "Slovenian",
  sq: "Albanian",
  sr: "Serbian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
}

export const STANDIN_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "und", label: STANDIN_NAMES.und },
  ...Object.entries(STANDIN_NAMES)
    .filter(([code]) => code !== "und")
    .map(([code, label]) => ({
      code,
      label,
      popular: POPULAR_CODES.includes(code),
    })),
]

// ── Component ────────────────────────────────────────────────────────────────

interface LanguageComboboxProps {
  value: string
  onChange: (code: string) => void
  options: LanguageOption[]
  label: string
  id?: string
}

interface Group {
  value: string
  label: string | null
  items: string[]
}

export function LanguageCombobox({
  value,
  onChange,
  options,
  label,
  id,
}: LanguageComboboxProps) {
  const nameOf = useMemo(() => {
    const map = new Map(options.map((o) => [o.code, o.label]))
    return (code: string) => map.get(code) ?? code
  }, [options])

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = []
    const loose = options.filter((o) => o.code === "und")
    if (loose.length) {
      out.push({ value: "_", label: null, items: loose.map((o) => o.code) })
    }
    const popular = options.filter((o) => o.popular && o.code !== "und")
    if (popular.length) {
      out.push({
        value: "Popular",
        label: "Popular",
        items: popular.map((o) => o.code),
      })
    }
    const rest = options
      .filter((o) => !o.popular && o.code !== "und")
      .sort((a, b) => a.label.localeCompare(b.label))
    out.push({
      value: "All languages",
      label: "All languages",
      items: rest.map((o) => o.code),
    })
    return out
  }, [options])

  const hasSelection = Boolean(value) && value !== "und"

  return (
    <Combobox<string>
      items={groups}
      value={value}
      onValueChange={(code) => {
        if (code) onChange(code)
      }}
      itemToStringLabel={(code) => nameOf(code)}
    >
      <ComboboxTrigger
        id={id}
        aria-label={label}
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "w-full justify-start border-dashed font-normal"
        )}
      >
        <PlusCircleIcon className="size-4 shrink-0 opacity-50" />
        {hasSelection ? (
          <Badge variant="secondary" className="font-normal">
            {nameOf(value)}
          </Badge>
        ) : (
          <span className="truncate text-muted-foreground">
            {nameOf(value || "und")}
          </span>
        )}
        <CaretUpDownIcon className="ml-auto size-4 shrink-0 opacity-50" />
      </ComboboxTrigger>

      <ComboboxContent
        align="start"
        className="w-(--anchor-width) min-w-[240px]"
      >
        <ComboboxInput placeholder="Search language…" />
        <ComboboxEmpty>No language found.</ComboboxEmpty>
        <ComboboxList>
          {(group: Group, index: number) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {index > 0 && <ComboboxSeparator />}
              {group.label && (
                <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
              )}
              <ComboboxCollection>
                {(code: string) => (
                  <ComboboxItem key={code} value={code}>
                    {nameOf(code)}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

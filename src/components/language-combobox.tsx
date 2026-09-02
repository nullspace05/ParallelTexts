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

// Presentational only: the caller passes the option list (built from
// `getModelLanguages()` + `withSelectedCode()` in `@/lib/model-languages`).

// ── Component ────────────────────────────────────────────────────────────────

interface LanguageComboboxProps {
  value: string
  onChange: (code: string) => void
  options: LanguageOption[]
  label: string
  id?: string
}

export interface LanguageGroup {
  value: string
  label: string | null
  items: string[]
}

/**
 * Split option codes into the combobox's display groups: a leading unlabelled
 * row for `und`, a "Popular" group, then "All languages" A–Z by label. Groups
 * with no members are omitted (except "All languages", which always renders so
 * the empty state has somewhere to sit).
 */
export function groupLanguageOptions(
  options: LanguageOption[]
): LanguageGroup[] {
  const out: LanguageGroup[] = []
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

  const groups = useMemo(() => groupLanguageOptions(options), [options])

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
          "w-full justify-start rounded-md border-dashed font-normal"
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
          {(group: LanguageGroup, index: number) => (
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

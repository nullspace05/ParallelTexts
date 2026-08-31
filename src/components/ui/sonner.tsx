import { useTheme } from "@/components/theme-provider"
import { resolveTheme } from "@/lib/theme"
import { Toaster as Sonner } from "sonner"

export function Toaster() {
  const { theme } = useTheme()

  return (
    <Sonner
      closeButton
      duration={Infinity}
      richColors
      theme={resolveTheme(theme)}
    />
  )
}

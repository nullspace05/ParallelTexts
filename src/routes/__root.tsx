import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { BrowserStorageNotice } from "@/components/browser-storage-notice"
import { Header } from "@/components/header"
import { LanguageProvider } from "@/components/language-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { OG_IMAGE_URL, SITE_URL } from "@/lib/site-links"
import { THEME_INIT_SCRIPT } from "@/lib/theme"
import { UI_LANGUAGE_INIT_SCRIPT } from "@/lib/user-settings"
import { PostHogProvider } from "@posthog/react"
import { useTranslation } from "react-i18next"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "description",
        content:
          "Create and read Bilingual/Parallel texts from your own books.",
      },
      {
        title: "ParallelTexts",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "ParallelTexts",
      },
      {
        property: "og:title",
        content: "ParallelTexts",
      },
      {
        property: "og:description",
        content:
          "Create and read your own bilingual books for language learning. Align two books sentence-by-sentence — entirely in your browser.",
      },
      {
        property: "og:image",
        content: OG_IMAGE_URL,
      },
      {
        property: "og:url",
        content: SITE_URL,
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "ParallelTexts",
      },
      {
        name: "twitter:description",
        content:
          "Create and read your own bilingual books for language learning. Align two books sentence-by-sentence — entirely in your browser.",
      },
      {
        name: "twitter:image",
        content: OG_IMAGE_URL,
      },
    ],
    links: [
      {
        rel: "canonical",
        href: SITE_URL,
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon-96x96.png",
        sizes: "96x96",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "shortcut icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  const { t } = useTranslation()

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{t("notFound.heading")}</h1>
      <p>{t("notFound.message")}</p>
    </main>
  )
}

const options = {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  defaults: "2025-11-30",
} as const

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_POSTHOG_PROJECT_TOKEN}
      options={options}
    >
      {" "}
      <html lang="en" suppressHydrationWarning>
        <head>
          <HeadContent />
          {/* Runs before hydration so the correct theme class is present
              for first paint — avoids a light/dark flash. */}
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          <script
            dangerouslySetInnerHTML={{ __html: UI_LANGUAGE_INIT_SCRIPT }}
          />
        </head>
        <body>
          <LanguageProvider>
            <ThemeProvider>
              <BrowserStorageNotice />
              <Header />
              <main className="flex-1">{children}</main>
              <Toaster />
              {/* <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          /> */}
            </ThemeProvider>
          </LanguageProvider>
          <Scripts />
        </body>
      </html>
    </PostHogProvider>
  )
}

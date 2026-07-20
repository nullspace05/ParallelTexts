import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import { Header } from "@/components/header"
import { ThemeProvider } from "@/components/theme-provider"
import { OG_IMAGE_URL, SITE_URL } from "@/lib/site-links"
import { THEME_INIT_SCRIPT } from "@/lib/theme"
import { PostHogProvider } from "@posthog/react"
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
          "Parallel Texts is a multilingual sentence alignment tool that runs entirely in the browser. The goal is to make it easy for non-technical people to create their own parallel corpora — no server-side processing, no command line, no Python notebooks.",
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
          "Create your own bilingual books for language learning. Align two books sentence-by-sentence — entirely in your browser.",
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
          "Create your own bilingual books for language learning. Align two books sentence-by-sentence — entirely in your browser.",
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
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

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
        </head>
        <body>
          <ThemeProvider>
            <Header />
            <main className="flex-1">{children}</main>
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
          <Scripts />
        </body>
      </html>
    </PostHogProvider>
  )
}
